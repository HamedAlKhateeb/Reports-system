'use client';

import React, { useState, useEffect } from 'react';
import { GripVertical, ChevronUp, ChevronDown, RotateCcw, Check, ShieldAlert } from 'lucide-react';
import { SeverityConfigItem } from '@/lib/types';
import { DEFAULT_SEVERITY_CONFIG, getSeverityConfig, saveSeverityConfig } from '@/lib/db';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface SeverityConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  userUid?: string;
  onConfigSaved: (config: SeverityConfigItem[]) => void;
}

export function SeverityConfigModal({
  isOpen,
  onClose,
  userUid,
  onConfigSaved,
}: SeverityConfigModalProps) {
  const { lang, t } = useLanguage();
  const [items, setItems] = useState<SeverityConfigItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      const config = getSeverityConfig(userUid);
      setItems(config);
      setSavedSuccess(false);
    }
  }, [isOpen, userUid]);

  const moveItem = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= items.length) return;

    const newItems = [...items];
    const temp = newItems[index];
    newItems[index] = newItems[targetIdx];
    newItems[targetIdx] = temp;

    // Recalculate 1-based order
    const updated = newItems.map((item, idx) => ({
      ...item,
      order: idx + 1,
    }));
    setItems(updated);
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.setData('text/plain', String(index));
    setDraggedIdx(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === index) return;

    const newItems = [...items];
    const draggedItem = newItems[draggedIdx];
    newItems.splice(draggedIdx, 1);
    newItems.splice(index, 0, draggedItem);

    const updated = newItems.map((item, idx) => ({
      ...item,
      order: idx + 1,
    }));
    setItems(updated);
    setDraggedIdx(index);
  };

  const handleDragEnd = () => {
    setDraggedIdx(null);
  };

  const handleReset = () => {
    setItems([...DEFAULT_SEVERITY_CONFIG]);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await saveSeverityConfig(items, userUid);
      onConfigSaved(items);
      setSavedSuccess(true);
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err) {
      console.error('Failed to save severity config', err);
    } finally {
      setSaving(false);
    }
  };

  const getSeverityBadgeVariant = (
    id: string
  ): 'destructive' | 'warning' | 'secondary' | 'success' | 'outline' => {
    switch (id) {
      case 'critical':
        return 'destructive';
      case 'major':
      case 'medium':
        return 'warning';
      case 'minor':
        return 'success';
      case 'normal':
      default:
        return 'secondary';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg p-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
              <ShieldAlert className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground">
                {lang === 'ar' ? 'إدارة وترتيب درجات الخطورة' : 'Manage Severity Levels'}
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {lang === 'ar'
                  ? 'اسحب لتغيير ترتيب وأولويات الخطورة الرقمية (1 إلى 5)'
                  : 'Drag to reorder numerical severity priorities (1 to 5)'}
              </p>
            </div>
          </div>
        </DialogHeader>

        {/* Content */}
        <div className="p-6 space-y-3">
          <div className="text-xs text-muted-foreground bg-muted/40 p-3 rounded-lg border border-border/60">
            {lang === 'ar'
              ? 'الرقم 1 يمثل أعلى درجة خطورة وأولوية في الفرز، والرقم 5 يمثل أقل درجة خطورة.'
              : 'Rank #1 represents highest severity and priority in sorting; #5 represents lowest.'}
          </div>

          <div className="space-y-2 mt-3">
            {items.map((item, idx) => {
              const label = lang === 'ar' ? item.labelAr : item.labelEn;
              const isDragging = draggedIdx === idx;

              return (
                <div
                  key={item.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                    isDragging
                      ? 'border-primary bg-primary/10 opacity-50 ring-2 ring-primary/40'
                      : 'border-border bg-card hover:border-border/80 hover:shadow-2xs'
                  }`}
                >
                  {/* Left: Drag grip & Numeric Rank & Label */}
                  <div className="flex items-center gap-3">
                    <span
                      className="cursor-grab active:cursor-grabbing text-muted-foreground/60 hover:text-muted-foreground p-1 rounded hover:bg-muted"
                      title={lang === 'ar' ? 'اسحب للترتيب' : 'Drag to reorder'}
                    >
                      <GripVertical className="size-4" />
                    </span>

                    <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-mono font-bold text-foreground">
                      {idx + 1}
                    </span>

                    <Badge
                      variant={getSeverityBadgeVariant(item.id)}
                      className="gap-1.5 px-2.5 py-1 text-xs font-bold"
                    >
                      <span className="size-1.5 rounded-full bg-current" />
                      <span>{label}</span>
                      <span className="text-[10px] opacity-70 font-mono">({item.id})</span>
                    </Badge>
                  </div>

                  {/* Right: Up / Down arrow buttons */}
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={idx === 0}
                      onClick={() => moveItem(idx, 'up')}
                      className="size-7 text-muted-foreground hover:text-foreground disabled:opacity-30"
                      title={lang === 'ar' ? 'تحريك لأعلى' : 'Move up'}
                    >
                      <ChevronUp className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={idx === items.length - 1}
                      onClick={() => moveItem(idx, 'down')}
                      className="size-7 text-muted-foreground hover:text-foreground disabled:opacity-30"
                      title={lang === 'ar' ? 'تحريك لأسفل' : 'Move down'}
                    >
                      <ChevronDown className="size-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="flex items-center justify-between border-t border-border px-6 py-4 bg-muted/20 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="text-xs text-muted-foreground hover:text-foreground gap-1.5"
          >
            <RotateCcw data-icon="inline-start" />
            <span>{lang === 'ar' ? 'إعادة تعيين للافتراضي' : 'Reset to Default'}</span>
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="text-xs"
            >
              {lang === 'ar' ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="text-xs gap-1.5"
            >
              {savedSuccess ? (
                <>
                  <Check data-icon="inline-start" className="text-emerald-400" />
                  <span>{lang === 'ar' ? 'تم الحفظ!' : 'Saved!'}</span>
                </>
              ) : (
                <>
                  <Check data-icon="inline-start" />
                  <span>{lang === 'ar' ? 'حفظ الترتيب' : 'Save Order'}</span>
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
