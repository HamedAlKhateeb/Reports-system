import MarkdownIt from 'markdown-it';
import { cleanLatex, isPureLatex, splitTextWithLatex, escapeHtml } from './latex';

// Initialized markdown-it engine with tables, HTML, autolink
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: false,
});

// Custom renderer for code fences to intercept LaTeX math blocks
const defaultFence =
  md.renderer.rules.fence ||
  function (tokens, idx, options, _env, self) {
    return self.renderToken(tokens, idx, options);
  };

md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const lang = (token.info || '').trim().toLowerCase();
  const content = (token.content || '').trim();
  if (['latex', 'tex', 'math', 'katex'].includes(lang) || isPureLatex(content)) {
    const cleaned = cleanLatex(content);
    return `<p><span data-type="latex-inline" data-latex="${escapeHtml(cleaned)}">$${escapeHtml(cleaned)}$</span></p>\n`;
  }
  return defaultFence(tokens, idx, options, env, self);
};

/**
 * Checks whether the given string contains Markdown syntax that benefits
 * from rich text conversion (tables, headings, lists, formatting, etc.).
 */
export function isMarkdown(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (!trimmed) return false;

  // 1. Markdown Table (must have a separator row like |---|---| or ---|---)
  if (hasMarkdownTable(trimmed)) return true;

  // 2. Headings (# Heading)
  if (/(?:^|\n)#{1,6}\s+\S+/m.test(trimmed)) return true;

  // 3. Fenced Code Blocks (``` ... ```)
  if (/```[\s\S]*?```/.test(trimmed)) return true;

  // 4. Blockquotes (> quote)
  if (/(?:^|\n)>\s+\S+/m.test(trimmed)) return true;

  // 5. Lists: Unordered (- item, * item, + item), Ordered (1. item), or Task lists (- [ ] item)
  if (/(?:^|\n)\s*(?:[-*+]\s+\[[ xX]\]|[-*+]\s+\S+|\d+\.\s+\S+)/m.test(trimmed)) return true;

  // 6. Horizontal Rules (---, ***, ___)
  if (/(?:^|\n)\s*(?:---|\*\*\*|___)\s*(?:\n|$)/m.test(trimmed)) return true;

  // 7. Bold or Strikethrough (**bold**, __bold__, ~~strike~~)
  if (/\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~/.test(trimmed)) return true;

  // 8. Markdown Links [text](url)
  if (/\[[^\n\]]+\]\((?:https?:\/\/|\/|mailto:)[^\s)]+\)/.test(trimmed)) return true;

  // 9. Markdown Images ![alt](url)
  if (/!\[[^\n\]]*\]\((?:https?:\/\/|\/|data:)[^\s)]+\)/.test(trimmed)) return true;

  // 10. Inline code (`code`)
  if (/`[^`\n]+`/.test(trimmed)) return true;

  // 11. LaTeX Math ($...$, $$...$$, \(...\), \[...\], or pure LaTeX)
  if (/\$\$[\s\S]+?\$\$|\$[^$\n]+\$|\\\(.+?\\\)|\\[[\s\S]+?\\]/.test(trimmed) || isPureLatex(trimmed)) {
    return true;
  }

  return false;
}

/**
 * Checks if the text contains a Markdown table structure.
 * A markdown table must contain pipes '|' and a separator row matching |---|---| or ---|---.
 */
export function hasMarkdownTable(text: string): boolean {
  if (!text || typeof text !== 'string' || !text.includes('|')) return false;
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return false;

  return lines.some((line) => {
    const stripped = line.replace(/^\s*\|/, '').replace(/\|\s*$/, '');
    const parts = stripped.split('|').map((p) => p.trim());
    return parts.length >= 2 && parts.every((p) => /^:?-{2,}:?$/.test(p));
  });
}

/**
 * Parses a Markdown table string into a 2D array of cell values: string[][].
 * Used by MiniSpreadsheet / SmartTable when pasting into the spreadsheet grid.
 */
export function parseMarkdownTableToGrid(text: string): string[][] | null {
  if (!text || typeof text !== 'string') return null;
  const clean = text.replace(/\r\n?/g, '\n').trim();
  const lines = clean.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;

  // Find the separator row
  const sepIdx = lines.findIndex((line) => {
    const stripped = line.replace(/^\s*\|/, '').replace(/\|\s*$/, '');
    const parts = stripped.split('|').map((p) => p.trim());
    return parts.length >= 2 && parts.every((p) => /^:?-{2,}:?$/.test(p));
  });

  if (sepIdx === -1) return null;

  const grid: string[][] = [];
  lines.forEach((line, idx) => {
    if (idx === sepIdx) return; // skip separator row
    let trimmed = line.trim();
    if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
    if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
    const cells = trimmed.split('|').map((c) => {
      let val = c.trim();
      // Strip markdown bold/italic/strike wrappers anywhere inside cell: **val** -> val
      val = val
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/_([^_]+)_/g, '$1')
        .replace(/~~([^~]+)~~/g, '$1')
        .replace(/`([^`]+)`/g, '$1');
      return val.trim();
    });
    grid.push(cells);
  });

  return grid.length > 0 ? grid : null;
}

