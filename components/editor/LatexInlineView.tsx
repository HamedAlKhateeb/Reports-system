'use client';

import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { NodeViewWrapper, NodeViewProps } from '@tiptap/react';
import { Check, X, Trash2, Eye } from 'lucide-react';
import { renderLatexToHtml } from '@/lib/latex';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { cn } from '@/lib/utils';

export function LatexInlineView(props: NodeViewProps) {
  const { node, selected, updateAttributes, deleteNode, editor, getPos } = props as any;
  const { lang } = useLanguage();
  const isAr = lang === 'ar';
  const latex: string = String(node?.attrs?.latex || '');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(latex);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Auto-grow textarea height dynamically as text/code grows
  const adjustTextareaHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const scrollH = el.scrollHeight;
    const targetH = Math.max(76, Math.min(scrollH + 4, 400));
    el.style.height = `${targetH}px`;
    el.style.overflowY = scrollH > 400 ? 'auto' : 'hidden';
  }, []);

  // Inherit active font size mark from TipTap node if set
  const activeFontSize = useMemo(() => {
    try {
      const mark = node?.marks?.find((m: any) => m?.type?.name === 'fontSize');
      return mark?.attrs?.size || undefined;
    } catch {
      return undefined;
    }
  }, [node?.marks]);

  useEffect(() => {
    setDraft(latex);
  }, [latex]);

  useEffect(() => {
    if (editing) {
      const timer = setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          // Position cursor at end of text
          const len = textareaRef.current.value.length;
          textareaRef.current.setSelectionRange(len, len);
          adjustTextareaHeight();
        }
      }, 20);
      return () => clearTimeout(timer);
    }
  }, [editing, adjustTextareaHeight]);

  useEffect(() => {
    if (editing) {
      adjustTextareaHeight();
    }
  }, [draft, editing, adjustTextareaHeight]);

  const commitEdit = useCallback((valToCommit?: string) => {
    const val = (typeof valToCommit === 'string' ? valToCommit : draft).trim();
    if (!val) {
      deleteNode?.();
    } else {
      updateAttributes?.({ latex: val });
    }
    setEditing(false);
  }, [draft, deleteNode, updateAttributes]);

  // Click outside listener to commit edit
  useEffect(() => {
    if (!editing) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        commitEdit();
      }
    };
    document.addEventListener('mousedown', handleOutsideClick, true);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick, true);
    };
  }, [editing, commitEdit]);

  const html = useMemo(() => renderLatexToHtml(latex), [latex]);
  const previewHtml = useMemo(() => renderLatexToHtml(draft), [draft]);

  return (
    <NodeViewWrapper
      as="span"
      className={cn(
        'latex-inline whitespace-nowrap align-baseline inline-block relative my-0 mx-0.5',
        selected && !editing && 'rounded bg-[#2E4034]/10 ring-1 ring-[#2E4034]'
      )}
      dir="ltr"
      data-type="latex-inline"
      data-latex={latex}
      style={{
        display: 'inline-block',
        unicodeBidirectional: 'isolate',
        lineHeight: 1.25,
        fontSize: activeFontSize || 'inherit',
      }}
    >
      <span contentEditable={false} className="inline-block" dir="ltr">
        {/* Rendered formula view when not editing */}
        {latex ? (
          <span
            onClick={(e) => {
              e.stopPropagation();
              setEditing(true);
            }}
            className={cn(
              'cursor-pointer inline-block rounded px-1.5 py-0.5 transition-all select-all',
              editing
                ? 'bg-[#2E4034]/15 ring-2 ring-[#2E4034]'
                : selected
                ? 'bg-[#2E4034]/10 ring-1 ring-[#2E4034]'
                : 'hover:bg-[#2E4034]/10'
            )}
            title={isAr ? 'انقر لتعديل معادلة LaTeX' : 'Click to edit LaTeX equation'}
          >
            {/* Hidden fallback text for native browser selection copying */}
            <span
              className="latex-raw-copy"
              style={{
                position: 'absolute',
                width: '1px',
                height: '1px',
                padding: 0,
                margin: '-1px',
                overflow: 'hidden',
                clip: 'rect(0, 0, 0, 0)',
                whiteSpace: 'nowrap',
                border: 0,
                userSelect: 'all',
              }}
            >
              {`$${latex}$`}
            </span>
            <span aria-hidden="true" style={{ userSelect: 'none' }} dangerouslySetInnerHTML={{ __html: html }} />
          </span>
        ) : (
          <span
            onClick={(e) => {
              e.stopPropagation();
              setEditing(true);
            }}
            className="cursor-pointer rounded border border-dashed border-[#2E4034] bg-muted/50 px-2 py-0.5 font-mono text-xs text-muted-foreground hover:border-[#2E4034] hover:text-foreground"
          >
            {isAr ? 'معادلة فارغة' : 'empty equation'}
          </span>
        )}

        {/* Spacious, comfortable floating editor card */}
        {editing && (
          <div
            ref={cardRef}
            className="absolute top-full start-0 mt-2 z-50 w-[min(94vw,620px)] min-w-[340px] rounded-xl border border-border bg-card p-3.5 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-150 not-prose"
            dir="ltr"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-border/80">
              <span className="text-xs font-bold text-foreground flex items-center gap-1.5 font-mono">
                <span className="text-[#2E4034] dark:text-emerald-400 font-extrabold text-sm">$</span>
                <span>{isAr ? 'تعديل معادلة LaTeX' : 'Edit LaTeX Formula'}</span>
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => deleteNode?.()}
                  className="p-1 rounded text-muted-foreground hover:bg-rose-500/10 hover:text-rose-600 transition-colors"
                  title={isAr ? 'حذف المعادلة' : 'Delete formula'}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDraft(latex);
                    setEditing(false);
                    if (editor) editor.commands.focus();
                  }}
                  className="p-1 rounded text-muted-foreground hover:bg-muted transition-colors"
                  title={isAr ? 'إلغاء' : 'Cancel'}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* LaTeX Textarea Input */}
            <div className="relative">
              <textarea
                ref={textareaRef}
                value={draft}
                dir="ltr"
                rows={3}
                onChange={(e) => {
                  setDraft(e.target.value);
                  adjustTextareaHeight();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || !e.shiftKey)) {
                    e.preventDefault();
                    commitEdit();
                    if (editor && typeof getPos === 'function') {
                      editor.commands.focus();
                      try {
                        editor.commands.setTextSelection(getPos() + 1);
                      } catch {}
                    }
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setDraft(latex);
                    setEditing(false);
                    if (editor) editor.commands.focus();
                  }
                }}
                placeholder="x^2 + y^2 = z^2"
                className="w-full rounded-lg border border-border bg-background p-2.5 font-mono text-[14px] leading-relaxed text-foreground placeholder:text-muted-foreground/50 focus:border-[#2E4034] focus:outline-none focus:ring-1 focus:ring-[#2E4034] resize-y min-h-[76px] transition-[height] duration-75"
              />
            </div>

            {/* Live KaTeX Preview Box */}
            <div className="mt-2.5 rounded-lg border border-border/70 bg-muted/30 p-2.5">
              <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground mb-1.5">
                <span className="flex items-center gap-1 text-[10.5px]">
                  <Eye className="w-3 h-3 text-[#2E4034] dark:text-emerald-400" />
                  <span>{isAr ? 'المعاينة الحية' : 'Live Preview'}</span>
                </span>
                <span className="text-[10px] text-muted-foreground/70 font-mono">
                  {isAr ? 'Enter للحفظ' : 'Enter to save'}
                </span>
              </div>
              <div
                className="overflow-x-auto py-2 px-1 text-center min-h-[36px] max-h-[260px] overflow-y-auto flex items-center justify-center transition-all"
                dir="ltr"
              >
                {draft.trim() ? (
                  <span dangerouslySetInnerHTML={{ __html: previewHtml }} />
                ) : (
                  <span className="text-xs text-muted-foreground/60 italic">
                    {isAr ? 'اكتب رمز المعادلة أعلاه...' : 'Type equation above...'}
                  </span>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2 mt-3 pt-2 border-t border-border/80">
              <button
                type="button"
                onClick={() => {
                  setDraft(latex);
                  setEditing(false);
                  if (editor) editor.commands.focus();
                }}
                className="h-7 px-3 rounded-md border border-border text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => {
                  commitEdit();
                  if (editor && typeof getPos === 'function') {
                    editor.commands.focus();
                    try {
                      editor.commands.setTextSelection(getPos() + 1);
                    } catch {}
                  }
                }}
                className="h-7 px-4 rounded-md bg-[#2E4034] text-white hover:bg-[#233329] text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{isAr ? 'حفظ المعادلة' : 'Save Equation'}</span>
              </button>
            </div>
          </div>
        )}
      </span>
    </NodeViewWrapper>
  );
}


