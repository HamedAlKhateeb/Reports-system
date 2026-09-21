'use client';

import React, { useState } from 'react';
import type { Board } from '@/lib/boards-types';
import { createBoardShareLink, revokeBoardShareLink } from '@/lib/boards-db';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Copy, ExternalLink, Globe, Loader2, Lock, Share2 } from 'lucide-react';
import { toast } from '@/components/ui/toast';

interface ShareBoardModalProps {
  isOpen: boolean;
  onClose: () => void;
  board: Board;
  onUpdateBoard: (updated: Board) => void;
  lang?: 'ar' | 'en';
}

export function ShareBoardModal({
  isOpen,
  onClose,
  board,
  onUpdateBoard,
  lang = 'ar',
}: ShareBoardModalProps) {
  const isAr = lang === 'ar';
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const isShared = !!board.isShared && !!board.shareToken;
  const shareUrl = typeof window !== 'undefined' && board.shareToken
    ? `${window.location.origin}/share/${board.shareToken}`
    : '';

  const handleToggleShare = async () => {
    setLoading(true);
    try {
      if (isShared) {
        await revokeBoardShareLink(board.id);
        onUpdateBoard({
          ...board,
          isShared: false,
          shareToken: null,
          sharedAt: null,
        });
        toast.success(isAr ? 'تم إيقاف مشاركة اللوحة' : 'Board sharing disabled');
      } else {
        const token = await createBoardShareLink(board.id);
        onUpdateBoard({
          ...board,
          isShared: true,
          shareToken: token,
          sharedAt: new Date().toISOString(),
        });
        toast.success(isAr ? 'تم تفعيل رابط المشاركة' : 'Board sharing enabled');
      }
    } catch (err) {
      console.error('Failed to toggle share:', err);
      toast.error(isAr ? 'حدث خطأ أثناء تحديث المشاركة' : 'Failed to update sharing');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success(isAr ? 'تم نسخ الرابط' : 'Link copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md" dir={isAr ? 'rtl' : 'ltr'}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <Share2 className="w-4 h-4 text-primary" />
            <span>{isAr ? 'مشاركة لوحة المهام' : 'Share Board'}</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {isAr
              ? 'يمكنك مشاركة هذه اللوحة برابط مباشر للقراءة أو العرض التفاعلي مثل التقارير تماماً.'
              : 'Share this board with a direct link for interactive view, just like reports.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Status badge */}
          <div className="flex items-center justify-between p-3 rounded-xl border bg-muted/40 text-xs">
            <div className="flex items-center gap-2">
              <Globe className={isShared ? 'w-4 h-4 text-emerald-500' : 'w-4 h-4 text-muted-foreground'} />
              <span className="font-semibold text-foreground">
                {isShared
                  ? isAr ? 'المشاركة مفعّلة حالياً' : 'Sharing is Active'
                  : isAr ? 'المشاركة متوقفة' : 'Sharing is Disabled'}
              </span>
            </div>
            <Badge variant={isShared ? 'default' : 'secondary'} className="text-[11px]">
              {isShared ? (isAr ? 'عام عبر الرابط' : 'Public Link') : (isAr ? 'خاص' : 'Private')}
            </Badge>
          </div>

          {/* Share Link Input */}
          {isShared && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                {isAr ? 'رابط المشاركة المباشر:' : 'Share Link:'}
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  readOnly
                  dir="ltr"
                  value={shareUrl}
                  className="w-full rounded-lg border border-border bg-muted/60 px-3 py-1.5 text-xs font-mono text-foreground outline-none select-all"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCopy}
                  className="h-8 px-2.5 shrink-0 gap-1 text-xs"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? (isAr ? 'تم' : 'Copied') : (isAr ? 'نسخ' : 'Copy')}</span>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  asChild
                  className="h-8 px-2 shrink-0"
                >
                  <a href={shareUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                  </a>
                </Button>
              </div>
            </div>
          )}

          {/* Toggle Button */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              className="text-xs h-8"
            >
              {isAr ? 'إغلاق' : 'Close'}
            </Button>
            <Button
              size="sm"
              onClick={handleToggleShare}
              disabled={loading}
              variant={isShared ? 'destructive' : 'default'}
              className="text-xs h-8 gap-1.5"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>
                {isShared
                  ? isAr ? 'إيقاف المشاركة' : 'Disable Sharing'
                  : isAr ? 'تفعيل رابط المشاركة' : 'Enable Share Link'}
              </span>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