/**
 * Converts a Markdown string into clean, semantic HTML suitable for TipTap.
 */
export function markdownToHtml(markdown: string): string {
  if (!markdown || typeof markdown !== 'string') return '';
  const trimmed = markdown.trim();
  if (isPureLatex(trimmed)) {
    const cleaned = cleanLatex(trimmed);
    return `<p><span data-type="latex-inline" data-latex="${escapeHtml(cleaned)}">$${escapeHtml(cleaned)}$</span></p>`;
  }
  return md.render(markdown);
}

/**
 * Checks if HTML in clipboard is merely raw text wrapped in <pre> or plain tags,
 * meaning the user copied raw markdown from a code editor or ChatGPT snippet.
 */
export function isRawPreHtml(html: string): boolean {
  if (!html) return true;
  const trimmed = html.trim();
  if (/<pre[\s>]/i.test(trimmed) && !/<table|<h[1-6]|<ul|<ol|<blockquote/i.test(trimmed)) {
    return true;
  }
  // Check if it's just a meta tag + plain text or comments
  const withoutMeta = trimmed.replace(/<meta[^>]*>/gi, '').replace(/<!--[\s\S]*?-->/gi, '').trim();
  if (!withoutMeta.startsWith('<') || withoutMeta.startsWith('<div style="color:')) {
    // If it doesn't contain rich HTML tags
    return !/<table|<h[1-6]|<ul|<ol|<blockquote|<strong>|<em>|<b>|<i>/i.test(withoutMeta);
  }
  return false;
}

/**
 * Parse inline markdown tokens into TipTap text nodes with marks (bold, italic, strike, code, link)
 */
function parseInlineToTipTapNodes(inlineText: string): any[] {
  if (!inlineText) return [];
  // Tokenize using a temporary markdown-it call
  const tokens = md.parseInline(inlineText, {});
  const nodes: any[] = [];
  const markStack: Array<{ type: string; attrs?: Record<string, any> }> = [];

  for (const token of tokens[0]?.children || []) {
    if (token.type === 'text') {
      if (token.content) {
        const segs = splitTextWithLatex(token.content);
        for (const s of segs) {
          if (s.type === 'math') {
            nodes.push({
              type: 'latexInline',
              attrs: { latex: cleanLatex(s.value) },
            });
          } else if (s.value) {
            nodes.push({
              type: 'text',
              text: s.value,
              ...(markStack.length > 0 ? { marks: markStack.map((m) => ({ type: m.type, ...(m.attrs ? { attrs: m.attrs } : {}) })) } : {}),
            });
          }
        }
      }
    } else if (token.type === 'strong_open') {
      markStack.push({ type: 'bold' });
    } else if (token.type === 'strong_close') {
      const idx = markStack.findIndex((m) => m.type === 'bold');
      if (idx !== -1) markStack.splice(idx, 1);
    } else if (token.type === 'em_open') {
      markStack.push({ type: 'italic' });
    } else if (token.type === 'em_close') {
      const idx = markStack.findIndex((m) => m.type === 'italic');
      if (idx !== -1) markStack.splice(idx, 1);
    } else if (token.type === 's_open') {
      markStack.push({ type: 'strike' });
    } else if (token.type === 's_close') {
      const idx = markStack.findIndex((m) => m.type === 'strike');
      if (idx !== -1) markStack.splice(idx, 1);
    } else if (token.type === 'code_inline') {
      nodes.push({
        type: 'text',
        text: token.content,
        marks: [...markStack, { type: 'code' }],
      });
    } else if (token.type === 'link_open') {
      const href = token.attrGet('href') || '';
      markStack.push({ type: 'link', attrs: { href } });
    } else if (token.type === 'link_close') {
      const idx = markStack.findIndex((m) => m.type === 'link');
      if (idx !== -1) markStack.splice(idx, 1);
    } else if (token.type === 'softbreak' || token.type === 'hardbreak') {
      nodes.push({ type: 'hardBreak' });
    }
  }

  return nodes.length > 0 ? nodes : [{ type: 'text', text: inlineText }];
}

/**
 * Converts a Markdown string directly into a valid TipTap JSON Document AST
 * without relying on a browser DOM environment. Useful for API endpoints and SSR.
 */
