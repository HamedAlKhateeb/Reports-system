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
        src: string;
        storagePath?: string;
        sequenceNumber: number;
        fileName: string;
        caption?: string;
        reportId: string;
        imageId?: string;
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
      storagePath: {
        default: '',
      },
      sequenceNumber: {
        default: 1,
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
    };
  },

  parseHTML() {
    return [
      {
        tag: 'figure[data-type="report-image"]',
        getAttrs: (dom) => {
          const el = dom as HTMLElement;
          return {
            src: el.getAttribute('data-src'),
            storagePath: el.getAttribute('data-storage-path') || '',
            sequenceNumber: Number(el.getAttribute('data-sequence-number')) || 1,
            fileName: el.getAttribute('data-file-name') || '',
            caption: el.getAttribute('data-caption') || '',
            reportId: el.getAttribute('data-report-id') || '',
            imageId: el.getAttribute('data-image-id') || '',
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'figure',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-type': 'report-image',
        'data-src': HTMLAttributes.src,
        'data-storage-path': HTMLAttributes.storagePath,
        'data-sequence-number': HTMLAttributes.sequenceNumber,
        'data-file-name': HTMLAttributes.fileName,
        'data-caption': HTMLAttributes.caption,
        'data-report-id': HTMLAttributes.reportId,
        'data-image-id': HTMLAttributes.imageId,
      }),
      ['img', { src: HTMLAttributes.src, alt: HTMLAttributes.caption || HTMLAttributes.fileName }],
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
