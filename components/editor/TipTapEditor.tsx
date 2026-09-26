'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { TextSelection } from '@tiptap/pm/state';
import { DOMParser } from '@tiptap/pm/model';
import StarterKit from '@tiptap/starter-kit';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import TextDirection from './TextDirectionExtension';
import { ResetEmptyHeading } from './ResetEmptyHeading';
import { ReportImage } from './ReportImageNode';
import { SmartTableNode } from './SmartTableNode';
import { ReportChart } from './ReportChartNode';
import { ReportMindmap } from './ReportMindmapNode';
import { ReportDrawing } from './ReportDrawingNode';
import { LatexInline } from './LatexInlineNode';
import { convertLatexDelimitersToNodes, cleanLatex, isPureLatex } from '@/lib/latex';
import { ChartBuilderPanel } from './ChartBuilderPanel';
import { ImportModal } from './ImportModal';
import type { ImportKind } from '@/lib/import/validation';
import { getTablesByReportId } from '@/lib/db';
import { extractNativeTables, nativeFingerprint } from '@/lib/charts/engine';
import { newChartId, normalizeChartType } from '@/lib/charts/types';
import { schemaFromCreateParams } from '@/lib/charts/ai-tools';
import { TextColor, TextHighlight } from './CustomColorMarks';
import { FontSize, DEFAULT_FONT_SIZE, resolveActiveFontSize } from './FontSizeMark';
import { ReportCodeBlock } from './CodeBlockNode';
import { FontFamily } from './FontFamilyMark';
import { EditorToolbar } from './EditorToolbar';
import { EditorContextMenu } from './EditorContextMenu';
import { findWordAtPosition } from '@/lib/spellcheck-engine';
import { TableFillHandle } from './TableFillHandle';
import { uploadReportImage } from '@/lib/db';
import { imageStore } from '@/lib/images-store';
import type { ReportImage as IReportImage } from '@/lib/types';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { AppLanguage } from '@/lib/i18n/dictionary';
import { getReportTheme, getReportBackground } from '@/lib/report-theme-config';
import { DEFAULT_FONT_STACK } from '@/lib/fonts';
import {
  getCustomShortcuts,
  normalizeKeyboardEvent,
  SHORTCUTS_STORAGE_KEY,
} from '@/lib/shortcuts';
import { Check, AlertCircle, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/toast';
import { TableMap } from '@tiptap/pm/tables';
import { isMarkdown, hasMarkdownTable, markdownToHtml, isRawPreHtml, parseClipboardToTableGrid } from '@/lib/markdown';

function parseTextToTipTapContent(rawContent: string): any {
  if (!rawContent || typeof rawContent !== 'string') return rawContent;
  if (rawContent.trim().startsWith('<') && rawContent.trim().endsWith('>')) {
    return rawContent;
  }
  if (isMarkdown(rawContent)) {
    return markdownToHtml(rawContent);
  }
  const lines = rawContent.split('\n');
  const contentNodes: any[] = [];
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (trimmed.startsWith('# ')) {
      contentNodes.push({
        type: 'heading',
        attrs: { level: 1 },
        content: [{ type: 'text', text: trimmed.slice(2).trim() }],
      });
    } else if (trimmed.startsWith('## ')) {
      contentNodes.push({
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: trimmed.slice(3).trim() }],
      });
    } else if (trimmed.startsWith('### ')) {
      contentNodes.push({
        type: 'heading',
        attrs: { level: 3 },
        content: [{ type: 'text', text: trimmed.slice(4).trim() }],
      });
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      contentNodes.push({
        type: 'paragraph',
        content: [{ type: 'text', text: '• ' + trimmed.slice(2).trim() }],
      });
    } else {
      contentNodes.push({
        type: 'paragraph',
        content: [{ type: 'text', text: trimmed }],
      });
    }
  });

  return {
    type: 'doc',
    content:
      contentNodes.length > 0
        ? contentNodes
        : [{ type: 'paragraph', content: [{ type: 'text', text: rawContent }] }],
  };
}

interface TipTapEditorProps {
  reportId: string;
  initialContent: any;
  reportLanguage: AppLanguage;
  reportFontFamily?: string;
  onSave: (contentJson: any) => Promise<void>;
  onContentChange?: (contentJson: any) => void;
  onSaveImmediately?: () => Promise<void>;
  onEditorReady?: (editor: any) => void;
  themeColor?: string;
  backgroundColor?: string;
}

