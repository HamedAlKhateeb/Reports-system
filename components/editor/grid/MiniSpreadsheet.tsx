'use client';

/**
 * MiniSpreadsheet — Lightweight, native DOM Excel-like spreadsheet.
 *
 * Replaces Univer with a minimal, pure HTML/CSS table:
 * - Proper RTL / LTR: native HTML <table dir={direction}>. Column A is on the
 *   right for RTL, on the left for LTR.
 * - Perfect Arabic text: native browser shaping, IME, caret, and selection using
 *   DOM inputs with dir="auto".
 * - Arithmetic formulas: SUM, AVERAGE, MIN, MAX, relative cell references,
 *   ranges (A1:A10), and circular reference protection.
 * - Autofill: corner drag handle with relative reference shifting and numeric series.
 * - Formatting: Bold, Italic, Underline, Alignment (Left, Center, Right), Colors.
 * - Standard Excel interactions: Undo/Redo, Copy/Paste (TSV), Add/Remove rows & columns.
 * - Direct TableEntity persistence (columns_data, rows_data, cell_formats, merged_cells).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  colIndexToName,
  colNameToIndex,
  evaluateFormula,
  formatCellDisplay,
  isFormulaError,
  parseCellRef,
  remapFormulaRefs,
  adjustFormula,
} from '@/lib/grid/formula-parser';
import { executeAutofill } from '@/lib/grid/autofill-engine';
import { getTableById, saveTable } from '@/lib/db-intelligence';
import type { TableEntity, TableColumnConfig } from '@/lib/types';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { cn } from '@/lib/utils';
import {
  Undo2,
  Redo2,
  Copy,
  Scissors,
  ClipboardPaste,
  Plus,
  Minus,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Merge,
  Split,
  Palette,
  Type,
  RotateCcw,
} from 'lucide-react';

export const SPREADSHEET_CAP = { ROWS: 200, COLS: 26 } as const;

export interface MiniSpreadsheetProps {
  tableId: string;
  reportId?: string;
  direction?: 'rtl' | 'ltr';
  mode?: 'embedded-edit' | 'modal-edit' | 'preview' | 'full-screen';
  onDeleteNode?: () => void;
}

export interface ColDef {
  id: string;
  name: string;
  width: number;
}

export interface CellFmt {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: 'right' | 'center' | 'left';
  textColor?: string;
  bg?: string;
}

export type GridRow = Record<string, any>;

/** Arabic-Indic + Extended Arabic-Indic digits → Western */
export function normalizeDigits(input: string): string {
  return String(input)
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
}

export const toA1 = (c: number, r: number): string => `${colIndexToName(c)}${r + 1}`.toUpperCase();

/** Computes natural text direction based on cell value (per spec) */
export function getCellDirection(value: unknown): 'ltr' | 'rtl' | null {
  const str = String(value ?? '').trim();
  if (!str) return null;
  if (str.startsWith('=')) return 'ltr';
  if (!isNaN(Number(str)) || /^[-+]?\$?[\d,]+(?:\.\d+)?%?$/.test(str)) return 'ltr';
  const hasArabic = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/.test(str);
  return hasArabic ? 'rtl' : 'ltr';
}

export function clampWidth(w: unknown): number {
  return typeof w === 'number' && isFinite(w) ? Math.min(600, Math.max(60, w)) : 140;
}

export function defaultCols(n: number, isAr: boolean): ColDef[] {
  const names = isAr ? ['البند', 'الوصف', 'العدد'] : ['Item', 'Description', 'Count'];
  const widths = [200, 260, 110];
  return Array.from({ length: n }, (_, i) => ({
    id: colIndexToName(i),
    name: names[i] || colIndexToName(i),
    width: widths[i] || 140,
  }));
}

/** Computes displayed values for the grid (formulas resolved, circular-safe) */
export function computeGridDisplay(rows: GridRow[], cols: ColDef[]): Record<string, string> {
  const rawByCoord: Record<string, any> = {};
  rows.forEach((row, r) => {
    cols.forEach((col, c) => {
      rawByCoord[toA1(c, r)] = row[col.id];
    });
  });
  const memo: Record<string, any> = {};
  const visiting = new Set<string>();

  const resolve = (coord: string): any => {
    const key = String(coord || '').toUpperCase();
    if (key in memo) return memo[key];
    if (visiting.has(key)) return '#CIRCULAR!';
    const raw = rawByCoord[key];
    if (typeof raw === 'string' && raw.trim().startsWith('=')) {
      visiting.add(key);
      let v: any;
      try {
        v = evaluateFormula(normalizeDigits(raw), (c: string) => resolve(c));
      } catch {
        v = '#ERROR!';
      }
      visiting.delete(key);
      memo[key] = v;
      return v;
    }
    if (raw === '' || raw === undefined || raw === null) {
      memo[key] = '';
      return '';
    }
    if (typeof raw === 'number' || typeof raw === 'boolean') {
      memo[key] = raw;
      return raw;
    }
    const s = String(raw);
    const n = Number(normalizeDigits(s).trim());
    const v = s.trim() !== '' && !isNaN(n) ? n : s;
    memo[key] = v;
    return v;
  };

  const out: Record<string, string> = {};
  rows.forEach((_row, r) => {
    cols.forEach((_col, c) => {
      const coord = toA1(c, r);
      const v = resolve(coord);
      out[coord] = isFormulaError(v) ? String(v) : formatCellDisplay(v);
    });
  });
  return out;
}

export interface CellRange {
  r0: number;
  c0: number;
  r1: number;
  c1: number;
}

export function normBounds(a: { r: number; c: number }, b: { r: number; c: number }): CellRange {
  return {
    r0: Math.min(a.r, b.r),
    c0: Math.min(a.c, b.c),
    r1: Math.max(a.r, b.r),
    c1: Math.max(a.c, b.c),
  };
}

export function rangeCoords(b: CellRange): Array<{ r: number; c: number }> {
  const out: Array<{ r: number; c: number }> = [];
  for (let r = b.r0; r <= b.r1; r++) {
    for (let c = b.c0; c <= b.c1; c++) out.push({ r, c });
  }
  return out;
}

export function buildTSV(display: Record<string, string>, b: CellRange): string {
  const lines: string[] = [];
  for (let r = b.r0; r <= b.r1; r++) {
    const cells: string[] = [];
    for (let c = b.c0; c <= b.c1; c++) cells.push(display[toA1(c, r)] ?? '');
    lines.push(cells.join('\t'));
  }
  return lines.join('\n');
}

export function parseTSV(text: string): string[][] {
  const clean = String(text || '').replace(/\r\n?/g, '\n').replace(/\n$/, '');
  if (!clean) return [];
  return clean
    .split('\n')
    .slice(0, SPREADSHEET_CAP.ROWS)
    .map((line) => line.split('\t').slice(0, SPREADSHEET_CAP.COLS));
}

export interface GridSnapshot {
  cols: ColDef[];
  rows: GridRow[];
  formats: Record<string, CellFmt>;
  merges: Array<{ start: string; end: string }>;
}

export function shiftGridState(
  state: GridSnapshot,
  kind: 'row' | 'col',
  at: number,
  delta: 1 | -1,
  newCol?: ColDef
): GridSnapshot {
  const cols = state.cols.map((c) => ({ ...c }));
  const rows = state.rows.map((r) => ({ ...r }));

  const mapRef = (c: number, r: number): { colIndex: number; rowIndex: number } | null => {
    if (kind === 'col') {
      if (delta === -1 && c === at) return null;
      if (c > at || (delta === 1 && c >= at)) return { colIndex: c + delta, rowIndex: r };
      return { colIndex: c, rowIndex: r };
    }
    if (delta === -1 && r === at) return null;
    if (r > at || (delta === 1 && r >= at)) return { colIndex: c, rowIndex: r + delta };
    return { colIndex: c, rowIndex: r };
  };

  if (kind === 'row') {
    if (delta === 1) {
      const blank: GridRow = {};
      cols.forEach((col) => {
        blank[col.id] = '';
      });
      rows.splice(at, 0, blank);
    } else {
      rows.splice(at, 1);
    }
  } else {
    if (delta === 1 && newCol) {
      cols.splice(at, 0, { ...newCol });
      rows.forEach((row) => {
        row[newCol.id] = '';
      });
    } else if (delta === -1) {
      const removed = cols[at];
      cols.splice(at, 1);
      if (removed) {
        rows.forEach((row) => {
          delete row[removed.id];
        });
      }
    }
  }

  // Remap cell formulas
  rows.forEach((row) => {
    cols.forEach((col) => {
      const val = row[col.id];
      if (typeof val === 'string' && val.startsWith('=')) {
        try {
          row[col.id] = remapFormulaRefs(val, (c, r) => mapRef(c, r));
        } catch {}
      }
    });
  });

  // Remap formats
  const nextFormats: Record<string, CellFmt> = {};
  Object.entries(state.formats).forEach(([coord, fmt]) => {
    try {
      const p = parseCellRef(coord);
      if (!p) return;
      const m = mapRef(p.colIndex, p.rowIndex);
      if (m && m.colIndex >= 0 && m.rowIndex >= 0) {
        nextFormats[toA1(m.colIndex, m.rowIndex)] = fmt;
      }
    } catch {}
  });

  // Remap merges
  const nextMerges: Array<{ start: string; end: string }> = [];
  state.merges.forEach((mg) => {
    try {
      const s = parseCellRef(mg.start);
      const e = parseCellRef(mg.end);
      if (!s || !e) return;
      const ms = mapRef(s.colIndex, s.rowIndex);
      const me = mapRef(e.colIndex, e.rowIndex);
      if (ms && me && (ms.colIndex !== me.colIndex || ms.rowIndex !== me.rowIndex)) {
        nextMerges.push({
          start: toA1(Math.min(ms.colIndex, me.colIndex), Math.min(ms.rowIndex, me.rowIndex)),
          end: toA1(Math.max(ms.colIndex, me.colIndex), Math.max(ms.rowIndex, me.rowIndex)),
        });
      }
    } catch {}
  });

  return { cols, rows, formats: nextFormats, merges: nextMerges };
}

