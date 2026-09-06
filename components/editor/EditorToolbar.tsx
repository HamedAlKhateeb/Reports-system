'use client';

import React, { useRef } from 'react';
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
} from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';

interface EditorToolbarProps {
  editor: Editor | null;
  onImageUpload: (file: File) => void;
  uploadingImage?: boolean;
}

export function EditorToolbar({ editor, onImageUpload, uploadingImage }: EditorToolbarProps) {
  const { t, isRtl } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!editor) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImageUpload(file);
    }
    // reset
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const isTableActive = editor.isActive('table');

  return (
    <div className="flex flex-col border-b border-border bg-card/60 backdrop-blur-sm">
      {/* Primary Toolbar */}
      <div className="flex flex-wrap items-center gap-1 p-2 text-foreground">
        {/* Hidden file input */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/*"
          className="hidden"
        />

        {/* Headings */}
        <div className="flex items-center gap-0.5 border-e border-border pe-1.5 me-1">
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            className={`rounded-lg p-1.5 transition-colors ${
              editor.isActive('heading', { level: 1 })
                ? 'bg-olive-100 text-olive-900 dark:bg-olive-900/40 dark:text-olive-200 font-bold'
                : 'hover:bg-muted text-muted-foreground hover:text-foreground'
            }`}
            title={t('heading1')}
          >
            <Heading1 className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={`rounded-lg p-1.5 transition-colors ${
              editor.isActive('heading', { level: 2 })
                ? 'bg-olive-100 text-olive-900 dark:bg-olive-900/40 dark:text-olive-200 font-bold'
                : 'hover:bg-muted text-muted-foreground hover:text-foreground'
            }`}
            title={t('heading2')}
          >
            <Heading2 className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            className={`rounded-lg p-1.5 transition-colors ${
              editor.isActive('heading', { level: 3 })
                ? 'bg-olive-100 text-olive-900 dark:bg-olive-900/40 dark:text-olive-200 font-bold'
                : 'hover:bg-muted text-muted-foreground hover:text-foreground'
            }`}
            title={t('heading3')}
          >
            <Heading3 className="h-4 w-4" />
          </button>
        </div>

        {/* Formatting: Bold, Italic */}
        <div className="flex items-center gap-0.5 border-e border-border pe-1.5 me-1">
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`rounded-lg p-1.5 transition-colors ${
              editor.isActive('bold')
                ? 'bg-olive-100 text-olive-900 dark:bg-olive-900/40 dark:text-olive-200 font-bold'
                : 'hover:bg-muted text-muted-foreground hover:text-foreground'
            }`}
            title={t('bold')}
          >
            <Bold className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`rounded-lg p-1.5 transition-colors ${
              editor.isActive('italic')
                ? 'bg-olive-100 text-olive-900 dark:bg-olive-900/40 dark:text-olive-200 font-bold'
                : 'hover:bg-muted text-muted-foreground hover:text-foreground'
            }`}
            title={t('italic')}
          >
            <Italic className="h-4 w-4" />
          </button>
        </div>

        {/* Lists & Quote */}
        <div className="flex items-center gap-0.5 border-e border-border pe-1.5 me-1">
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`rounded-lg p-1.5 transition-colors ${
              editor.isActive('bulletList')
                ? 'bg-olive-100 text-olive-900 dark:bg-olive-900/40 dark:text-olive-200'
                : 'hover:bg-muted text-muted-foreground hover:text-foreground'
            }`}
            title={t('bulletList')}
          >
            <List className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={`rounded-lg p-1.5 transition-colors ${
              editor.isActive('orderedList')
                ? 'bg-olive-100 text-olive-900 dark:bg-olive-900/40 dark:text-olive-200'
                : 'hover:bg-muted text-muted-foreground hover:text-foreground'
            }`}
            title={t('orderedList')}
          >
            <ListOrdered className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            className={`rounded-lg p-1.5 transition-colors ${
              editor.isActive('blockquote')
                ? 'bg-olive-100 text-olive-900 dark:bg-olive-900/40 dark:text-olive-200'
                : 'hover:bg-muted text-muted-foreground hover:text-foreground'
            }`}
            title={t('blockquote')}
          >
            <Quote className="h-4 w-4" />
          </button>
        </div>

        {/* Table Insert Button */}
        <div className="flex items-center gap-1 border-e border-border pe-1.5 me-1">
          <button
            type="button"
            onClick={() =>
              editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
            }
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
              isTableActive
                ? 'bg-olive-600 text-white dark:bg-olive-600'
                : 'text-foreground hover:bg-muted border border-border/80'
            }`}
            title={t('insertTable')}
          >
            <TableIcon className="h-3.5 w-3.5" />
            <span>{t('insertTable')}</span>
          </button>
        </div>

        {/* Upload Image Button */}
        <div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingImage}
            className="flex items-center gap-1.5 rounded-lg bg-olive-50 dark:bg-olive-900/20 border border-olive-200 dark:border-olive-800/50 px-2.5 py-1 text-xs font-semibold text-olive-800 dark:text-olive-300 hover:bg-olive-100 dark:hover:bg-olive-900/40 disabled:opacity-50 transition-colors"
            title={t('uploadImageBtn')}
          >
            <ImageIcon className="h-3.5 w-3.5 text-olive-600 dark:text-olive-400" />
            <span>{uploadingImage ? t('uploadingImage') : t('uploadImageBtn')}</span>
          </button>
        </div>
      </div>

      {/* Contextual Table Management Sub-Toolbar (active when cursor is in table) */}
      {isTableActive && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border/70 bg-olive-50/60 dark:bg-olive-950/30 px-3 py-1.5 text-xs text-foreground">
          {/* Table Tools Label Badge */}
          <div className="flex items-center gap-1 text-[11px] font-bold text-olive-800 dark:text-olive-300 me-1">
            <TableIcon className="h-3 w-3" />
            <span>{t('tableControls')}:</span>
          </div>

          {/* Row Controls */}
          <div className="flex items-center gap-0.5 rounded-md border border-border/60 bg-card p-0.5">
            <button
              type="button"
              onClick={() => editor.chain().focus().addRowBefore().run()}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title={t('addRowBefore')}
            >
              <Rows className="h-3 w-3 text-olive-600 dark:text-olive-400" />
              <ArrowUp className="h-2.5 w-2.5" />
              <span className="hidden sm:inline">{t('addRowBefore')}</span>
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().addRowAfter().run()}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title={t('addRowAfter')}
            >
              <Rows className="h-3 w-3 text-olive-600 dark:text-olive-400" />
              <ArrowDown className="h-2.5 w-2.5" />
              <span className="hidden sm:inline">{t('addRowAfter')}</span>
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().deleteRow().run()}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600 transition-colors"
              title={t('deleteRow')}
            >
              <Trash2 className="h-3 w-3" />
              <span className="hidden md:inline">{t('deleteRow')}</span>
            </button>
          </div>

          {/* Column Controls */}
          <div className="flex items-center gap-0.5 rounded-md border border-border/60 bg-card p-0.5">
            <button
              type="button"
              onClick={() => editor.chain().focus().addColumnBefore().run()}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title={t('addColumnBefore')}
            >
              <Columns className="h-3 w-3 text-olive-600 dark:text-olive-400" />
              {isRtl ? <ArrowRight className="h-2.5 w-2.5" /> : <ArrowLeft className="h-2.5 w-2.5" />}
              <span className="hidden sm:inline">{t('addColumnBefore')}</span>
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().addColumnAfter().run()}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title={t('addColumnAfter')}
            >
              <Columns className="h-3 w-3 text-olive-600 dark:text-olive-400" />
              {isRtl ? <ArrowLeft className="h-2.5 w-2.5" /> : <ArrowRight className="h-2.5 w-2.5" />}
              <span className="hidden sm:inline">{t('addColumnAfter')}</span>
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().deleteColumn().run()}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600 transition-colors"
              title={t('deleteColumn')}
            >
              <Trash2 className="h-3 w-3" />
              <span className="hidden md:inline">{t('deleteColumn')}</span>
            </button>
          </div>

          {/* Merge & Split Cells */}
          <div className="flex items-center gap-0.5 rounded-md border border-border/60 bg-card p-0.5">
            <button
              type="button"
              onClick={() => editor.chain().focus().mergeCells().run()}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title={t('mergeCells')}
            >
              <Merge className="h-3 w-3 text-olive-600 dark:text-olive-400" />
              <span className="hidden lg:inline">{t('mergeCells')}</span>
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().splitCell().run()}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title={t('splitCell')}
            >
              <Split className="h-3 w-3 text-olive-600 dark:text-olive-400" />
              <span className="hidden lg:inline">{t('splitCell')}</span>
            </button>
          </div>

          {/* Toggle Header Row / Column */}
          <div className="flex items-center gap-0.5 rounded-md border border-border/60 bg-card p-0.5">
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleHeaderRow().run()}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title={t('toggleHeaderRow')}
            >
              <Heading className="h-3 w-3 text-olive-600 dark:text-olive-400" />
              <span className="hidden xl:inline">{t('toggleHeaderRow')}</span>
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleHeaderColumn().run()}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title={t('toggleHeaderColumn')}
            >
              <Columns className="h-3 w-3 text-olive-600 dark:text-olive-400" />
              <span className="hidden xl:inline">{t('toggleHeaderColumn')}</span>
            </button>
          </div>

          {/* Delete Whole Table */}
          <div className="ms-auto">
            <button
              type="button"
              onClick={() => editor.chain().focus().deleteTable().run()}
              className="flex items-center gap-1 rounded-md border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/30 px-2 py-0.5 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors"
              title={t('deleteTable')}
            >
              <Trash2 className="h-3 w-3" />
              <span>{t('deleteTable')}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