export function TipTapEditor({
  reportId,
  initialContent,
  reportLanguage,
  reportFontFamily,
  onSave,
  onContentChange,
  onSaveImmediately,
  onEditorReady,
  themeColor = 'olive',
  backgroundColor = 'white',
}: TipTapEditorProps) {
  const { t, lang } = useLanguage();
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [uploadingImage, setUploadingImage] = useState(false);
  // Live word/character counter (footer bar below the editor — never overlaps writing).
  const [stats, setStats] = useState({ words: 0, chars: 0 });
  const [isSticky, setIsSticky] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    x: number;
    y: number;
    targetWord?: string;
    targetRange?: { from: number; to: number } | null;
    contextSentence?: string;
  }>({
    isOpen: false,
    x: 0,
    y: 0,
  });
  // Right-click context menu mode: 'custom' (rich formatting tools by default) vs 'browser' (native browser spellcheck)
  const [contextMenuMode, setContextMenuMode] = useState<'browser' | 'custom'>('custom');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('editor_context_menu_mode');
      if (saved === 'browser' || saved === 'custom') {
        setContextMenuMode(saved);
      }
    } catch {}
  }, []);

  const toggleContextMenuMode = useCallback(() => {
    setContextMenuMode((prev) => {
      const next = prev === 'browser' ? 'custom' : 'browser';
      try {
        localStorage.setItem('editor_context_menu_mode', next);
      } catch {}
      return next;
    });
  }, []);
  // --- Mini Chart system state ---
  const [chartSelectMode, setChartSelectMode] = useState(false);
  const [chartSelectedSource, setChartSelectedSource] = useState<{ tableId: string; kind: 'smart' | 'native'; name: string } | null>(null);
  const [chartBuilderOpen, setChartBuilderOpen] = useState(false);
  const [chartEditId, setChartEditId] = useState<string | null>(null);
  const [chartPreset, setChartPreset] = useState<{ tableId: string; kind: 'smart' | 'native' } | null>(null);
  const [chartTables, setChartTables] = useState<Array<{ tableId: string; kind: 'smart' | 'native'; name: string }>>([]);
  // --- Document import (DOCX/XLSX) dialog state ---
  const [importOpen, setImportOpen] = useState(false);
  const [importKind, setImportKind] = useState<ImportKind | null>(null);
  const editorContentWrapRef = useRef<HTMLDivElement>(null);
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

  // Document import bridge: toolbar "Import" menu dispatches
  // 'editor-import-request' { kind: 'docx' | 'xlsx' }; the dialog owns the
  // Select → Validate → Parse → Preview → Confirm → Insert flow.
  useEffect(() => {
    const onImportRequest = (e: Event) => {
      const detail = (e as CustomEvent)?.detail || {};
      const kind: ImportKind | null =
        detail.kind === 'xlsx' ? 'xlsx' : detail.kind === 'docx' ? 'docx' : null;
      setImportKind(kind);
      setImportOpen(true);
    };
    window.addEventListener('editor-import-request', onImportRequest);
    return () => window.removeEventListener('editor-import-request', onImportRequest);
  }, []);

  // Fingerprint of the last flushed doc: blur saves only on real change,
  // so toolbar clicks (which blur the editor) never cause spurious saves
  // and mid-click re-renders.
  const lastFlushedJsonRef = useRef<string>('');
  const fingerprintJson = (json: any): string => {
    try {
      return JSON.stringify(json);
    } catch {
      return '';
    }
  };

  const saveContent = useCallback(
    async (json: any) => {
      try {
        lastFlushedJsonRef.current = fingerprintJson(json);
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

  // Ensure image sequence numbering resets cleanly whenever active reportId changes
  useEffect(() => {
    pendingMaxSeqRef.current = 0;
  }, [reportId]);

  const processImageUpload = async (file: File, targetBlockIndex?: number) => {
    if (!file || !file.type.startsWith('image/')) return;
    try {
      setUploadingImage(true);
      const ed = editorRef.current;
      let docMax = 0;
      let totalImagesInDoc = 0;
      let calculatedIndex = targetBlockIndex;

      if (ed) {
        ed.state.doc.descendants((node: any) => {
          if (node.type.name === 'reportImage') {
            const seq = Number(node.attrs.sequenceNumber);
            if (!isNaN(seq) && seq > docMax) {
              docMax = seq;
            }
            totalImagesInDoc++;
          }
        });

        if (typeof calculatedIndex !== 'number') {
          let precedingImages = 0;
          const currentPos = ed.state.selection.$from.pos;
          ed.state.doc.descendants((node: any, pos: number) => {
            if (node.type.name === 'reportImage' && pos <= currentPos) {
              precedingImages++;
            }
          });
          calculatedIndex = precedingImages;
        }
      }

      const deterministicIndex = typeof calculatedIndex === 'number' ? calculatedIndex : totalImagesInDoc;
      const targetSeq = Math.max(docMax, pendingMaxSeqRef.current) + 1;
      pendingMaxSeqRef.current = targetSeq;

      const imageId =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : 'img_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
      const systemTimestamp = new Date().toISOString();

      const uploadedItem = await uploadReportImage(
        reportId,
        file,
        '',
        reportLanguage,
        targetSeq,
        imageId,
        deterministicIndex
      );

      // Store in normalized state/store (imagesById)
      const normalizedImage: IReportImage = {
        id: imageId,
        reportId,
        index: deterministicIndex,
        url: uploadedItem.downloadUrl,
        caption: uploadedItem.caption || '',
        createdAt: systemTimestamp,
      };
      imageStore.upsertImage(normalizedImage);

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
            url: uploadedItem.downloadUrl,
            storagePath: uploadedItem.storagePath,
            sequenceNumber: uploadedItem.sequenceNumber,
            index: deterministicIndex,
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
      toast.error(t('imageUploadFailed'));
    } finally {
      setUploadingImage(false);
    }
  };

  const handleImageFile = (file: File, targetBlockIndex?: number) => {
    uploadQueueRef.current = uploadQueueRef.current
      .then(() => processImageUpload(file, targetBlockIndex))
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
        // Custom node with language picker + copy button (see CodeBlockNode).
        codeBlock: false,
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
          target: '_blank',
          rel: 'noopener noreferrer',
          class: 'text-blue-600 underline hover:text-blue-800 transition-colors cursor-pointer',
        },
      }),
      ReportImage,
      SmartTableNode,
      ReportChart,
      ReportMindmap,
      ReportDrawing,
      LatexInline,
      TextColor,
      TextHighlight,
      FontSize,
      FontFamily,
      ReportCodeBlock,
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
        alignments: ['left', 'center', 'right', 'justify'],
      }),
      TextDirection,
      ResetEmptyHeading,
    ],
    content: (() => {
      try {
        return convertLatexDelimitersToNodes(initialContent) || initialContent || '';
      } catch {
        return initialContent || '';
      }
    })(),
    editorProps: {
      handleDOMEvents: {
        auxclick: (view, event) => {
          if (event.button === 1) {
            const target = event.target as HTMLElement | null;
            const anchor = target?.closest('a');
            if (anchor && anchor.href) {
              const href = anchor.href;
              if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:')) {
                window.open(href, '_blank', 'noopener,noreferrer');
                event.preventDefault();
                return true;
              }
            }
          }
          return false;
        },
      },
      clipboardTextSerializer: (slice) => {
        return slice.content.textBetween(0, slice.content.size, '\n\n', (node) => {
          if (node.type.name === 'latexInline') {
            const l = node.attrs?.latex || '';
            return l ? `$${l}$` : '';
          }
          return '';
        });
      },
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
          // Compute deterministic position index based on existing report images in this document
          const currentPos = view.state.selection.$from.pos;
          let imageCountBefore = 0;
          view.state.doc.descendants((node, pos) => {
            if (node.type.name === 'reportImage' && pos <= currentPos) {
              imageCountBefore++;
            }
          });
          imageFiles.forEach((file, fileIdx) => handleImageFile(file, imageCountBefore + fileIdx));
          return true; // Handled
        }

        // Markdown Paste Interception:
        // When copying from AI assistants (ChatGPT, Claude, etc.), READMEs, or markdown files,
        // convert Markdown tables, headings, lists, bold, and code blocks to real rich content.
        const plainText = event.clipboardData?.getData('text/plain') || '';
        const htmlText = event.clipboardData?.getData('text/html') || '';

        // Pure LaTeX formula paste:
        // When copying math formulas (e.g. \alpha \in \left(\frac{1}{2},1\right] or $...$) from ChatGPT / web,
        // render immediately as an inline KaTeX formula instead of creating a code block.
        if (plainText && isPureLatex(plainText.trim())) {
          event.preventDefault();
          const latex = cleanLatex(plainText.trim());
          const ed = editorRef.current;
          if (ed) {
            ed.commands.setLatexInline({ latex });
          } else {
            const mathNode = view.state.schema.nodes.latexInline?.create({ latex });
            if (mathNode) {
              view.dispatch(view.state.tr.replaceSelectionWith(mathNode).scrollIntoView());
            }
          }
          return true; // Handled
        }

        // Table Paste Interception when cursor is inside an existing TipTap table:
        // Fills across cells/columns/rows and auto-expands the table rather than dumping into a single cell.
        const isInsideTable = editorRef.current?.isActive('table');
        const tableGrid = parseClipboardToTableGrid(plainText, htmlText);

        if (isInsideTable && tableGrid && tableGrid.length > 0 && (tableGrid.length > 1 || tableGrid[0].length > 1)) {
          const { state } = view;
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

          if (tableNode && tablePos !== -1 && cellPos !== -1) {
            event.preventDefault();
            const map = TableMap.get(tableNode);
            const rect = map.findCell(cellPos - tablePos - 1);
            const startRow = rect.top;
            const startCol = rect.left;

            const targetRowCount = Math.max(tableNode.childCount, startRow + tableGrid.length);
            const maxIncomingCols = Math.max(...tableGrid.map((r: string[]) => r.length));
            const existingColCount = tableNode.child(0)?.childCount || 1;
            const targetColCount = Math.max(existingColCount, startCol + maxIncomingCols);

            const newRows: any[] = [];
            for (let r = 0; r < targetRowCount; r++) {
              const isHeader = r === 0;
              const origRow = r < tableNode.childCount ? tableNode.child(r) : null;
              const newCells: any[] = [];
              for (let c = 0; c < targetColCount; c++) {
                const isPasted =
                  r >= startRow &&
                  r < startRow + tableGrid.length &&
                  c >= startCol &&
                  c < startCol + tableGrid[r - startRow].length;

                let cellContent: any[] = [];
                if (isPasted) {
                  const textVal = tableGrid[r - startRow][c - startCol];
                  cellContent = textVal
                    ? [state.schema.nodes.paragraph.create(null, state.schema.text(textVal))]
                    : [state.schema.nodes.paragraph.create()];
                } else if (origRow && c < origRow.childCount) {
                  const origCell = origRow.child(c);
                  cellContent = origCell.content.toJSON();
                } else {
                  cellContent = [state.schema.nodes.paragraph.create()];
                }

                const cellType = isHeader
                  ? state.schema.nodes.tableHeader
                  : state.schema.nodes.tableCell;
                newCells.push(cellType.create(null, cellContent));
              }
              newRows.push(state.schema.nodes.tableRow.create(null, newCells));
            }

            const updatedTable = state.schema.nodes.table.create(tableNode.attrs, newRows);
            const tr = state.tr.replaceWith(tablePos, tablePos + tableNode.nodeSize, updatedTable);
            view.dispatch(tr);
            return true; // Handled
          }
        }

        if (plainText && isMarkdown(plainText)) {
          const textHasTable = hasMarkdownTable(plainText);
          const htmlHasTable = /<table[\s>]/i.test(htmlText);
          const shouldConvert = textHasTable ? !htmlHasTable : (!htmlText || isRawPreHtml(htmlText));

          if (shouldConvert) {
            event.preventDefault();
            const renderedHtml = markdownToHtml(plainText);
            const ed = editorRef.current;
            if (ed) {
              ed.commands.insertContent(renderedHtml);
            } else {
              const dom = document.createElement('div');
              dom.innerHTML = renderedHtml;
              const slice = DOMParser.fromSchema(view.state.schema).parseSlice(dom);
              view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
            }
            return true; // Handled
          }
        }

        // Text/HTML paste: normalize to the remembered ("current") font size.
        // Pasted runs that carry no explicit size inherit it; runs with their
        // own size (e.g. Word headings) are preserved. Runs AFTER TipTap's
        // default paste handling (next tick) so the inserted range exists.
        try {
          const from = view.state.selection.from;
          const oldTo = view.state.selection.to;
          const sizeBefore = view.state.doc.content.size;
          const remembered =
            ((editorRef.current?.storage as any)?.fontSize?.current as string | undefined) ||
            DEFAULT_FONT_SIZE;
          window.setTimeout(() => {
            try {
              const ed = editorRef.current;
              if (!ed) return;
              const st = ed.state;
              const markType = st.schema.marks.fontSize;
              if (!markType) return;
              // Exact inserted range from net doc growth (never touches
              // pre-existing text outside the paste).
              const inserted = st.doc.content.size - sizeBefore;
              if (inserted <= 0) return;
              const to = Math.min(oldTo + inserted, st.doc.content.size);
              if (!(to > from)) return;
              const tr = st.tr;
              st.doc.nodesBetween(from, to, (node: any, pos: number) => {
                // nodesBetween also visits nodes merely overlapping the
                // range (ProseMirror merges adjacent text): clip strictly to
                // the inserted slice so pre-existing text is never touched.
                if (node?.isText && !node.marks.some((m: any) => m.type === markType)) {
                  const s = Math.max(pos, from);
                  const e = Math.min(pos + node.nodeSize, to);
                  if (e > s) tr.addMark(s, e, markType.create({ size: remembered }));
                }
              });
              if (tr.docChanged) ed.view.dispatch(tr);
            } catch {}
          }, 0);
        } catch {}
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
          const currentPos = view.state.selection.$from.pos;
          let imageCountBefore = 0;
          view.state.doc.descendants((node, pos) => {
            if (node.type.name === 'reportImage' && pos <= currentPos) {
              imageCountBefore++;
            }
          });
          imageFiles.forEach((file, fileIdx) => handleImageFile(file, imageCountBefore + fileIdx));
          return true; // Handled
        }
        return false;
      },
      handleKeyDown: (view, event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
          event.preventDefault();
          const { state } = view;
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
          return true;
        }

        // GUARD: Backspace/Delete must never silently remove an image, mind-map,
        // or smart table. All are atom block nodes: pressing Backspace with one
        // selected would delete it instantly (then autosave persists the loss)
        // while its entity (table) stays behind and "resurrects". Deletion is
        // only allowed through the toolbar trash button with confirmation
        // (which deletes the node AND its entity together).
        if (event.key === 'Backspace' || event.key === 'Delete') {
          try {
            const sel: any = view?.state?.selection;
            const selectedNode = sel?.node;
            if (selectedNode?.type?.name === 'reportImage' || selectedNode?.type?.name === 'reportMindmap' || selectedNode?.type?.name === 'reportDrawing' || selectedNode?.type?.name === 'smartTable') {
              event.preventDefault();
              toast.error(
                reportLanguage === 'ar'
                  ? selectedNode?.type?.name === 'smartTable'
                    ? 'لحماية البيانات: احذف الجدول الذكي بزر "حذف الجدول" في شريط الأدوات (مع التأكيد) — يحذف الجدول وقيمه نهائيًا.'
                    : 'لحماية المحتوى: احذف الصور والخرائط الذهنية بزر سلة المهملات في شريط العنصر (مع التأكيد)، وليس بزر الرجوع.'
                  : selectedNode?.type?.name === 'smartTable'
                    ? 'Protected: delete smart tables with the "Delete Table" toolbar button (with confirmation) — it removes the table and its values.'
                    : 'Content protected: delete images and mind maps with the trash button on the element toolbar (with confirmation), not Backspace.'
              );
              return true; // handled — node stays intact
            }
          } catch {}
        }

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
            const next = Math.min(72, resolveActiveFontSize(ed) + 2);
            ed.chain().focus().setFontSize(`${next}px`).run();
          }
          return true;
        }

        // Decrease Font Size (-2px) (Ctrl+Shift+<)
        if (isAction('decrease_font_size')) {
          event.preventDefault();
          if (editorRef.current) {
            const ed = editorRef.current;
            const next = Math.max(10, resolveActiveFontSize(ed) - 2);
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
      handleClick: (view, _pos, event) => {
        try {
          const target = event.target as HTMLElement | null;
          const anchor = target?.closest('a');
          if (anchor && anchor.href) {
            const href = anchor.href;
            if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:')) {
              window.open(href, '_blank', 'noopener,noreferrer');
              return true;
            }
          }
          if (target && target.closest('button, select, input, textarea, .codeblock-bar, .smart-table-node-view')) {
            return false;
          }
          const { state } = view;
          const { doc, schema } = state;
          const lastChild = doc.lastChild;
          if (!lastChild) return false;

          const lastDomChild = view.dom.lastElementChild;
          if (lastDomChild) {
            const lastRect = lastDomChild.getBoundingClientRect();
            // If user clicked below the bottom of the last element in the editor:
            if (event.clientY > lastRect.bottom) {
              const endPos = doc.content.size;
              const isLastEmptyParagraph =
                lastChild.type.name === 'paragraph' && lastChild.textContent.length === 0;
              if (isLastEmptyParagraph) {
                const tr = state.tr.setSelection(TextSelection.create(state.doc, endPos - 1));
                view.dispatch(tr);
                view.focus();
                return true;
              } else {
                const tr = state.tr;
                const p = schema.nodes.paragraph.create();
                tr.insert(endPos, p);
                tr.setSelection(TextSelection.create(tr.doc, endPos + 1));
                view.dispatch(tr);
                view.focus();
                return true;
              }
            }
          }
        } catch {}
        return false;
      },
      attributes: {
        class: 'prose prose-slate max-w-none focus:outline-none p-3.5 sm:p-6 md:p-8 min-h-[500px] w-full',
        spellcheck: 'true',
        autocorrect: 'on',
        autocapitalize: 'sentences',
        dir: reportLanguage === 'ar' ? 'rtl' : 'ltr',
      },
    },
    onSelectionUpdate: ({ editor: ed }) => {
      const { from, to, empty } = ed.state.selection;
      const selection = empty
        ? ''
        : ed.state.doc.textBetween(
            from,
            to,
            ' ',
            (node) => (node.type.name === 'latexInline' ? `$${node.attrs?.latex || ''}$` : '')
          );
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('editor-selection-changed', {
            detail: { selection, reportId },
          })
        );
      }
    },
    onUpdate: ({ editor: ed }) => {
      const json = ed.getJSON();
      if (onContentChange) {
        onContentChange(json);
      }
      // Smart-table GC: if a smartTable node disappeared from the doc by ANY
      // path (cut, select-all+delete, drag, undo of an insert), its entity
      // must go too — otherwise TablesTab keeps listing it and the values
      // "come back". The toolbar delete already removes the entity first;
      // this catches every other path (best-effort, debounced).
      try {
        const present = new Set<string>();
        try {
          ed.state.doc.descendants((node: any) => {
            if (node?.type?.name === 'smartTable' && node.attrs?.tableId) {
              present.add(String(node.attrs.tableId));
            }
          });
        } catch {}
        const prevIds: Set<string> = (ed.storage as any)?.__smartIds || new Set<string>();
        const removed: string[] = [];
        prevIds.forEach((id: string) => {
          if (!present.has(id)) removed.push(id);
        });
        (ed.storage as any).__smartIds = present;
        if (removed.length > 0) {
          // Skip ids already handled by the toolbar delete (session tombstoned).
          void (async () => {
            try {
              const mod = await import('@/lib/db-intelligence');
              for (const rid of removed) {
                try {
                  if (mod.isTableDeletedInSession(rid) || mod.isTableTombed(rid)) continue;
                  await mod.deleteTableEntity(rid);
                  try {
                    window.dispatchEvent(new CustomEvent('smart-table-deleted', { detail: { tableId: rid } }));
                  } catch {}
                } catch {}
              }
            } catch {}
          })();
        }
      } catch {}
      try {
        const text: string = ed.getText() || '';
        const trimmed = text.trim();
        setStats({
          words: trimmed ? trimmed.split(/\s+/).length : 0,
          chars: text.replace(/\s/g, '').length,
        });
      } catch {}
      triggerAutosave(json);
    },
    onBlur: ({ editor: ed }) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      const json = ed.getJSON();
      // Skip no-op blur saves (toolbar interactions blur constantly).
      try {
        if (fingerprintJson(json) === lastFlushedJsonRef.current && lastFlushedJsonRef.current) return;
      } catch {}
      saveContent(json);
    },
  });

  editorRef.current = editor;

  useEffect(() => {
    if (editor && onEditorReady) {
      onEditorReady(editor);
    }
    // Seed the smart-table id baseline so onUpdate diffing only fires for
    // real removals (not for the initial load).
    if (editor) {
      try {
        const ids = new Set<string>();
        editor.state.doc.descendants((node: any) => {
          if (node?.type?.name === 'smartTable' && node.attrs?.tableId) {
            ids.add(String(node.attrs.tableId));
          }
        });
        (editor.storage as any).__smartIds = ids;
      } catch {}
    }
  }, [editor, onEditorReady]);

  // Initial word/character count once the editor is ready.
  useEffect(() => {
    if (!editor) return;
    // Baseline for the blur-save fingerprint: opening the editor must not
    // count as a change (was: first toolbar click always triggered a save).
    try {
      if (!lastFlushedJsonRef.current) {
        lastFlushedJsonRef.current = fingerprintJson(editor.getJSON());
      }
    } catch {}
    try {
      const text: string = editor.getText() || '';
      const trimmed = text.trim();
      setStats({
        words: trimmed ? trimmed.split(/\s+/).length : 0,
        chars: text.replace(/\s/g, '').length,
      });
    } catch {}
  }, [editor]);

  // AI bridge removed in the unified-editor refactor: the editor no longer
  // listens for assistant mutations. Kept as a no-op effect for clarity.

  // Reset selection when switching reports or unmounting
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('editor-selection-changed', {
            detail: { selection: '', reportId },
          })
        );
      }
    };
  }, [reportId]);

  // Backup smart-table delete path: strip residual smartTable node(s) by id.
  // The node view header and the toolbar command delete the entity first and
  // call deleteNode(); when that NodeView callback is stale (sheet never
  // mounted, focus bridge inactive) the entity is gone but the block stays
  // and "comes back" visually. These listeners guarantee the block is gone
  // too — deletion is confirmed upstream, so no second prompt here.
  useEffect(() => {
    const stripNodeByTableId = (tableId: string) => {
      const ed = editorRef.current;
      if (!ed || !tableId) return;
      try {
        const matches: number[] = [];
        ed.state.doc.descendants((node: any, pos: number) => {
          if (node?.type?.name === 'smartTable' && String(node.attrs?.tableId || '') === tableId) {
            matches.push(pos);
          }
        });
        if (!matches.length) return;
        // Delete back-to-front so positions stay valid.
        let tr = ed.state.tr;
        for (let i = matches.length - 1; i >= 0; i--) {
          const pos = matches[i];
          const node: any = ed.state.doc.nodeAt(pos);
          if (node) tr = tr.delete(pos, pos + node.nodeSize);
        }
        if (tr.docChanged) {
          ed.view.dispatch(tr);
          const json = ed.getJSON();
          if (onContentChange) onContentChange(json);
          triggerAutosave(json);
        }
      } catch (err) {
        console.warn('smart-table backup strip failed', tableId, err);
      }
    };
    const onDeleted = (e: Event) => {
      try {
        const id = String((e as CustomEvent)?.detail?.tableId || '');
        if (id) stripNodeByTableId(id);
      } catch {}
    };
    window.addEventListener('smart-table-deleted', onDeleted);
    window.addEventListener('smart-table-delete-node', onDeleted);
    return () => {
      window.removeEventListener('smart-table-deleted', onDeleted);
      window.removeEventListener('smart-table-delete-node', onDeleted);
    };
  }, [onContentChange, triggerAutosave]);

  const saveContentRef = useRef(saveContent);
  saveContentRef.current = saveContent;

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

  // Flush pending save on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
        if (editorRef.current) {
          saveContentRef.current(editorRef.current.getJSON());
        }
      }
    };
  }, []);

  // Flush pending save before page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (debounceTimerRef.current && editorRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
        saveContentRef.current(editorRef.current.getJSON());
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
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

  // ============ Mini Chart system: toolbar bridge, selection mode, AI actions ============
  const refreshChartTables = useCallback(async () => {
    const list: Array<{ tableId: string; kind: 'smart' | 'native'; name: string }> = [];
    try {
      const tables = await getTablesByReportId(reportId);
      for (const tb of tables) list.push({ tableId: tb.id, kind: 'smart', name: tb.name || tb.id });
    } catch {}
    try {
      const doc = editorRef.current?.getJSON?.();
      const natives = extractNativeTables(doc);
      natives.forEach((n) => {
        const label = n.headers.length ? n.headers.slice(0, 3).join('، ') : `Table ${n.index + 1}`;
        list.push({ tableId: n.key, kind: 'native', name: `${reportLanguage === 'ar' ? 'جدول' : 'Table'} ${n.index + 1} (${label})` });
      });
    } catch {}
    // embedded smart tables from other reports
    try {
      editorRef.current?.state?.doc?.descendants?.((node: any) => {
        if (node.type.name === 'smartTable' && node.attrs.tableId && !list.some((l) => l.tableId === node.attrs.tableId)) {
          list.push({ tableId: node.attrs.tableId, kind: 'smart', name: node.attrs.tableId });
        }
      });
    } catch {}
    setChartTables(list);
    return list;
  }, [reportId, reportLanguage]);

  const findNativeTableAtSelection = useCallback((): string | null => {
    try {
      const ed = editorRef.current;
      if (!ed) return null;
      let found: string | null = null;
      let tableIdx = -1;
      ed.state.doc.descendants((node: any, pos: number) => {
        if (node.type.name === 'table') {
          tableIdx++;
          if (found) return;
          const sel = ed.state.selection;
          if (pos <= sel.$from.pos && sel.$from.pos <= pos + node.nodeSize) {
            found = `native:${tableIdx}`;
          }
        }
      });
      return found;
    } catch {
      return null;
    }
  }, []);

  const openBuilderFor = useCallback((preset: { tableId: string; kind: 'smart' | 'native' } | null, editId: string | null = null) => {
    setChartSelectMode(false);
    setChartPreset(preset);
    setChartEditId(editId);
    setChartBuilderOpen(true);
  }, []);

  useEffect(() => {
    const onChartButton = async (e: Event) => {
      const detail = (e as CustomEvent)?.detail || {};
      const ed = editorRef.current;
      // Case 1: cursor inside a native table → use it directly
      try {
        if (ed?.isActive?.('table')) {
          const key = findNativeTableAtSelection();
          if (key) {
            openBuilderFor({ tableId: key, kind: 'native' });
            return;
          }
        }
      } catch {}
      // Case 1b: smart table focused (toolbar bridge passes tableId)
      if (detail.smartTableId) {
        openBuilderFor({ tableId: detail.smartTableId, kind: 'smart' });
        return;
      }
      // Case 2: selection mode — but never an empty dead end.
      const list = await refreshChartTables().catch(() => [] as Array<{ tableId: string; kind: 'smart' | 'native'; name: string }>);
      if (!list.length) {
        toast.info(
          reportLanguage === 'ar'
            ? 'أدرج جدولًا (عاديًا أو ذكيًا) أولًا ثم أنشئ الرسم منه'
            : 'Insert a table (normal or smart) first, then build a chart from it'
        );
        return;
      }
      setChartSelectedSource(null);
      setChartSelectMode(true);
    };
    const onEditReq = (e: Event) => {
      const { chartId } = (e as CustomEvent)?.detail || {};
      if (!chartId) return;
      let attrs: any = null;
      try {
        editorRef.current?.state?.doc?.descendants?.((node: any) => {
          if (node.type.name === 'reportChart' && node.attrs.chartId === chartId) attrs = { ...node.attrs };
        });
      } catch {}
      const preset = attrs?.sourceTableId
        ? { tableId: String(attrs.sourceTableId), kind: (attrs.sourceKind === 'native' ? 'native' : 'smart') as 'smart' | 'native' }
        : null;
      openBuilderFor(preset, chartId);
    };
    const onDuplicateReq = (e: Event) => {
      const { chartId } = (e as CustomEvent)?.detail || {};
      if (!chartId || !editorRef.current) return;
      let attrs: any = null;
      try {
        editorRef.current?.state?.doc?.descendants?.((node: any) => {
          if (node.type.name === 'reportChart' && node.attrs.chartId === chartId) attrs = { ...node.attrs };
        });
      } catch {}
      if (!attrs) return;
      const id = newChartId();
      try {
        (editorRef.current.chain().focus() as any).setReportChart({
          chartId: id,
          type: attrs.type,
          title: attrs.title ? `${attrs.title} (2)` : '',
          sourceTableId: attrs.sourceTableId,
          sourceKind: attrs.sourceKind,
          categoryColumn: attrs.categoryColumn,
          valueColumns: attrs.valueColumns,
          xAxisName: attrs.xAxisName,
          yAxisName: attrs.yAxisName,
          showLegend: attrs.showLegend,
          showLabels: attrs.showLabels,
          stacked: attrs.stacked,
          height: attrs.height,
          tableName: attrs.tableName,
        }).run();
      } catch {}
    };
    const collectKnownTables = (): { smart: Set<string>; native: Set<string>; charts: Set<string> } => {
      const smart = new Set<string>();
      const native = new Set<string>();
      const charts = new Set<string>();
      try {
        editorRef.current?.state?.doc?.descendants?.((node: any) => {
          if (node.type.name === 'smartTable' && node.attrs.tableId) smart.add(String(node.attrs.tableId));
          if (node.type.name === 'reportChart' && node.attrs.chartId) charts.add(String(node.attrs.chartId));
        });
        const natives = extractNativeTables(editorRef.current?.getJSON?.());
        natives.forEach((n) => native.add(n.key));
      } catch {}
      chartTables.forEach((t) => {
        if (t.kind === 'smart') smart.add(t.tableId);
        else native.add(t.tableId);
      });
      return { smart, native, charts };
    };
    const onAiAction = (e: Event) => {
      const action = (e as CustomEvent)?.detail;
      if (!action || !editorRef.current) return;
      const ed = editorRef.current;
      try {
        if (action.name === 'create_chart') {
          const p = action.params;
          // Verify before executing: source must exist, columns non-empty
          const known = collectKnownTables();
          const srcId = String(p.source_table || '');
          const srcKnown = known.smart.has(srcId) || known.native.has(srcId);
          if (!srcKnown) {
            // refresh async then retry once
            refreshChartTables().then((list) => {
              const ok = list.some((x) => x.tableId === srcId);
              if (!ok) {
                toast.error(reportLanguage === 'ar' ? `جدول غير معروف: ${srcId}` : `Unknown source table: ${srcId}`);
                return;
              }
              const schema = schemaFromCreateParams(p, newChartId());
              (ed.chain().focus() as any).setReportChart({
                chartId: schema.chartId,
                type: schema.type,
                title: schema.title || '',
                sourceTableId: schema.source.tableId,
                sourceKind: schema.source.kind,
                categoryColumn: schema.source.categoryColumn,
                valueColumns: schema.source.valueColumns,
                showLegend: true,
                showLabels: false,
                height: 320,
              }).run();
              toast.success(reportLanguage === 'ar' ? 'تم إنشاء الرسم البياني' : 'Chart created');
            });
            return;
          }
          if (!p.category || !p.series || p.series.length === 0) {
            toast.error(reportLanguage === 'ar' ? 'فشل إنشاء الرسم: الأعمدة ناقصة' : 'create_chart failed: missing columns');
            return;
          }
          const schema = schemaFromCreateParams(p, newChartId());
          // Phase 4.4 (B17): stamp native fingerprint like the builder does.
          let aiFingerprint = '';
          try {
            if (schema.source.kind === 'native') {
              const aiNatives = extractNativeTables(ed.getJSON?.());
              aiFingerprint = nativeFingerprint(aiNatives.find((n) => n.key === schema.source.tableId) || null);
            }
          } catch {}
          (ed.chain().focus() as any).setReportChart({
            chartId: schema.chartId,
            type: schema.type,
            title: schema.title || '',
            sourceTableId: schema.source.tableId,
            sourceKind: schema.source.kind,
            sourceFingerprint: aiFingerprint,
            categoryColumn: schema.source.categoryColumn,
            valueColumns: schema.source.valueColumns,
            showLegend: true,
            showLabels: false,
            height: 320,
          }).run();
          toast.success(reportLanguage === 'ar' ? 'تم إنشاء الرسم البياني' : 'Chart created');
        } else if (action.name === 'update_chart') {
          const p = action.params;
          if (!collectKnownTables().charts.has(String(p.chartId))) {
            toast.error(reportLanguage === 'ar' ? `رسم غير معروف: ${p.chartId}` : `Unknown chartId: ${p.chartId}`);
            return;
          }
          const patch: any = {};
          if (p.title !== undefined) patch.title = p.title;
          if (p.type !== undefined) patch.type = normalizeChartType(p.type);
          if (p.category !== undefined) patch.categoryColumn = p.category;
          if (p.series !== undefined) patch.valueColumns = p.series;
          if (p.showLegend !== undefined) patch.showLegend = p.showLegend;
          if (p.showLabels !== undefined) patch.showLabels = p.showLabels;
          if (p.xAxisName !== undefined) patch.xAxisName = p.xAxisName;
          if (p.yAxisName !== undefined) patch.yAxisName = p.yAxisName;
          ed.chain().focus().updateReportChart(p.chartId, patch).run();
        } else if (action.name === 'delete_chart') {
          if (!collectKnownTables().charts.has(String(action.params.chartId))) {
            toast.error(reportLanguage === 'ar' ? `رسم غير معروف: ${action.params.chartId}` : `Unknown chartId: ${action.params.chartId}`);
            return;
          }
          ed.chain().focus().deleteReportChart(action.params.chartId).run();
        } else if (action.name === 'change_chart_type') {
          if (!collectKnownTables().charts.has(String(action.params.chartId))) {
            toast.error(reportLanguage === 'ar' ? `رسم غير معروف: ${action.params.chartId}` : `Unknown chartId: ${action.params.chartId}`);
            return;
          }
          ed.chain().focus().updateReportChart(action.params.chartId, { type: normalizeChartType(action.params.type) }).run();
        } else if (action.name === 'update_chart_source') {
          const p = action.params;
          const patch: any = {
            sourceTableId: p.source_table,
            sourceKind: String(p.source_table).startsWith('native:') ? 'native' : 'smart',
          };
          // Phase 4.4 (B17): refresh the fingerprint on source switch.
          try {
            if (patch.sourceKind === 'native') {
              const swNatives = extractNativeTables(ed.getJSON?.());
              patch.sourceFingerprint = nativeFingerprint(
                swNatives.find((n) => n.key === p.source_table) || null
              );
            } else {
              patch.sourceFingerprint = '';
            }
          } catch {}
          if (p.category !== undefined) patch.categoryColumn = p.category;
          if (p.series !== undefined) patch.valueColumns = p.series;
          ed.chain().focus().updateReportChart(p.chartId, patch).run();
          window.dispatchEvent(new CustomEvent('chart-source-changed', { detail: { tableId: p.source_table } }));
        }
      } catch (err) {
        console.error('chart-ai-action failed', err);
      }
    };
    window.addEventListener('chart-button-pressed', onChartButton);
    window.addEventListener('chart-edit-request', onEditReq);
    window.addEventListener('chart-duplicate-request', onDuplicateReq);
    return () => {
      window.removeEventListener('chart-button-pressed', onChartButton);
      window.removeEventListener('chart-edit-request', onEditReq);
      window.removeEventListener('chart-duplicate-request', onDuplicateReq);
    };
  }, [findNativeTableAtSelection, openBuilderFor, refreshChartTables, reportLanguage, chartTables]);

  // Selection-mode: click a table in the document to pick it (with ✓ highlight)
  useEffect(() => {
    if (!chartSelectMode) return;
    const wrap = editorContentWrapRef.current;
    if (!wrap) return;
    const markSelection = () => {
      try {
        // native tables
        const domTables = wrap.querySelectorAll('.ProseMirror table');
        domTables.forEach((el, idx) => {
          const h = el as HTMLElement;
          const isSel = chartSelectedSource?.kind === 'native' && chartSelectedSource.tableId === `native:${idx}`;
          h.style.outline = isSel ? '3px solid #2E4034' : '2px dashed #2E4034AA';
          h.style.outlineOffset = '3px';
          h.style.cursor = 'pointer';
          h.style.position = 'relative';
          let badge = h.querySelector(':scope > .chart-pick-badge') as HTMLElement | null;
          // place badge on wrapper instead (table can't hold div reliably) — use parent
          const parent = h.parentElement as HTMLElement | null;
          if (isSel && parent && !parent.querySelector(':scope > .chart-pick-badge')) {
            badge = document.createElement('div');
            badge.className = 'chart-pick-badge';
            badge.textContent = '✓';
            badge.style.cssText = 'position:absolute;top:-12px;inset-inline-end:-8px;z-index:20;width:24px;height:24px;border-radius:9999px;background:#2E4034;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:900;box-shadow:0 2px 8px rgba(0,0,0,.25)';
            parent.style.position = 'relative';
            parent.appendChild(badge);
          }
          if (!isSel && parent) {
            parent.querySelectorAll(':scope > .chart-pick-badge').forEach((b) => b.remove());
          }
        });
        // smart tables (Univer node views; legacy hand-rolled class kept as fallback)
        const smarts = wrap.querySelectorAll('.smart-table-node-view, .smart-table-wrapper');
        smarts.forEach((el) => {
          const h = el as HTMLElement;
          const id = h.getAttribute('data-table-id') || h.querySelector('[data-table-id]')?.getAttribute('data-table-id') || '';
          // fallback: match by order against chartTables smart entries
          const isSel = !!chartSelectedSource && chartSelectedSource.kind === 'smart' &&
            (chartSelectedSource.tableId === id || h.textContent?.includes(chartSelectedSource.name));
          h.style.outline = isSel ? '3px solid #2E4034' : '2px dashed #2E4034AA';
          h.style.outlineOffset = '3px';
          h.style.cursor = 'pointer';
          h.style.borderRadius = '12px';
          let badge = h.querySelector(':scope > .chart-pick-badge') as HTMLElement | null;
          if (isSel && !badge) {
            badge = document.createElement('div');
            badge.className = 'chart-pick-badge';
            badge.textContent = '✓';
            badge.style.cssText = 'position:absolute;top:-12px;inset-inline-end:-8px;z-index:20;width:24px;height:24px;border-radius:9999px;background:#2E4034;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:900;box-shadow:0 2px 8px rgba(0,0,0,.25)';
            h.style.position = 'relative';
            h.appendChild(badge);
          }
          if (!isSel) badge?.remove();
        });
      } catch {}
    };
    markSelection();
    const onClick = (ev: MouseEvent) => {
      const t = ev.target as HTMLElement | null;
      if (!t || typeof t.closest !== 'function') return;
      const smartEl = t.closest('.smart-table-node-view, .smart-table-wrapper') as HTMLElement | null;
      if (smartEl) {
        ev.preventDefault(); ev.stopPropagation();
        // resolve tableId: prefer the embedded id, else match DOM order
        const directId = smartEl.getAttribute('data-table-id') || smartEl.querySelector('[data-table-id]')?.getAttribute('data-table-id') || '';
        const allSmarts = Array.from(wrap.querySelectorAll('.smart-table-node-view, .smart-table-wrapper'));
        const idx = allSmarts.indexOf(smartEl);
        const smartOpts = chartTables.filter((x) => x.kind === 'smart');
        const pick = (directId && smartOpts.find((x) => x.tableId === directId)) || smartOpts[idx] || smartOpts[0];
        if (pick) setChartSelectedSource(pick);
        return;
      }
      const tbl = t.closest('.ProseMirror table') as HTMLElement | null;
      if (tbl) {
        ev.preventDefault(); ev.stopPropagation();
        const all = Array.from(wrap.querySelectorAll('.ProseMirror table'));
        const idx = all.indexOf(tbl);
        const key = `native:${idx}`;
        const meta = chartTables.find((x) => x.tableId === key);
        setChartSelectedSource(meta || { tableId: key, kind: 'native', name: `Table ${idx + 1}` });
      }
    };
    wrap.addEventListener('click', onClick, true);
    return () => {
      wrap.removeEventListener('click', onClick, true);
      try {
        wrap.querySelectorAll('.ProseMirror table').forEach((el) => {
          const h = el as HTMLElement;
          h.style.outline = ''; h.style.outlineOffset = ''; h.style.cursor = '';
        });
        wrap.querySelectorAll('.smart-table-node-view, .smart-table-wrapper').forEach((el) => {
          const h = el as HTMLElement;
          h.style.outline = ''; h.style.outlineOffset = ''; h.style.cursor = '';
        });
        wrap.querySelectorAll('.chart-pick-badge').forEach((b) => b.remove());
      } catch {}
    };
  }, [chartSelectMode, chartSelectedSource, chartTables]);

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
          reportId={reportId}
          reportLanguage={reportLanguage}
          onImageUpload={handleImageFile}
          uploadingImage={uploadingImage}
        />
      </div>

      {/* Chart Selection Mode banner */}
      {chartSelectMode && (
        <div className="flex flex-col gap-2 border-b border-[#2E4034]/30 bg-[#2E4034]/5 px-3 py-2.5 sm:px-4" dir={dir}>
          <div className="flex items-center gap-2 text-xs font-bold text-[#2E4034] dark:text-emerald-300">
            <span>📊 {reportLanguage === 'ar' ? 'اختيار بيانات الرسم البياني' : 'Pick chart data'}</span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {reportLanguage === 'ar' ? 'حدد جدولًا أو نطاق بيانات من التقرير' : 'Select a table or data range from the report'}
          </p>
          {chartTables.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {chartTables.map((tb) => {
                const sel = chartSelectedSource?.tableId === tb.tableId;
                return (
                  <button
                    key={tb.tableId}
                    type="button"
                    onClick={() => setChartSelectedSource(tb)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors',
                      sel
                        ? 'border-[#2E4034] bg-[#2E4034] text-white shadow'
                        : 'border-border bg-background text-foreground hover:border-[#2E4034]/60'
                    )}
                  >
                    {sel && <span>✓</span>}
                    <span className="max-w-[180px] truncate">{tb.name}</span>
                  </button>
                );
              })}
            </div>
          )}
          {chartSelectedSource && (
            <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
              ✓ {chartSelectedSource.name}
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => { setChartSelectMode(false); setChartSelectedSource(null); }}
              className="h-8 rounded-lg border border-border bg-background px-3 text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              {reportLanguage === 'ar' ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="button"
              disabled={!chartSelectedSource}
              onClick={() => {
                if (!chartSelectedSource) return;
                openBuilderFor({ tableId: chartSelectedSource.tableId, kind: chartSelectedSource.kind });
              }}
              className="h-8 rounded-lg bg-[#2E4034] px-4 text-xs font-bold text-white hover:bg-[#24382F] disabled:opacity-40"
            >
              {reportLanguage === 'ar' ? 'متابعة →' : 'Continue →'}
            </button>
          </div>
        </div>
      )}

      {/* Editor Content Area respecting Report Language, Direction, Theme, and Background */}
      <div
        ref={editorContentWrapRef}
        dir={dir}
        onClick={(e) => {
          if (!editor) return;
          const target = e.target as HTMLElement;
          if (target.closest('button, select, input, textarea, a, .codeblock-bar, .smart-table-node-view, .report-drawing-wrapper')) {
            return;
          }
          const { state, view } = editor;
          const { doc, schema } = state;
          const lastChild = doc.lastChild;
          if (!lastChild) return;

          const proseMirrorEl = view.dom;
          const lastDomChild = proseMirrorEl.lastElementChild;
          if (lastDomChild) {
            const lastRect = lastDomChild.getBoundingClientRect();
            if (e.clientY > lastRect.bottom) {
              const endPos = doc.content.size;
              const isLastEmptyParagraph =
                lastChild.type.name === 'paragraph' && lastChild.textContent.length === 0;
              if (isLastEmptyParagraph) {
                editor.commands.focus('end');
              } else {
                const tr = state.tr;
                const p = schema.nodes.paragraph.create();
                tr.insert(endPos, p);
                tr.setSelection(TextSelection.create(tr.doc, endPos + 1));
                view.dispatch(tr.scrollIntoView());
                editor.commands.focus();
              }
            }
          }
        }}
        onContextMenu={(e) => {
          // The smart sheet (Univer) owns its context menu: never stack
          // ours on top of it (was: two overlapping menus).
          try {
            const t = e.target as HTMLElement | null;
            if (t && typeof t.closest === 'function' && t.closest('.smart-table-node-view')) return;
          } catch {}

          // Check if custom context menu is requested:
          // In 'browser' mode (default):
          // Right-click defaults to browser native menu (spellcheck suggestions, dictionary, Google search).
          // Holding Alt or Ctrl opens the rich custom context menu.
          // In 'custom' mode:
          // Right-click opens the custom menu; Shift or Alt opens native browser menu.
          const wantsCustomMenu =
            contextMenuMode === 'custom'
              ? !e.shiftKey && !e.altKey
              : Boolean(e.altKey || e.ctrlKey);

          if (!wantsCustomMenu) {
            // Let the native browser context menu handle right-click!
            // This is essential so the browser's native spellcheck engine
            // displays its native spelling correction suggestions, "Add to dictionary", etc.
            return;
          }

          e.preventDefault();

          let targetWord = '';
          let targetRange: { from: number; to: number } | null = null;
          let contextSentence = '';

          if (editor) {
            const { from, to, empty } = editor.state.selection;
            if (!empty) {
              const selected = editor.state.doc
                .textBetween(
                  from,
                  to,
                  ' ',
                  (node) => (node.type.name === 'latexInline' ? `$${node.attrs?.latex || ''}$` : '')
                )
                .trim();
              if (selected) {
                targetWord = selected;
                targetRange = { from, to };
              }
            }

            try {
              const coords = editor.view.posAtCoords({ left: e.clientX, top: e.clientY });
              if (coords && typeof coords.pos === 'number') {
                if (!targetWord || coords.pos < from || coords.pos > to) {
                  const resolved = findWordAtPosition(editor.state.doc, coords.pos);
                  if (resolved) {
                    targetWord = resolved.word;
                    targetRange = { from: resolved.from, to: resolved.to };
                    editor.chain().setTextSelection({ from: resolved.from, to: resolved.to }).run();
                  }
                }

                const $pos = editor.state.doc.resolve(coords.pos);
                if ($pos.parent && $pos.parent.textContent) {
                  contextSentence = $pos.parent.textContent.slice(0, 200);
                }
              }
            } catch (err) {
              console.warn('Could not compute word at right-click coords', err);
            }
          }

          setContextMenu({
            isOpen: true,
            x: e.clientX,
            y: e.clientY,
            targetWord,
            targetRange,
            contextSentence,
          });
        }}
        style={{
          fontFamily: reportFontFamily || DEFAULT_FONT_STACK,
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
        <div className="w-full min-w-full relative" spellCheck={true}>
          <EditorContent editor={editor} spellCheck={true} />
          <TableFillHandle editor={editor} />
        </div>
      </div>

      {/* Live word/character counter & context menu mode toggle — footer bar below the editor */}
      <div
        className="flex items-center justify-between gap-3 rounded-b-xl border-t border-border/60 bg-muted/30 px-3 py-1.5 text-[11px] text-muted-foreground sm:px-4"
        aria-live="polite"
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleContextMenuMode}
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium border border-border/70 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title={
              contextMenuMode === 'browser'
                ? (reportLanguage === 'ar'
                    ? 'النقر بالزر الأيمن يفتح تدقيق المتصفح والبحث مباشرة. انقر للتبديل، أو اضغط Alt + زر الفأرة لقائمة التنسيق'
                    : 'Right-click opens native browser spellcheck & search. Click to toggle, or Alt+click for format menu')
                : (reportLanguage === 'ar'
                    ? 'النقر بالزر الأيمن يفتح قائمة التنسيق المخصصة. انقر للتبديل، أو اضغط Shift + زر الفأرة لتدقيق المتصفح'
                    : 'Right-click opens custom format menu. Click to toggle, or Shift+click for native spellcheck')
            }
          >
            {contextMenuMode === 'browser' ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>{reportLanguage === 'ar' ? 'تدقيق المتصفح نشط' : 'Browser Spellcheck Active'}</span>
              </>
            ) : (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                <span>{reportLanguage === 'ar' ? 'قائمة التنسيق المخصصة' : 'Custom Format Menu'}</span>
              </>
            )}
          </button>
        </div>

        <div className="flex items-center gap-3">
          <span className="font-semibold tabular-nums">
            {reportLanguage === 'ar' ? `كلمات: ${stats.words}` : `Words: ${stats.words}`}
          </span>
          <span aria-hidden="true" className="opacity-40">•</span>
          <span className="tabular-nums">
            {reportLanguage === 'ar' ? `أحرف: ${stats.chars}` : `Characters: ${stats.chars}`}
          </span>
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
        targetWord={contextMenu.targetWord}
        targetRange={contextMenu.targetRange}
        contextSentence={contextMenu.contextSentence}
      />

      {/* Chart Builder side panel */}
      {chartBuilderOpen && editor && (
        <ChartBuilderPanel
          editor={editor}
          reportId={reportId}
          editChartId={chartEditId}
          presetSource={chartPreset}
          onClose={() => { setChartBuilderOpen(false); setChartEditId(null); setChartPreset(null); }}
          onDone={() => {
            try {
              const json = editorRef.current?.getJSON?.();
              if (json) {
                if (onContentChange) onContentChange(json);
                triggerAutosave(json);
              }
            } catch {}
          }}
        />
      )}

      {/* Document Import dialog (DOCX/XLSX) — inserts into the existing editor */}
      <ImportModal
        open={importOpen}
        initialKind={importKind}
        editor={editor}
        reportId={reportId}
        onClose={() => setImportOpen(false)}
      />
    </div>
  );
}
