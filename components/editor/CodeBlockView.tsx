'use client';

import React, { useState } from 'react';
import { NodeViewContent, NodeViewWrapper } from '@tiptap/react';
import { Check, Copy, CornerDownLeft, WrapText } from 'lucide-react';
import { TextSelection } from '@tiptap/pm/state';
import { CODE_LANGUAGES } from './CodeBlockNode';
import { toast } from '@/components/ui/toast';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { cn } from '@/lib/utils';

/**
 * CodeBlockView — header bar (language picker + one-click copy) above the
 * editable code area. The code itself stays LTR even inside RTL reports.
 */
export function CodeBlockView(props: any) {
  const { node, updateAttributes, selected, editor, getPos } = props;
  const { lang } = useLanguage();
  const isAr = lang === 'ar';
  const [copied, setCopied] = useState(false);
  const language: string = node?.attrs?.language || '';
  const code: string = node?.textContent || '';
  const wrapLines: boolean = Boolean(node?.attrs?.wrapLines);
  const fontSize: string = node?.attrs?.fontSize || '13.5px';

  const handleInsertBelow = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!editor || typeof getPos !== 'function') return;
    try {
      const pos = getPos();
      if (typeof pos !== 'number') return;
      const afterPos = pos + (node?.nodeSize || 0);
      const { state, view } = editor;
      const tr = state.tr;
      const p = state.schema.nodes.paragraph.create();
      tr.insert(afterPos, p);
      tr.setSelection(TextSelection.create(tr.doc, afterPos + 1));
      view.dispatch(tr.scrollIntoView());
      editor.commands.focus();
    } catch (err) {
      console.error('Failed to insert paragraph below codeblock:', err);
    }
  };

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    let ok = true;
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = code;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand('copy');
        ta.remove();
      } catch {
        ok = false;
      }
    }
    if (ok) {
      setCopied(true);
      toast.success(isAr ? 'تم نسخ الكود' : 'Code copied');
      window.setTimeout(() => setCopied(false), 1500);
    } else {
      toast.error(isAr ? 'تعذر النسخ' : 'Copy failed');
    }
  };

  return (
    <NodeViewWrapper
      className={cn('report-codeblock', selected && 'report-codeblock-selected')}
      dir="ltr"
      data-language={language || undefined}
    >
      <div className="codeblock-bar" contentEditable={false} onMouseDown={(e) => e.preventDefault()}>
        <div className="flex items-center gap-1.5">
          <select
            value={language}
            onChange={(e) => updateAttributes({ language: e.target.value || null })}
            className="codeblock-lang"
            aria-label={isAr ? 'لغة البرمجة' : 'Code language'}
            title={isAr ? 'لغة البرمجة' : 'Code language'}
          >
            <option value="">{isAr ? 'نص عادي' : 'Plain text'}</option>
            {CODE_LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>

          {/* Word Wrap Toggle */}
          <button
            type="button"
            onClick={() => updateAttributes({ wrapLines: !wrapLines })}
            className={cn(
              'codeblock-action-btn',
              wrapLines && 'bg-emerald-600/30 text-emerald-300 border-emerald-500/50'
            )}
            title={isAr ? 'التفاف الأسطر وتوسيع الحقل مع النص' : 'Wrap lines and grow field with text'}
          >
            <WrapText className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{isAr ? 'التفاف الأسطر' : 'Wrap'}</span>
          </button>

          {/* Font Size Steppers */}
          <div className="flex items-center rounded-md border border-[#475569] bg-[#0f172a] text-[#e2e8f0] text-xs h-[26px] px-1 gap-1">
            <button
              type="button"
              onClick={() => {
                const cur = parseFloat(fontSize) || 14;
                const next = Math.max(11, Math.round(cur - 1));
                updateAttributes({ fontSize: `${next}px` });
              }}
              className="px-1 hover:text-white font-mono font-bold transition-colors"
              title={isAr ? 'تصغير الخط' : 'Decrease font size'}
            >
              A-
            </button>
            <span className="text-[10px] opacity-75 font-mono min-w-[20px] text-center">
              {fontSize.replace('px', '')}
            </span>
            <button
              type="button"
              onClick={() => {
                const cur = parseFloat(fontSize) || 14;
                const next = Math.min(26, Math.round(cur + 1));
                updateAttributes({ fontSize: `${next}px` });
              }}
              className="px-1 hover:text-white font-mono font-bold transition-colors"
              title={isAr ? 'تكبير الخط' : 'Increase font size'}
            >
              A+
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleInsertBelow}
            className="codeblock-action-btn"
            title={isAr ? 'كتابة نص جديد أسفل الكود (Ctrl+Enter)' : 'Write below code (Ctrl+Enter)'}
            aria-label={isAr ? 'كتابة نص أسفل الكود' : 'Write below code'}
          >
            <CornerDownLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{isAr ? 'سطر بالأسفل' : 'Line below'}</span>
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="codeblock-copy"
            title={isAr ? 'نسخ الكود' : 'Copy code'}
            aria-label={isAr ? 'نسخ الكود' : 'Copy code'}
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copied ? (isAr ? 'تم النسخ' : 'Copied') : isAr ? 'نسخ' : 'Copy'}</span>
          </button>
        </div>
      </div>
      <pre
        dir="ltr"
        className={cn('codeblock-pre', wrapLines && 'whitespace-pre-wrap break-words')}
        style={{ fontSize }}
      >
        <NodeViewContent
          as="code"
          style={{
            fontSize,
            whiteSpace: wrapLines ? 'pre-wrap' : 'pre',
            wordBreak: wrapLines ? 'break-word' : 'normal',
          }}
        />
      </pre>
    </NodeViewWrapper>
  );
}
