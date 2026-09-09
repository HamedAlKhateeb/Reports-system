'use client';

import React, { useMemo, useState } from 'react';
import { NodeViewWrapper, NodeViewProps } from '@tiptap/react';
import { Pencil, Trash2 } from 'lucide-react';
import { renderLatexToHtml } from '@/lib/latex';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { cn } from '@/lib/utils';

export function LatexInlineView(props: NodeViewProps) {
  const { node, selected, updateAttributes, deleteNode } = props as any;
  const { lang } = useLanguage();
  const isAr = lang === 'ar';
  const latex: string = String(node?.attrs?.latex || '');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(latex);

  React.useEffect(() => {
    setDraft(latex);
  }, [latex]);

  const html = useMemo(() => renderLatexToHtml(latex), [latex]);

  return (
    <NodeViewWrapper
      as="span"
      className={cn(
        'latex-inline select-all whitespace-nowrap align-baseline',
        selected && 'rounded bg-[#2E4034]/10 outline outline-1 outline-[#2E4034]'
      )}
      dir="ltr"
      data-type="latex-inline"
      data-latex={latex}
      style={{ display: 'inline-block', unicodeBidirectional: 'isolate', lineHeight: 1.25, margin: '0 2px' }}
    >
      <span contentEditable={false} className="inline-block" dir="ltr">
        {latex ? (
          <span dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <span className="rounded border border-dashed border-border px-1.5 font-mono text-[11px] text-muted-foreground">
            {isAr ? 'معادلة فارغة' : 'empty equation'}
          </span>
        )}
        {selected && !editing && (
          <span className="ms-1 inline-flex items-center gap-0.5 align-middle">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              title={isAr ? 'تحرير المعادلة' : 'Edit equation'}
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => deleteNode?.()}
              className="rounded p-0.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
              title={isAr ? 'حذف' : 'Delete'}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </span>
        )}
        {editing && (
          <span className="ms-1 inline-flex items-center gap-1 align-middle">
            <input
              value={draft}
              autoFocus
              dir="ltr"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (draft.trim()) updateAttributes?.({ latex: draft.trim() });
                  setEditing(false);
                } else if (e.key === 'Escape') {
                  setDraft(latex);
                  setEditing(false);
                }
              }}
              placeholder="x^2 + y^2 = z^2"
              className="h-6 w-40 rounded border border-border bg-background px-1.5 font-mono text-[11px] text-foreground focus:border-[#2E4034] focus:outline-none"
            />
            <button
              type="button"
              onClick={() => {
                if (draft.trim()) updateAttributes?.({ latex: draft.trim() });
                setEditing(false);
              }}
              className="h-6 rounded bg-[#2E4034] px-2 text-[11px] font-bold text-white"
            >
              {isAr ? 'حفظ' : 'Save'}
            </button>
          </span>
        )}
      </span>
    </NodeViewWrapper>
  );
}
