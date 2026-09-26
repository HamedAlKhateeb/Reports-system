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
 * - `\(`...`\)` and `\[`...`\]` are supported as well.
 * - Raw pure LaTeX math expressions (e.g. `\alpha \in \left(\frac{1}{2},1\right]`) are recognized automatically.
 * - Escaped `\$` stays literal.
 */
export function splitTextWithLatex(input: string): LatexSegment[] {
  if (!input || typeof input !== 'string') return [{ type: 'text', value: input || '' }];
  const trimmed = input.trim();
  if (isPureLatex(trimmed)) {
    return [{ type: 'math', value: cleanLatex(trimmed) }];
  }
  const out: LatexSegment[] = [];
  // Protect escaped dollars
  const ESC = '\u0000ESC_DOLLAR\u0000';
  let src = input.replace(/\\\$/g, ESC);
  const re = /(\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$|\\\((.+?)\\\)|\\\[([\s\S]+?)\\\])/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    if (m.index > last) {
      out.push({ type: 'text', value: src.slice(last, m.index).replaceAll(ESC, '$') });
    }
    const latex = cleanLatex((m[2] ?? m[3] ?? m[4] ?? m[5] ?? '').trim());
    if (latex) out.push({ type: 'math', value: latex });
    else out.push({ type: 'text', value: m[0].replaceAll(ESC, '$') });
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push({ type: 'text', value: src.slice(last).replaceAll(ESC, '$') });
  if (out.length === 0) return [{ type: 'text', value: input }];
  return out;
}

/**
 * Strips outer delimiters ($...$, $$...$$, \(...\), \[...\]) from a LaTeX math string,
 * leaving pure KaTeX-renderable math code.
 */
export function cleanLatex(latex: string): string {
  if (!latex || typeof latex !== 'string') return '';
  let src = latex.trim();
  if (src.startsWith('$$') && src.endsWith('$$') && src.length > 4) {
    src = src.slice(2, -2).trim();
  } else if (src.startsWith('$') && src.endsWith('$') && src.length > 2) {
    src = src.slice(1, -1).trim();
  } else if (src.startsWith('\\(') && src.endsWith('\\)') && src.length > 4) {
    src = src.slice(2, -2).trim();
  } else if (src.startsWith('\\[') && src.endsWith('\\]') && src.length > 4) {
    src = src.slice(2, -2).trim();
  }
  return src;
}

/**
 * Detects whether a string is a LaTeX mathematical expression.
 * Handles both delimited ($...$, $$...$$, \(...\), \[...\])
 * and un-delimited mathematical expressions (e.g. `\alpha \in \left(\frac{1}{2},1\right]`, `\frac{a}{b}`, etc.).
 */
export function isPureLatex(str: string): boolean {
  if (!str || typeof str !== 'string') return false;
  const trimmed = str.trim();
  if (!trimmed) return false;

  // 1. Single Delimited math: $...$, $$...$$, \(...\), \[...\]
  if (trimmed.startsWith('$$') && trimmed.endsWith('$$') && trimmed.length > 4) {
    if (!trimmed.slice(2, -2).includes('$$')) return true;
  }
  if (trimmed.startsWith('$') && trimmed.endsWith('$') && trimmed.length > 2) {
    if (!trimmed.slice(1, -1).includes('$')) return true;
  }
  if (trimmed.startsWith('\\(') && trimmed.endsWith('\\)') && trimmed.length > 4) {
    if (!trimmed.slice(2, -2).includes('\\(') && !trimmed.slice(2, -2).includes('\\)')) return true;
  }
  if (trimmed.startsWith('\\[') && trimmed.endsWith('\\]') && trimmed.length > 4) {
    if (!trimmed.slice(2, -2).includes('\\[') && !trimmed.slice(2, -2).includes('\\]')) return true;
  }

  // 2. Reject obvious file paths (e.g. C:\Users\... or /path/to/...)
  if (/^[a-zA-Z]:\\/.test(trimmed)) return false;

  // 3. Must contain at least one LaTeX command
  const hasLatexCommand = /\\[a-zA-Z]+/.test(trimmed);
  if (!hasLatexCommand) return false;

  // 4. Key mathematical LaTeX commands / symbols
  const mathMacroPattern =
    /\\(?:alpha|beta|gamma|delta|epsilon|varepsilon|zeta|eta|theta|vartheta|iota|kappa|lambda|mu|nu|xi|pi|varpi|rho|varrho|sigma|varsigma|tau|upsilon|phi|varphi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega|frac|dfrac|tfrac|cfrac|sqrt|left|right|sum|prod|int|iint|iiint|oint|coprod|lim|liminf|limsup|in|notin|subset|supset|subseteq|supseteq|cap|cup|setminus|times|div|pm|mp|neq|leq|geq|le|ge|ne|approx|equiv|sim|simeq|cong|propto|forall|exists|nexists|infty|partial|nabla|to|rightarrow|leftarrow|Rightarrow|Leftarrow|iff|implies|mapsto|cdot|cdots|ldots|ddots|vdots|mathbf|mathrm|mathit|mathsf|mathtt|mathbb|mathcal|mathscr|mathfrak|begin|end|over|choose|binom|bmatrix|pmatrix|vmatrix|cases|text|operatorname|sin|cos|tan|cot|sec|csc|log|ln|exp|det|dim|ker|deg)\b/;

  if (!mathMacroPattern.test(trimmed)) return false;

  // 5. Must NOT contain embedded delimited math surrounded by text
  if (/\\\([^\)]*?\\\)|\$[^$]*?\$|\\\[[\s\S]*?\\\]/.test(trimmed)) {
    return false;
  }

  // 6. Verify KaTeX can parse it strictly
  try {
    katex.renderToString(trimmed, { throwOnError: true });
    return true;
  } catch {
    return false;
  }
}

/** Render a single LaTeX fragment to KaTeX HTML (never throws, never empty). */
export function renderLatexToHtml(latex: string): string {
  const src = cleanLatex(latex);
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
