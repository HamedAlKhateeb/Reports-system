import { Mark, mergeAttributes } from '@tiptap/core';

export interface FontFamilyOptions {
  HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fontFamily: {
      setFontFamily: (family: string) => ReturnType;
      unsetFontFamily: () => ReturnType;
    };
  }
}

/**
 * Single source of truth for "which font family am I working with":
 * explicit mark at cursor → pending (stored) mark → last explicitly chosen
 * (remembered) family → '' (document default). Mirrors FontSizeMark so the
 * toolbar indicator, picker, and paste normalization never disagree.
 */
export function resolveActiveFontFamily(editor: any): string {
  try {
    const attr = editor?.getAttributes?.('fontFamily')?.family;
    if (attr) return String(attr);
    // Collapsed cursor with a pending (stored) mark: getAttributes misses it.
    try {
      const stored = editor?.state?.storedMarks as Array<{ type?: { name?: string }; attrs?: any }> | null | undefined;
      const hit = Array.isArray(stored) ? stored.find((m) => m?.type?.name === 'fontFamily') : undefined;
      const s = hit?.attrs?.family;
      if (s) return String(s);
    } catch {}
    const remembered = (editor?.storage as any)?.fontFamily?.current;
    if (remembered) return String(remembered);
  } catch {}
  return '';
}

export const FontFamily = Mark.create<FontFamilyOptions>({
  name: 'fontFamily',

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  // Editor-level memory of the last explicitly chosen family ("current").
  // Same rationale as FontSize storage: marks alone are transient.
  addStorage() {
    return {
      current: '',
    };
  },

  addAttributes() {
    return {
      family: {
        default: null,
        parseHTML: (element) => element.style.fontFamily || element.getAttribute('data-family'),
        renderHTML: (attributes) => {
          if (!attributes.family) {
            return {};
          }
          return {
            style: `font-family: ${attributes.family}`,
            'data-family': attributes.family,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[style*="font-family"]',
      },
      {
        tag: 'span[data-family]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
  },

  addCommands() {
    return {
      // NOTE: same TipTap caveat as FontSize — memory is written through
      // `editor.storage`, not `this.storage`.
      setFontFamily:
        (family: string) =>
        ({ chain, editor }) => {
          try {
            ((editor as any)?.storage as any).fontFamily.current = family;
          } catch {}
          return chain().setMark(this.name, { family }).run();
        },
      unsetFontFamily:
        () =>
        ({ chain, editor }) => {
          try {
            ((editor as any)?.storage as any).fontFamily.current = '';
          } catch {}
          return chain().unsetMark(this.name).run();
        },
    };
  },
});
