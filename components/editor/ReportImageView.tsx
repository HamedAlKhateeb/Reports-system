'use client';

import React, { useState } from 'react';
import { NodeViewWrapper, NodeViewProps } from '@tiptap/react';
import {
  Lock,
  Image as ImageIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Maximize2,
  Sliders,
} from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { updateImageCaption } from '@/lib/db';

const WIDTH_PRESETS = [
  { label: '25%', value: '25%' },
  { label: '50%', value: '50%' },
  { label: '75%', value: '75%' },
  { label: '100%', value: '100%' },
];

export function ReportImageView(props: NodeViewProps) {
  const { node, updateAttributes } = props;
  const {
    src,
    caption,
    sequenceNumber,
    fileName,
    reportId,
    imageId,
    width = '100%',
    alignment = 'center',
  } = node.attrs;
  const { t, lang } = useLanguage();
  const isAr = lang === 'ar';
  const [showCustomSlider, setShowCustomSlider] = useState(false);

  const handleCaptionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newCaption = e.target.value;
    updateAttributes({ caption: newCaption });
    if (reportId && imageId) {
      updateImageCaption(reportId, imageId, newCaption).catch((err) => {
        console.error('Error updating caption in DB', err);
      });
    }
  };

  const handleSetWidth = (newWidth: string) => {
    updateAttributes({ width: newWidth });
  };

  const handleSetAlignment = (newAlign: 'left' | 'center' | 'right') => {
    updateAttributes({ alignment: newAlign });
  };

  const alignmentClass =
    alignment === 'left'
      ? 'ms-0 me-auto'
      : alignment === 'right'
      ? 'ms-auto me-0'
      : 'mx-auto';

  return (
    <NodeViewWrapper className="my-6 block not-prose w-full max-w-full">
      <div
        style={{ width: width || '100%', maxWidth: '100%' }}
        className={`group relative ${alignmentClass} overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all hover:border-olive-500/50 hover:shadow-md`}
      >
        {/* Top Bar: Sequence Number & Interactive Dimension/Alignment Controls */}
        <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-border bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground max-w-full">
          {/* File Name & Sequence Badge */}
          <div className="flex items-center gap-1.5 font-mono font-semibold text-foreground truncate max-w-[180px] sm:max-w-xs">
            <ImageIcon className="h-3.5 w-3.5 text-olive-600 dark:text-olive-400 flex-shrink-0" />
            <span className="truncate">{fileName || `صورة-${sequenceNumber || 1}.png`}</span>
          </div>

          {/* Quick Controls: Presets (25%, 50%, 75%, 100%) and Alignment (L, C, R) */}
          <div className="flex flex-wrap items-center gap-1 max-w-full">
            {/* Width Presets */}
            <div className="flex items-center rounded-md border border-border/70 bg-background/80 p-0.5 shadow-2xs">
              {WIDTH_PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => handleSetWidth(p.value)}
                  className={`rounded px-1.5 py-0.5 text-[10px] font-bold transition-colors ${
                    width === p.value
                      ? 'bg-olive-600 text-white shadow-2xs'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                  title={`${isAr ? 'عرض' : 'Width'}: ${p.label}`}
                >
                  {p.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShowCustomSlider(!showCustomSlider)}
                className={`rounded p-1 text-[10px] transition-colors ${
                  showCustomSlider
                    ? 'bg-olive-100 text-olive-800 dark:bg-olive-950 dark:text-olive-200'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
                title={isAr ? 'شريط تحكم دقيق بالعرض' : 'Custom Width Slider'}
              >
                <Sliders className="h-2.5 w-2.5" />
              </button>
            </div>

            {/* Alignment Controls */}
            <div className="flex items-center rounded-md border border-border/70 bg-background/80 p-0.5 shadow-2xs">
              <button
                type="button"
                onClick={() => handleSetAlignment('right')}
                className={`rounded p-1 transition-colors ${
                  alignment === 'right'
                    ? 'bg-olive-600 text-white shadow-2xs'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
                title={isAr ? 'محاذاة لليمين' : 'Align Right'}
              >
                <AlignRight className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => handleSetAlignment('center')}
                className={`rounded p-1 transition-colors ${
                  alignment === 'center'
                    ? 'bg-olive-600 text-white shadow-2xs'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
                title={isAr ? 'محاذاة للوسط' : 'Align Center'}
              >
                <AlignCenter className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => handleSetAlignment('left')}
                className={`rounded p-1 transition-colors ${
                  alignment === 'left'
                    ? 'bg-olive-600 text-white shadow-2xs'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
                title={isAr ? 'محاذاة لليسار' : 'Align Left'}
              >
                <AlignLeft className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>

        {/* Optional Custom Width Slider */}
        {showCustomSlider && (
          <div className="flex items-center gap-3 border-b border-border bg-muted/20 px-3 py-1.5 text-[11px] text-muted-foreground">
            <span className="font-medium">{isAr ? 'التحكم الدقيق بالعرض:' : 'Fine Width:'}</span>
            <input
              type="range"
              min="20"
              max="100"
              step="5"
              value={parseInt(width, 10) || 100}
              onChange={(e) => handleSetWidth(`${e.target.value}%`)}
              className="flex-1 accent-olive-600 h-1.5 rounded-lg cursor-pointer bg-muted"
            />
            <span className="font-mono font-bold text-foreground w-10 text-end">{width}</span>
          </div>
        )}

        {/* Image Display */}
        <div className="relative flex justify-center bg-black/5 dark:bg-white/5 p-2 max-w-full overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={caption || fileName || 'Report screenshot'}
            style={{ maxWidth: '100%', height: 'auto' }}
            className="max-h-[520px] w-auto max-w-full rounded object-contain"
            loading="lazy"
          />
        </div>

        {/* User-Editable Inline Caption */}
        <div className="border-t border-border bg-card p-2.5">
          <div className="relative">
            <input
              type="text"
              value={caption || ''}
              onChange={handleCaptionChange}
              onKeyDown={(e) => e.stopPropagation()} // Prevent TipTap cursor interception
              placeholder={t('imageCaptionPlaceholder')}
              className="w-full rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground transition-colors focus:border-olive-600 focus:bg-card focus:outline-none focus:ring-1 focus:ring-olive-600 italic"
            />
          </div>
        </div>
      </div>
    </NodeViewWrapper>
  );
}
