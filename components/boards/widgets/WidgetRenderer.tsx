'use client';

import React, { useRef } from 'react';
import type { BoardWidget } from '@/lib/boards-types';
import { TaskWidget } from './TaskWidget';
import { NoteWidget } from './NoteWidget';
import { CommentWidget } from './CommentWidget';
import { MindmapWidget } from './MindmapWidget';
import { IssueWidget } from '@/components/tracking/IssueWidget';
import { TableWidget } from '@/components/tracking/TableWidget';
import { Copy, Trash2, GripHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WidgetRendererProps {
  widget: BoardWidget;
  isSelected: boolean;
  zoom: number;
  lang?: 'ar' | 'en';
  readOnly?: boolean;
  onSelect: (e: React.MouseEvent, widgetId: string) => void;
  onUpdate: (widgetId: string, data: any, title?: string) => void;
  onDuplicate: (widgetId: string) => void;
  onDelete: (widgetId: string) => void;
  onDragStart: (e: React.MouseEvent, widgetId: string) => void;
  onResizeStart: (e: React.MouseEvent, widgetId: string) => void;
}

export function WidgetRenderer({
  widget,
  isSelected,
  zoom,
  lang = 'ar',
  readOnly = false,
  onSelect,
  onUpdate,
  onDuplicate,
  onDelete,
  onDragStart,
  onResizeStart,
}: WidgetRendererProps) {
  const isArabic = lang === 'ar';

  const handleDataChange = (newData: any, newTitle?: string) => {
    onUpdate(widget.id, { ...widget.data, ...newData }, newTitle);
  };

  return (
    <div
      style={{
        transform: `translate(${widget.x}px, ${widget.y}px)`,
        width: `${widget.width}px`,
        height: `${widget.height}px`,
        position: 'absolute',
        top: 0,
        left: 0,
        minWidth: widget.type === 'mindmap' ? '400px' : undefined,
        minHeight: widget.type === 'mindmap' ? '300px' : undefined,
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(e, widget.id);
      }}
      className={cn(
        'group absolute rounded-xl bg-card border text-card-foreground shadow-md transition-shadow select-none flex flex-col',
        isSelected
          ? 'ring-2 ring-primary border-primary shadow-xl z-20'
          : 'border-border/70 hover:border-border hover:shadow-lg z-10'
      )}
    >
      {/* Drag handle bar at top */}
      <div
        onMouseDown={(e) => {
          if (readOnly) return;
          onSelect(e, widget.id);
          onDragStart(e, widget.id);
        }}
        className={cn(
          'h-5 px-2 flex items-center justify-between rounded-t-xl bg-muted/40 border-b border-border/20 transition-colors',
          !readOnly && 'cursor-grab active:cursor-grabbing',
          isSelected && !readOnly && 'bg-primary/10'
        )}
      >
        <div className="flex items-center gap-1 opacity-50 group-hover:opacity-100 transition-opacity">
          {!readOnly && <GripHorizontal className="w-3.5 h-3.5 text-muted-foreground" />}
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            {widget.type}
          </span>
        </div>

        {/* Selected actions */}
        {isSelected && !readOnly && (
          <div
            className="flex items-center gap-1"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => onDuplicate(widget.id)}
              title={isArabic ? 'تكرار (Ctrl+D)' : 'Duplicate (Ctrl+D)'}
              className="p-0.5 rounded hover:bg-background/80 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Copy className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(widget.id)}
              title={isArabic ? 'حذف (Del)' : 'Delete (Del)'}
              className="p-0.5 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden relative">
        {widget.type === 'task' && (
          <TaskWidget
            widget={widget}
            onChange={handleDataChange}
            lang={lang}
          />
        )}
        {widget.type === 'note' && (
          <NoteWidget
            widget={widget}
            onChange={handleDataChange}
            lang={lang}
          />
        )}
        {widget.type === 'comment' && (
          <CommentWidget
            widget={widget}
            onChange={handleDataChange}
            lang={lang}
          />
        )}
        {widget.type === 'mindmap' && (
          <MindmapWidget
            widget={widget}
            onUpdateWidget={(w) => onUpdate(widget.id, w.data, w.title)}
            lang={lang}
          />
        )}
        {(widget as any).type === 'issue' && <IssueWidget widget={widget} lang={lang} />}
        {(widget as any).type === 'table' && <TableWidget widget={widget} lang={lang} />}
      </div>

      {/* Resize Handle at bottom corner */}
      {isSelected && !readOnly && (
        <div
          onMouseDown={(e) => {
            e.stopPropagation();
            onResizeStart(e, widget.id);
          }}
          className="absolute -bottom-1.5 -end-1.5 w-4 h-4 rounded-full bg-primary border-2 border-background cursor-se-resize shadow transition-transform hover:scale-125 z-30"
          title={isArabic ? 'تغيير الحجم' : 'Resize'}
        />
      )}
    </div>
  );
}
