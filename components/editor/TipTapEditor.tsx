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
import { ReportImage } from './ReportImageNode';
import { TextColor, TextHighlight } from './CustomColorMarks';
import { EditorToolbar } from './EditorToolbar';
import { EditorContextMenu } from './EditorContextMenu';
import { uploadReportImage } from '@/lib/db';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { AppLanguage } from '@/lib/i18n/dictionary';
import { Check, AlertCircle, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface TipTapEditorProps {
  reportId: string;
  initialContent: any;
  reportLanguage: AppLanguage;
  onSave: (contentJson: any) => Promise<void>;
  onContentChange?: (contentJson: any) => void;
  themeColor?: string;
  backgroundColor?: string;
}

export function TipTapEditor({
  reportId,
  initialContent,
  reportLanguage,
  onSave,
  onContentChange,
  themeColor = 'olive',
  backgroundColor = 'white',
}: TipTapEditorProps) {
  const { t } = useLanguage();
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ isOpen: boolean; x: number; y: number }>({
    isOpen: false,
    x: 0,
    y: 0,
  });
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

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

  const handleImageFile = async (file: File) => {
    if (!file || !file.type.startsWith('image/')) return;
    try {
      setUploadingImage(true);
      const uploadedItem = await uploadReportImage(reportId, file, '', reportLanguage);
      if (editor) {
        editor
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
          })
          .run();
        // Immediately trigger save and notify parent
        const json = editor.getJSON();
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

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Table.configure({
        resizable: true,
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
    ],
    content: initialContent || '',
    editorProps: {
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.startsWith('image/')) {
            const file = items[i].getAsFile();
            if (file) {
              handleImageFile(file);
              return true; // Handled
            }
          }
        }
        return false;
      },
      handleDrop: (view, event) => {
        const files = event.dataTransfer?.files;
        if (!files || files.length === 0) return false;
        const file = files[0];
        if (file.type.startsWith('image/')) {
          handleImageFile(file);
          return true; // Handled
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

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const dir = reportLanguage === 'ar' ? 'rtl' : 'ltr';

  return (
    <div className="w-full max-w-full rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      {/* Editor Top Bar with Status and Toolbar */}
      <div className="flex flex-col border-b border-border w-full max-w-full">
        {/* Autosave Status Indicator */}
        <div className="flex items-center justify-between bg-muted/30 px-3 sm:px-4 py-1.5 text-xs text-muted-foreground border-b border-border/50">
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

      {/* Editor Content Area respecting Report Language, Direction, and Background */}
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
        className={`w-full max-w-full overflow-x-auto transition-colors text-foreground ${
          backgroundColor === 'cream'
            ? 'bg-[#fdfcf7] dark:bg-[#1a1917]'
            : backgroundColor === 'cool'
            ? 'bg-[#f8fafc] dark:bg-[#0f172a]'
            : 'bg-card'
        }`}
      >
        <div className="w-full min-w-full">
          <EditorContent editor={editor} />
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
