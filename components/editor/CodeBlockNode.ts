import { mergeAttributes, textblockTypeInputRule } from '@tiptap/core';
import CodeBlock from '@tiptap/extension-code-block';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { Selection, TextSelection } from '@tiptap/pm/state';
import { CodeBlockView } from './CodeBlockView';
import { isPureLatex } from '@/lib/latex';

export interface CodeLanguage {
  value: string;
  label: string;
}

/** Language options for the snippet header (value = Prism-style alias). */
export const CODE_LANGUAGES: CodeLanguage[] = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
  { value: 'csharp', label: 'C#' },
  { value: 'cpp', label: 'C++' },
  { value: 'php', label: 'PHP' },
  { value: 'sql', label: 'SQL' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'json', label: 'JSON' },
  { value: 'bash', label: 'Bash' },
  { value: 'powershell', label: 'PowerShell' },
  { value: 'dart', label: 'Dart' },
  { value: 'kotlin', label: 'Kotlin' },
  { value: 'yaml', label: 'YAML' },
  { value: 'markdown', label: 'Markdown' },
];

export function codeLanguageLabel(value: string | null | undefined): string {
  if (!value) return '';
  return CODE_LANGUAGES.find((l) => l.value === value)?.label || String(value);
}

/**
 * ReportCodeBlock — TipTap CodeBlock with a header (language picker + copy
 * button) rendered through CodeBlockView. Typing ```lang + space converts
 * the current block; pasted <pre> blocks keep their language via
 * data-language / language-* classes.
 */
