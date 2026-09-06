'use client';

import React from 'react';
import { NodeViewWrapper, NodeViewProps } from '@tiptap/react';
import { Lock, Image as ImageIcon } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { updateImageCaption } from '@/lib/db';

export function ReportImageView(props: NodeViewProps) {
  const { node, updateAttributes } = props;
  const { src, caption, sequenceNumber, fileName, reportId, imageId } = node.attrs;
  const { t } = useLanguage();

  const handleCaptionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newCaption = e.target.value;
    updateAttributes({ caption: newCaption });
    if (reportId && imageId) {
      updateImageCaption(reportId, imageId, newCaption).catch((err) => {
        console.error('Error updating caption in DB', err);
      });
    }
  };

  return (
    <NodeViewWrapper className="my-6 block not-prose">
      <div className="group relative mx-auto max-w-2xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-all hover:border-teal-300 hover:shadow-md">
        {/* Immutable Sequence Number Badge */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-3 py-1.5 text-xs text-slate-600">
          <div className="flex items-center gap-1.5 font-mono font-semibold text-slate-700">
            <ImageIcon className="h-3.5 w-3.5 text-teal-600" />
            <span>{fileName || `صورة-${sequenceNumber || 1}.png`}</span>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-slate-400" title="معرف داخلي تلقائي غير قابل للتعديل">
            <Lock className="h-3 w-3" />
            <span className="hidden sm:inline">ثابت تلقائي</span>
          </div>
        </div>

        {/* Image Display */}
        <div className="relative flex justify-center bg-slate-900/5 p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={caption || fileName || 'Report screenshot'}
            className="max-h-[480px] w-auto rounded object-contain"
            loading="lazy"
          />
        </div>

        {/* User-Editable Inline Caption */}
        <div className="border-t border-slate-100 bg-white p-2.5">
          <div className="relative">
            <input
              type="text"
              value={caption || ''}
              onChange={handleCaptionChange}
              onKeyDown={(e) => e.stopPropagation()} // Prevent TipTap cursor interception
              placeholder={t('imageCaptionPlaceholder')}
              className="w-full rounded-md border border-slate-200 bg-slate-50/50 px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 transition-colors focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-teal-500 italic"
            />
          </div>
        </div>
      </div>
    </NodeViewWrapper>
  );
}