export function markdownToTipTapJson(markdown: string): any {
  if (!markdown || typeof markdown !== 'string') {
    return { type: 'doc', content: [{ type: 'paragraph', content: [] }] };
  }

  const tokens = md.parse(markdown, {});
  const contentNodes: any[] = [];
  let i = 0;

  while (i < tokens.length) {
    const token = tokens[i];

    if (token.type === 'heading_open') {
      const level = parseInt(token.tag.slice(1), 10) || 1;
      const inlineToken = tokens[i + 1];
      const textNodes = inlineToken && inlineToken.type === 'inline' ? parseInlineToTipTapNodes(inlineToken.content) : [];
      contentNodes.push({
        type: 'heading',
        attrs: { level },
        content: textNodes.length > 0 ? textNodes : undefined,
      });
      i += 3; // heading_open, inline, heading_close
      continue;
    }

    if (token.type === 'paragraph_open') {
      const inlineToken = tokens[i + 1];
      const textNodes = inlineToken && inlineToken.type === 'inline' ? parseInlineToTipTapNodes(inlineToken.content) : [];
      contentNodes.push({
        type: 'paragraph',
        content: textNodes.length > 0 ? textNodes : undefined,
      });
      i += 3; // paragraph_open, inline, paragraph_close
      continue;
    }

    if (token.type === 'table_open') {
      const tableRows: any[] = [];
      i++; // advance past table_open

      while (i < tokens.length && tokens[i].type !== 'table_close') {
        const t = tokens[i];
        if (t.type === 'tr_open') {
          const cells: any[] = [];
          i++; // advance past tr_open

          while (i < tokens.length && tokens[i].type !== 'tr_close') {
            const cellToken = tokens[i];
            const isHeader = cellToken.type === 'th_open';
            if (isHeader || cellToken.type === 'td_open') {
              const inlineToken = tokens[i + 1];
              const cellContent = inlineToken && inlineToken.type === 'inline'
                ? parseInlineToTipTapNodes(inlineToken.content)
                : [];

              cells.push({
                type: isHeader ? 'tableHeader' : 'tableCell',
                content: [
                  {
                    type: 'paragraph',
                    content: cellContent.length > 0 ? cellContent : undefined,
                  },
                ],
              });
              i += 3; // th_open/td_open, inline, th_close/td_close
              continue;
            }
            i++;
          }

          if (cells.length > 0) {
            tableRows.push({
              type: 'tableRow',
              content: cells,
            });
          }
        }
        i++;
      }

      if (tableRows.length > 0) {
        contentNodes.push({
          type: 'table',
          content: tableRows,
        });
      }
      i++; // advance past table_close
      continue;
    }

    if (token.type === 'bullet_list_open' || token.type === 'ordered_list_open') {
      const isOrdered = token.type === 'ordered_list_open';
      const listType = isOrdered ? 'orderedList' : 'bulletList';
      const closeType = isOrdered ? 'ordered_list_close' : 'bullet_list_close';
      const listItems: any[] = [];
      i++;

      while (i < tokens.length && tokens[i].type !== closeType) {
        if (tokens[i].type === 'list_item_open') {
          i++; // into list_item
          const itemParagraphs: any[] = [];

          while (i < tokens.length && tokens[i].type !== 'list_item_close') {
            if (tokens[i].type === 'paragraph_open') {
              const inlineToken = tokens[i + 1];
              const textNodes = inlineToken && inlineToken.type === 'inline' ? parseInlineToTipTapNodes(inlineToken.content) : [];
              itemParagraphs.push({
                type: 'paragraph',
                content: textNodes.length > 0 ? textNodes : undefined,
              });
              i += 3;
              continue;
            }
            i++;
          }

          listItems.push({
            type: 'listItem',
            content: itemParagraphs.length > 0 ? itemParagraphs : [{ type: 'paragraph' }],
          });
        }
        i++;
      }

      if (listItems.length > 0) {
        contentNodes.push({
          type: listType,
          content: listItems,
        });
      }
      i++; // close
      continue;
    }

    if (token.type === 'fence' || token.type === 'code_block') {
      const lang = (token.info || '').trim().toLowerCase();
      const codeText = token.content.replace(/\n$/, '');
      if (['latex', 'tex', 'math', 'katex'].includes(lang) || isPureLatex(codeText.trim())) {
        contentNodes.push({
          type: 'paragraph',
          content: [
            {
              type: 'latexInline',
              attrs: { latex: cleanLatex(codeText.trim()) },
            },
          ],
        });
        i++;
        continue;
      }
      contentNodes.push({
        type: 'codeBlock',
        attrs: { language: token.info || 'text' },
        content: [{ type: 'text', text: codeText }],
      });
      i++;
      continue;
    }

    if (token.type === 'blockquote_open') {
      i++;
      const quoteContent: any[] = [];
      while (i < tokens.length && tokens[i].type !== 'blockquote_close') {
        if (tokens[i].type === 'paragraph_open') {
          const inlineToken = tokens[i + 1];
          const textNodes = inlineToken && inlineToken.type === 'inline' ? parseInlineToTipTapNodes(inlineToken.content) : [];
          quoteContent.push({
            type: 'paragraph',
            content: textNodes.length > 0 ? textNodes : undefined,
          });
          i += 3;
          continue;
        }
        i++;
      }
      if (quoteContent.length > 0) {
        contentNodes.push({
          type: 'blockquote',
          content: quoteContent,
        });
      }
      i++;
      continue;
    }

    if (token.type === 'hr') {
      contentNodes.push({ type: 'horizontalRule' });
      i++;
      continue;
    }

    i++;
  }

  if (contentNodes.length === 0) {
    contentNodes.push({ type: 'paragraph', content: [] });
  }

  return { type: 'doc', content: contentNodes };
}

