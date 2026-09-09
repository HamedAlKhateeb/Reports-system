import { Node, mergeAttributes, InputRule } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { LatexInlineView } from './LatexInlineView';

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
          return { latex: el.getAttribute('data-latex') || '' };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'latex-inline',
        'data-latex': HTMLAttributes.latex || '',
        class: 'latex-inline',
        dir: 'ltr',
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(LatexInlineView);
  },

  addInputRules() {
    // Typing `$x^2$ ` converts to a math node (Markdown-style inline math).
    const dollarRule = new InputRule({
      find: /(?:^|\s)\$([^$\n]+?)\$\s$/,
      handler: ({ state, range, match }) => {
        const latex = (match[1] || '').trim();
        if (!latex) return;
        const { tr } = state;
        // Replace "$...$ " (including leading space handling) with the node
        const start = range.from;
        const end = range.to;
        tr.replaceWith(start, end, this.type.create({ latex }));
      },
    });
    // Typing `\(x^2\) ` converts as well.
    const parenRule = new InputRule({
      find: /\\\((.+?)\\\)\s$/,
      handler: ({ state, range, match }) => {
        const latex = (match[1] || '').trim();
        if (!latex) return;
        state.tr.replaceWith(range.from, range.to, this.type.create({ latex }));
      },
    });
    return [dollarRule, parenRule];
  },

  addCommands() {
    return {
      setLatexInline:
        (options) =>
        ({ chain }) => {
          const latex = (options?.latex || '').trim();
          if (!latex) return false;
          return chain()
            .insertContent({ type: this.name, attrs: { latex } })
            .run();
        },
    };
  },
});
