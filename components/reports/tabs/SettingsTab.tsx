'use client';

import React from 'react';
import { ReportItem, CustomFieldItem } from '@/lib/types';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { AppLanguage } from '@/lib/i18n/dictionary';
import {
  Settings,
  Palette,
  Globe,
  PenTool,
  BookmarkPlus,
  FileCode,
  FileText,
  FileDown,
  Share2,
  Tag,
  Plus,
  Trash2,
  Award,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

interface SettingsTabProps {
  report: ReportItem;
  reportLanguage: AppLanguage;
  themeColor: string;
  backgroundColor: string;
  signatureData: string;
  signatureType: 'text' | 'draw' | 'image';
  customFields: CustomFieldItem[];
  customFooterFields: CustomFieldItem[];
  exporting: string | null;
  onLanguageChange: (lang: AppLanguage) => void;
  onThemeChange: (color: string) => void;
  onBackgroundChange: (bg: string) => void;
  onSignatureChange: (data: string) => void;
  onExport: (format: 'md' | 'docx' | 'pdf') => void;
  onSaveTemplate: () => void;
  onOpenShareModal: () => void;
  onAddCustomField: () => void;
  onRemoveCustomField: (id: string) => void;
  onUpdateCustomField: (id: string, field: 'label' | 'value', val: string) => void;
  onAddCustomFooterField: () => void;
  onRemoveCustomFooterField: (id: string) => void;
  onUpdateCustomFooterField: (id: string, field: 'label' | 'value', val: string) => void;
}

export function SettingsTab({
  report,
  reportLanguage,
  themeColor,
  backgroundColor,
  signatureData,
  signatureType,
  customFields,
  customFooterFields,
  exporting,
  onLanguageChange,
  onThemeChange,
  onBackgroundChange,
  onSignatureChange,
  onExport,
  onSaveTemplate,
  onOpenShareModal,
  onAddCustomField,
  onRemoveCustomField,
  onUpdateCustomField,
  onAddCustomFooterField,
  onRemoveCustomFooterField,
  onUpdateCustomFooterField,
}: SettingsTabProps) {
  const { lang, t } = useLanguage();
  const isAr = lang === 'ar';

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* 1. Language & Direction Settings */}
      <Card className="border-border/80 bg-card shadow-2xs">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Globe className="h-4 w-4 text-olive-600" />
            <span>{isAr ? 'لغة واتجاه محتوى التقرير' : 'Content Language & Direction'}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-2 space-y-3 text-xs">
          <p className="text-muted-foreground">
            {isAr
              ? 'تحدد لغة التقرير اتجاه قراءة النصوص والجداول (RTL/LTR) والخطوط والتصدير.'
              : 'Select document direction and typography for reading and export.'}
          </p>
          <div className="flex rounded-lg border border-border bg-muted/40 p-1 max-w-xs shadow-2xs">
            <button
              type="button"
              onClick={() => onLanguageChange('ar')}
              className={cn(
                'flex-1 rounded-md py-1.5 text-xs font-bold transition-all text-center',
                reportLanguage === 'ar'
                  ? 'bg-[#2E4034] text-white shadow-2xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              العربية (RTL)
            </button>
            <button
              type="button"
              onClick={() => onLanguageChange('en')}
              className={cn(
                'flex-1 rounded-md py-1.5 text-xs font-bold transition-all text-center',
                reportLanguage === 'en'
                  ? 'bg-[#2E4034] text-white shadow-2xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              English (LTR)
            </button>
          </div>
        </CardContent>
      </Card>

      {/* 2. Theme & Visual Style Settings */}
      <Card className="border-border/80 bg-card shadow-2xs">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Palette className="h-4 w-4 text-olive-600" />
            <span>{isAr ? 'المظهر والسمة اللونية' : 'Theme & Color Palette'}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-2 space-y-4 text-xs">
          <div className="space-y-2">
            <span className="font-semibold text-foreground">{isAr ? 'لون السمة الأساسي:' : 'Accent Color:'}</span>
            <div className="flex flex-wrap items-center gap-2.5">
              {[
                { id: 'olive', label: isAr ? 'زيتوني تحريري' : 'Editorial Olive', bg: '#2E4034' },
                { id: 'blue', label: isAr ? 'أزرق ملكي' : 'Royal Blue', bg: '#1E3A8A' },
                { id: 'slate', label: isAr ? 'رمادي رسمي' : 'Formal Slate', bg: '#334155' },
                { id: 'emerald', label: isAr ? 'زمردي' : 'Emerald', bg: '#065F46' },
                { id: 'amber', label: isAr ? 'عنبري دافئ' : 'Warm Amber', bg: '#92400E' },
              ].map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onThemeChange(c.id)}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all',
                    themeColor === c.id
                      ? 'border-[#2E4034] ring-2 ring-olive-400 bg-olive-50 dark:bg-olive-950/40 text-foreground'
                      : 'border-border bg-background text-muted-foreground hover:text-foreground'
                  )}
                >
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: c.bg }} />
                  <span>{c.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <span className="font-semibold text-foreground">{isAr ? 'نمط خلفية المستند:' : 'Document Background:'}</span>
            <div className="flex rounded-lg border border-border bg-muted/40 p-1 max-w-sm shadow-2xs">
              {[
                { id: 'white', label: isAr ? 'أبيض ناصع' : 'White' },
                { id: 'cream', label: isAr ? 'ورقي كريمي' : 'Cream' },
                { id: 'cool', label: isAr ? 'رمادي بارد' : 'Cool Slate' },
              ].map((bg) => (
                <button
                  key={bg.id}
                  type="button"
                  onClick={() => onBackgroundChange(bg.id)}
                  className={cn(
                    'flex-1 rounded-md py-1 text-xs font-medium transition-all text-center',
                    backgroundColor === bg.id
                      ? 'bg-background text-foreground font-bold shadow-2xs'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {bg.label}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3. Sign-off & Signature Settings */}
      <Card className="border-border/80 bg-card shadow-2xs">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <PenTool className="h-4 w-4 text-olive-600" />
            <span>{isAr ? 'التوقيع والاعتماد النهائي' : 'Sign-off & Signature'}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-2 space-y-3 text-xs">
          <div className="space-y-1.5">
            <label className="text-muted-foreground font-semibold">
              {isAr ? 'نص التوقيع أو الاعتماد:' : 'Signature Text / Approval Name:'}
            </label>
            <input
              type="text"
              value={signatureData}
              onChange={(e) => onSignatureChange(e.target.value)}
              placeholder={isAr ? 'مثال: اعتمد بواسطة رئيس الفريق: حامد الخطيب' : 'e.g. Approved by Lead Auditor'}
              className="w-full h-9 px-3 rounded-lg border border-border bg-background text-xs text-foreground focus:outline-none focus:border-olive-600"
            />
          </div>
        </CardContent>
      </Card>

      {/* 4. Export & Sharing Center */}
      <Card className="border-border/80 bg-card shadow-2xs">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm font-bold flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileDown className="h-4 w-4 text-olive-600" />
              <span>{isAr ? 'مركز التصدير والمشاركة' : 'Export & Share Center'}</span>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-2 space-y-3 text-xs">
          <p className="text-muted-foreground">
            {isAr
              ? 'تصدير التقرير بجميع بياناته وجداوله وصوره وفق أعلى معايير التنسيق المهني.'
              : 'Export document with full RTL/LTR fidelity, tables, and images.'}
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!!exporting}
              onClick={() => onExport('pdf')}
              className="h-10 gap-2 font-bold bg-[#2E4034] text-white hover:bg-[#24382F]"
            >
              <FileDown className="h-4 w-4" />
              <span>{exporting === 'pdf' ? (isAr ? 'جاري التصدير...' : 'Exporting...') : 'PDF (طباعة عالية الدقة)'}</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!!exporting}
              onClick={() => onExport('docx')}
              className="h-10 gap-2 font-bold text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-900"
            >
              <FileText className="h-4 w-4 text-blue-600" />
              <span>{exporting === 'docx' ? '...' : 'Word (DOCX)'}</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!!exporting}
              onClick={() => onExport('md')}
              className="h-10 gap-2 font-bold text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-900"
            >
              <FileCode className="h-4 w-4 text-indigo-600" />
              <span>Markdown (ZIP)</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onOpenShareModal}
              className="h-10 gap-2 font-bold text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-900"
            >
              <Share2 className="h-4 w-4 text-teal-600" />
              <span>{isAr ? 'مشاركة ويب' : 'Share Web'}</span>
            </Button>
          </div>

          <div className="pt-3 border-t border-border/60">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onSaveTemplate}
              className="gap-2 font-bold text-olive-800 dark:text-olive-300 border-olive-300 dark:border-olive-800"
            >
              <BookmarkPlus className="h-4 w-4 text-olive-600" />
              <span>{isAr ? 'حفظ هذا التقرير كقالب دائم للنظام' : 'Save as Custom Template'}</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
