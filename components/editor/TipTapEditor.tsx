'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Placeholder from '@tiptap/extension-placeholder';
import { ReportImage } from './ReportImageNode';
import { TextColor, TextHighlight } from './CustomColorMarks';
import { EditorToolbar } from './EditorToolbar';
import { uploadReportImage } from '@/lib/db';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { AppLanguage } from '@/lib/i18n/dictionary';
import { Check, AlertCircle, Loader2 } from 'lucide-react';

interface TipTapEditorProps {
  reportId: string;
  initialContent: any;
  reportLanguage: AppLanguage;
  onSave: (contentJson: any) => Promise<void>;
  themeColor?: string;
  backgroundColor?: string;
}

export function TipTapEditor({
  reportId,
  initialContent,
  reportLanguage,
  onSave,
  themeColor = 'olive',
  backgroundColor = 'white',
}: TipTapEditorProps) {
  const { t } = useLanguage();
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [uploadingImage, setUploadingImage] = useState(false);
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
        class: 'prose prose-slate max-w-none focus:outline-none p-6 sm:p-8 min-h-[500px]',
      },
    },
    onUpdate: ({ editor: ed }) => {
      triggerAutosave(ed.getJSON());
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
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      {/* Editor Top Bar with Status and Toolbar */}
      <div className="flex flex-col border-b border-border">
        {/* Autosave Status Indicator */}
        <div className="flex items-center justify-between bg-muted/30 px-4 py-1.5 text-xs text-muted-foreground border-b border-border/50">
          <div className="flex items-center gap-1.5 font-medium">
            <span>{t('reportLanguage')}:</span>
            <span className="rounded bg-muted px-1.5 py-0.5 font-bold uppercase text-foreground">
              {reportLanguage}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {saveStatus === 'saving' && (
              <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>{t('autosaving')}</span>
              </div>
            )}
            {saveStatus === 'saved' && (
              <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <Check className="h-3.5 w-3.5" />
                <span>{t('autosaved')}</span>
              </div>
            )}
            {saveStatus === 'error' && (
              <div className="flex items-center gap-1 text-red-600 dark:text-red-400">
                <AlertCircle className="h-3.5 w-3.5" />
                <span>{t('saveFailed')}</span>
              </div>
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
        className={`transition-colors text-foreground ${
          backgroundColor === 'cream'
            ? 'bg-[#fdfcf7] dark:bg-[#1a1917]'
            : backgroundColor === 'cool'
            ? 'bg-[#f8fafc] dark:bg-[#0f172a]'
            : 'bg-card'
        }`}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
