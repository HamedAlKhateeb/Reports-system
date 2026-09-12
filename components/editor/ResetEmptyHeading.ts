import { Extension } from '@tiptap/core';
import type { EditorState, Transaction } from '@tiptap/pm/state';

/**
 * ResetEmptyHeading — when a heading LOSES its text (user deleted it),
 * convert the now-empty heading back to a plain paragraph so newly typed
 * text doesn't inherit heading styling.
 *
 * Guard: only acts when the same location previously held a NON-EMPTY
 * heading. This keeps intentional actions intact:
 * - toggleHeading on an empty paragraph (old parent isn't a heading)
 * - typing over/replacing heading text (new heading still has text)
 */
export const ResetEmptyHeading = Extension.create({
  name: 'resetEmptyHeading',

  appendTransaction(transactions: Transaction[], oldState: EditorState, newState: EditorState) {
    try {
      if (!transactions.some((tr: any) => tr.docChanged)) return null;

      const newParent = newState.selection.$from.parent;
      if (!newParent || newParent.type.name !== 'heading') return null;
      if (newParent.textContent !== '') return null;

      let oldParent: any = null;
      try {
        oldParent = oldState.selection.$from.parent;
      } catch {
        return null;
      }
      if (!oldParent || oldParent.type.name !== 'heading') return null;
      if (oldParent.textContent === '') return null;

      const paragraph = newState.schema.nodes.paragraph;
      if (!paragraph) return null;
      const pos = newState.selection.$from.before();
      if (pos < 0) return null;
      return newState.tr.setNodeMarkup(pos, paragraph);
    } catch {
      return null;
    }
  },
});