/**
 * Decodes standard HTML entities in a text string.
 */
function decodeHtmlEntities(text: string): string {
  if (!text) return '';
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * Parses an HTML table string (from Excel, Word, or Web copy) into a 2D string grid.
 */
export function parseHtmlTableToGrid(html: string): string[][] | null {
  if (!html || typeof html !== 'string' || !/<table[\s>]/i.test(html)) return null;

  // Extract all rows: <tr>...</tr>
  const rowMatches = html.match(/<tr[\s>][\s\S]*?<\/tr>/gi);
  if (!rowMatches || rowMatches.length === 0) return null;

  const grid: string[][] = [];

  for (const rowHtml of rowMatches) {
    // Extract cells: <th...>...</th> or <td...>...</td>
    const cellMatches = rowHtml.match(/<(th|td)[\s>][\s\S]*?<\/\1>/gi);
    if (!cellMatches || cellMatches.length === 0) continue;

    const rowCells: string[] = [];
    for (const cellHtml of cellMatches) {
      // Strip opening and closing tags, replace <br> with newline or space
      let text = cellHtml
        .replace(/^<(th|td)[^>]*>/i, '')
        .replace(/<\/(th|td)>$/i, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
        .replace(/<[^>]+>/g, ''); // strip any remaining tags
      text = decodeHtmlEntities(text).trim();
      rowCells.push(text);
    }

    if (rowCells.length > 0) {
      grid.push(rowCells);
    }
  }

  return grid.length > 0 ? grid : null;
}

/**
 * Universal clipboard table parser:
 * Automatically detects and parses:
 * 1. HTML tables (from Excel, Google Sheets, Word, Web)
 * 2. Markdown tables (| col1 | col2 |)
 * 3. Tab-separated values (TSV)
 * 4. Comma / Semicolon-separated values (CSV)
 * Returns a 2D array of string values: string[][] | null.
 */
export function parseClipboardToTableGrid(plainText: string, htmlText?: string): string[][] | null {
  // 1. Try HTML table first if HTML is present and contains <table>
  if (htmlText && /<table[\s>]/i.test(htmlText)) {
    const htmlGrid = parseHtmlTableToGrid(htmlText);
    if (htmlGrid && htmlGrid.length > 0 && (htmlGrid.length > 1 || htmlGrid[0].length > 1)) {
      return htmlGrid;
    }
  }

  const cleanPlain = String(plainText || '').replace(/\r\n?/g, '\n').trim();
  if (!cleanPlain) return null;

  // 2. Try Markdown table
  if (hasMarkdownTable(cleanPlain)) {
    const mdGrid = parseMarkdownTableToGrid(cleanPlain);
    if (mdGrid && mdGrid.length > 0) {
      return mdGrid;
    }
  }

  // 3. Try TSV (tab-delimited)
  if (cleanPlain.includes('\t')) {
    const lines = cleanPlain.split('\n').filter((l) => l.trim().length > 0);
    const tsvGrid = lines.map((line) => line.split('\t').map((c) => c.trim()));
    if (tsvGrid.length > 0 && (tsvGrid.length > 1 || tsvGrid[0].length > 1)) {
      return tsvGrid;
    }
  }

  // 4. Try CSV (comma or semicolon delimited with consistent columns)
  const lines = cleanPlain.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length > 1) {
    const commaCols = lines[0].split(',');
    if (commaCols.length > 1 && lines.every((l) => l.split(',').length === commaCols.length)) {
      return lines.map((l) => l.split(',').map((c) => c.trim()));
    }
    const semiCols = lines[0].split(';');
    if (semiCols.length > 1 && lines.every((l) => l.split(';').length === semiCols.length)) {
      return lines.map((l) => l.split(';').map((c) => c.trim()));
    }
  }

  return null;
}

