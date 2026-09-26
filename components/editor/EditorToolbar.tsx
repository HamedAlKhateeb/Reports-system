'use client';

import React, { useRef, useState } from 'react';
import { Editor } from '@tiptap/react';
import {
  Bold,
  Italic,
  BarChart3,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Table as TableIcon,
  Plus,
  Minus,
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
  Highlighter,
  Baseline,
  ChevronDown,
  Link as LinkIcon,
  Unlink,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Code,
  PilcrowLeft,
  PilcrowRight,
  Sigma,
  Sheet,
  Type as TypeIcon,
  Undo2,
  Redo2,
  ArrowRightLeft,
  ArrowLeftRight,
  Maximize2,
  Network,
  PenTool,
  KanbanSquare,
  ExternalLink,
  MousePointer2,
  Hand,
  Square,
  Diamond,
  Circle,
  MoveRight,
  Pencil,
  StickyNote,
  Eraser,
  ZoomIn,
  ZoomOut,
  CopyPlus,
} from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TableEntity } from '@/lib/types';
import { saveTable } from '@/lib/db';
import { seedMindmap, newMindId } from '@/lib/mindmap';
import { newDrawingId } from './ReportDrawingNode';
import type { DrawingTool } from '@/lib/drawing/types';
import { DRAWING_STROKE_COLORS, DRAWING_FILL_COLORS } from '@/lib/drawing/types';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { resolveActiveFontSize } from './FontSizeMark';
import { resolveActiveFontFamily } from './FontFamilyMark';
import { EDITOR_FONTS, matchEditorFont, sanitizeFontStack } from './editor-fonts';

const TEXT_COLORS = [
  { name: 'Red', hex: '#dc2626', labelAr: 'أحمر داكن', labelEn: 'Dark Red' },
  { name: 'Orange', hex: '#ea580c', labelAr: 'برتقالي', labelEn: 'Orange' },
  { name: 'Green', hex: '#16a34a', labelAr: 'أخضر', labelEn: 'Green' },
  { name: 'Blue', hex: '#2563eb', labelAr: 'أزرق', labelEn: 'Blue' },
  { name: 'Purple', hex: '#9333ea', labelAr: 'بنفسجي', labelEn: 'Purple' },
  { name: 'Slate', hex: '#475569', labelAr: 'رمادي', labelEn: 'Slate Gray' },
];

const HIGHLIGHT_COLORS = [
  { name: 'Yellow', hex: '#fef08a', labelAr: 'أصفر', labelEn: 'Yellow' },
  { name: 'Soft Red', hex: '#fee2e2', labelAr: 'أحمر فاتح', labelEn: 'Soft Red' },
  { name: 'Soft Orange', hex: '#ffedd5', labelAr: 'برتقالي فاتح', labelEn: 'Soft Orange' },
  { name: 'Soft Green', hex: '#dcfce7', labelAr: 'أخضر فاتح', labelEn: 'Soft Green' },
  { name: 'Soft Blue', hex: '#dbeafe', labelAr: 'أزرق فاتح', labelEn: 'Soft Blue' },
  { name: 'Soft Purple', hex: '#f3e8ff', labelAr: 'بنفسجي فاتح', labelEn: 'Soft Purple' },
];

interface EditorToolbarProps {
  editor: Editor | null;
  reportId?: string;
  reportLanguage?: 'ar' | 'en';
  onImageUpload: (file: File) => void;
  uploadingImage?: boolean;
}

