'use client';

import React, { useState, useEffect } from 'react';
import {
  Keyboard,
  RotateCcw,
  Check,
  AlertTriangle,
  Edit2,
  Table as TableIcon,
  Navigation,
  FileText,
  Info,
} from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import {
  ShortcutItem,
  getCustomShortcuts,
  saveCustomShortcut,
  resetShortcutsToDefault,
  normalizeKeyboardEvent,
  formatKeyDisplay,
} from '@/lib/shortcuts';

export function KeyboardShortcutsSettings() {
  const { lang, isRtl } = useLanguage();
  const [shortcuts, setShortcuts] = useState<ShortcutItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<'all' | 'editor' | 'table' | 'navigation'>('all');
  const [editingItem, setEditingItem] = useState<ShortcutItem | null>(null);
  const [recordedKey, setRecordedKey] = useState<string>('');
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setShortcuts(getCustomShortcuts());
  }, []);

  const showNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 2500);
  };

  const handleStartEditing = (item: ShortcutItem) => {
    if (item.isProtected) return;
    setEditingItem(item);
    setRecordedKey(item.currentKey);
    setConflictWarning(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!editingItem) return;
    e.preventDefault();
    e.stopPropagation();

    // Escape cancels
    if (e.key === 'Escape') {
      setEditingItem(null);
      return;
    }

    const combo = normalizeKeyboardEvent(e);
    if (!combo) return;

    setRecordedKey(combo);

    // Conflict detection
    const existing = shortcuts.find(
      (s) => s.id !== editingItem.id && s.currentKey.toLowerCase() === combo.toLowerCase()
    );
    if (existing) {
      const conflictName = lang === 'ar' ? existing.titleAr : existing.titleEn;
      setConflictWarning(
        lang === 'ar'
          ? `تنبيه: هذا الاختصار مستخدم حالياً لإجراء "${conflictName}". يمكنك تعيينه وسيتم استبداله.`
          : `Warning: This shortcut is currently used by "${conflictName}".`
      );
    } else {
      setConflictWarning(null);
    }
  };

  const handleSaveRebind = () => {
    if (!editingItem || !recordedKey) return;
    const updated = saveCustomShortcut(editingItem.id, recordedKey);
    setShortcuts(updated);
    setEditingItem(null);
    showNotice(lang === 'ar' ? 'تم تحديث الاختصار بنجاح' : 'Shortcut updated successfully');
  };

  const handleResetDefaults = () => {
    const defaults = resetShortcutsToDefault();
    setShortcuts(defaults);
    showNotice(lang === 'ar' ? 'تمت استعادة الاختصارات الافتراضية' : 'Shortcuts reset to defaults');
  };

  const filteredShortcuts = shortcuts.filter((s) => {
    if (activeCategory === 'all') return true;
    return s.category === activeCategory;
  });

  return (
    <div className="rounded-xl border border-[#E7E6E2] dark:border-[#2B2B29] bg-white dark:bg-[#20201F] p-6 shadow-none">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-olive-50 dark:bg-[#26342B] text-olive-700 dark:text-olive-300">
          <Keyboard className="h-5 w-5" />
        </div>

        <div className="flex-1">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-[#202020] dark:text-[#F2F2EE] flex items-center gap-2">
                <span>{lang === 'ar' ? 'اختصارات لوحة المفاتيح' : 'Keyboard Shortcuts'}</span>
                {notice && (
                  <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold animate-fade-in flex items-center gap-1">
                    <Check className="h-3.5 w-3.5" />
                    <span>{notice}</span>
                  </span>
                )}
              </h2>
              <p className="mt-1 text-sm text-[#6B6964] dark:text-[#9E9C96]">
                {lang === 'ar'
                  ? 'عرض وتخصيص اختصارات المحرر والتنقل وتوثيق سلوك الجداول التلقائي.'
                  : 'View and customize shortcuts for editor, tables, and navigation.'}
              </p>
            </div>

            <button
              type="button"
              onClick={handleResetDefaults}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 hover:bg-muted/60 px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground self-start transition-colors"
              title={lang === 'ar' ? 'استعادة الاختصارات الافتراضية' : 'Reset to Default Shortcuts'}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>{lang === 'ar' ? 'استعادة الافتراضيات' : 'Reset Defaults'}</span>
            </button>
          </div>

          {/* Behavior Documentation Banner */}
          <div className="mt-4 rounded-xl border border-blue-200/80 bg-blue-50/60 dark:border-blue-900/60 dark:bg-blue-950/30 p-3.5 flex items-start gap-2.5 text-xs text-blue-900 dark:text-blue-200 leading-relaxed">
            <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">
                {lang === 'ar' ? 'توثيق سلوك الجداول التلقائي: ' : 'Documented Table Behavior: '}
              </span>
              <span>
                {lang === 'ar'
                  ? 'مفتاح Tab يتنقل بين خلايا الجدول؛ وعند الضغط عليه داخل آخر خلية بآخر صف يتم تلقائياً إنشاء صف جديد دون الحاجة للنقر بالفأرة.'
                  : 'Tab navigates between cells. Pressing Tab in the last cell of the table automatically creates a new row.'}
              </span>
            </div>
          </div>

          {/* Category Filter Tabs */}
          <div className="mt-4 flex flex-wrap gap-1.5 border-b border-border/60 pb-3">
            {[
              { id: 'all', labelAr: 'جميع الاختصارات', labelEn: 'All Shortcuts', icon: Keyboard },
              { id: 'editor', labelAr: 'محرر النصوص والتنسيق', labelEn: 'Editor & Formatting', icon: FileText },
              { id: 'table', labelAr: 'الجداول والخلايا', labelEn: 'Tables', icon: TableIcon },
              { id: 'navigation', labelAr: 'التنقل والحفظ', labelEn: 'Navigation & Save', icon: Navigation },
            ].map((cat) => {
              const Icon = cat.icon;
              const isActive = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategory(cat.id as any)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-[#2E4034] text-white shadow-2xs'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{lang === 'ar' ? cat.labelAr : cat.labelEn}</span>
                </button>
              );
            })}
          </div>

          {/* Shortcuts Table / List */}
          <div className="mt-4 divide-y divide-border/60 border border-border/70 rounded-xl overflow-hidden bg-[#FAFAF8] dark:bg-[#161615]">
            {filteredShortcuts.map((item) => {
              return (
                <div
                  key={item.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:px-4 gap-2 hover:bg-card/70 transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-foreground">
                        {lang === 'ar' ? item.titleAr : item.titleEn}
                      </span>
                      {item.isCustom && (
                        <span className="rounded-full bg-olive-100 dark:bg-olive-950 text-olive-800 dark:text-olive-300 text-[10px] font-bold px-2 py-0.2">
                          {lang === 'ar' ? 'مخصص' : 'Custom'}
                        </span>
                      )}
                      {item.isProtected && (
                        <span className="rounded-full bg-muted text-muted-foreground text-[10px] font-medium px-2 py-0.2">
                          {lang === 'ar' ? 'نظام مدمج' : 'Built-in'}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {lang === 'ar' ? item.descriptionAr : item.descriptionEn}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <kbd className="inline-flex items-center px-2.5 py-1 rounded-md border border-border/80 bg-card text-foreground font-mono text-xs font-bold shadow-2xs">
                      {formatKeyDisplay(item.currentKey)}
                    </kbd>

                    {!item.isProtected ? (
                      <button
                        type="button"
                        onClick={() => handleStartEditing(item)}
                        className="rounded-lg border border-border/70 p-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        title={lang === 'ar' ? 'تعديل الاختصار (Rebind)' : 'Rebind shortcut'}
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      <div className="w-7" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Interactive Key Recording Modal / Rebinding Dialog */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div
            dir={isRtl ? 'rtl' : 'ltr'}
            className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4"
          >
            <div>
              <h3 className="text-base font-bold text-foreground">
                {lang === 'ar' ? 'تعديل الاختصار' : 'Rebind Keyboard Shortcut'}
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                {lang === 'ar'
                  ? `قم بالضغط على توليفة المفاتيح التي ترغب بتعيينها لإجراء "${editingItem.titleAr}".`
                  : `Press the key combination you wish to assign to "${editingItem.titleEn}".`}
              </p>
            </div>

            {/* Key capture input */}
            <div
              tabIndex={0}
              onKeyDown={handleKeyDown}
              className="rounded-xl border-2 border-dashed border-olive-500 bg-olive-50/40 dark:bg-olive-950/30 p-6 text-center focus:outline-none focus:ring-2 focus:ring-olive-600 transition-all cursor-pointer"
            >
              <div className="text-xs text-muted-foreground mb-2">
                {lang === 'ar' ? 'المفاتيح الملتقطة:' : 'Captured Keys:'}
              </div>
              <div className="font-mono text-lg font-bold text-olive-800 dark:text-olive-200">
                {recordedKey ? formatKeyDisplay(recordedKey) : lang === 'ar' ? 'اضغط المفاتيح الآن...' : 'Press keys now...'}
              </div>
            </div>

            {conflictWarning && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 p-2.5 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5 text-amber-600" />
                <span>{conflictWarning}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="rounded-lg px-3.5 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted transition-colors"
              >
                {lang === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleSaveRebind}
                disabled={!recordedKey}
                className="rounded-lg bg-[#2E4034] hover:bg-[#24382F] text-white px-4 py-2 text-xs font-semibold shadow-xs transition-colors disabled:opacity-50"
              >
                {lang === 'ar' ? 'حفظ الاختصار' : 'Save Shortcut'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
