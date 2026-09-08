import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { SmartTableView } from './SmartTableView';

export interface SmartTableOptions {
  HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    smartTable: {
      insertSmartTable: (options: {
        tableId: string;
        reportId?: string;
        displayMode?: 'embedded-edit' | 'readonly';
      }) => ReturnType;
    };
  }
}

export const SmartTableNode = Node.create<SmartTableOptions>({
  name: 'smartTable',
  group: 'block',
  atom: true,
  draggable: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      tableId: {
        default: '',
      },
      reportId: {
        default: '',
      },
      displayMode: {
        default: 'embedded-edit',
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="smart-table"]',
        getAttrs: (dom) => {
          const el = dom as HTMLElement;
          return {
            tableId: el.getAttribute('data-table-id') || '',
            reportId: el.getAttribute('data-report-id') || '',
            displayMode: el.getAttribute('data-display-mode') || 'embedded-edit',
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-type': 'smart-table',
        'data-table-id': HTMLAttributes.tableId,
        'data-report-id': HTMLAttributes.reportId,
        'data-display-mode': HTMLAttributes.displayMode,
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(SmartTableView);
  },

  addCommands() {
    return {
      insertSmartTable:
        (options) =>
        ({ chain }) => {
          return chain()
            .insertContent({
              type: this.name,
              attrs: options,
            })
            .run();
        },
    };
  },
});
