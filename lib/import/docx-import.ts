/**
 * DOCX → TipTap JSON import pipeline.
 *
 *   DOCX → (mammoth) HTML → sanitized DOM → Normalized nodes → TipTap JSON
 *
 * The existing editor/schema is reused as-is: paragraphs, headings (1-3),
 * bold/italic/underline, bullet/ordered lists, tables, links, textAlign and
 * RTL direction. Anything else (images, footnotes, textboxes, …) degrades to
 * a short placeholder paragraph so content is never silently lost and the
 * current report is never corrupted.
 */

export interface DocxImportSummary {
  paragraphs: number;
  headings: number;
  lists: number;
  tables: number;
  links: number;
}

export interface DocxImportResult {
  nodes: any[];
  summary: DocxImportSummary;
  warnings: string[];
}

const ARABIC_RE = /[\u0600-\u06FF]/;

function containsArabic(text: string): boolean {
  return ARABIC_RE.test(text || '');
}

function sanitizeHref(raw: string | null): string | null {
  if (!raw) return null;
  const href = raw.trim();
  if (/^(https?:\/\/|mailto:)/i.test(href)) return href;
  return null;
}

function textAlignFromElement(el: Element): string | null {
  const style = (el.getAttribute('style') || '').toLowerCase();
  const m = style.match(/text-align\s*:\s*(left|right|center|justify)/);
  if (m) return m[1];
  const align = (el.getAttribute('align') || '').toLowerCase();
  if (['left', 'right', 'center', 'justify'].includes(align)) return align;
  return null;
}

function dirFromElement(el: Element, text: string): string | null {
  const dir = (el.getAttribute('dir') || '').toLowerCase();
  if (dir === 'rtl' || dir === 'ltr') return dir;
  const style = (el.getAttribute('style') || '').toLowerCase();
  if (style.includes('direction') && style.includes('rtl')) return 'rtl';
  if (style.includes('direction') && style.includes('ltr')) return 'ltr';
  // Heuristic fallback so Arabic paragraphs keep RTL without touching the editor.
  if (containsArabic(text)) return 'rtl';
  return null;
}

function inlineContentFromElement(el: Element): any[] {
  const content: any[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === 3) {
      const text = node.textContent || '';
      if (text) {
        // Keep non-empty runs; whitespace-only runs between inline tags are dropped
        // to avoid polluting the document with stray spaces.
        if (text.trim() !== '' || (content.length > 0 && /[^\s]/.test(text) === false && false)) {
          if (text.trim() !== '') content.push({ type: 'text', text });
        }
      }
      return;
    }
    if (node.nodeType !== 1) return;
    const child = node as Element;
    const tag = child.tagName.toLowerCase();
    if (tag === 'br') {
      content.push({ type: 'text', text: '\n' });
      return;
    }
    if (tag === 'img') {
      content.push({
        type: 'text',
        text: ' [صورة مضمّنة غير مدعومة في الاستيراد] ',
      });
      return;
    }
    const start = content.length;
    child.childNodes.forEach(walk);
    const added = content.slice(start);
    const marks: any[] = [];
    if (tag === 'strong' || tag === 'b') marks.push({ type: 'bold' });
    if (tag === 'em' || tag === 'i') marks.push({ type: 'italic' });
    if (tag === 'u') marks.push({ type: 'underline' });
    if (tag === 's' || tag === 'strike' || tag === 'del') marks.push({ type: 'strike' });
    if (tag === 'code') marks.push({ type: 'code' });
    let linkHref: string | null = null;
    if (tag === 'a') linkHref = sanitizeHref(child.getAttribute('href'));
    if (marks.length > 0 || linkHref) {
      for (const n of added) {
        if (n.type !== 'text') continue;
        const existing = Array.isArray(n.marks) ? n.marks : [];
        const merged = [...existing];
        for (const mk of marks) {
          if (!merged.some((m: any) => m.type === mk.type)) merged.push(mk);
        }
        if (linkHref && !merged.some((m: any) => m.type === 'link')) {
          merged.push({ type: 'link', attrs: { href: linkHref } });
        }
        if (merged.length > 0) n.marks = merged;
      }
    }
  };
  el.childNodes.forEach(walk);
  // Merge adjacent text nodes sharing identical marks to keep JSON compact.
  const merged: any[] = [];
  for (const n of content) {
    const prev = merged[merged.length - 1];
    if (
      prev &&
      prev.type === 'text' &&
      n.type === 'text' &&
      JSON.stringify(prev.marks || []) === JSON.stringify(n.marks || [])
    ) {
      prev.text += n.text;
    } else {
      merged.push(n);
    }
  }
  return merged.filter((n) => !(n.type === 'text' && n.text === ''));
}

