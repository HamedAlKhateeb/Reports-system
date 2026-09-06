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
} from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';

interface EditorToolbarProps {
  editor: Editor | null;
  onImageUpload: (file: File) => void;
  uploadingImage?: boolean;
}

export function EditorToolbar({ editor, onImageUpload, uploadingImage }: EditorToolbarProps) {
  const { t } = useLanguage();
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

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50/80 p-2 text-slate-700">
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
      />

      {/* Headings */}
      <div className="flex items-center gap-0.5 border-e border-slate-200 pe-1.5 me-1">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          className={`rounded p-1.5 transition-colors ${
            editor.isActive('heading', { level: 1 })
              ? 'bg-teal-100 text-teal-800'
              : 'hover:bg-slate-200 text-slate-600'
          }`}
          title={t('heading1')}
        >
          <Heading1 className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={`rounded p-1.5 transition-colors ${
            editor.isActive('heading', { level: 2 })
              ? 'bg-teal-100 text-teal-800'
              : 'hover:bg-slate-200 text-slate-600'
          }`}
          title={t('heading2')}
        >
          <Heading2 className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          className={`rounded p-1.5 transition-colors ${
            editor.isActive('heading', { level: 3 })
              ? 'bg-teal-100 text-teal-800'
              : 'hover:bg-slate-200 text-slate-600'
          }`}
          title={t('heading3')}
        >
          <Heading3 className="h-4 w-4" />
        </button>
      </div>

      {/* Formatting: Bold, Italic */}
      <div className="flex items-center gap-0.5 border-e border-slate-200 pe-1.5 me-1">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`rounded p-1.5 transition-colors ${
            editor.isActive('bold')
              ? 'bg-teal-100 text-teal-800'
              : 'hover:bg-slate-200 text-slate-600'
          }`}
          title={t('bold')}
        >
          <Bold className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`rounded p-1.5 transition-colors ${
            editor.isActive('italic')
              ? 'bg-teal-100 text-teal-800'
              : 'hover:bg-slate-200 text-slate-600'
          }`}
          title={t('italic')}
        >
          <Italic className="h-4 w-4" />
        </button>
      </div>

      {/* Lists & Quote */}
      <div className="flex items-center gap-0.5 border-e border-slate-200 pe-1.5 me-1">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`rounded p-1.5 transition-colors ${
            editor.isActive('bulletList')
              ? 'bg-teal-100 text-teal-800'
              : 'hover:bg-slate-200 text-slate-600'
          }`}
          title={t('bulletList')}
        >
          <List className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={`rounded p-1.5 transition-colors ${
            editor.isActive('orderedList')
              ? 'bg-teal-100 text-teal-800'
              : 'hover:bg-slate-200 text-slate-600'
          }`}
          title={t('orderedList')}
        >
          <ListOrdered className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={`rounded p-1.5 transition-colors ${
            editor.isActive('blockquote')
              ? 'bg-teal-100 text-teal-800'
              : 'hover:bg-slate-200 text-slate-600'
          }`}
          title={t('blockquote')}
        >
          <Quote className="h-4 w-4" />
        </button>
      </div>

      {/* Table Operations */}
      <div className="flex items-center gap-1 border-e border-slate-200 pe-1.5 me-1">
        <button
          type="button"
          onClick={() =>
            editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
          }
          className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200 transition-colors"
          title={t('insertTable')}
        >
          <TableIcon className="h-3.5 w-3.5" />
          <span>{t('insertTable')}</span>
        </button>

        {editor.isActive('table') && (
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => editor.chain().focus().addRowAfter().run()}
              className="rounded p-1 text-slate-600 hover:bg-slate-200"
              title={t('addRowAfter')}
            >
              <Rows className="h-3.5 w-3.5 text-teal-700" />
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().deleteRow().run()}
              className="rounded p-1 text-slate-600 hover:bg-red-100 hover:text-red-700"
              title={t('deleteRow')}
            >
              <Trash2 className="h-3.5 w-3.5 text-red-500" />
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().addColumnAfter().run()}
              className="rounded p-1 text-slate-600 hover:bg-slate-200"
              title={t('addColumnAfter')}
            >
              <Columns className="h-3.5 w-3.5 text-teal-700" />
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().deleteColumn().run()}
              className="rounded p-1 text-slate-600 hover:bg-red-100 hover:text-red-700"
              title={t('deleteColumn')}
            >
              <Trash2 className="h-3.5 w-3.5 text-red-500" />
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().deleteTable().run()}
              className="rounded p-1 text-red-600 hover:bg-red-100"
              title={t('deleteTable')}
            >
              <Trash2 className="h-4 w-4 text-red-600" />
            </button>
          </div>
        )}
      </div>

      {/* Upload Image Button */}
      <div>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadingImage}
          className="flex items-center gap-1.5 rounded-lg bg-teal-50 border border-teal-200 px-2.5 py-1 text-xs font-semibold text-teal-800 hover:bg-teal-100 disabled:opacity-50 transition-colors"
          title={t('uploadImageBtn')}
        >
          <ImageIcon className="h-3.5 w-3.5 text-teal-600" />
          <span>{uploadingImage ? t('uploadingImage') : t('uploadImageBtn')}</span>
        </button>
      </div>
    </div>
  );
}
