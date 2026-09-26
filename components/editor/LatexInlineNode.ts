import { Node, mergeAttributes, InputRule, nodePasteRule } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { LatexInlineView } from './LatexInlineView';
import { cleanLatex, isPureLatex } from '@/lib/latex';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    latexInline: {
      setLatexInline: (options: { latex: string }) => ReturnType;
    };
  }
}

export const LatexInline = Node.create({
  name: 'latexInline',
  group: 'inline',
  inline: true,
  atom: true,
  marks: '_',
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      latex: { default: '' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="latex-inline"]',
        getAttrs: (dom) => {
          const el = dom as HTMLElement;
          const latexAttr = el.getAttribute('data-latex');
          if (latexAttr) {
            return { latex: cleanLatex(latexAttr) };
          }
          const text = (el.textContent || '').trim();
          return { latex: cleanLatex(text) };
        },
      },
      {
        tag: 'code',
        getAttrs: (dom) => {
          const el = dom as HTMLElement;
          const cls = (el.getAttribute('class') || '').toLowerCase();
          const lang = (el.getAttribute('data-language') || '').toLowerCase();
          const text = (el.textContent || '').trim();
          if (/(?:^|\s)language-(?:latex|tex|math|katex)(?:\s|$)/.test(cls) || ['latex', 'tex', 'math', 'katex'].includes(lang)) {
            return { latex: cleanLatex(text) };
          }
          if (isPureLatex(text)) {
            return { latex: cleanLatex(text) };
          }
          return false;
        },
      },
      {
        tag: 'pre',
        getAttrs: (dom) => {
          const el = dom as HTMLElement;
          const lang = (el.getAttribute('data-language') || '').toLowerCase();
          const code = el.querySelector('code');
          const codeCls = (code?.getAttribute('class') || '').toLowerCase();
          const codeLang = (code?.getAttribute('data-language') || '').toLowerCase();
          const allLang = `${lang} ${codeCls} ${codeLang}`;
          const text = (el.textContent || '').trim();
          if (/(latex|tex|katex|math)/.test(allLang)) {
            return { latex: cleanLatex(text) };
          }
          if (isPureLatex(text)) {
            return { latex: cleanLatex(text) };
          }
          return false;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes, node }: any) {
    const rawLatex = cleanLatex(HTMLAttributes['data-latex'] || HTMLAttributes.latex || node?.attrs?.latex || '');
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'latex-inline',
        'data-latex': rawLatex,
        class: 'latex-inline',
        dir: 'ltr',
      }),
      rawLatex ? `$${rawLatex}$` : '',
    ];
  },

  renderText({ node }: any) {
    const latex = cleanLatex(node?.attrs?.latex || '');
    return latex ? `$${latex}$` : '';
  },

  addNodeView() {
    return ReactNodeViewRenderer(LatexInlineView);
  },

  addInputRules() {
    const makeHandler = (groupIndex: number) => {
      return ({ state, range, match }: any) => {
        const latex = cleanLatex((match[groupIndex] || '').trim());
        if (!latex) return;
        const fullMatch = match[0];
        // Locate delimiter start so preceding punctuation or whitespace is preserved
        const delimIdx = fullMatch.search(/[\$\\]/);
        const start = delimIdx >= 0 ? range.from + delimIdx : range.from;
        state.tr.replaceWith(start, range.to, this.type.create({ latex }));
      };
    };

    // Instant `$$equation$$` (matches inline or multiline display math delimiters)
    const doubleDollarInstant = new InputRule({
      find: /(?:^|[^\$])\$\$([^\$]+?)\$\$$/,
      handler: makeHandler(1),
    });

    // Space-triggered `$$equation$$ `
    const doubleDollarWithSpace = new InputRule({
      find: /(?:^|[^\$])\$\$([^\$]+?)\$\$\s$/,
      handler: makeHandler(1),
    });

    // Instant `\[equation\]`
    const bracketInstant = new InputRule({
      find: /\\\[(.+?)\\\]$/,
      handler: makeHandler(1),
    });

    // Fallback `\[equation\] ` with space
    const bracketWithSpace = new InputRule({
      find: /\\\[(.+?)\\\]\s$/,
      handler: makeHandler(1),
    });

    // Instant `$equation$` (immediately renders upon typing the closing $)
    const dollarInstant = new InputRule({
      find: /(?:^|[^\$])\$([^$\s\n][^$\n]*?)\$$/,
      handler: makeHandler(1),
    });

    // Fallback `$equation$ ` with space
    const dollarWithSpace = new InputRule({
      find: /(?:^|[^\$])\$([^$\n]+?)\$\s$/,
      handler: makeHandler(1),
    });

    // Instant `\(equation\)`
    const parenInstant = new InputRule({
      find: /\\\((.+?)\\\)$/,
      handler: makeHandler(1),
    });

    // Fallback `\(equation\) ` with space
    const parenWithSpace = new InputRule({
      find: /\\\((.+?)\\\)\s$/,
      handler: makeHandler(1),
    });

    return [
      doubleDollarInstant,
      doubleDollarWithSpace,
      bracketInstant,
      bracketWithSpace,
      dollarInstant,
      dollarWithSpace,
      parenInstant,
      parenWithSpace,
    ];
  },

  addPasteRules() {
    return [
      nodePasteRule({
        find: /\$\$([^\$]+?)\$\$/g,
        type: this.type,
        getAttributes: (match) => {
          const latex = cleanLatex((match[1] || '').trim());
          return latex ? { latex } : false;
        },
      }),
      nodePasteRule({
        find: /\\\[([\s\S]+?)\\\]/g,
        type: this.type,
        getAttributes: (match) => {
          const latex = cleanLatex((match[1] || '').trim());
          return latex ? { latex } : false;
        },
      }),
      nodePasteRule({
        find: /(?:^|[^\$])\$([^$\s\n][^$\n]*?)\$/g,
        type: this.type,
        getAttributes: (match) => {
          const latex = cleanLatex((match[1] || '').trim());
          return latex ? { latex } : false;
        },
      }),
      nodePasteRule({
        find: /\\\((.+?)\\\)/g,
        type: this.type,
        getAttributes: (match) => {
          const latex = cleanLatex((match[1] || '').trim());
          return latex ? { latex } : false;
        },
      }),
    ];
  },

  addCommands() {
    return {
      setLatexInline:
        (options) =>
        ({ chain }) => {
          const latex = cleanLatex(options?.latex || '');
          if (!latex) return false;
          return chain()
            .insertContent({ type: this.name, attrs: { latex } })
            .run();
        },
    };
  },
});
