'use client';

/**
 * ArabicSheet — native Arabic RTL spreadsheet grid (plain DOM, no canvas).
 *
 * WHY THIS EXISTS: the Univer canvas engine has no bidi text layout and
 * never mirrors the grid frame (verified in its sources incl. 1.0.0-rc;
 * upstream PR #7011 was closed unmerged — vendored builds help only where
 * upstream implemented). For Arabic (RTL) tables this component replaces
 * Univer entirely:
 *
 *   - Real Excel-like RTL frame: <table dir="rtl"> puts column A on the
 *     RIGHT and row numbers on the right — no emulation.
 *   - Perfect Arabic editing: cells are DOM inputs with dir="auto", so the
 *     BROWSER does shaping, caret, selection and IME — nothing to invent.
 *   - Formulas via the app's own parser (lib/grid/formula-parser), same
 *     semantics as everywhere else.
 *   - Same persistence contract (columns_data/rows_data/cell_formats/
 *     merged_cells) so exports, charts and share keep working byte-identical.
 *   - On save the stale Univer snapshot (+sidecar) is dropped, so either
 *     renderer can take over from fresh derived data at any time.
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
import { UNIVER_GRID_CAP } from '@/lib/grid/univer-adapter';
import type { TableEntity } from '@/lib/types';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { cn } from '@/lib/utils';

export interface ArabicSheetProps {
  tableId: string;
  reportId?: string;
}

interface ColDef {
  id: string;
  name: string;
  width: number;
}

interface CellFmt {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: 'right' | 'center' | 'left';
  /** Display-only extras (exports ignore unknown keys safely). */
  textColor?: string;
  bg?: string;
}

type GridRow = Record<string, any>;

/** Arabic-Indic + Extended Arabic-Indic digits → Western (Excel accepts both). */
export function normalizeDigits(input: string): string {
  return String(input)
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
}

const toA1 = (c: number, r: number): string => `${colIndexToName(c)}${r + 1}`.toUpperCase();

function clampWidth(w: unknown): number {
  return typeof w === 'number' && isFinite(w) ? Math.min(600, Math.max(60, w)) : 140;
}

function defaultCols(n: number, isAr: boolean): ColDef[] {
  const names = isAr ? ['البند', 'الوصف', 'العدد'] : ['Item', 'Description', 'Count'];
  const widths = [200, 260, 110];
  return Array.from({ length: n }, (_, i) => ({
    id: colIndexToName(i),
    name: names[i] || colIndexToName(i),
    width: widths[i] || 140,
  }));
}

/** Computes displayed values for the whole grid (formulas resolved, circular-safe). */
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

// ---------------------------------------------------------------------------
// Range / clipboard / structural ops (pure — unit-tested)
// ---------------------------------------------------------------------------

export interface CellRange {
  r0: number;
  c0: number;
  r1: number;
  c1: number;
}

/** Normalized inclusive bounds of anchor+active selection. */
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

/** Display grid → TSV (clipboard out). */
export function buildTSV(display: Record<string, string>, b: CellRange): string {
  const lines: string[] = [];
  for (let r = b.r0; r <= b.r1; r++) {
    const cells: string[] = [];
    for (let c = b.c0; c <= b.c1; c++) cells.push(display[toA1(c, r)] ?? '');
    lines.push(cells.join('\t'));
  }
  return lines.join('\n');
}

/** Clipboard text → string grid (never throws, caps size). */
export function parseTSV(text: string): string[][] {
  const clean = String(text || '').replace(/\r\n?/g, '\n').replace(/\n$/, '');
  if (!clean) return [];
  return clean
    .split('\n')
    .slice(0, UNIVER_GRID_CAP.ROWS)
    .map((line) => line.split('\t').slice(0, UNIVER_GRID_CAP.COLS));
}

export interface GridSnapshot {
  cols: ColDef[];
  rows: GridRow[];
  formats: Record<string, CellFmt>;
  merges: Array<{ start: string; end: string }>;
}

function parseA1ToIdx(a1: string): { c: number; r: number } | null {
  try {
    const p = parseCellRef(String(a1 || '').trim().toUpperCase());
    if (!p) return null;
    return { c: p.colIndex, r: p.rowIndex };
  } catch {
    return null;
  }
}

/**
 * Excel shift semantics for insert/delete row/column: moves rows/cols,
 * remaps formats + merges, rewrites formula refs (deleted lines → #REF!).
 * Pure — returns a new snapshot, input untouched.
 */
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
      const [gone] = cols.splice(at, 1);
      if (gone) {
        rows.forEach((row) => {
          delete row[gone.id];
        });
      }
    }
  }

  // Formulas follow shifted cells.
  rows.forEach((row) => {
    Object.keys(row).forEach((k) => {
      const v = row[k];
      if (typeof v === 'string' && v.trim().startsWith('=')) {
        row[k] = remapFormulaRefs(v, (ci, ri) => {
          const m = mapRef(ci, ri);
          return m ? { colIndex: m.colIndex, rowIndex: m.rowIndex } : null;
        });
      }
    });
  });

  // Formats travel with their cells; formats on a deleted line are dropped.
  const formats: Record<string, CellFmt> = {};
  Object.keys(state.formats).forEach((coord) => {
    const p = parseA1ToIdx(coord);
    if (!p) return;
    const m = mapRef(p.c, p.r);
    if (!m || m.colIndex < 0 || m.rowIndex < 0) return;
    formats[toA1(m.colIndex, m.rowIndex)] = state.formats[coord];
  });

  // Merges: dropped when touching a deleted line, shifted otherwise.
  const merges: Array<{ start: string; end: string }> = [];
  state.merges.forEach((mg) => {
    const s = parseA1ToIdx(mg.start);
    const e = parseA1ToIdx(mg.end);
    if (!s || !e) return;
    const ms = mapRef(Math.min(s.c, e.c), Math.min(s.r, e.r));
    const me = mapRef(Math.max(s.c, e.c), Math.max(s.r, e.r));
    if (!ms || !me) return;
    if (ms.colIndex === me.colIndex && ms.rowIndex === me.rowIndex) return;
    merges.push({ start: toA1(ms.colIndex, ms.rowIndex), end: toA1(me.colIndex, me.rowIndex) });
  });

  return { cols, rows, formats, merges };
}

