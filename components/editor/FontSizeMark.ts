import { Mark, mergeAttributes } from '@tiptap/core';

export interface FontSizeOptions {
  HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (size: string) => ReturnType;
      unsetFontSize: () => ReturnType;
    };
  }
}

export const FontSize = Mark.create<FontSizeOptions>({
  name: 'fontSize',

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      size: {
        default: null,
        parseHTML: (element) => element.style.fontSize || element.getAttribute('data-size'),
        renderHTML: (attributes) => {
          if (!attributes.size) {
            return {};
          }
          return {
            style: `font-size: ${attributes.size}`,
            'data-size': attributes.size,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[style*="font-size"]',
      },
      {
        tag: 'span[data-size]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setFontSize:
        (size: string) =>
        ({ chain }) => {
          return chain().setMark(this.name, { size }).run();
        },
      unsetFontSize:
        () =>
        ({ chain }) => {
          return chain().unsetMark(this.name).run();
        },
    };
  },
});
