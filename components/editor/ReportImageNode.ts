import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { ReportImageView } from './ReportImageView';

export interface ReportImageOptions {
  HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    reportImage: {
      setReportImage: (options: {
        src?: string;
        url?: string;
        storagePath?: string;
        sequenceNumber?: number;
        index?: number;
        fileName?: string;
        caption?: string;
        reportId: string;
        imageId?: string;
        width?: string;
        zoom?: string;
        naturalWidth?: number;
        naturalHeight?: number;
        alignment?: 'center' | 'left' | 'right';
      }) => ReturnType;
    };
  }
}

export const ReportImage = Node.create<ReportImageOptions>({
  name: 'reportImage',
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
      src: {
        default: null,
      },
      url: {
        default: null,
      },
      storagePath: {
        default: '',
      },
      sequenceNumber: {
        default: 1,
      },
      index: {
        default: 0,
      },
      fileName: {
        default: '',
      },
      caption: {
        default: '',
      },
      reportId: {
        default: '',
      },
      imageId: {
        default: '',
      },
      width: {
        default: '100%',
      },
      zoom: {
        default: '100%',
      },
      naturalWidth: {
        default: null,
      },
      naturalHeight: {
        default: null,
      },
      alignment: {
        default: 'center',
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'figure[data-type="report-image"]',
        getAttrs: (dom) => {
          const el = dom as HTMLElement;
          const src = el.getAttribute('data-src') || el.getAttribute('data-url');
          return {
            src,
            url: src,
            storagePath: el.getAttribute('data-storage-path') || '',
            sequenceNumber: Number(el.getAttribute('data-sequence-number')) || 1,
            index: Number(el.getAttribute('data-index')) || 0,
            fileName: el.getAttribute('data-file-name') || '',
            caption: el.getAttribute('data-caption') || '',
            reportId: el.getAttribute('data-report-id') || '',
            imageId: el.getAttribute('data-image-id') || '',
            width: el.getAttribute('data-width') || '100%',
            zoom: el.getAttribute('data-zoom') || el.getAttribute('data-width') || '100%',
            naturalWidth: el.getAttribute('data-natural-width') ? Number(el.getAttribute('data-natural-width')) : null,
            naturalHeight: el.getAttribute('data-natural-height') ? Number(el.getAttribute('data-natural-height')) : null,
            alignment: (el.getAttribute('data-alignment') as any) || 'center',
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const effectiveSrc = HTMLAttributes.url || HTMLAttributes.src;
    return [
      'figure',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-type': 'report-image',
        'data-src': effectiveSrc,
        'data-url': effectiveSrc,
        'data-storage-path': HTMLAttributes.storagePath,
        'data-sequence-number': HTMLAttributes.sequenceNumber,
        'data-index': HTMLAttributes.index ?? HTMLAttributes.sequenceNumber ?? 0,
        'data-file-name': HTMLAttributes.fileName,
        'data-caption': HTMLAttributes.caption,
        'data-report-id': HTMLAttributes.reportId,
        'data-image-id': HTMLAttributes.imageId,
        'data-width': HTMLAttributes.width || '100%',
        'data-zoom': HTMLAttributes.zoom || HTMLAttributes.width || '100%',
        'data-natural-width': HTMLAttributes.naturalWidth || '',
        'data-natural-height': HTMLAttributes.naturalHeight || '',
        'data-alignment': HTMLAttributes.alignment || 'center',
      }),
      ['img', { src: effectiveSrc, alt: HTMLAttributes.caption || HTMLAttributes.fileName, style: `width: ${HTMLAttributes.width || '100%'};` }],
      ['figcaption', {}, HTMLAttributes.caption || ''],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ReportImageView);
  },

  addCommands() {
    return {
      setReportImage:
        (attrs) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs,
          });
        },
    };
  },
});
