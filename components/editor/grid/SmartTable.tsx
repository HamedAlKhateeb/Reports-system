'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { TableEntity, TableColumnEntity } from '@/lib/types';
import { getTableById, saveTable } from '@/lib/db';
import {
  colIndexToName,
  colNameToIndex,
  evaluateFormula,
  adjustFormula,
  isFormulaError,
  extractFormulaRefs,
} from '@/lib/grid/formula-parser';
import {
  executeAutofill,
  AutofillMode,
} from '@/lib/grid/autofill-engine';
import {
  insertRow as opsInsertRow,
  deleteRow as opsDeleteRow,
  insertColumn as opsInsertColumn,
  deleteColumn as opsDeleteColumn,
  transposeTable as opsTranspose,
  computeReferenceInsertion,
  CellFormat,
  MergedRange,
} from '@/lib/grid/table-ops';
import {
  TABLE_LIMITS,
  safeClone,
  normalizeColumns,
  normalizeRows,
  normalizeFormats,
  normalizeMerges,
  shiftMergesOnRowChange,
  defaultTableState,
} from '@/lib/grid/table-guards';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import {
  Plus,
  Trash2,
  Undo2,
  Redo2,
  Sparkles,
  Maximize2,
  Minimize2,
  Check,
  X,
  AlertCircle,
  ChevronDown,
  ArrowRightLeft,
  ArrowLeftRight,
  Bold,
  Italic,
  Underline,
  Sigma,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/toast';

export interface SmartTableProps {
  tableId: string;
  reportId?: string;
  mode?: 'embedded-edit' | 'full-screen';
  onCloseFullScreen?: () => void;
  onNavigateToContent?: () => void;
  readOnly?: boolean;
  onDeleteNode?: () => void;
  /**
   * Where the formatting toolbar lives:
   * - 'internal' (default): the classic strip inside the component (Tables tab).
   * - 'external': hidden; formatting lives in the top EditorToolbar and arrives
   *   as addressed 'smart-table-command' events (editor-embedded usage).
   */
  toolbar?: 'internal' | 'external';
}

interface HistoryEntry {
  columns: TableColumnEntity[];
  rows: Record<string, any>[];
  cellFormats: Record<string, CellFormat>;
  mergedCells: MergedRange[];
  direction: 'rtl' | 'ltr';
  description: string;
}

interface CellPos {
  colIdx: number;
  rowIdx: number;
}

interface SelectionRect {
  c1: number;
  r1: number;
  c2: number;
  r2: number;
}

const REF_HIGHLIGHT_BG = ['#dbeafe', '#dcfce7', '#fef9c3', '#fae8ff', '#ffe4e6', '#ccfbf1'];
const REF_HIGHLIGHT_RING = ['#3b82f6', '#22c55e', '#eab308', '#a855f7', '#f43f5e', '#14b8a6'];

function coordOf(colIdx: number, rowIdx: number): string {
  return `${colIndexToName(colIdx)}${rowIdx + 1}`.toUpperCase();
}

function parseCoord(coord: string): { colIdx: number; rowIdx: number } | null {
  const m = coord.match(/^([A-Za-z]+)([0-9]+)$/);
  if (!m) return null;
  const colIdx = colNameToIndex(m[1].toUpperCase());
  const rowIdx = parseInt(m[2], 10) - 1;
  if (colIdx < 0 || rowIdx < 0) return null;
  return { colIdx, rowIdx };
}

export function SmartTable({
  tableId,
  reportId,
  mode = 'embedded-edit',
  onCloseFullScreen,
  onNavigateToContent,
  readOnly = false,
  onDeleteNode,
  toolbar = 'internal',
}: SmartTableProps) {
  const { lang } = useLanguage();
  const isAr = lang === 'ar';

  const [table, setTable] = useState<TableEntity | null>(null);
  const [columns, setColumns] = useState<TableColumnEntity[]>([]);
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [cellFormats, setCellFormats] = useState<Record<string, CellFormat>>({});
  const [mergedCells, setMergedCells] = useState<MergedRange[]>([]);
  const [direction, setDirection] = useState<'rtl' | 'ltr'>(isAr ? 'rtl' : 'ltr');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');

  // Active cell (cursor): logical indices (column index, row index)
  const [activeCell, setActiveCell] = useState<CellPos>({ colIdx: 0, rowIdx: 0 });
  const [selectionAnchor, setSelectionAnchor] = useState<CellPos | null>(null);

  // Cell editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);
  const formulaBarInputRef = useRef<HTMLInputElement>(null);

  // Range selection drag
  const [isDraggingSelection, setIsDraggingSelection] = useState(false);

  // Drag autofill state
  const [isDraggingHandle, setIsDraggingHandle] = useState(false);
  const [dragTargetRowIdx, setDragTargetRowIdx] = useState<number | null>(null);
  const [lastAutofillInfo, setLastAutofillInfo] = useState<{
    targetRowIdx: number;
    colIdx: number;
    mode: AutofillMode;
  } | null>(null);
  const [showAutofillMenu, setShowAutofillMenu] = useState(false);

  // Column resize drag
  const [resizeState, setResizeState] = useState<{
    colIdx: number;
    startX: number;
    startWidth: number;
  } | null>(null);

  // Full screen modal toggle for embedded mode
  const [isFullScreenModalOpen, setIsFullScreenModalOpen] = useState(false);

  // Undo / Redo History (component level; node-level undo is handled by TipTap)
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryEntry[]>([]);

  // Debounce save timer
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const tableRef = useRef<TableEntity | null>(null);
  const editValueRef = useRef('');
  const [tableName, setTableName] = useState(isAr ? 'جدول' : 'Table');

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    tableRef.current = table;
  }, [table]);

  useEffect(() => {
    editValueRef.current = editValue;
  }, [editValue]);

  // ---- Top-toolbar bridge: announce focus + receive formatting commands ----
  // The grid isolates its DOM events from ProseMirror (stopPropagation), so the
  // editor cannot detect "cursor in smart table" by itself. We announce it
  // explicitly; EditorToolbar shows the same formatting sub-toolbar as normal
  // tables and sends back commands addressed by tableId.
  const notifySmartActive = useCallback(() => {
    try {
      window.dispatchEvent(
        new CustomEvent('smart-table-active', {
          detail: { tableId, name: tableRef.current?.name ?? '' },
        })
      );
    } catch {}
  }, [tableId]);



  const safeActiveCell: CellPos = useMemo(() => {
    return {
      colIdx: Math.min(Math.max(activeCell.colIdx, 0), Math.max(columns.length - 1, 0)),
      rowIdx: Math.min(Math.max(activeCell.rowIdx, 0), Math.max(rows.length - 1, 0)),
    };
  }, [activeCell, columns.length, rows.length]);

  const activeColId = columns[safeActiveCell.colIdx]?.id || 'A';
  const activeCoordStr = coordOf(safeActiveCell.colIdx, safeActiveCell.rowIdx);

  // Selection rectangle in logical indices
  const selectionRect: SelectionRect | null = useMemo(() => {
    if (!selectionAnchor) return null;
    if (selectionAnchor.colIdx === safeActiveCell.colIdx && selectionAnchor.rowIdx === safeActiveCell.rowIdx) {
      return null;
    }
    return {
      c1: Math.min(selectionAnchor.colIdx, safeActiveCell.colIdx),
      r1: Math.min(selectionAnchor.rowIdx, safeActiveCell.rowIdx),
      c2: Math.max(selectionAnchor.colIdx, safeActiveCell.colIdx),
      r2: Math.max(selectionAnchor.rowIdx, safeActiveCell.rowIdx),
    };
  }, [selectionAnchor, safeActiveCell]);

  const isCellInSelection = useCallback(
    (colIdx: number, rowIdx: number) => {
      if (!selectionRect) return false;
      return (
        colIdx >= selectionRect.c1 &&
        colIdx <= selectionRect.c2 &&
        rowIdx >= selectionRect.r1 &&
        rowIdx <= selectionRect.r2
      );
    },
    [selectionRect]
  );

  // ==========================
  // LOAD TABLE ENTITY
  // ==========================
  useEffect(() => {
    let isMounted = true;
    async function load() {
      if (!tableId) {
        if (isMounted) setLoading(false);
        return;
      }
      try {
        if (isMounted) setLoading(true);
        const fetched = await getTableById(tableId);
        if (!isMounted) return;
        if (fetched) {
          // Normalize everything: a single bad payload must never crash the editor.
          const cols = normalizeColumns((fetched as any).columns_data);
          const fmt = normalizeFormats((fetched as any).cell_formats);
          const rws = normalizeRows((fetched as any).rows_data, cols);
          const merges = normalizeMerges((fetched as any).merged_cells, Math.max(cols.length, 1), Math.max(rws.length, 1));
          const dir = (fetched as any).direction === 'ltr' || (fetched as any).direction === 'rtl'
            ? (fetched as any).direction
            : isAr ? 'rtl' : 'ltr';
          const safeCols = cols.length > 0 ? cols : defaultTableState(isAr, tableId, reportId || '').columns;
          const safeRws = rws.length > 0 ? rws : defaultTableState(isAr, tableId, reportId || '').rows;
          setTable(fetched);
          tableRef.current = fetched;
          setColumns(safeCols);
          setRows(safeRws);
          setCellFormats(fmt);
          setMergedCells(merges);
          setDirection(dir);
          setTableName(typeof (fetched as any).name === 'string' && (fetched as any).name ? (fetched as any).name.slice(0, 120) : isAr ? 'جدول' : 'Table');
          setEditValue(String((safeRws[0] as any)?.[safeCols[0]?.id] ?? ''));
        } else {
          // Default template when the table entity does not exist yet
          const tpl = defaultTableState(isAr, tableId, reportId || '');
          const defaultTable: TableEntity = {
            id: tableId,
            report_id: reportId || '',
            name: isAr ? 'جدول' : 'Table',
            direction: tpl.direction,
            cell_formats: {},
            merged_cells: [],
            columns_data: tpl.columns,
            rows_data: tpl.rows,
            version: 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          if (isMounted) {
            setTable(defaultTable);
            tableRef.current = defaultTable;
            setColumns(tpl.columns);
            setRows(tpl.rows);
            setCellFormats({});
            setMergedCells([]);
            setDirection(tpl.direction);
            setTableName(defaultTable.name);
          }
          try {
            await saveTable(defaultTable);
          } catch (e) {
            console.error('Failed to persist default table:', e);
          }
        }
      } catch (e) {
        console.error('Failed to load table:', e);
        if (isMounted) {
          // Fall back to an empty-but-valid table instead of a blank crash screen.
          const tpl = defaultTableState(isAr, tableId, reportId || '');
          setColumns(tpl.columns);
          setRows(tpl.rows);
          setCellFormats({});
          setMergedCells([]);
          setDirection(tpl.direction);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    load();
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId]);

  // ==========================
  // HISTORY / PERSISTENCE
  // ==========================
  const pushHistory = useCallback(
    (
      desc: string,
      cols = columns,
      r = rows,
      f = cellFormats,
      m = mergedCells,
      d = direction
    ) => {
      try {
        const entry = {
          columns: safeClone(cols, [] as TableColumnEntity[]),
          rows: safeClone(r, [] as Record<string, any>[]),
          cellFormats: safeClone(f || {}, {} as Record<string, CellFormat>),
          mergedCells: safeClone(m || [], [] as MergedRange[]),
          direction: d,
          description: String(desc || '').slice(0, 120),
        };
        setHistory((prev) => [...prev.slice(-TABLE_LIMITS.MAX_HISTORY), entry]);
        setRedoStack([]);
      } catch (e) {
        console.error('pushHistory failed (ignored):', e);
      }
    },
    [columns, rows, cellFormats, mergedCells, direction]
  );

  const scheduleSave = useCallback(
    (
      newCols: TableColumnEntity[],
      newRows: Record<string, any>[],
      newFormats: Record<string, CellFormat>,
      newMerged: MergedRange[],
      newDir: 'rtl' | 'ltr',
      newName?: string
    ) => {
      const base = tableRef.current;
      if (!base) return;
      if (mountedRef.current) setSaveStatus('saving');
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      const snapshot = {
        cols: safeClone(newCols, [] as TableColumnEntity[]),
        rws: safeClone(newRows, [] as Record<string, any>[]),
        fmt: safeClone(newFormats, {} as Record<string, CellFormat>),
        mrg: safeClone(newMerged, [] as MergedRange[]),
        dir: newDir,
        name: typeof newName === 'string' ? newName.slice(0, 120) : base.name,
        base,
      };
      saveTimeoutRef.current = setTimeout(async () => {
        try {
          const updated: TableEntity = {
            ...snapshot.base,
            name: snapshot.name,
            columns_data: snapshot.cols.slice(0, TABLE_LIMITS.MAX_COLS),
            rows_data: snapshot.rws.slice(0, TABLE_LIMITS.MAX_ROWS),
            cell_formats: snapshot.fmt,
            merged_cells: snapshot.mrg,
            direction: snapshot.dir,
            updated_at: new Date().toISOString(),
          };
          await saveTable(updated);
          if (!mountedRef.current) return;
          tableRef.current = updated;
          setTable(updated);
          setSaveStatus('saved');
          try {
            window.dispatchEvent(new CustomEvent('smart-table-updated', { detail: { tableId: updated.id } }));
          } catch {}
        } catch (err) {
          console.error('Failed to autosave table:', err);
          if (mountedRef.current) setSaveStatus('error');
        }
      }, 650);
    },
    []
  );

  const commitChanges = useCallback(
    (
      newCols: TableColumnEntity[],
      newRows: Record<string, any>[],
      newFormats: Record<string, CellFormat> = cellFormats,
      newMerged: MergedRange[] = mergedCells,
      newDir: 'rtl' | 'ltr' = direction,
      newName?: string
    ) => {
      try {
        const cols = Array.isArray(newCols) ? newCols.slice(0, TABLE_LIMITS.MAX_COLS) : columns;
        const rws = Array.isArray(newRows) ? newRows.slice(0, TABLE_LIMITS.MAX_ROWS) : rows;
        const fmt = newFormats && typeof newFormats === 'object' ? newFormats : {};
        const mrg = normalizeMerges(
          Array.isArray(newMerged) ? newMerged : [],
          Math.max(cols.length, 1),
          Math.max(rws.length, 1)
        );
        if (mountedRef.current) {
          setColumns(cols);
          setRows(rws);
          setCellFormats(fmt);
          setMergedCells(mrg);
          setDirection(newDir);
        }
        scheduleSave(cols, rws, fmt, mrg, newDir, newName ?? tableRef.current?.name);
      } catch (e) {
        console.error('commitChanges failed (ignored):', e);
      }
    },
    [cellFormats, mergedCells, direction, scheduleSave, columns, rows]
  );

  // ==========================
  // EVALUATION ENGINE
  // ==========================
  const cellCoordMap = useMemo(() => {
    const map: Record<string, any> = {};
    try {
      if (!Array.isArray(rows) || !Array.isArray(columns)) return map;
      rows.forEach((r, rIdx) => {
        if (!r || typeof r !== 'object') return;
        const rowNum = rIdx + 1;
        columns.forEach((c) => {
          if (!c || typeof c.id !== 'string') return;
          const coord = `${c.id}${rowNum}`.toUpperCase();
          const v = (r as Record<string, any>)[c.id];
          map[coord] = v !== undefined && v !== null ? v : '';
        });
      });
    } catch (e) {
      console.error('cellCoordMap build failed (ignored):', e);
    }
    return map;
  }, [rows, columns]);

  const evaluatedMap = useMemo(() => {
    const map: Record<string, any> = {};
    try {
      Object.keys(cellCoordMap).forEach((coord) => {
        const val = cellCoordMap[coord];
        if (typeof val === 'string' && val.startsWith('=')) {
          try {
            map[coord] = evaluateFormula(val, cellCoordMap);
          } catch (err) {
            map[coord] = '#ERROR!';
          }
        } else {
          map[coord] = val;
        }
      });
    } catch (e) {
      console.error('evaluatedMap build failed (ignored):', e);
    }
    return map;
  }, [cellCoordMap]);

  const activeRawValue = rows[safeActiveCell.rowIdx]?.[activeColId] ?? '';
  const activeEvaluatedValue = evaluatedMap[activeCoordStr];
  const activeError = isFormulaError(activeEvaluatedValue) ? activeEvaluatedValue : null;

  const isFormulaMode = isEditing && editValue.trimStart().startsWith('=');

  // Formula reference highlighting with soft coordinated colors
  const formulaRefColors = useMemo(() => {
    if (!isFormulaMode) return new Map<string, { bg: string; ring: string }>();
    const refs = extractFormulaRefs(editValue);
    const map = new Map<string, { bg: string; ring: string }>();
    refs.forEach((ref, i) => {
      map.set(ref, {
        bg: REF_HIGHLIGHT_BG[i % REF_HIGHLIGHT_BG.length],
        ring: REF_HIGHLIGHT_RING[i % REF_HIGHLIGHT_RING.length],
      });
    });
    return map;
  }, [editValue, isFormulaMode]);

  // ==========================
  // MERGE HELPERS
  // ==========================
  const findMergeAt = useCallback(
    (colIdx: number, rowIdx: number): { merge: MergedRange; isStart: boolean } | null => {
      try {
        if (!Array.isArray(mergedCells)) return null;
        for (const m of mergedCells) {
          if (!m || typeof m.start !== 'string' || typeof m.end !== 'string') continue;
          let s: { colIdx: number; rowIdx: number } | null = null;
          let e: { colIdx: number; rowIdx: number } | null = null;
          try {
            s = parseCoord(m.start);
            e = parseCoord(m.end);
          } catch {
            continue;
          }
          if (!s || !e) continue;
          const c1 = Math.min(s.colIdx, e.colIdx);
          const c2 = Math.max(s.colIdx, e.colIdx);
          const r1 = Math.min(s.rowIdx, e.rowIdx);
          const r2 = Math.max(s.rowIdx, e.rowIdx);
          if (colIdx >= c1 && colIdx <= c2 && rowIdx >= r1 && rowIdx <= r2) {
            return { merge: m, isStart: colIdx === s.colIdx && rowIdx === s.rowIdx };
          }
        }
      } catch {
        return null;
      }
      return null;
    },
    [mergedCells]
  );

  const isCellCoveredByMerge = useCallback(
    (colIdx: number, rowIdx: number) => {
      const found = findMergeAt(colIdx, rowIdx);
      return found !== null && !found.isStart;
    },
    [findMergeAt]
  );

  /** Drops merges that no longer fit the given dimensions (structural safety). */
  const pruneMerges = useCallback(
    (merges: MergedRange[], colCount: number, rowCount: number): MergedRange[] => {
      try {
        return normalizeMerges(merges, colCount, rowCount);
      } catch {
        return [];
      }
    },
    []
  );

  // ==========================
  // CELL INTERACTION
  // ==========================
  const getFormulaInput = (): HTMLInputElement | null => {
    if (document.activeElement === editInputRef.current) return editInputRef.current;
    if (document.activeElement === formulaBarInputRef.current) return formulaBarInputRef.current;
    return formulaBarInputRef.current;
  };

  /**
   * Inserts a clicked cell reference into the formula being edited.
   * Context-aware: inside function args -> auto comma separator;
   * arithmetic without operator -> ignored (never produces "=C2D2").
   */
  const insertFormulaReference = (colIdx: number, rowIdx: number) => {
    const input = getFormulaInput();
    const coord = coordOf(colIdx, rowIdx);
    const start = input?.selectionStart ?? editValue.length;
    const end = input?.selectionEnd ?? start;

    const { insert } = computeReferenceInsertion(editValue, start);
    const piece = insert(coord);
    if (!piece) {
      // Ambiguous arithmetic position: ignore the click so the formula is never broken.
      return;
    }

    const next = `${editValue.slice(0, start)}${piece}${editValue.slice(end)}`;
    setEditValue(next);

    requestAnimationFrame(() => {
      input?.focus();
      const cursor = start + piece.length;
      input?.setSelectionRange(cursor, cursor);
    });
  };

  const handleSelectCell = (
    colIdx: number,
    rowIdx: number,
    opts?: { extendSelection?: boolean; fromDrag?: boolean }
  ) => {
    if (isEditing && editValue.trimStart().startsWith('=')) {
      insertFormulaReference(colIdx, rowIdx);
      return;
    }
    if (isEditing) {
      commitCellEdit();
    }
    if (opts?.extendSelection || isDraggingSelection) {
      setActiveCell({ colIdx, rowIdx });
      setSelectionAnchor((prev) => prev ?? { colIdx, rowIdx });
      return;
    }
    setActiveCell({ colIdx, rowIdx });
    setSelectionAnchor(null);
    setEditValue(String(rows[rowIdx]?.[columns[colIdx]?.id] ?? ''));
    setShowAutofillMenu(false);
  };

  const startEditing = (initialVal?: string) => {
    if (readOnly) return;
    setIsEditing(true);
    const raw = rows[safeActiveCell.rowIdx]?.[activeColId];
    const val = initialVal !== undefined ? initialVal : String(raw ?? '');
    setEditValue(val);
    setTimeout(() => {
      editInputRef.current?.focus();
      if (initialVal === undefined) editInputRef.current?.select();
    }, 10);
  };

  const commitCellEdit = useCallback((): Record<string, any>[] | null => {
    try {
      if (!mountedRef.current) return null;
      setIsEditing(false);
      const pending = editValueRef.current;
      const row = rows[safeActiveCell.rowIdx];
      const currentVal = row && typeof row === 'object' ? (row as any)[activeColId] : undefined;
      if (currentVal === pending) return rows;
      if (typeof pending === 'string' && pending.length > 10000) {
        toast.error(isAr ? 'النص طويل جداً (الحد 10000 حرف)' : 'Text too long (max 10000 chars)');
        return null;
      }

      pushHistory(`Edit ${activeCoordStr}`);
      const newRows = rows.map((r, i) =>
        i === safeActiveCell.rowIdx ? { ...(r || {}), [activeColId]: pending } : r
      );
      commitChanges(columns, newRows);
      return newRows;
    } catch (e) {
      console.error('commitCellEdit failed (ignored):', e);
      if (mountedRef.current) setIsEditing(false);
      return null;
    }
  }, [rows, safeActiveCell, activeColId, activeCoordStr, pushHistory, commitChanges, isAr]);

  const cancelCellEdit = () => {
    setIsEditing(false);
    setEditValue(String(rows[safeActiveCell.rowIdx]?.[activeColId] ?? ''));
  };

  // Keeps the draft mirrored to the active cell while NOT editing, so
  // programmatic navigation (Tab/Enter/arrows) never commits a stale draft
  // into the newly focused cell.
  useEffect(() => {
    if (isEditing || !mountedRef.current) return;
    try {
      const raw = rows[safeActiveCell.rowIdx]?.[columns[safeActiveCell.colIdx]?.id] ?? '';
      const next = String(raw ?? '');
      if (next !== editValueRef.current) setEditValue(next);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeActiveCell.colIdx, safeActiveCell.rowIdx, isEditing, rows, columns]);

  // ==========================
  // UNDO / REDO
  // ==========================
  const snapshotCurrent = (): HistoryEntry => ({
    columns: safeClone(columns, [] as TableColumnEntity[]),
    rows: safeClone(rows, [] as Record<string, any>[]),
    cellFormats: safeClone(cellFormats || {}, {} as Record<string, CellFormat>),
    mergedCells: safeClone(mergedCells || [], [] as MergedRange[]),
    direction,
    description: 'Current State',
  });

  const handleUndo = useCallback(() => {
    if (history.length === 0 || readOnly) return;
    const last = history[history.length - 1];
    setHistory((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, snapshotCurrent()]);
    commitChanges(
      last.columns,
      last.rows,
      last.cellFormats || {},
      last.mergedCells || [],
      last.direction || (isAr ? 'rtl' : 'ltr')
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, readOnly, columns, rows, cellFormats, mergedCells, direction, commitChanges, isAr]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0 || readOnly) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));
    setHistory((prev) => [...prev, snapshotCurrent()]);
    commitChanges(
      next.columns,
      next.rows,
      next.cellFormats || {},
      next.mergedCells || [],
      next.direction || (isAr ? 'rtl' : 'ltr')
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [redoStack, readOnly, columns, rows, cellFormats, mergedCells, direction, commitChanges, isAr]);

  // ==========================
  // DIRECTION (RTL / LTR)
  // ==========================
  const handleToggleDirection = () => {
    if (readOnly) return;
    const nextDir = direction === 'rtl' ? 'ltr' : 'rtl';
    pushHistory(`Change direction to ${nextDir}`);
    commitChanges(columns, rows, cellFormats, mergedCells, nextDir);
    toast.success(
      nextDir === 'rtl'
        ? isAr
          ? 'تم تحويل اتجاه الجدول إلى اليمين (RTL)'
          : 'Direction set to RTL'
        : isAr
          ? 'تم تحويل اتجاه الجدول إلى اليسار (LTR)'
          : 'Direction set to LTR'
    );
  };

  // ==========================
  // FORMATTING (applies to whole selection)
  // ==========================
  const forEachSelectionCoord = (fn: (colIdx: number, rowIdx: number) => void) => {
    const c1 = selectionRect ? selectionRect.c1 : safeActiveCell.colIdx;
    const c2 = selectionRect ? selectionRect.c2 : safeActiveCell.colIdx;
    const r1 = selectionRect ? selectionRect.r1 : safeActiveCell.rowIdx;
    const r2 = selectionRect ? selectionRect.r2 : safeActiveCell.rowIdx;
    for (let c = c1; c <= c2; c++) {
      for (let r = r1; r <= r2; r++) {
        fn(c, r);
      }
    }
  };

  const handleSetCellsAlignment = (align: 'left' | 'center' | 'right' | 'justify') => {
    if (readOnly) return;
    pushHistory(`Align selection ${align}`);
    const updated = { ...cellFormats };
    forEachSelectionCoord((c, r) => {
      const coord = coordOf(c, r);
      updated[coord] = { ...updated[coord], align, horizontalAlign: align };
    });
    commitChanges(columns, rows, updated, mergedCells, direction);
  };

  const handleToggleCellsStyle = (style: 'bold' | 'italic' | 'underline') => {
    if (readOnly) return;
    pushHistory(`Toggle ${style} on selection`);
    const updated = { ...cellFormats };
    // Current state of the anchor cell decides whether we are switching on or off
    const activeFmt = cellFormats[activeCoordStr];
    const enable = !activeFmt?.[style];
    forEachSelectionCoord((c, r) => {
      const coord = coordOf(c, r);
      const fmt = { ...updated[coord] };
      if (enable) fmt[style] = true;
      else delete fmt[style];
      if (Object.keys(fmt).length === 0) delete updated[coord];
      else updated[coord] = fmt;
    });
    commitChanges(columns, rows, updated, mergedCells, direction);
  };

  // ==========================
  // MERGE / UNMERGE
  // ==========================
  const handleToggleMerge = () => {
    if (readOnly) return;
    const existing = findMergeAt(safeActiveCell.colIdx, safeActiveCell.rowIdx);
    if (existing) {
      pushHistory(`Unmerge at ${activeCoordStr}`);
      const updated = mergedCells.filter((m) => m !== existing.merge);
      commitChanges(columns, rows, cellFormats, updated, direction);
      toast.success(isAr ? 'تم إلغاء دمج الخلايا' : 'Cells unmerged');
      return;
    }

    const rect = selectionRect;
    if (!rect) {
      toast.info(
        isAr
          ? 'حدد نطاق خلايا أولاً (اسحب الفأرة أو Shift+نقرة) ثم ادمج'
          : 'Select a range first (drag or Shift+Click), then merge'
      );
      return;
    }

    const w = rect.c2 - rect.c1 + 1;
    const h = rect.r2 - rect.r1 + 1;
    if (w * h < 2) {
      toast.info(isAr ? 'لا يمكن دمج خلية واحدة' : 'Cannot merge a single cell');
      return;
    }

    // Refuse overlap with existing merges
    for (let c = rect.c1; c <= rect.c2; c++) {
      for (let r = rect.r1; r <= rect.r2; r++) {
        if (findMergeAt(c, r)) {
          toast.error(
            isAr ? 'يتقاطع النطاق المحدد مع دمج قائم' : 'Selection overlaps an existing merge'
          );
          return;
        }
      }
    }

    const start = coordOf(rect.c1, rect.r1);
    const end = coordOf(rect.c2, rect.r2);
    pushHistory(`Merge ${start}:${end}`);
    const updated: MergedRange[] = [
      ...mergedCells,
      { start, end, colSpan: w, rowSpan: h },
    ];
    commitChanges(columns, rows, cellFormats, updated, direction);
    toast.success(isAr ? `تم دمج ${start}:${end}` : `Merged ${start}:${end}`);
    setSelectionAnchor(null);
  };

  const isCurrentCellMerged = useMemo(
    () => findMergeAt(safeActiveCell.colIdx, safeActiveCell.rowIdx) !== null,
    [findMergeAt, safeActiveCell]
  );

  // ==========================
  // TRANSPOSE
  // ==========================
  const handleTranspose = () => {
    if (readOnly || rows.length === 0 || columns.length === 0) return;
    pushHistory('Transpose Table');
    const next = opsTranspose({ columns, rows, cellFormats, mergedCells });
    // Clamp cursor into the new dimensions
    setActiveCell({
      colIdx: Math.min(safeActiveCell.rowIdx, next.columns.length - 1),
      rowIdx: Math.min(safeActiveCell.colIdx, next.rows.length - 1),
    });
    setSelectionAnchor(null);
    commitChanges(next.columns, next.rows, next.cellFormats, next.mergedCells, direction);
    toast.success(
      isAr ? 'تم قلب أبعاد الجدول بنجاح مع تحديث مراجع الصيغ' : 'Table transposed with formula references remapped'
    );
  };

  // ==========================
  // STRUCTURAL OPS (precise position)
  // ==========================
  const handleInsertRow = (position: 'above' | 'below' | 'end') => {
    if (readOnly) return;
    try {
      if (rows.length >= TABLE_LIMITS.MAX_ROWS) {
        toast.error(isAr ? `الحد الأقصى ${TABLE_LIMITS.MAX_ROWS} صف` : `Max ${TABLE_LIMITS.MAX_ROWS} rows`);
        return;
      }
      const idx = position === 'end' ? rows.length : position === 'above' ? safeActiveCell.rowIdx : safeActiveCell.rowIdx + 1;
      pushHistory(`Insert row at ${idx + 1}`);
      const next = opsInsertRow({ columns, rows, cellFormats, mergedCells }, idx);
      commitChanges(next.columns, next.rows, next.cellFormats, pruneMerges(next.mergedCells, next.columns.length, next.rows.length), direction);
      setActiveCell({ colIdx: safeActiveCell.colIdx, rowIdx: Math.min(idx, next.rows.length - 1) });
      setSelectionAnchor(null);
    } catch (err) {
      console.error('Insert row failed (ignored):', err);
    }
  };

  const handleDeleteRow = (rowIdx?: number) => {
    if (readOnly || rows.length <= 1) return;
    const idx = rowIdx !== undefined ? rowIdx : safeActiveCell.rowIdx;
    pushHistory(`Delete row ${idx + 1}`);
    const next = opsDeleteRow({ columns, rows, cellFormats, mergedCells }, idx);
    commitChanges(next.columns, next.rows, next.cellFormats, pruneMerges(next.mergedCells, next.columns.length, next.rows.length), direction);
    setActiveCell({
      colIdx: safeActiveCell.colIdx,
      rowIdx: Math.min(safeActiveCell.rowIdx, next.rows.length - 1),
    });
    setSelectionAnchor(null);
  };

  const handleInsertColumn = (position: 'before' | 'after' | 'end') => {
    if (readOnly) return;
    try {
      if (columns.length >= TABLE_LIMITS.MAX_COLS) {
        toast.error(isAr ? `الحد الأقصى ${TABLE_LIMITS.MAX_COLS} عمود` : `Max ${TABLE_LIMITS.MAX_COLS} columns`);
        return;
      }
      const idx = position === 'end' ? columns.length : position === 'before' ? safeActiveCell.colIdx : safeActiveCell.colIdx + 1;
      pushHistory(`Insert column at ${idx + 1}`);
      const next = opsInsertColumn(
        { columns, rows, cellFormats, mergedCells },
        idx,
        isAr ? 'عمود' : 'Column',
        'Column'
      );
      commitChanges(next.columns, next.rows, next.cellFormats, pruneMerges(next.mergedCells, next.columns.length, next.rows.length), direction);
      setActiveCell({ colIdx: Math.min(idx, next.columns.length - 1), rowIdx: safeActiveCell.rowIdx });
      setSelectionAnchor(null);
    } catch (err) {
      console.error('Insert column failed (ignored):', err);
    }
  };

  const handleDeleteColumn = (colIdx?: number) => {
    if (readOnly || columns.length <= 1) return;
    const idx = colIdx !== undefined ? colIdx : safeActiveCell.colIdx;
    pushHistory(`Delete column ${idx + 1}`);
    const next = opsDeleteColumn({ columns, rows, cellFormats, mergedCells }, idx);
    commitChanges(next.columns, next.rows, next.cellFormats, pruneMerges(next.mergedCells, next.columns.length, next.rows.length), direction);
    setActiveCell({
      colIdx: Math.min(safeActiveCell.colIdx, next.columns.length - 1),
      rowIdx: safeActiveCell.rowIdx,
    });
    setSelectionAnchor(null);
  };

  // ==========================
  // TABLE DELETION
  // ==========================
  const handleRequestDelete = () => {
    if (!onDeleteNode) {
      toast.error(isAr ? 'خاصية حذف العقدة غير متاحة' : 'Delete node not available');
      return;
    }
    const hasData = rows.some((row) =>
      columns.some((col) => {
        const val = row?.[col.id];
        return val !== undefined && val !== null && String(val).trim() !== '';
      })
    );
    if (hasData) {
      setShowDeleteConfirm(true);
    } else {
      executeDeleteTableNode();
    }
  };

  const executeDeleteTableNode = () => {
    setShowDeleteConfirm(false);
    if (onDeleteNode) {
      onDeleteNode();
      toast.success(
        isAr
          ? 'تم حذف الجدول من التقرير (يمكن التراجع بـ Ctrl+Z)'
          : 'Table deleted from report (Press Ctrl+Z to undo)'
      );
    }
  };

  // Defined after pushHistory/scheduleSave/commitChanges (uses them at call time).
  const commitTableName = useCallback(
    (nextRaw: string) => {
      if (readOnly) return;
      const next = String(nextRaw ?? '').slice(0, 120);
      const base = tableRef.current;
      if (!base || base.name === next) return;
      try {
        pushHistory('Rename table');
        const updated = { ...base, name: next };
        tableRef.current = updated;
        if (mountedRef.current) {
          setTable(updated);
          setTableName(next);
        }
        scheduleSave(columns, rows, cellFormats, mergedCells, direction, next);
        notifySmartActive();
      } catch (err) {
        console.error('Rename failed (ignored):', err);
      }
    },
    [readOnly, pushHistory, scheduleSave, columns, rows, cellFormats, mergedCells, direction, notifySmartActive]
  );

  // Receives formatting commands from the top EditorToolbar sub-toolbar.
  // Events carry a tableId so only the focused instance reacts (multi-table safe).
  const topCommandRef = useRef<{ [k: string]: (...a: any[]) => void }>({});
  topCommandRef.current = {
    'insert-row-above': () => handleInsertRow('above'),
    'insert-row-below': () => handleInsertRow('below'),
    'insert-row-end': () => handleInsertRow('end'),
    'delete-row': () => handleDeleteRow(),
    'insert-col-before': () => handleInsertColumn('before'),
    'insert-col-after': () => handleInsertColumn('after'),
    'insert-col-end': () => handleInsertColumn('end'),
    'delete-col': () => handleDeleteColumn(),
    merge: () => handleToggleMerge(),
    'delete-table': () => handleRequestDelete(),
    undo: () => handleUndo(),
    redo: () => handleRedo(),
    'toggle-direction': () => handleToggleDirection(),
    transpose: () => handleTranspose(),
    fullscreen: () => {
      if (mountedRef.current) setIsFullScreenModalOpen((v) => !v);
    },
    'align-left': () => handleSetCellsAlignment('left'),
    'align-center': () => handleSetCellsAlignment('center'),
    'align-right': () => handleSetCellsAlignment('right'),
    'align-justify': () => handleSetCellsAlignment('justify'),
    'style-bold': () => handleToggleCellsStyle('bold'),
    'style-italic': () => handleToggleCellsStyle('italic'),
    'style-underline': () => handleToggleCellsStyle('underline'),
    rename: (value?: unknown) => commitTableName(String(value ?? '')),
  };

  useEffect(() => {
    const onTopCommand = (e: Event) => {
      try {
        const d = (e as CustomEvent)?.detail || {};
        if (!d || d.tableId !== tableId || typeof d.command !== 'string') return;
        if (readOnly && d.command !== 'fullscreen') return;
        const fn = topCommandRef.current[d.command];
        if (fn) fn((d as any).value);
      } catch (err) {
        console.error('SmartTable top command failed (ignored):', err);
      }
    };
    window.addEventListener('smart-table-command', onTopCommand);
    return () => window.removeEventListener('smart-table-command', onTopCommand);
  }, [tableId, readOnly]);

  // ==========================
  // COPY / PASTE
  // ==========================
  const handleCopyCell = () => {
    const raw = String(rows[safeActiveCell.rowIdx]?.[activeColId] ?? '');
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(raw);
      toast.success(isAr ? `تم نسخ الخلية ${activeCoordStr}` : `Copied cell ${activeCoordStr}`);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    if (readOnly) return;
    let text = '';
    try {
      text = e.clipboardData.getData('text/plain');
    } catch {
      return;
    }
    if (!text) return;
    // Single-cell paste into an active edit is handled by the input itself.
    if (isEditing && !text.includes('\t') && !text.includes('\n')) return;

    if (text.includes('\t') || text.includes('\n')) {
      e.preventDefault();
      e.stopPropagation();
      try {
        // Hard caps: pasting a whole spreadsheet must never freeze the editor.
        const lines = text.split(/\r?\n/).filter((l) => l.length > 0).slice(0, 50);
        if (lines.length === 0) return;
        const cellCount = lines.reduce((n, l) => n + l.split('\t').length, 0);
        if (cellCount > TABLE_LIMITS.MAX_CELLS_PASTE) {
          toast.error(isAr ? 'البيانات الملصقة كبيرة جداً (الحد 2000 خلية)' : 'Pasted data too large (max 2000 cells)');
          return;
        }
        pushHistory('Paste Range');

        const startColIdx = safeActiveCell.colIdx;
        const startRowIdx = safeActiveCell.rowIdx;

        let newCols = [...columns];
        let newRows = [...rows];

        lines.forEach((line, rOffset) => {
          const targetRow = startRowIdx + rOffset;
          if (targetRow >= TABLE_LIMITS.MAX_ROWS) return;
          while (targetRow >= newRows.length) {
            const emptyRow: Record<string, any> = {};
            newCols.forEach((c) => (emptyRow[c.id] = ''));
            newRows.push(emptyRow);
          }

          const values = line.split('\t').slice(0, 20);
          values.forEach((val, cOffset) => {
            const targetColIdx = startColIdx + cOffset;
            if (targetColIdx >= TABLE_LIMITS.MAX_COLS) return;
            while (targetColIdx >= newCols.length) {
              const nextLetter = colIndexToName(newCols.length);
              newCols.push({
                id: nextLetter,
                name: nextLetter,
                type: 'text',
                width: 130,
              });
              newRows = newRows.map((r) => ({ ...(r || {}), [nextLetter]: '' }));
            }

            const colId = newCols[targetColIdx]?.id;
            if (!colId) return;
            newRows[targetRow] = {
              ...(newRows[targetRow] || {}),
              [colId]: String(val ?? '').trim().slice(0, 10000),
            };
          });
        });

        commitChanges(newCols, newRows, cellFormats, pruneMerges(mergedCells, newCols.length, newRows.length), direction);
        toast.success(isAr ? 'تم لصق البيانات المجدولة بنجاح' : 'Pasted tabular data successfully');
      } catch (err) {
        console.error('Paste failed (ignored):', err);
      }
    }
  };

  // ==========================
  // KEYBOARD NAVIGATION
  // ==========================
  const moveCursor = (dCol: number, dRow: number, extend?: boolean) => {
    if (columns.length === 0 || rows.length === 0) return;
    const nextCol = Math.min(Math.max(safeActiveCell.colIdx + dCol, 0), columns.length - 1);
    const nextRow = Math.min(Math.max(safeActiveCell.rowIdx + dRow, 0), rows.length - 1);
    if (extend) {
      setSelectionAnchor((prev) => prev ?? { ...safeActiveCell });
    } else {
      setSelectionAnchor(null);
    }
    setActiveCell({ colIdx: nextCol, rowIdx: nextRow });
  };

  /** Appends a row at the end from the given rows (Tab on the last cell, like normal tables). */
  const appendRowFrom = (baseRows: Record<string, any>[]) => {
    if (readOnly) return;
    try {
      if (baseRows.length >= TABLE_LIMITS.MAX_ROWS) {
        toast.error(isAr ? `الحد الأقصى ${TABLE_LIMITS.MAX_ROWS} صف` : `Max ${TABLE_LIMITS.MAX_ROWS} rows`);
        return;
      }
      pushHistory('Add row on Tab');
      const next = opsInsertRow({ columns, rows: baseRows, cellFormats, mergedCells }, baseRows.length);
      commitChanges(next.columns, next.rows, next.cellFormats, pruneMerges(next.mergedCells, next.columns.length, next.rows.length), direction);
      if (mountedRef.current) {
        setActiveCell({ colIdx: 0, rowIdx: next.rows.length - 1 });
        setSelectionAnchor(null);
      }
    } catch (err) {
      console.error('Append row on Tab failed (ignored):', err);
    }
  };

  /** Tab while editing: commit first, then move exactly like a normal table. */
  const handleTabKey = (shiftKey: boolean) => {
    if (readOnly || columns.length === 0 || rows.length === 0) return;
    const committed = commitCellEdit() || rows;
    const cIdx = safeActiveCell.colIdx;
    const rIdx = safeActiveCell.rowIdx;
    if (shiftKey) {
      if (cIdx > 0) setActiveCell({ colIdx: cIdx - 1, rowIdx: rIdx });
      else if (rIdx > 0) setActiveCell({ colIdx: columns.length - 1, rowIdx: rIdx - 1 });
    } else if (cIdx < columns.length - 1) {
      setActiveCell({ colIdx: cIdx + 1, rowIdx: rIdx });
    } else if (rIdx < committed.length - 1) {
      setActiveCell({ colIdx: 0, rowIdx: rIdx + 1 });
    } else {
      appendRowFrom(committed);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Isolate from ProseMirror/TipTap: keys inside the smart table must never
    // delete the node, split the doc, or trigger editor shortcuts.
    try {
      e.stopPropagation();
    } catch {}
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) handleRedo();
      else handleUndo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
      e.preventDefault();
      handleRedo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && !isEditing) {
      e.preventDefault();
      handleCopyCell();
      return;
    }

    if (isEditing) {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitCellEdit();
        if (safeActiveCell.rowIdx < rows.length - 1) {
          setActiveCell((prev) => ({ ...prev, rowIdx: prev.rowIdx + 1 }));
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelCellEdit();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        handleTabKey(e.shiftKey);
      }
      return;
    }

    if (rows.length === 0 || columns.length === 0) return;

    // In RTL the visual arrow semantics invert so navigation stays intuitive
    const rtlFactor = direction === 'rtl' ? -1 : 1;

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveCursor(0, -1, e.shiftKey);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveCursor(0, 1, e.shiftKey);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      moveCursor(-1 * rtlFactor, 0, e.shiftKey);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      moveCursor(1 * rtlFactor, 0, e.shiftKey);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setSelectionAnchor(null);
      setActiveCell({ colIdx: 0, rowIdx: safeActiveCell.rowIdx });
    } else if (e.key === 'End') {
      e.preventDefault();
      setSelectionAnchor(null);
      setActiveCell({ colIdx: columns.length - 1, rowIdx: safeActiveCell.rowIdx });
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (readOnly) return;
      const cIdx = safeActiveCell.colIdx;
      const rIdx = safeActiveCell.rowIdx;
      if (e.shiftKey) {
        if (cIdx > 0) setActiveCell({ colIdx: cIdx - 1, rowIdx: rIdx });
        else if (rIdx > 0) setActiveCell({ colIdx: columns.length - 1, rowIdx: rIdx - 1 });
      } else if (cIdx < columns.length - 1) {
        setActiveCell({ colIdx: cIdx + 1, rowIdx: rIdx });
      } else if (rIdx < rows.length - 1) {
        setActiveCell({ colIdx: 0, rowIdx: rIdx + 1 });
      } else {
        // Last cell: like normal tables, Tab appends a fresh row.
        appendRowFrom(rows);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      startEditing();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      if (readOnly) return;
      pushHistory('Clear selection');
      const newRows = rows.map((r, i) => {
        const inRow =
          !selectionRect ||
          (i >= selectionRect.r1 && i <= selectionRect.r2);
        if (!inRow) return r;
        const copy = { ...r };
        forEachSelectionCoord((c) => {
          copy[columns[c].id] = '';
        });
        return copy;
      });
      commitChanges(columns, newRows);
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      startEditing(e.key);
    }
  };

  // ==========================
  // AUTOFILL
  // ==========================
  const handleMouseDownOnHandle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (readOnly) return;
    setIsDraggingHandle(true);
    setDragTargetRowIdx(safeActiveCell.rowIdx);
  };

  const handleMouseEnterCellDuringDrag = (rowIdx: number) => {
    if (isDraggingHandle) {
      setDragTargetRowIdx(rowIdx);
    }
  };

  const applyAutofillOperation = (
    colIdx: number,
    sourceRowIdx: number,
    targetRowIdx: number,
    autofillMode: AutofillMode
  ) => {
    const col = columns[colIdx];
    if (!col) return;
    pushHistory(`Autofill ${col.id}${sourceRowIdx + 1}:${col.id}${targetRowIdx + 1}`);

    const res = executeAutofill({
      sourceRange: {
        startCol: col.id,
        startRow: sourceRowIdx + 1,
        endCol: col.id,
        endRow: sourceRowIdx + 1,
      },
      targetRange: {
        startCol: col.id,
        startRow: sourceRowIdx + 1,
        endCol: col.id,
        endRow: targetRowIdx + 1,
      },
      currentGridData: cellCoordMap,
      mode: autofillMode,
    });

    const newRows = rows.map((r, rIdx) => {
      const updatedRow = { ...(r || {}) };
      const coord = `${col.id}${rIdx + 1}`.toUpperCase();
      if (res.newCells[coord] !== undefined) {
        updatedRow[col.id] = res.newCells[coord];
      }
      return updatedRow;
    });

    // Carry the source cell's formatting (align/position, bold, italic,
    // underline) onto every filled cell — like Excel's fill behavior.
    const updatedFormats = { ...cellFormats };
    try {
      const sourceCoord = `${col.id}${sourceRowIdx + 1}`.toUpperCase();
      const sourceFmt = cellFormats[sourceCoord];
      const rStart = Math.min(sourceRowIdx, targetRowIdx);
      const rEnd = Math.max(sourceRowIdx, targetRowIdx);
      for (let r = rStart; r <= rEnd; r++) {
        if (r === sourceRowIdx) continue;
        const coord = `${col.id}${r + 1}`.toUpperCase();
        if (res.newCells[coord] === undefined) continue;
        if (sourceFmt) updatedFormats[coord] = safeClone(sourceFmt, {});
        else delete updatedFormats[coord];
      }
    } catch (e) {
      console.error('Autofill format carry failed (ignored):', e);
    }

    commitChanges(columns, newRows, updatedFormats);
  };

  const handleMouseUpAfterDrag = useCallback(() => {
    if (!isDraggingHandle || dragTargetRowIdx === null) {
      setIsDraggingHandle(false);
      setDragTargetRowIdx(null);
      return;
    }

    const startR = safeActiveCell.rowIdx;
    const endR = dragTargetRowIdx;
    setIsDraggingHandle(false);
    setDragTargetRowIdx(null);

    if (startR === endR || readOnly) return;

    applyAutofillOperation(safeActiveCell.colIdx, startR, endR, 'fill_series');

    setLastAutofillInfo({
      targetRowIdx: endR,
      colIdx: safeActiveCell.colIdx,
      mode: 'fill_series',
    });
    setShowAutofillMenu(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDraggingHandle, dragTargetRowIdx, safeActiveCell, readOnly, rows, columns, cellCoordMap]);

  const handleChangeAutofillMode = (newMode: AutofillMode) => {
    if (!lastAutofillInfo) return;
    handleUndo();
    applyAutofillOperation(
      lastAutofillInfo.colIdx,
      safeActiveCell.rowIdx,
      lastAutofillInfo.targetRowIdx,
      newMode
    );
    setLastAutofillInfo((prev) => (prev ? { ...prev, mode: newMode } : null));
    setShowAutofillMenu(false);
  };

  useEffect(() => {
    const onGlobalMouseUp = () => {
      if (isDraggingHandle) {
        handleMouseUpAfterDrag();
      }
      setIsDraggingSelection(false);
    };
    window.addEventListener('mouseup', onGlobalMouseUp);
    return () => window.removeEventListener('mouseup', onGlobalMouseUp);
  }, [isDraggingHandle, handleMouseUpAfterDrag]);

  // ==========================
  // COLUMN RESIZE
  // ==========================
  useEffect(() => {
    if (!resizeState) return;
    const onMove = (e: MouseEvent) => {
      setColumns((prev) =>
        prev.map((c, i) =>
          i === resizeState.colIdx
            ? { ...c, width: Math.max(60, Math.min(600, resizeState.startWidth + (e.clientX - resizeState.startX))) }
            : c
        )
      );
    };
    const onUp = () => {
      setResizeState(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [resizeState]);

  // Commit width changes to history + persistence after a resize drag ends
  const prevWidthsRef = useRef<string>('');
  useEffect(() => {
    const serialized = JSON.stringify(columns.map((c) => c.width));
    if (resizeState === null && prevWidthsRef.current && prevWidthsRef.current !== serialized) {
      pushHistory('Resize column');
      commitChanges(columns, rows);
    }
    prevWidthsRef.current = resizeState ? prevWidthsRef.current : serialized;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resizeState]);

  // ==========================
  // RENDER GUARDS
  // ==========================
  if (loading) {
    return (
      <div className="p-8 border border-border/80 rounded-xl bg-card flex flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#2E4034] border-t-transparent" />
        <span>{isAr ? 'جاري تحميل الجدول...' : 'Loading Table...'}</span>
      </div>
    );
  }

  const safeColumns = Array.isArray(columns) && columns.length > 0 ? columns : [{ id: 'A', name: 'A', type: 'text' as const, width: 140 }];
  const safeRows = Array.isArray(rows) ? rows : [];
  const isFullScreen = mode === 'full-screen' || isFullScreenModalOpen;

  // Natural fit like normal tables: no horizontal scroll — saved pixel widths
  // act as proportions (fr) so the grid always fills its container.
  const gridTemplateColumns = `44px ${safeColumns.map((c) => `minmax(0, ${Math.max(c.width || 140, 60)}fr)`).join(' ')}`;
  const rowHeaderWidth = 44;

  const activeFormat = cellFormats[activeCoordStr] || {};

  const selectionLabel = selectionRect
    ? `${coordOf(selectionRect.c1, selectionRect.r1)}:${coordOf(selectionRect.c2, selectionRect.r2)}`
    : activeCoordStr;

  return (
    <div
      className={cn(
        'smart-table-wrapper flex flex-col border rounded-xl bg-card shadow-2xs outline-none select-none my-3',
        isFullScreen && 'fixed inset-0 z-50 rounded-none border-none bg-background p-4 sm:p-6 overflow-y-auto',
        isFormulaMode && 'ring-2 ring-blue-400/60'
      )}
      tabIndex={0}
      contentEditable={false}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      onCopy={(e) => { try { e.stopPropagation(); } catch {} }}
      onCut={(e) => { try { e.stopPropagation(); } catch {} }}
      onMouseDown={(e) => { try { e.stopPropagation(); } catch {} }}
      onFocus={(e) => { try { e.stopPropagation(); } catch {} }}
      onMouseDownCapture={notifySmartActive}
      onFocusCapture={notifySmartActive}
      dir={isAr ? 'rtl' : 'ltr'}
    >
      {/* ============ 1. TOP TOOLBAR (internal mode only; external mode uses the top EditorToolbar) ============ */}
      {toolbar === 'internal' && (
      <div
        className="flex flex-wrap items-center justify-between gap-2 border-b border-border/80 bg-muted/40 px-3 py-2 text-xs"
        role="toolbar"
        aria-label={isAr ? 'شريط أدوات الجدول' : 'Table toolbar'}
      >
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Table name (inline editable) */}
          <div className="flex items-center gap-1.5 font-bold text-foreground me-1 min-w-0">
            <input
              type="text"
              value={tableName}
              onChange={(e) => {
                if (readOnly) return;
                setTableName(e.target.value.slice(0, 120));
              }}
              onBlur={() => commitTableName(tableName)}
              onKeyDown={(e) => {
                try { e.stopPropagation(); } catch {}
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
              onMouseDown={(e) => { try { e.stopPropagation(); } catch {} }}
              className="bg-transparent font-bold text-foreground focus:outline-none focus:underline min-w-0 w-28 sm:w-40 truncate"
              aria-label={isAr ? 'اسم الجدول' : 'Table name'}
              readOnly={readOnly}
              maxLength={120}
            />
          </div>

          <div className="h-4 w-px bg-border mx-1" />

          {/* Undo / Redo */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={history.length === 0 || readOnly}
            onClick={handleUndo}
            className="h-7 px-2 text-xs gap-1"
            title={`${isAr ? 'تراجع' : 'Undo'} (Ctrl+Z)`}
            aria-label={isAr ? 'تراجع عن آخر تعديل' : 'Undo last change'}
          >
            <Undo2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={redoStack.length === 0 || readOnly}
            onClick={handleRedo}
            className="h-7 px-2 text-xs gap-1"
            title={`${isAr ? 'إعادة' : 'Redo'} (Ctrl+Y)`}
            aria-label={isAr ? 'إعادة التعديل الملغى' : 'Redo undone change'}
          >
            <Redo2 className="h-3.5 w-3.5" />
          </Button>

          <div className="h-4 w-px bg-border mx-1" />

          {/* Rows menu: insert above/below, append, delete current */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={readOnly}
                className="h-7 px-2.5 text-xs font-semibold gap-1 shadow-2xs"
                aria-label={isAr ? 'أدوات الصفوف' : 'Row tools'}
              >
                <Plus className="h-3 w-3 text-emerald-600" />
                <span className="hidden sm:inline">{isAr ? 'صف' : 'Row'}</span>
                <ChevronDown className="h-2.5 w-2.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem
                onClick={() => handleInsertRow('above')}
                aria-label={isAr ? 'إدراج صف فوق الصف الحالي' : 'Insert row above current row'}
              >
                <Plus className="h-3.5 w-3.5 text-emerald-600" />
                <span>{isAr ? `إدراج صف فوق (قبل الصف ${safeActiveCell.rowIdx + 1})` : `Insert row above (before row ${safeActiveCell.rowIdx + 1})`}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleInsertRow('below')}
                aria-label={isAr ? 'إدراج صف تحت الصف الحالي' : 'Insert row below current row'}
              >
                <Plus className="h-3.5 w-3.5 text-emerald-600" />
                <span>{isAr ? `إدراج صف تحت (بعد الصف ${safeActiveCell.rowIdx + 1})` : `Insert row below (after row ${safeActiveCell.rowIdx + 1})`}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleInsertRow('end')}
                aria-label={isAr ? 'إضافة صف في نهاية الجدول' : 'Append row at the end'}
              >
                <Plus className="h-3.5 w-3.5 text-emerald-600" />
                <span>{isAr ? 'إضافة صف في النهاية' : 'Add row at the end'}</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => handleDeleteRow()}
                disabled={safeRows.length <= 1}
                className="text-red-600 focus:text-red-600"
                aria-label={isAr ? 'حذف الصف الحالي' : 'Delete current row'}
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>{isAr ? `حذف الصف ${safeActiveCell.rowIdx + 1}` : `Delete row ${safeActiveCell.rowIdx + 1}`}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Columns menu: insert before/after, append, delete current */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={readOnly}
                className="h-7 px-2.5 text-xs font-semibold gap-1 shadow-2xs"
                aria-label={isAr ? 'أدوات الأعمدة' : 'Column tools'}
              >
                <Plus className="h-3 w-3 text-blue-600" />
                <span className="hidden sm:inline">{isAr ? 'عمود' : 'Column'}</span>
                <ChevronDown className="h-2.5 w-2.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem
                onClick={() => handleInsertColumn('before')}
                aria-label={isAr ? 'إدراج عمود قبل العمود الحالي' : 'Insert column before current column'}
              >
                <Plus className="h-3.5 w-3.5 text-blue-600" />
                <span>{isAr ? `إدراج عمود قبل (قبل العمود ${activeColId})` : `Insert column before ${activeColId}`}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleInsertColumn('after')}
                aria-label={isAr ? 'إدراج عمود بعد العمود الحالي' : 'Insert column after current column'}
              >
                <Plus className="h-3.5 w-3.5 text-blue-600" />
                <span>{isAr ? `إدراج عمود بعد (بعد العمود ${activeColId})` : `Insert column after ${activeColId}`}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleInsertColumn('end')}
                aria-label={isAr ? 'إضافة عمود في نهاية الجدول' : 'Append column at the end'}
              >
                <Plus className="h-3.5 w-3.5 text-blue-600" />
                <span>{isAr ? 'إضافة عمود في النهاية' : 'Add column at the end'}</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => handleDeleteColumn()}
                disabled={safeColumns.length <= 1}
                className="text-red-600 focus:text-red-600"
                aria-label={isAr ? 'حذف العمود الحالي' : 'Delete current column'}
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>{isAr ? `حذف العمود ${activeColId}` : `Delete column ${activeColId}`}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="h-4 w-px bg-border mx-1" />

          {/* Direction Toggle */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={readOnly}
            onClick={handleToggleDirection}
            className="h-7 px-2 text-xs font-semibold gap-1 shadow-2xs"
            title={isAr ? 'تبديل اتجاه الجدول (RTL / LTR)' : 'Toggle Direction (RTL / LTR)'}
            aria-label={isAr ? `اتجاه الجدول الحالي ${direction === 'rtl' ? 'من اليمين إلى اليسار' : 'من اليسار إلى اليمين'}، اضغط للتبديل` : `Current direction is ${direction.toUpperCase()}, click to toggle`}
          >
            <ArrowRightLeft className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
            <span className="font-mono uppercase">{direction}</span>
          </Button>

          {/* Alignment group */}
          <div
            className="flex items-center bg-muted/60 dark:bg-muted/30 rounded-md p-0.5 gap-0.5 border border-border/60"
            role="group"
            aria-label={isAr ? 'محاذاة النص' : 'Text alignment'}
          >
            {([
              { key: 'right', label: isAr ? 'محاذاة لليمين' : 'Align right', icon: <span className="font-bold leading-none w-3 text-center">≡</span> },
              { key: 'center', label: isAr ? 'محاذاة للوسط' : 'Align center', icon: <span className="font-bold leading-none w-3 text-center">≡</span> },
              { key: 'left', label: isAr ? 'محاذاة لليسار' : 'Align left', icon: <span className="font-bold leading-none w-3 text-center">≡</span> },
              { key: 'justify', label: isAr ? 'ضبط النص' : 'Justify text', icon: <span className="font-bold leading-none w-3 text-center">≡</span> },
            ] as const).map((al) => (
              <Button
                key={al.key}
                type="button"
                variant="ghost"
                size="icon"
                disabled={readOnly}
                onClick={() => handleSetCellsAlignment(al.key)}
                className={cn(
                  'h-6 w-7 p-0 rounded',
                  (cellFormats[activeCoordStr]?.align === al.key ||
                    (!cellFormats[activeCoordStr]?.align && al.key === (isAr ? 'right' : 'left'))) &&
                    'bg-background shadow-2xs text-foreground font-bold'
                )}
                title={al.label}
                aria-label={`${al.label}${selectionRect ? (isAr ? ' للنطاق المحدد' : ' on selected range') : ''}`}
              >
                <span
                  className="block h-2 w-3.5 border-y border-current"
                  style={{
                    margin: al.key === 'center' ? '0 auto' : al.key === 'right' ? '0 0 0 auto' : al.key === 'justify' ? '0' : '0',
                  }}
                />
              </Button>
            ))}
          </div>

          {/* Text styles: Bold / Italic / Underline */}
          <div
            className="flex items-center bg-muted/60 dark:bg-muted/30 rounded-md p-0.5 gap-0.5 border border-border/60"
            role="group"
            aria-label={isAr ? 'تنسيق خط الخلايا المحددة' : 'Font styling of selected cells'}
          >
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={readOnly}
              onClick={() => handleToggleCellsStyle('bold')}
              className={cn('h-6 w-6 p-0 rounded font-bold', activeFormat.bold && 'bg-background shadow-2xs text-foreground')}
              title={isAr ? 'خط عريض للخلايا المحددة' : 'Bold selected cells'}
              aria-label={isAr ? 'خط عريض للخلايا المحددة' : 'Bold selected cells'}
            >
              <Bold className="h-3 w-3" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={readOnly}
              onClick={() => handleToggleCellsStyle('italic')}
              className={cn('h-6 w-6 p-0 rounded italic', activeFormat.italic && 'bg-background shadow-2xs text-foreground')}
              title={isAr ? 'خط مائل للخلايا المحددة' : 'Italic selected cells'}
              aria-label={isAr ? 'خط مائل للخلايا المحددة' : 'Italic selected cells'}
            >
              <Italic className="h-3 w-3" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={readOnly}
              onClick={() => handleToggleCellsStyle('underline')}
              className={cn('h-6 w-6 p-0 rounded underline', activeFormat.underline && 'bg-background shadow-2xs text-foreground')}
              title={isAr ? 'خط سفلي للخلايا المحددة' : 'Underline selected cells'}
              aria-label={isAr ? 'خط سفلي للخلايا المحددة' : 'Underline selected cells'}
            >
              <Underline className="h-3 w-3" />
            </Button>
          </div>

          <div className="h-4 w-px bg-border mx-1" />

          {/* Merge / Unmerge */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={readOnly}
            onClick={handleToggleMerge}
            className={cn(
              'h-7 px-2 text-xs font-semibold gap-1 shadow-2xs',
              isCurrentCellMerged && 'border-amber-400 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300'
            )}
            title={
              isCurrentCellMerged
                ? isAr ? 'إلغاء دمج الخلايا المحددة' : 'Unmerge selected cells'
                : isAr ? 'دمج نطاق الخلايا المحدد' : 'Merge selected cell range'
            }
            aria-label={
              isCurrentCellMerged
                ? isAr ? 'إلغاء دمج الخلايا' : 'Unmerge cells'
                : isAr ? 'دمج الخلايا المحددة' : 'Merge selected cells'
            }
          >
            <span>{isCurrentCellMerged ? (isAr ? 'إلغاء الدمج' : 'Unmerge') : isAr ? 'دمج' : 'Merge'}</span>
          </Button>

          {/* Advanced menu: Transpose */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={readOnly}
                className="h-7 px-2 text-xs font-semibold gap-1 shadow-2xs"
                aria-label={isAr ? 'خيارات متقدمة' : 'Advanced options'}
              >
                <ArrowLeftRight className="h-3.5 w-3.5 text-amber-600" />
                <span className="hidden lg:inline">{isAr ? 'متقدم' : 'Advanced'}</span>
                <ChevronDown className="h-2.5 w-2.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem
                onClick={handleTranspose}
                aria-label={isAr ? 'قلب أبعاد الجدول: تبديل الصفوف والأعمدة مع تحديث الصيغ' : 'Transpose table: swap rows and columns, remapping formulas'}
              >
                <ArrowLeftRight className="h-3.5 w-3.5 text-amber-600" />
                <span>{isAr ? 'قلب الأبعاد (تبديل الصفوف والأعمدة)' : 'Transpose (swap rows & columns)'}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Delete whole table */}
          {onDeleteNode && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRequestDelete}
              className="h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40 gap-1 font-semibold"
              title={isAr ? 'حذف هذا الجدول بالكامل من التقرير' : 'Delete this table from the report'}
              aria-label={isAr ? 'حذف الجدول بالكامل من التقرير' : 'Delete entire table from report'}
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{isAr ? 'حذف الجدول' : 'Delete Table'}</span>
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Autosave status */}
          <span
            className={cn(
              'text-[10px] font-mono px-2 py-0.5 rounded-full border transition-all',
              saveStatus === 'saved' &&
                'border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
              saveStatus === 'saving' &&
                'border-amber-200 bg-amber-50 text-amber-700 animate-pulse dark:bg-amber-950/40 dark:text-amber-300',
              saveStatus === 'error' && 'border-red-200 bg-red-50 text-red-700'
            )}
          >
            {saveStatus === 'saved'
              ? isAr ? 'تم الحفظ' : 'Saved'
              : saveStatus === 'saving'
              ? isAr ? 'جاري الحفظ...' : 'Saving...'
              : isAr ? 'فشل الحفظ' : 'Save Failed'}
          </span>

          {mode === 'embedded-edit' ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsFullScreenModalOpen(!isFullScreenModalOpen)}
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
              title={isAr ? 'فتح في وضع ملء الشاشة' : 'Open fullscreen mode'}
              aria-label={isAr ? 'فتح الجدول في وضع ملء الشاشة' : 'Open table in fullscreen mode'}
            >
              {isFullScreenModalOpen ? (
                <>
                  <Minimize2 className="h-3.5 w-3.5" />
                  <span>{isAr ? 'إنهاء التكبير' : 'Exit Fullscreen'}</span>
                </>
              ) : (
                <>
                  <Maximize2 className="h-3.5 w-3.5" />
                  <span>{isAr ? 'ملء الشاشة' : 'Fullscreen'}</span>
                </>
              )}
            </Button>
          ) : (
            onCloseFullScreen && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onCloseFullScreen}
                className="h-7 px-2 text-xs"
                aria-label={isAr ? 'إغلاق العرض' : 'Close view'}
              >
                {isAr ? 'إغلاق' : 'Close'}
              </Button>
            )
          )}
        </div>
      </div>
      )}

      {/* External-mode fullscreen exit (internal strip is hidden there) */}
      {toolbar === 'external' && isFullScreenModalOpen && (
        <button
          type="button"
          onClick={() => {
            if (mountedRef.current) setIsFullScreenModalOpen(false);
          }}
          onMouseDown={(e) => { try { e.stopPropagation(); } catch {} }}
          className="fixed top-4 end-4 z-[60] flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground shadow-xl hover:bg-muted"
          aria-label={isAr ? 'إنهاء وضع ملء الشاشة' : 'Exit fullscreen mode'}
        >
          <Minimize2 className="h-3.5 w-3.5" />
          <span>{isAr ? 'إنهاء التكبير' : 'Exit Fullscreen'}</span>
        </button>
      )}

      {/* ============ 2. FORMULA BAR (strictly LTR, isolated) ============ */}
      <div className="formula-bar formula-bar-ltr flex flex-wrap items-center gap-2 border-b border-border/80 bg-background px-3 py-1.5" dir="ltr">
        <div
          className="flex h-7 w-16 items-center justify-center rounded-md border border-border bg-muted/60 font-mono text-xs font-bold text-foreground shrink-0 shadow-2xs select-none"
          aria-label={isAr ? `الخلية النشطة ${selectionLabel}` : `Active cell ${selectionLabel}`}
          dir="ltr"
        >
          {selectionLabel}
        </div>

        <div className="flex items-center justify-center text-muted-foreground font-serif italic text-sm px-1 select-none" aria-hidden="true">
          fx
        </div>

        {/* Formula Mode indicator (not color-only: has text + icon) */}
        {isFormulaMode && (
          <div
            className="flex items-center gap-1 rounded-md border border-blue-300 bg-blue-50 dark:bg-blue-950/40 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 dark:text-blue-300 shrink-0"
            role="status"
            aria-live="polite"
          >
            <Sigma className="h-3 w-3" />
            <span>{isAr ? 'وضع الصيغة: انقر الخلايا لإدراج مراجعها' : 'Formula mode: click cells to insert refs'}</span>
          </div>
        )}

        <div className="relative flex-1 flex items-center min-w-[140px]" dir="ltr" style={{ unicodeBidi: 'isolate' }}>
          <input
            ref={formulaBarInputRef}
            type="text"
            dir="ltr"
            value={isEditing ? editValue : String(activeRawValue)}
            onChange={(e) => {
              if (readOnly) return;
              if (!isEditing) {
                setIsEditing(true);
                setEditValue(e.target.value);
              } else {
                setEditValue(e.target.value);
              }
            }}
            onFocus={(e) => {
              try { e.stopPropagation(); } catch {}
              if (!isEditing) {
                setEditValue(String(activeRawValue));
                setIsEditing(true);
              }
            }}
            onKeyDown={(e) => {
              try { e.stopPropagation(); } catch {}
              if ((e.nativeEvent as any)?.stopImmediatePropagation) {
                try { (e.nativeEvent as any).stopImmediatePropagation(); } catch {}
              }
              if (e.key === 'Enter') {
                e.preventDefault();
                commitCellEdit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelCellEdit();
              }
            }}
            onMouseDown={(e) => { try { e.stopPropagation(); } catch {} }}
            placeholder={
              isAr
                ? 'قيمة أو صيغة مثل =C2+D2 أو =SUM(C2,D2,E2)'
                : 'Value or formula like =C2+D2 or =SUM(C2,D2,E2)'
            }
            className="h-7 w-full rounded-md border border-border/70 bg-transparent px-2 text-left text-xs font-mono text-foreground focus:border-olive-600 focus:outline-none focus:ring-1 focus:ring-olive-600"
            style={{ unicodeBidi: 'plaintext' }}
            readOnly={readOnly}
            aria-label={isAr ? 'شريط الصيغ: اكتب قيمة الخلية أو صيغتها الحسابية' : 'Formula bar: enter cell value or formula'}
          />

          {isEditing && !readOnly && (
            <div className="absolute end-1.5 flex items-center gap-1">
              <button
                type="button"
                onClick={commitCellEdit}
                className="h-5 w-5 rounded flex items-center justify-center bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                title={isAr ? 'اعتماد (Enter)' : 'Commit (Enter)'}
                aria-label={isAr ? 'اعتماد القيمة' : 'Commit value'}
              >
                <Check className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={cancelCellEdit}
                className="h-5 w-5 rounded flex items-center justify-center bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title={isAr ? 'إلغاء (Escape)' : 'Cancel (Escape)'}
                aria-label={isAr ? 'إلغاء التعديل' : 'Cancel edit'}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>

        {activeError && (
          <div className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 dark:bg-red-950/40 px-2 py-1 rounded border border-red-200 shrink-0">
            <AlertCircle className="h-3.5 w-3.5" />
            <span className="font-bold">{activeError}</span>
            <span className="hidden sm:inline text-[11px]">
              {activeError === '#CIRCULAR!'
                ? isAr ? `اعتماد دائري في ${activeCoordStr}` : `Circular reference in ${activeCoordStr}`
                : activeError === '#DIV/0!'
                ? isAr ? 'قسمة على صفر' : 'Division by zero'
                : activeError === '#REF!'
                ? isAr ? 'مرجع غير صالح' : 'Invalid reference'
                : activeError === '#VALUE!'
                ? isAr ? 'قيمة غير صالحة في العملية' : 'Invalid value in operation'
                : isAr ? 'خطأ في الصيغة' : 'Formula error'}
            </span>
          </div>
        )}
      </div>

      {/* ============ 3. GRID (CSS Grid: real rectangular merges) ============ */}
      <div
        className="smart-table-frame w-full max-w-full overflow-visible relative border-t border-border/60"
        dir={direction}
      >
        <div
          role="grid"
          aria-label={isAr ? 'شبكة الجدول' : 'Table grid'}
          className="smart-table-grid w-full border-collapse text-xs"
          style={{
            display: 'grid',
            gridTemplateColumns,
            gridAutoRows: 'minmax(36px, auto)',
            direction,
          }}
        >
          {/* Header row */}
          <div
            role="columnheader"
            className="smart-table-corner-cell border-e border-b p-1.5 text-center font-bold text-[10px] select-none"
            style={{ width: rowHeaderWidth }}
            aria-label={isAr ? 'رؤوس الصفوف' : 'Row numbers'}
          >
            #
          </div>

          {safeColumns.map((col, colIdx) => {
            const isBetween =
              selectionRect !== null &&
              colIdx >= selectionRect.c1 &&
              colIdx <= selectionRect.c2;
            return (
              <div
                key={col.id}
                role="columnheader"
                className={cn(
                  'smart-table-header-cell group relative border-e border-b p-1 text-center select-none',
                  isBetween && 'brightness-95'
                )}
                style={{ direction: isAr ? 'rtl' : 'ltr' }}
                aria-label={isAr ? `العمود ${col.id}` : `Column ${col.id}`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-mono font-bold text-[10px] shrink-0 opacity-80">{col.id}</span>
                  <input
                    type="text"
                    value={col.name}
                    onChange={(e) => {
                      if (readOnly) return;
                      const newCols = columns.map((c) =>
                        c.id === col.id ? { ...c, name: e.target.value.slice(0, 120) } : c
                      );
                      commitChanges(newCols, rows);
                    }}
                    onKeyDown={(e) => { try { e.stopPropagation(); } catch {} }}
                    onMouseDown={(e) => { try { e.stopPropagation(); } catch {} }}
                    className="w-full bg-transparent text-center font-medium text-xs focus:outline-none truncate"
                    title={isAr ? 'تعديل اسم العمود' : 'Rename column'}
                    readOnly={readOnly}
                    maxLength={120}
                    aria-label={isAr ? `اسم العمود ${col.id}` : `Column ${col.id} name`}
                  />
                  {!readOnly && safeColumns.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleDeleteColumn(colIdx)}
                      className="opacity-0 group-hover:opacity-100 hover:text-red-500 p-0.5 rounded transition-opacity shrink-0"
                      title={isAr ? 'حذف هذا العمود' : 'Delete this column'}
                      aria-label={isAr ? `حذف العمود ${col.id}` : `Delete column ${col.id}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>

                {/* Column resize handle */}
                {!readOnly && (
                  <div
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={isAr ? `تغيير عرض العمود ${col.id}` : `Resize column ${col.id}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setResizeState({
                        colIdx,
                        startX: e.clientX,
                        startWidth: col.width || 140,
                      });
                    }}
                    className={cn(
                      'absolute top-0 bottom-0 w-1.5 cursor-col-resz hover:bg-blue-500/40 z-10',
                      direction === 'rtl' ? '-left-1' : '-right-1'
                    )}
                  />
                )}
              </div>
            );
          })}

          {/* Data rows */}
          {safeRows.map((row, rIdx) => {
            const isDragHighlightedRow =
              isDraggingHandle &&
              dragTargetRowIdx !== null &&
              ((dragTargetRowIdx >= safeActiveCell.rowIdx &&
                rIdx > safeActiveCell.rowIdx &&
                rIdx <= dragTargetRowIdx) ||
                (dragTargetRowIdx <= safeActiveCell.rowIdx &&
                  rIdx < safeActiveCell.rowIdx &&
                  rIdx >= dragTargetRowIdx));

            return (
              <React.Fragment key={rIdx}>
                {/* Row number cell */}
                <div
                  role="rowheader"
                  className="smart-table-rowheader group relative border-e border-b bg-muted/40 p-1 text-center font-mono text-[11px] font-semibold text-muted-foreground select-none flex items-center justify-center"
                  style={{ width: rowHeaderWidth }}
                  aria-label={isAr ? `الصف ${rIdx + 1}` : `Row ${rIdx + 1}`}
                >
                  <span>{rIdx + 1}</span>
                  {!readOnly && safeRows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleDeleteRow(rIdx)}
                      className="absolute inset-y-0 start-0 w-4 items-center justify-center opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity hidden sm:flex"
                      title={isAr ? 'حذف هذا الصف' : 'Delete this row'}
                      aria-label={isAr ? `حذف الصف ${rIdx + 1}` : `Delete row ${rIdx + 1}`}
                    >
                      <Trash2 className="h-2.5 w-2.5" />
                    </button>
                  )}
                </div>

                {/* Data cells */}
                {safeColumns.map((col, cIdx) => {
                  const covered = isCellCoveredByMerge(cIdx, rIdx);
                  if (covered) return null;

                  const mergeInfo = findMergeAt(cIdx, rIdx);
                  const colSpan = mergeInfo?.merge.colSpan || 1;
                  const rowSpan = mergeInfo?.merge.rowSpan || 1;

                  const coord = `${col.id}${rIdx + 1}`.toUpperCase();
                  const isSelected =
                    safeActiveCell.colIdx === cIdx && safeActiveCell.rowIdx === rIdx;
                  const inSelection = isCellInSelection(cIdx, rIdx) && !isSelected;
                  const isDragTarget = isDragHighlightedRow && cIdx === safeActiveCell.colIdx;
                  const rawVal = row?.[col.id];
                  const displayVal = evaluatedMap[coord] !== undefined ? evaluatedMap[coord] : rawVal;
                  const cellFormat = cellFormats[coord];
                  const customAlign = cellFormat?.align;
                  const refColor = formulaRefColors.get(coord);

                  return (
                    <div
                      key={col.id}
                      role="gridcell"
                      aria-selected={isSelected || inSelection}
                      aria-label={`${coord}: ${displayVal !== undefined && displayVal !== null ? String(displayVal) : ''}`}
                      style={{
                        gridColumn: colSpan > 1 ? `span ${colSpan}` : undefined,
                        gridRow: rowSpan > 1 ? `span ${rowSpan}` : undefined,
                        background: refColor ? refColor.bg : undefined,
                        boxShadow: refColor ? `inset 0 0 0 2px ${refColor.ring}` : undefined,
                      }}
                      onMouseDown={(e) => {
                        if (isEditing && editValue.trimStart().startsWith('=')) {
                          // Formula mode: keep caret inside the input, insert the reference
                          e.preventDefault();
                          handleSelectCell(cIdx, rIdx);
                          return;
                        }
                        if (e.shiftKey) {
                          e.preventDefault();
                          setSelectionAnchor((prev) => prev ?? { ...safeActiveCell });
                          setActiveCell({ colIdx: cIdx, rowIdx: rIdx });
                          return;
                        }
                        setIsDraggingSelection(true);
                        handleSelectCell(cIdx, rIdx);
                      }}
                      onMouseEnter={() => handleMouseEnterCellDuringDrag(rIdx)}
                      onDoubleClick={() => startEditing()}
                      className={cn(
                        'smart-table-cell relative border-e border-b p-0 text-xs transition-colors cursor-cell',
                        isSelected
                          ? 'smart-table-cell-selected z-10'
                          : inSelection
                          ? 'bg-[#486450]/15'
                          : 'hover:bg-muted/30',
                        isDragTarget && 'bg-[#486450]/15'
                      )}
                    >
                      {isSelected && isEditing ? (
                        <input
                          ref={editInputRef}
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value.slice(0, 10000))}
                          onKeyDown={(e) => {
                            try { e.stopPropagation(); } catch {}
                            if ((e.nativeEvent as any)?.stopImmediatePropagation) {
                              try { (e.nativeEvent as any).stopImmediatePropagation(); } catch {}
                            }
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              commitCellEdit();
                              if (safeActiveCell.rowIdx < rows.length - 1) {
                                setActiveCell((prev) => ({ ...prev, rowIdx: prev.rowIdx + 1 }));
                              }
                            } else if (e.key === 'Escape') {
                              e.preventDefault();
                              cancelCellEdit();
                            } else if (e.key === 'Tab') {
                              e.preventDefault();
                              handleTabKey(e.shiftKey);
                            }
                          }}
                          onMouseDown={(e) => { try { e.stopPropagation(); } catch {} }}
                          onBlur={commitCellEdit}
                          dir={editValue.trimStart().startsWith('=') ? 'ltr' : 'auto'}
                          className="w-full h-full min-h-[34px] bg-background text-xs font-mono text-foreground focus:outline-none"
                          style={{ padding: '10px 14px', lineHeight: 1.6 }}
                          aria-label={isAr ? `تحرير الخلية ${coord}` : `Editing cell ${coord}`}
                        />
                      ) : (
                        <div
                          className="w-full h-full min-h-[34px] flex items-center overflow-hidden"
                          style={{
                            justifyContent:
                              customAlign === 'center'
                                ? 'center'
                                : customAlign === 'right'
                                ? 'flex-end'
                                : customAlign === 'left'
                                ? 'flex-start'
                                : customAlign === 'justify'
                                ? 'flex-start'
                                : typeof displayVal === 'number'
                                ? 'flex-end'
                                : 'flex-start',
                          }}
                        >
                          <span
                            className={cn(
                              'smart-table-cell-content w-full break-words whitespace-pre-wrap leading-snug',
                              typeof displayVal === 'number' && 'font-mono',
                              isFormulaError(displayVal) && 'font-bold text-red-500 font-mono text-center',
                              typeof rawVal === 'string' && rawVal.startsWith('=') && 'font-mono',
                              cellFormat?.bold && 'font-bold',
                              cellFormat?.italic && 'italic',
                              cellFormat?.underline && 'underline'
                            )}
                            dir="auto"
                            style={{
                              textAlign:
                                customAlign ||
                                (typeof displayVal === 'number'
                                  ? 'right'
                                  : 'left'),
                            }}
                          >
                            {displayVal !== null && displayVal !== undefined ? String(displayVal) : ''}
                          </span>
                        </div>
                      )}

                      {/* Autofill drag handle */}
                      {isSelected && !isEditing && !readOnly && (
                        <div
                          onMouseDown={handleMouseDownOnHandle}
                          className={cn(
                            'absolute -bottom-1 h-2.5 w-2.5 bg-[#2E4034] dark:bg-emerald-400 border border-white dark:border-black rounded-xs cursor-crosshair z-20 hover:scale-125 transition-transform',
                            direction === 'rtl' ? '-left-1' : '-right-1'
                          )}
                          title={isAr ? 'سحب التعبئة التلقائية' : 'Drag to autofill'}
                          aria-label={isAr ? 'مقبض التعبئة التلقائية، اسحب لتعبئة الخلايا' : 'Autofill handle, drag to fill cells'}
                        />
                      )}
                    </div>
                  );
                })}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* ============ 4. AUTOFILL OPTIONS POPUP ============ */}
      {showAutofillMenu && lastAutofillInfo && (
        <div className="flex items-center justify-between border-t border-border/80 bg-olive-50/70 dark:bg-olive-950/40 p-2.5 px-3 text-xs animate-in fade-in duration-150">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-olive-600 dark:text-olive-400" />
            <span className="font-semibold text-foreground">
              {isAr ? 'خيارات التعبئة التلقائية:' : 'Autofill Options:'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={lastAutofillInfo.mode === 'fill_series' ? 'default' : 'outline'}
              onClick={() => handleChangeAutofillMode('fill_series')}
              className={cn(
                'h-7 text-xs font-semibold rounded-lg',
                lastAutofillInfo.mode === 'fill_series' && 'bg-[#2E4034] text-white hover:bg-[#24382F]'
              )}
              aria-label={isAr ? 'تعبئة كتسلسل رقمي متزايد' : 'Fill as numeric series'}
            >
              {isAr ? 'تعبئة السلسلة' : 'Fill Series'}
            </Button>

            <Button
              type="button"
              size="sm"
              variant={lastAutofillInfo.mode === 'copy_cells' ? 'default' : 'outline'}
              onClick={() => handleChangeAutofillMode('copy_cells')}
              className={cn(
                'h-7 text-xs font-semibold rounded-lg',
                lastAutofillInfo.mode === 'copy_cells' && 'bg-[#2E4034] text-white hover:bg-[#24382F]'
              )}
              aria-label={isAr ? 'نسخ قيمة الخلية المصدر' : 'Copy source cell value'}
            >
              {isAr ? 'نسخ الخلايا' : 'Copy Cells'}
            </Button>

            <button
              type="button"
              onClick={() => setShowAutofillMenu(false)}
              className="text-muted-foreground hover:text-foreground text-xs p-1"
              aria-label={isAr ? 'إغلاق قائمة التعبئة' : 'Close autofill menu'}
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* ============ 5. DELETE TABLE CONFIRMATION ============ */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" />
              <span>{isAr ? 'تأكيد حذف الجدول' : 'Confirm Delete Table'}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 text-sm text-muted-foreground leading-relaxed">
            {isAr
              ? 'يحتوي هذا الجدول على بيانات أو صيغ. هل أنت متأكد من حذفه بالكامل من التقرير؟ يمكنك التراجع فوراً بالضغط على Ctrl+Z.'
              : 'This table contains data or formulas. Delete it completely from the report? You can undo immediately with Ctrl+Z.'}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowDeleteConfirm(false)}
              aria-label={isAr ? 'إلغاء الحذف' : 'Cancel deletion'}
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={executeDeleteTableNode}
              className="gap-1.5 bg-red-600 hover:bg-red-700 text-white"
              aria-label={isAr ? 'تأكيد حذف الجدول نهائياً' : 'Confirm permanent table deletion'}
            >
              <Trash2 className="h-4 w-4" />
              <span>{isAr ? 'نعم، احذف الجدول' : 'Yes, Delete Table'}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