export function ArabicSheet({ tableId }: ArabicSheetProps) {
  const { lang } = useLanguage();
  const isAr = lang === 'ar';

  const [cols, setCols] = useState<ColDef[]>(() => defaultCols(3, true));
  const [rows, setRows] = useState<GridRow[]>(() =>
    Array.from({ length: 5 }, () => ({ A: '', B: '', C: '' }))
  );
  const [formats, setFormats] = useState<Record<string, CellFmt>>({});
  const [merges, setMerges] = useState<Array<{ start: string; end: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved');
  const [sel, setSel] = useState<{ r: number; c: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [headerEdit, setHeaderEdit] = useState<number | null>(null);
  const [headerDraft, setHeaderDraft] = useState('');

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef({ cols, rows, formats, merges });
  stateRef.current = { cols, rows, formats, merges };
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ---- persistence (declared early: history + handshake use it) ----
  const saveNow = useCallback(async (): Promise<boolean> => {
    if (!tableId) return false;
    try {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      const { cols: c, rows: r, formats: f, merges: m } = stateRef.current;
      if (mountedRef.current) setSaveState('saving');
      const { saveTable, clearTableSnapshot } = await import('@/lib/db-intelligence');
      const { getTableById } = await import('@/lib/db-intelligence');
      const prev = ((await getTableById(tableId)) as TableEntity | null) || ({} as TableEntity);
      if ((await import('@/lib/db-intelligence')).isTableTombed(tableId)) return false;
      const record = {
        ...(prev as object),
        id: tableId,
        columns_data: c,
        rows_data: r,
        cell_formats: f,
        merged_cells: m,
        // Drop the (possibly stale) Univer snapshot so neither renderer
        // ever boots old canvas state over these values. `null` (not
        // undefined) so the Firestore merged doc actually clears the field;
        // a future Univer boot re-migrates from this fresh derived data.
        univerSnapshot: null,
      } as unknown as TableEntity;
      await saveTable(record);
      try {
        await clearTableSnapshot(tableId);
      } catch {}
      try {
        window.dispatchEvent(new CustomEvent('smart-table-updated', { detail: { tableId } }));
      } catch {}
      if (mountedRef.current) setSaveState('saved');
      return true;
    } catch (err) {
      console.warn('ArabicSheet save failed', err);
      if (mountedRef.current) setSaveState('error');
      return false;
    }
  }, [tableId]);
  const saveNowRef = useRef(saveNow);
  saveNowRef.current = saveNow;

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void saveNowRef.current();
    }, 800);
  }, []);

  // Commit bridge declared early so history/undo (below) can use it; the
  // real implementation is assigned after its own definition.
  const commitEditRef = useRef<() => void>(() => {});
  // Same bridge for the keyboard handler (defined late: it needs the
  // clipboard/fill/undo functions declared below).
  const cellKeyHandlerRef = useRef<(e: React.KeyboardEvent, r: number, c: number) => void>(() => {});
  // Same bridge for clipboard fns: onCellKeyDownImpl is declared before
  // copySelection/pasteAt, so it calls them through refs (assigned after
  // their definitions below) instead of closing over TDZ identifiers.
  const copySelectionRef = useRef<(cut: boolean) => Promise<void>>(() => Promise.resolve());
  const pasteAtRef = useRef<(r: number, c: number) => Promise<void>>(() => Promise.resolve());

  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  // Range selection: sel = active corner, anchor = fixed corner.
  const [anchor, setAnchor] = useState<{ r: number; c: number } | null>(null);
  // Undo/redo stacks live in refs (updaters must stay pure); histVer
  // re-renders the buttons' enabled state.
  const pastRef = useRef<string[]>([]);
  const futureRef = useRef<string[]>([]);
  const [histVer, setHistVer] = useState(0);
  void histVer;
  const snapOf = useCallback((): string => {
    const s = stateRef.current;
    return JSON.stringify({ cols: s.cols, rows: s.rows, formats: s.formats, merges: s.merges });
  }, []);
  const pushHistory = useCallback(() => {
    const snap = snapOf();
    const p = pastRef.current;
    if (p.length === 0 || p[p.length - 1] !== snap) {
      pastRef.current = [...p.slice(-49), snap];
      futureRef.current = [];
      setHistVer((v) => v + 1);
    }
  }, [snapOf]);
  const applySnapshot = useCallback(
    (snap: string) => {
      try {
        const s = JSON.parse(snap) as GridSnapshot;
        setCols(s.cols);
        setRows(s.rows);
        setFormats(s.formats || {});
        setMerges(s.merges || []);
        stateRef.current = { cols: s.cols, rows: s.rows, formats: s.formats || {}, merges: s.merges || [] };
        scheduleSave();
      } catch {}
    },
    [scheduleSave]
  );
  const undo = useCallback(() => {
    commitEditRef.current();
    const p = pastRef.current;
    if (p.length === 0) return;
    futureRef.current = [snapOf(), ...futureRef.current.slice(0, 49)];
    pastRef.current = p.slice(0, -1);
    setHistVer((v) => v + 1);
    applySnapshot(p[p.length - 1]);
  }, [applySnapshot, snapOf]);
  const redo = useCallback(() => {
    commitEditRef.current();
    const f = futureRef.current;
    if (f.length === 0) return;
    pastRef.current = [...pastRef.current.slice(-49), snapOf()];
    futureRef.current = f.slice(1);
    setHistVer((v) => v + 1);
    applySnapshot(f[0]);
  }, [applySnapshot, snapOf]);
  const selRef = useRef<{ r: number; c: number } | null>(null);
  const draftRef = useRef('');
  const editingRef = useRef(false);
  useEffect(() => {
    selRef.current = sel;
  }, [sel]);

  // ---- load ----
  const load = useCallback(async () => {
    if (!tableId) return;
    try {
      const { getTableById } = await import('@/lib/db-intelligence');
      const ent = (await getTableById(tableId)) as TableEntity | null;
      if (!mountedRef.current) return;
      if (ent) {
        const c: ColDef[] = Array.isArray((ent as any).columns_data) && (ent as any).columns_data.length > 0
          ? (ent as any).columns_data.slice(0, UNIVER_GRID_CAP.COLS).map((col: any, i: number) => ({
              id: typeof col?.id === 'string' && col.id ? col.id : colIndexToName(i),
              name: typeof col?.name === 'string' && col.name ? col.name.slice(0, 120) : colIndexToName(i),
              width: clampWidth(col?.width),
            }))
          : defaultCols(3, isAr);
        const r: GridRow[] = Array.isArray((ent as any).rows_data) && (ent as any).rows_data.length > 0
          ? (ent as any).rows_data.slice(0, UNIVER_GRID_CAP.ROWS).map((row: any) => {
              const out: GridRow = {};
              c.forEach((col) => {
                const v = row?.[col.id];
                out[col.id] = v === undefined || v === null ? '' : v;
              });
              return out;
            })
          : Array.from({ length: 5 }, () => Object.fromEntries(c.map((col) => [col.id, ''])) as GridRow);
        setCols(c);
        setRows(r);
        setFormats(((ent as any).cell_formats && typeof (ent as any).cell_formats === 'object' ? (ent as any).cell_formats : {}) as Record<string, CellFmt>);
        setMerges(Array.isArray((ent as any).merged_cells) ? (ent as any).merged_cells : []);
      }
    } catch (err) {
      console.warn('ArabicSheet load failed', err);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [tableId, isAr]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  // External refresh (clear-values / direction / mirror-repair / updates).
  useEffect(() => {
    const onRebuild = (e: Event) => {
      try {
        if ((e as CustomEvent)?.detail?.tableId !== tableId) return;
        commitEditRef.current();
        setLoading(true);
        void load();
      } catch {}
    };
    const onUpd = (e: Event) => {
      try {
        if ((e as CustomEvent)?.detail?.tableId !== tableId) return;
        void load();
      } catch {}
    };
    window.addEventListener('smart-table-rebuild', onRebuild);
    window.addEventListener('smart-table-updated', onUpd);
    return () => {
      window.removeEventListener('smart-table-rebuild', onRebuild);
      window.removeEventListener('smart-table-updated', onUpd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId, load]);

  // ---- editing (commitEdit assigned to the early bridge above) ----

  // Flush handshake: SmartTableView awaits pending saves before
  // direction toggle / clear / repair so no keystroke is ever lost.
  useEffect(() => {
    const onFlush = (e: Event) => {
      try {
        const detail = (e as CustomEvent)?.detail || {};
        if (detail.tableId !== tableId || !Array.isArray(detail.promises)) return;
        commitEditRef.current();
        detail.promises.push(saveNowRef.current());
      } catch {}
    };
    window.addEventListener('smart-table-flush', onFlush);
    return () => window.removeEventListener('smart-table-flush', onFlush);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId]);

  // Flush best-effort on unmount (navigation).
  useEffect(() => {
    return () => {
      try {
        if (saveTimer.current) {
          clearTimeout(saveTimer.current);
          saveTimer.current = null;
        }
        void saveNowRef.current();
      } catch {}
    };
  }, []);

  // ---- editing ----
  const display = useMemo(() => computeGridDisplay(rows, cols), [rows, cols]);

  const focusCell = useCallback(
    (r: number, c: number) => {
      const rr = Math.max(0, Math.min(rows.length - 1, r));
      const cc = Math.max(0, Math.min(cols.length - 1, c));
      setSel({ r: rr, c: cc });
      window.setTimeout(() => {
        try {
          inputRefs.current.get(`${rr}:${cc}`)?.focus({ preventScroll: false });
        } catch {}
      }, 0);
    },
    [rows.length, cols.length]
  );

  const startEdit = useCallback(
    (r: number, c: number, initial?: string) => {
      setSel({ r, c });
      const raw = rows[r]?.[cols[c]?.id];
      const v = initial !== undefined ? initial : raw === undefined || raw === null ? '' : String(raw);
      setDraft(v);
      draftRef.current = v;
      setEditing(true);
      editingRef.current = true;
    },
    [rows, cols]
  );

  const commitEdit = useCallback(() => {
    if (!editingRef.current) return;
    try {
      const s = selRef.current;
      if (s) {
        const colId = stateRef.current.cols[s.c]?.id;
        if (colId && s.r >= 0 && s.r < stateRef.current.rows.length) {
          const cur = stateRef.current.rows[s.r]?.[colId] ?? '';
          if (String(cur) !== draftRef.current) {
            pushHistory();
            const next = stateRef.current.rows.map((row, ri) =>
              ri === s.r ? { ...row, [colId]: draftRef.current } : row
            );
            setRows(next);
            stateRef.current = { ...stateRef.current, rows: next };
            scheduleSave();
          }
        }
      }
    } catch {}
    setEditing(false);
    editingRef.current = false;
  }, [scheduleSave, pushHistory]);
  commitEditRef.current = commitEdit;

  const cancelEdit = useCallback(() => {
    setEditing(false);
    editingRef.current = false;
  }, []);

  const clearRange = useCallback(() => {
    if (!sel) return;
    commitEditRef.current();
    const b = normBounds(sel, anchor || sel);
    pushHistory();
    const st = stateRef.current;
    const next = st.rows.map((row, ri) => {
      if (ri < b.r0 || ri > b.r1) return row;
      const cp = { ...row };
      for (let c = b.c0; c <= b.c1; c++) {
        const id = st.cols[c]?.id;
        if (id) cp[id] = '';
      }
      return cp;
    });
    setRows(next);
    stateRef.current = { ...stateRef.current, rows: next };
    scheduleSave();
  }, [sel, anchor, pushHistory, scheduleSave]);

  const onCellKeyDownImpl = useCallback(
    (e: React.KeyboardEvent, r: number, c: number) => {
      const lastR = rows.length - 1;
      const lastC = cols.length - 1;
      // Clipboard + undo: native inside the editor, grid-level otherwise.
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        const k = e.key.toLowerCase();
        if (editing) return;
        if (k === 'c') {
          e.preventDefault();
          void copySelectionRef.current(false);
          return;
        }
        if (k === 'x') {
          e.preventDefault();
          void copySelectionRef.current(true);
          return;
        }
        if (k === 'v') {
          e.preventDefault();
          void pasteAtRef.current(r, c);
          return;
        }
        if (k === 'z' && !e.shiftKey) {
          e.preventDefault();
          undo();
          return;
        }
        if (k === 'y' || (k === 'z' && e.shiftKey)) {
          e.preventDefault();
          redo();
          return;
        }
        return;
      }
      if (editing) {
        if (e.key === 'Enter') {
          e.preventDefault();
          commitEditRef.current();
          setAnchor(null);
          focusCell(r + 1 <= lastR ? r + 1 : r, c);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancelEdit();
        } else if (e.key === 'Tab') {
          e.preventDefault();
          commitEditRef.current();
          setAnchor(null);
          // RTL forward (Tab) travels LEFT = increasing column index.
          if (e.shiftKey) {
            if (c > 0) focusCell(r, c - 1);
            else if (r > 0) focusCell(r - 1, lastC);
          } else if (c < lastC) focusCell(r, c + 1);
          else if (r < lastR) focusCell(r + 1, 0);
        }
        return;
      }
      // Navigation (not editing): printable char starts editing with it.
      if (e.key === 'Enter') {
        e.preventDefault();
        setAnchor(null);
        startEdit(r, c);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        setAnchor(null);
        if (e.shiftKey) {
          if (c > 0) focusCell(r, c - 1);
          else if (r > 0) focusCell(r - 1, lastC);
        } else if (c < lastC) focusCell(r, c + 1);
        else if (r < lastR) focusCell(r + 1, 0);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (e.shiftKey && sel) {
          if (!anchor) setAnchor({ r, c });
          focusCell(r + 1, c);
        } else {
          setAnchor(null);
          focusCell(r + 1, c);
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (e.shiftKey && sel) {
          if (!anchor) setAnchor({ r, c });
          focusCell(r - 1, c);
        } else {
          setAnchor(null);
          focusCell(r - 1, c);
        }
      } else if (e.key === 'ArrowLeft') {
        // Visual left in RTL = next column.
        e.preventDefault();
        if (e.shiftKey && sel) {
          if (!anchor) setAnchor({ r, c });
          focusCell(r, c + 1);
        } else {
          setAnchor(null);
          focusCell(r, c + 1);
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (e.shiftKey && sel) {
          if (!anchor) setAnchor({ r, c });
          focusCell(r, c - 1);
        } else {
          setAnchor(null);
          focusCell(r, c - 1);
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        clearRange();
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        startEdit(r, c, e.key);
      }
    },
    [editing, rows.length, cols.length, focusCell, startEdit, cancelEdit, scheduleSave, sel, anchor, undo, redo, clearRange]
  );
  cellKeyHandlerRef.current = onCellKeyDownImpl;

  // ---- structure ops (Excel shift semantics via shiftGridState) ----
  const applyShifted = useCallback(
    (next: GridSnapshot) => {
      // Clamp to caps (shiftGridState never exceeds them, belt & braces).
      next.cols = next.cols.slice(0, UNIVER_GRID_CAP.COLS);
      next.rows = next.rows.slice(0, UNIVER_GRID_CAP.ROWS);
      setCols(next.cols);
      setRows(next.rows);
      setFormats(next.formats);
      setMerges(next.merges);
      stateRef.current = { cols: next.cols, rows: next.rows, formats: next.formats, merges: next.merges };
      scheduleSave();
    },
    [scheduleSave]
  );

  const addRow = useCallback(() => {
    commitEditRef.current();
    const at = sel ? Math.min(sel.r + 1, stateRef.current.rows.length) : stateRef.current.rows.length;
    if (stateRef.current.rows.length >= UNIVER_GRID_CAP.ROWS) return;
    pushHistory();
    applyShifted(shiftGridState(stateRef.current, 'row', at, 1));
    setSel({ r: at, c: sel ? sel.c : 0 });
  }, [sel, pushHistory, applyShifted]);

  const delRow = useCallback(() => {
    commitEditRef.current();
    const st = stateRef.current;
    if (st.rows.length <= 1) return;
    const at = sel ? sel.r : st.rows.length - 1;
    pushHistory();
    applyShifted(shiftGridState(st, 'row', at, -1));
    setSel({ r: Math.max(0, Math.min(at, st.rows.length - 2)), c: Math.min(sel ? sel.c : 0, st.cols.length - 1) });
    setAnchor(null);
  }, [sel, pushHistory, applyShifted]);

  const addCol = useCallback(() => {
    commitEditRef.current();
    const st = stateRef.current;
    if (st.cols.length >= UNIVER_GRID_CAP.COLS) return;
    const at = sel ? Math.min(sel.c + 1, st.cols.length) : st.cols.length;
    const used = new Set(st.cols.map((c) => c.id));
    let ni = 0;
    while (used.has(colIndexToName(ni))) ni += 1;
    const nid = colIndexToName(ni);
    pushHistory();
    applyShifted(shiftGridState(st, 'col', at, 1, { id: nid, name: nid, width: 140 }));
    setSel({ r: sel ? sel.r : 0, c: at });
  }, [sel, pushHistory, applyShifted]);

  const delCol = useCallback(() => {
    commitEditRef.current();
    const st = stateRef.current;
    if (st.cols.length <= 1) return;
    const at = sel ? sel.c : st.cols.length - 1;
    pushHistory();
    applyShifted(shiftGridState(st, 'col', at, -1));
    setSel({ r: Math.min(sel ? sel.r : 0, st.rows.length - 1), c: Math.max(0, Math.min(at, st.cols.length - 2)) });
    setAnchor(null);
  }, [sel, pushHistory, applyShifted]);

  const toggleFmt = useCallback(
    (key: 'bold' | 'italic' | 'underline') => {
      if (!sel) return;
      const b = normBounds(sel, anchor || sel);
      pushHistory();
      setFormats((prev) => {
        const next = { ...prev };
        rangeCoords(b).forEach(({ r, c }) => {
          const coord = toA1(c, r);
          const cur = next[coord] || {};
          next[coord] = { ...cur, [key]: !cur[key] };
        });
        stateRef.current = { ...stateRef.current, formats: next };
        return next;
      });
      scheduleSave();
    },
    [sel, anchor, pushHistory, scheduleSave]
  );

  const setAlign = useCallback(
    (align: 'right' | 'center' | 'left') => {
      if (!sel) return;
      const b = normBounds(sel, anchor || sel);
      pushHistory();
      setFormats((prev) => {
        const next = { ...prev };
        rangeCoords(b).forEach(({ r, c }) => {
          const coord = toA1(c, r);
          next[coord] = { ...(next[coord] || {}), align };
        });
        stateRef.current = { ...stateRef.current, formats: next };
        return next;
      });
      scheduleSave();
    },
    [sel, anchor, pushHistory, scheduleSave]
  );

  const setColor = useCallback(
    (kind: 'textColor' | 'bg', value: string) => {
      if (!sel) return;
      const b = normBounds(sel, anchor || sel);
      pushHistory();
      setFormats((prev) => {
        const next = { ...prev };
        rangeCoords(b).forEach(({ r, c }) => {
          const coord = toA1(c, r);
          next[coord] = { ...(next[coord] || {}), [kind]: value || undefined };
        });
        stateRef.current = { ...stateRef.current, formats: next };
        return next;
      });
      scheduleSave();
    },
    [sel, anchor, pushHistory, scheduleSave]
  );

  const commitHeader = useCallback(() => {
    if (headerEdit === null) return;
    const v = headerDraft.slice(0, 120);
    pushHistory();
    setCols((prev) => {
      const next = prev.map((c, i) => (i === headerEdit ? { ...c, name: v || c.id } : c));
      stateRef.current = { ...stateRef.current, cols: next };
      return next;
    });
    setHeaderEdit(null);
    scheduleSave();
  }, [headerEdit, headerDraft, pushHistory, scheduleSave]);

  // ---- merge / unmerge ----
  const mergeSelection = useCallback(() => {
    if (!sel) return;
    commitEditRef.current();
    const b = normBounds(sel, anchor || sel);
    if (b.r0 === b.r1 && b.c0 === b.c1) return;
    pushHistory();
    const st = stateRef.current;
    const start = toA1(b.c0, b.r0);
    const end = toA1(b.c1, b.r1);
    // Drop merges intersecting the new range (undoable).
    const kept = st.merges.filter((mg) => {
      const s = parseA1ToIdx(mg.start);
      const e = parseA1ToIdx(mg.end);
      if (!s || !e) return false;
      const overlap =
        Math.min(s.c, e.c) <= b.c1 && Math.max(s.c, e.c) >= b.c0 &&
        Math.min(s.r, e.r) <= b.r1 && Math.max(s.r, e.r) >= b.r0;
      return !overlap;
    });
    const next = [...kept, { start, end }];
    setMerges(next);
    stateRef.current = { ...stateRef.current, merges: next };
    scheduleSave();
  }, [sel, anchor, pushHistory, scheduleSave]);

  const unmergeSelection = useCallback(() => {
    if (!sel) return;
    commitEditRef.current();
    const b = normBounds(sel, anchor || sel);
    pushHistory();
    const st = stateRef.current;
    const next = st.merges.filter((mg) => {
      const s = parseA1ToIdx(mg.start);
      const e = parseA1ToIdx(mg.end);
      if (!s || !e) return false;
      const overlap =
        Math.min(s.c, e.c) <= b.c1 && Math.max(s.c, e.c) >= b.c0 &&
        Math.min(s.r, e.r) <= b.r1 && Math.max(s.r, e.r) >= b.r0;
      return !overlap;
    });
    setMerges(next);
    stateRef.current = { ...stateRef.current, merges: next };
    scheduleSave();
  }, [sel, anchor, pushHistory, scheduleSave]);

  // ---- clipboard (internal raw + external TSV) ----
  const internalClip = useRef<{
    raw: string[][];
    formats: Array<Array<CellFmt | undefined>>;
    h: number;
    w: number;
    srcR: number;
    srcC: number;
    text: string;
  } | null>(null);

  const rawGridByCoord = useCallback((): Record<string, any> => {
    const m: Record<string, any> = {};
    const st = stateRef.current;
    st.rows.forEach((row, r) => {
      st.cols.forEach((col, c) => {
        m[toA1(c, r)] = row[col.id];
      });
    });
    return m;
  }, []);

  const copySelection = useCallback(
    async (cut: boolean) => {
      if (!sel) return;
      commitEditRef.current();
      const b = normBounds(sel, anchor || sel);
      const st = stateRef.current;
      const raw: string[][] = [];
      const fmts: Array<Array<CellFmt | undefined>> = [];
      for (let r = b.r0; r <= b.r1; r++) {
        const rr: string[] = [];
        const fr: Array<CellFmt | undefined> = [];
        for (let c = b.c0; c <= b.c1; c++) {
          const v = st.rows[r]?.[st.cols[c]?.id];
          rr.push(v === undefined || v === null ? '' : String(v));
          fr.push(formats[toA1(c, r)]);
        }
        raw.push(rr);
        fmts.push(fr);
      }
      const text = buildTSV(display, b);
      internalClip.current = { raw, formats: fmts, h: raw.length, w: raw[0]?.length || 0, srcR: b.r0, srcC: b.c0, text };
      try {
        await navigator.clipboard.writeText(text);
      } catch {}
      if (cut && raw.length > 0) {
        pushHistory();
        const next = st.rows.map((row, ri) => {
          if (ri < b.r0 || ri > b.r1) return row;
          const cp = { ...row };
          for (let c = b.c0; c <= b.c1; c++) {
            const id = st.cols[c]?.id;
            if (id) cp[id] = '';
          }
          return cp;
        });
        setRows(next);
        stateRef.current = { ...stateRef.current, rows: next };
        scheduleSave();
      }
    },
    [sel, anchor, display, formats, pushHistory, scheduleSave]
  );

  const pasteAt = useCallback(
    async (r0: number, c0: number) => {
      commitEditRef.current();
      let text = '';
      try {
        text = await navigator.clipboard.readText();
      } catch {
        text = '';
      }
      const clip = internalClip.current;
      const st0 = stateRef.current;
      // Internal path (raw + formats + formula shift) when the clipboard
      // still holds exactly what we wrote; otherwise external TSV text.
      const useInternal = !!clip && (text === '' || text === clip.text);
      const grid: string[][] = useInternal && clip ? clip.raw : parseTSV(text);
      if (grid.length === 0) {
        if (!useInternal && clip) {
          // Clipboard unreadable: fall back to internal raw.
          return pasteInternalFallback(r0, c0);
        }
        return;
      }
      const needRows = r0 + grid.length;
      const needCols = c0 + (grid[0]?.length || 0);
      let st = st0;
      if (needRows > st.rows.length || needCols > st.cols.length) {
        pushHistory();
        const cols2 = [...st.cols];
        while (cols2.length < Math.min(needCols, UNIVER_GRID_CAP.COLS)) {
          const used = new Set(cols2.map((c) => c.id));
          let ni = 0;
          while (used.has(colIndexToName(ni))) ni += 1;
          const nid = colIndexToName(ni);
          cols2.push({ id: nid, name: nid, width: 140 });
        }
        const rows2 = st.rows.map((row) => {
          const cp = { ...row };
          cols2.forEach((col) => {
            if (!(col.id in cp)) cp[col.id] = '';
          });
          return cp;
        });
        while (rows2.length < Math.min(needRows, UNIVER_GRID_CAP.ROWS)) {
          rows2.push(Object.fromEntries(cols2.map((col) => [col.id, ''])) as GridRow);
        }
        st = { ...st, cols: cols2, rows: rows2 };
        setCols(cols2);
        setRows(rows2);
        stateRef.current = { ...stateRef.current, cols: cols2, rows: rows2 };
      } else {
        pushHistory();
      }
      const dR = useInternal && clip ? r0 - clip.srcR : 0;
      const dC = useInternal && clip ? c0 - clip.srcC : 0;
      const nextRows = st.rows.map((row) => ({ ...row }));
      const nextFormats = { ...st.formats };
      grid.forEach((line, dr) => {
        line.forEach((val, dc) => {
          const r = r0 + dr;
          const c = c0 + dc;
          if (r >= nextRows.length || c >= st.cols.length) return;
          const id = st.cols[c]?.id;
          if (!id) return;
          let v: any = val;
          if (useInternal && clip && typeof v === 'string' && v.trim().startsWith('=')) {
            v = adjustFormula(v, dR, dC);
          }
          nextRows[r][id] = v;
          if (useInternal && clip?.formats[dr]?.[dc]) {
            nextFormats[toA1(c, r)] = { ...clip.formats[dr][dc] } as CellFmt;
          }
        });
      });
      setRows(nextRows);
      setFormats(nextFormats);
      stateRef.current = { ...stateRef.current, rows: nextRows, formats: nextFormats };
      scheduleSave();
      setSel({ r: r0, c: c0 });
      setAnchor(null);
    },
    [pushHistory, scheduleSave]
  );
  // Late assignments for the keyboard-handler bridge refs above.
  copySelectionRef.current = copySelection;
  pasteAtRef.current = pasteAt;

  const pasteInternalFallback = useCallback(
    (r0: number, c0: number) => {
      const clip = internalClip.current;
      if (!clip) return;
      commitEditRef.current();
      pushHistory();
      const st = stateRef.current;
      const cols2 = [...st.cols];
      while (cols2.length < Math.min(c0 + clip.w, UNIVER_GRID_CAP.COLS)) {
        const used = new Set(cols2.map((c) => c.id));
        let ni = 0;
        while (used.has(colIndexToName(ni))) ni += 1;
        const nid = colIndexToName(ni);
        cols2.push({ id: nid, name: nid, width: 140 });
      }
      const rows2 = st.rows.map((row) => {
        const cp = { ...row };
        cols2.forEach((col) => {
          if (!(col.id in cp)) cp[col.id] = '';
        });
        return cp;
      });
      while (rows2.length < Math.min(r0 + clip.h, UNIVER_GRID_CAP.ROWS)) {
        rows2.push(Object.fromEntries(cols2.map((col) => [col.id, ''])) as GridRow);
      }
      const dR = r0 - clip.srcR;
      const dC = c0 - clip.srcC;
      const nextFormats = { ...st.formats };
      clip.raw.forEach((line, dr) => {
        line.forEach((val, dc) => {
          const r = r0 + dr;
          const c = c0 + dc;
          if (r >= rows2.length || c >= cols2.length) return;
          const id = cols2[c]?.id;
          if (!id) return;
          let v: any = val;
          if (typeof v === 'string' && v.trim().startsWith('=')) v = adjustFormula(v, dR, dC);
          rows2[r][id] = v;
          if (clip.formats[dr]?.[dc]) nextFormats[toA1(c, r)] = { ...clip.formats[dr][dc] } as CellFmt;
        });
      });
      setCols(cols2);
      setRows(rows2);
      setFormats(nextFormats);
      stateRef.current = { ...stateRef.current, cols: cols2, rows: rows2, formats: nextFormats };
      scheduleSave();
      setSel({ r: r0, c: c0 });
      setAnchor(null);
    },
    [pushHistory, scheduleSave]
  );

  // ---- fill handle (drag from selection corner) ----
  const [filling, setFilling] = useState(false);
  const fillSource = useRef<CellRange | null>(null);
  const [fillPreview, setFillPreview] = useState<CellRange | null>(null);

  const applyFill = useCallback(
    (src: CellRange, tgt: CellRange) => {
      const st = stateRef.current;
      const byCoord = rawGridByCoord();
      const a1 = (c: number, r: number) => `${colIndexToName(c)}${r + 1}`;
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
          mode: 'fill_series',
        });
        if (!res || !Array.isArray(res.changes) || res.changes.length === 0) return;
        pushHistory();
        const nextRows = st.rows.map((row) => ({ ...row }));
        // Extend grid if the fill reaches beyond current bounds.
        let maxR = nextRows.length - 1;
        res.changes.forEach((ch) => {
          const rr = ch.row - 1;
          if (rr > maxR) maxR = rr;
        });
        while (nextRows.length <= Math.min(maxR, UNIVER_GRID_CAP.ROWS - 1)) {
          nextRows.push(Object.fromEntries(st.cols.map((col) => [col.id, ''])) as GridRow);
        }
        res.changes.forEach((ch) => {
          try {
            const p = parseCellRef(`${ch.col}${ch.row}`);
            if (!p) return;
            const c = p.colIndex;
            const r = p.rowIndex;
            if (r < 0 || r >= nextRows.length || c < 0 || c >= st.cols.length) return;
            const id = st.cols[c]?.id;
            if (!id) return;
            nextRows[r][id] = ch.newValue;
          } catch {}
        });
        setRows(nextRows);
        stateRef.current = { ...stateRef.current, rows: nextRows };
        scheduleSave();
        setSel({ r: Math.min(tgt.r1, nextRows.length - 1), c: Math.min(tgt.c1, st.cols.length - 1) });
        void a1;
      } catch (err) {
        console.warn('Autofill failed', err);
      }
    },
    [pushHistory, scheduleSave, rawGridByCoord]
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

  // ---- column resize (drag header edge; RTL: drag left edge leftward widens) ----
  const resizeRef = useRef<{ ci: number; startX: number; startW: number } | null>(null);
  useEffect(() => {
    const move = (e: MouseEvent) => {
      const rz = resizeRef.current;
      if (!rz) return;
      const w = Math.min(600, Math.max(60, rz.startW + (rz.startX - e.clientX)));
      setCols((prev) => {
        const next = prev.map((c, i) => (i === rz.ci ? { ...c, width: w } : c));
        stateRef.current = { ...stateRef.current, cols: next };
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
  }, [scheduleSave]);

  // Merged ranges: render top-left with span, skip covered cells.
  const covered = useMemo(() => {
    const set = new Set<string>();
    const anchors = new Map<string, { rs: number; cs: number }>();
    const parseA1 = (a1: string): { c: number; r: number } | null => {
      const m = String(a1 || '').trim().match(/^([A-Za-z]+)(\d+)$/);
      if (!m) return null;
      let c = 0;
      for (const ch of m[1].toUpperCase()) c = c * 26 + (ch.charCodeAt(0) - 64);
      c -= 1;
      const r = parseInt(m[2], 10) - 1;
      if (c < 0 || r < 0 || c >= cols.length || r >= rows.length) return null;
      return { c, r };
    };
    merges.forEach((mg) => {
      const s = parseA1(mg.start);
      const e = parseA1(mg.end);
      if (!s || !e) return;
      const c0 = Math.min(s.c, e.c);
      const c1 = Math.max(s.c, e.c);
      const r0 = Math.min(s.r, e.r);
      const r1 = Math.max(s.r, e.r);
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
  }, [merges, cols.length, rows.length]);

  const selCoord = sel ? toA1(sel.c, sel.r) : null;
  const selRaw = sel ? String(rows[sel.r]?.[cols[sel.c]?.id] ?? '') : '';
  const bounds = sel ? normBounds(sel, anchor || sel) : null;
  const mouseDownRef = useRef(false);
  useEffect(() => {
    const up = () => {
      mouseDownRef.current = false;
    };
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, []);
  const inBounds = useCallback(
    (r: number, c: number) =>
      !!bounds && r >= bounds.r0 && r <= bounds.r1 && c >= bounds.c0 && c <= bounds.c1,
    [bounds]
  );
  const rangeLabel = bounds
    ? bounds.r0 === bounds.r1 && bounds.c0 === bounds.c1
      ? toA1(bounds.c0, bounds.r0)
      : `${toA1(bounds.c0, bounds.r0)}:${toA1(bounds.c1, bounds.r1)}`
    : '—';

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-xs text-muted-foreground">
        {isAr ? 'جاري تحميل الجدول…' : 'Loading table…'}
      </div>
    );
  }

  return (
    <div className="flex flex-col overflow-hidden bg-card" dir="rtl" lang="ar">
      {/* fx bar: cell ref + raw content (formula-aware) */}
      <div className="flex items-center gap-1.5 border-b border-border/70 bg-muted/40 px-2 py-1">
        <span className="w-10 shrink-0 rounded border border-border bg-card px-1 py-0.5 text-center font-mono text-[11px] font-bold text-foreground" dir="ltr">
          {selCoord || '—'}
        </span>
        <span className="font-mono text-[11px] font-bold italic text-muted-foreground" dir="ltr">fx</span>
        <input
          value={editing ? draft : selRaw}
          dir="auto"
          onChange={(e) => {
            if (sel && !editing) startEdit(sel.r, sel.c);
            setDraft(e.target.value);
            draftRef.current = e.target.value;
          }}
          onFocus={() => {
            if (sel && !editing) startEdit(sel.r, sel.c);
          }}
          onBlur={() => commitEditRef.current()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitEditRef.current();
            } else if (e.key === 'Escape') {
              cancelEdit();
            }
          }}
          placeholder={isAr ? 'القيمة أو معادلة تبدأ بـ =' : 'Value or =formula'}
          className="h-7 min-w-0 flex-1 rounded-md border border-border/70 bg-card px-2 text-xs text-foreground outline-none focus:border-primary"
        />
        <span
          className={cn(
            'shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px]',
            saveState === 'saved' && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
            saveState === 'saving' && 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
            saveState === 'error' && 'bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400'
          )}
        >
          {saveState === 'saved' ? (isAr ? 'محفوظ' : 'Saved') : saveState === 'saving' ? '…' : '!'}
        </span>
      </div>

      {/* grid toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-border/70 bg-muted/20 px-2 py-1">
        <span className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] font-bold text-muted-foreground" dir="ltr" title={isAr ? 'النطاق المحدد' : 'Selected range'}>
          {rangeLabel}
        </span>
        <button type="button" onClick={undo} disabled={pastRef.current.length === 0} className="h-6 rounded border border-border/70 bg-card px-1.5 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-40" title={`${isAr ? 'تراجع' : 'Undo'} (Ctrl+Z)`}>
          {isAr ? '↩ تراجع' : '↩ Undo'}
        </button>
        <button type="button" onClick={redo} disabled={futureRef.current.length === 0} className="h-6 rounded border border-border/70 bg-card px-1.5 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-40" title={`${isAr ? 'إعادة' : 'Redo'} (Ctrl+Y)`}>
          {isAr ? 'إعادة ↪' : 'Redo ↪'}
        </button>
        <span className="mx-1 h-4 w-px bg-border/70" />
        <button type="button" onClick={() => void copySelection(false)} className="h-6 rounded border border-border/70 bg-card px-1.5 text-[11px] text-muted-foreground hover:text-foreground" title={`${isAr ? 'نسخ' : 'Copy'} (Ctrl+C)`}>
          {isAr ? 'نسخ' : 'Copy'}
        </button>
        <button type="button" onClick={() => void copySelection(true)} className="h-6 rounded border border-border/70 bg-card px-1.5 text-[11px] text-muted-foreground hover:text-foreground" title={`${isAr ? 'قص' : 'Cut'} (Ctrl+X)`}>
          {isAr ? 'قص' : 'Cut'}
        </button>
        <button type="button" onClick={() => sel && void pasteAt(sel.r, sel.c)} className="h-6 rounded border border-border/70 bg-card px-1.5 text-[11px] text-muted-foreground hover:text-foreground" title={`${isAr ? 'لصق' : 'Paste'} (Ctrl+V)`}>
          {isAr ? 'لصق' : 'Paste'}
        </button>
        <span className="mx-1 h-4 w-px bg-border/70" />
        <button type="button" onClick={addRow} className="h-6 rounded border border-border/70 bg-card px-1.5 text-[11px] text-muted-foreground hover:text-foreground" title={isAr ? 'إضافة صف' : 'Add row'}>
          {isAr ? '+ صف' : '+ Row'}
        </button>
        <button type="button" onClick={delRow} className="h-6 rounded border border-border/70 bg-card px-1.5 text-[11px] text-muted-foreground hover:text-foreground" title={isAr ? 'حذف صف' : 'Delete row'}>
          {isAr ? '− صف' : '− Row'}
        </button>
        <button type="button" onClick={addCol} className="h-6 rounded border border-border/70 bg-card px-1.5 text-[11px] text-muted-foreground hover:text-foreground" title={isAr ? 'إضافة عمود' : 'Add column'}>
          {isAr ? '+ عمود' : '+ Col'}
        </button>
        <button type="button" onClick={delCol} className="h-6 rounded border border-border/70 bg-card px-1.5 text-[11px] text-muted-foreground hover:text-foreground" title={isAr ? 'حذف عمود' : 'Delete column'}>
          {isAr ? '− عمود' : '− Col'}
        </button>
        <span className="mx-1 h-4 w-px bg-border/70" />
        <button type="button" onClick={mergeSelection} className="h-6 rounded border border-border/70 bg-card px-1.5 text-[11px] text-muted-foreground hover:text-foreground" title={isAr ? 'دمج النطاق المحدد' : 'Merge selected range'}>
          {isAr ? 'دمج' : 'Merge'}
        </button>
        <button type="button" onClick={unmergeSelection} className="h-6 rounded border border-border/70 bg-card px-1.5 text-[11px] text-muted-foreground hover:text-foreground" title={isAr ? 'فك الدمج' : 'Unmerge'}>
          {isAr ? 'فك الدمج' : 'Unmerge'}
        </button>
        <span className="mx-1 h-4 w-px bg-border/70" />
        <button type="button" onClick={() => toggleFmt('bold')} className={cn('h-6 w-6 rounded border border-border/70 bg-card text-[11px] font-bold', sel && formats[toA1(sel.c, sel.r)]?.bold ? 'text-primary' : 'text-muted-foreground')} title={isAr ? 'عريض' : 'Bold'}>
          B
        </button>
        <button type="button" onClick={() => toggleFmt('italic')} className={cn('h-6 w-6 rounded border border-border/70 bg-card text-[11px] italic', sel && formats[toA1(sel.c, sel.r)]?.italic ? 'text-primary' : 'text-muted-foreground')} title={isAr ? 'مائل' : 'Italic'}>
          I
        </button>
        <button type="button" onClick={() => toggleFmt('underline')} className={cn('h-6 w-6 rounded border border-border/70 bg-card text-[11px] underline', sel && formats[toA1(sel.c, sel.r)]?.underline ? 'text-primary' : 'text-muted-foreground')} title={isAr ? 'تسطير' : 'Underline'}>
          U
        </button>
        {(['right', 'center', 'left'] as const).map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => setAlign(a)}
            className={cn('h-6 rounded border border-border/70 bg-card px-1.5 text-[11px]', sel && (formats[toA1(sel.c, sel.r)]?.align || 'right') === a ? 'text-primary font-bold' : 'text-muted-foreground')}
            title={a}
          >
            {a === 'right' ? (isAr ? 'يمين' : 'Right') : a === 'center' ? (isAr ? 'وسط' : 'Center') : (isAr ? 'يسار' : 'Left')}
          </button>
        ))}
        <label className="flex h-6 cursor-pointer items-center gap-1 rounded border border-border/70 bg-card px-1.5 text-[11px] text-muted-foreground hover:text-foreground" title={isAr ? 'لون النص' : 'Text color'}>
          <span className="inline-block h-3 w-3 rounded-sm border border-border" style={{ backgroundColor: (sel && formats[toA1(sel.c, sel.r)]?.textColor) || 'transparent' }} />
          <span>{isAr ? 'النص' : 'Text'}</span>
          <input
            type="color"
            value={(sel && formats[toA1(sel.c, sel.r)]?.textColor) || '#000000'}
            onChange={(e) => setColor('textColor', e.target.value)}
            className="h-4 w-6 cursor-pointer border-0 bg-transparent p-0"
          />
        </label>
        <label className="flex h-6 cursor-pointer items-center gap-1 rounded border border-border/70 bg-card px-1.5 text-[11px] text-muted-foreground hover:text-foreground" title={isAr ? 'لون الخلفية' : 'Background'}>
          <span className="inline-block h-3 w-3 rounded-sm border border-border" style={{ backgroundColor: (sel && formats[toA1(sel.c, sel.r)]?.bg) || 'transparent' }} />
          <span>{isAr ? 'الخلفية' : 'Fill'}</span>
          <input
            type="color"
            value={(sel && formats[toA1(sel.c, sel.r)]?.bg) || '#ffffff'}
            onChange={(e) => setColor('bg', e.target.value)}
            className="h-4 w-6 cursor-pointer border-0 bg-transparent p-0"
          />
        </label>
      </div>

      {/* grid */}
      <div className="max-h-[480px] overflow-auto" onMouseDown={(e) => e.stopPropagation()}>
        <table className="w-full border-collapse text-xs" dir="rtl">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="sticky right-0 z-10 w-10 border border-border/70 bg-muted px-1 py-1 font-mono text-[10px] text-muted-foreground">
                #
              </th>
              {cols.map((col, ci) => (
                <th
                  key={col.id}
                  style={{ minWidth: col.width, width: col.width }}
                  className="relative border border-border/70 bg-muted px-1 py-1 font-bold text-foreground"
                  onDoubleClick={() => {
                    setHeaderEdit(ci);
                    setHeaderDraft(col.name);
                  }}
                  title={isAr ? 'نقرة مزدوجة لتعديل الاسم' : 'Double-click to rename'}
                >
                  {headerEdit === ci ? (
                    <input
                      autoFocus
                      value={headerDraft}
                      dir="auto"
                      maxLength={120}
                      onChange={(e) => setHeaderDraft(e.target.value)}
                      onBlur={commitHeader}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        else if (e.key === 'Escape') setHeaderEdit(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full rounded border border-primary bg-card px-1 text-center text-[11px] outline-none"
                    />
                  ) : (
                    <span className="block truncate">{col.name}</span>
                  )}
                  {/* resize handle (RTL: left edge) */}
                  <span
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      resizeRef.current = { ci, startX: e.clientX, startW: col.width };
                    }}
                    title={isAr ? 'اسحب لتغيير العرض' : 'Drag to resize'}
                    className="absolute left-0 top-0 h-full w-2 cursor-ew-resize"
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r}>
                <td className="sticky right-0 border border-border/70 bg-muted px-1 py-1 text-center font-mono text-[10px] text-muted-foreground">
                  {r + 1}
                </td>
                {cols.map((col, c) => {
                  if (covered.covered.has(`${r}:${c}`)) return null;
                  const mgAnchor = covered.anchors.get(`${r}:${c}`);
                  const coord = toA1(c, r);
                  const fmt = formats[coord] || {};
                  const isSel = sel?.r === r && sel?.c === c;
                  const isEditingCell = isSel && editing;
                  const inRange = inBounds(r, c) && !isSel;
                  const inFill =
                    !!fillPreview &&
                    r >= fillPreview.r0 && r <= fillPreview.r1 &&
                    c >= fillPreview.c0 && c <= fillPreview.c1;
                  const raw = row[col.id];
                  const shown = isEditingCell ? draft : display[coord] ?? '';
                  const isErr = !isEditingCell && typeof raw === 'string' && raw.trim().startsWith('=') && isFormulaError(display[coord]);
                  return (
                    <td
                      key={col.id}
                      data-cell={`${r}:${c}`}
                      colSpan={mgAnchor?.cs}
                      rowSpan={mgAnchor?.rs}
                      style={{ minWidth: col.width, backgroundColor: fmt.bg || undefined }}
                      onMouseDown={(e) => {
                        if (e.button !== 0) return;
                        if (filling) return;
                        commitEditRef.current();
                        if (e.shiftKey && sel) {
                          setSel({ r, c });
                        } else {
                          setSel({ r, c });
                          setAnchor({ r, c });
                        }
                        mouseDownRef.current = true;
                      }}
                      onMouseEnter={() => {
                        if (filling && fillSource.current) {
                          const s = fillSource.current;
                          setFillPreview({
                            r0: Math.min(s.r0, s.r1, r),
                            c0: Math.min(s.c0, s.c1, c),
                            r1: Math.max(s.r0, s.r1, r),
                            c1: Math.max(s.c0, s.c1, c),
                          });
                          return;
                        }
                        if (mouseDownRef.current && !editingRef.current) {
                          setSel({ r, c });
                        }
                      }}
                      onClick={() => {
                        commitEditRef.current();
                        if (!sel || sel.r !== r || sel.c !== c) setSel({ r, c });
                      }}
                      onDoubleClick={() => startEdit(r, c)}
                      className={cn(
                        'cursor-default border border-border/70 p-0',
                        isSel ? 'relative outline outline-2 outline-primary -outline-offset-2' : '',
                        inRange ? 'bg-primary/10' : '',
                        inFill ? 'bg-emerald-500/15' : '',
                        !isSel && !inRange && !inFill && (isErr ? 'bg-red-50 dark:bg-red-950/30' : 'bg-card')
                      )}
                    >
                      <input
                        ref={(el) => {
                          if (el) inputRefs.current.set(`${r}:${c}`, el);
                          else inputRefs.current.delete(`${r}:${c}`);
                        }}
                        value={shown}
                        dir="auto"
                        readOnly={!isEditingCell}
                        onChange={(e) => {
                          setDraft(e.target.value);
                          draftRef.current = e.target.value;
                        }}
                        onFocus={() => {
                          if (!isSel) setSel({ r, c });
                        }}
                        onBlur={() => {
                          if (isEditingCell) commitEditRef.current();
                        }}
                        onKeyDown={(e) => cellKeyHandlerRef.current(e, r, c)}
                        style={{
                          textAlign: fmt.align || 'right',
                          fontWeight: fmt.bold ? 'bold' : undefined,
                          fontStyle: fmt.italic ? 'italic' : undefined,
                          textDecoration: fmt.underline ? 'underline' : undefined,
                          color: fmt.textColor || undefined,
                          backgroundColor: fmt.bg || undefined,
                        }}
                        className={cn(
                          'h-8 w-full cursor-text bg-transparent px-1.5 text-xs text-foreground outline-none',
                          isErr ? 'text-red-600 dark:text-red-400 font-mono' : ''
                        )}
                      />
                      {isSel && !isEditingCell && (
                        <span
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (!sel) return;
                            commitEditRef.current();
                            const src = normBounds(sel, anchor || sel);
                            fillSource.current = src;
                            setFillPreview(src);
                            setFilling(true);
                          }}
                          title={isAr ? 'اسحب للتعبئة التلقائية' : 'Drag to autofill'}
                          className="absolute bottom-0 left-0 z-10 h-2.5 w-2.5 translate-x-[-40%] translate-y-[40%] cursor-crosshair rounded-[2px] border border-white bg-primary"
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

