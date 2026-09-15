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

export const DEFAULT_FONT_SIZE = '16px';

/**
 * Single source of truth for "which size am I working with":
 * explicit mark at cursor → heading default → last explicitly chosen
 * (remembered) size → 16. Used by the toolbar indicator, both steppers,
 * and the keyboard shortcuts so they never disagree.
 */
export function resolveActiveFontSize(editor: any): number {
  try {
    const sizeAttr = editor?.getAttributes?.('fontSize')?.size;
    if (sizeAttr) {
      const p = parseInt(sizeAttr, 10);
      if (!isNaN(p) && p > 0) return p;
    }
    // Collapsed cursor with a pending (stored) mark: getAttributes misses
    // it, which made repeated stepper clicks idempotent (16→18→18…).
    try {
      const stored = editor?.state?.storedMarks as Array<{ type?: { name?: string }; attrs?: any }> | null | undefined;
      const hit = Array.isArray(stored) ? stored.find((m) => m?.type?.name === 'fontSize') : undefined;
      const s = hit?.attrs?.size;
      if (s) {
        const p = parseInt(String(s), 10);
        if (!isNaN(p) && p > 0) return p;
      }
    } catch {}
    if (editor?.isActive?.('heading', { level: 1 })) return 30;
    if (editor?.isActive?.('heading', { level: 2 })) return 24;
    if (editor?.isActive?.('heading', { level: 3 })) return 20;
    const remembered = (editor?.storage as any)?.fontSize?.current;
    if (remembered) {
      const p = parseInt(String(remembered), 10);
      if (!isNaN(p) && p > 0) return p;
    }
  } catch {}
  return 16;
}

export const FontSize = Mark.create<FontSizeOptions>({
  name: 'fontSize',

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  // Editor-level memory of the last explicitly chosen size ("current size").
  // Marks alone are transient (cleared on selection moves, ignored by paste),
  // so the toolbar indicator, steppers, and paste normalization read this.
  addStorage() {
    return {
      current: DEFAULT_FONT_SIZE,
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
      // NOTE: `this` here is TipTap's bound command context, NOT the
      // extension instance — `this.storage` is unreliable (silently
      // undefined). Memory is written through `editor.storage` instead.
      setFontSize:
        (size: string) =>
        ({ chain, editor }) => {
          try {
            ((editor as any)?.storage as any).fontSize.current = size;
          } catch {}
          return chain().setMark(this.name, { size }).run();
        },
      unsetFontSize:
        () =>
        ({ chain, editor }) => {
          try {
            ((editor as any)?.storage as any).fontSize.current = DEFAULT_FONT_SIZE;
          } catch {}
          return chain().unsetMark(this.name).run();
        },
    };
  },
});
