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
  Search,
  ChevronDown,
  ChevronUp,
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
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

export function KeyboardShortcutsSettings() {
  const { lang, isRtl } = useLanguage();
  const [shortcuts, setShortcuts] = useState<ShortcutItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<'all' | 'editor' | 'table' | 'navigation'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showAllMobile, setShowAllMobile] = useState<boolean>(false);
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
    setSearchQuery('');
    showNotice(lang === 'ar' ? 'تمت استعادة الاختصارات الافتراضية' : 'Shortcuts reset to defaults');
  };

  const filteredShortcuts = shortcuts.filter((s) => {
    if (activeCategory !== 'all' && s.category !== activeCategory) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      s.titleAr.toLowerCase().includes(q) ||
      s.titleEn.toLowerCase().includes(q) ||
      s.descriptionAr.toLowerCase().includes(q) ||
      s.descriptionEn.toLowerCase().includes(q) ||
      s.currentKey.toLowerCase().includes(q) ||
      s.defaultKey.toLowerCase().includes(q)
    );
  });

  const displayedShortcuts = showAllMobile || searchQuery.trim() || activeCategory !== 'all'
    ? filteredShortcuts
    : filteredShortcuts.slice(0, 6);

  return (
    <Card className="p-4 sm:p-6 min-w-0">
      <div className="flex items-start gap-3 sm:gap-4 min-w-0">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
          <Keyboard className="size-5" />
        </div>

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 min-w-0">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-foreground flex items-center gap-2 flex-wrap">
                <span>{lang === 'ar' ? 'اختصارات لوحة المفاتيح' : 'Keyboard Shortcuts'}</span>
                {notice && (
                  <span
                    role="status"
                    aria-live="polite"
                    className="text-xs text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1"
                  >
                    <Check className="size-3.5" />
                    <span>{notice}</span>
                  </span>
                )}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                {lang === 'ar'
                  ? 'عرض وتخصيص اختصارات المحرر والتنقل وتوثيق سلوك الجداول التلقائي.'
                  : 'View and customize shortcuts for editor, tables, and navigation.'}
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleResetDefaults}
              className="gap-1.5 self-start text-xs font-semibold shrink-0"
              title={lang === 'ar' ? 'استعادة الاختصارات الافتراضية' : 'Reset to Default Shortcuts'}
            >
              <RotateCcw data-icon="inline-start" />
              <span>{lang === 'ar' ? 'استعادة الافتراضيات' : 'Reset Defaults'}</span>
            </Button>
          </div>

          {/* Behavior Documentation Banner */}
          <Alert className="mt-4 bg-muted/40 border-border">
            <Info className="size-4 text-primary shrink-0" />
            <AlertDescription className="text-xs leading-relaxed text-foreground min-w-0">
              <span className="font-bold">
                {lang === 'ar' ? 'توثيق سلوك الجداول التلقائي: ' : 'Documented Table Behavior: '}
              </span>
              <span>
                {lang === 'ar'
                  ? 'مفتاح Tab يتنقل بين خلايا الجدول؛ وعند الضغط عليه داخل آخر خلية بآخر صف يتم تلقائياً إنشاء صف جديد دون الحاجة للنقر بالفأرة.'
                  : 'Tab navigates between cells. Pressing Tab in the last cell of the table automatically creates a new row.'}
              </span>
            </AlertDescription>
          </Alert>

          {/* Search Input Filter */}
          <div className="mt-4 relative">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <Input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                lang === 'ar'
                  ? 'ابحث في الاختصارات (مثال: حفظ، جدول، Ctrl+S)...'
                  : 'Search shortcuts (e.g. Save, Table, Ctrl+S)...'
              }
              className="ps-9 pe-3 text-xs h-9"
              aria-label={lang === 'ar' ? 'بحث في الاختصارات' : 'Search shortcuts'}
            />
          </div>

          {/* Category Filter Tabs */}
          <div
            role="tablist"
            aria-label={lang === 'ar' ? 'تصنيفات الاختصارات' : 'Shortcut categories'}
            className="mt-3 flex flex-wrap gap-1.5 border-b border-border/60 pb-3"
          >
            {[
              { id: 'all', labelAr: 'جميع الاختصارات', labelEn: 'All Shortcuts', icon: Keyboard },
              { id: 'editor', labelAr: 'محرر النصوص والتنسيق', labelEn: 'Editor & Formatting', icon: FileText },
              { id: 'table', labelAr: 'الجداول والخلايا', labelEn: 'Tables', icon: TableIcon },
              { id: 'navigation', labelAr: 'التنقل والحفظ', labelEn: 'Navigation & Save', icon: Navigation },
            ].map((cat) => {
              const Icon = cat.icon;
              const isActive = activeCategory === cat.id;
              return (
                <Button
                  key={cat.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  variant={isActive ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setActiveCategory(cat.id as any)}
                  className="gap-1.5 text-xs font-semibold"
                >
                  <Icon data-icon="inline-start" />
                  <span>{lang === 'ar' ? cat.labelAr : cat.labelEn}</span>
                </Button>
              );
            })}
          </div>

          {/* Shortcuts List */}
          <div className="mt-4 divide-y divide-border border border-border rounded-xl overflow-hidden bg-muted/20 min-w-0">
            {displayedShortcuts.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                {lang === 'ar' ? 'لا توجد اختصارات مطابقة للبحث' : 'No shortcuts match your search'}
              </div>
            ) : (
              displayedShortcuts.map((item) => {
                return (
                  <div
                    key={item.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:px-4 gap-2 hover:bg-card/70 transition-colors min-w-0"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-xs text-foreground">
                          {lang === 'ar' ? item.titleAr : item.titleEn}
                        </span>
                        {item.isCustom && (
                          <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">
                            {lang === 'ar' ? 'مخصص' : 'Custom'}
                          </Badge>
                        )}
                        {item.isProtected && (
                          <Badge variant="secondary" className="text-[10px]">
                            {lang === 'ar' ? 'نظام مدمج' : 'Built-in'}
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                        {lang === 'ar' ? item.descriptionAr : item.descriptionEn}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      <kbd className="inline-flex items-center px-2.5 py-1 rounded-md border border-border bg-card text-foreground font-mono text-xs font-bold shadow-2xs">
                        {formatKeyDisplay(item.currentKey)}
                      </kbd>

                      {!item.isProtected ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleStartEditing(item)}
                          className="size-7 text-muted-foreground hover:text-foreground"
                          title={lang === 'ar' ? 'تعديل الاختصار (Rebind)' : 'Rebind shortcut'}
                        >
                          <Edit2 className="size-3.5" />
                        </Button>
                      ) : (
                        <div className="w-7" />
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Show all toggle when on default category & not searching */}
          {!searchQuery.trim() && activeCategory === 'all' && filteredShortcuts.length > 6 && (
            <div className="mt-3 text-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowAllMobile(!showAllMobile)}
                className="gap-2 text-xs font-semibold"
              >
                {showAllMobile ? (
                  <>
                    <ChevronUp className="size-3.5" />
                    <span>{lang === 'ar' ? 'طي الاختصارات الإضافية' : 'Show fewer shortcuts'}</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="size-3.5" />
                    <span>
                      {lang === 'ar'
                        ? `عرض باقي الاختصارات (${filteredShortcuts.length - 6} إضافي)`
                        : `Show all shortcuts (${filteredShortcuts.length} total)`}
                    </span>
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Interactive Key Recording Modal / Rebinding Dialog */}
      <Dialog open={Boolean(editingItem)} onOpenChange={(open) => !open && setEditingItem(null)}>
        {editingItem && (
          <DialogContent className="max-w-md p-6 space-y-4">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-foreground">
                {lang === 'ar' ? 'تعديل الاختصار' : 'Rebind Keyboard Shortcut'}
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-1">
                {lang === 'ar'
                  ? `قم بالضغط على توليفة المفاتيح التي ترغب بتعيينها لإجراء "${editingItem.titleAr}".`
                  : `Press the key combination you wish to assign to "${editingItem.titleEn}".`}
              </p>
            </DialogHeader>

            {/* Key capture input */}
            <div
              tabIndex={0}
              onKeyDown={handleKeyDown}
              className="rounded-xl border-2 border-dashed border-primary bg-primary/10 p-6 text-center focus:outline-none focus:ring-2 focus:ring-ring transition-all cursor-pointer"
            >
              <div className="text-xs text-muted-foreground mb-2">
                {lang === 'ar' ? 'المفاتيح الملتقطة:' : 'Captured Keys:'}
              </div>
              <div className="font-mono text-lg font-bold text-primary">
                {recordedKey ? formatKeyDisplay(recordedKey) : lang === 'ar' ? 'اضغط المفاتيح الآن...' : 'Press keys now...'}
              </div>
            </div>

            {conflictWarning && (
              <Alert variant="destructive">
                <AlertTriangle className="size-4" />
                <AlertDescription className="text-xs">{conflictWarning}</AlertDescription>
              </Alert>
            )}

            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingItem(null)}
              >
                {lang === 'ar' ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button
                type="button"
                onClick={handleSaveRebind}
                disabled={!recordedKey}
              >
                {lang === 'ar' ? 'حفظ الاختصار' : 'Save Shortcut'}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </Card>
  );
}
