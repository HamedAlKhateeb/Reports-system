'use client';

import React, { useRef, useState } from 'react';
import { Editor } from '@tiptap/react';
import {
  Bold,
  Italic,
  BarChart3,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Table as TableIcon,
  Plus,
  Minus,
  Trash2,
  Image as ImageIcon,
  Columns,
  Rows,
  Merge,
  Split,
  Heading,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Highlighter,
  Baseline,
  ChevronDown,
  Link as LinkIcon,
  Unlink,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  PilcrowLeft,
  PilcrowRight,
  Sigma,
  Undo2,
  Redo2,
  ArrowRightLeft,
  ArrowLeftRight,
  Maximize2,
} from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TableEntity } from '@/lib/types';
import { saveTable } from '@/lib/db';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

const TEXT_COLORS = [
  { name: 'Red', hex: '#dc2626', labelAr: 'أحمر داكن', labelEn: 'Dark Red' },
  { name: 'Orange', hex: '#ea580c', labelAr: 'برتقالي', labelEn: 'Orange' },
  { name: 'Green', hex: '#16a34a', labelAr: 'أخضر', labelEn: 'Green' },
  { name: 'Blue', hex: '#2563eb', labelAr: 'أزرق', labelEn: 'Blue' },
  { name: 'Purple', hex: '#9333ea', labelAr: 'بنفسجي', labelEn: 'Purple' },
  { name: 'Slate', hex: '#475569', labelAr: 'رمادي', labelEn: 'Slate Gray' },
];

const HIGHLIGHT_COLORS = [
  { name: 'Yellow', hex: '#fef08a', labelAr: 'أصفر', labelEn: 'Yellow' },
  { name: 'Soft Red', hex: '#fee2e2', labelAr: 'أحمر فاتح', labelEn: 'Soft Red' },
  { name: 'Soft Orange', hex: '#ffedd5', labelAr: 'برتقالي فاتح', labelEn: 'Soft Orange' },
  { name: 'Soft Green', hex: '#dcfce7', labelAr: 'أخضر فاتح', labelEn: 'Soft Green' },
  { name: 'Soft Blue', hex: '#dbeafe', labelAr: 'أزرق فاتح', labelEn: 'Soft Blue' },
  { name: 'Soft Purple', hex: '#f3e8ff', labelAr: 'بنفسجي فاتح', labelEn: 'Soft Purple' },
];

interface EditorToolbarProps {
  editor: Editor | null;
  reportId?: string;
  onImageUpload: (file: File) => void;
  uploadingImage?: boolean;
}

