'use client';

import React, { useRef, useState } from 'react';
import { Editor } from '@tiptap/react';
import {
  Bold,
  Italic,
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
} from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
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
  onImageUpload: (file: File) => void;
  uploadingImage?: boolean;
}

export function EditorToolbar({ editor, onImageUpload, uploadingImage }: EditorToolbarProps) {
  const { t, isRtl, lang } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showHighlightPicker, setShowHighlightPicker] = useState(false);
  const [showLinkPopover, setShowLinkPopover] = useState(false);
  const [linkUrlInput, setLinkUrlInput] = useState('');

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
    <div className="flex flex-col bg-card/60 backdrop-blur-sm w-full max-w-full">
      {/* Primary Toolbar */}
      <div className="flex flex-wrap items-center gap-1 p-1.5 sm:p-2 text-foreground w-full max-w-full overflow-x-auto">
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
            onClick={() => editor.chain().focus().toggleBold().run()}
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
            onClick={() => editor.chain().focus().toggleItalic().run()}
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

          {/* Link Button and Popover */}
          <div className="relative">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => {
                const prev = editor.getAttributes('link').href || '';
                setLinkUrlInput(prev);
                setShowLinkPopover(!showLinkPopover);
                setShowColorPicker(false);
                setShowHighlightPicker(false);
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

            {showLinkPopover && (
              <div className="absolute top-full start-0 z-50 mt-1.5 w-64 max-w-[calc(100vw-32px)] rounded-xl border border-border bg-card p-3 shadow-xl backdrop-blur-md">
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
              </div>
            )}
          </div>
        </div>

        <Separator orientation="vertical" className="h-4 mx-1 bg-border/80" />

        {/* Colors & Highlight Palette */}
        <div className="relative flex items-center gap-0.5">
          {/* Text Color Button */}
          <div className="relative">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowColorPicker(!showColorPicker);
                setShowHighlightPicker(false);
              }}
              className="h-8 px-1.5 rounded-lg text-muted-foreground hover:text-foreground gap-0.5"
              title={t('textColor')}
            >
              <Baseline className="h-4 w-4" />
              <ChevronDown className="h-2.5 w-2.5 opacity-60" />
            </Button>

            {showColorPicker && (
              <div className="absolute top-full start-0 z-50 mt-1 flex flex-col gap-1 rounded-xl border border-border bg-card p-2 shadow-xl">
                <div className="text-[11px] font-semibold text-muted-foreground px-1 mb-1">
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
                  className="mt-1 rounded-md border border-border/80 px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted text-center cursor-pointer"
                >
                  {t('removeColor')}
                </button>
              </div>
            )}
          </div>

          {/* Text Highlight Button */}
          <div className="relative">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowHighlightPicker(!showHighlightPicker);
                setShowColorPicker(false);
              }}
              className="h-8 px-1.5 rounded-lg text-muted-foreground hover:text-foreground gap-0.5"
              title={t('highlightColor')}
            >
              <Highlighter className="h-4 w-4" />
              <ChevronDown className="h-2.5 w-2.5 opacity-60" />
            </Button>

            {showHighlightPicker && (
              <div className="absolute top-full start-0 z-50 mt-1 flex flex-col gap-1 rounded-xl border border-border bg-card p-2 shadow-xl">
                <div className="text-[11px] font-semibold text-muted-foreground px-1 mb-1">
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
                  className="mt-1 rounded-md border border-border/80 px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted text-center cursor-pointer"
                >
                  {t('removeColor')}
                </button>
              </div>
            )}
          </div>
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
            onClick={() => editor.chain().focus().setTextAlign('right').run()}
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
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
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
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
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
            onClick={() => editor.chain().focus().setTextAlign('justify').run()}
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
            onClick={() => editor.chain().focus().setTextDirection('rtl').run()}
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
            onClick={() => editor.chain().focus().setTextDirection('ltr').run()}
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

        {/* Table Insert Button */}
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
            }
            className={cn(
              "h-8 gap-1.5 rounded-lg text-xs font-semibold shadow-2xs",
              isTableActive && "border-olive-600 bg-olive-50 dark:bg-olive-950/40 text-olive-800 dark:text-olive-300"
            )}
            title={t('insertTable')}
          >
            <TableIcon className="h-3.5 w-3.5" />
            <span>{t('insertTable')}</span>
          </Button>
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
      </div>

      {/* Contextual Table Management Sub-Toolbar (active when cursor is in table) */}
      {isTableActive && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border/70 bg-muted/40 px-2 sm:px-3 py-1.5 text-xs text-foreground w-full max-w-full overflow-x-auto">
          {/* Table Tools Label Badge */}
          <div className="flex items-center gap-1 text-[11px] font-bold text-olive-800 dark:text-olive-300 me-1">
            <TableIcon className="h-3.5 w-3.5" />
            <span>{t('tableControls')}:</span>
          </div>

          {/* Row Controls */}
          <div className="flex items-center gap-0.5 rounded-lg border border-border/70 bg-card p-0.5 shadow-2xs">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => editor.chain().focus().addRowBefore().run()}
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
              onClick={() => editor.chain().focus().addRowAfter().run()}
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
              onClick={() => editor.chain().focus().deleteRow().run()}
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
              onClick={() => editor.chain().focus().addColumnBefore().run()}
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
              onClick={() => editor.chain().focus().addColumnAfter().run()}
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
              onClick={() => editor.chain().focus().deleteColumn().run()}
              className="h-7 px-1.5 text-[11px] gap-1 rounded-md text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600"
              title={t('deleteColumn')}
            >
              <Trash2 className="h-3 w-3" />
              <span className="hidden md:inline">{t('deleteColumn')}</span>
            </Button>
          </div>

          {/* Merge & Split Cells */}
          <div className="flex items-center gap-0.5 rounded-lg border border-border/70 bg-card p-0.5 shadow-2xs">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => editor.chain().focus().mergeCells().run()}
              className="h-7 px-1.5 text-[11px] gap-1 rounded-md text-muted-foreground hover:text-foreground"
              title={t('mergeCells')}
            >
              <Merge className="h-3 w-3 text-olive-600 dark:text-olive-400" />
              <span className="hidden lg:inline">{t('mergeCells')}</span>
            </Button>
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
          </div>

          {/* Toggle Header Row / Column */}
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

          {/* Delete Whole Table */}
          <div className="ms-auto">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => editor.chain().focus().deleteTable().run()}
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
