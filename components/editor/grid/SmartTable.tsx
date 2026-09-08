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
      if (!tableId) return;
      try {
        setLoading(true);
        const fetched = await getTableById(tableId);
        if (isMounted) {
          if (fetched) {
            setTable(fetched);
            const cols = Array.isArray(fetched.columns_data) ? fetched.columns_data : [];
            const rws = Array.isArray(fetched.rows_data) ? fetched.rows_data : [];
            setColumns(cols);
            setRows(rws);
            setCellFormats((fetched.cell_formats as Record<string, CellFormat>) || {});
            setMergedCells((fetched.merged_cells as MergedRange[]) || []);
            setDirection(fetched.direction || (isAr ? 'rtl' : 'ltr'));
          } else {
            // Default template when the table entity does not exist yet
            const defaultTable: TableEntity = {
              id: tableId,
              report_id: reportId || '',
              name: isAr ? 'جدول' : 'Table',
              direction: isAr ? 'rtl' : 'ltr',
              cell_formats: {},
              merged_cells: [],
              columns_data: [
                { id: 'A', name: isAr ? 'البند' : 'Item', type: 'text', width: 200 },
                { id: 'B', name: isAr ? 'الوصف' : 'Description', type: 'text', width: 260 },
                { id: 'C', name: isAr ? 'العدد' : 'Count', type: 'number', width: 110 },
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
            setTable(defaultTable);
            setColumns(defaultTable.columns_data);
            setRows(defaultTable.rows_data);
            setCellFormats({});
            setMergedCells([]);
            setDirection(defaultTable.direction || (isAr ? 'rtl' : 'ltr'));
            saveTable(defaultTable);
          }
        }
      } catch (e) {
        console.error('Failed to load table:', e);
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
      setHistory((prev) => [
        ...prev.slice(-40),
        {
          columns: JSON.parse(JSON.stringify(cols)),
          rows: JSON.parse(JSON.stringify(r)),
          cellFormats: JSON.parse(JSON.stringify(f || {})),
          mergedCells: JSON.parse(JSON.stringify(m || [])),
          direction: d,
          description: desc,
        },
      ]);
      setRedoStack([]);
    },
    [columns, rows, cellFormats, mergedCells, direction]
  );

  const scheduleSave = useCallback(
    (
      newCols: TableColumnEntity[],
      newRows: Record<string, any>[],
      newFormats: Record<string, CellFormat>,
      newMerged: MergedRange[],
      newDir: 'rtl' | 'ltr'
    ) => {
      if (!table) return;
      setSaveStatus('saving');
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(async () => {
        try {
          const updated: TableEntity = {
            ...table,
            columns_data: newCols,
            rows_data: newRows,
            cell_formats: newFormats,
            merged_cells: newMerged,
            direction: newDir,
            updated_at: new Date().toISOString(),
          };
          await saveTable(updated);
          setTable(updated);
          setSaveStatus('saved');
        } catch (err) {
          console.error('Failed to autosave table:', err);
          setSaveStatus('error');
        }
      }, 650);
    },
    [table]
  );

  const commitChanges = useCallback(
    (
      newCols: TableColumnEntity[],
      newRows: Record<string, any>[],
      newFormats: Record<string, CellFormat> = cellFormats,
      newMerged: MergedRange[] = mergedCells,
      newDir: 'rtl' | 'ltr' = direction
    ) => {
      setColumns(newCols);
      setRows(newRows);
      setCellFormats(newFormats);
      setMergedCells(newMerged);
      setDirection(newDir);
      scheduleSave(newCols, newRows, newFormats, newMerged, newDir);
    },
    [cellFormats, mergedCells, direction, scheduleSave]
  );

  // ==========================
  // EVALUATION ENGINE
  // ==========================
  const cellCoordMap = useMemo(() => {
    const map: Record<string, any> = {};
    if (!Array.isArray(rows)) return map;
    rows.forEach((r, rIdx) => {
      const rowNum = rIdx + 1;
      columns.forEach((c) => {
        const coord = `${c.id}${rowNum}`.toUpperCase();
        map[coord] = r[c.id] !== undefined ? r[c.id] : '';
      });
    });
    return map;
  }, [rows, columns]);

  const evaluatedMap = useMemo(() => {
    const map: Record<string, any> = {};
    Object.keys(cellCoordMap).forEach((coord) => {
      const val = cellCoordMap[coord];
      if (typeof val === 'string' && val.startsWith('=')) {
        try {
          map[coord] = evaluateFormula(val, cellCoordMap);
        } catch (err) {
          console.error('Formula evaluation failed for', coord, err);
          map[coord] = '#ERROR!';
        }
      } else {
        map[coord] = val;
      }
    });
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
      for (const m of mergedCells) {
        const s = parseCoord(m.start);
        const e = parseCoord(m.end);
        if (!s || !e) continue;
        const c1 = Math.min(s.colIdx, e.colIdx);
        const c2 = Math.max(s.colIdx, e.colIdx);
        const r1 = Math.min(s.rowIdx, e.rowIdx);
        const r2 = Math.max(s.rowIdx, e.rowIdx);
        if (colIdx >= c1 && colIdx <= c2 && rowIdx >= r1 && rowIdx <= r2) {
          return { merge: m, isStart: colIdx === s.colIdx && rowIdx === s.rowIdx };
        }
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
      return merges.filter((m) => {
        const s = parseCoord(m.start);
        const e = parseCoord(m.end);
        if (!s || !e) return false;
        const c2 = Math.max(s.colIdx, e.colIdx);
        const r2 = Math.max(s.rowIdx, e.rowIdx);
        return c2 < colCount && r2 < rowCount;
      });
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

  const commitCellEdit = useCallback(() => {
    setIsEditing(false);
    const currentVal = rows[safeActiveCell.rowIdx]?.[activeColId];
    if (currentVal === editValue) return;

    pushHistory(`Edit ${activeCoordStr}`);
    const newRows = rows.map((r, i) =>
      i === safeActiveCell.rowIdx ? { ...r, [activeColId]: editValue } : r
    );
    commitChanges(columns, newRows);
  }, [rows, safeActiveCell, activeColId, activeCoordStr, editValue, pushHistory, commitChanges, columns]);

  const cancelCellEdit = () => {
    setIsEditing(false);
    setEditValue(String(rows[safeActiveCell.rowIdx]?.[activeColId] ?? ''));
  };

  // ==========================
  // UNDO / REDO
  // ==========================
  const snapshotCurrent = (): HistoryEntry => ({
    columns: JSON.parse(JSON.stringify(columns)),
    rows: JSON.parse(JSON.stringify(rows)),
    cellFormats: JSON.parse(JSON.stringify(cellFormats || {})),
    mergedCells: JSON.parse(JSON.stringify(mergedCells || [])),
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
    const idx = position === 'end' ? rows.length : position === 'above' ? safeActiveCell.rowIdx : safeActiveCell.rowIdx + 1;
    pushHistory(`Insert row at ${idx + 1}`);
    const next = opsInsertRow({ columns, rows, cellFormats, mergedCells }, idx);
    commitChanges(next.columns, next.rows, next.cellFormats, pruneMerges(next.mergedCells, next.columns.length, next.rows.length), direction);
    setActiveCell({ colIdx: safeActiveCell.colIdx, rowIdx: idx });
    setSelectionAnchor(null);
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
    const idx = position === 'end' ? columns.length : position === 'before' ? safeActiveCell.colIdx : safeActiveCell.colIdx + 1;
    pushHistory(`Insert column at ${idx + 1}`);
    const next = opsInsertColumn(
      { columns, rows, cellFormats, mergedCells },
      idx,
      isAr ? 'عمود' : 'Column',
      isAr ? 'Column' : 'Column'
    );
    commitChanges(next.columns, next.rows, next.cellFormats, pruneMerges(next.mergedCells, next.columns.length, next.rows.length), direction);
    setActiveCell({ colIdx: idx, rowIdx: safeActiveCell.rowIdx });
    setSelectionAnchor(null);
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
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;

    if (text.includes('\t') || text.includes('\n')) {
      e.preventDefault();
      pushHistory('Paste Range');

      const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
      const startColIdx = safeActiveCell.colIdx;
      const startRowIdx = safeActiveCell.rowIdx;

      let newCols = [...columns];
      let newRows = [...rows];

      lines.forEach((line, rOffset) => {
        const targetRow = startRowIdx + rOffset;
        while (targetRow >= newRows.length) {
          const emptyRow: Record<string, any> = {};
          newCols.forEach((c) => (emptyRow[c.id] = ''));
          newRows.push(emptyRow);
        }

        const values = line.split('\t');
        values.forEach((val, cOffset) => {
          const targetColIdx = startColIdx + cOffset;
          while (targetColIdx >= newCols.length) {
            const nextLetter = colIndexToName(newCols.length);
            newCols.push({
              id: nextLetter,
              name: nextLetter,
              type: 'text',
              width: 130,
            });
            newRows = newRows.map((r) => ({ ...r, [nextLetter]: '' }));
          }

          const colId = newCols[targetColIdx].id;
          newRows[targetRow] = {
            ...newRows[targetRow],
            [colId]: val.trim(),
          };
        });
      });

      commitChanges(newCols, newRows, cellFormats, pruneMerges(mergedCells, newCols.length, newRows.length), direction);
      toast.success(isAr ? 'تم لصق البيانات المجدولة بنجاح' : 'Pasted tabular data successfully');
    }
  };

  // ==========================
  // KEYBOARD NAVIGATION
  // ==========================
  const moveCursor = (dCol: number, dRow: number) => {
    const nextCol = Math.min(Math.max(safeActiveCell.colIdx + dCol, 0), columns.length - 1);
    const nextRow = Math.min(Math.max(safeActiveCell.rowIdx + dRow, 0), rows.length - 1);
    setActiveCell({ colIdx: nextCol, rowIdx: nextRow });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
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
        commitCellEdit();
        const cIdx = safeActiveCell.colIdx;
        if (e.shiftKey) {
          if (cIdx > 0) setActiveCell({ colIdx: cIdx - 1, rowIdx: safeActiveCell.rowIdx });
        } else if (cIdx < columns.length - 1) {
          setActiveCell({ colIdx: cIdx + 1, rowIdx: safeActiveCell.rowIdx });
        } else if (safeActiveCell.rowIdx < rows.length - 1) {
          setActiveCell({ colIdx: 0, rowIdx: safeActiveCell.rowIdx + 1 });
        }
      }
      return;
    }

    if (rows.length === 0 || columns.length === 0) return;

    // In RTL the visual arrow semantics invert so navigation stays intuitive
    const rtlFactor = direction === 'rtl' ? -1 : 1;

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveCursor(0, -1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveCursor(0, 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      moveCursor(-1 * rtlFactor, 0);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      moveCursor(1 * rtlFactor, 0);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const cIdx = safeActiveCell.colIdx;
      if (e.shiftKey) {
        if (cIdx > 0) setActiveCell({ colIdx: cIdx - 1, rowIdx: safeActiveCell.rowIdx });
      } else if (cIdx < columns.length - 1) {
        setActiveCell({ colIdx: cIdx + 1, rowIdx: safeActiveCell.rowIdx });
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
      const updatedRow = { ...r };
      const coord = `${col.id}${rIdx + 1}`.toUpperCase();
      if (res.newCells[coord] !== undefined) {
        updatedRow[col.id] = res.newCells[coord];
      }
      return updatedRow;
    });

    commitChanges(columns, newRows);
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

  const gridTemplateColumns = `44px ${safeColumns.map((c) => `${c.width || 140}px`).join(' ')}`;
  const rowHeaderWidth = 44;

  const activeFormat = cellFormats[activeCoordStr] || {};

  const selectionLabel = selectionRect
    ? `${coordOf(selectionRect.c1, selectionRect.r1)}:${coordOf(selectionRect.c2, selectionRect.r2)}`
    : activeCoordStr;

  return (
    <div
      className={cn(
        'smart-table-wrapper flex flex-col border border-border rounded-xl bg-card shadow-2xs outline-none select-none my-3',
        isFullScreen && 'fixed inset-0 z-50 rounded-none border-none bg-background p-4 sm:p-6 overflow-y-auto',
        isFormulaMode && 'ring-2 ring-blue-400/60'
      )}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      dir={isAr ? 'rtl' : 'ltr'}
    >
      {/* ============ 1. TOP TOOLBAR ============ */}
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
              value={table?.name || (isAr ? 'جدول' : 'Table')}
              onChange={(e) => {
                if (readOnly || !table) return;
                setTable({ ...table, name: e.target.value });
              }}
              onBlur={(e) => {
                if (readOnly || !table) return;
                if (table.name !== e.target.value) {
                  pushHistory('Rename table');
                  scheduleSave(columns, rows, cellFormats, mergedCells, direction);
                }
              }}
              className="bg-transparent font-bold text-foreground focus:outline-none focus:underline min-w-0 w-28 sm:w-40 truncate"
              aria-label={isAr ? 'اسم الجدول' : 'Table name'}
              readOnly={readOnly}
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

      {/* ============ 2. FORMULA BAR ============ */}
      <div className="formula-bar flex flex-wrap items-center gap-2 border-b border-border/80 bg-background px-3 py-1.5">
        <div
          className="flex h-7 w-16 items-center justify-center rounded-md border border-border bg-muted/60 font-mono text-xs font-bold text-foreground shrink-0 shadow-2xs select-none"
          aria-label={isAr ? `الخلية النشطة ${selectionLabel}` : `Active cell ${selectionLabel}`}
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

        <div className="relative flex-1 flex items-center min-w-[140px]">
          <input
            ref={formulaBarInputRef}
            type="text"
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
            onFocus={() => {
              if (!isEditing) {
                setEditValue(String(activeRawValue));
                setIsEditing(true);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitCellEdit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelCellEdit();
              }
            }}
            placeholder={
              isAr
                ? 'قيمة أو صيغة مثل =C2+D2 أو =SUM(C2,D2,E2)'
                : 'Value or formula like =C2+D2 or =SUM(C2,D2,E2)'
            }
            className="h-7 w-full rounded-md border border-border/70 bg-transparent px-2 text-xs font-mono text-foreground focus:border-olive-600 focus:outline-none focus:ring-1 focus:ring-olive-600"
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
        className="smart-table-frame w-full max-w-full overflow-x-auto overflow-y-visible overscroll-x-contain relative border-t border-border/60"
        dir={direction}
      >
        <div
          role="grid"
          aria-label={isAr ? 'شبكة الجدول' : 'Table grid'}
          className="smart-table-grid min-w-[640px] border-collapse text-xs"
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
            className="bg-muted/60 border-e border-b border-border p-1.5 text-center font-bold text-[10px] text-muted-foreground select-none"
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
                  'group relative border-e border-b border-border p-1 text-center text-muted-foreground select-none',
                  isBetween && 'bg-blue-500/10'
                )}
                style={{ direction: isAr ? 'rtl' : 'ltr' }}
                aria-label={isAr ? `العمود ${col.id}` : `Column ${col.id}`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-mono text-foreground font-bold text-[10px] shrink-0">{col.id}</span>
                  <input
                    type="text"
                    value={col.name}
                    onChange={(e) => {
                      if (readOnly) return;
                      const newCols = columns.map((c) =>
                        c.id === col.id ? { ...c, name: e.target.value } : c
                      );
                      commitChanges(newCols, rows);
                    }}
                    className="w-full bg-transparent text-center font-medium text-xs text-muted-foreground hover:text-foreground focus:text-foreground focus:outline-none truncate"
                    title={isAr ? 'تعديل اسم العمود' : 'Rename column'}
                    readOnly={readOnly}
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
                  className="group relative border-e border-b border-border bg-muted/40 p-1 text-center font-mono text-[11px] font-semibold text-muted-foreground select-none flex items-center justify-center"
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
                        'relative border-e border-b border-border/60 p-0 text-xs transition-colors cursor-cell',
                        isSelected
                          ? 'ring-2 ring-[#2E4034] dark:ring-emerald-400 ring-inset bg-[#2E4034]/5 z-10'
                          : inSelection
                          ? 'bg-blue-500/10'
                          : 'hover:bg-muted/30',
                        isDragTarget && 'bg-[#2E4034]/15'
                      )}
                    >
                      {isSelected && isEditing ? (
                        <input
                          ref={editInputRef}
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              commitCellEdit();
                              if (safeActiveCell.rowIdx < rows.length - 1) {
                                setActiveCell((prev) => ({ ...prev, rowIdx: prev.rowIdx + 1 }));
                              }
                            } else if (e.key === 'Escape') {
                              e.preventDefault();
                              cancelCellEdit();
                            }
                          }}
                          onBlur={commitCellEdit}
                          dir="auto"
                          className="w-full h-full min-h-[34px] p-2 bg-background text-xs font-mono text-foreground focus:outline-none"
                          aria-label={isAr ? `تحرير الخلية ${coord}` : `Editing cell ${coord}`}
                        />
                      ) : (
                        <div
                          className="w-full h-full min-h-[34px] px-2 py-1.5 flex items-center overflow-hidden"
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