export function EditorToolbar({
  editor,
  reportId,
  onImageUpload,
  uploadingImage,
}: EditorToolbarProps) {
  const { t, isRtl, lang } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showHighlightPicker, setShowHighlightPicker] = useState(false);
  const [showLinkPopover, setShowLinkPopover] = useState(false);
  const [linkUrlInput, setLinkUrlInput] = useState('');
  const [showLatexPopover, setShowLatexPopover] = useState(false);
  const [latexInput, setLatexInput] = useState('');

  const handleInsertLatex = () => {
    const latex = latexInput.trim();
    if (!latex || !editor) return;
    try {
      (editor.chain().focus() as any).setLatexInline({ latex }).run();
      toast.success(lang === 'ar' ? 'تم إدراج المعادلة' : 'Equation inserted');
    } catch (err) {
      console.error('Insert latex failed:', err);
      toast.error(lang === 'ar' ? 'فشل إدراج المعادلة' : 'Failed to insert equation');
    }
    setLatexInput('');
    setShowLatexPopover(false);
  };

  const handleInsertSmartTable = async () => {
    if (!editor) return;
    try {
      const newTableId = `tbl_${reportId || 'rep'}_${Date.now().toString(36)}`;
      const defaultTable: TableEntity = {
        id: newTableId,
        report_id: reportId || '',
        name: lang === 'ar' ? 'جدول' : 'Table',
        direction: lang === 'ar' ? 'rtl' : 'ltr',
        cell_formats: {},
        merged_cells: [],
        columns_data: [
          { id: 'A', name: lang === 'ar' ? 'البند' : 'Item', type: 'text', width: 200 },
          { id: 'B', name: lang === 'ar' ? 'الوصف' : 'Description', type: 'text', width: 260 },
          { id: 'C', name: lang === 'ar' ? 'العدد' : 'Count', type: 'number', width: 110 },
        ],
        rows_data: [
          { A: '', B: '', C: '' },
          { A: '', B: '', C: '' },
          { A: '', B: '', C: '' },
        ],
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      await saveTable(defaultTable);
      (editor.chain().focus() as any)
        .insertSmartTable({
          tableId: newTableId,
          reportId: reportId || '',
          displayMode: 'embedded-edit',
        })
        .run();
      toast.success(lang === 'ar' ? 'تم إدراج الجدول الذكي في التقرير' : 'Smart table inserted into report');
    } catch (err) {
      console.error('Insert smart table failed:', err);
      toast.error(lang === 'ar' ? 'فشل إدراج الجدول الذكي' : 'Failed to insert smart table');
    }
  };

  const handleInsertNormalTable = () => {
    if (!editor) return;
    try {
      // TipTap native table: 3x3 with header row. Never throws: guarded + focus fallback.
      const ok = editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
      if (!ok) {
        editor.chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
      }
      toast.success(lang === 'ar' ? 'تم إدراج جدول عادي في التقرير' : 'Normal table inserted into report');
    } catch (err) {
      console.error('Insert normal table failed:', err);
      toast.error(lang === 'ar' ? 'فشل إدراج الجدول العادي' : 'Failed to insert normal table');
    }
  };

  // Context menu dispatches table-insert requests; both kinds are supported.
  // 'editor-insert-table-request' (legacy) -> smart table for backward-compat.
  const insertTableRef = useRef(handleInsertSmartTable);
  insertTableRef.current = handleInsertSmartTable;
  const insertNormalRef = useRef(handleInsertNormalTable);
  insertNormalRef.current = handleInsertNormalTable;
  React.useEffect(() => {
    const smartHandler = () => {
      insertTableRef.current();
    };
    const normalHandler = () => {
      insertNormalRef.current();
    };
    window.addEventListener('editor-insert-table-request', smartHandler);
    window.addEventListener('editor-insert-normal-table-request', normalHandler);
    window.addEventListener('editor-insert-smart-table-request', smartHandler);
    return () => {
      window.removeEventListener('editor-insert-table-request', smartHandler);
      window.removeEventListener('editor-insert-normal-table-request', normalHandler);
      window.removeEventListener('editor-insert-smart-table-request', smartHandler);
    };
  }, []);

  // Smart-table focus bridge: the smart grid isolates its DOM events from
  // ProseMirror, so it announces focus explicitly. While set, the same
  // contextual sub-toolbar is shown and its buttons are forwarded as addressed
  // commands ('smart-table-command') instead of TipTap table commands.
  const [activeSmartTable, setActiveSmartTable] = useState<{ id: string; name: string } | null>(null);
  const [smartNameDraft, setSmartNameDraft] = useState('');
  React.useEffect(() => {
    const onSmartActive = (e: Event) => {
      const detail = (e as CustomEvent)?.detail || {};
      const id = detail.tableId;
      if (typeof id === 'string' && id) {
        const name = typeof detail.name === 'string' ? detail.name : '';
        setActiveSmartTable({ id, name });
        // Don't clobber in-progress name typing: the grid re-announces focus
        // on every mousedown, which fires before the input's blur commit.
        try {
          const ae = document.activeElement as HTMLElement | null;
          if (ae && ae.getAttribute && ae.getAttribute('data-smart-name-input') === '1') return;
        } catch {}
        setSmartNameDraft(name);
      }
    };
    // Clear on click (NOT mousedown): clearing on mousedown unmounts the
    // sub-toolbar buttons before their click handlers run, so commands
    // (e.g. Delete Table) would never fire. Button clicks run first, then this.
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || typeof target.closest !== 'function') return;
      if (target.closest('.smart-table-wrapper')) return;
      if (target.closest('.editor-toolbar-root')) return;
      if (target.closest('[data-radix-portal]')) return;
      setActiveSmartTable(null);
    };
    window.addEventListener('smart-table-active', onSmartActive);
    document.addEventListener('click', onDocClick);
    return () => {
      window.removeEventListener('smart-table-active', onSmartActive);
      document.removeEventListener('click', onDocClick);
    };
  }, []);

  // Leaving the smart table via keyboard into a normal table clears the bridge.
  React.useEffect(() => {
    if (!editor) return;
    const onSel = () => {
      try {
        if (editor.isActive('table')) setActiveSmartTable(null);
      } catch {}
    };
    editor.on('selectionUpdate', onSel);
    return () => {
      editor.off('selectionUpdate', onSel);
    };
  }, [editor]);

  const sendSmartCommand = (command: string, value?: string) => {
    if (!activeSmartTable) return;
    window.dispatchEvent(
      new CustomEvent('smart-table-command', { detail: { tableId: activeSmartTable.id, command, value } })
    );
  };

  const commitSmartName = () => {
    if (!activeSmartTable) return;
    const next = smartNameDraft.slice(0, 120);
    setActiveSmartTable({ ...activeSmartTable, name: next });
    sendSmartCommand('rename', next);
  };

  if (!editor) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        onImageUpload(files[i]);
      }
    }
    // reset
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const isTableActive = editor.isActive('table');
  // When the cursor is in a normal table it wins; otherwise a focused smart
  // table drives the same sub-toolbar through the command bridge.
  const useSmart = !!activeSmartTable && !isTableActive;
  const isRtlActive = editor.isActive({ dir: 'rtl' }) || (!editor.isActive({ dir: 'ltr' }) && isRtl);
  const isLtrActive = editor.isActive({ dir: 'ltr' }) || (!editor.isActive({ dir: 'rtl' }) && !isRtl);

  // Active font size in px
  const getActiveFontSize = (): number => {
    const sizeAttr = editor.getAttributes('fontSize').size;
    if (sizeAttr) {
      const parsed = parseInt(sizeAttr, 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    if (editor.isActive('heading', { level: 1 })) return 30;
    if (editor.isActive('heading', { level: 2 })) return 24;
    if (editor.isActive('heading', { level: 3 })) return 20;
    return 16;
  };

  const currentFontSize = getActiveFontSize();

  const handleDecreaseFontSize = () => {
    const newSize = Math.max(10, currentFontSize - 2);
    editor.chain().focus().setFontSize(`${newSize}px`).run();
  };

  const handleIncreaseFontSize = () => {
    const newSize = Math.min(72, currentFontSize + 2);
    editor.chain().focus().setFontSize(`${newSize}px`).run();
  };

  return (
    <div className="editor-toolbar-root flex flex-col bg-card/60 backdrop-blur-sm w-full max-w-full">
      {/* Primary Toolbar - Smooth horizontal scroll on mobile, wrap on desktop */}
      <div className="toolbar-container flex flex-nowrap sm:flex-wrap items-center gap-1 p-1.5 sm:p-2 text-foreground w-full max-w-full overflow-x-auto sm:overflow-visible scroll-smooth relative z-30">
        {/* Hidden file input */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/*"
          multiple
          className="hidden"
        />

        {/* Headings */}
        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            className={cn(
              "h-8 w-8 rounded-lg",
              editor.isActive('heading', { level: 1 })
                ? "bg-[#2E4034]/15 text-[#2E4034] dark:bg-olive-900/50 dark:text-olive-300 font-bold"
                : "text-muted-foreground hover:text-foreground"
            )}
            title={`${t('heading1')} (Ctrl+Alt+1)`}
          >
            <Heading1 className="h-4 w-4" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={cn(
              "h-8 w-8 rounded-lg",
              editor.isActive('heading', { level: 2 })
                ? "bg-[#2E4034]/15 text-[#2E4034] dark:bg-olive-900/50 dark:text-olive-300 font-bold"
                : "text-muted-foreground hover:text-foreground"
            )}
            title={`${t('heading2')} (Ctrl+Alt+2)`}
          >
            <Heading2 className="h-4 w-4" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            className={cn(
              "h-8 w-8 rounded-lg",
              editor.isActive('heading', { level: 3 })
                ? "bg-[#2E4034]/15 text-[#2E4034] dark:bg-olive-900/50 dark:text-olive-300 font-bold"
                : "text-muted-foreground hover:text-foreground"
            )}
            title={`${t('heading3')} (Ctrl+Alt+3)`}
          >
            <Heading3 className="h-4 w-4" />
          </Button>
        </div>

        <Separator orientation="vertical" className="h-4 mx-1 bg-border/80" />

        {/* Font Size Control: Minus, Current Px Value, Plus */}
        <div
          className="flex items-center rounded-lg border border-border/70 bg-card p-0.5 shadow-2xs"
          title={lang === 'ar' ? 'حجم الخط' : 'Font size'}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleDecreaseFontSize}
            className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
            title={`${lang === 'ar' ? 'تصغير حجم الخط (-2px)' : 'Decrease font size (-2px)'} (Ctrl+Shift+<)`}
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>

          <span
            className="px-2 text-xs font-semibold text-foreground min-w-[42px] text-center select-none font-mono"
            title={lang === 'ar' ? 'حجم الخط الحالي' : 'Current font size'}
          >
            {currentFontSize}px
          </span>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleIncreaseFontSize}
            className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
            title={`${lang === 'ar' ? 'تكبير حجم الخط (+2px)' : 'Increase font size (+2px)'} (Ctrl+Shift+>)`}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>

        <Separator orientation="vertical" className="h-4 mx-1 bg-border/80" />

        {/* Formatting: Bold, Italic, Link */}
        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => useSmart ? sendSmartCommand('style-bold') : editor.chain().focus().toggleBold().run()}
            className={cn(
              "h-8 w-8 rounded-lg",
              editor.isActive('bold')
                ? "bg-[#2E4034]/15 text-[#2E4034] dark:bg-olive-900/50 dark:text-olive-300 font-bold"
                : "text-muted-foreground hover:text-foreground"
            )}
            title={`${t('bold')} (Ctrl+B)`}
          >
            <Bold className="h-4 w-4" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => useSmart ? sendSmartCommand('style-italic') : editor.chain().focus().toggleItalic().run()}
            className={cn(
              "h-8 w-8 rounded-lg",
              editor.isActive('italic')
                ? "bg-[#2E4034]/15 text-[#2E4034] dark:bg-olive-900/50 dark:text-olive-300 font-bold"
                : "text-muted-foreground hover:text-foreground"
            )}
            title={`${t('italic')} (Ctrl+I)`}
          >
            <Italic className="h-4 w-4" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={cn(
              "h-8 w-8 rounded-lg underline underline-offset-2",
              editor.isActive('underline')
                ? "bg-[#2E4034]/15 text-[#2E4034] dark:bg-olive-900/50 dark:text-olive-300 font-bold"
                : "text-muted-foreground hover:text-foreground"
            )}
            title={lang === 'ar' ? 'تسطير (Ctrl+U)' : 'Underline (Ctrl+U)'}
          >
            <span className="text-sm font-bold leading-none">U</span>
          </Button>

          {/* Link Button and Popover */}
          <Popover open={showLinkPopover} onOpenChange={setShowLinkPopover}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => {
                  const prev = editor.getAttributes('link').href || '';
                  setLinkUrlInput(prev);
                }}
                className={cn(
                  "h-8 w-8 rounded-lg",
                  editor.isActive('link')
                    ? "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200 font-bold"
                    : "text-muted-foreground hover:text-foreground"
                )}
                title={editor.isActive('link') ? (lang === 'ar' ? 'تعديل الرابط' : 'Edit Link') : (lang === 'ar' ? 'إدراج رابط' : 'Insert Link')}
              >
                <LinkIcon className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="center"
              sideOffset={8}
              className="z-50 w-64 max-w-[calc(100vw-32px)] rounded-xl border border-border bg-card p-3 shadow-xl"
            >
              <div className="text-[11px] font-semibold text-foreground mb-1.5">
                {lang === 'ar' ? 'إدراج أو تعديل الرابط:' : 'Insert or Edit Link:'}
              </div>
              <input
                type="url"
                autoFocus
                value={linkUrlInput}
                onChange={(e) => setLinkUrlInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    let cleanUrl = linkUrlInput.trim();
                    if (!cleanUrl) {
                      editor.chain().focus().unsetLink().run();
                    } else {
                      if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://') && !cleanUrl.startsWith('mailto:')) {
                        cleanUrl = 'https://' + cleanUrl;
                      }
                      editor.chain().focus().extendMarkRange('link').setLink({ href: cleanUrl }).run();
                    }
                    setShowLinkPopover(false);
                  }
                }}
                placeholder="https://example.com"
                className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-[#2E4034] focus:ring-1 focus:ring-[#2E4034] mb-2 text-foreground"
              />
              <div className="flex items-center justify-between gap-1.5">
                {editor.isActive('link') ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      editor.chain().focus().unsetLink().run();
                      setShowLinkPopover(false);
                    }}
                    className="h-7 px-2 text-[11px] text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-md"
                  >
                    <Unlink className="h-3 w-3 me-1" />
                    <span>{lang === 'ar' ? 'إزالة' : 'Unlink'}</span>
                  </Button>
                ) : <div />}

                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowLinkPopover(false)}
                    className="h-7 px-2 text-[11px] text-muted-foreground rounded-md"
                  >
                    {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      let cleanUrl = linkUrlInput.trim();
                      if (!cleanUrl) {
                        editor.chain().focus().unsetLink().run();
                      } else {
                        if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://') && !cleanUrl.startsWith('mailto:')) {
                          cleanUrl = 'https://' + cleanUrl;
                        }
                        editor.chain().focus().extendMarkRange('link').setLink({ href: cleanUrl }).run();
                      }
                      setShowLinkPopover(false);
                    }}
                    className="h-7 px-2.5 text-[11px] font-semibold bg-[#2E4034] hover:bg-[#24382F] text-white rounded-md shadow-2xs"
                  >
                    {lang === 'ar' ? 'تطبيق' : 'Apply'}
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <Separator orientation="vertical" className="h-4 mx-1 bg-border/80" />

        {/* Colors & Highlight Palette */}
        <div className="flex items-center gap-0.5">
          {/* Text Color Button */}
          <Popover open={showColorPicker} onOpenChange={setShowColorPicker}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-1.5 rounded-lg text-muted-foreground hover:text-foreground gap-0.5"
                title={t('textColor')}
              >
                <Baseline className="h-4 w-4" />
                <ChevronDown className="h-2.5 w-2.5 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="center"
              sideOffset={8}
              className="z-50 w-auto p-2.5 bg-card border border-border shadow-xl rounded-xl"
            >
              <div className="text-[11px] font-semibold text-muted-foreground px-1 mb-1.5">
                {t('textColor')}
              </div>
              <div className="grid grid-cols-3 gap-1.5 w-32">
                {TEXT_COLORS.map((c) => (
                  <button
                    key={c.hex}
                    type="button"
                    onClick={() => {
                      (editor.chain().focus() as any).setTextColor(c.hex).run();
                      setShowColorPicker(false);
                    }}
                    className="h-6 w-full rounded-md border border-border/60 hover:scale-105 transition-transform cursor-pointer"
                    style={{ backgroundColor: c.hex }}
                    title={lang === 'ar' ? c.labelAr : c.labelEn}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  (editor.chain().focus() as any).unsetTextColor().run();
                  setShowColorPicker(false);
                }}
                className="mt-2 w-full rounded-md border border-border/80 px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted text-center cursor-pointer"
              >
                {t('removeColor')}
              </button>
            </PopoverContent>
          </Popover>

          {/* Text Highlight Button */}
          <Popover open={showHighlightPicker} onOpenChange={setShowHighlightPicker}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-1.5 rounded-lg text-muted-foreground hover:text-foreground gap-0.5"
                title={t('highlightColor')}
              >
                <Highlighter className="h-4 w-4" />
                <ChevronDown className="h-2.5 w-2.5 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="center"
              sideOffset={8}
              className="z-50 w-auto p-2.5 bg-card border border-border shadow-xl rounded-xl"
            >
              <div className="text-[11px] font-semibold text-muted-foreground px-1 mb-1.5">
                {t('highlightColor')}
              </div>
              <div className="grid grid-cols-3 gap-1.5 w-32">
                {HIGHLIGHT_COLORS.map((c) => (
                  <button
                    key={c.hex}
                    type="button"
                    onClick={() => {
                      (editor.chain().focus() as any).setTextHighlight(c.hex).run();
                      setShowHighlightPicker(false);
                    }}
                    className="h-6 w-full rounded-md border border-border/60 hover:scale-105 transition-transform cursor-pointer"
                    style={{ backgroundColor: c.hex }}
                    title={lang === 'ar' ? c.labelAr : c.labelEn}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  (editor.chain().focus() as any).unsetTextHighlight().run();
                  setShowHighlightPicker(false);
                }}
                className="mt-2 w-full rounded-md border border-border/80 px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted text-center cursor-pointer"
              >
                {t('removeColor')}
              </button>
            </PopoverContent>
          </Popover>
        </div>

        <Separator orientation="vertical" className="h-4 mx-1 bg-border/80" />

        {/* Lists & Quote */}
        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={cn(
              "h-8 w-8 rounded-lg",
              editor.isActive('bulletList')
                ? "bg-[#2E4034]/15 text-[#2E4034] dark:bg-olive-900/50 dark:text-olive-300 font-bold"
                : "text-muted-foreground hover:text-foreground"
            )}
            title={`${t('bulletList')} (Ctrl+Shift+8)`}
          >
            <List className="h-4 w-4" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={cn(
              "h-8 w-8 rounded-lg",
              editor.isActive('orderedList')
                ? "bg-[#2E4034]/15 text-[#2E4034] dark:bg-olive-900/50 dark:text-olive-300 font-bold"
                : "text-muted-foreground hover:text-foreground"
            )}
            title={`${t('orderedList')} (Ctrl+Shift+7)`}
          >
            <ListOrdered className="h-4 w-4" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            className={cn(
              "h-8 w-8 rounded-lg",
              editor.isActive('blockquote')
                ? "bg-[#2E4034]/15 text-[#2E4034] dark:bg-olive-900/50 dark:text-olive-300 font-bold"
                : "text-muted-foreground hover:text-foreground"
            )}
            title={`${t('blockquote')} (Ctrl+Shift+Q)`}
          >
            <Quote className="h-4 w-4" />
          </Button>
        </div>

        <Separator orientation="vertical" className="h-4 mx-1 bg-border/80" />

        {/* Text Alignment: Right, Center, Left, Justify */}
        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => useSmart ? sendSmartCommand('align-right') : editor.chain().focus().setTextAlign('right').run()}
            className={cn(
              "h-8 w-8 rounded-lg",
              editor.isActive({ textAlign: 'right' })
                ? "bg-[#2E4034]/15 text-[#2E4034] dark:bg-olive-900/50 dark:text-olive-300 font-bold"
                : "text-muted-foreground hover:text-foreground"
            )}
            title={lang === 'ar' ? 'محاذاة لليمين' : 'Align Right'}
          >
            <AlignRight className="h-4 w-4" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => useSmart ? sendSmartCommand('align-center') : editor.chain().focus().setTextAlign('center').run()}
            className={cn(
              "h-8 w-8 rounded-lg",
              editor.isActive({ textAlign: 'center' })
                ? "bg-[#2E4034]/15 text-[#2E4034] dark:bg-olive-900/50 dark:text-olive-300 font-bold"
                : "text-muted-foreground hover:text-foreground"
            )}
            title={lang === 'ar' ? 'محاذاة للوسط' : 'Align Center'}
          >
            <AlignCenter className="h-4 w-4" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => useSmart ? sendSmartCommand('align-left') : editor.chain().focus().setTextAlign('left').run()}
            className={cn(
              "h-8 w-8 rounded-lg",
              editor.isActive({ textAlign: 'left' })
                ? "bg-[#2E4034]/15 text-[#2E4034] dark:bg-olive-900/50 dark:text-olive-300 font-bold"
                : "text-muted-foreground hover:text-foreground"
            )}
            title={lang === 'ar' ? 'محاذاة لليسار' : 'Align Left'}
          >
            <AlignLeft className="h-4 w-4" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => useSmart ? sendSmartCommand('align-justify') : editor.chain().focus().setTextAlign('justify').run()}
            className={cn(
              "h-8 w-8 rounded-lg",
              editor.isActive({ textAlign: 'justify' })
                ? "bg-[#2E4034]/15 text-[#2E4034] dark:bg-olive-900/50 dark:text-olive-300 font-bold"
                : "text-muted-foreground hover:text-foreground"
            )}
            title={lang === 'ar' ? 'ضبط كلي (Justify)' : 'Justify'}
          >
            <AlignJustify className="h-4 w-4" />
          </Button>
        </div>

        <Separator orientation="vertical" className="h-4 mx-1 bg-border/80" />

        {/* Text Direction: RTL, LTR */}
        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => useSmart ? sendSmartCommand('toggle-direction') : editor.chain().focus().setTextDirection('rtl').run()}
            className={cn(
              "h-8 w-8 rounded-lg",
              isRtlActive
                ? "bg-[#2E4034]/15 text-[#2E4034] dark:bg-olive-900/50 dark:text-olive-300 font-bold"
                : "text-muted-foreground hover:text-foreground"
            )}
            title={lang === 'ar' ? 'اتجاه النص: من اليمين لليسار (RTL)' : 'Text Direction: Right to Left (RTL)'}
          >
            <PilcrowLeft className="h-4 w-4" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => useSmart ? sendSmartCommand('toggle-direction') : editor.chain().focus().setTextDirection('ltr').run()}
            className={cn(
              "h-8 w-8 rounded-lg",
              isLtrActive
                ? "bg-[#2E4034]/15 text-[#2E4034] dark:bg-olive-900/50 dark:text-olive-300 font-bold"
                : "text-muted-foreground hover:text-foreground"
            )}
            title={lang === 'ar' ? 'اتجاه النص: من اليسار لليمين (LTR)' : 'Text Direction: Left to Right (LTR)'}
          >
            <PilcrowRight className="h-4 w-4" />
          </Button>
        </div>

        <Separator orientation="vertical" className="h-4 mx-1 bg-border/80" />

        {/* Table Insert: normal (TipTap) vs smart (formulas) */}
        <div className="flex items-center gap-1">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn(
                  "h-8 gap-1.5 rounded-lg text-xs font-semibold shadow-2xs",
                  (isTableActive || activeSmartTable) && "border-olive-600 bg-olive-50 dark:bg-olive-950/40 text-olive-800 dark:text-olive-300"
                )}
                title={lang === 'ar' ? 'إدراج جدول عادي أو جدول ذكي (معادلات)' : 'Insert a normal or smart (formulas) table'}
                aria-label={lang === 'ar' ? 'إدراج جدول جديد في التقرير' : 'Insert a new table into the report'}
              >
                <TableIcon className="h-3.5 w-3.5" />
                <span>{lang === 'ar' ? 'إدراج جدول' : 'Insert Table'}</span>
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="center"
              sideOffset={8}
              className="z-50 w-64 rounded-xl border border-border bg-card p-1.5 shadow-xl"
            >
              <button
                type="button"
                onClick={handleInsertNormalTable}
                className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-start hover:bg-muted transition-colors"
              >
                <TableIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span>
                  <span className="block text-xs font-bold text-foreground">
                    {lang === 'ar' ? 'جدول عادي' : 'Normal table'}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {lang === 'ar' ? 'نصوص وتنسيق بسيط، سريع وثابت' : 'Simple text table, fast and stable'}
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={handleInsertSmartTable}
                className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-start hover:bg-muted transition-colors"
              >
                <Sigma className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span>
                  <span className="block text-xs font-bold text-foreground">
                    {lang === 'ar' ? 'جدول ذكي (معادلات)' : 'Smart table (formulas)'}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {lang === 'ar' ? 'معادلات Excel ودمج خلايا وملء تلقائي' : 'Excel formulas, merges, autofill'}
                  </span>
                </span>
              </button>
            </PopoverContent>
          </Popover>
        </div>

        {/* Upload Image Button */}
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingImage}
            className="h-8 gap-1.5 rounded-lg bg-olive-50 dark:bg-olive-950/40 border-olive-200 dark:border-olive-800/60 text-olive-800 dark:text-olive-300 hover:bg-olive-100 dark:hover:bg-olive-900/40 text-xs font-semibold shadow-2xs disabled:opacity-50"
            title={t('uploadImageBtn')}
          >
            <ImageIcon className="h-3.5 w-3.5 text-olive-700 dark:text-olive-400" />
            <span>{uploadingImage ? t('uploadingImage') : t('uploadImageBtn')}</span>
          </Button>
        </div>

        {/* Import Button — Word (.docx) / Excel (.xlsx) into the existing editor.
            Opens the Import dialog (Select → Validate → Parse → Preview → Confirm → Insert);
            insertion reuses the current schema, never replaces it. */}
        <div>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 rounded-lg text-xs font-semibold shadow-2xs"
                title={lang === 'ar' ? 'استيراد Word أو Excel إلى التقرير' : 'Import Word or Excel into the report'}
                aria-label={lang === 'ar' ? 'استيراد' : 'Import'}
              >
                <Plus className="h-3.5 w-3.5 text-primary" />
                <span>{lang === 'ar' ? 'استيراد' : 'Import'}</span>
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="center"
              sideOffset={8}
              className="z-50 w-60 rounded-xl border border-border bg-card p-1.5 shadow-xl"
            >
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('editor-import-request', { detail: { kind: 'docx' } }))}
                className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-start hover:bg-muted transition-colors"
              >
                <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-xs font-bold shrink-0">W</span>
                <span>
                  <span className="block text-xs font-bold text-foreground">
                    {lang === 'ar' ? 'مستند Word' : 'Word document'}
                  </span>
                  <span className="block text-[11px] text-muted-foreground font-mono" dir="ltr">.docx</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('editor-import-request', { detail: { kind: 'xlsx' } }))}
                className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-start hover:bg-muted transition-colors"
              >
                <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-xs font-bold shrink-0">X</span>
                <span>
                  <span className="block text-xs font-bold text-foreground">
                    {lang === 'ar' ? 'جدول Excel' : 'Excel workbook'}
                  </span>
                  <span className="block text-[11px] text-muted-foreground font-mono" dir="ltr">.xlsx</span>
                </span>
              </button>
            </PopoverContent>
          </Popover>
        </div>

        {/* Chart Button — Table → Chart, same size/rhythm as other tools */}
        <div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent('chart-button-pressed', {
                  detail: useSmart && activeSmartTable ? { smartTableId: activeSmartTable.id } : {},
                })
              );
            }}
            className={cn(
              "h-8 w-8 rounded-lg",
              editor.isActive('reportChart')
                ? "bg-[#2E4034]/15 text-[#2E4034] dark:bg-olive-900/50 dark:text-olive-300 font-bold"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
            title={lang === 'ar' ? 'إدراج رسم بياني من جدول' : 'Insert chart from table'}
            aria-label={lang === 'ar' ? 'رسم بياني' : 'Chart'}
          >
            <BarChart3 className="h-4 w-4" />
          </Button>
        </div>

        {/* LaTeX Button — ∑ math equation (toolbar + Markdown $...$ both supported) */}
        <div>
          <Popover open={showLatexPopover} onOpenChange={setShowLatexPopover}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setLatexInput('')}
                className={cn(
                  "h-8 w-8 rounded-lg font-serif text-base font-bold",
                  editor.isActive('latexInline')
                    ? "bg-[#2E4034]/15 text-[#2E4034] dark:bg-olive-900/50 dark:text-olive-300"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
                title={lang === 'ar' ? 'إدراج معادلة رياضية (LaTeX) — أو اكتب $...$ مباشرة' : 'Insert math equation (LaTeX) — or type $...$ directly'}
                aria-label="LaTeX"
              >
                <Sigma className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="center"
              sideOffset={8}
              className="z-50 w-72 max-w-[calc(100vw-32px)] rounded-xl border border-border bg-card p-3 shadow-xl"
            >
              <div className="text-[11px] font-semibold text-foreground mb-1.5">
                {lang === 'ar' ? 'إدراج معادلة LaTeX:' : 'Insert LaTeX equation:'}
              </div>
              <input
                type="text"
                autoFocus
                dir="ltr"
                value={latexInput}
                onChange={(e) => setLatexInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleInsertLatex();
                  }
                }}
                placeholder="x^2 + y^2 = z^2"
                className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 font-mono text-xs outline-none focus:border-[#2E4034] focus:ring-1 focus:ring-[#2E4034] mb-1.5 text-foreground"
              />
              <div className="mb-2 rounded-md bg-muted/60 px-2 py-1.5 font-mono text-[10px] text-muted-foreground" dir="ltr">
                $x^2$ → rendered math
              </div>
              <div className="flex items-center justify-end gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowLatexPopover(false)}
                  className="h-7 px-2 text-[11px] text-muted-foreground rounded-md"
                >
                  {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={!latexInput.trim()}
                  onClick={handleInsertLatex}
                  className="h-7 px-2.5 text-[11px] font-semibold bg-[#2E4034] hover:bg-[#24382F] text-white rounded-md shadow-2xs disabled:opacity-40"
                >
                  {lang === 'ar' ? 'إدراج' : 'Insert'}
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Contextual Table Management Sub-Toolbar.
          Shown for normal tables (cursor inside) AND smart tables (focus bridge).
          Smart-table buttons are forwarded as addressed commands; the normal
          path keeps the exact TipTap commands as before. */}
      {(isTableActive || activeSmartTable) && (
        <div
          className="flex flex-nowrap sm:flex-wrap items-center gap-1.5 border-t border-border/70 bg-muted/40 px-2 sm:px-3 py-1.5 text-xs text-foreground w-full max-w-full overflow-x-auto scroll-smooth"
          // Keep editor/grid focus stable so table commands run on the right target
          // (but let text inputs focus normally).
          onMouseDown={(e) => {
            const t = e.target as HTMLElement | null;
            if (t && typeof t.closest === 'function' && t.closest('input,textarea')) return;
            e.preventDefault();
          }}
        >
          {/* Table Tools Label Badge (+ editable smart-table name) */}
          <div className="flex items-center gap-1 text-[11px] font-bold text-olive-800 dark:text-olive-300 me-1">
            <TableIcon className="h-3.5 w-3.5" />
            <span>{t('tableControls')}:</span>
            {useSmart && activeSmartTable && (
              <>
                <span className="rounded-md border border-emerald-300 bg-emerald-50 px-1.5 py-0 text-[10px] text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                  {lang === 'ar' ? 'ذكي' : 'Smart'}
                </span>
                <input
                  type="text"
                  value={smartNameDraft}
                  data-smart-name-input="1"
                  onChange={(e) => setSmartNameDraft(e.target.value.slice(0, 120))}
                  onBlur={commitSmartName}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  }}
                  className="h-7 w-24 sm:w-32 rounded-md border border-border/70 bg-card px-1.5 text-[11px] font-bold text-foreground focus:outline-none focus:border-olive-600 truncate"
                  aria-label={lang === 'ar' ? 'اسم الجدول الذكي' : 'Smart table name'}
                  maxLength={120}
                />
              </>
            )}
          </div>

          {/* Undo / Redo (smart tables keep their own history) */}
          {useSmart && (
            <>
              <div className="flex items-center gap-0.5 rounded-lg border border-border/70 bg-card p-0.5 shadow-2xs">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => sendSmartCommand('undo')}
                  className="h-7 px-1.5 text-[11px] gap-1 rounded-md text-muted-foreground hover:text-foreground"
                  title={`${lang === 'ar' ? 'تراجع' : 'Undo'} (Ctrl+Z)`}
                >
                  <Undo2 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => sendSmartCommand('redo')}
                  className="h-7 px-1.5 text-[11px] gap-1 rounded-md text-muted-foreground hover:text-foreground"
                  title={`${lang === 'ar' ? 'إعادة' : 'Redo'} (Ctrl+Y)`}
                >
                  <Redo2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </>
          )}

          {/* Row Controls */}
          <div className="flex items-center gap-0.5 rounded-lg border border-border/70 bg-card p-0.5 shadow-2xs">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => useSmart ? sendSmartCommand('insert-row-above') : editor.chain().focus().addRowBefore().run()}
              className="h-7 px-1.5 text-[11px] gap-1 rounded-md text-muted-foreground hover:text-foreground"
              title={t('addRowBefore')}
            >
              <Rows className="h-3 w-3 text-olive-600 dark:text-olive-400" />
              <ArrowUp className="h-2.5 w-2.5" />
              <span className="hidden sm:inline">{t('addRowBefore')}</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => useSmart ? sendSmartCommand('insert-row-below') : editor.chain().focus().addRowAfter().run()}
              className="h-7 px-1.5 text-[11px] gap-1 rounded-md text-muted-foreground hover:text-foreground"
              title={t('addRowAfter')}
            >
              <Rows className="h-3 w-3 text-olive-600 dark:text-olive-400" />
              <ArrowDown className="h-2.5 w-2.5" />
              <span className="hidden sm:inline">{t('addRowAfter')}</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => useSmart ? sendSmartCommand('delete-row') : editor.chain().focus().deleteRow().run()}
              className="h-7 px-1.5 text-[11px] gap-1 rounded-md text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600"
              title={t('deleteRow')}
            >
              <Trash2 className="h-3 w-3" />
              <span className="hidden md:inline">{t('deleteRow')}</span>
            </Button>
          </div>

          {/* Column Controls */}
          <div className="flex items-center gap-0.5 rounded-lg border border-border/70 bg-card p-0.5 shadow-2xs">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => useSmart ? sendSmartCommand('insert-col-before') : editor.chain().focus().addColumnBefore().run()}
              className="h-7 px-1.5 text-[11px] gap-1 rounded-md text-muted-foreground hover:text-foreground"
              title={t('addColumnBefore')}
            >
              <Columns className="h-3 w-3 text-olive-600 dark:text-olive-400" />
              {isRtl ? <ArrowRight className="h-2.5 w-2.5" /> : <ArrowLeft className="h-2.5 w-2.5" />}
              <span className="hidden sm:inline">{t('addColumnBefore')}</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => useSmart ? sendSmartCommand('insert-col-after') : editor.chain().focus().addColumnAfter().run()}
              className="h-7 px-1.5 text-[11px] gap-1 rounded-md text-muted-foreground hover:text-foreground"
              title={t('addColumnAfter')}
            >
              <Columns className="h-3 w-3 text-olive-600 dark:text-olive-400" />
              {isRtl ? <ArrowLeft className="h-2.5 w-2.5" /> : <ArrowRight className="h-2.5 w-2.5" />}
              <span className="hidden sm:inline">{t('addColumnAfter')}</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => useSmart ? sendSmartCommand('delete-col') : editor.chain().focus().deleteColumn().run()}
              className="h-7 px-1.5 text-[11px] gap-1 rounded-md text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600"
              title={t('deleteColumn')}
            >
              <Trash2 className="h-3 w-3" />
              <span className="hidden md:inline">{t('deleteColumn')}</span>
            </Button>
          </div>

          {/* Merge & Split Cells (smart tables merge/unmerge through one toggle) */}
          <div className="flex items-center gap-0.5 rounded-lg border border-border/70 bg-card p-0.5 shadow-2xs">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => useSmart ? sendSmartCommand('merge') : editor.chain().focus().mergeCells().run()}
              className="h-7 px-1.5 text-[11px] gap-1 rounded-md text-muted-foreground hover:text-foreground"
              title={t('mergeCells')}
            >
              <Merge className="h-3 w-3 text-olive-600 dark:text-olive-400" />
              <span className="hidden lg:inline">{t('mergeCells')}</span>
            </Button>
            {!useSmart && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => editor.chain().focus().splitCell().run()}
                className="h-7 px-1.5 text-[11px] gap-1 rounded-md text-muted-foreground hover:text-foreground"
                title={t('splitCell')}
              >
                <Split className="h-3 w-3 text-olive-600 dark:text-olive-400" />
                <span className="hidden lg:inline">{t('splitCell')}</span>
              </Button>
            )}
          </div>

          {/* Smart-only extras: transpose + fullscreen
              (direction/alignment/B/I live in the main toolbar above and are
              forwarded to the smart table while it is focused — no duplicates) */}
          {useSmart && (
            <div className="flex items-center gap-0.5 rounded-lg border border-border/70 bg-card p-0.5 shadow-2xs">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => sendSmartCommand('transpose')}
                className="h-7 px-1.5 text-[11px] gap-1 rounded-md text-muted-foreground hover:text-foreground"
                title={lang === 'ar' ? 'قلب الأبعاد (تبديل الصفوف والأعمدة)' : 'Transpose (swap rows & columns)'}
              >
                <ArrowLeftRight className="h-3.5 w-3.5 text-amber-600" />
                <span className="hidden lg:inline">{lang === 'ar' ? 'قلب الأبعاد' : 'Transpose'}</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => sendSmartCommand('fullscreen')}
                className="h-7 px-1.5 text-[11px] gap-1 rounded-md text-muted-foreground hover:text-foreground"
                title={lang === 'ar' ? 'ملء الشاشة' : 'Fullscreen'}
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}

          {/* Toggle Header Row / Column (normal TipTap tables only) */}
          {!useSmart && (
            <div className="flex items-center gap-0.5 rounded-lg border border-border/70 bg-card p-0.5 shadow-2xs">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => editor.chain().focus().toggleHeaderRow().run()}
                className="h-7 px-1.5 text-[11px] gap-1 rounded-md text-muted-foreground hover:text-foreground"
                title={t('toggleHeaderRow')}
              >
                <Heading className="h-3 w-3 text-olive-600 dark:text-olive-400" />
                <span className="hidden xl:inline">{t('toggleHeaderRow')}</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => editor.chain().focus().toggleHeaderColumn().run()}
                className="h-7 px-1.5 text-[11px] gap-1 rounded-md text-muted-foreground hover:text-foreground"
                title={t('toggleHeaderColumn')}
              >
                <Columns className="h-3 w-3 text-olive-600 dark:text-olive-400" />
                <span className="hidden xl:inline">{t('toggleHeaderColumn')}</span>
              </Button>
            </div>
          )}

          {/* Delete Whole Table */}
          <div className="ms-auto">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => useSmart ? sendSmartCommand('delete-table') : editor.chain().focus().deleteTable().run()}
              className="h-7 px-2 text-[11px] gap-1 rounded-md border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 shadow-2xs"
              title={t('deleteTable')}
            >
              <Trash2 className="h-3 w-3" />
              <span>{t('deleteTable')}</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
