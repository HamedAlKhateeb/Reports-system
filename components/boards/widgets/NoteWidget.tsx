'use client';

import React from 'react';
import type { BoardWidget, NoteWidgetData } from '@/lib/boards-types';
import { getTextDirection } from './TaskWidget';
import { cn } from '@/lib/utils';

interface NoteWidgetProps {
  widget: BoardWidget;
  onChange: (data: Partial<NoteWidgetData>, title?: string) => void;
  lang?: 'ar' | 'en';
}

const colorPresets = [
  { id: 'yellow', bg: 'bg-amber-100 dark:bg-amber-950/70 border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-100', dot: 'bg-amber-400' },
  { id: 'blue', bg: 'bg-sky-100 dark:bg-sky-950/70 border-sky-300 dark:border-sky-800 text-sky-950 dark:text-sky-100', dot: 'bg-sky-400' },
  { id: 'green', bg: 'bg-emerald-100 dark:bg-emerald-950/70 border-emerald-300 dark:border-emerald-800 text-emerald-950 dark:text-emerald-100', dot: 'bg-emerald-400' },
  { id: 'pink', bg: 'bg-pink-100 dark:bg-pink-950/70 border-pink-300 dark:border-pink-800 text-pink-950 dark:text-pink-100', dot: 'bg-pink-400' },
  { id: 'purple', bg: 'bg-purple-100 dark:bg-purple-950/70 border-purple-300 dark:border-purple-800 text-purple-950 dark:text-purple-100', dot: 'bg-purple-400' },
  { id: 'gray', bg: 'bg-slate-100 dark:bg-slate-900 border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100', dot: 'bg-slate-400' },
];

export function NoteWidget({ widget, onChange, lang = 'ar' }: NoteWidgetProps) {
  const data = (widget.data || {}) as NoteWidgetData;
  const color = data.color || 'yellow';
  const isArabic = lang === 'ar';

  const activePreset = colorPresets.find((c) => c.id === color) || colorPresets[0];
  const titleDir = getTextDirection(widget.title, isArabic ? 'rtl' : 'ltr');
  const contentDir = getTextDirection(data.content, isArabic ? 'rtl' : 'ltr');

  return (
    <div className={cn('flex flex-col h-full w-full p-3 rounded-lg border shadow-sm transition-colors', activePreset.bg)}>
      {/* Note Header: Optional Title & Color Swatches */}
      <div className="flex items-center justify-between gap-2 mb-1">
        <input
          type="text"
          value={widget.title || ''}
          placeholder={isArabic ? 'عنوان الملاحظة...' : 'Note title...'}
          onChange={(e) => onChange({}, e.target.value)}
          onMouseDown={(e) => e.stopPropagation()}
          className={cn(
            'flex-1 font-semibold text-xs bg-transparent border-b border-transparent hover:border-black/20 dark:hover:border-white/20 focus:border-black/40 dark:focus:border-white/40 focus:outline-none px-1 py-0.5',
            titleDir === 'rtl' ? 'text-right text-arabic' : 'text-left'
          )}
          dir={titleDir}
          style={{ unicodeBidi: 'plaintext' }}
        />

        {/* Color swatches */}
        <div className="flex items-center gap-1 shrink-0" onMouseDown={(e) => e.stopPropagation()}>
          {colorPresets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => onChange({ color: preset.id })}
              className={cn(
                'w-3 h-3 rounded-full transition-transform hover:scale-125',
                preset.dot,
                color === preset.id && 'ring-2 ring-foreground ring-offset-1 scale-110'
              )}
              title={preset.id}
            />
          ))}
        </div>
      </div>

      {/* Note Body: Multiline text */}
      <textarea
        value={data.content || ''}
        placeholder={isArabic ? 'اكتب ملاحظتك هنا...' : 'Write your note here...'}
        onChange={(e) => onChange({ content: e.target.value })}
        onMouseDown={(e) => e.stopPropagation()}
        className={cn(
          'flex-1 w-full text-xs bg-transparent border-0 resize-none focus:outline-none leading-relaxed placeholder:opacity-60',
          contentDir === 'rtl' ? 'text-right text-arabic' : 'text-left'
        )}
        dir={contentDir}
        style={{ unicodeBidi: 'plaintext' }}
      />
    </div>
  );
}
