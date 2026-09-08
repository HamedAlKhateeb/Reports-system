'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Editor } from '@tiptap/react';
import {
  Copy,
  Scissors,
  Clipboard,
  Bold,
  Italic,
  Link as LinkIcon,
  Unlink,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Table as TableIcon,
  Check,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  PilcrowLeft,
  PilcrowRight,
} from 'lucide-react';

interface EditorContextMenuProps {
  x: number;
  y: number;
  editor: Editor | null;
  isOpen: boolean;
  onClose: () => void;
  lang?: 'ar' | 'en';
}

export function EditorContextMenu({
  x,
  y,
  editor,
  isOpen,
  onClose,
  lang = 'ar',
}: EditorContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [adjustedPos, setAdjustedPos] = useState({ top: y, left: x });

  const isAr = lang === 'ar';

  // Reposition inside viewport
  useEffect(() => {
    if (!isOpen || !menuRef.current) return;
    const menuEl = menuRef.current;
    const rect = menuEl.getBoundingClientRect();
    const padding = 12;

    let finalX = x;
    let finalY = y;

    if (x + rect.width > window.innerWidth - padding) {
      finalX = window.innerWidth - rect.width - padding;
    }
    if (finalX < padding) finalX = padding;

    if (y + rect.height > window.innerHeight - padding) {
      finalY = window.innerHeight - rect.height - padding;
    }
    if (finalY < padding) finalY = padding;

    setAdjustedPos({ top: finalY, left: finalX });
  }, [x, y, isOpen]);

  // Outside click & ESC listener
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !editor) return null;

  const isLinkActive = editor.isActive('link');
  const isBoldActive = editor.isActive('bold');
  const isItalicActive = editor.isActive('italic');

  const handleCopy = async () => {
    try {
      const selected = editor.state.doc.textBetween(
        editor.state.selection.from,
        editor.state.selection.to,
        ' '
      );
      if (selected) {
        await navigator.clipboard.writeText(selected);
      } else {
        document.execCommand('copy');
      }
    } catch {
      document.execCommand('copy');
    }
    onClose();
  };

  const handleCut = async () => {
    try {
      const selected = editor.state.doc.textBetween(
        editor.state.selection.from,
        editor.state.selection.to,
        ' '
      );
      if (selected) {
        await navigator.clipboard.writeText(selected);
        editor.commands.deleteSelection();
      } else {
        document.execCommand('cut');
      }
    } catch {
      document.execCommand('cut');
    }
    onClose();
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        editor.chain().focus().insertContent(text).run();
      }
    } catch {
      document.execCommand('paste');
    }
    onClose();
  };

  const handleApplyLink = () => {
    let cleanUrl = linkUrl.trim();
    if (!cleanUrl) {
      editor.chain().focus().unsetLink().run();
    } else {
      if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://') && !cleanUrl.startsWith('mailto:')) {
        cleanUrl = 'https://' + cleanUrl;
      }
      editor.chain().focus().extendMarkRange('link').setLink({ href: cleanUrl }).run();
    }
    setShowLinkInput(false);
    onClose();
  };

  const handleRemoveLink = () => {
    editor.chain().focus().unsetLink().run();
    onClose();
  };

  return (
    <div
      ref={menuRef}
      style={{ top: `${adjustedPos.top}px`, left: `${adjustedPos.left}px` }}
      dir={isAr ? 'rtl' : 'ltr'}
      className="fixed z-50 min-w-[210px] max-w-[calc(100vw-24px)] max-h-[85vh] overflow-y-auto rounded-xl border border-border bg-card/95 p-1.5 text-xs text-card-foreground shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-100"
    >
      {/* Inline Link Prompt inside Context Menu */}
      {showLinkInput ? (
        <div className="p-2 space-y-2">
          <div className="font-semibold text-foreground text-[11px]">
            {isAr ? 'إدراج أو تعديل الرابط:' : 'Insert or Edit Link:'}
          </div>
          <input
            type="url"
            autoFocus
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleApplyLink();
              }
            }}
            placeholder="https://example.com"
            className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-olive-600 focus:ring-1 focus:ring-olive-600"
          />
          <div className="flex items-center justify-end gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => setShowLinkInput(false)}
              className="rounded px-2 py-1 text-muted-foreground hover:bg-muted"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="button"
              onClick={handleApplyLink}
              className="rounded bg-olive-700 px-2.5 py-1 text-white hover:bg-olive-800"
            >
              {isAr ? 'تطبيق' : 'Apply'}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Clipboard Group */}
          <div className="space-y-0.5">
            <button
              type="button"
              onClick={handleCopy}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Copy className="h-3.5 w-3.5" />
              <span>{isAr ? 'نسخ' : 'Copy'}</span>
              <span className="ms-auto text-[10px] opacity-50">Ctrl+C</span>
            </button>
            <button
              type="button"
              onClick={handleCut}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Scissors className="h-3.5 w-3.5" />
              <span>{isAr ? 'قص' : 'Cut'}</span>
              <span className="ms-auto text-[10px] opacity-50">Ctrl+X</span>
            </button>
            <button
              type="button"
              onClick={handlePaste}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Clipboard className="h-3.5 w-3.5" />
              <span>{isAr ? 'لصق' : 'Paste'}</span>
              <span className="ms-auto text-[10px] opacity-50">Ctrl+V</span>
            </button>
          </div>

          <div className="my-1 border-t border-border/60" />

          {/* Inline Formats & Link */}
          <div className="space-y-0.5">
            <button
              type="button"
              onClick={() => {
                editor.chain().focus().toggleBold().run();
                onClose();
              }}
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 transition-colors ${
                isBoldActive
                  ? 'bg-olive-100 text-olive-900 dark:bg-olive-950 dark:text-olive-200 font-bold'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Bold className="h-3.5 w-3.5" />
              <span>{isAr ? 'عريض (غامق)' : 'Bold'}</span>
              {isBoldActive && <Check className="ms-auto h-3.5 w-3.5 text-olive-600" />}
            </button>

            <button
              type="button"
              onClick={() => {
                editor.chain().focus().toggleItalic().run();
                onClose();
              }}
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 transition-colors ${
                isItalicActive
                  ? 'bg-olive-100 text-olive-900 dark:bg-olive-950 dark:text-olive-200 font-bold'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Italic className="h-3.5 w-3.5" />
              <span>{isAr ? 'مائل' : 'Italic'}</span>
              {isItalicActive && <Check className="ms-auto h-3.5 w-3.5 text-olive-600" />}
            </button>

            {/* Link Action */}
            <button
              type="button"
              onClick={() => {
                const prevUrl = editor.getAttributes('link').href || '';
                setLinkUrl(prevUrl);
                setShowLinkInput(true);
              }}
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 transition-colors ${
                isLinkActive
                  ? 'bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200 font-bold'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <LinkIcon className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
              <span>
                {isLinkActive
                  ? isAr
                    ? 'تعديل الرابط'
                    : 'Edit Link'
                  : isAr
                  ? 'إدراج رابط...'
                  : 'Add Link...'}
              </span>
            </button>

            {isLinkActive && (
              <button
                type="button"
                onClick={handleRemoveLink}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
              >
                <Unlink className="h-3.5 w-3.5" />
                <span>{isAr ? 'إزالة الرابط' : 'Remove Link'}</span>
              </button>
            )}
          </div>

          <div className="my-1 border-t border-border/60" />

          {/* Headings & Lists */}
          <div className="space-y-0.5">
            <button
              type="button"
              onClick={() => {
                editor.chain().focus().toggleHeading({ level: 1 }).run();
                onClose();
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Heading1 className="h-3.5 w-3.5 text-olive-700" />
              <span>{isAr ? 'عنوان رئيسي (H1)' : 'Heading 1'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                editor.chain().focus().toggleHeading({ level: 2 }).run();
                onClose();
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Heading2 className="h-3.5 w-3.5 text-olive-700" />
              <span>{isAr ? 'عنوان فرعي (H2)' : 'Heading 2'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                editor.chain().focus().toggleBulletList().run();
                onClose();
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <List className="h-3.5 w-3.5" />
              <span>{isAr ? 'قائمة نقطية' : 'Bullet List'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                editor.chain().focus().toggleOrderedList().run();
                onClose();
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <ListOrdered className="h-3.5 w-3.5" />
              <span>{isAr ? 'قائمة رقمية' : 'Numbered List'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                editor.chain().focus().toggleBlockquote().run();
                onClose();
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Quote className="h-3.5 w-3.5" />
              <span>{isAr ? 'اقتباس' : 'Blockquote'}</span>
            </button>
          </div>

          <div className="my-1 border-t border-border/60" />

          {/* Alignment Row */}
          <div className="px-2 py-1">
            <div className="text-[10px] font-semibold text-muted-foreground mb-1">
              {isAr ? 'محاذاة النص' : 'Text Alignment'}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  editor.chain().focus().setTextAlign('right').run();
                  onClose();
                }}
                className={`flex-1 flex items-center justify-center p-1.5 rounded-md text-xs transition-colors ${
                  editor.isActive({ textAlign: 'right' })
                    ? 'bg-olive-100 dark:bg-olive-950 text-olive-900 dark:text-olive-200 font-bold'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
                title={isAr ? 'محاذاة لليمين' : 'Align Right'}
              >
                <AlignRight className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  editor.chain().focus().setTextAlign('center').run();
                  onClose();
                }}
                className={`flex-1 flex items-center justify-center p-1.5 rounded-md text-xs transition-colors ${
                  editor.isActive({ textAlign: 'center' })
                    ? 'bg-olive-100 dark:bg-olive-950 text-olive-900 dark:text-olive-200 font-bold'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
                title={isAr ? 'محاذاة للوسط' : 'Align Center'}
              >
                <AlignCenter className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  editor.chain().focus().setTextAlign('left').run();
                  onClose();
                }}
                className={`flex-1 flex items-center justify-center p-1.5 rounded-md text-xs transition-colors ${
                  editor.isActive({ textAlign: 'left' })
                    ? 'bg-olive-100 dark:bg-olive-950 text-olive-900 dark:text-olive-200 font-bold'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
                title={isAr ? 'محاذاة لليسار' : 'Align Left'}
              >
                <AlignLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  editor.chain().focus().setTextAlign('justify').run();
                  onClose();
                }}
                className={`flex-1 flex items-center justify-center p-1.5 rounded-md text-xs transition-colors ${
                  editor.isActive({ textAlign: 'justify' })
                    ? 'bg-olive-100 dark:bg-olive-950 text-olive-900 dark:text-olive-200 font-bold'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
                title={isAr ? 'ضبط كلي' : 'Justify'}
              >
                <AlignJustify className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Text Direction: RTL, LTR */}
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground mb-1">
              {isAr ? 'اتجاه النص' : 'Text Direction'}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  editor.chain().focus().setTextDirection('rtl').run();
                  onClose();
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 p-1.5 rounded-md text-xs transition-colors ${
                  editor.isActive({ dir: 'rtl' }) || (!editor.isActive({ dir: 'ltr' }) && isAr)
                    ? 'bg-olive-100 dark:bg-olive-950 text-olive-900 dark:text-olive-200 font-bold'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
                title={isAr ? 'من اليمين لليسار (RTL)' : 'Right to Left (RTL)'}
              >
                <PilcrowLeft className="h-3.5 w-3.5" />
                <span className="text-[11px] font-medium">RTL</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  editor.chain().focus().setTextDirection('ltr').run();
                  onClose();
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 p-1.5 rounded-md text-xs transition-colors ${
                  editor.isActive({ dir: 'ltr' }) || (!editor.isActive({ dir: 'rtl' }) && !isAr)
                    ? 'bg-olive-100 dark:bg-olive-950 text-olive-900 dark:text-olive-200 font-bold'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
                title={isAr ? 'من اليسار لليمين (LTR)' : 'Left to Right (LTR)'}
              >
                <PilcrowRight className="h-3.5 w-3.5" />
                <span className="text-[11px] font-medium">LTR</span>
              </button>
            </div>
          </div>

          <div className="my-1 border-t border-border/60" />

          {/* Unified Table Insert (single entry point) */}
          <button
            type="button"
            onClick={() => {
              document.dispatchEvent(
                new CustomEvent('editor-insert-table-request')
              );
              onClose();
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-olive-800 dark:text-olive-300 hover:bg-olive-50 dark:hover:bg-olive-950 transition-colors"
          >
            <TableIcon className="h-3.5 w-3.5 text-olive-600" />
            <span>{isAr ? 'إدراج جدول' : 'Insert Table'}</span>
          </button>
        </>
      )}
    </div>
  );
}