export function MiniSpreadsheet(props: MiniSpreadsheetProps) {
  const { tableId, direction: propDir, reportId, onDeleteNode } = props;
  const { lang } = useLanguage();
  const isAr = lang === 'ar';

  const [cols, setCols] = useState<ColDef[]>(() => defaultCols(3, isAr));
  const [rows, setRows] = useState<GridRow[]>(() => [
    { A: '', B: '', C: '' },
    { A: '', B: '', C: '' },
    { A: '', B: '', C: '' },
  ]);
  const [formats, setFormats] = useState<Record<string, CellFmt>>({});
  const [merges, setMerges] = useState<Array<{ start: string; end: string }>>([]);
  const [direction, setDirection] = useState<'rtl' | 'ltr'>('rtl');
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved');

  // Active selection
  const [sel, setSel] = useState<{ r: number; c: number } | null>(null);
  const [anchor, setAnchor] = useState<{ r: number; c: number } | null>(null);

  // Mouse-drag range selection (Bug 1 fix)
  const isDraggingRef = useRef(false);
  const dragMovedRef = useRef(false);

  // Preserve table name across saves (Bug 5 fix)
  const tableNameRef = useRef('');
  const createdAtRef = useRef<string>(new Date().toISOString());

  // Column header editing (Bug 3 fix)
  const [editingCol, setEditingCol] = useState<number | null>(null);
  const [colNameDraft, setColNameDraft] = useState('');

  // Distinct cell editing state (Selection != Editing)
  const [editingCell, setEditingCell] = useState<{ r: number; c: number } | null>(null);
  const editingCellRef = useRef<{ r: number; c: number } | null>(null);
  const [draft, setDraft] = useState('');
  const draftRef = useRef('');
  const originalValueRef = useRef('');
  const editInputRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const editing = editingCell !== null;

  // Undo / Redo history
  const pastRef = useRef<GridSnapshot[]>([]);
  const futureRef = useRef<GridSnapshot[]>([]);
  const [, setHistoryRev] = useState(0);

  const stateRef = useRef<GridSnapshot>({
    cols,
    rows,
    formats,
    merges,
  });
  useEffect(() => {
    stateRef.current = { cols, rows, formats, merges };
  }, [cols, rows, formats, merges]);

  // Push history before mutations
  const pushHistory = useCallback(() => {
    pastRef.current.push(JSON.parse(JSON.stringify(stateRef.current)));
    if (pastRef.current.length > 50) pastRef.current.shift();
    futureRef.current = [];
    setHistoryRev((r) => r + 1);
  }, []);

  // Debounced auto-save
  const saveTimer = useRef<NodeJS.Timeout | null>(null);
  const scheduleSave = useCallback(() => {
    setSaveState('saving');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const cur = stateRef.current;
        const columns_data: TableColumnConfig[] = cur.cols.map((c) => ({
          id: c.id,
          name: c.name,
          type: 'text',
          width: c.width,
        }));
        await saveTable({
          id: tableId,
          report_id: reportId || '',
          name: tableNameRef.current,
          direction,
          columns_data,
          rows_data: cur.rows,
          cell_formats: cur.formats,
          merged_cells: cur.merges,
          version: 1,
          created_at: createdAtRef.current,
          updated_at: new Date().toISOString(),
        });
        setSaveState('saved');
      } catch (e) {
        console.warn('MiniSpreadsheet save error:', e);
        setSaveState('error');
      }
    }, 400);
  }, [tableId, reportId, direction]);

  const undo = useCallback(() => {
    if (pastRef.current.length === 0) return;
    const prev = pastRef.current.pop()!;
    futureRef.current.push(JSON.parse(JSON.stringify(stateRef.current)));
    setCols(prev.cols);
    setRows(prev.rows);
    setFormats(prev.formats);
    setMerges(prev.merges);
    setHistoryRev((r) => r + 1);
    scheduleSave();
  }, [scheduleSave]);

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return;
    const next = futureRef.current.pop()!;
    pastRef.current.push(JSON.parse(JSON.stringify(stateRef.current)));
    setCols(next.cols);
    setRows(next.rows);
    setFormats(next.formats);
    setMerges(next.merges);
    setHistoryRev((r) => r + 1);
    scheduleSave();
  }, [scheduleSave]);

  // Load table from persistence
  const load = useCallback(async () => {
    try {
      const ent = await getTableById(tableId);
      if (ent) {
        const d = propDir || ent.direction || 'rtl';
        setDirection(d);
        if (typeof ent.created_at === 'string' && ent.created_at) {
          createdAtRef.current = ent.created_at;
        }
        // Preserve table name for auto-save (Bug 5 fix)
        if (typeof ent.name === 'string') tableNameRef.current = ent.name;
        if (Array.isArray(ent.columns_data) && ent.columns_data.length > 0) {
          setCols(
            ent.columns_data.map((c) => ({
              id: c.id,
              name: c.name || c.id,
              width: clampWidth(c.width),
            }))
          );
        }
        if (Array.isArray(ent.rows_data) && ent.rows_data.length > 0) {
          setRows(ent.rows_data);
        }
        if (ent.cell_formats && typeof ent.cell_formats === 'object') {
          setFormats(ent.cell_formats);
        }
        if (Array.isArray(ent.merged_cells)) {
          setMerges(ent.merged_cells);
        }
      }
    } catch (e) {
      console.warn('MiniSpreadsheet load error:', e);
    } finally {
      setLoading(false);
    }
  }, [tableId, propDir]);

  useEffect(() => {
    void load();
  }, [load]);

  // Formula Range Selection Mode state (Excel-like point & drag into formula)
  const formulaRangeBaseRef = useRef<string | null>(null);
  const formulaRangeStartRef = useRef<{ r: number; c: number } | null>(null);
  const isDraggingFormulaRangeRef = useRef(false);
  // A formula pick (mousedown on another cell while editing `=...`) must NOT
  // be followed by click-to-edit on the picked cell — the trailing click
  // would move editing there and wipe the in-progress formula (looked like
  // the second pick "replaced" instead of appended). This flag suppresses it.
  const suppressClickEditRef = useRef(false);
  const [formulaRangePreview, setFormulaRangePreview] = useState<CellRange | null>(null);

  // Listen for direction change from parent
  useEffect(() => {
    if (propDir && propDir !== direction) {
      setDirection(propDir);
    }
  }, [propDir, direction]);

  // Global mouseup: End selection & formula range selection
  useEffect(() => {
    const handleMouseUp = () => {
      isDraggingRef.current = false;
      setTimeout(() => {
        dragMovedRef.current = false;
      }, 50);
      if (isDraggingFormulaRangeRef.current) {
        isDraggingFormulaRangeRef.current = false;
        setFormulaRangePreview(null);
        formulaRangeStartRef.current = null;
        formulaRangeBaseRef.current = null;
        if (editInputRef.current) {
          editInputRef.current.focus();
          const len = editInputRef.current.value.length;
          editInputRef.current.setSelectionRange(len, len);
        }
      }
    };
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, []);

  // Bug 5 fix: Keep tableNameRef synced when parent renames table
  useEffect(() => {
    const onUpd = (e: Event) => {
      try {
        const detail = (e as CustomEvent)?.detail;
        if (detail?.tableId === tableId && typeof detail?.name === 'string') {
          tableNameRef.current = detail.name;
        }
      } catch {}
    };
    window.addEventListener('smart-table-updated', onUpd);
    return () => window.removeEventListener('smart-table-updated', onUpd);
  }, [tableId]);

  // Bug 3 fix: Commit inline column rename
  const commitColRename = useCallback(() => {
    if (editingCol === null) return;
    const next = colNameDraft.trim();
    const ci = editingCol;
    setEditingCol(null);
    if (!next || next === cols[ci]?.name) return;
    pushHistory();
    const nextCols = cols.map((c, i) => (i === ci ? { ...c, name: next } : c));
    setCols(nextCols);
    stateRef.current.cols = nextCols;
    scheduleSave();
  }, [editingCol, colNameDraft, cols, pushHistory, scheduleSave]);

  // Computed display values
  const displayGrid = useMemo(() => computeGridDisplay(rows, cols), [rows, cols]);

  // Selection bounds
  const bounds = useMemo(() => {
    if (!sel) return null;
    return normBounds(sel, anchor || sel);
  }, [sel, anchor]);

  const selCoord = sel ? toA1(sel.c, sel.r) : null;
  const selRaw = sel ? String(rows[sel.r]?.[cols[sel.c]?.id] ?? '') : '';

  // Formula range mouse selection handlers
  const handleCellFormulaRangeStart = useCallback((ri: number, ci: number, e: React.MouseEvent) => {
    e.preventDefault(); // Prevents input blur!
    suppressClickEditRef.current = true; // trailing click must not steal editing
    formulaRangeStartRef.current = { r: ri, c: ci };
    isDraggingFormulaRangeRef.current = true;
    setFormulaRangePreview({ r0: ri, c0: ci, r1: ri, c1: ci });

    const currentDraft = draftRef.current;
    let base = currentDraft;
    // Excel-like chaining: after picking the first cell the user types an
    // operator (: + - * / , ( = &) then picks the next cell(s). A trailing
    // operator/colon means "append the ref as-is" — never inject a second
    // operator (the old regex missed ':' so `A1:` + click became `A1: + B2`).
    const endsWithOp = /[=(,+\-*/:&]\s*$/.test(currentDraft) || /:\s*$/.test(currentDraft);
    if (!endsWithOp) {
      const openParenCount = (currentDraft.match(/\(/g) || []).length;
      const closeParenCount = (currentDraft.match(/\)/g) || []).length;
      if (openParenCount > closeParenCount) {
        base = currentDraft.trimEnd() + ', ';
      } else {
        base = currentDraft.trimEnd() + ' + ';
      }
    }
    formulaRangeBaseRef.current = base;

    const refStr = toA1(ci, ri);
    const nextDraft = base + refStr;
    setDraft(nextDraft);
    draftRef.current = nextDraft;
    if (editingCellRef.current) {
      const { r, c } = editingCellRef.current;
      const colId = cols[c]?.id;
      if (colId) {
        setRows((prev) => {
          const next = prev.map((row, rri) => (rri === r ? { ...row, [colId]: nextDraft } : row));
          stateRef.current.rows = next;
          return next;
        });
      }
    }

    if (editInputRef.current) {
      editInputRef.current.focus();
      const len = nextDraft.length;
      editInputRef.current.setSelectionRange(len, len);
    }
  }, [cols]);

  const handleCellFormulaRangeEnter = useCallback((ri: number, ci: number) => {
    if (!isDraggingFormulaRangeRef.current || !formulaRangeStartRef.current || formulaRangeBaseRef.current === null) return;
    const start = formulaRangeStartRef.current;
    const r0 = Math.min(start.r, ri);
    const r1 = Math.max(start.r, ri);
    const c0 = Math.min(start.c, ci);
    const c1 = Math.max(start.c, ci);

    setFormulaRangePreview({ r0, c0, r1, c1 });

    const refStr = r0 === r1 && c0 === c1
      ? toA1(c0, r0)
      : `${toA1(c0, r0)}:${toA1(c1, r1)}`;

    const nextDraft = formulaRangeBaseRef.current + refStr;
    setDraft(nextDraft);
    draftRef.current = nextDraft;
    if (editingCellRef.current) {
      const { r, c } = editingCellRef.current;
      const colId = cols[c]?.id;
      if (colId) {
        setRows((prev) => {
          const next = prev.map((row, rri) => (rri === r ? { ...row, [colId]: nextDraft } : row));
          stateRef.current.rows = next;
          return next;
        });
      }
    }
  }, [cols]);

  // Start cell editing
  const startEdit = useCallback(
    (r: number, c: number, replace = false, initialChar?: string) => {
      const id = cols[c]?.id;
      if (!id) return;
      const original = String(rows[r]?.[id] ?? '');
      originalValueRef.current = original;
      const val = replace ? (initialChar ?? '') : original;

      setDraft(val);
      draftRef.current = val;
      setEditingCell({ r, c });
      editingCellRef.current = { r, c };
      setSel({ r, c });
      setAnchor({ r, c });

      if (replace) {
        setRows((prev) => {
          const next = prev.map((row, ri) => (ri === r ? { ...row, [id]: val } : row));
          stateRef.current.rows = next;
          return next;
        });
      }

      setTimeout(() => {
        if (editInputRef.current) {
          editInputRef.current.focus();
          if (replace) {
            const len = editInputRef.current.value.length;
            editInputRef.current.setSelectionRange(len, len);
          } else {
            editInputRef.current.select();
          }
        }
      }, 0);
    },
    [cols, rows]
  );

  // Commit editing
  const commitEdit = useCallback(() => {
    const currentEdit = editingCellRef.current;
    if (!currentEdit) return;

    const { r, c } = currentEdit;
    const colId = cols[c]?.id;
    const val = draftRef.current;
    const original = originalValueRef.current;

    setEditingCell(null);
    editingCellRef.current = null;
    setFormulaRangePreview(null);
    formulaRangeStartRef.current = null;
    formulaRangeBaseRef.current = null;
    suppressClickEditRef.current = false;

    if (colId) {
      const currentVal = rows[r]?.[colId];
      if (currentVal !== val) {
        const nextRows = rows.map((row, ri) => (ri === r ? { ...row, [colId]: val } : row));
        setRows(nextRows);
        stateRef.current.rows = nextRows;
      }
      if (original !== val) {
        pushHistory();
        scheduleSave();
      }
    }
  }, [cols, rows, pushHistory, scheduleSave]);

  const cancelEdit = useCallback(() => {
    const currentEdit = editingCellRef.current;
    if (currentEdit) {
      const { r, c } = currentEdit;
      const colId = cols[c]?.id;
      const original = originalValueRef.current;
      if (colId && rows[r]?.[colId] !== original) {
        const nextRows = rows.map((row, ri) => (ri === r ? { ...row, [colId]: original } : row));
        setRows(nextRows);
        stateRef.current.rows = nextRows;
      }
    }
    setEditingCell(null);
    editingCellRef.current = null;
    setDraft('');
    draftRef.current = '';
    setFormulaRangePreview(null);
    formulaRangeStartRef.current = null;
    formulaRangeBaseRef.current = null;
    suppressClickEditRef.current = false;
    containerRef.current?.focus();
  }, [cols, rows]);

  // Row and Column operations
  const addRow = useCallback((before = false) => {
    pushHistory();
    const st = stateRef.current;
    const at = sel ? (before ? sel.r : sel.r + 1) : st.rows.length;
    if (st.rows.length >= SPREADSHEET_CAP.ROWS) return;
    const next = shiftGridState(st, 'row', at, 1);
    setCols(next.cols);
    setRows(next.rows);
    setFormats(next.formats);
    setMerges(next.merges);
    scheduleSave();
    setSel({ r: at, c: sel ? sel.c : 0 });
    setAnchor(null);
  }, [sel, pushHistory, scheduleSave]);

  const delRow = useCallback(() => {
    const st = stateRef.current;
    if (st.rows.length <= 1) return;
    pushHistory();
    const at = sel ? sel.r : st.rows.length - 1;
    const next = shiftGridState(st, 'row', at, -1);
    setCols(next.cols);
    setRows(next.rows);
    setFormats(next.formats);
    setMerges(next.merges);
    scheduleSave();
    setSel({ r: Math.max(0, Math.min(at, next.rows.length - 1)), c: sel ? sel.c : 0 });
    setAnchor(null);
  }, [sel, pushHistory, scheduleSave]);

  const addCol = useCallback((before = false) => {
    pushHistory();
    const st = stateRef.current;
    const at = sel ? (before ? sel.c : sel.c + 1) : st.cols.length;
    if (st.cols.length >= SPREADSHEET_CAP.COLS) return;
    // Bug 9 fix: find next unused column ID to avoid collisions
    const usedIds = new Set(st.cols.map(c => c.id));
    let idx = st.cols.length;
    while (usedIds.has(colIndexToName(idx))) idx++;
    const newColId = colIndexToName(idx);
    const newCol: ColDef = {
      id: newColId,
      name: newColId,
      width: 140,
    };
    const next = shiftGridState(st, 'col', at, 1, newCol);
    setCols(next.cols);
    setRows(next.rows);
    setFormats(next.formats);
    setMerges(next.merges);
    scheduleSave();
    setSel({ r: sel ? sel.r : 0, c: at });
    setAnchor(null);
  }, [sel, pushHistory, scheduleSave]);

  const delCol = useCallback(() => {
    const st = stateRef.current;
    if (st.cols.length <= 1) return;
    pushHistory();
    const at = sel ? sel.c : st.cols.length - 1;
    const next = shiftGridState(st, 'col', at, -1);
    setCols(next.cols);
    setRows(next.rows);
    setFormats(next.formats);
    setMerges(next.merges);
    scheduleSave();
    setSel({ r: sel ? sel.r : 0, c: Math.max(0, Math.min(at, next.cols.length - 1)) });
    setAnchor(null);
  }, [sel, pushHistory, scheduleSave]);

  // Formatting operations
  const toggleFormat = useCallback(
    (key: 'bold' | 'italic' | 'underline') => {
      if (!bounds) return;
      pushHistory();
      const nextFormats = { ...formats };
      const targetCoords = rangeCoords(bounds);
      const isSet = targetCoords.every((pt) => nextFormats[toA1(pt.c, pt.r)]?.[key]);
      targetCoords.forEach((pt) => {
        const coord = toA1(pt.c, pt.r);
        nextFormats[coord] = {
          ...nextFormats[coord],
          [key]: !isSet,
        };
      });
      setFormats(nextFormats);
      stateRef.current.formats = nextFormats;
      scheduleSave();
    },
    [bounds, formats, pushHistory, scheduleSave]
  );

  const setAlign = useCallback(
    (align: 'left' | 'center' | 'right') => {
      if (!bounds) return;
      pushHistory();
      const nextFormats = { ...formats };
      rangeCoords(bounds).forEach((pt) => {
        const coord = toA1(pt.c, pt.r);
        nextFormats[coord] = {
          ...nextFormats[coord],
          align,
        };
      });
      setFormats(nextFormats);
      stateRef.current.formats = nextFormats;
      scheduleSave();
    },
    [bounds, formats, pushHistory, scheduleSave]
  );

  const setColor = useCallback(
    (type: 'textColor' | 'bg', value: string) => {
      if (!bounds) return;
      pushHistory();
      const nextFormats = { ...formats };
      rangeCoords(bounds).forEach((pt) => {
        const coord = toA1(pt.c, pt.r);
        if (!value) {
          if (nextFormats[coord]) {
            const copy = { ...nextFormats[coord] };
            delete copy[type];
            if (Object.keys(copy).length === 0) {
              delete nextFormats[coord];
            } else {
              nextFormats[coord] = copy;
            }
          }
        } else {
          nextFormats[coord] = {
            ...nextFormats[coord],
            [type]: value,
          };
        }
      });
      setFormats(nextFormats);
      stateRef.current.formats = nextFormats;
      scheduleSave();
    },
    [bounds, formats, pushHistory, scheduleSave]
  );

  // Merging operations
  const mergeSelection = useCallback(() => {
    if (!bounds) return;
    if (bounds.r0 === bounds.r1 && bounds.c0 === bounds.c1) return;
    pushHistory();
    const start = toA1(bounds.c0, bounds.r0);
    const end = toA1(bounds.c1, bounds.r1);
    const filtered = merges.filter((m) => {
      const s = parseCellRef(m.start);
      const e = parseCellRef(m.end);
      if (!s || !e) return false;
      return !(
        s.colIndex >= bounds.c0 &&
        e.colIndex <= bounds.c1 &&
        s.rowIndex >= bounds.r0 &&
        e.rowIndex <= bounds.r1
      );
    });
    filtered.push({ start, end });
    setMerges(filtered);
    stateRef.current.merges = filtered;
    scheduleSave();
  }, [bounds, merges, pushHistory, scheduleSave]);

  const unmergeSelection = useCallback(() => {
    if (!bounds) return;
    pushHistory();
    const filtered = merges.filter((m) => {
      const s = parseCellRef(m.start);
      const e = parseCellRef(m.end);
      if (!s || !e) return false;
      return (
        s.colIndex > bounds.c1 ||
        e.colIndex < bounds.c0 ||
        s.rowIndex > bounds.r1 ||
        e.rowIndex < bounds.r0
      );
    });
    setMerges(filtered);
    stateRef.current.merges = filtered;
    scheduleSave();
  }, [bounds, merges, pushHistory, scheduleSave]);

  // Announce active smart table to toolbar
  useEffect(() => {
    if (bounds) {
      window.dispatchEvent(
        new CustomEvent('smart-table-active', {
          detail: {
            tableId,
            name: tableNameRef.current,
            bounds,
            direction,
          },
        })
      );
    }
  }, [tableId, bounds, direction]);

  // Listen for toolbar commands from EditorToolbar
  useEffect(() => {
    const handleCommand = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (!detail) return;
      if (detail.tableId && detail.tableId !== tableId) return;

      switch (detail.command) {
        case 'toggle-bold':
          toggleFormat('bold');
          break;
        case 'toggle-italic':
          toggleFormat('italic');
          break;
        case 'toggle-underline':
          toggleFormat('underline');
          break;
        case 'set-align':
          if (detail.value === 'left' || detail.value === 'center' || detail.value === 'right') {
            setAlign(detail.value);
          }
          break;
        case 'set-text-color':
          setColor('textColor', detail.value || '');
          break;
        case 'set-bg-color':
          setColor('bg', detail.value || '');
          break;
        case 'add-row':
        case 'add-row-after':
          addRow(false);
          break;
        case 'insert-row':
        case 'add-row-before':
          addRow(true);
          break;
        case 'del-row':
        case 'delete-row':
          delRow();
          break;
        case 'add-col':
        case 'add-col-after':
          addCol(false);
          break;
        case 'insert-col':
        case 'add-col-before':
          addCol(true);
          break;
        case 'del-col':
        case 'delete-col':
          delCol();
          break;
        case 'undo':
          undo();
          break;
        case 'redo':
          redo();
          break;
        case 'merge':
          mergeSelection();
          break;
        case 'unmerge':
          unmergeSelection();
          break;
        case 'rename':
          if (typeof detail.value === 'string') {
            tableNameRef.current = detail.value;
            scheduleSave();
          }
          break;
        case 'set-direction':
          if (detail.value === 'rtl' || detail.value === 'ltr') {
            setDirection(detail.value);
            scheduleSave();
          }
          break;
        case 'delete-table':
          onDeleteNode?.();
          break;
        case 'clear':
          if (bounds) {
            pushHistory();
            const nextRows = rows.map((r) => ({ ...r }));
            rangeCoords(bounds).forEach((pt) => {
              const colId = cols[pt.c]?.id;
              if (colId) nextRows[pt.r][colId] = '';
            });
            setRows(nextRows);
            stateRef.current.rows = nextRows;
            scheduleSave();
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener('smart-table-command', handleCommand);
    return () => {
      window.removeEventListener('smart-table-command', handleCommand);
    };
  }, [
    tableId,
    toggleFormat,
    setAlign,
    setColor,
    addRow,
    delRow,
    addCol,
    delCol,
    undo,
    redo,
    mergeSelection,
    unmergeSelection,
    scheduleSave,
    bounds,
    rows,
    cols,
    pushHistory,
    onDeleteNode,
  ]);

  // Copy / Paste (TSV) — Bug 6 fix: copy raw values (preserves formulas)
  const copySelection = useCallback(
    async (isCut = false) => {
      if (!bounds) return;
      // Build TSV from raw data (not displayGrid) to preserve formulas
      const lines: string[] = [];
      for (let r = bounds.r0; r <= bounds.r1; r++) {
        const cells: string[] = [];
        for (let c = bounds.c0; c <= bounds.c1; c++) {
          cells.push(String(rows[r]?.[cols[c]?.id] ?? ''));
        }
        lines.push(cells.join('\t'));
      }
      const tsv = lines.join('\n');
      try {
        await navigator.clipboard.writeText(tsv);
      } catch {}
      if (isCut) {
        pushHistory();
        const nextRows = rows.map((r) => ({ ...r }));
        rangeCoords(bounds).forEach((pt) => {
          const colId = cols[pt.c]?.id;
          if (colId) nextRows[pt.r][colId] = '';
        });
        setRows(nextRows);
        stateRef.current.rows = nextRows;
        scheduleSave();
      }
    },
    [bounds, rows, cols, pushHistory, scheduleSave]
  );

  const pasteAt = useCallback(
    async (startR: number, startC: number) => {
      try {
        const text = await navigator.clipboard.readText();
        const grid = parseTSV(text);
        if (grid.length === 0) return;
        pushHistory();
        const nextRows = rows.map((r) => ({ ...r }));
        while (nextRows.length < startR + grid.length && nextRows.length < SPREADSHEET_CAP.ROWS) {
          const blank: GridRow = {};
          cols.forEach((col) => {
            blank[col.id] = '';
          });
          nextRows.push(blank);
        }
        grid.forEach((rowVals, dr) => {
          const r = startR + dr;
          if (r >= nextRows.length) return;
          rowVals.forEach((val, dc) => {
            const c = startC + dc;
            if (c >= cols.length) return;
            const colId = cols[c]?.id;
            if (!colId) return;
            if (val.startsWith('=')) {
              try {
                nextRows[r][colId] = adjustFormula(val, dr, dc);
              } catch {
                nextRows[r][colId] = val;
              }
            } else {
              nextRows[r][colId] = val;
            }
          });
        });
        setRows(nextRows);
        stateRef.current.rows = nextRows;
        scheduleSave();
        setSel({ r: startR, c: startC });
        setAnchor({
          r: Math.min(startR + grid.length - 1, nextRows.length - 1),
          c: Math.min(startC + (grid[0]?.length || 1) - 1, cols.length - 1),
        });
      } catch (e) {
        console.warn('Paste failed', e);
      }
    },
    [rows, cols, pushHistory, scheduleSave]
  );

  // Autofill Handle
  const [filling, setFilling] = useState(false);
  const fillSource = useRef<CellRange | null>(null);
  const [fillPreview, setFillPreview] = useState<CellRange | null>(null);

  const applyFill = useCallback(
    (src: CellRange, tgt: CellRange) => {
      const st = stateRef.current;
      const byCoord: Record<string, any> = {};
      st.rows.forEach((row, r) => {
        st.cols.forEach((col, c) => {
          byCoord[toA1(c, r)] = row[col.id];
        });
      });

      const isMultiCell = src.r1 > src.r0 || src.c1 > src.c0;
      const singleVal = String(byCoord[toA1(src.c0, src.r0)] || '');
      const isFormula = singleVal.trim().startsWith('=');
      const display = computeGridDisplay(st.rows, st.cols);

      // Single formula cell (e.g. a SUM result): fill the COMPUTED value,
      // not the formula itself — dragging =150 stays 150, never =SUM(A2:A4).
      if (!isMultiCell && isFormula) {
        const computed = display[toA1(src.c0, src.r0)] ?? '';
        pushHistory();
        const nextRows = st.rows.map((row) => ({ ...row }));
        while (nextRows.length <= Math.min(tgt.r1, SPREADSHEET_CAP.ROWS - 1)) {
          const blank: GridRow = {};
          st.cols.forEach((col) => {
            blank[col.id] = '';
          });
          nextRows.push(blank);
        }
        for (let r = tgt.r0; r <= Math.min(tgt.r1, nextRows.length - 1); r++) {
          for (let c = tgt.c0; c <= Math.min(tgt.c1, st.cols.length - 1); c++) {
            if (r === src.r0 && c === src.c0) continue;
            const id = st.cols[c]?.id;
            if (id) nextRows[r][id] = computed;
          }
        }
        setRows(nextRows);
        stateRef.current.rows = nextRows;
        scheduleSave();
        setSel({ r: Math.min(tgt.r1, nextRows.length - 1), c: Math.min(tgt.c1, st.cols.length - 1) });
        return;
      }

      // Single cell or formula uses copy_cells to repeat literal value;
      // Multi-cell non-formula range uses fill_series
      const autofillMode = !isMultiCell || isFormula ? 'copy_cells' : 'fill_series';

      try {
        const res = executeAutofill({
          sourceRange: {
            startCol: colIndexToName(src.c0),
            startRow: src.r0 + 1,
            endCol: colIndexToName(src.c1),
            endRow: src.r1 + 1,
          },
          targetRange: {
            startCol: colIndexToName(tgt.c0),
            startRow: tgt.r0 + 1,
            endCol: colIndexToName(tgt.c1),
            endRow: tgt.r1 + 1,
          },
          currentGridData: byCoord,
          calculatedGridData: display,
          mode: autofillMode,
        });
        if (!res || !Array.isArray(res.changes) || res.changes.length === 0) return;
        pushHistory();
        const nextRows = st.rows.map((row) => ({ ...row }));
        let maxR = nextRows.length - 1;
        res.changes.forEach((ch) => {
          const rr = ch.row - 1;
          if (rr > maxR) maxR = rr;
        });
        while (nextRows.length <= Math.min(maxR, SPREADSHEET_CAP.ROWS - 1)) {
          const blank: GridRow = {};
          st.cols.forEach((col) => {
            blank[col.id] = '';
          });
          nextRows.push(blank);
        }
        res.changes.forEach((ch) => {
          const p = parseCellRef(`${ch.col}${ch.row}`);
          if (!p) return;
          const c = p.colIndex;
          const r = p.rowIndex;
          if (r < 0 || r >= nextRows.length || c < 0 || c >= st.cols.length) return;
          const id = st.cols[c]?.id;
          if (!id) return;
          nextRows[r][id] = ch.newValue;
        });

        // Preserve formatting: copy format from source cells to destination range
        const nextFormats = { ...st.formats };
        const srcH = src.r1 - src.r0 + 1;
        const srcW = src.c1 - src.c0 + 1;
        for (let r = tgt.r0; r <= tgt.r1; r++) {
          for (let c = tgt.c0; c <= tgt.c1; c++) {
            const srcR = src.r0 + ((r - tgt.r0) % srcH);
            const srcC = src.c0 + ((c - tgt.c0) % srcW);
            const srcCoord = toA1(srcC, srcR);
            const tgtCoord = toA1(c, r);
            if (st.formats[srcCoord]) {
              nextFormats[tgtCoord] = { ...st.formats[srcCoord] };
            }
          }
        }

        setRows(nextRows);
        setFormats(nextFormats);
        stateRef.current.rows = nextRows;
        stateRef.current.formats = nextFormats;
        scheduleSave();
        setSel({ r: Math.min(tgt.r1, nextRows.length - 1), c: Math.min(tgt.c1, st.cols.length - 1) });
      } catch (err) {
        console.warn('Autofill failed:', err);
      }
    },
    [pushHistory, scheduleSave]
  );

  useEffect(() => {
    if (!filling) return;
    const up = () => {
      const src = fillSource.current;
      setFillPreview((tgt) => {
        if (src && tgt) {
          const extendsBeyond =
            tgt.r0 < src.r0 || tgt.r1 > src.r1 || tgt.c0 < src.c0 || tgt.c1 > src.c1;
          if (extendsBeyond) applyFill(src, tgt);
        }
        return null;
      });
      fillSource.current = null;
      setFilling(false);
    };
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, [filling, applyFill]);

  // Column resizing
  const resizeRef = useRef<{ ci: number; startX: number; startW: number } | null>(null);
  useEffect(() => {
    const move = (e: MouseEvent) => {
      const rz = resizeRef.current;
      if (!rz) return;
      const delta = direction === 'rtl' ? rz.startX - e.clientX : e.clientX - rz.startX;
      const w = Math.min(600, Math.max(60, rz.startW + delta));
      setCols((prev) => {
        const next = prev.map((c, i) => (i === rz.ci ? { ...c, width: w } : c));
        stateRef.current.cols = next;
        return next;
      });
    };
    const up = () => {
      if (resizeRef.current) {
        resizeRef.current = null;
        scheduleSave();
      }
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, [direction, scheduleSave]);

  // Keyboard navigation & Shortcuts
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // If a cell is currently in edit mode:
      if (editingCellRef.current !== null) {
        if (e.key === 'Escape') {
          e.preventDefault();
          cancelEdit();
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          commitEdit();
          if (sel) {
            const nextR = e.shiftKey ? Math.max(0, sel.r - 1) : Math.min(rows.length - 1, sel.r + 1);
            setSel({ r: nextR, c: sel.c });
            setAnchor({ r: nextR, c: sel.c });
          }
          return;
        }
        if (e.key === 'Tab') {
          e.preventDefault();
          commitEdit();
          if (sel) {
            const dc = e.shiftKey ? -1 : 1;
            let nextC = sel.c + dc;
            let nextR = sel.r;
            if (nextC >= cols.length) { nextC = 0; nextR++; }
            if (nextC < 0) { nextC = cols.length - 1; nextR--; }
            nextR = Math.max(0, Math.min(nextR, rows.length - 1));
            setSel({ r: nextR, c: nextC });
            setAnchor({ r: nextR, c: nextC });
          }
          return;
        }
        // Printable key typed while editing (if focus was on container instead of textarea):
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          const nextVal = draftRef.current + e.key;
          setDraft(nextVal);
          draftRef.current = nextVal;
          const { r, c } = editingCellRef.current;
          const colId = cols[c]?.id;
          if (colId) {
            setRows((prev) => {
              const next = prev.map((row, ri) => (ri === r ? { ...row, [colId]: nextVal } : row));
              stateRef.current.rows = next;
              return next;
            });
          }
          editInputRef.current?.focus();
          return;
        }
        return;
      }

      // --- When NOT in edit mode (CELL_SELECTED / RANGE_SELECTED) ---
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        void copySelection(false);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') {
        e.preventDefault();
        void copySelection(true);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        if (sel) void pasteAt(sel.r, sel.c);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleFormat('bold');
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        toggleFormat('italic');
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'u') {
        e.preventDefault();
        toggleFormat('underline');
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!bounds) return;
        e.preventDefault();
        pushHistory();
        const nextRows = rows.map((r) => ({ ...r }));
        rangeCoords(bounds).forEach((pt) => {
          const colId = cols[pt.c]?.id;
          if (colId) nextRows[pt.r][colId] = '';
        });
        setRows(nextRows);
        stateRef.current.rows = nextRows;
        scheduleSave();
        return;
      }
      if (sel) {
        if (e.key === 'F2') {
          e.preventDefault();
          startEdit(sel.r, sel.c, false);
          return;
        }
        if (e.key === 'Home') {
          e.preventDefault();
          if (e.ctrlKey || e.metaKey) {
            setSel({ r: 0, c: 0 });
            setAnchor({ r: 0, c: 0 });
          } else {
            setSel({ r: sel.r, c: 0 });
            setAnchor({ r: sel.r, c: 0 });
          }
          return;
        }
        if (e.key === 'End') {
          e.preventDefault();
          if (e.ctrlKey || e.metaKey) {
            const lastR = rows.length - 1;
            const lastC = cols.length - 1;
            setSel({ r: lastR, c: lastC });
            setAnchor({ r: lastR, c: lastC });
          } else {
            setSel({ r: sel.r, c: cols.length - 1 });
            setAnchor({ r: sel.r, c: cols.length - 1 });
          }
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          if (e.shiftKey) {
            const nextR = Math.max(0, sel.r - 1);
            setSel({ r: nextR, c: sel.c });
            setAnchor({ r: nextR, c: sel.c });
          } else {
            const nextR = Math.min(rows.length - 1, sel.r + 1);
            setSel({ r: nextR, c: sel.c });
            setAnchor({ r: nextR, c: sel.c });
          }
          return;
        }
        // Tab navigation (wraps at end of row)
        if (e.key === 'Tab') {
          e.preventDefault();
          const dc = e.shiftKey ? -1 : 1;
          let nextC = sel.c + dc;
          let nextR = sel.r;
          if (nextC >= cols.length) { nextC = 0; nextR++; }
          if (nextC < 0) { nextC = cols.length - 1; nextR--; }
          nextR = Math.max(0, Math.min(nextR, rows.length - 1));
          setSel({ r: nextR, c: nextC });
          setAnchor({ r: nextR, c: nextC });
          return;
        }
        // Shift+Arrow extends range, plain Arrow moves cell
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (e.shiftKey) {
            const a = anchor || sel;
            if (a.r > 0) setAnchor({ r: a.r - 1, c: a.c });
          } else if (sel.r > 0) {
            setSel({ r: sel.r - 1, c: sel.c });
            setAnchor({ r: sel.r - 1, c: sel.c });
          }
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (e.shiftKey) {
            const a = anchor || sel;
            if (a.r < rows.length - 1) setAnchor({ r: a.r + 1, c: a.c });
          } else if (sel.r < rows.length - 1) {
            setSel({ r: sel.r + 1, c: sel.c });
            setAnchor({ r: sel.r + 1, c: sel.c });
          }
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          const dc = direction === 'rtl' ? 1 : -1;
          if (e.shiftKey) {
            const a = anchor || sel;
            const nextC = a.c + dc;
            if (nextC >= 0 && nextC < cols.length) setAnchor({ r: a.r, c: nextC });
          } else {
            const nextC = sel.c + dc;
            if (nextC >= 0 && nextC < cols.length) {
              setSel({ r: sel.r, c: nextC });
              setAnchor({ r: sel.r, c: nextC });
            }
          }
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          const dc = direction === 'rtl' ? -1 : 1;
          if (e.shiftKey) {
            const a = anchor || sel;
            const nextC = a.c + dc;
            if (nextC >= 0 && nextC < cols.length) setAnchor({ r: a.r, c: nextC });
          } else {
            const nextC = sel.c + dc;
            if (nextC >= 0 && nextC < cols.length) {
              setSel({ r: sel.r, c: nextC });
              setAnchor({ r: sel.r, c: nextC });
            }
          }
        } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          // Direct typing: replace active cell value immediately
          e.preventDefault();
          startEdit(sel.r, sel.c, true, e.key);
        }
      }
    },
    [
      sel,
      anchor,
      bounds,
      rows,
      cols,
      direction,
      undo,
      redo,
      copySelection,
      pasteAt,
      toggleFormat,
      startEdit,
      commitEdit,
      cancelEdit,
      pushHistory,
      scheduleSave,
    ]
  );

  // Merges coverage map
  const covered = useMemo(() => {
    const set = new Set<string>();
    const anchors = new Map<string, { rs: number; cs: number }>();
    merges.forEach((mg) => {
      const s = parseCellRef(mg.start);
      const e = parseCellRef(mg.end);
      if (!s || !e) return;
      const c0 = Math.min(s.colIndex, e.colIndex);
      const c1 = Math.max(s.colIndex, e.colIndex);
      const r0 = Math.min(s.rowIndex, e.rowIndex);
      const r1 = Math.max(s.rowIndex, e.rowIndex);
      if (c0 === c1 && r0 === r1) return;
      anchors.set(`${r0}:${c0}`, { rs: r1 - r0 + 1, cs: c1 - c0 + 1 });
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          if (r === r0 && c === c0) continue;
          set.add(`${r}:${c}`);
        }
      }
    });
    return { covered: set, anchors };
  }, [merges]);

  if (loading) {
    return (
      <div className="flex min-h-[220px] items-center justify-center text-xs text-muted-foreground">
        {isAr ? 'جاري تحميل الجدول…' : 'Loading table…'}
      </div>
    );
  }

  const isRtl = direction === 'rtl';

  return (
    <div
      ref={containerRef}
      className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xs select-none text-foreground font-sans outline-none"
      dir={direction}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* Formula Bar (fx) */}
      <div className="flex items-center gap-1.5 border-b border-border/70 bg-muted/40 px-3 py-1.5">
        <span
          className="w-12 shrink-0 rounded border border-border bg-card px-1 py-0.5 text-center font-mono text-[11px] font-bold text-foreground"
          dir="ltr"
        >
          {selCoord || '—'}
        </span>
        <span className="font-mono text-[11px] font-bold italic text-muted-foreground select-none" dir="ltr">
          fx
        </span>
        <input
          value={editingCell !== null ? draft : selRaw}
          dir="auto"
          onChange={(e) => {
            if (sel && editingCellRef.current === null) {
              startEdit(sel.r, sel.c, false);
            }
            const nextVal = e.target.value;
            setDraft(nextVal);
            draftRef.current = nextVal;
            if (editingCellRef.current) {
              const { r, c } = editingCellRef.current;
              const colId = cols[c]?.id;
              if (colId) {
                setRows((prev) => {
                  const next = prev.map((row, rri) => (rri === r ? { ...row, [colId]: nextVal } : row));
                  stateRef.current.rows = next;
                  return next;
                });
              }
            }
          }}
          onFocus={() => {
            if (sel && editingCellRef.current === null) {
              startEdit(sel.r, sel.c, false);
            }
          }}
          onBlur={(e) => {
            if (isDraggingFormulaRangeRef.current) return;
            const rel = e.relatedTarget as HTMLElement;
            if (rel && containerRef.current?.contains(rel)) return;
            commitEdit();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitEdit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancelEdit();
            }
          }}
          placeholder={isAr ? 'قيمة أو صيغة تبدأ بـ = (مثال: SUM, AVERAGE, MIN, MAX)' : 'Value or =formula (e.g. SUM, AVERAGE, MIN, MAX)'}
          style={{ caretColor: 'var(--primary, #10b981)' }}
          className="h-7 min-w-0 flex-1 rounded-md border border-border/70 bg-card px-2 text-xs text-foreground outline-none focus:border-primary select-text cursor-text"
        />
        <span
          className={cn(
            'shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold',
            saveState === 'saved' && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
            saveState === 'saving' && 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
            saveState === 'error' && 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
          )}
        >
          {saveState === 'saved' ? (isAr ? 'محفوظ' : 'Saved') : saveState === 'saving' ? '…' : '!'}
        </span>
      </div>

      {/* Grid Toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-border/70 bg-muted/20 px-2 py-1">
        <button
          type="button"
          onClick={undo}
          disabled={pastRef.current.length === 0}
          className="h-6 w-6 rounded border border-border/70 bg-card flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40"
          title={`${isAr ? 'تراجع' : 'Undo'} (Ctrl+Z)`}
        >
          <Undo2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={redo}
          disabled={futureRef.current.length === 0}
          className="h-6 w-6 rounded border border-border/70 bg-card flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40"
          title={`${isAr ? 'إعادة' : 'Redo'} (Ctrl+Y)`}
        >
          <Redo2 className="h-3.5 w-3.5" />
        </button>

        <span className="mx-1 h-4 w-px bg-border/70" />

        <button
          type="button"
          onClick={() => void copySelection(false)}
          className="h-6 w-6 rounded border border-border/70 bg-card flex items-center justify-center text-muted-foreground hover:text-foreground"
          title={`${isAr ? 'نسخ' : 'Copy'} (Ctrl+C)`}
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => void copySelection(true)}
          className="h-6 w-6 rounded border border-border/70 bg-card flex items-center justify-center text-muted-foreground hover:text-foreground"
          title={`${isAr ? 'قص' : 'Cut'} (Ctrl+X)`}
        >
          <Scissors className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => sel && void pasteAt(sel.r, sel.c)}
          className="h-6 w-6 rounded border border-border/70 bg-card flex items-center justify-center text-muted-foreground hover:text-foreground"
          title={`${isAr ? 'لصق' : 'Paste'} (Ctrl+V)`}
        >
          <ClipboardPaste className="h-3.5 w-3.5" />
        </button>

        <span className="mx-1 h-4 w-px bg-border/70" />

        {/* Row & Col Operations */}
        <button
          type="button"
          onClick={() => addRow(false)}
          className="h-6 rounded border border-border/70 bg-card px-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground flex items-center gap-1"
          title={isAr ? 'إضافة صف' : 'Add row'}
        >
          <Plus className="h-3 w-3" />
          <span>{isAr ? 'صف' : 'Row'}</span>
        </button>
        <button
          type="button"
          onClick={delRow}
          disabled={rows.length <= 1}
          className="h-6 rounded border border-border/70 bg-card px-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-40 flex items-center gap-1"
          title={isAr ? 'حذف صف' : 'Delete row'}
        >
          <Minus className="h-3 w-3" />
          <span>{isAr ? 'صف' : 'Row'}</span>
        </button>
        <button
          type="button"
          onClick={() => addCol(false)}
          className="h-6 rounded border border-border/70 bg-card px-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground flex items-center gap-1"
          title={isAr ? 'إضافة عمود' : 'Add column'}
        >
          <Plus className="h-3 w-3" />
          <span>{isAr ? 'عمود' : 'Col'}</span>
        </button>
        <button
          type="button"
          onClick={delCol}
          disabled={cols.length <= 1}
          className="h-6 rounded border border-border/70 bg-card px-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-40 flex items-center gap-1"
          title={isAr ? 'حذف عمود' : 'Delete column'}
        >
          <Minus className="h-3 w-3" />
          <span>{isAr ? 'عمود' : 'Col'}</span>
        </button>

        <span className="mx-1 h-4 w-px bg-border/70" />

        {/* Formatting */}
        <button
          type="button"
          onClick={() => toggleFormat('bold')}
          className={cn(
            'h-6 w-6 rounded border border-border/70 bg-card flex items-center justify-center text-[11px]',
            sel && formats[toA1(sel.c, sel.r)]?.bold ? 'text-primary font-bold border-primary' : 'text-muted-foreground'
          )}
          title={`${isAr ? 'عريض' : 'Bold'} (Ctrl+B)`}
        >
          <Bold className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => toggleFormat('italic')}
          className={cn(
            'h-6 w-6 rounded border border-border/70 bg-card flex items-center justify-center text-[11px]',
            sel && formats[toA1(sel.c, sel.r)]?.italic ? 'text-primary border-primary' : 'text-muted-foreground'
          )}
          title={`${isAr ? 'مائل' : 'Italic'} (Ctrl+I)`}
        >
          <Italic className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => toggleFormat('underline')}
          className={cn(
            'h-6 w-6 rounded border border-border/70 bg-card flex items-center justify-center text-[11px]',
            sel && formats[toA1(sel.c, sel.r)]?.underline ? 'text-primary border-primary' : 'text-muted-foreground'
          )}
          title={`${isAr ? 'تسطير' : 'Underline'} (Ctrl+U)`}
        >
          <Underline className="h-3.5 w-3.5" />
        </button>

        <span className="mx-1 h-4 w-px bg-border/70" />

        <button
          type="button"
          onClick={() => setAlign('right')}
          className={cn(
            'h-6 w-6 rounded border border-border/70 bg-card flex items-center justify-center',
            sel && formats[toA1(sel.c, sel.r)]?.align === 'right' ? 'text-primary border-primary' : 'text-muted-foreground'
          )}
          title={isAr ? 'محاذاة يمين' : 'Align Right'}
        >
          <AlignRight className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setAlign('center')}
          className={cn(
            'h-6 w-6 rounded border border-border/70 bg-card flex items-center justify-center',
            sel && formats[toA1(sel.c, sel.r)]?.align === 'center' ? 'text-primary border-primary' : 'text-muted-foreground'
          )}
          title={isAr ? 'توسيط' : 'Align Center'}
        >
          <AlignCenter className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setAlign('left')}
          className={cn(
            'h-6 w-6 rounded border border-border/70 bg-card flex items-center justify-center',
            sel && formats[toA1(sel.c, sel.r)]?.align === 'left' ? 'text-primary border-primary' : 'text-muted-foreground'
          )}
          title={isAr ? 'محاذاة يسار' : 'Align Left'}
        >
          <AlignLeft className="h-3.5 w-3.5" />
        </button>

        <span className="mx-1 h-4 w-px bg-border/70" />

        {/* Text color */}
        <div className="flex items-center">
          <label
            className="flex h-6 cursor-pointer items-center gap-1 rounded-s border border-border/70 bg-card px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
            title={isAr ? 'لون الخط' : 'Text color'}
          >
            <Type className="h-3.5 w-3.5" />
            <input
              type="color"
              value={(sel && formats[toA1(sel.c, sel.r)]?.textColor) || '#000000'}
              onChange={(e) => setColor('textColor', e.target.value)}
              className="h-3.5 w-4 cursor-pointer border-0 bg-transparent p-0"
            />
          </label>
          <button
            type="button"
            onClick={() => setColor('textColor', '')}
            className="flex h-6 px-1 items-center justify-center rounded-e border border-s-0 border-border/70 bg-card text-muted-foreground hover:text-foreground hover:bg-muted"
            title={isAr ? 'استرجاع لون الخط الأصلي' : 'Reset text color'}
          >
            <RotateCcw className="h-2.5 w-2.5" />
          </button>
        </div>

        {/* BG color */}
        <div className="flex items-center">
          <label
            className="flex h-6 cursor-pointer items-center gap-1 rounded-s border border-border/70 bg-card px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
            title={isAr ? 'لون الخلفية' : 'Background color'}
          >
            <Palette className="h-3.5 w-3.5" />
            <input
              type="color"
              value={(sel && formats[toA1(sel.c, sel.r)]?.bg) || '#ffffff'}
              onChange={(e) => setColor('bg', e.target.value)}
              className="h-3.5 w-4 cursor-pointer border-0 bg-transparent p-0"
            />
          </label>
          <button
            type="button"
            onClick={() => setColor('bg', '')}
            className="flex h-6 px-1 items-center justify-center rounded-e border border-s-0 border-border/70 bg-card text-muted-foreground hover:text-foreground hover:bg-muted"
            title={isAr ? 'استرجاع اللون الأصلي للخلفية' : 'Reset background color'}
          >
            <RotateCcw className="h-2.5 w-2.5" />
          </button>
        </div>

        <span className="mx-1 h-4 w-px bg-border/70" />

        {/* Merge / Unmerge */}
        <button
          type="button"
          onClick={mergeSelection}
          className="h-6 rounded border border-border/70 bg-card px-1.5 text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1"
          title={isAr ? 'دمج الخلايا المحددة' : 'Merge selected cells'}
        >
          <Merge className="h-3 w-3" />
          <span>{isAr ? 'دمج' : 'Merge'}</span>
        </button>
        <button
          type="button"
          onClick={unmergeSelection}
          className="h-6 rounded border border-border/70 bg-card px-1.5 text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1"
          title={isAr ? 'فك الدمج' : 'Unmerge'}
        >
          <Split className="h-3 w-3" />
          <span>{isAr ? 'فك الدمج' : 'Unmerge'}</span>
        </button>
      </div>

      {/* Grid Container (Horizontal scroll on mobile) */}
      <div className="relative overflow-x-auto max-h-[480px]">
        <table
          className="border-collapse text-xs w-max min-w-full font-sans"
          dir={direction}
        >
          <thead>
            <tr className="bg-muted/50 border-b border-border text-muted-foreground font-semibold">
              {/* Row number header corner */}
              <th className="sticky start-0 z-20 w-10 border-e border-b border-border/70 bg-muted/60 px-1 py-1.5 text-center font-mono text-[10px] text-muted-foreground">
                #
              </th>
              {cols.map((col, ci) => (
                <th
                  key={col.id}
                  style={{ width: col.width, minWidth: col.width }}
                  className="relative border-e border-b border-border/70 bg-muted/40 px-2.5 py-1.5 text-center font-mono text-[11px] font-semibold text-muted-foreground select-none group"
                >
                  <div className="flex items-center justify-between">
                    {editingCol === ci ? (
                      <input
                        autoFocus
                        value={colNameDraft}
                        dir="auto"
                        onChange={(e) => setColNameDraft(e.target.value)}
                        onBlur={commitColRename}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitColRename();
                          else if (e.key === 'Escape') setEditingCol(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full h-5 rounded border border-primary bg-background px-1 text-[11px] font-bold outline-none"
                      />
                    ) : (
                      <span
                        className="flex-1 truncate cursor-pointer hover:underline"
                        title={isAr ? 'انقر نقراً مزدوجاً لتعديل اسم العمود' : 'Double click to rename column'}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          setEditingCol(ci);
                          setColNameDraft(col.name);
                        }}
                      >
                        {col.name}
                      </span>
                    )}
                    <span className="text-[9px] text-muted-foreground/60 font-mono ms-1">
                      ({col.id})
                    </span>
                  </div>
                  {/* Resize handle */}
                  <div
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      resizeRef.current = {
                        ci,
                        startX: e.clientX,
                        startW: col.width,
                      };
                    }}
                    className={cn(
                      'absolute top-0 bottom-0 w-2 cursor-col-resize hover:bg-primary/50 transition-colors z-10',
                      isRtl ? 'left-0' : 'right-0'
                    )}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {rows.map((row, ri) => (
              <tr key={ri} className={cn('hover:bg-muted/20 transition-colors', ri % 2 === 1 ? 'bg-muted/10' : 'bg-card')}>
                {/* Row Header Number */}
                <td className="sticky start-0 z-10 border-e border-b border-border/70 bg-muted/40 px-1 py-1 text-center font-mono text-[10px] text-muted-foreground font-medium select-none">
                  {ri + 1}
                </td>

                {cols.map((col, ci) => {
                  const coord = toA1(ci, ri);
                  if (covered.covered.has(`${ri}:${ci}`)) {
                    return null;
                  }
                  const mergeAnchor = covered.anchors.get(`${ri}:${ci}`);
                  const rowSpan = mergeAnchor?.rs;
                  const colSpan = mergeAnchor?.cs;

                  const isSelected =
                    bounds &&
                    ri >= bounds.r0 &&
                    ri <= bounds.r1 &&
                    ci >= bounds.c0 &&
                    ci <= bounds.c1;
                  const isAnchor = sel?.r === ri && sel?.c === ci;
                  const isCellEditing = editingCell?.r === ri && editingCell?.c === ci;
                  const isInFillPreview =
                    fillPreview &&
                    ri >= fillPreview.r0 &&
                    ri <= fillPreview.r1 &&
                    ci >= fillPreview.c0 &&
                    ci <= fillPreview.c1;
                  // Fill handle shows on the selection corner in BOTH modes:
                  // selecting and writing. Starting a fill from edit mode
                  // commits the in-progress value first (see mousedown below).
                  const isFillHandleCell = bounds && ri === bounds.r1 && ci === bounds.c1;
                  const fmt = formats[coord];
                  const displayVal = displayGrid[coord] ?? '';
                  const cellDir = getCellDirection(displayVal);
                  const effectiveAlign = fmt?.align || (cellDir === 'rtl' ? 'right' : cellDir === 'ltr' ? 'left' : (isRtl ? 'right' : 'left'));

                  const isInFormulaPreview =
                    formulaRangePreview &&
                    ri >= formulaRangePreview.r0 &&
                    ri <= formulaRangePreview.r1 &&
                    ci >= formulaRangePreview.c0 &&
                    ci <= formulaRangePreview.c1;

                  const editDir = getCellDirection(draft);
                  const editAlign = fmt?.align || (editDir === 'rtl' ? 'right' : editDir === 'ltr' ? 'left' : (isRtl ? 'right' : 'left'));

                  return (
                    <td
                      key={col.id}
                      rowSpan={rowSpan}
                      colSpan={colSpan}
                      style={{
                        backgroundColor: fmt?.bg || undefined,
                        color: fmt?.textColor || undefined,
                        width: col.width,
                        minWidth: col.width,
                      }}
                      className={cn(
                        'relative border border-border/70 p-0 text-xs transition-colors',
                        isSelected && 'bg-primary/10 ring-1 ring-inset ring-primary',
                        isInFillPreview && !isSelected && 'bg-primary/5 ring-1 ring-inset ring-dashed ring-primary/60',
                        isInFormulaPreview && !isSelected && 'bg-blue-500/10 ring-2 ring-dashed ring-blue-500 z-20 animate-pulse',
                        isAnchor && 'ring-2 ring-primary z-10',
                        fmt?.bold && 'font-bold',
                        fmt?.italic && 'italic',
                        fmt?.underline && 'underline',
                        effectiveAlign === 'left' && 'text-left',
                        effectiveAlign === 'center' && 'text-center',
                        effectiveAlign === 'right' && 'text-right'
                      )}
                      onMouseDown={(e) => {
                        if (e.button !== 0) return;

                        // Formula Range Drag Selection: when editing a formula and clicking another cell
                        if (editingCellRef.current && draftRef.current.trim().startsWith('=')) {
                          if (editingCellRef.current.r !== ri || editingCellRef.current.c !== ci) {
                            e.preventDefault();
                            e.stopPropagation();
                            handleCellFormulaRangeStart(ri, ci, e);
                            return;
                          }
                        }

                        // If user is already editing this exact cell, let click interact with textarea
                        if (editingCellRef.current && editingCellRef.current.r === ri && editingCellRef.current.c === ci) {
                          return;
                        }

                        // If editing another cell, commit in-progress edit FIRST (Selection never touches data!)
                        if (editingCellRef.current) {
                          commitEdit();
                        }
                        suppressClickEditRef.current = false;

                        containerRef.current?.focus();
                        window.dispatchEvent(
                          new CustomEvent('smart-table-active', {
                            detail: { tableId, name: tableNameRef.current },
                          })
                        );

                        if (e.shiftKey && sel) {
                          setAnchor({ r: ri, c: ci });
                        } else {
                          setSel({ r: ri, c: ci });
                          setAnchor({ r: ri, c: ci });
                          isDraggingRef.current = true;
                          dragMovedRef.current = false;
                        }
                      }}
                      onMouseEnter={() => {
                        if (isDraggingFormulaRangeRef.current) {
                          handleCellFormulaRangeEnter(ri, ci);
                          return;
                        }
                        if (isDraggingRef.current) {
                          dragMovedRef.current = true;
                          setAnchor({ r: ri, c: ci });
                        }
                        if (filling && fillSource.current) {
                          const src = fillSource.current;
                          setFillPreview({
                            r0: Math.min(src.r0, ri),
                            c0: Math.min(src.c0, ci),
                            r1: Math.max(src.r1, ri),
                            c1: Math.max(src.c1, ci),
                          });
                        }
                      }}
                      onClick={() => {
                        if (isDraggingFormulaRangeRef.current) return;
                        // Just picked this cell into an in-progress formula:
                        // keep editing the formula cell, don't jump here.
                        if (suppressClickEditRef.current) {
                          suppressClickEditRef.current = false;
                          return;
                        }
                        if (dragMovedRef.current) {
                          dragMovedRef.current = false;
                          return;
                        }
                        if (editingCellRef.current?.r === ri && editingCellRef.current?.c === ci) return;
                        startEdit(ri, ci, false);
                      }}
                      onDoubleClick={() => startEdit(ri, ci, false)}
                    >
                      {isCellEditing ? (
                        <textarea
                          ref={editInputRef as any}
                          value={draft}
                          dir="auto"
                          rows={1}
                          style={{
                            caretColor: 'var(--primary, #10b981)',
                            resize: 'none',
                            unicodeBidi: 'plaintext',
                          }}
                          onChange={(e) => {
                            const nextVal = e.target.value;
                            setDraft(nextVal);
                            draftRef.current = nextVal;
                            if (editingCellRef.current) {
                              const { r, c } = editingCellRef.current;
                              const colId = cols[c]?.id;
                              if (colId) {
                                setRows((prev) => {
                                  const next = prev.map((row, rri) => (rri === r ? { ...row, [colId]: nextVal } : row));
                                  stateRef.current.rows = next;
                                  return next;
                                });
                              }
                            }
                            e.target.style.height = 'auto';
                            e.target.style.height = `${Math.max(32, e.target.scrollHeight)}px`;
                          }}
                          onBlur={(e) => {
                            if (isDraggingFormulaRangeRef.current) return;
                            const rel = e.relatedTarget as HTMLElement;
                            if (rel && containerRef.current?.contains(rel)) return;
                            commitEdit();
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              commitEdit();
                              if (sel) {
                                const nextR = Math.min(rows.length - 1, sel.r + 1);
                                setSel({ r: nextR, c: sel.c });
                                setAnchor({ r: nextR, c: sel.c });
                              }
                            } else if (e.key === 'Enter' && e.shiftKey) {
                              e.preventDefault();
                              commitEdit();
                              if (sel) {
                                const nextR = Math.max(0, sel.r - 1);
                                setSel({ r: nextR, c: sel.c });
                                setAnchor({ r: nextR, c: sel.c });
                              }
                            } else if (e.key === 'Tab') {
                              e.preventDefault();
                              commitEdit();
                              if (sel) {
                                const dc = e.shiftKey ? -1 : 1;
                                let nextC = sel.c + dc;
                                let nextR = sel.r;
                                if (nextC >= cols.length) { nextC = 0; nextR++; }
                                if (nextC < 0) { nextC = cols.length - 1; nextR--; }
                                nextR = Math.max(0, Math.min(nextR, rows.length - 1));
                                setSel({ r: nextR, c: nextC });
                                setAnchor({ r: nextR, c: nextC });
                              }
                            } else if (e.key === 'Escape') {
                              e.preventDefault();
                              cancelEdit();
                            }
                          }}
                          className={cn(
                            // Cell-like editing: same footprint as the normal
                            // cell (no heavy outer box), transparent over the grid.
                            'block w-full min-h-[30px] bg-transparent px-2.5 py-1.5 text-xs leading-relaxed text-foreground outline-none select-text cursor-text',
                            'focus:bg-card focus:shadow-[inset_0_0_0_1.5px_var(--primary,#10b981)]',
                            fmt?.bold && 'font-bold',
                            fmt && !fmt.bold && 'font-medium',
                            fmt?.italic && 'italic',
                            editAlign === 'left' && 'text-left',
                            editAlign === 'center' && 'text-center',
                            editAlign === 'right' && 'text-right'
                          )}
                        />
                      ) : (
                        <div
                          className="min-h-[30px] px-2.5 py-1.5 truncate select-none leading-relaxed flex items-center"
                          dir="auto"
                          style={{ unicodeBidi: 'plaintext' }}
                        >
                          {displayVal}
                        </div>
                      )}

                      {/* Autofill Corner Handle */}
                      {isFillHandleCell && (
                        <div
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            // Committing first keeps a half-typed value/formula
                            // from being lost when the fill starts from edit mode.
                            if (editingCellRef.current) commitEdit();
                            if (bounds) {
                              fillSource.current = bounds;
                              setFilling(true);
                            }
                          }}
                          className={cn(
                            'absolute w-2.5 h-2.5 bg-primary cursor-crosshair z-20 border border-card shadow-xs',
                            isRtl ? '-bottom-1 -left-1' : '-bottom-1 -right-1'
                          )}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
