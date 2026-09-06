import { Mark, mergeAttributes } from '@tiptap/core';

export interface TextColorOptions {
  HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    textColor: {
      setTextColor: (color: string) => ReturnType;
      unsetTextColor: () => ReturnType;
    };
    textHighlight: {
      setTextHighlight: (color: string) => ReturnType;
      unsetTextHighlight: () => ReturnType;
    };
  }
}

export const TextColor = Mark.create<TextColorOptions>({
  name: 'textColor',

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (element) => element.style.color || element.getAttribute('data-color'),
        renderHTML: (attributes) => {
          if (!attributes.color) {
            return {};
          }
          return {
            style: `color: ${attributes.color}`,
            'data-color': attributes.color,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[style*="color"]',
      },
      {
        tag: 'span[data-color]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setTextColor:
        (color: string) =>
        ({ chain }) => {
          return chain().setMark(this.name, { color }).run();
        },
      unsetTextColor:
        () =>
        ({ chain }) => {
          return chain().unsetMark(this.name).run();
        },
    };
  },
});

export const TextHighlight = Mark.create({
  name: 'textHighlight',

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      color: {
        default: '#fef08a',
        parseHTML: (element) => element.style.backgroundColor || element.getAttribute('data-bg-color'),
        renderHTML: (attributes) => {
          if (!attributes.color) {
            return {};
          }
          return {
            style: `background-color: ${attributes.color}; padding: 1px 4px; border-radius: 4px;`,
            'data-bg-color': attributes.color,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'mark',
      },
      {
        tag: 'span[style*="background-color"]',
      },
      {
        tag: 'span[data-bg-color]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['mark', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setTextHighlight:
        (color: string) =>
        ({ chain }) => {
          return chain().setMark(this.name, { color }).run();
        },
      unsetTextHighlight:
        () =>
        ({ chain }) => {
          return chain().unsetMark(this.name).run();
        },
    };
  },
});
