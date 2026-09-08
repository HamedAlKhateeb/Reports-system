'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CandidateScanResult,
  CandidateIssue,
  approveCandidates,
} from '@/lib/issue-intelligence-engine';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { toast } from '@/components/ui/toast';
import {
  CheckCircle2,
  AlertTriangle,
  Copy,
  PlusCircle,
  HelpCircle,
  Layers,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface CandidateReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  scanResult: CandidateScanResult | null;
  onApprovalComplete: () => void;
  userUid?: string;
}

export function CandidateReviewModal({
  isOpen,
  onClose,
  scanResult,
  onApprovalComplete,
  userUid,
}: CandidateReviewModalProps) {
  const { lang } = useLanguage();
  const isAr = lang === 'ar';

  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>(() => {
    if (!scanResult) return [];
    // By default, select all new items and exact matches
    return scanResult.candidates.map((c) => c.tempId);
  });
  const [isApproving, setIsApproving] = useState(false);

  if (!scanResult) return null;

  const toggleSelect = (id: string) => {
    setSelectedCandidateIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    setSelectedCandidateIds(scanResult.candidates.map((c) => c.tempId));
  };

  const deselectAll = () => {
    setSelectedCandidateIds([]);
  };

  const handleApprove = async () => {
    if (selectedCandidateIds.length === 0) {
      toast.error(isAr ? 'يرجى تحديد مشكلة واحدة على الأقل للاعتماد' : 'Please select at least one issue');
      return;
    }

    try {
      setIsApproving(true);
      const res = await approveCandidates(
        selectedCandidateIds,
        scanResult.candidates,
        userUid
      );

      if (res.errors.length > 0) {
        toast.error(res.errors.join('\n'));
      } else {
        toast.success(
          isAr
            ? `تم اعتماد ${res.approved.length} مشكلة جديدة وربط ${res.linked.length} علاقة بنجاح!`
            : `Approved ${res.approved.length} new issues and linked ${res.linked.length} successfully!`
        );
      }
      onApprovalComplete();
      onClose();
    } catch (err: any) {
      toast.error(isAr ? 'حدث خطأ أثناء الاعتماد' : 'Error approving candidates', {
        description: err?.message,
      });
    } finally {
      setIsApproving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        dir={isAr ? 'rtl' : 'ltr'}
        className="max-w-3xl max-h-[85vh] flex flex-col p-6 rounded-2xl bg-card text-card-foreground shadow-2xl border border-border"
      >
        <DialogHeader className="space-y-1.5 pb-3 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-olive-100 dark:bg-olive-950 text-olive-800 dark:text-olive-300">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold">
                {isAr ? 'مراجعة واعتماد المرشحين المستخرجين' : 'Review & Approve Extracted Candidates'}
              </DialogTitle>
              <p className="text-xs text-muted-foreground">
                {isAr
                  ? 'تم فحص التقرير واكتشاف المرشحين ومطابقتهم لمنع أي تكرار قبل حفظهم في قاعدة البيانات.'
                  : 'Report scanned. Review candidate classification before persisting.'}
              </p>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-xs font-semibold">
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 p-2.5 flex items-center justify-between">
              <span className="text-emerald-800 dark:text-emerald-300">
                {isAr ? 'مشاكل جديدة' : 'New Issues'}
              </span>
              <Badge className="bg-emerald-600 text-white text-xs">{scanResult.newCount}</Badge>
            </div>

            <div className="rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 p-2.5 flex items-center justify-between">
              <span className="text-blue-800 dark:text-blue-300">
                {isAr ? 'مطابقات تامة' : 'Exact Matches'}
              </span>
              <Badge className="bg-blue-600 text-white text-xs">{scanResult.exactMatchesCount}</Badge>
            </div>

            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 p-2.5 flex items-center justify-between">
              <span className="text-amber-800 dark:text-amber-300">
                {isAr ? 'تكرار محتمل' : 'Duplicates'}
              </span>
              <Badge className="bg-amber-600 text-white text-xs">{scanResult.potentialDuplicatesCount}</Badge>
            </div>

            <div className="rounded-lg bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/60 p-2.5 flex items-center justify-between">
              <span className="text-purple-800 dark:text-purple-300">
                {isAr ? 'تحتاج تدقيق' : 'Needs Review'}
              </span>
              <Badge className="bg-purple-600 text-white text-xs">{scanResult.needsReviewCount}</Badge>
            </div>
          </div>
        </DialogHeader>

        {/* Action controls */}
        <div className="flex items-center justify-between py-2 text-xs border-b border-border/60">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={selectAll}
              className="text-xs text-olive-700 dark:text-olive-400 font-semibold hover:underline"
            >
              {isAr ? 'تحديد الكل' : 'Select All'}
            </button>
            <span className="text-muted-foreground">|</span>
            <button
              type="button"
              onClick={deselectAll}
              className="text-xs text-muted-foreground hover:underline"
            >
              {isAr ? 'إلغاء تحديد الكل' : 'Deselect All'}
            </button>
          </div>
          <span className="text-xs text-muted-foreground">
            {isAr
              ? `تم اختيار ${selectedCandidateIds.length} من ${scanResult.candidates.length}`
              : `Selected ${selectedCandidateIds.length} of ${scanResult.candidates.length}`}
          </span>
        </div>

        {/* Candidates List */}
        <div className="flex-1 overflow-y-auto space-y-3 py-2 pr-1">
          {scanResult.candidates.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              {isAr ? 'لم يتم العثور على أي مشاكل مرشحة في التقرير.' : 'No candidate issues detected.'}
            </div>
          ) : (
            scanResult.candidates.map((cand) => {
              const isSelected = selectedCandidateIds.includes(cand.tempId);
              return (
                <div
                  key={cand.tempId}
                  onClick={() => toggleSelect(cand.tempId)}
                  className={cn(
                    'flex flex-col gap-2 p-3.5 rounded-xl border transition-all cursor-pointer text-xs',
                    isSelected
                      ? 'border-olive-600 bg-olive-50/40 dark:bg-olive-950/20 shadow-2xs'
                      : 'border-border bg-background hover:border-border/80'
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 flex-1">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(cand.tempId)}
                        className="mt-0.5 h-4 w-4 rounded accent-[#2E4034] cursor-pointer"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div>
                        <div className="font-bold text-foreground text-sm flex items-center gap-2">
                          <span>{cand.title}</span>
                          <span className="text-[11px] font-medium text-muted-foreground">
                            ({cand.category})
                          </span>
                        </div>
                        {cand.description && (
                          <p className="text-muted-foreground text-xs mt-1 line-clamp-2">
                            {cand.description}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Status Badge */}
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {cand.matchType === 'new' && (
                        <Badge className="bg-emerald-600 text-white text-[11px] gap-1">
                          <PlusCircle className="h-3 w-3" />
                          <span>{isAr ? 'جديدة' : 'New'}</span>
                        </Badge>
                      )}
                      {cand.matchType === 'exact_match' && (
                        <Badge className="bg-blue-600 text-white text-[11px] gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          <span>{isAr ? `تطابق تام (${cand.matchedIssueKey || 'موجودة'})` : 'Exact Match'}</span>
                        </Badge>
                      )}
                      {cand.matchType === 'potential_duplicate' && (
                        <Badge className="bg-amber-600 text-white text-[11px] gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          <span>{isAr ? 'تكرار محتمل' : 'Duplicate'}</span>
                        </Badge>
                      )}
                      {cand.matchType === 'needs_review' && (
                        <Badge className="bg-purple-600 text-white text-[11px] gap-1">
                          <HelpCircle className="h-3 w-3" />
                          <span>{isAr ? 'مراجعة' : 'Review'}</span>
                        </Badge>
                      )}
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {cand.severity}
                      </span>
                    </div>
                  </div>

                  {/* Review reason / duplicate explanation banner */}
                  {cand.reviewReason && (
                    <div className="rounded-md bg-muted/60 p-2 text-[11px] text-muted-foreground flex items-center gap-1.5 mt-1 border border-border/40">
                      <Layers className="h-3.5 w-3.5 text-olive-600 shrink-0" />
                      <span>{cand.reviewReason}</span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <DialogFooter className="pt-3 border-t border-border flex flex-row items-center justify-between gap-3">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={isApproving}>
            {isAr ? 'إلغاء' : 'Cancel'}
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={handleApprove}
            disabled={isApproving || selectedCandidateIds.length === 0}
            className="bg-[#2E4034] text-white hover:bg-[#24382F] gap-1.5"
          >
            <CheckCircle2 className="h-4 w-4" />
            <span>
              {isApproving
                ? isAr ? 'جاري الاعتماد...' : 'Approving...'
                : isAr
                ? `اعتماد المختار (${selectedCandidateIds.length})`
                : `Approve Selected (${selectedCandidateIds.length})`}
            </span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
