'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import TextDirection from './TextDirectionExtension';
import { ReportImage } from './ReportImageNode';
import { TextColor, TextHighlight } from './CustomColorMarks';
import { FontSize } from './FontSizeMark';
import { EditorToolbar } from './EditorToolbar';
import { EditorContextMenu } from './EditorContextMenu';
import { TableFillHandle } from './TableFillHandle';
import { uploadReportImage } from '@/lib/db';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { AppLanguage } from '@/lib/i18n/dictionary';
import { getReportTheme, getReportBackground } from '@/lib/report-theme-config';
import {
  getCustomShortcuts,
  normalizeKeyboardEvent,
  SHORTCUTS_STORAGE_KEY,
} from '@/lib/shortcuts';
import { Check, AlertCircle, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface TipTapEditorProps {
  reportId: string;
  initialContent: any;
  reportLanguage: AppLanguage;
  onSave: (contentJson: any) => Promise<void>;
  onContentChange?: (contentJson: any) => void;
  onSaveImmediately?: () => Promise<void>;
  themeColor?: string;
  backgroundColor?: string;
}

export function TipTapEditor({
  reportId,
  initialContent,
  reportLanguage,
  onSave,
  onContentChange,
  onSaveImmediately,
  themeColor = 'olive',
  backgroundColor = 'white',
}: TipTapEditorProps) {
  const { t } = useLanguage();
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [isSticky, setIsSticky] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<{ isOpen: boolean; x: number; y: number }>({
    isOpen: false,
    x: 0,
    y: 0,
  });
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const editorRef = useRef<any>(null);
  const shortcutsMapRef = useRef<Record<string, string>>({});
  const onSaveImmediatelyRef = useRef(onSaveImmediately);
  onSaveImmediatelyRef.current = onSaveImmediately;

  const reloadShortcuts = useCallback(() => {
    const list = getCustomShortcuts();
    const map: Record<string, string> = {};
    list.forEach((s) => {
      map[s.action] = s.currentKey.toLowerCase();
    });
    shortcutsMapRef.current = map;
  }, []);

  useEffect(() => {
    reloadShortcuts();
    const handleStorage = (e: StorageEvent) => {
      if (e.key === SHORTCUTS_STORAGE_KEY) {
        reloadShortcuts();
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [reloadShortcuts]);

  const saveContent = useCallback(
    async (json: any) => {
      try {
        setSaveStatus('saving');
        await onSave(json);
        setSaveStatus('saved');
      } catch (err) {
        console.error('Autosave error:', err);
        setSaveStatus('error');
      }
    },
    [onSave]
  );

  const triggerAutosave = useCallback(
    (json: any) => {
      setSaveStatus('saving');
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        saveContent(json);
      }, 2000); // 2-second debounce per spec
    },
    [saveContent]
  );

  const handleImmediateSave = useCallback(async () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (onSaveImmediatelyRef.current) {
      setSaveStatus('saving');
      try {
        await onSaveImmediatelyRef.current();
        setSaveStatus('saved');
      } catch (e) {
        console.error('Immediate save failed:', e);
        setSaveStatus('error');
      }
    } else if (editorRef.current) {
      const json = editorRef.current.getJSON();
      saveContent(json);
    }
  }, [saveContent]);

  const uploadQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingMaxSeqRef = useRef<number>(0);

  const processImageUpload = async (file: File) => {
    if (!file || !file.type.startsWith('image/')) return;
    try {
      setUploadingImage(true);
      const ed = editorRef.current;
      let docMax = 0;
      if (ed) {
        ed.state.doc.descendants((node: any) => {
          if (node.type.name === 'reportImage') {
            const seq = Number(node.attrs.sequenceNumber);
            if (!isNaN(seq) && seq > docMax) {
              docMax = seq;
            }
          }
        });
      }
      const targetSeq = Math.max(docMax, pendingMaxSeqRef.current) + 1;
      pendingMaxSeqRef.current = targetSeq;

      const uploadedItem = await uploadReportImage(reportId, file, '', reportLanguage, targetSeq);

      // Measure natural dimensions for instant zero-shift layout
      let naturalWidth: number | undefined;
      let naturalHeight: number | undefined;
      try {
        const tempImg = new Image();
        tempImg.src = URL.createObjectURL(file);
        await new Promise((resolve) => {
          tempImg.onload = resolve;
          tempImg.onerror = resolve;
        });
        if (tempImg.naturalWidth && tempImg.naturalHeight) {
          naturalWidth = tempImg.naturalWidth;
          naturalHeight = tempImg.naturalHeight;
        }
        URL.revokeObjectURL(tempImg.src);
      } catch {
        // Fallback gracefully to runtime onLoad in ReportImageView
      }

      const activeEditor = editorRef.current;
      if (activeEditor) {
        activeEditor
          .chain()
          .focus()
          .setReportImage({
            src: uploadedItem.downloadUrl,
            storagePath: uploadedItem.storagePath,
            sequenceNumber: uploadedItem.sequenceNumber,
            fileName: uploadedItem.fileName,
            caption: uploadedItem.caption,
            reportId,
            imageId: uploadedItem.id,
            naturalWidth,
            naturalHeight,
            zoom: '100%',
            width: '100%',
          })
          .run();
        // Immediately trigger save and notify parent
        const json = activeEditor.getJSON();
        if (onContentChange) {
          onContentChange(json);
        }
        setTimeout(() => {
          saveContent(json);
        }, 100);
      }
    } catch (err) {
      console.error('Image upload failed', err);
      alert(t('imageUploadFailed'));
    } finally {
      setUploadingImage(false);
    }
  };

  const handleImageFile = (file: File) => {
    uploadQueueRef.current = uploadQueueRef.current
      .then(() => processImageUpload(file))
      .catch((err) => {
        console.error('Queue upload error', err);
      });
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Table.configure({
        resizable: true,
        cellMinWidth: 110,
      }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({
        placeholder: reportLanguage === 'ar' ? 'ابدأ كتابة محتوى التقرير هنا...' : 'Start writing report content here...',
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: 'https',
        HTMLAttributes: {
          class: 'text-blue-600 underline hover:text-blue-800 transition-colors cursor-pointer',
        },
      }),
      ReportImage,
      TextColor,
      TextHighlight,
      FontSize,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
        alignments: ['left', 'center', 'right', 'justify'],
      }),
      TextDirection,
    ],
    content: initialContent || '',
    editorProps: {
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;
        const imageFiles: File[] = [];
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.startsWith('image/')) {
            const file = items[i].getAsFile();
            if (file) {
              imageFiles.push(file);
            }
          }
        }
        if (imageFiles.length > 0) {
          imageFiles.forEach((file) => handleImageFile(file));
          return true; // Handled
        }
        return false;
      },
      handleDrop: (view, event) => {
        const files = event.dataTransfer?.files;
        if (!files || files.length === 0) return false;
        const imageFiles: File[] = [];
        for (let i = 0; i < files.length; i++) {
          if (files[i].type.startsWith('image/')) {
            imageFiles.push(files[i]);
          }
        }
        if (imageFiles.length > 0) {
          imageFiles.forEach((file) => handleImageFile(file));
          return true; // Handled
        }
        return false;
      },
      handleKeyDown: (view, event) => {
        // PRESERVE BUILT-IN TABLE TAB BEHAVIOR:
        // When pressing Tab or Shift+Tab inside a table cell, let TipTap's table extension
        // navigate cells or automatically append a new row at the end of the table.
        if (event.key === 'Tab') {
          return false;
        }

        const combo = normalizeKeyboardEvent(event);
        if (!combo) return false;

        const map = shortcutsMapRef.current;
        const isAction = (act: string) => map[act] === combo;

        // Immediate Save (Ctrl+S)
        if (isAction('save')) {
          event.preventDefault();
          handleImmediateSave();
          return true;
        }

        // Focus title input (Alt+T)
        if (isAction('focus_title')) {
          event.preventDefault();
          const titleInput = document.getElementById('report-title-input');
          if (titleInput) {
            titleInput.focus();
            (titleInput as HTMLInputElement).select?.();
          }
          return true;
        }

        // Focus editor (Alt+E)
        if (isAction('focus_editor')) {
          event.preventDefault();
          editorRef.current?.commands.focus();
          return true;
        }

        // Bold (Ctrl+B)
        if (isAction('bold')) {
          event.preventDefault();
          editorRef.current?.chain().focus().toggleBold().run();
          return true;
        }

        // Italic (Ctrl+I)
        if (isAction('italic')) {
          event.preventDefault();
          editorRef.current?.chain().focus().toggleItalic().run();
          return true;
        }

        // Heading 1 (Ctrl+Alt+1)
        if (isAction('h1')) {
          event.preventDefault();
          editorRef.current?.chain().focus().toggleHeading({ level: 1 }).run();
          return true;
        }

        // Heading 2 (Ctrl+Alt+2)
        if (isAction('h2')) {
          event.preventDefault();
          editorRef.current?.chain().focus().toggleHeading({ level: 2 }).run();
          return true;
        }

        // Heading 3 (Ctrl+Alt+3)
        if (isAction('h3')) {
          event.preventDefault();
          editorRef.current?.chain().focus().toggleHeading({ level: 3 }).run();
          return true;
        }

        // Paragraph (Ctrl+Alt+0)
        if (isAction('paragraph')) {
          event.preventDefault();
          editorRef.current?.chain().focus().setParagraph().run();
          return true;
        }

        // Bullet List (Ctrl+Shift+8)
        if (isAction('bullet_list')) {
          event.preventDefault();
          editorRef.current?.chain().focus().toggleBulletList().run();
          return true;
        }

        // Ordered List (Ctrl+Shift+7)
        if (isAction('ordered_list')) {
          event.preventDefault();
          editorRef.current?.chain().focus().toggleOrderedList().run();
          return true;
        }

        // Blockquote (Ctrl+Shift+Q or Ctrl+Shift+.)
        if (isAction('blockquote') || combo === 'ctrl+shift+.') {
          event.preventDefault();
          editorRef.current?.chain().focus().toggleBlockquote().run();
          return true;
        }

        // Increase Font Size (+2px) (Ctrl+Shift+>)
        if (isAction('increase_font_size')) {
          event.preventDefault();
          if (editorRef.current) {
            const ed = editorRef.current;
            const sizeAttr = ed.getAttributes('fontSize').size;
            let current = 16;
            if (sizeAttr) {
              const p = parseInt(sizeAttr, 10);
              if (!isNaN(p) && p > 0) current = p;
            } else if (ed.isActive('heading', { level: 1 })) current = 30;
            else if (ed.isActive('heading', { level: 2 })) current = 24;
            else if (ed.isActive('heading', { level: 3 })) current = 20;

            const next = Math.min(72, current + 2);
            ed.chain().focus().setFontSize(`${next}px`).run();
          }
          return true;
        }

        // Decrease Font Size (-2px) (Ctrl+Shift+<)
        if (isAction('decrease_font_size')) {
          event.preventDefault();
          if (editorRef.current) {
            const ed = editorRef.current;
            const sizeAttr = ed.getAttributes('fontSize').size;
            let current = 16;
            if (sizeAttr) {
              const p = parseInt(sizeAttr, 10);
              if (!isNaN(p) && p > 0) current = p;
            } else if (ed.isActive('heading', { level: 1 })) current = 30;
            else if (ed.isActive('heading', { level: 2 })) current = 24;
            else if (ed.isActive('heading', { level: 3 })) current = 20;

            const next = Math.max(10, current - 2);
            ed.chain().focus().setFontSize(`${next}px`).run();
          }
          return true;
        }

        // Table add row (Ctrl+Alt+Down)
        if (isAction('table_add_row')) {
          event.preventDefault();
          if (editorRef.current?.isActive('table')) {
            editorRef.current.chain().focus().addRowAfter().run();
          }
          return true;
        }

        // Table delete row (Ctrl+Alt+Backspace)
        if (isAction('table_delete_row')) {
          event.preventDefault();
          if (editorRef.current?.isActive('table')) {
            editorRef.current.chain().focus().deleteRow().run();
          }
          return true;
        }

        // Text Direction RTL (Ctrl+Alt+R)
        if (isAction('dir_rtl')) {
          event.preventDefault();
          editorRef.current?.chain().focus().setTextDirection('rtl').run();
          return true;
        }

        // Text Direction LTR (Ctrl+Alt+L)
        if (isAction('dir_ltr')) {
          event.preventDefault();
          editorRef.current?.chain().focus().setTextDirection('ltr').run();
          return true;
        }

        return false;
      },
      attributes: {
        class: 'prose prose-slate max-w-none focus:outline-none p-3.5 sm:p-6 md:p-8 min-h-[500px] w-full',
      },
    },
    onUpdate: ({ editor: ed }) => {
      const json = ed.getJSON();
      if (onContentChange) {
        onContentChange(json);
      }
      triggerAutosave(json);
    },
  });

  editorRef.current = editor;

  // Window-level shortcuts listener for immediate saving or jumping between fields
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // If active element is within a form field or editor, let handleKeyDown do it
      // but still catch Ctrl+S globally
      const combo = normalizeKeyboardEvent(e);
      if (!combo) return;

      const map = shortcutsMapRef.current;

      if (map['save'] === combo) {
        e.preventDefault();
        handleImmediateSave();
      } else if (map['focus_title'] === combo) {
        e.preventDefault();
        const titleInput = document.getElementById('report-title-input');
        if (titleInput) {
          titleInput.focus();
          (titleInput as HTMLInputElement).select?.();
        }
      } else if (map['focus_editor'] === combo) {
        e.preventDefault();
        editorRef.current?.commands.focus();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handleImmediateSave]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Dynamic scroll listener to elevate and stick toolbar right under Navbar (top-16 = 64px)
  useEffect(() => {
    const handleScroll = () => {
      if (!sentinelRef.current) return;
      const rect = sentinelRef.current.getBoundingClientRect();
      setIsSticky(rect.top <= 64);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const dir = reportLanguage === 'ar' ? 'rtl' : 'ltr';
  const themeConfig = getReportTheme(themeColor);
  const bgConfig = getReportBackground(backgroundColor);

  return (
    <div className="w-full max-w-full rounded-xl border border-border bg-card shadow-sm transition-colors relative">
      {/* Sentinel for sticky toolbar detection */}
      <div ref={sentinelRef} className="h-0 w-full pointer-events-none" />

      {/* Dynamic Sticky Top Bar with Status and Toolbar */}
      <div
        className={cn(
          "sticky top-16 z-30 flex flex-col w-full max-w-full transition-all duration-150 border-b border-border",
          isSticky
            ? "bg-card/95 backdrop-blur-md shadow-md rounded-none"
            : "bg-card rounded-t-xl"
        )}
      >
        {/* Autosave Status Indicator */}
        <div
          className={cn(
            "flex items-center justify-between px-3 sm:px-4 py-1.5 text-xs text-muted-foreground border-b border-border/50 transition-colors",
            isSticky ? "bg-muted/70" : "bg-muted/30 rounded-t-xl"
          )}
        >
          <div className="flex items-center gap-1.5 font-medium">
            <span>{t('reportLanguage')}:</span>
            <Badge variant="secondary" className="px-1.5 py-0 font-bold uppercase text-[10px] rounded-md">
              {reportLanguage}
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            {saveStatus === 'saving' && (
              <Badge variant="outline" className="gap-1 border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400 text-[11px] py-0.5 font-semibold">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>{t('autosaving')}</span>
              </Badge>
            )}
            {saveStatus === 'saved' && (
              <Badge variant="outline" className="gap-1 border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400 text-[11px] py-0.5 font-semibold">
                <Check className="h-3 w-3" />
                <span>{t('autosaved')}</span>
              </Badge>
            )}
            {saveStatus === 'error' && (
              <Badge variant="destructive" className="gap-1 text-[11px] py-0.5 font-semibold">
                <AlertCircle className="h-3 w-3" />
                <span>{t('saveFailed')}</span>
              </Badge>
            )}
          </div>
        </div>

        {/* Toolbar */}
        <EditorToolbar
          editor={editor}
          onImageUpload={handleImageFile}
          uploadingImage={uploadingImage}
        />
      </div>

      {/* Editor Content Area respecting Report Language, Direction, Theme, and Background */}
      <div
        dir={dir}
        onContextMenu={(e) => {
          e.preventDefault();
          setContextMenu({
            isOpen: true,
            x: e.clientX,
            y: e.clientY,
          });
        }}
        style={{
          '--editor-th-bg': themeConfig.thBg,
          '--editor-th-text': themeConfig.thText,
          '--editor-quote-border': themeConfig.quoteBorder,
          '--editor-quote-bg': themeConfig.quoteBg,
          '--editor-h3-color': themeConfig.h3Color,
          '--editor-accent': themeConfig.accent,
        } as React.CSSProperties}
        className={cn(
          "w-full max-w-full overflow-x-hidden rounded-b-xl transition-colors",
          backgroundColor === 'cream'
            ? 'bg-[#FAF7F0] dark:bg-[#1C1A17] text-[#2D2820] dark:text-[#F5EFEB]'
            : backgroundColor === 'cool'
            ? 'bg-[#F0F4F8] dark:bg-[#0F172A] text-[#0F172A] dark:text-[#E2E8F0]'
            : 'bg-[#FFFFFF] dark:bg-[#161615] text-[#1E293B] dark:text-[#F1F5F9]'
        )}
      >
        <div className="w-full min-w-full relative">
          <EditorContent editor={editor} />
          <TableFillHandle editor={editor} />
        </div>
      </div>

      {/* Interactive Right-Click Context Menu */}
      <EditorContextMenu
        x={contextMenu.x}
        y={contextMenu.y}
        editor={editor}
        isOpen={contextMenu.isOpen}
        onClose={() => setContextMenu((prev) => ({ ...prev, isOpen: false }))}
        lang={reportLanguage}
      />
    </div>
  );
}