export const ReportCodeBlock = CodeBlock.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      language: {
        default: null,
        parseHTML: (element) => {
          const el = element as HTMLElement;
          const fromPre = el.getAttribute?.('data-language');
          if (fromPre) return fromPre;
          const code = el.querySelector?.('code');
          const cls = code?.getAttribute?.('class') || '';
          const m = cls.match(/language-([\w#+.-]+)/);
          if (m) return m[1];
          const fromCode = code?.getAttribute?.('data-language');
          if (fromCode) return fromCode;
          return null;
        },
        renderHTML: (attributes) => {
          if (!attributes.language) return {};
          return { 'data-language': attributes.language };
        },
      },
      fontSize: {
        default: null,
        parseHTML: (element) => (element as HTMLElement).getAttribute?.('data-font-size'),
        renderHTML: (attributes) => {
          if (!attributes.fontSize) return {};
          return { 'data-font-size': attributes.fontSize };
        },
      },
      wrapLines: {
        default: false,
        parseHTML: (element) => (element as HTMLElement).getAttribute?.('data-wrap-lines') === 'true',
        renderHTML: (attributes) => {
          if (!attributes.wrapLines) return {};
          return { 'data-wrap-lines': 'true' };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'pre',
        preserveWhitespace: 'full' as const,
        getAttrs: (node) => {
          const el = node as HTMLElement;
          const lang = (el.getAttribute?.('data-language') || '').toLowerCase();
          const code = el.querySelector?.('code');
          const codeCls = (code?.getAttribute?.('class') || '').toLowerCase();
          const codeLang = (code?.getAttribute?.('data-language') || '').toLowerCase();
          const allLang = `${lang} ${codeCls} ${codeLang}`;

          if (/(latex|tex|katex|math)/.test(allLang)) {
            return false;
          }

          const text = (el.textContent || '').trim();
          if (text && isPureLatex(text)) {
            return false;
          }

          return null;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const lang = (HTMLAttributes as any)?.language;
    return [
      'pre',
      mergeAttributes(HTMLAttributes, {
        dir: 'ltr',
        class: 'report-code',
        ...(lang ? { 'data-language': lang } : {}),
      }),
      ['code', 0],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },

  addInputRules() {
    return [
      textblockTypeInputRule({
        find: /^```([a-zA-Z0-9+#.-]*)\s$/,
        type: this.type,
        getAttributes: (match) => ({ language: match[1] || null }),
      }),
    ];
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Alt-c': () => this.editor.commands.toggleCodeBlock(),

      // Ctrl+Enter or Cmd+Enter: always exit code block and insert a new paragraph below
      'Mod-Enter': ({ editor }) => {
        const { state, view } = editor;
        const { selection } = state;
        const { $from, empty } = selection;

        if (!empty || $from.parent.type !== this.type) {
          return false;
        }

        const after = $from.after();
        if (after === undefined) {
          return false;
        }

        const tr = state.tr;
        const p = state.schema.nodes.paragraph.create();
        tr.insert(after, p);
        tr.setSelection(TextSelection.create(tr.doc, after + 1));
        view.dispatch(tr.scrollIntoView());
        editor.commands.focus();
        return true;
      },

      // Double enter at end of code block, or enter in an empty code block: exit cleanly
      Enter: ({ editor }) => {
        const { state, view } = editor;
        const { selection } = state;
        const { $from, empty } = selection;

        if (!empty || $from.parent.type !== this.type) {
          return false;
        }

        const text = $from.parent.textContent;
        const isAtEnd = $from.parentOffset === $from.parent.nodeSize - 2;

        // Case 1: Code block is completely empty
        if (text.length === 0) {
          const after = $from.after();
          if (after === undefined) return false;
          const tr = state.tr;
          const p = state.schema.nodes.paragraph.create();
          tr.insert(after, p);
          tr.setSelection(TextSelection.create(tr.doc, after + 1));
          view.dispatch(tr.scrollIntoView());
          editor.commands.focus();
          return true;
        }

        // Case 2: Cursor is at the end and text already ends with a newline (i.e. user hit Enter on a blank line)
        if (isAtEnd && text.endsWith('\n')) {
          const tr = state.tr;
          // Delete the trailing empty newline inside the code block
          tr.delete($from.pos - 1, $from.pos);
          const after = $from.after();
          if (after === undefined) return false;
          const p = state.schema.nodes.paragraph.create();
          tr.insert(after, p);
          tr.setSelection(TextSelection.create(tr.doc, after + 1));
          view.dispatch(tr.scrollIntoView());
          editor.commands.focus();
          return true;
        }

        return false;
      },

      // ArrowDown at the end of the code block moves to next block or creates a paragraph if at doc end
      ArrowDown: ({ editor }) => {
        const { state, view } = editor;
        const { selection, doc } = state;
        const { $from, empty } = selection;

        if (!empty || $from.parent.type !== this.type) {
          return false;
        }

        const isAtEnd = $from.parentOffset === $from.parent.nodeSize - 2;
        if (!isAtEnd) {
          return false;
        }

        const after = $from.after();
        if (after === undefined) {
          return false;
        }

        const nodeAfter = doc.nodeAt(after);
        if (nodeAfter) {
          return editor.commands.command(({ tr }) => {
            tr.setSelection(Selection.near(doc.resolve(after), 1));
            return true;
          });
        }

        // No node after: insert empty paragraph at doc end and navigate into it
        const tr = state.tr;
        const p = state.schema.nodes.paragraph.create();
        tr.insert(after, p);
        tr.setSelection(TextSelection.create(tr.doc, after + 1));
        view.dispatch(tr.scrollIntoView());
        editor.commands.focus();
        return true;
      },

      // Mod-ArrowDown: immediately jump to the block below (creating one if at doc end)
      'Mod-ArrowDown': ({ editor }) => {
        const { state, view } = editor;
        const { selection, doc } = state;
        const { $from, empty } = selection;

        if (!empty || $from.parent.type !== this.type) {
          return false;
        }

        const after = $from.after();
        if (after === undefined) {
          return false;
        }

        const nodeAfter = doc.nodeAt(after);
        if (nodeAfter) {
          return editor.commands.command(({ tr }) => {
            tr.setSelection(Selection.near(doc.resolve(after), 1));
            return true;
          });
        }

        const tr = state.tr;
        const p = state.schema.nodes.paragraph.create();
        tr.insert(after, p);
        tr.setSelection(TextSelection.create(tr.doc, after + 1));
        view.dispatch(tr.scrollIntoView());
        editor.commands.focus();
        return true;
      },

      // Backspace: if code block is empty, convert to paragraph
      Backspace: () => {
        const { empty, $anchor } = this.editor.state.selection;
        const isAtStart = $anchor.pos === 1;

        if (!empty || $anchor.parent.type.name !== this.name) {
          return false;
        }

        if (isAtStart || !$anchor.parent.textContent.length) {
          return this.editor.commands.clearNodes();
        }

        return false;
      },
    };
  },
});