export function EditorToolbar({
  editor,
  reportId,
  reportLanguage,
  onImageUpload,
  uploadingImage,
}: EditorToolbarProps) {
  const { t, isRtl: contextIsRtl, lang: contextLang } = useLanguage();
  const lang = reportLanguage || contextLang;
  const isRtl = lang === 'ar';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showHighlightPicker, setShowHighlightPicker] = useState(false);
  const [showLinkPopover, setShowLinkPopover] = useState(false);
  const [linkUrlInput, setLinkUrlInput] = useState('');
  const [showLatexPopover, setShowLatexPopover] = useState(false);
  const [latexInput, setLatexInput] = useState('');
  const [showFontPicker, setShowFontPicker] = useState(false);
  const [, setTick] = useState(0);

  const handleInsertLatex = () => {
    const latex = latexInput.trim();
    if (!latex || !editor) return;
    try {
      (editor.chain().focus() as any).setLatexInline({ latex }).run();
      toast.success(lang === 'ar' ? 'تم إدراج المعادلة' : 'Equation inserted');
    } catch (err) {
      console.error('Insert latex failed:', err);
      toast.error(lang === 'ar' ? 'فشل إدراج المعادلة' : 'Failed to insert equation');
    }
    setLatexInput('');
    setShowLatexPopover(false);
  };

  const handleInsertSmartTable = async () => {
    if (!editor) return;
    try {
      // New sheets inherit the REPORT language direction (not the app UI
      // language — they can differ). Arabic report → RTL sheet.
      const sheetLang = reportLanguage || (lang === 'ar' ? 'ar' : 'en');
      const newTableId = `tbl_${reportId || 'rep'}_${Date.now().toString(36)}`;
      const defaultTable: TableEntity = {
        id: newTableId,
        report_id: reportId || '',
        name: sheetLang === 'ar' ? 'جدول' : 'Table',
        direction: sheetLang === 'ar' ? 'rtl' : 'ltr',
        cell_formats: {},
        merged_cells: [],
        columns_data: [
          { id: 'A', name: sheetLang === 'ar' ? 'البند' : 'Item', type: 'text', width: 200 },
          { id: 'B', name: sheetLang === 'ar' ? 'الوصف' : 'Description', type: 'text', width: 260 },
          { id: 'C', name: sheetLang === 'ar' ? 'العدد' : 'Count', type: 'number', width: 110 },
        ],
        rows_data: [
          { A: '', B: '', C: '' },
          { A: '', B: '', C: '' },
          { A: '', B: '', C: '' },
        ],
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      await saveTable(defaultTable);
      (editor.chain().focus() as any)
        .insertSmartTable({
          tableId: newTableId,
          reportId: reportId || '',
          displayMode: 'embedded-edit',
        })
        .run();
      toast.success(lang === 'ar' ? 'تم إدراج الجدول الذكي في التقرير' : 'Smart table inserted into report');
    } catch (err) {
      console.error('Insert smart table failed:', err);
      toast.error(lang === 'ar' ? 'فشل إدراج الجدول الذكي' : 'Failed to insert smart table');
    }
  };

  const handleInsertNormalTable = () => {
    if (!editor) return;
    try {
      // TipTap native table: 3x3 with header row. Never throws: guarded + focus fallback.
      const ok = editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
      if (!ok) {
        editor.chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
      }
      toast.success(lang === 'ar' ? 'تم إدراج جدول عادي في التقرير' : 'Normal table inserted into report');
    } catch (err) {
      console.error('Insert normal table failed:', err);
      toast.error(lang === 'ar' ? 'فشل إدراج الجدول العادي' : 'Failed to insert normal table');
    }
  };

  // Context menu dispatches table-insert requests; both kinds are supported.
  // 'editor-insert-table-request' (legacy) -> smart table for backward-compat.
  const insertTableRef = useRef(handleInsertSmartTable);
  insertTableRef.current = handleInsertSmartTable;
  const insertNormalRef = useRef(handleInsertNormalTable);
  insertNormalRef.current = handleInsertNormalTable;
  React.useEffect(() => {
    const smartHandler = () => {
      insertTableRef.current();
    };
    const normalHandler = () => {
      insertNormalRef.current();
    };
    window.addEventListener('editor-insert-table-request', smartHandler);
    window.addEventListener('editor-insert-normal-table-request', normalHandler);
    window.addEventListener('editor-insert-smart-table-request', smartHandler);
    return () => {
      window.removeEventListener('editor-insert-table-request', smartHandler);
      window.removeEventListener('editor-insert-normal-table-request', normalHandler);
      window.removeEventListener('editor-insert-smart-table-request', smartHandler);
    };
  }, []);

  // Smart-table focus bridge: the smart grid isolates its DOM events from
  // ProseMirror, so it announces focus explicitly. While set, the same
  // contextual sub-toolbar is shown and its buttons are forwarded as addressed
  // commands ('smart-table-command') instead of TipTap table commands.
  const [activeSmartTable, setActiveSmartTable] = useState<{ id: string; name: string } | null>(null);
  const [smartNameDraft, setSmartNameDraft] = useState('');
  React.useEffect(() => {
    const onSmartActive = (e: Event) => {
      const detail = (e as CustomEvent)?.detail || {};
      const id = detail.tableId;
      if (typeof id === 'string' && id) {
        const name = typeof detail.name === 'string' ? detail.name : '';
        setActiveSmartTable({ id, name });
        // Don't clobber in-progress name typing: the grid re-announces focus
        // on every mousedown, which fires before the input's blur commit.
        try {
          const ae = document.activeElement as HTMLElement | null;
          if (ae && ae.getAttribute && ae.getAttribute('data-smart-name-input') === '1') return;
        } catch {}
        setSmartNameDraft(name);
      }
    };
    // Clear on click (NOT mousedown): clearing on mousedown unmounts the
    // sub-toolbar buttons before their click handlers run, so commands
    // (e.g. Delete Table) would never fire. Button clicks run first, then this.
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || typeof target.closest !== 'function') return;
      if (target.closest('.smart-table-node-view, .smart-table-wrapper')) return;
      if (target.closest('.editor-toolbar-root')) return;
      if (target.closest('[data-radix-portal]')) return;
      setActiveSmartTable(null);
    };
    window.addEventListener('smart-table-active', onSmartActive);
    document.addEventListener('click', onDocClick);
    return () => {
      window.removeEventListener('smart-table-active', onSmartActive);
      document.removeEventListener('click', onDocClick);
    };
  }, []);

  // Leaving the smart table via keyboard into a normal table clears the bridge.
  // Selected-but-not-focused smart tables: a NodeSelection on the atom block
  // (click the frame, arrow-key onto it) never fires the sheet's click bridge,
  // so the sub-toolbar (delete/clear/direction) would stay hidden while the
  // node is selected and Backspace is blocked — a dead end. Mirror the
  // selection into state so management controls are always reachable.
  const [selectedSmartId, setSelectedSmartId] = useState<string | null>(null);
  React.useEffect(() => {
    if (!editor) return;
    const syncSmartSelection = () => {
      try {
        const sel: any = editor.state.selection;
        const node = sel?.node;
        if (node?.type?.name === 'smartTable' && node.attrs?.tableId) {
          setSelectedSmartId(String(node.attrs.tableId));
          return;
        }
        // Cursor directly before/after the atom block: resolve the neighbour.
        try {
          const $from: any = sel?.$from;
          const after: any = $from?.nodeAfter;
          const before: any = $from?.nodeBefore;
          if (after?.type?.name === 'smartTable' && after.attrs?.tableId) {
            setSelectedSmartId(String(after.attrs.tableId));
            return;
          }
          if (before?.type?.name === 'smartTable' && before.attrs?.tableId) {
            setSelectedSmartId(String(before.attrs.tableId));
            return;
          }
        } catch {}
        setSelectedSmartId(null);
      } catch {
        setSelectedSmartId(null);
      }
    };
    syncSmartSelection();
    editor.on('selectionUpdate', syncSmartSelection);
    editor.on('update', syncSmartSelection);
    return () => {
      editor.off('selectionUpdate', syncSmartSelection);
      editor.off('update', syncSmartSelection);
    };
  }, [editor]);

  React.useEffect(() => {
    if (!editor) return;
    const onSel = () => {
      try {
        if (editor.isActive('table')) setActiveSmartTable(null);
      } catch {}
    };
    editor.on('selectionUpdate', onSel);
    return () => {
      editor.off('selectionUpdate', onSel);
    };
  }, [editor]);

  interface ActiveDrawingState {
    drawingId: string;
    title?: string;
    tool: DrawingTool;
    stroke: string;
    fill: string;
    strokeWidth: number;
    strokeStyle: 'solid' | 'dashed' | 'dotted';
    fontSize: number;
    fontFamily?: string;
    textColor?: string;
    selectedId: string | null;
    hasSelected: boolean;
    selectedType?: string;
    selectedText?: string;
    canUndo: boolean;
    canRedo: boolean;
    zoom: number;
  }

  const [activeDrawing, setActiveDrawing] = useState<ActiveDrawingState | null>(null);

  React.useEffect(() => {
    const onDrawingActive = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (detail && detail.drawingId) {
        setActiveDrawing((prev) => ({
          ...(prev?.drawingId === detail.drawingId ? prev : {}),
          ...detail,
        }));
      }
    };

    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || typeof target.closest !== 'function') return;
      if (target.closest('.report-drawing-node-view, [data-type="report-drawing"]')) return;
      if (target.closest('.editor-toolbar-root')) return;
      if (target.closest('[data-radix-portal]')) return;
      setActiveDrawing(null);
    };

    window.addEventListener('report-drawing-active', onDrawingActive);
    document.addEventListener('click', onDocClick);
    return () => {
      window.removeEventListener('report-drawing-active', onDrawingActive);
      document.removeEventListener('click', onDocClick);
    };
  }, []);

  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  React.useEffect(() => {
    if (!editor) return;
    const syncDrawingSelection = () => {
      try {
        const sel: any = editor.state.selection;
        const node = sel?.node;
        if (node?.type?.name === 'reportDrawing' && node.attrs?.drawingId) {
          const dId = String(node.attrs.drawingId);
          setSelectedDrawingId(dId);
          window.dispatchEvent(new CustomEvent('report-drawing-request-state', { detail: { drawingId: dId } }));
          return;
        }
        setSelectedDrawingId(null);
      } catch {
        setSelectedDrawingId(null);
      }
    };
    syncDrawingSelection();
    editor.on('selectionUpdate', syncDrawingSelection);
    return () => {
      editor.off('selectionUpdate', syncDrawingSelection);
    };
  }, [editor]);

  const sendDrawingCommand = (command: string, extra?: Record<string, any>) => {
    const dId = activeDrawing?.drawingId || selectedDrawingId;
    if (!dId) return;
    window.dispatchEvent(
      new CustomEvent('report-drawing-command', {
        detail: {
          drawingId: dId,
          command,
          ...extra,
        },
      })
    );
    if (command === 'set-tool' && extra?.tool) {
      setActiveDrawing((prev) => (prev ? { ...prev, tool: extra.tool } : null));
    } else if (command === 'set-stroke' && extra?.color) {
      setActiveDrawing((prev) => (prev ? { ...prev, stroke: extra.color } : null));
    } else if (command === 'set-fill' && extra?.color) {
      setActiveDrawing((prev) => (prev ? { ...prev, fill: extra.color } : null));
    } else if (command === 'set-stroke-width' && extra?.width) {
      setActiveDrawing((prev) => (prev ? { ...prev, strokeWidth: extra.width } : null));
    } else if (command === 'set-stroke-style' && extra?.style) {
      setActiveDrawing((prev) => (prev ? { ...prev, strokeStyle: extra.style } : null));
    } else if (command === 'set-font-size' && extra?.fontSize) {
      setActiveDrawing((prev) => (prev ? { ...prev, fontSize: extra.fontSize } : null));
    } else if (command === 'set-text-color' && extra?.color) {
      setActiveDrawing((prev) => (prev ? { ...prev, textColor: extra.color } : null));
    }
  };

  React.useEffect(() => {
    if (!editor) return;
    const forceUpdate = () => {
      try {
        const explicitSize = editor.getAttributes?.('fontSize')?.size;
        if (explicitSize) {
          ((editor as any).storage as any).fontSize.current = explicitSize;
        }
      } catch {}
      setTick((t) => t + 1);
    };
    editor.on('transaction', forceUpdate);
    editor.on('selectionUpdate', forceUpdate);
    return () => {
      editor.off('transaction', forceUpdate);
      editor.off('selectionUpdate', forceUpdate);
    };
  }, [editor]);

  // Send the native (normal) table under the cursor to the tracking board.
  // Native tables have no entity — a content snapshot is queued instead.
  const handleSendNativeTableToTracking = () => {
    if (!editor) return;
    try {
      const { state } = editor;
      const $from: any = (state.selection as any)?.$from;
      if (!$from) return;
      let tableNode: any = null;
      for (let d = $from.depth; d > 0; d--) {
        try {
          const n = $from.node(d);
          if (n?.type?.name === 'table') {
            tableNode = n;
            break;
          }
        } catch {}
      }
      if (!tableNode) {
        toast.error(lang === 'ar' ? 'ضع المؤشر داخل جدول عادي أولًا' : 'Place the cursor inside a normal table first');
        return;
      }
      const grid: string[][] = [];
      try {
        tableNode.forEach((rowNode: any) => {
          if (!rowNode || rowNode.type?.name !== 'tableRow') return;
          const cells: string[] = [];
          try {
            rowNode.forEach((cellNode: any) => {
              const t = String(cellNode?.type?.name || '');
              if (t === 'tableCell' || t === 'tableHeader') {
                try {
                  cells.push(String(cellNode.textContent || '').trim());
                } catch {
                  cells.push('');
                }
              }
            });
          } catch {}
          grid.push(cells.slice(0, 26));
        });
      } catch {}
      const capped = grid.slice(0, 50);
      if (!capped.length || !capped.some((r) => r.some((c) => c))) {
        toast.error(lang === 'ar' ? 'الجدول فارغ — أدخل بيانات أولًا' : 'Table is empty — add data first');
        return;
      }
      const tableId = `ntbl_${String(reportId || 'rep').slice(0, 12)}_${Date.now().toString(36)}`;
      const time = new Date().toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' });
      const entry = {
        kind: 'native' as const,
        tableId,
        reportId,
        name: `${lang === 'ar' ? 'جدول عادي' : 'Normal table'} ${time}`,
        snapshot: { headers: capped[0], rows: capped.slice(1) },
        at: new Date().toISOString(),
      };
      try {
        const key = 'pending_tracking_tables';
        const raw = window.localStorage.getItem(key);
        const list = raw ? JSON.parse(raw) : [];
        list.push(entry);
        window.localStorage.setItem(key, JSON.stringify(list));
      } catch {}
      try {
        window.dispatchEvent(new CustomEvent('tracking-table-queued', { detail: { tableId, reportId } }));
      } catch {}
      toast.success(lang === 'ar' ? 'تم إرسال الجدول العادي للوحة التتبع' : 'Normal table sent to tracking');
    } catch (err) {
      console.error('Send native table failed', err);
      toast.error(lang === 'ar' ? 'فشل إرسال الجدول' : 'Failed to send table');
    }
  };

  const sendSmartCommand = (command: string, value?: string) => {
    const targetId = activeSmartTable?.id || selectedSmartId;
    if (!targetId) return;
    // Deleting via the toolbar must also remove the node when the sheet
    // engine never mounted (no Univer listener to call onDeleteNode):
    // the editor backup listener strips residual nodes on smart-table-deleted.
    window.dispatchEvent(
      new CustomEvent('smart-table-command', { detail: { tableId: targetId, command, value } })
    );
    if (command === 'delete-table' && editor) {
      window.setTimeout(() => {
        try {
          let found = false;
          editor.state.doc.descendants((node: any) => {
            if (node?.type?.name === 'smartTable' && String(node.attrs?.tableId || '') === targetId) {
              found = true;
            }
          });
          if (found) {
            window.dispatchEvent(new CustomEvent('smart-table-delete-node', { detail: { tableId: targetId } }));
          }
        } catch {}
      }, 1500);
    }
  };

  // The smart sheet owns its formatting UI (Univer ribbon). Outer toolbar
  // formatting buttons are disabled with an explanatory tooltip while a
  // smart table is focused — no focus steal, no silent no-op, no toast spam.
  const smartDisabledTitle = (base: string): string =>
    useSmart
      ? `${base} — ${lang === 'ar' ? 'استخدم شريط أدوات الجدول الذكي' : 'use the smart sheet toolbar'}`
      : base;

  const commitSmartName = () => {
    if (!activeSmartTable) return;
    const next = smartNameDraft.slice(0, 120);
    setActiveSmartTable({ ...activeSmartTable, name: next });
    sendSmartCommand('rename', next);
  };

  if (!editor) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        onImageUpload(files[i]);
      }
    }
    // reset
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const isTableActive = editor.isActive('table');
  // When the cursor is in a normal table it wins; otherwise a focused smart
  // table drives the same sub-toolbar through the command bridge — or a
  // selected (but sheet-unfocused) smart table via the selection mirror.
  const useSmart = (!!activeSmartTable || !!selectedSmartId) && !isTableActive;
  const effectiveSmartId = activeSmartTable?.id || selectedSmartId || null;
  const isDrawingActive = (!!activeDrawing || !!selectedDrawingId || editor.isActive('reportDrawing')) && !isTableActive && !useSmart;

  const drawingTools: Array<{ k: DrawingTool; icon: any; labelAr: string; labelEn: string }> = [
    { k: 'select', icon: MousePointer2, labelAr: 'تحديد', labelEn: 'Select' },
    { k: 'hand', icon: Hand, labelAr: 'تحريك', labelEn: 'Pan' },
    { k: 'rectangle', icon: Square, labelAr: 'مستطيل', labelEn: 'Rect' },
    { k: 'diamond', icon: Diamond, labelAr: 'معين', labelEn: 'Diamond' },
    { k: 'ellipse', icon: Circle, labelAr: 'دائرة', labelEn: 'Ellipse' },
    { k: 'arrow', icon: MoveRight, labelAr: 'سهم', labelEn: 'Arrow' },
    { k: 'line', icon: Minus, labelAr: 'خط', labelEn: 'Line' },
    { k: 'freedraw', icon: Pencil, labelAr: 'رسم حر', labelEn: 'Draw' },
    { k: 'text', icon: TypeIcon, labelAr: 'نص', labelEn: 'Text' },
    { k: 'note', icon: StickyNote, labelAr: 'ملاحظة', labelEn: 'Note' },
    { k: 'eraser', icon: Eraser, labelAr: 'ممحاة', labelEn: 'Eraser' },
  ];

  const isRtlActive = editor.isActive({ dir: 'rtl' }) || (!editor.isActive({ dir: 'ltr' }) && isRtl);
  const isLtrActive = editor.isActive({ dir: 'ltr' }) || (!editor.isActive({ dir: 'rtl' }) && !isRtl);

  // Active font size in px (shared resolver: mark → heading → memory → 16)
  const getActiveFontSize = (): number => resolveActiveFontSize(editor);

  const currentFontSize = getActiveFontSize();

  // Active font family (shared resolver: mark → stored mark → memory → '').
  const activeFontFamily = resolveActiveFontFamily(editor);
  const activeFont = matchEditorFont(activeFontFamily);

  const handleDecreaseFontSize = () => {
    if (!editor) return;
    const cur = resolveActiveFontSize(editor);
    const newSize = Math.max(8, cur - 2);
    editor.chain().focus().setFontSize(`${newSize}px`).run();
  };

  const handleIncreaseFontSize = () => {
    if (!editor) return;
    const cur = resolveActiveFontSize(editor);
    const newSize = Math.min(96, cur + 2);
    editor.chain().focus().setFontSize(`${newSize}px`).run();
  };

  // Keep editor focus on toolbar button presses: mousedown would blur the
  // editor (clearing stored marks AND firing a blur-save that re-renders
  // mid-click, swallowing rapid consecutive clicks). Inputs keep focus.
  const keepFocus = (e: React.MouseEvent) => {
    try {
      const t = e.target as HTMLElement | null;
      if (t && typeof t.closest === 'function' && t.closest('input,textarea,select,[contenteditable="true"]')) return;
      e.preventDefault();
    } catch {}
  };

  return (
    <div className="editor-toolbar-root flex flex-col bg-card/60 backdrop-blur-sm w-full max-w-full" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Primary Toolbar - Smooth horizontal scroll on mobile, wrap on desktop */}
      <div
        className="toolbar-container flex flex-nowrap sm:flex-wrap items-center gap-1 p-1.5 sm:p-2 text-foreground w-full max-w-full overflow-x-auto sm:overflow-visible scroll-smooth relative z-30"
        dir={isRtl ? 'rtl' : 'ltr'}
        onMouseDown={keepFocus}
      >
        {/* Hidden file input */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/*"
          multiple
          className="hidden"
        />

        {/* Headings */}
        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            className={cn(
              "h-8 w-8 rounded-lg",
              editor.isActive('heading', { level: 1 })
                ? "bg-primary/15 text-primary font-bold"
                : "text-muted-foreground hover:text-foreground"
            )}
            title={`${t('heading1')} (Ctrl+Alt+1)`}
          >
            <Heading1 className="h-4 w-4" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={cn(
              "h-8 w-8 rounded-lg",
              editor.isActive('heading', { level: 2 })
                ? "bg-primary/15 text-primary font-bold"
                : "text-muted-foreground hover:text-foreground"
            )}
            title={`${t('heading2')} (Ctrl+Alt+2)`}
          >
            <Heading2 className="h-4 w-4" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            className={cn(
              "h-8 w-8 rounded-lg",
              editor.isActive('heading', { level: 3 })
                ? "bg-primary/15 text-primary font-bold"
                : "text-muted-foreground hover:text-foreground"
            )}
            title={`${t('heading3')} (Ctrl+Alt+3)`}
          >
            <Heading3 className="h-4 w-4" />
          </Button>
        </div>

        <Separator orientation="vertical" className="h-4 mx-1 bg-border/80" />

        {/* Font Size Control: Minus, Current Px Value, Plus */}
        <div
          className="flex items-center rounded-lg border border-border/70 bg-card p-0.5 shadow-2xs"
          title={lang === 'ar' ? 'حجم الخط' : 'Font size'}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleDecreaseFontSize}
            className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
            title={`${lang === 'ar' ? 'تصغير حجم الخط (-2px)' : 'Decrease font size (-2px)'} (Ctrl+Shift+<)`}
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>

          <div className="flex items-center px-1">
            <input
              type="number"
              min={8}
              max={96}
              value={currentFontSize}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && val >= 8 && val <= 96 && editor) {
                  editor.chain().focus().setFontSize(`${val}px`).run();
                }
              }}
              className="w-8 h-6 text-xs font-semibold text-foreground text-center bg-transparent border-0 outline-none font-mono focus:ring-1 focus:ring-primary rounded hover:bg-muted/50 p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              title={lang === 'ar' ? 'حجم الخط الحالي (يمكن كتابة الرقم مباشرة)' : 'Current font size (type number directly)'}
            />
            <span className="text-[10px] text-muted-foreground select-none font-mono">px</span>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleIncreaseFontSize}
            className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
            title={`${lang === 'ar' ? 'تكبير حجم الخط (+2px)' : 'Increase font size (+2px)'} (Ctrl+Shift+>)`}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Font Family Picker */}
        <Popover open={showFontPicker} onOpenChange={setShowFontPicker}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={useSmart}
              className={cn(
                "h-8 gap-1 rounded-lg px-2 text-xs font-semibold",
                activeFont
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground",
                useSmart && "opacity-40"
              )}
              style={activeFont ? { fontFamily: activeFont.stack } : undefined}
              title={smartDisabledTitle(lang === 'ar' ? 'نوع الخط' : 'Font family')}
            >
              <TypeIcon className="h-4 w-4 shrink-0" />
              <span className="max-w-[76px] truncate">
                {activeFont
                  ? (lang === 'ar' ? activeFont.labelAr : activeFont.labelEn)
                  : (lang === 'ar' ? 'الخط' : 'Font')}
              </span>
              <ChevronDown className="h-2.5 w-2.5 opacity-60 shrink-0" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            side="top"
            align="center"
            sideOffset={8}
            dir={isRtl ? 'rtl' : 'ltr'}
            className="z-50 w-56 max-w-[calc(100vw-32px)] rounded-xl border border-border bg-card p-1.5 shadow-xl"
          >
            <div className="px-2 pb-1 pt-1 text-[11px] font-semibold text-muted-foreground">
              {lang === 'ar' ? 'نوع الخط:' : 'Font family:'}
            </div>
            <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
              <button
                type="button"
                onClick={() => {
                  (editor.chain().focus() as any).unsetFontFamily().run();
                  setShowFontPicker(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-start text-sm transition-colors hover:bg-muted",
                  !activeFont ? "bg-primary/10 font-bold text-primary" : "text-foreground"
                )}
              >
                <span>{lang === 'ar' ? 'افتراضي (خط الموقع)' : 'Default (site font)'}</span>
                {!activeFont && <span className="text-xs">✓</span>}
              </button>
              {EDITOR_FONTS.map((f) => {
                const isActive = activeFont?.id === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      const stack = sanitizeFontStack(f.stack) || f.stack;
                      (editor.chain().focus() as any).setFontFamily(stack).run();
                      setShowFontPicker(false);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-start transition-colors hover:bg-muted",
                      isActive ? "bg-primary/10 text-primary" : "text-foreground"
                    )}
                    style={{ fontFamily: f.stack }}
                    title={lang === 'ar' ? f.labelEn : f.labelAr}
                  >
                    <span className="text-base leading-6">
                      {lang === 'ar' ? f.labelAr : f.labelEn}
                    </span>
                    {isActive && <span className="text-xs font-bold">✓</span>}
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>

        <Separator orientation="vertical" className="h-4 mx-1 bg-border/80" />

        {/* Formatting: Bold, Italic, Link */}
        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => {
              if (useSmart) {
                sendSmartCommand('toggle-bold');
                return;
              }
              editor.chain().focus().toggleBold().run();
            }}
            className={cn(
              "h-8 w-8 rounded-lg",
              editor.isActive('bold')
                ? "bg-primary/15 text-primary font-bold"
                : "text-muted-foreground hover:text-foreground"
            )}
            title={`${t('bold')} (Ctrl+B)`}
          >
            <Bold className="h-4 w-4" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => {
              if (useSmart) {
                sendSmartCommand('toggle-italic');
                return;
              }
              editor.chain().focus().toggleItalic().run();
            }}
            className={cn(
              "h-8 w-8 rounded-lg",
              editor.isActive('italic')
                ? "bg-primary/15 text-primary font-bold"
                : "text-muted-foreground hover:text-foreground"
            )}
            title={`${t('italic')} (Ctrl+I)`}
          >
            <Italic className="h-4 w-4" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => {
              if (useSmart) {
                sendSmartCommand('toggle-underline');
                return;
              }
              editor.chain().focus().toggleUnderline().run();
            }}
            className={cn(
              "h-8 w-8 rounded-lg underline underline-offset-2",
              editor.isActive('underline')
                ? "bg-primary/15 text-primary font-bold"
                : "text-muted-foreground hover:text-foreground"
            )}
            title={lang === 'ar' ? 'تسطير (Ctrl+U)' : 'Underline (Ctrl+U)'}
          >
            <span className="text-sm font-bold leading-none">U</span>
          </Button>

          {/* Link Button and Popover */}
          <Popover open={showLinkPopover} onOpenChange={setShowLinkPopover}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => {
                  const prev = editor.getAttributes('link').href || '';
                  setLinkUrlInput(prev);
                }}
                className={cn(
                  "h-8 w-8 rounded-lg",
                  editor.isActive('link')
                    ? "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200 font-bold"
                    : "text-muted-foreground hover:text-foreground"
                )}
                title={editor.isActive('link') ? (lang === 'ar' ? 'تعديل الرابط' : 'Edit Link') : (lang === 'ar' ? 'إدراج رابط' : 'Insert Link')}
              >
                <LinkIcon className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="center"
              sideOffset={8}
              dir={isRtl ? 'rtl' : 'ltr'}
              className="z-50 w-72 max-w-[calc(100vw-32px)] rounded-xl border border-border bg-card p-3 shadow-xl"
            >
              <div className="text-[11px] font-semibold text-foreground mb-1.5">
                {lang === 'ar' ? 'إدراج أو تعديل الرابط:' : 'Insert or Edit Link:'}
              </div>
              <input
                type="url"
                autoFocus
                value={linkUrlInput}
                onChange={(e) => setLinkUrlInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    let cleanUrl = linkUrlInput.trim();
                    if (!cleanUrl) {
                      editor.chain().focus().unsetLink().run();
                    } else {
                      if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://') && !cleanUrl.startsWith('mailto:')) {
                        cleanUrl = 'https://' + cleanUrl;
                      }
                      editor.chain().focus().extendMarkRange('link').setLink({ href: cleanUrl }).run();
                    }
                    setShowLinkPopover(false);
                  }
                }}
                placeholder="https://example.com"
                className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary mb-2 text-foreground"
              />
              <div className="flex items-center justify-between gap-1.5">
                {editor.isActive('link') ? (
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const currentHref = editor.getAttributes('link').href;
                        if (currentHref) {
                          window.open(currentHref, '_blank', 'noopener,noreferrer');
                        }
                      }}
                      className="h-7 px-2 text-[11px] text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-md gap-1"
                      title={lang === 'ar' ? 'فتح الرابط في علامة تبويب جديدة' : 'Open link in new tab'}
                    >
                      <ExternalLink className="h-3 w-3" />
                      <span>{lang === 'ar' ? 'فتح' : 'Open'}</span>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        editor.chain().focus().unsetLink().run();
                        setShowLinkPopover(false);
                      }}
                      className="h-7 px-2 text-[11px] text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-md"
                      title={lang === 'ar' ? 'إزالة الرابط' : 'Remove link'}
                    >
                      <Unlink className="h-3 w-3 me-1" />
                      <span>{lang === 'ar' ? 'إزالة' : 'Unlink'}</span>
                    </Button>
                  </div>
                ) : <div />}

                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowLinkPopover(false)}
                    className="h-7 px-2 text-[11px] text-muted-foreground rounded-md"
                  >
                    {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      let cleanUrl = linkUrlInput.trim();
                      if (!cleanUrl) {
                        editor.chain().focus().unsetLink().run();
                      } else {
                        if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://') && !cleanUrl.startsWith('mailto:')) {
                          cleanUrl = 'https://' + cleanUrl;
                        }
                        editor.chain().focus().extendMarkRange('link').setLink({ href: cleanUrl }).run();
                      }
                      setShowLinkPopover(false);
                    }}
                    className="h-7 px-2.5 text-[11px] font-semibold bg-primary hover:bg-primary/90 text-primary-foreground rounded-md shadow-2xs"
                  >
                    {lang === 'ar' ? 'تطبيق' : 'Apply'}
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <Separator orientation="vertical" className="h-4 mx-1 bg-border/80" />

        {/* Colors & Highlight Palette */}
        <div className="flex items-center gap-0.5">
          {/* Text Color Button */}
          <Popover open={showColorPicker} onOpenChange={setShowColorPicker}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-1.5 rounded-lg text-muted-foreground hover:text-foreground gap-0.5"
                title={t('textColor')}
              >
                <Baseline className="h-4 w-4" />
                <ChevronDown className="h-2.5 w-2.5 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="center"
              sideOffset={8}
              dir={isRtl ? 'rtl' : 'ltr'}
              className="z-50 w-auto p-2.5 bg-card border border-border shadow-xl rounded-xl"
            >
              <div className="text-[11px] font-semibold text-muted-foreground px-1 mb-1.5">
                {t('textColor')}
              </div>
              <div className="grid grid-cols-3 gap-1.5 w-32">
                {TEXT_COLORS.map((c) => (
                  <button
                    key={c.hex}
                    type="button"
                    onClick={() => {
                      if (useSmart) {
                        sendSmartCommand('set-text-color', c.hex);
                        setShowColorPicker(false);
                        return;
                      }
                      (editor.chain().focus() as any).setTextColor(c.hex).run();
                      setShowColorPicker(false);
                    }}
                    className="h-6 w-full rounded-md border border-border/60 hover:scale-105 transition-transform cursor-pointer"
                    style={{ backgroundColor: c.hex }}
                    title={lang === 'ar' ? c.labelAr : c.labelEn}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  if (useSmart) {
                    sendSmartCommand('set-text-color', '');
                    setShowColorPicker(false);
                    return;
                  }
                  (editor.chain().focus() as any).unsetTextColor().run();
                  setShowColorPicker(false);
                }}
                className="mt-2 w-full rounded-md border border-border/80 px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted text-center cursor-pointer"
              >
                {t('removeColor')}
              </button>
            </PopoverContent>
          </Popover>

          {/* Text Highlight Button */}
          <Popover open={showHighlightPicker} onOpenChange={setShowHighlightPicker}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-1.5 rounded-lg text-muted-foreground hover:text-foreground gap-0.5"
                title={t('highlightColor')}
              >
                <Highlighter className="h-4 w-4" />
                <ChevronDown className="h-2.5 w-2.5 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="center"
              sideOffset={8}
              dir={isRtl ? 'rtl' : 'ltr'}
              className="z-50 w-auto p-2.5 bg-card border border-border shadow-xl rounded-xl"
            >
              <div className="text-[11px] font-semibold text-muted-foreground px-1 mb-1.5">
                {t('highlightColor')}
              </div>
              <div className="grid grid-cols-3 gap-1.5 w-32">
                {HIGHLIGHT_COLORS.map((c) => (
                  <button
                    key={c.hex}
                    type="button"
                    onClick={() => {
                      if (useSmart) {
                        sendSmartCommand('set-bg-color', c.hex);
                        setShowHighlightPicker(false);
                        return;
                      }
                      (editor.chain().focus() as any).setTextHighlight(c.hex).run();
                      setShowHighlightPicker(false);
                    }}
                    className="h-6 w-full rounded-md border border-border/60 hover:scale-105 transition-transform cursor-pointer"
                    style={{ backgroundColor: c.hex }}
                    title={lang === 'ar' ? c.labelAr : c.labelEn}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  if (useSmart) {
                    sendSmartCommand('set-bg-color', '');
                    setShowHighlightPicker(false);
                    return;
                  }
                  (editor.chain().focus() as any).unsetTextHighlight().run();
                  setShowHighlightPicker(false);
                }}
                className="mt-2 w-full rounded-md border border-border/80 px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted text-center cursor-pointer"
              >
                {t('removeColor')}
              </button>
            </PopoverContent>
          </Popover>
        </div>

        <Separator orientation="vertical" className="h-4 mx-1 bg-border/80" />

        {/* Lists & Quote */}
        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={cn(
              "h-8 w-8 rounded-lg",
              editor.isActive('bulletList')
                ? "bg-primary/15 text-primary font-bold"
                : "text-muted-foreground hover:text-foreground"
            )}
            title={`${t('bulletList')} (Ctrl+Shift+8)`}
          >
            <List className="h-4 w-4" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={cn(
              "h-8 w-8 rounded-lg",
              editor.isActive('orderedList')
                ? "bg-primary/15 text-primary font-bold"
                : "text-muted-foreground hover:text-foreground"
            )}
            title={`${t('orderedList')} (Ctrl+Shift+7)`}
          >
            <ListOrdered className="h-4 w-4" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            className={cn(
              "h-8 w-8 rounded-lg",
              editor.isActive('blockquote')
                ? "bg-primary/15 text-primary font-bold"
                : "text-muted-foreground hover:text-foreground"
            )}
            title={`${t('blockquote')} (Ctrl+Shift+Q)`}
          >
            <Quote className="h-4 w-4" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            className={cn(
              "h-8 w-8 rounded-lg",
              editor.isActive('codeBlock')
                ? "bg-primary/15 text-primary font-bold"
                : "text-muted-foreground hover:text-foreground"
            )}
            title={lang === 'ar' ? 'كتلة كود (اكتب ``` ثم مسافة)' : 'Code block (type ``` then space)'}
          >
            <Code className="h-4 w-4" />
          </Button>
        </div>

        <Separator orientation="vertical" className="h-4 mx-1 bg-border/80" />

        {/* Text Alignment: Right, Center, Left, Justify */}
        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => {
              if (useSmart) {
                sendSmartCommand('set-align', 'right');
                return;
              }
              editor.chain().focus().setTextAlign('right').run();
            }}
            className={cn(
              "h-8 w-8 rounded-lg",
              editor.isActive({ textAlign: 'right' })
                ? "bg-primary/15 text-primary font-bold"
                : "text-muted-foreground hover:text-foreground"
            )}
            title={lang === 'ar' ? 'محاذاة لليمين' : 'Align Right'}
          >
            <AlignRight className="h-4 w-4" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => {
              if (useSmart) {
                sendSmartCommand('set-align', 'center');
                return;
              }
              editor.chain().focus().setTextAlign('center').run();
            }}
            className={cn(
              "h-8 w-8 rounded-lg",
              editor.isActive({ textAlign: 'center' })
                ? "bg-primary/15 text-primary font-bold"
                : "text-muted-foreground hover:text-foreground"
            )}
            title={lang === 'ar' ? 'محاذاة للوسط' : 'Align Center'}
          >
            <AlignCenter className="h-4 w-4" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => {
              if (useSmart) {
                sendSmartCommand('set-align', 'left');
                return;
              }
              editor.chain().focus().setTextAlign('left').run();
            }}
            className={cn(
              "h-8 w-8 rounded-lg",
              editor.isActive({ textAlign: 'left' })
                ? "bg-primary/15 text-primary font-bold"
                : "text-muted-foreground hover:text-foreground"
            )}
            title={lang === 'ar' ? 'محاذاة لليسار' : 'Align Left'}
          >
            <AlignLeft className="h-4 w-4" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => editor.chain().focus().setTextAlign('justify').run()}
            disabled={useSmart}
            className={cn(
              "h-8 w-8 rounded-lg",
              editor.isActive({ textAlign: 'justify' })
                ? "bg-primary/15 text-primary font-bold"
                : "text-muted-foreground hover:text-foreground",
              useSmart && "opacity-40"
            )}
            title={smartDisabledTitle(lang === 'ar' ? 'ضبط كلي (Justify)' : 'Justify')}
          >
            <AlignJustify className="h-4 w-4" />
          </Button>
        </div>

        <Separator orientation="vertical" className="h-4 mx-1 bg-border/80" />

        {/* Text Direction: RTL, LTR */}
        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => {
              if (useSmart) {
                sendSmartCommand('set-direction', 'rtl');
                return;
              }
              editor.chain().focus().setTextDirection('rtl').run();
            }}
            className={cn(
              "h-8 w-8 rounded-lg",
              isRtlActive
                ? "bg-primary/15 text-primary font-bold"
                : "text-muted-foreground hover:text-foreground"
            )}
            title={lang === 'ar' ? 'اتجاه النص: من اليمين لليسار (RTL)' : 'Text Direction: Right to Left (RTL)'}
          >
            <PilcrowLeft className="h-4 w-4" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => {
              if (useSmart) {
                sendSmartCommand('set-direction', 'ltr');
                return;
              }
              editor.chain().focus().setTextDirection('ltr').run();
            }}
            className={cn(
              "h-8 w-8 rounded-lg",
              isLtrActive
                ? "bg-primary/15 text-primary font-bold"
                : "text-muted-foreground hover:text-foreground"
            )}
            title={lang === 'ar' ? 'اتجاه النص: من اليسار لليمين (LTR)' : 'Text Direction: Left to Right (LTR)'}
          >
            <PilcrowRight className="h-4 w-4" />
          </Button>
        </div>

        <Separator orientation="vertical" className="h-4 mx-1 bg-border/80" />

        {/* Normal table: dedicated button (plain TipTap text table) */}
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleInsertNormalTable}
            className={cn(
              "h-8 gap-1.5 rounded-lg text-xs font-semibold shadow-2xs",
              isTableActive && "border-olive-600 bg-olive-50 dark:bg-olive-950/40 text-olive-800 dark:text-olive-300"
            )}
            title={lang === 'ar' ? 'إدراج جدول عادي — نصوص وتنسيق بسيط' : 'Insert a normal table — simple text table'}
            aria-label={lang === 'ar' ? 'إدراج جدول عادي في التقرير' : 'Insert a normal table into the report'}
          >
            <TableIcon className="h-3.5 w-3.5" />
            <span>{lang === 'ar' ? 'جدول عادي' : 'Normal table'}</span>
          </Button>
        </div>

        {/* Smart spreadsheet: dedicated button (full Univer spreadsheet) */}
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleInsertSmartTable}
            className={cn(
              "h-8 gap-1.5 rounded-lg text-xs font-semibold shadow-2xs border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40",
              activeSmartTable && "border-emerald-600"
            )}
            title={lang === 'ar' ? 'إدراج جدول ذكي — spreadsheet كامل بمعادلات وتنسيق' : 'Insert a smart spreadsheet — full spreadsheet with formulas'}
            aria-label={lang === 'ar' ? 'إدراج جدول ذكي في التقرير' : 'Insert a smart spreadsheet into the report'}
          >
            <Sheet className="h-3.5 w-3.5" />
            <span>{lang === 'ar' ? 'جدول ذكي' : 'Smart sheet'}</span>
          </Button>
        </div>

        {/* Upload Image Button */}
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingImage}
            className="h-8 gap-1.5 rounded-lg bg-olive-50 dark:bg-olive-950/40 border-olive-200 dark:border-olive-800/60 text-olive-800 dark:text-olive-300 hover:bg-olive-100 dark:hover:bg-olive-900/40 text-xs font-semibold shadow-2xs disabled:opacity-50"
            title={t('uploadImageBtn')}
          >
            <ImageIcon className="h-3.5 w-3.5 text-olive-700 dark:text-olive-400" />
            <span>{uploadingImage ? t('uploadingImage') : t('uploadImageBtn')}</span>
          </Button>
        </div>

        {/* Import Button — Word (.docx) / Excel (.xlsx) into the existing editor.
            Opens the Import dialog (Select → Validate → Parse → Preview → Confirm → Insert);
            insertion reuses the current schema, never replaces it. */}
        <div>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 rounded-lg text-xs font-semibold shadow-2xs"
                title={lang === 'ar' ? 'استيراد Word أو Excel إلى التقرير' : 'Import Word or Excel into the report'}
                aria-label={lang === 'ar' ? 'استيراد' : 'Import'}
              >
                <Plus className="h-3.5 w-3.5 text-primary" />
                <span>{lang === 'ar' ? 'استيراد' : 'Import'}</span>
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="center"
              sideOffset={8}
              dir={isRtl ? 'rtl' : 'ltr'}
              className="z-50 w-60 rounded-xl border border-border bg-card p-1.5 shadow-xl"
            >
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('editor-import-request', { detail: { kind: 'docx' } }))}
                className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-start hover:bg-muted transition-colors"
              >
                <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-xs font-bold shrink-0">W</span>
                <span>
                  <span className="block text-xs font-bold text-foreground">
                    {lang === 'ar' ? 'مستند Word' : 'Word document'}
                  </span>
                  <span className="block text-[11px] text-muted-foreground font-mono" dir="ltr">.docx</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('editor-import-request', { detail: { kind: 'xlsx' } }))}
                className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-start hover:bg-muted transition-colors"
              >
                <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-xs font-bold shrink-0">X</span>
                <span>
                  <span className="block text-xs font-bold text-foreground">
                    {lang === 'ar' ? 'جدول Excel' : 'Excel workbook'}
                  </span>
                  <span className="block text-[11px] text-muted-foreground font-mono" dir="ltr">.xlsx</span>
                </span>
              </button>
            </PopoverContent>
          </Popover>
        </div>

        {/* Chart Button — Table → Chart, same size/rhythm as other tools */}
        <div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent('chart-button-pressed', {
                  detail: useSmart && effectiveSmartId ? { smartTableId: effectiveSmartId } : {},
                })
              );
            }}
            className={cn(
              "h-8 w-8 rounded-lg",
              editor.isActive('reportChart')
                ? "bg-primary/15 text-primary font-bold"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
            title={lang === 'ar' ? 'إدراج رسم بياني من جدول' : 'Insert chart from table'}
            aria-label={lang === 'ar' ? 'رسم بياني' : 'Chart'}
          >
            <BarChart3 className="h-4 w-4" />
          </Button>
        </div>

        {/* Mind Map Button — inserts an editable React-Flow mind-map block */}
        <div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => {
              if (!editor) return;
              try {
                const seed = seedMindmap(lang === 'ar');
                (editor.chain().focus() as any).setReportMindmap({
                  mindmapId: newMindId('mm'),
                  title: lang === 'ar' ? 'خريطة ذهنية' : 'Mind map',
                  caption: '',
                  nodes: seed.nodes,
                  edges: seed.edges,
                  height: 400,
                  width: 100,
                  alignment: 'center',
                  background: 'default',
                }).run();
                toast.success(lang === 'ar' ? 'تم إدراج خريطة ذهنية' : 'Mind map inserted');
              } catch (err) {
                console.error('Insert mindmap failed:', err);
                toast.error(lang === 'ar' ? 'فشل إدراج الخريطة الذهنية' : 'Failed to insert mind map');
              }
            }}
            className={cn(
              "h-8 w-8 rounded-lg",
              editor.isActive('reportMindmap')
                ? "bg-primary/15 text-primary font-bold"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
            title={lang === 'ar' ? 'إدراج خريطة ذهنية' : 'Insert mind map'}
            aria-label={lang === 'ar' ? 'خريطة ذهنية' : 'Mind map'}
          >
            <Network className="h-4 w-4" />
          </Button>
        </div>

        {/* Drawing Button — Excalidraw-like shapes merged from visual boards */}
        <div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => {
              if (!editor) return;
              try {
                (editor.chain().focus() as any).setReportDrawing({
                  drawingId: newDrawingId('drw'),
                  title: lang === 'ar' ? 'لوحة رسم' : 'Drawing board',
                  caption: '',
                  elements: [],
                  width: 100,
                  alignment: 'center',
                  background: 'white',
                }).run();
                toast.success(lang === 'ar' ? 'تم إدراج لوحة رسم' : 'Drawing board inserted');
              } catch (err) {
                console.error('Insert drawing failed:', err);
                toast.error(lang === 'ar' ? 'فشل إدراج لوحة الرسم' : 'Failed to insert drawing');
              }
            }}
            className={cn(
              "h-8 w-8 rounded-lg",
              editor.isActive('reportDrawing')
                ? "bg-primary/15 text-primary font-bold"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
            title={lang === 'ar' ? 'إدراج لوحة رسم وأشكال (مثل Excalidraw)' : 'Insert drawing board & shapes (Excalidraw-like)'}
            aria-label={lang === 'ar' ? 'لوحة رسم' : 'Drawing'}
          >
            <PenTool className="h-4 w-4" />
          </Button>
        </div>

        {/* LaTeX Button — ∑ math equation (toolbar + Markdown $...$ both supported) */}
        <div>
          <Popover open={showLatexPopover} onOpenChange={setShowLatexPopover}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setLatexInput('')}
                className={cn(
                  "h-8 w-8 rounded-lg font-serif text-base font-bold",
                  editor.isActive('latexInline')
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
                title={lang === 'ar' ? 'إدراج معادلة رياضية (LaTeX) — أو اكتب $...$ مباشرة' : 'Insert math equation (LaTeX) — or type $...$ directly'}
                aria-label="LaTeX"
              >
                <Sigma className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="center"
              sideOffset={8}
              dir={isRtl ? 'rtl' : 'ltr'}
              className="z-50 w-72 max-w-[calc(100vw-32px)] rounded-xl border border-border bg-card p-3 shadow-xl"
            >
              <div className="text-[11px] font-semibold text-foreground mb-1.5">
                {lang === 'ar' ? 'إدراج معادلة LaTeX:' : 'Insert LaTeX equation:'}
              </div>
              <input
                type="text"
                autoFocus
                dir="ltr"
                value={latexInput}
                onChange={(e) => setLatexInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleInsertLatex();
                  }
                }}
                placeholder="x^2 + y^2 = z^2"
                className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 font-mono text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary mb-1.5 text-foreground"
              />
              <div className="mb-2 rounded-md bg-muted/60 px-2 py-1.5 font-mono text-[10px] text-muted-foreground" dir="ltr">
                $x^2$ → rendered math
              </div>
              <div className="flex items-center justify-end gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowLatexPopover(false)}
                  className="h-7 px-2 text-[11px] text-muted-foreground rounded-md"
                >
                  {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={!latexInput.trim()}
                  onClick={handleInsertLatex}
                  className="h-7 px-2.5 text-[11px] font-semibold bg-primary hover:bg-primary/90 text-primary-foreground rounded-md shadow-2xs disabled:opacity-40"
                >
                  {lang === 'ar' ? 'إدراج' : 'Insert'}
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Contextual Table Management Sub-Toolbar.
          Shown for normal tables (cursor inside) AND smart tables (focus bridge).
          Smart-table buttons are forwarded as addressed commands; the normal
          path keeps the exact TipTap commands as before. */}
      {(isTableActive || activeSmartTable || selectedSmartId) && (
        <div
          className="flex flex-nowrap sm:flex-wrap items-center gap-1.5 border-t border-border/70 bg-muted/40 px-2 sm:px-3 py-1.5 text-xs text-foreground w-full max-w-full overflow-x-auto scroll-smooth"
          // Keep editor/grid focus stable so table commands run on the right target
          // (but let text inputs focus normally).
          onMouseDown={(e) => {
            const t = e.target as HTMLElement | null;
            if (t && typeof t.closest === 'function' && t.closest('input,textarea')) return;
            e.preventDefault();
          }}
        >
          {/* Table Tools Label Badge (+ editable smart-table name) */}
          <div className="flex items-center gap-1 text-[11px] font-bold text-olive-800 dark:text-olive-300 me-1">
            <TableIcon className="h-3.5 w-3.5" />
            <span>{t('tableControls')}:</span>
            {isTableActive && !useSmart && (
              <span className="rounded-md border border-border bg-card px-1.5 py-0 text-[10px] text-muted-foreground">
                {lang === 'ar' ? 'عادي' : 'Basic'}
              </span>
            )}
            {useSmart && activeSmartTable && (
              <>
                <span className="rounded-md border border-emerald-300 bg-emerald-50 px-1.5 py-0 text-[10px] text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                  {lang === 'ar' ? 'ذكي' : 'Smart'}
                </span>
                <input
                  type="text"
                  value={smartNameDraft}
                  data-smart-name-input="1"
                  onChange={(e) => setSmartNameDraft(e.target.value.slice(0, 120))}
                  onBlur={commitSmartName}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  }}
                  className="h-7 w-24 sm:w-32 rounded-md border border-border/70 bg-card px-1.5 text-[11px] font-bold text-foreground focus:outline-none focus:border-olive-600 truncate"
                  aria-label={lang === 'ar' ? 'اسم الجدول الذكي' : 'Smart table name'}
                  maxLength={120}
                />
              </>
            )}
            {useSmart && !activeSmartTable && selectedSmartId && (
              <span
                className="max-w-[160px] truncate rounded-md border border-emerald-300 bg-emerald-50 px-1.5 py-0 font-mono text-[10px] text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                title={selectedSmartId}
              >
                {lang === 'ar' ? 'ذكي محدد' : 'Smart selected'}
              </span>
            )}
          </div>

          {/* Undo / Redo */}
          <div className="flex items-center gap-0.5 rounded-lg border border-border/70 bg-card p-0.5 shadow-2xs">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                if (useSmart) {
                  sendSmartCommand('undo');
                } else {
                  editor.chain().focus().undo().run();
                }
              }}
              className="h-7 px-1.5 text-[11px] gap-1 rounded-md text-muted-foreground hover:text-foreground"
              title={`${lang === 'ar' ? 'تراجع' : 'Undo'} (Ctrl+Z)`}
            >
              <Undo2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                if (useSmart) {
                  sendSmartCommand('redo');
                } else {
                  editor.chain().focus().redo().run();
                }
              }}
              className="h-7 px-1.5 text-[11px] gap-1 rounded-md text-muted-foreground hover:text-foreground"
              title={`${lang === 'ar' ? 'إعادة' : 'Redo'} (Ctrl+Y)`}
            >
              <Redo2 className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Row Controls */}
          <div className="flex items-center gap-0.5 rounded-lg border border-border/70 bg-card p-0.5 shadow-2xs">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                if (useSmart) {
                  sendSmartCommand('insert-row');
                } else {
                  editor.chain().focus().addRowBefore().run();
                }
              }}
              className="h-7 px-1.5 text-[11px] gap-1 rounded-md text-muted-foreground hover:text-foreground"
              title={t('addRowBefore')}
            >
              <Rows className="h-3 w-3 text-olive-600 dark:text-olive-400" />
              <ArrowUp className="h-2.5 w-2.5" />
              <span className="hidden sm:inline">{t('addRowBefore')}</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                if (useSmart) {
                  sendSmartCommand('add-row');
                } else {
                  editor.chain().focus().addRowAfter().run();
                }
              }}
              className="h-7 px-1.5 text-[11px] gap-1 rounded-md text-muted-foreground hover:text-foreground"
              title={t('addRowAfter')}
            >
              <Rows className="h-3 w-3 text-olive-600 dark:text-olive-400" />
              <ArrowDown className="h-2.5 w-2.5" />
              <span className="hidden sm:inline">{t('addRowAfter')}</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                if (useSmart) {
                  sendSmartCommand('del-row');
                } else {
                  editor.chain().focus().deleteRow().run();
                }
              }}
              className="h-7 px-1.5 text-[11px] gap-1 rounded-md text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600"
              title={t('deleteRow')}
            >
              <Trash2 className="h-3 w-3" />
              <span className="hidden md:inline">{t('deleteRow')}</span>
            </Button>
          </div>

          {/* Column Controls */}
          <div className="flex items-center gap-0.5 rounded-lg border border-border/70 bg-card p-0.5 shadow-2xs">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                if (useSmart) {
                  sendSmartCommand('insert-col');
                } else {
                  editor.chain().focus().addColumnBefore().run();
                }
              }}
              className="h-7 px-1.5 text-[11px] gap-1 rounded-md text-muted-foreground hover:text-foreground"
              title={t('addColumnBefore')}
            >
              <Columns className="h-3 w-3 text-olive-600 dark:text-olive-400" />
              {isRtl ? <ArrowRight className="h-2.5 w-2.5" /> : <ArrowLeft className="h-2.5 w-2.5" />}
              <span className="hidden sm:inline">{t('addColumnBefore')}</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                if (useSmart) {
                  sendSmartCommand('add-col');
                } else {
                  editor.chain().focus().addColumnAfter().run();
                }
              }}
              className="h-7 px-1.5 text-[11px] gap-1 rounded-md text-muted-foreground hover:text-foreground"
              title={t('addColumnAfter')}
            >
              <Columns className="h-3 w-3 text-olive-600 dark:text-olive-400" />
              {isRtl ? <ArrowLeft className="h-2.5 w-2.5" /> : <ArrowRight className="h-2.5 w-2.5" />}
              <span className="hidden sm:inline">{t('addColumnAfter')}</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                if (useSmart) {
                  sendSmartCommand('del-col');
                } else {
                  editor.chain().focus().deleteColumn().run();
                }
              }}
              className="h-7 px-1.5 text-[11px] gap-1 rounded-md text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600"
              title={t('deleteColumn')}
            >
              <Trash2 className="h-3 w-3" />
              <span className="hidden md:inline">{t('deleteColumn')}</span>
            </Button>
          </div>

          {/* Merge & Split Cells */}
          <div className="flex items-center gap-0.5 rounded-lg border border-border/70 bg-card p-0.5 shadow-2xs">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                if (useSmart) {
                  sendSmartCommand('merge');
                } else {
                  editor.chain().focus().mergeCells().run();
                }
              }}
              className="h-7 px-1.5 text-[11px] gap-1 rounded-md text-muted-foreground hover:text-foreground"
              title={t('mergeCells')}
            >
              <Merge className="h-3 w-3 text-olive-600 dark:text-olive-400" />
              <span className="hidden lg:inline">{t('mergeCells')}</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                if (useSmart) {
                  sendSmartCommand('unmerge');
                } else {
                  editor.chain().focus().splitCell().run();
                }
              }}
              className="h-7 px-1.5 text-[11px] gap-1 rounded-md text-muted-foreground hover:text-foreground"
              title={t('splitCell')}
            >
              <Split className="h-3 w-3 text-olive-600 dark:text-olive-400" />
              <span className="hidden lg:inline">{t('splitCell')}</span>
            </Button>
          </div>

          {/* Toggle Header Row / Column (normal TipTap tables only) */}
          {!useSmart && (
            <div className="flex items-center gap-0.5 rounded-lg border border-border/70 bg-card p-0.5 shadow-2xs">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => editor.chain().focus().toggleHeaderRow().run()}
                className="h-7 px-1.5 text-[11px] gap-1 rounded-md text-muted-foreground hover:text-foreground"
                title={t('toggleHeaderRow')}
              >
                <Heading className="h-3 w-3 text-olive-600 dark:text-olive-400" />
                <span className="hidden xl:inline">{t('toggleHeaderRow')}</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => editor.chain().focus().toggleHeaderColumn().run()}
                className="h-7 px-1.5 text-[11px] gap-1 rounded-md text-muted-foreground hover:text-foreground"
                title={t('toggleHeaderColumn')}
              >
                <Columns className="h-3 w-3 text-olive-600 dark:text-olive-400" />
                <span className="hidden xl:inline">{t('toggleHeaderColumn')}</span>
              </Button>
            </div>
          )}

          {/* Basic-table formula hint: static, never a repeated toast */}
          {!useSmart && isTableActive && (
            <span className="hidden md:inline rounded-md border border-dashed border-border px-1.5 py-1 text-[10px] text-muted-foreground">
              {lang === 'ar' ? 'تلميح: المعادلات (=) تعمل في الجدول الذكي فقط' : 'Tip: formulas (=) work in the smart sheet only'}
            </span>
          )}

          {/* Send normal table to tracking board */}
          {isTableActive && !useSmart && (
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleSendNativeTableToTracking}
                className="h-7 px-2 text-[11px] gap-1 rounded-md border border-teal-200 dark:border-teal-900/40 bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/50 shadow-2xs"
                title={lang === 'ar' ? 'إرسال نسخة من هذا الجدول العادي إلى لوحة التتبع' : 'Send a copy of this normal table to the tracking board'}
              >
                <KanbanSquare className="h-3 w-3" />
                <span>{lang === 'ar' ? 'إرسال للتتبع' : 'Send to tracking'}</span>
              </Button>
            </div>
          )}

          {/* Delete Whole Table */}
          <div className="ms-auto flex items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                if (useSmart) {
                  sendSmartCommand('delete-table');
                } else {
                  editor.chain().focus().deleteTable().run();
                }
              }}
              className="h-7 px-2 text-[11px] gap-1 rounded-md border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 shadow-2xs"
              title={t('deleteTable')}
            >
              <Trash2 className="h-3 w-3" />
              <span>{t('deleteTable')}</span>
            </Button>
          </div>
        </div>
      )}

      {/* Excalidraw / Drawing Canvas Sub-Toolbar: Sticky with the Editor Header */}
      {isDrawingActive && activeDrawing && (
        <div
          className="flex flex-wrap items-center gap-1.5 px-2 py-1.5 bg-emerald-500/10 dark:bg-emerald-950/30 border-t border-emerald-500/20 text-xs w-full max-w-full overflow-x-auto sm:overflow-visible transition-all animate-in fade-in slide-in-from-top-1"
          dir={isRtl ? 'rtl' : 'ltr'}
          onMouseDown={keepFocus}
        >
          {/* Drawing Title Badge */}
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-600/15 text-emerald-800 dark:text-emerald-300 font-bold shrink-0">
            <PenTool className="h-3.5 w-3.5" />
            <span className="text-[11px] truncate max-w-[130px] sm:max-w-[200px]">
              {activeDrawing.title || (isRtl ? 'لوحة الرسم' : 'Drawing Canvas')}
            </span>
          </div>

          <Separator orientation="vertical" className="h-4 bg-emerald-500/30" />

          {/* Tool Buttons */}
          <div className="flex items-center gap-0.5 bg-card/80 rounded-lg p-0.5 border border-border/70 shadow-2xs">
            {drawingTools.map((t) => {
              const Icon = t.icon;
              const isCurrent = activeDrawing.tool === t.k;
              return (
                <Button
                  key={t.k}
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => sendDrawingCommand('set-tool', { tool: t.k })}
                  className={cn(
                    'h-7 px-1.5 text-[11px] font-semibold gap-1 rounded-md transition-colors',
                    isCurrent
                      ? 'bg-[#2E4034] text-white shadow-2xs'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                  title={isRtl ? t.labelAr : t.labelEn}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden xl:inline">{isRtl ? t.labelAr : t.labelEn}</span>
                </Button>
              );
            })}
          </div>

          <Separator orientation="vertical" className="h-4 bg-emerald-500/30" />

          {/* Undo / Redo & Zoom */}
          <div className="flex items-center gap-0.5 bg-card/80 rounded-lg p-0.5 border border-border/70 shadow-2xs">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={!activeDrawing.canUndo}
              onClick={() => sendDrawingCommand('undo')}
              className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground disabled:opacity-40"
              title={isRtl ? 'تراجع' : 'Undo'}
            >
              <Undo2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={!activeDrawing.canRedo}
              onClick={() => sendDrawingCommand('redo')}
              className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground disabled:opacity-40"
              title={isRtl ? 'إعادة' : 'Redo'}
            >
              <Redo2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => sendDrawingCommand('zoom-in')}
              className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground"
              title={isRtl ? 'تكبير' : 'Zoom In'}
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => sendDrawingCommand('zoom-out')}
              className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground"
              title={isRtl ? 'تصغير' : 'Zoom Out'}
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => sendDrawingCommand('fit-view')}
              className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground"
              title={isRtl ? 'ملاءمة العرض' : 'Fit View'}
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
          </div>

          <Separator orientation="vertical" className="h-4 bg-emerald-500/30" />

          {/* Stroke & Fill Colors & Geometry Properties */}
          <div className="flex items-center gap-1.5 bg-card/80 rounded-lg px-2 py-1 border border-border/70 shadow-2xs">
            {/* Stroke colors */}
            <div className="flex items-center gap-1" title={isRtl ? 'لون الحد (يطبق على المحدد)' : 'Stroke color'}>
              {DRAWING_STROKE_COLORS.slice(0, 5).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => sendDrawingCommand('set-stroke', { color: c })}
                  style={{ backgroundColor: c }}
                  className={cn(
                    'h-4.5 w-4.5 rounded-full border border-border transition-transform hover:scale-110',
                    activeDrawing.stroke === c && 'ring-2 ring-foreground ring-offset-1'
                  )}
                  aria-label={`stroke ${c}`}
                />
              ))}
            </div>

            <span className="h-3.5 w-px bg-border/60" />

            {/* Fill colors */}
            <div className="flex items-center gap-1" title={isRtl ? 'لون التعبئة (يطبق على المحدد)' : 'Fill color'}>
              {DRAWING_FILL_COLORS.slice(0, 4).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => sendDrawingCommand('set-fill', { color: c })}
                  style={{
                    backgroundColor: c === 'transparent' ? 'repeating-conic-gradient(#ddd 0 25%, #fff 0 50%) 0 0 / 6px 6px' : c
                  }}
                  className={cn(
                    'h-4.5 w-4.5 rounded-md border border-border transition-transform hover:scale-110',
                    activeDrawing.fill === c && 'ring-2 ring-foreground ring-offset-1'
                  )}
                  aria-label={`fill ${c}`}
                />
              ))}
            </div>

            <span className="h-3.5 w-px bg-border/60" />

            {/* Stroke Width */}
            <select
              value={activeDrawing.strokeWidth}
              onChange={(e) => sendDrawingCommand('set-stroke-width', { width: Number(e.target.value) })}
              className="h-6 rounded border border-border bg-card px-1 text-[11px] font-bold"
              dir="ltr"
              aria-label="stroke width"
            >
              <option value={1}>1px</option>
              <option value={2}>2px</option>
              <option value={4}>4px</option>
              <option value={6}>6px</option>
            </select>

            {/* Stroke Style */}
            <select
              value={activeDrawing.strokeStyle}
              onChange={(e) => sendDrawingCommand('set-stroke-style', { style: e.target.value })}
              className="h-6 rounded border border-border bg-card px-1 text-[11px]"
              aria-label="stroke style"
            >
              <option value="solid">{isRtl ? 'متصل' : 'Solid'}</option>
              <option value="dashed">{isRtl ? 'متقطع' : 'Dashed'}</option>
              <option value="dotted">{isRtl ? 'منقط' : 'Dotted'}</option>
            </select>

            {/* Font Size Stepper */}
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => sendDrawingCommand('set-font-size', { fontSize: Math.max(8, activeDrawing.fontSize - 2) })}
                className="h-6 w-6 rounded border border-border bg-card text-[11px] font-bold hover:bg-muted text-foreground flex items-center justify-center cursor-pointer"
                title={isRtl ? 'تصغير الخط' : 'Decrease font size'}
              >
                -
              </button>
              <span className="h-6 px-1.5 flex items-center justify-center text-[11px] font-mono font-bold bg-muted/40 rounded border border-border select-none">
                {activeDrawing.fontSize}px
              </span>
              <button
                type="button"
                onClick={() => sendDrawingCommand('set-font-size', { fontSize: Math.min(96, activeDrawing.fontSize + 2) })}
                className="h-6 w-6 rounded border border-border bg-card text-[11px] font-bold hover:bg-muted text-foreground flex items-center justify-center cursor-pointer"
                title={isRtl ? 'تكبير الخط' : 'Increase font size'}
              >
                +
              </button>
            </div>
          </div>

          {/* Selected Element Controls (Clone, Edit Text, Clear Text, Delete) */}
          {activeDrawing.hasSelected && (
            <>
              <Separator orientation="vertical" className="h-4 bg-emerald-500/30" />
              <div className="flex items-center gap-1 bg-card/80 rounded-lg p-0.5 border border-border/70 shadow-2xs">
                {/* Clone / Duplicate */}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => sendDrawingCommand('clone')}
                  className="h-7 px-2 text-[11px] font-semibold gap-1 rounded-md text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                  title={`${isRtl ? 'استنساخ العنصر' : 'Clone element'} (Ctrl+D)`}
                >
                  <CopyPlus className="h-3.5 w-3.5 text-emerald-600" />
                  <span>{isRtl ? 'استنساخ' : 'Clone'}</span>
                </Button>

                {/* Edit Text */}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => sendDrawingCommand('edit-text')}
                  className="h-7 px-1.5 text-[11px] gap-1 rounded-md text-muted-foreground hover:text-foreground"
                  title={isRtl ? 'تعديل النص داخل الشكل' : 'Edit text inside shape'}
                >
                  <TypeIcon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{isRtl ? 'تعديل النص' : 'Edit Text'}</span>
                </Button>

                {/* Clear Text Alone */}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => sendDrawingCommand('clear-text')}
                  className="h-7 px-1.5 text-[11px] gap-1 rounded-md text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                  title={isRtl ? 'مسح النص فقط مع إبقاء الشكل' : 'Clear text alone (keep shape)'}
                >
                  <Eraser className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{isRtl ? 'مسح النص فقط' : 'Clear Text'}</span>
                </Button>

                {/* Delete Selected Element */}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => sendDrawingCommand('delete-selected')}
                  className="h-7 px-1.5 text-[11px] gap-1 rounded-md text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600"
                  title={`${isRtl ? 'حذف العنصر' : 'Delete element'} (Delete)`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">{isRtl ? 'حذف العنصر' : 'Delete'}</span>
                </Button>
              </div>
            </>
          )}

          {/* Delete Whole Drawing */}
          <div className="ms-auto flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => sendDrawingCommand('delete-drawing')}
              className="h-7 px-2 text-[11px] gap-1 rounded-md border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 shadow-2xs"
              title={isRtl ? 'حذف لوحة الرسم كاملة' : 'Delete whole drawing'}
            >
              <Trash2 className="h-3 w-3" />
              <span>{isRtl ? 'حذف الرسم' : 'Delete drawing'}</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
