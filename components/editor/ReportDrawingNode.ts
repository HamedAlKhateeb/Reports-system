import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { ReportDrawingView } from './ReportDrawingView';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    reportDrawing: {
      setReportDrawing: (options: {
        drawingId: string;
        title?: string;
        caption?: string;
        elements?: any[];
        width?: number;
        alignment?: 'center' | 'left' | 'right';
        background?: string;
        direction?: 'rtl' | 'ltr';
      }) => ReturnType;
      updateReportDrawing: (drawingId: string, patch: Record<string, any>) => ReturnType;
      deleteReportDrawing: (drawingId: string) => ReturnType;
    };
  }
}

export const ReportDrawing = Node.create({
  name: 'reportDrawing',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      drawingId: { default: '' },
      title: { default: '' },
      caption: { default: '' },
      elements: { default: [] },
      width: { default: 100 },
      height: { default: 380 },
      alignment: { default: 'center' },
      background: { default: 'white' },
      direction: { default: 'rtl' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="report-drawing"]',
        getAttrs: (dom) => {
          const el = dom as HTMLElement;
          let elements: any[] = [];
          try {
            elements = JSON.parse(el.getAttribute('data-elements') || '[]');
            if (!Array.isArray(elements)) elements = [];
          } catch {}
          return {
            drawingId: el.getAttribute('data-drawing-id') || '',
            title: el.getAttribute('data-title') || '',
            caption: el.getAttribute('data-caption') || '',
            elements,
            width: Number(el.getAttribute('data-width')) || 100,
            height: Number(el.getAttribute('data-height')) || 380,
            alignment: (el.getAttribute('data-alignment') as any) || 'center',
            background: el.getAttribute('data-background') || 'white',
            direction: (el.getAttribute('data-direction') as any) || 'rtl',
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'report-drawing',
        'data-drawing-id': HTMLAttributes.drawingId,
        'data-title': HTMLAttributes.title || '',
        'data-caption': HTMLAttributes.caption || '',
        'data-elements': JSON.stringify(HTMLAttributes.elements || []),
        'data-width': HTMLAttributes.width || 100,
        'data-height': HTMLAttributes.height || 380,
        'data-alignment': HTMLAttributes.alignment || 'center',
        'data-background': HTMLAttributes.background || 'white',
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ReportDrawingView);
  },

  addCommands() {
    return {
      setReportDrawing:
        (options) =>
        ({ chain, state }) => {
          const attrs = { ...options };
          try {
            const sel: any = (state as any)?.selection;
            const $from = sel?.$from;
            if ($from) {
              let tableDepth = -1;
              for (let d = $from.depth; d > 0; d--) {
                try {
                  if ($from.node(d)?.type?.name === 'table') {
                    tableDepth = d;
                    break;
                  }
                } catch {}
              }
              if (tableDepth > 0) {
                let afterPos: number;
                try {
                  afterPos = $from.after(tableDepth);
                } catch {
                  afterPos = state.doc.content.size;
                }
                return (chain() as any).insertContentAt(afterPos, { type: this.name, attrs }).run();
              }
            }
          } catch {}
          return chain().insertContent({ type: this.name, attrs }).run();
        },
      updateReportDrawing:
        (drawingId, patch) =>
        ({ tr, state, dispatch }) => {
          let found = false;
          state.doc.descendants((node, pos) => {
            if (node.type.name === 'reportDrawing' && node.attrs.drawingId === drawingId) {
              found = true;
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...patch });
            }
          });
          if (found && dispatch) dispatch(tr);
          return found;
        },
      deleteReportDrawing:
        (drawingId) =>
        ({ tr, state, dispatch }) => {
          let found = false;
          state.doc.descendants((node, pos) => {
            if (!found && node.type.name === 'reportDrawing' && node.attrs.drawingId === drawingId) {
              found = true;
              tr.delete(pos, pos + node.nodeSize);
            }
          });
          if (found && dispatch) dispatch(tr);
          return found;
        },
    };
  },
});

export function newDrawingId(prefix = 'drw'): string {
  try {
    if (typeof crypto !== 'undefined' && (crypto as any).randomUUID) {
      return `${prefix}_${(crypto as any).randomUUID().slice(0, 8)}`;
    }
  } catch {}
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