function paragraphNode(el: Element): any | null {
  const inline = inlineContentFromElement(el);
  if (inline.length === 0) return null;
  const attrs: Record<string, any> = {};
  const align = textAlignFromElement(el);
  if (align) attrs.textAlign = align;
  const text = inline.map((n) => n.text || '').join('');
  const dir = dirFromElement(el, text);
  if (dir) attrs.dir = dir;
  return { type: 'paragraph', ...(Object.keys(attrs).length ? { attrs } : {}), content: inline };
}

function headingNode(el: Element, level: number): any | null {
  const inline = inlineContentFromElement(el);
  if (inline.length === 0) return null;
  const attrs: Record<string, any> = { level: Math.min(3, Math.max(1, level)) };
  const align = textAlignFromElement(el);
  if (align) attrs.textAlign = align;
  const text = inline.map((n) => n.text || '').join('');
  const dir = dirFromElement(el, text);
  if (dir) attrs.dir = dir;
  return { type: 'heading', attrs, content: inline };
}

function listNode(el: Element, ordered: boolean): any | null {
  const items: any[] = [];
  el.querySelectorAll(':scope > li').forEach((li) => {
    const inline = inlineContentFromElement(li);
    items.push({
      type: 'listItem',
      content: [
        inline.length > 0
          ? { type: 'paragraph', content: inline }
          : { type: 'paragraph' },
      ],
    });
  });
  // Fallback: mammoth sometimes nests lists without direct li children.
  if (items.length === 0) {
    const text = (el.textContent || '').trim();
    if (!text) return null;
    items.push({ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
  }
  return { type: ordered ? 'orderedList' : 'bulletList', content: items };
}

function tableNode(el: Element, warnings: string[]): any | null {
  const rows = Array.from(el.querySelectorAll(':scope > thead > tr, :scope > tbody > tr, :scope > tr'));
  const effectiveRows = rows.length > 0 ? rows : [];
  if (effectiveRows.length === 0) return null;
  const content = effectiveRows.map((tr, rIdx) => {
    const cells = Array.from(tr.children).filter((c) => {
      const t = (c.tagName || '').toLowerCase();
      return t === 'td' || t === 'th';
    });
    const isHeaderRow = rIdx === 0 && cells.some((c) => c.tagName.toLowerCase() === 'th');
    return {
      type: 'tableRow',
      content: cells.map((cell) => {
        const isHeader = cell.tagName.toLowerCase() === 'th' || isHeaderRow;
        const inline = inlineContentFromElement(cell as Element);
        const colspan = parseInt(cell.getAttribute('colspan') || '1', 10);
        const rowspan = parseInt(cell.getAttribute('rowspan') || '1', 10);
        const attrs: Record<string, any> = {};
        if (Number.isFinite(colspan) && colspan > 1) attrs.colspan = Math.min(colspan, 10);
        if (Number.isFinite(rowspan) && rowspan > 1) attrs.rowspan = Math.min(rowspan, 10);
        if ((attrs.colspan || 0) > 1 || (attrs.rowspan || 0) > 1) {
          warnings.push('Merged cells were simplified on import (best effort).');
        }
        return {
          type: isHeader ? 'tableHeader' : 'tableCell',
          ...(Object.keys(attrs).length ? { attrs } : {}),
          content: [{ type: 'paragraph', ...(inline.length ? { content: inline } : {}) }],
        };
      }),
    };
  });
  if (content.some((r) => r.content.length === 0)) {
    warnings.push('An empty table row was skipped on import.');
  }
  const filtered = content.filter((r) => r.content.length > 0);
  if (filtered.length === 0) return null;
  return { type: 'table', content: filtered };
}

/**
 * Convert sanitized mammoth HTML into TipTap JSON block nodes.
 * Exported for unit testing without needing a real .docx binary.
 */
export function htmlToTipTapNodes(html: string): { nodes: any[]; warnings: string[] } {
  const warnings: string[] = [];
  const nodes: any[] = [];
  if (!html || !html.trim()) return { nodes, warnings };
  const doc =
    typeof DOMParser !== 'undefined'
      ? new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
      : null;
  if (!doc) {
    warnings.push('HTML parsing is not available in this environment.');
    return { nodes, warnings };
  }
  // Defense in depth: mammoth output should already be clean, but strip anything
  // executable/remotely-loaded before walking the DOM.
  doc.querySelectorAll('script, style, iframe, object, embed, form, button, input, meta, link').forEach((n) => n.remove());
  doc.querySelectorAll('*').forEach((el) => {
    Array.from(el.attributes).forEach((attr) => {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on') || name === 'srcdoc') el.removeAttribute(attr.name);
      if ((name === 'src' || name === 'href') && /^\s*javascript:/i.test(attr.value)) {
        el.removeAttribute(attr.name);
      }
    });
  });

  const root = doc.body.firstElementChild || doc.body;
  const pushBlock = (node: any | null) => {
    if (node) nodes.push(node);
  };

  Array.from(root.childNodes).forEach((child) => {
    if (child.nodeType === 3) {
      const text = (child.textContent || '').trim();
      if (!text) return;
      pushBlock({
        type: 'paragraph',
        ...(containsArabic(text) ? { attrs: { dir: 'rtl' } } : {}),
        content: [{ type: 'text', text }],
      });
      return;
    }
    if (child.nodeType !== 1) return;
    const el = child as Element;
    const tag = el.tagName.toLowerCase();
    if (tag === 'h1') pushBlock(headingNode(el, 1));
    else if (tag === 'h2') pushBlock(headingNode(el, 2));
    else if (tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6') {
      if (tag !== 'h3') warnings.push(`Heading ${tag} was imported as H3.`);
      pushBlock(headingNode(el, 3));
    } else if (tag === 'p') {
      const node = paragraphNode(el);
      if (node) pushBlock(node);
    } else if (tag === 'ul') pushBlock(listNode(el, false));
    else if (tag === 'ol') pushBlock(listNode(el, true));
    else if (tag === 'table') pushBlock(tableNode(el, warnings));
    else if (tag === 'blockquote') {
      const inline = inlineContentFromElement(el);
      if (inline.length > 0) {
        pushBlock({ type: 'blockquote', content: [{ type: 'paragraph', content: inline }] });
      }
    } else if (tag === 'hr') {
      pushBlock({ type: 'horizontalRule' });
    } else if (tag === 'img') {
      warnings.push('An inline image was skipped (images are not imported from DOCX).');
      pushBlock({
        type: 'paragraph',
        content: [{ type: 'text', text: '[صورة مضمّنة — لم يتم استيراد الصور من DOCX]' }],
      });
    } else if (tag === 'div' || tag === 'section' || tag === 'article') {
      // Flatten generic containers one level so mammoth wrappers don't drop text.
      Array.from(el.children).forEach((inner) => {
        const t = inner.tagName.toLowerCase();
        if (t === 'p') pushBlock(paragraphNode(inner));
        else if (t === 'ul') pushBlock(listNode(inner, false));
        else if (t === 'ol') pushBlock(listNode(inner, true));
        else if (t === 'table') pushBlock(tableNode(inner, warnings));
        else if (/^h[1-6]$/.test(t)) pushBlock(headingNode(inner, parseInt(t[1], 10)));
      });
      if (el.children.length === 0) {
        const text = (el.textContent || '').trim();
        if (text) pushBlock({ type: 'paragraph', content: [{ type: 'text', text }] });
      }
    } else {
      const text = (el.textContent || '').trim();
      if (text) {
        warnings.push(`Element <${tag}> is not directly supported; imported as plain text.`);
        pushBlock({ type: 'paragraph', content: [{ type: 'text', text }] });
      }
    }
  });

  return { nodes, warnings: Array.from(new Set(warnings)) };
}

/**
 * Full pipeline: .docx File → TipTap block nodes.
 * Dynamically imports mammoth so the editor bundle stays lean until import is used.
 */
export async function parseDocxFile(file: File): Promise<DocxImportResult> {
  const buffer = await file.arrayBuffer();
  if (!buffer || buffer.byteLength === 0) {
    throw new Error('EMPTY_FILE');
  }
  const mammoth = (await import('mammoth')).default;
  const converted = await (mammoth as any).convertToHtml({ arrayBuffer: buffer });
  const html: string = converted?.value || '';
  const messages: Array<{ message?: string }> = converted?.messages || [];
  const { nodes, warnings } = htmlToTipTapNodes(html);
  const conversionWarnings = messages
    .map((m) => m?.message)
    .filter(Boolean)
    .slice(0, 5) as string[];
  if (nodes.length === 0) {
    throw new Error('EMPTY_DOCUMENT');
  }
  const summary: DocxImportSummary = {
    paragraphs: nodes.filter((n) => n.type === 'paragraph').length,
    headings: nodes.filter((n) => n.type === 'heading').length,
    lists: nodes.filter((n) => n.type === 'bulletList' || n.type === 'orderedList').length,
    tables: nodes.filter((n) => n.type === 'table').length,
    links: JSON.stringify(nodes).split('"type":"link"').length - 1,
  };
  return {
    nodes,
    summary,
    warnings: Array.from(new Set([...warnings, ...conversionWarnings])).slice(0, 10),
  };
}
