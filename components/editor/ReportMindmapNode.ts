import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { ReportMindmapView } from './ReportMindmapView';
import type { MindNode, MindEdge } from '@/lib/mindmap';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    reportMindmap: {
      setReportMindmap: (options: {
        mindmapId: string;
        title?: string;
        caption?: string;
        nodes?: MindNode[];
        edges?: MindEdge[];
        height?: number;
        width?: number;
        alignment?: 'center' | 'left' | 'right';
        background?: string;
      }) => ReturnType;
      updateReportMindmap: (mindmapId: string, patch: Record<string, any>) => ReturnType;
      deleteReportMindmap: (mindmapId: string) => ReturnType;
    };
  }
}

export const ReportMindmap = Node.create({
  name: 'reportMindmap',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      mindmapId: { default: '' },
      title: { default: '' },
      caption: { default: '' },
      nodes: { default: [] },
      edges: { default: [] },
      height: { default: 400 },
      width: { default: 100 },
      alignment: { default: 'center' },
      background: { default: 'default' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="report-mindmap"]',
        getAttrs: (dom) => {
          const el = dom as HTMLElement;
          let nodes: MindNode[] = [];
          let edges: MindEdge[] = [];
          try {
            nodes = JSON.parse(el.getAttribute('data-nodes') || '[]');
            if (!Array.isArray(nodes)) nodes = [];
          } catch {}
          try {
            edges = JSON.parse(el.getAttribute('data-edges') || '[]');
            if (!Array.isArray(edges)) edges = [];
          } catch {}
          return {
            mindmapId: el.getAttribute('data-mindmap-id') || '',
            title: el.getAttribute('data-title') || '',
            caption: el.getAttribute('data-caption') || '',
            nodes,
            edges,
            height: Number(el.getAttribute('data-height')) || 400,
            width: Number(el.getAttribute('data-width')) || 100,
            alignment: (el.getAttribute('data-alignment') as any) || 'center',
            background: el.getAttribute('data-background') || 'default',
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'report-mindmap',
        'data-mindmap-id': HTMLAttributes.mindmapId,
        'data-title': HTMLAttributes.title || '',
        'data-caption': HTMLAttributes.caption || '',
        'data-nodes': JSON.stringify(HTMLAttributes.nodes || []),
        'data-edges': JSON.stringify(HTMLAttributes.edges || []),
        'data-height': HTMLAttributes.height || 400,
        'data-width': HTMLAttributes.width || 100,
        'data-alignment': HTMLAttributes.alignment || 'center',
        'data-background': HTMLAttributes.background || 'default',
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ReportMindmapView);
  },

  addCommands() {
    return {
      setReportMindmap:
        (options) =>
        ({ chain, state }) => {
          const attrs = { ...options };
          // Same guard as charts/images: never insert a mind-map INSIDE a
          // table cell — insert AFTER the top-level table block instead.
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
                return (chain() as any)
                  .insertContentAt(afterPos, { type: this.name, attrs })
                  .run();
              }
            }
          } catch {}
          return chain()
            .insertContent({
              type: this.name,
              attrs,
            })
            .run();
        },
      updateReportMindmap:
        (mindmapId, patch) =>
        ({ tr, state, dispatch }) => {
          let found = false;
          state.doc.descendants((node, pos) => {
            if (node.type.name === 'reportMindmap' && node.attrs.mindmapId === mindmapId) {
              found = true;
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...patch });
            }
          });
          if (found && dispatch) dispatch(tr);
          return found;
        },
      deleteReportMindmap:
        (mindmapId) =>
        ({ tr, state, dispatch }) => {
          let found = false;
          state.doc.descendants((node, pos) => {
            if (!found && node.type.name === 'reportMindmap' && node.attrs.mindmapId === mindmapId) {
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
