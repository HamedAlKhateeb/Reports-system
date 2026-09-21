'use client';

import React from 'react';
import type { BoardWidget, CommentWidgetData } from '@/lib/boards-types';
import { getTextDirection } from './TaskWidget';
import { MessageSquare, User } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CommentWidgetProps {
  widget: BoardWidget;
  onChange: (data: Partial<CommentWidgetData>, title?: string) => void;
  lang?: 'ar' | 'en';
}

export function CommentWidget({ widget, onChange, lang = 'ar' }: CommentWidgetProps) {
  const data = (widget.data || {}) as CommentWidgetData;
  const isArabic = lang === 'ar';

  const authorDir = getTextDirection(data.author || widget.title, isArabic ? 'rtl' : 'ltr');
  const textDir = getTextDirection(data.text, isArabic ? 'rtl' : 'ltr');

  const formattedDate = data.createdAt
    ? new Date(data.createdAt).toLocaleDateString(isArabic ? 'ar-SA' : 'en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  return (
    <div className="flex flex-col h-full w-full p-3 gap-2 bg-card text-card-foreground select-text">
      {/* Header: Author & Timestamp */}
      <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-1.5">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <div className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <User className="w-3 h-3" />
          </div>
          <input
            type="text"
            value={data.author || widget.title || ''}
            placeholder={isArabic ? 'اسم المعلق...' : 'Author name...'}
            onChange={(e) => {
              onChange({ author: e.target.value }, e.target.value);
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className={cn(
              "flex-1 text-xs font-semibold bg-transparent border-0 focus:outline-none placeholder:text-muted-foreground/60",
              authorDir === 'rtl' ? 'text-right text-arabic' : 'text-left'
            )}
            dir={authorDir}
            style={{ unicodeBidi: 'plaintext' }}
          />
        </div>

        {formattedDate && (
          <span className="text-[10px] text-muted-foreground shrink-0">{formattedDate}</span>
        )}
      </div>

      {/* Comment Body */}
      <div className="flex-1 flex gap-2">
        <MessageSquare className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0 mt-1" />
        <textarea
          value={data.text || ''}
          placeholder={isArabic ? 'اكتب تعليقك هنا...' : 'Write comment here...'}
          onChange={(e) => onChange({ text: e.target.value })}
          onMouseDown={(e) => e.stopPropagation()}
          className={cn(
            "flex-1 w-full text-xs bg-transparent border-0 resize-none focus:outline-none leading-relaxed placeholder:text-muted-foreground/60",
            textDir === 'rtl' ? 'text-right text-arabic' : 'text-left'
          )}
          dir={textDir}
          style={{ unicodeBidi: 'plaintext' }}
        />
      </div>
    </div>
  );
}
