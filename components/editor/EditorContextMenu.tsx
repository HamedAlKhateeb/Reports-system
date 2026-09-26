'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Editor } from '@tiptap/react';
import {
  Copy,
  CopyPlus,
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
  Search,
  Sparkles,
  ExternalLink,
  Loader2,
  Rows,
  Columns,
  Trash2,
} from 'lucide-react';
import { CellSelection, TableMap } from '@tiptap/pm/tables';
import { getSpellingSuggestions, fetchAiSpellingSuggestions } from '@/lib/spellcheck-engine';
import { getLocalAiConfig } from '@/lib/ai-config';
import { isMarkdown, markdownToHtml } from '@/lib/markdown';

interface EditorContextMenuProps {
  x: number;
  y: number;
  editor: Editor | null;
  isOpen: boolean;
  onClose: () => void;
  lang?: 'ar' | 'en';
  targetWord?: string;
  targetRange?: { from: number; to: number } | null;
  contextSentence?: string;
}

function truncate(str: string, maxLen: number = 22): string {
  if (!str) return '';
  return str.length > maxLen ? str.slice(0, maxLen) + '…' : str;
}

function selectTableRow(ed: Editor | null) {
  if (!ed) return;
  const { state, view } = ed;
  let tableNode: any = null;
  let tablePos = -1;
  let cellPos = -1;
  for (let d = state.selection.$from.depth; d > 0; d--) {
    const node = state.selection.$from.node(d);
    if (cellPos === -1 && (node.type.name === 'tableCell' || node.type.name === 'tableHeader')) {
      cellPos = state.selection.$from.before(d);
    }
    if (node.type.name === 'table') {
      tableNode = node;
      tablePos = state.selection.$from.before(d);
      break;
    }
  }
  if (!tableNode || tablePos === -1 || cellPos === -1) return;
  const map = TableMap.get(tableNode);
  const rect = map.findCell(cellPos - tablePos - 1);
  const anchorCellPos = tablePos + 1 + map.map[rect.top * map.width];
  const headCellPos = tablePos + 1 + map.map[rect.top * map.width + map.width - 1];
  const $anchor = state.doc.resolve(anchorCellPos);
  const $head = state.doc.resolve(headCellPos);
  const sel = new CellSelection($anchor, $head);
  view.dispatch(state.tr.setSelection(sel));
}

function selectTableColumn(ed: Editor | null) {
  if (!ed) return;
  const { state, view } = ed;
  let tableNode: any = null;
  let tablePos = -1;
  let cellPos = -1;
  for (let d = state.selection.$from.depth; d > 0; d--) {
    const node = state.selection.$from.node(d);
    if (cellPos === -1 && (node.type.name === 'tableCell' || node.type.name === 'tableHeader')) {
      cellPos = state.selection.$from.before(d);
    }
    if (node.type.name === 'table') {
      tableNode = node;
      tablePos = state.selection.$from.before(d);
      break;
    }
  }
  if (!tableNode || tablePos === -1 || cellPos === -1) return;
  const map = TableMap.get(tableNode);
  const rect = map.findCell(cellPos - tablePos - 1);
  const anchorCellPos = tablePos + 1 + map.map[rect.left];
  const headCellPos = tablePos + 1 + map.map[(map.height - 1) * map.width + rect.left];
  const $anchor = state.doc.resolve(anchorCellPos);
  const $head = state.doc.resolve(headCellPos);
  const sel = new CellSelection($anchor, $head);
  view.dispatch(state.tr.setSelection(sel));
}

function selectEntireTable(ed: Editor | null) {
  if (!ed) return;
  const { state, view } = ed;
  let tableNode: any = null;
  let tablePos = -1;
  for (let d = state.selection.$from.depth; d > 0; d--) {
    const node = state.selection.$from.node(d);
    if (node.type.name === 'table') {
      tableNode = node;
      tablePos = state.selection.$from.before(d);
      break;
    }
  }
  if (!tableNode || tablePos === -1) return;
  const map = TableMap.get(tableNode);
  const anchorCellPos = tablePos + 1 + map.map[0];
  const headCellPos = tablePos + 1 + map.map[map.map.length - 1];
  const $anchor = state.doc.resolve(anchorCellPos);
  const $head = state.doc.resolve(headCellPos);
  const sel = new CellSelection($anchor, $head);
  view.dispatch(state.tr.setSelection(sel));
}

