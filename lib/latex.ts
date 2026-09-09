/**
 * LaTeX utilities — single choke point for math rendering.
 *
 * Supported input delimiters (inline only):
 *   $...$      (Markdown style)
 *   \(...\)    (classic TeX style)
 *
 * Storage: TipTap `latexInline` atom nodes (see components/editor/LatexInlineNode.ts).
 * Fallback: raw `$...$` / `\(...\)` text inside paragraphs is ALSO rendered in
 * PDF / share / preview pipelines so old documents keep working.
 */

import katex from 'katex';

export interface LatexSegment {
  type: 'text' | 'math';
  value: string;
}

/**
 * Split plain text into text/math segments.
 * - `$...$` requires non-empty content, no newlines, and an even pairing.
 * - `$$...$$` (display math) is treated as inline math (single-line reports).
 * - `\(`...`\)` is supported as well.
 * - Escaped `\$` stays literal.
 */
export function splitTextWithLatex(input: string): LatexSegment[] {
  if (!input || typeof input !== 'string') return [{ type: 'text', value: input || '' }];
  const out: LatexSegment[] = [];
  // Protect escaped dollars
  const ESC = '\u0000ESC_DOLLAR\u0000';
  let src = input.replace(/\\\$/g, ESC);
  const re = /(\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$|\\\((.+?)\\\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    if (m.index > last) {
      out.push({ type: 'text', value: src.slice(last, m.index).replaceAll(ESC, '$') });
    }
    const latex = (m[2] ?? m[3] ?? m[4] ?? '').trim();
    if (latex) out.push({ type: 'math', value: latex });
    else out.push({ type: 'text', value: m[0].replaceAll(ESC, '$') });
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push({ type: 'text', value: src.slice(last).replaceAll(ESC, '$') });
  if (out.length === 0) return [{ type: 'text', value: input }];
  return out;
}

/** Render a single LaTeX fragment to KaTeX HTML (never throws, never empty). */
export function renderLatexToHtml(latex: string): string {
  const src = (latex || '').trim();
  if (!src) return '';
  try {
    return katex.renderToString(src, {
      displayMode: false,
      throwOnError: false,
      strict: false,
      trust: false,
      output: 'html',
    });
  } catch {
    // Last-resort fallback: show source in monospace (no raw delimiters lost)
    const esc = escapeHtml(src);
    return `<span class="latex-error" title="LaTeX render failed">${esc}</span>`;
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Convert RAW text (already HTML-escaped by caller or not) to HTML with math rendered.
 * @param rawText plain text that may contain $...$ / \(...\)
 * @param alreadyEscaped set true if rawText is already HTML-escaped
 */
export function renderTextWithLatexToHtml(rawText: string, alreadyEscaped = false): string {
  const segs = splitTextWithLatex(rawText);
  return segs
    .map((s) => {
      if (s.type === 'text') return alreadyEscaped ? s.value : escapeHtml(s.value);
      const math = renderLatexToHtml(s.value);
      // dir=ltr + isolate keeps Arabic paragraphs intact (no bidi breakage),
      // inline-block + baseline keeps line-height stable.
      return `<span class="latex-inline" dir="ltr">${math}</span>`;
    })
    .join('');
}

/** Quick check used by tests and empty-state guards. */
export function containsLatex(text: string): boolean {
  if (!text) return false;
  return splitTextWithLatex(text).some((s) => s.type === 'math');
}

/**
 * One-time migration: walk TipTap JSON and split text nodes containing
 * $...$ / \(...\) into text + latexInline atom nodes.
 * Returns a NEW doc (does not mutate input). Idempotent.
 */
export function convertLatexDelimitersToNodes(doc: any): any {
  if (!doc || typeof doc !== 'object') return doc;
  try {
    const walk = (node: any): any => {
      if (!node || typeof node !== 'object') return node;
      if (node.type === 'text' && typeof node.text === 'string' && containsLatex(node.text)) {
        const segs = splitTextWithLatex(node.text);
        // If only one math segment and nothing else, keep marks on text? math nodes carry no marks.
        const parts: any[] = [];
        for (const s of segs) {
          if (s.type === 'text') {
            if (s.value) parts.push({ type: 'text', text: s.value, marks: node.marks });
          } else {
            parts.push({ type: 'latexInline', attrs: { latex: s.value } });
          }
        }
        // Return a fragment marker the parent will flatten
        return { __latexFragment: true, parts } as any;
      }
      if (Array.isArray(node.content)) {
        const next: any[] = [];
        for (const child of node.content) {
          const conv = walk(child);
          if (conv && (conv as any).__latexFragment) {
            next.push(...(conv as any).parts);
          } else {
            next.push(conv);
          }
        }
        return { ...node, content: next };
      }
      return node;
    };
    const out = walk(doc);
    return out && (out as any).__latexFragment ? { type: 'doc', content: (out as any).parts } : out;
  } catch {
    return doc;
  }
}

export const KATEX_CDN_CSS =
  'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css';

export const LATEX_INLINE_CSS = `
.latex-inline { display: inline-block; direction: ltr; unicode-bidi: isolate; vertical-align: baseline; line-height: 1.25; margin: 0 2px; white-space: nowrap; }
.latex-inline .katex { font-size: 1em; line-height: 1.2; }
.latex-inline .katex-display { margin: 0; }
.latex-error { font-family: monospace; color: #b91c1c; background: #fef2f2; border: 1px solid #fecaca; border-radius: 4px; padding: 0 4px; }
`;
