import { Extension } from '@tiptap/core';

export interface TextDirectionOptions {
  types: string[];
  directions: string[];
  defaultDirection: string | null;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    textDirection: {
      /**
       * Set the text direction of selected blocks ('ltr' | 'rtl' | 'auto')
       */
      setTextDirection: (direction: 'ltr' | 'rtl' | 'auto') => ReturnType;
      /**
       * Unset the text direction of selected blocks
       */
      unsetTextDirection: () => ReturnType;
      /**
       * Toggle the text direction of selected blocks
       */
      toggleTextDirection: (direction: 'ltr' | 'rtl' | 'auto') => ReturnType;
    };
  }
}

export const TextDirection = Extension.create<TextDirectionOptions>({
  name: 'textDirection',

  addOptions() {
    return {
      types: ['heading', 'paragraph', 'blockquote'],
      directions: ['ltr', 'rtl', 'auto'],
      defaultDirection: null,
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          dir: {
            default: this.options.defaultDirection,
            parseHTML: (element) => {
              const dir = element.getAttribute('dir') || (element.style && element.style.direction);
              return this.options.directions.includes(dir) ? dir : this.options.defaultDirection;
            },
            renderHTML: (attributes) => {
              if (!attributes.dir) {
                return {};
              }
              return { dir: attributes.dir };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setTextDirection:
        (direction: 'ltr' | 'rtl' | 'auto') =>
        ({ commands }) => {
          if (!this.options.directions.includes(direction)) {
            return false;
          }

          return this.options.types
            .map((type) => commands.updateAttributes(type, { dir: direction }))
            .some((response) => response);
        },

      unsetTextDirection:
        () =>
        ({ commands }) => {
          return this.options.types
            .map((type) => commands.resetAttributes(type, 'dir'))
            .some((response) => response);
        },

      toggleTextDirection:
        (direction: 'ltr' | 'rtl' | 'auto') =>
        ({ editor, commands }) => {
          if (!this.options.directions.includes(direction)) {
            return false;
          }

          if (editor.isActive({ dir: direction })) {
            return commands.unsetTextDirection();
          }

          return commands.setTextDirection(direction);
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Alt-l': () => this.editor.commands.setTextDirection('ltr'),
      'Mod-Alt-r': () => this.editor.commands.setTextDirection('rtl'),
    };
  },
});

export default TextDirection;