export function EditorContextMenu({
  x,
  y,
  editor,
  isOpen,
  onClose,
  lang = 'ar',
  targetWord,
  targetRange,
  contextSentence,
}: EditorContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [adjustedPos, setAdjustedPos] = useState({ top: y, left: x });

  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [isAiLoading, setIsAiLoading] = useState(false);

  const isAr = lang === 'ar';

  // Offline rule-based & dictionary suggestions
  const offlineSuggestions = useMemo(() => {
    if (!targetWord || !targetWord.trim()) return [];
    return getSpellingSuggestions(targetWord.trim(), lang);
  }, [targetWord, lang]);

  // Combined suggestions
  const allSuggestions = useMemo(() => {
    const list = [...offlineSuggestions];
    for (const item of aiSuggestions) {
      if (!list.includes(item)) {
        list.push(item);
      }
    }
    return list;
  }, [offlineSuggestions, aiSuggestions]);

  // Check if AI config key is available
  const hasAiKey = useMemo(() => {
    try {
      const cfg = getLocalAiConfig();
      return Boolean(cfg?.apiKey);
    } catch {
      return false;
    }
  }, []);

  // Reset state on open/close
  useEffect(() => {
    if (!isOpen) {
      setAiSuggestions([]);
      setIsAiLoading(false);
      setShowLinkInput(false);
    }
  }, [isOpen]);

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
  }, [x, y, isOpen, allSuggestions.length]);

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

  // Apply suggestion
  const handleApplySuggestion = (suggestion: string) => {
    if (!editor) return;
    if (targetRange && typeof targetRange.from === 'number' && typeof targetRange.to === 'number') {
      editor
        .chain()
        .focus()
        .setTextSelection({ from: targetRange.from, to: targetRange.to })
        .insertContent(suggestion)
        .run();
    } else {
      editor.chain().focus().insertContent(suggestion).run();
    }
    onClose();
  };

  // Google Search for word
  const handleSearchGoogle = (word: string) => {
    const query = word.trim();
    if (query && typeof window !== 'undefined') {
      window.open(
        `https://www.google.com/search?q=${encodeURIComponent(query)}`,
        '_blank',
        'noopener,noreferrer'
      );
    }
    onClose();
  };

  // Trigger optional AI spelling check
  const handleTriggerAiCheck = async () => {
    if (!targetWord || isAiLoading) return;
    setIsAiLoading(true);
    try {
      const extra = await fetchAiSpellingSuggestions(targetWord.trim(), contextSentence);
      if (extra && extra.length > 0) {
        setAiSuggestions(extra);
      }
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleCopy = async () => {
    try {
      const { from, to, empty } = editor.state.selection;
      if (!empty) {
        const selected = editor.state.doc.textBetween(
          from,
          to,
          ' ',
          (node) => (node.type.name === 'latexInline' ? `$${node.attrs?.latex || ''}$` : '')
        );
        if (selected) {
          await navigator.clipboard.writeText(selected);
          onClose();
          return;
        }
      }
      document.execCommand('copy');
    } catch {
      document.execCommand('copy');
    }
    onClose();
  };

  const handleCut = async () => {
    try {
      const { from, to, empty } = editor.state.selection;
      if (!empty) {
        const selected = editor.state.doc.textBetween(
          from,
          to,
          ' ',
          (node) => (node.type.name === 'latexInline' ? `$${node.attrs?.latex || ''}$` : '')
        );
        if (selected) {
          await navigator.clipboard.writeText(selected);
          editor.commands.deleteSelection();
          onClose();
          return;
        }
      }
      document.execCommand('cut');
    } catch {
      document.execCommand('cut');
    }
    onClose();
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        if (isMarkdown(text)) {
          const html = markdownToHtml(text);
          editor.chain().focus().insertContent(html).run();
        } else {
          editor.chain().focus().insertContent(text).run();
        }
      }
    } catch {
      document.execCommand('paste');
    }
    onClose();
  };

  const handleDuplicate = () => {
    try {
      const { state, view } = editor;
      const { from, to, empty } = state.selection;
      if (!empty) {
        const slice = state.selection.content();
        const tr = state.tr.insert(to, slice.content);
        view.dispatch(tr);
      } else {
        const $pos = state.selection.$from;
        const depth = $pos.depth;
        const node = depth > 0 ? $pos.node(1) : $pos.parent;
        const pos = depth > 0 ? $pos.after(1) : $pos.end();
        if (node) {
          const tr = state.tr.insert(pos, node);
          view.dispatch(tr);
        }
      }
    } catch (e) {
      console.warn('Duplicate failed', e);
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

  const trimmedTarget = targetWord ? targetWord.trim() : '';

  return (
    <div
      ref={menuRef}
      style={{ top: `${adjustedPos.top}px`, left: `${adjustedPos.left}px` }}
      dir={isAr ? 'rtl' : 'ltr'}
      className="fixed z-50 min-w-[220px] max-w-[calc(100vw-24px)] max-h-[85vh] overflow-y-auto rounded-xl border border-border bg-card/95 p-1.5 text-xs text-card-foreground shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-100"
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
          {/* Target Word Actions: Spelling Corrections & Google Search */}
          {trimmedTarget.length > 0 && (
            <div className="mb-1 space-y-1">
              {/* Spelling suggestions */}
              {allSuggestions.length > 0 && (
                <div className="rounded-lg bg-olive-500/10 dark:bg-olive-500/15 border border-olive-500/25 p-1.5 shadow-xs">
                  <div className="flex items-center gap-1.5 px-1 py-0.5 text-[11px] font-semibold text-olive-800 dark:text-olive-300">
                    <Sparkles className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    <span className="truncate">
                      {isAr
                        ? `اقتراحات التصحيح لـ "${truncate(trimmedTarget, 16)}":`
                        : `Suggestions for "${truncate(trimmedTarget, 16)}":`}
                    </span>
                  </div>
                  <div className="space-y-1 mt-1">
                    {allSuggestions.map((suggestion, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleApplySuggestion(suggestion)}
                        className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-xs font-semibold text-foreground bg-background/90 hover:bg-olive-100/90 dark:hover:bg-olive-900/60 border border-olive-300/50 dark:border-olive-700/50 transition-all text-start group shadow-xs cursor-pointer"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <Check className="h-3.5 w-3.5 text-olive-600 dark:text-olive-400 group-hover:scale-110 transition-transform shrink-0" />
                          <span className="truncate">{suggestion}</span>
                        </div>
                        <span className="text-[10px] text-olive-700 dark:text-olive-300 font-normal shrink-0">
                          {isAr ? 'تصحيح' : 'Apply'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Google Search for the selected / clicked word */}
              <button
                type="button"
                onClick={() => handleSearchGoogle(trimmedTarget)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-muted-foreground hover:bg-blue-50 dark:hover:bg-blue-950/40 hover:text-blue-700 dark:hover:text-blue-300 transition-colors group cursor-pointer"
              >
                <Search className="h-3.5 w-3.5 text-blue-500 shrink-0 group-hover:scale-110 transition-transform" />
                <span className="truncate">
                  {isAr
                    ? `البحث في Google عن "${truncate(trimmedTarget, 18)}"`
                    : `Search Google for "${truncate(trimmedTarget, 18)}"`}
                </span>
                <ExternalLink className="ms-auto h-3 w-3 opacity-40 group-hover:opacity-80 shrink-0" />
              </button>

              {/* AI Spelling check button (if user configured AI key & suggestions list is empty) */}
              {hasAiKey && allSuggestions.length === 0 && (
                <button
                  type="button"
                  onClick={handleTriggerAiCheck}
                  disabled={isAiLoading}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-olive-700 dark:text-olive-300 hover:bg-olive-50 dark:hover:bg-olive-950/40 transition-colors cursor-pointer"
                >
                  {isAiLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0 text-amber-500" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  )}
                  <span className="truncate">
                    {isAiLoading
                      ? (isAr ? 'جارِ التحقق بالذكاء الاصطناعي...' : 'Checking with AI...')
                      : (isAr
                          ? `تدقيق بالذكاء الاصطناعي لـ "${truncate(trimmedTarget, 14)}"`
                          : `Check "${truncate(trimmedTarget, 14)}" with AI`)}
                  </span>
                </button>
              )}

              <div className="my-1 border-t border-border/60" />
            </div>
          )}

          {/* Clipboard Group */}
          <div className="space-y-0.5">
            <button
              type="button"
              onClick={handleCopy}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
            >
              <Copy className="h-3.5 w-3.5" />
              <span>{isAr ? 'نسخ' : 'Copy'}</span>
              <span className="ms-auto text-[10px] opacity-50">Ctrl+C</span>
            </button>
            <button
              type="button"
              onClick={handleCut}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
            >
              <Scissors className="h-3.5 w-3.5" />
              <span>{isAr ? 'قص' : 'Cut'}</span>
              <span className="ms-auto text-[10px] opacity-50">Ctrl+X</span>
            </button>
            <button
              type="button"
              onClick={handlePaste}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
            >
              <Clipboard className="h-3.5 w-3.5" />
              <span>{isAr ? 'لصق' : 'Paste'}</span>
              <span className="ms-auto text-[10px] opacity-50">Ctrl+V</span>
            </button>
            <button
              type="button"
              onClick={handleDuplicate}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
            >
              <CopyPlus className="h-3.5 w-3.5" />
              <span>{isAr ? 'تكرار / استنساخ' : 'Clone / Duplicate'}</span>
              <span className="ms-auto text-[10px] opacity-50">Ctrl+D</span>
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
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 transition-colors cursor-pointer ${
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
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 transition-colors cursor-pointer ${
                isItalicActive
                  ? 'bg-olive-100 text-olive-900 dark:bg-olive-950 dark:text-olive-200 font-bold'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Italic className="h-3.5 w-3.5" />
              <span>{isAr ? 'مائل' : 'Italic'}</span>
              {isItalicActive && <Check className="ms-auto h-3.5 w-3.5 text-olive-600" />}
            </button>

            {isLinkActive && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    const href = editor.getAttributes('link').href || '';
                    if (href) {
                      window.open(href, '_blank', 'noopener,noreferrer');
                    }
                    onClose();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors cursor-pointer font-semibold"
                >
                  <ExternalLink className="h-3.5 w-3.5 text-blue-600" />
                  <span>{isAr ? 'فتح الرابط في علامة تبويب جديدة' : 'Open Link in New Tab'}</span>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const href = editor.getAttributes('link').href || '';
                    if (href) {
                      try {
                        await navigator.clipboard.writeText(href);
                      } catch {}
                    }
                    onClose();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span>{isAr ? 'نسخ عنوان الرابط' : 'Copy Link Address'}</span>
                </button>
              </>
            )}

            {/* Link Action */}
            <button
              type="button"
              onClick={() => {
                const prevUrl = editor.getAttributes('link').href || '';
                setLinkUrl(prevUrl);
                setShowLinkInput(true);
              }}
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 transition-colors cursor-pointer ${
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
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
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
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
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
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
            >
              <Heading2 className="h-3.5 w-3.5 text-olive-700" />
              <span>{isAr ? 'عنوان فرعي (H2)' : 'Heading 2'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                editor.chain().focus().toggleHeading({ level: 3 }).run();
                onClose();
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
            >
              <Heading3 className="h-3.5 w-3.5 text-olive-700" />
              <span>{isAr ? 'عنوان فرعي (H3)' : 'Heading 3'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                editor.chain().focus().toggleBulletList().run();
                onClose();
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
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
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
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
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
            >
              <Quote className="h-3.5 w-3.5" />
              <span>{isAr ? 'اقتباس' : 'Blockquote'}</span>
            </button>
          </div>

          <div className="my-1 border-t border-border/60" />

          {/* Alignment Row: naturally ordered per language direction */}
          <div className="px-2 py-1">
            <div className="text-[10px] font-semibold text-muted-foreground mb-1">
              {isAr ? 'محاذاة النص' : 'Text Alignment'}
            </div>
            <div className="flex items-center gap-1">
              {isAr ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      editor.chain().focus().setTextAlign('right').run();
                      onClose();
                    }}
                    className={`flex-1 flex items-center justify-center p-1.5 rounded-md text-xs transition-colors cursor-pointer ${
                      editor.isActive({ textAlign: 'right' })
                        ? 'bg-olive-100 dark:bg-olive-950 text-olive-900 dark:text-olive-200 font-bold'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                    title="محاذاة لليمين"
                  >
                    <AlignRight className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      editor.chain().focus().setTextAlign('center').run();
                      onClose();
                    }}
                    className={`flex-1 flex items-center justify-center p-1.5 rounded-md text-xs transition-colors cursor-pointer ${
                      editor.isActive({ textAlign: 'center' })
                        ? 'bg-olive-100 dark:bg-olive-950 text-olive-900 dark:text-olive-200 font-bold'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                    title="محاذاة للوسط"
                  >
                    <AlignCenter className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      editor.chain().focus().setTextAlign('left').run();
                      onClose();
                    }}
                    className={`flex-1 flex items-center justify-center p-1.5 rounded-md text-xs transition-colors cursor-pointer ${
                      editor.isActive({ textAlign: 'left' })
                        ? 'bg-olive-100 dark:bg-olive-950 text-olive-900 dark:text-olive-200 font-bold'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                    title="محاذاة لليسار"
                  >
                    <AlignLeft className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      editor.chain().focus().setTextAlign('justify').run();
                      onClose();
                    }}
                    className={`flex-1 flex items-center justify-center p-1.5 rounded-md text-xs transition-colors cursor-pointer ${
                      editor.isActive({ textAlign: 'justify' })
                        ? 'bg-olive-100 dark:bg-olive-950 text-olive-900 dark:text-olive-200 font-bold'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                    title="ضبط كلي"
                  >
                    <AlignJustify className="h-3.5 w-3.5" />
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      editor.chain().focus().setTextAlign('left').run();
                      onClose();
                    }}
                    className={`flex-1 flex items-center justify-center p-1.5 rounded-md text-xs transition-colors cursor-pointer ${
                      editor.isActive({ textAlign: 'left' })
                        ? 'bg-olive-100 dark:bg-olive-950 text-olive-900 dark:text-olive-200 font-bold'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                    title="Align Left"
                  >
                    <AlignLeft className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      editor.chain().focus().setTextAlign('center').run();
                      onClose();
                    }}
                    className={`flex-1 flex items-center justify-center p-1.5 rounded-md text-xs transition-colors cursor-pointer ${
                      editor.isActive({ textAlign: 'center' })
                        ? 'bg-olive-100 dark:bg-olive-950 text-olive-900 dark:text-olive-200 font-bold'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                    title="Align Center"
                  >
                    <AlignCenter className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      editor.chain().focus().setTextAlign('right').run();
                      onClose();
                    }}
                    className={`flex-1 flex items-center justify-center p-1.5 rounded-md text-xs transition-colors cursor-pointer ${
                      editor.isActive({ textAlign: 'right' })
                        ? 'bg-olive-100 dark:bg-olive-950 text-olive-900 dark:text-olive-200 font-bold'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                    title="Align Right"
                  >
                    <AlignRight className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      editor.chain().focus().setTextAlign('justify').run();
                      onClose();
                    }}
                    className={`flex-1 flex items-center justify-center p-1.5 rounded-md text-xs transition-colors cursor-pointer ${
                      editor.isActive({ textAlign: 'justify' })
                        ? 'bg-olive-100 dark:bg-olive-950 text-olive-900 dark:text-olive-200 font-bold'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                    title="Justify"
                  >
                    <AlignJustify className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Text Direction: RTL, LTR */}
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground mb-1">
              {isAr ? 'اتجاه النص' : 'Text Direction'}
            </div>
            <div className="flex items-center gap-1">
              {isAr ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      editor.chain().focus().setTextDirection('rtl').run();
                      onClose();
                    }}
                    className={`flex-1 flex items-center justify-center gap-1.5 p-1.5 rounded-md text-xs transition-colors cursor-pointer ${
                      editor.isActive({ dir: 'rtl' }) || (!editor.isActive({ dir: 'ltr' }) && isAr)
                        ? 'bg-olive-100 dark:bg-olive-950 text-olive-900 dark:text-olive-200 font-bold'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                    title="من اليمين لليسار (RTL)"
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
                    className={`flex-1 flex items-center justify-center gap-1.5 p-1.5 rounded-md text-xs transition-colors cursor-pointer ${
                      editor.isActive({ dir: 'ltr' }) || (!editor.isActive({ dir: 'rtl' }) && !isAr)
                        ? 'bg-olive-100 dark:bg-olive-950 text-olive-900 dark:text-olive-200 font-bold'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                    title="من اليسار لليمين (LTR)"
                  >
                    <PilcrowRight className="h-3.5 w-3.5" />
                    <span className="text-[11px] font-medium">LTR</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      editor.chain().focus().setTextDirection('ltr').run();
                      onClose();
                    }}
                    className={`flex-1 flex items-center justify-center gap-1.5 p-1.5 rounded-md text-xs transition-colors cursor-pointer ${
                      editor.isActive({ dir: 'ltr' }) || (!editor.isActive({ dir: 'rtl' }) && !isAr)
                        ? 'bg-olive-100 dark:bg-olive-950 text-olive-900 dark:text-olive-200 font-bold'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                    title="Left to Right (LTR)"
                  >
                    <PilcrowRight className="h-3.5 w-3.5" />
                    <span className="text-[11px] font-medium">LTR</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      editor.chain().focus().setTextDirection('rtl').run();
                      onClose();
                    }}
                    className={`flex-1 flex items-center justify-center gap-1.5 p-1.5 rounded-md text-xs transition-colors cursor-pointer ${
                      editor.isActive({ dir: 'rtl' }) || (!editor.isActive({ dir: 'ltr' }) && isAr)
                        ? 'bg-olive-100 dark:bg-olive-950 text-olive-900 dark:text-olive-200 font-bold'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                    title="Right to Left (RTL)"
                  >
                    <PilcrowLeft className="h-3.5 w-3.5" />
                    <span className="text-[11px] font-medium">RTL</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {editor?.isActive('table') && (
            <>
              <div className="my-1 border-t border-border/60" />
              <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground">
                {isAr ? 'إدارة الجدول وتحديد الخلايا' : 'Table & Selection'}
              </div>
              <div className="grid grid-cols-2 gap-1 px-1">
                <button
                  type="button"
                  onClick={() => {
                    selectTableRow(editor);
                    onClose();
                  }}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
                >
                  <Rows className="h-3 w-3 text-olive-600" />
                  <span>{isAr ? 'تحديد الصف' : 'Select Row'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    selectTableColumn(editor);
                    onClose();
                  }}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
                >
                  <Columns className="h-3 w-3 text-olive-600" />
                  <span>{isAr ? 'تحديد العمود' : 'Select Column'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    selectEntireTable(editor);
                    onClose();
                  }}
                  className="col-span-2 flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
                >
                  <TableIcon className="h-3 w-3 text-olive-600" />
                  <span>{isAr ? 'تحديد كل الجدول' : 'Select All Table'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    editor.chain().focus().addRowAfter().run();
                    onClose();
                  }}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
                >
                  <Rows className="h-3 w-3 text-emerald-600" />
                  <span>{isAr ? 'إدراج صف' : 'Add Row'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    editor.chain().focus().addColumnAfter().run();
                    onClose();
                  }}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
                >
                  <Columns className="h-3 w-3 text-emerald-600" />
                  <span>{isAr ? 'إدراج عمود' : 'Add Column'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    editor.chain().focus().deleteRow().run();
                    onClose();
                  }}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                >
                  <Trash2 className="h-3 w-3" />
                  <span>{isAr ? 'حذف الصف' : 'Delete Row'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    editor.chain().focus().deleteColumn().run();
                    onClose();
                  }}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                >
                  <Trash2 className="h-3 w-3" />
                  <span>{isAr ? 'حذف العمود' : 'Delete Column'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    editor.chain().focus().mergeCells().run();
                    onClose();
                  }}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
                >
                  <span>{isAr ? 'دمج الخلايا' : 'Merge Cells'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    editor.chain().focus().splitCell().run();
                    onClose();
                  }}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
                >
                  <span>{isAr ? 'تقسيم الخلية' : 'Split Cell'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    editor.chain().focus().deleteTable().run();
                    onClose();
                  }}
                  className="col-span-2 flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                >
                  <Trash2 className="h-3 w-3" />
                  <span>{isAr ? 'حذف الجدول بالكامل' : 'Delete Entire Table'}</span>
                </button>
              </div>
            </>
          )}

          <div className="my-1 border-t border-border/60" />

          {/* Table Insert: normal vs smart */}
          <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground">
            {isAr ? 'إدراج جدول' : 'Insert Table'}
          </div>
          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(new CustomEvent('editor-insert-normal-table-request'));
              onClose();
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
          >
            <TableIcon className="h-3.5 w-3.5" />
            <span>{isAr ? 'جدول عادي (نصوص)' : 'Normal table (text)'}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(new CustomEvent('editor-insert-smart-table-request'));
              onClose();
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-olive-800 dark:text-olive-300 hover:bg-olive-50 dark:hover:bg-olive-950 transition-colors cursor-pointer"
          >
            <TableIcon className="h-3.5 w-3.5 text-olive-600" />
            <span>{isAr ? 'جدول ذكي (spreadsheet كامل)' : 'Smart spreadsheet (full)'}</span>
          </button>
        </>
      )}
    </div>
  );
}
