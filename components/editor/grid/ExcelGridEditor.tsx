'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { TableEntity, TableColumnEntity } from '@/lib/types';
import {
  colIndexToName,
  colNameToIndex,
  evaluateFormula,
} from '@/lib/grid/formula-parser';
import {
  executeAutofill,
  AutofillMode,
  CellChange,
} from '@/lib/grid/autofill-engine';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import {
  Plus,
  Trash2,
  Undo2,
  Redo2,
  Sparkles,
  Copy,
  ChevronDown,
  Table as TableIcon,
  HelpCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface ExcelGridEditorProps {
  table: TableEntity;
  onChange: (updatedTable: TableEntity) => void;
  readOnly?: boolean;
}

interface HistoryEntry {
  columns: TableColumnEntity[];
  rows: Record<string, any>[];
  description: string;
}

export function ExcelGridEditor({ table, onChange, readOnly = false }: ExcelGridEditorProps) {
  const { lang } = useLanguage();
  const isAr = lang === 'ar';

  // Columns and Rows state
  const [columns, setColumns] = useState<TableColumnEntity[]>(table.columns_data || []);
  const [rows, setRows] = useState<Record<string, any>[]>(table.rows_data || []);

  // Active cell: colName ('A', 'B', etc.) and rowIndex (0-indexed)
  const [activeCell, setActiveCell] = useState<{ col: string; rowIdx: number }>({
    col: columns[0]?.id || 'A',
    rowIdx: 0,
  });

  // Editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);
  const formulaBarInputRef = useRef<HTMLInputElement>(null);

  // Drag Autofill state
  const [isDraggingHandle, setIsDraggingHandle] = useState(false);
  const [dragTargetRowIdx, setDragTargetRowIdx] = useState<number | null>(null);
  const [lastAutofillInfo, setLastAutofillInfo] = useState<{
    targetRowIdx: number;
    col: string;
    mode: AutofillMode;
  } | null>(null);
  const [showAutofillMenu, setShowAutofillMenu] = useState(false);

  // Undo / Redo History
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryEntry[]>([]);

  // Sync state if external table changes
  useEffect(() => {
    if (table.columns_data && table.columns_data.length > 0) {
      setColumns(table.columns_data);
    }
    if (table.rows_data) {
      setRows(table.rows_data);
    }
  }, [table.id]);

  // Push state to undo history
  const pushHistory = useCallback(
    (desc: string, cols = columns, r = rows) => {
      setHistory((prev) => [
        ...prev.slice(-30), // keep last 30 actions
        {
          columns: JSON.parse(JSON.stringify(cols)),
          rows: JSON.parse(JSON.stringify(r)),
          description: desc,
        },
      ]);
      setRedoStack([]);
    },
    [columns, rows]
  );

  // Commit updates to parent
  const commitChanges = useCallback(
    (newCols: TableColumnEntity[], newRows: Record<string, any>[]) => {
      setColumns(newCols);
      setRows(newRows);
      onChange({
        ...table,
        columns_data: newCols,
        rows_data: newRows,
        updated_at: new Date().toISOString(),
      });
    },
    [table, onChange]
  );

  // Map of all cell coordinates to raw values for formula evaluator
  const cellCoordMap = useMemo(() => {
    const map: Record<string, any> = {};
    rows.forEach((r, rIdx) => {
      const rowNum = rIdx + 1;
      columns.forEach((c) => {
        const coord = `${c.id}${rowNum}`.toUpperCase();
        map[coord] = r[c.id] !== undefined ? r[c.id] : '';
      });
    });
    return map;
  }, [rows, columns]);

  // Evaluated values for each cell coordinate
  const evaluatedMap = useMemo(() => {
    const map: Record<string, any> = {};
    Object.keys(cellCoordMap).forEach((coord) => {
      const val = cellCoordMap[coord];
      if (typeof val === 'string' && val.startsWith('=')) {
        map[coord] = evaluateFormula(val, cellCoordMap);
      } else {
        map[coord] = val;
      }
    });
    return map;
  }, [cellCoordMap]);

  // Active cell coordinate string, e.g. "B2"
  const activeCoordStr = `${activeCell.col}${activeCell.rowIdx + 1}`;
  const activeRawValue = rows[activeCell.rowIdx]?.[activeCell.col] ?? '';

  // Handle cell selection
  const handleSelectCell = (col: string, rowIdx: number) => {
    if (isEditing) {
      commitCellEdit();
    }
    setActiveCell({ col, rowIdx });
    setEditValue(String(rows[rowIdx]?.[col] ?? ''));
    setShowAutofillMenu(false);
  };

  // Start in-cell editing
  const startEditing = (initialVal?: string) => {
    if (readOnly) return;
    setIsEditing(true);
    const val = initialVal !== undefined ? initialVal : String(rows[activeCell.rowIdx]?.[activeCell.col] ?? '');
    setEditValue(val);
    setTimeout(() => {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }, 10);
  };

  // Commit in-cell or formula bar edit
  const commitCellEdit = () => {
    setIsEditing(false);
    const currentVal = rows[activeCell.rowIdx]?.[activeCell.col];
    if (currentVal === editValue) return;

    pushHistory(`Edit ${activeCoordStr}`);
    const newRows = [...rows];
    newRows[activeCell.rowIdx] = {
      ...newRows[activeCell.rowIdx],
      [activeCell.col]: editValue,
    };
    commitChanges(columns, newRows);
  };

  // Cancel edit
  const cancelCellEdit = () => {
    setIsEditing(false);
    setEditValue(String(rows[activeCell.rowIdx]?.[activeCell.col] ?? ''));
  };

  // Undo action
  const handleUndo = () => {
    if (history.length === 0) return;
    const last = history[history.length - 1];
    setHistory((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [
      ...prev,
      {
        columns: JSON.parse(JSON.stringify(columns)),
        rows: JSON.parse(JSON.stringify(rows)),
        description: 'Current State',
      },
    ]);
    commitChanges(last.columns, last.rows);
  };

  // Redo action
  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));
    setHistory((prev) => [
      ...prev,
      {
        columns: JSON.parse(JSON.stringify(columns)),
        rows: JSON.parse(JSON.stringify(rows)),
        description: 'Before Redo',
      },
    ]);
    commitChanges(next.columns, next.rows);
  };

  // Keyboard navigation & shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Global shortcuts: Ctrl+Z and Ctrl+Y
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      if (e.shiftKey) handleRedo();
      else handleUndo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
      e.preventDefault();
      handleRedo();
      return;
    }

    if (isEditing) {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitCellEdit();
        // Move down 1 row
        if (activeCell.rowIdx < rows.length - 1) {
          setActiveCell((prev) => ({ ...prev, rowIdx: prev.rowIdx + 1 }));
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelCellEdit();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        commitCellEdit();
        // Move right 1 column
        const cIdx = columns.findIndex((c) => c.id === activeCell.col);
        if (cIdx < columns.length - 1) {
          setActiveCell({ col: columns[cIdx + 1].id, rowIdx: activeCell.rowIdx });
        }
      }
      return;
    }

    // Navigation when NOT editing
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (activeCell.rowIdx > 0) {
        setActiveCell((prev) => ({ ...prev, rowIdx: prev.rowIdx - 1 }));
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (activeCell.rowIdx < rows.length - 1) {
        setActiveCell((prev) => ({ ...prev, rowIdx: prev.rowIdx + 1 }));
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const cIdx = columns.findIndex((c) => c.id === activeCell.col);
      const nextIdx = isAr ? cIdx + 1 : cIdx - 1;
      if (nextIdx >= 0 && nextIdx < columns.length) {
        setActiveCell({ col: columns[nextIdx].id, rowIdx: activeCell.rowIdx });
      }
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      const cIdx = columns.findIndex((c) => c.id === activeCell.col);
      const nextIdx = isAr ? cIdx - 1 : cIdx + 1;
      if (nextIdx >= 0 && nextIdx < columns.length) {
        setActiveCell({ col: columns[nextIdx].id, rowIdx: activeCell.rowIdx });
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      startEditing();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      pushHistory(`Clear ${activeCoordStr}`);
      const newRows = [...rows];
      newRows[activeCell.rowIdx] = {
        ...newRows[activeCell.rowIdx],
        [activeCell.col]: '',
      };
      commitChanges(columns, newRows);
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      // Direct typing into cell starts edit
      startEditing(e.key);
    }
  };

  // Add / Remove Row
  const handleAddRow = (atIndex?: number) => {
    pushHistory('Add Row');
    const idx = atIndex !== undefined ? atIndex : rows.length;
    const newRow: Record<string, any> = {};
    columns.forEach((c) => {
      newRow[c.id] = '';
    });
    const newRows = [...rows.slice(0, idx), newRow, ...rows.slice(idx)];
    commitChanges(columns, newRows);
  };

  const handleDeleteRow = (rowIdx: number) => {
    if (rows.length <= 1) return;
    pushHistory(`Delete Row ${rowIdx + 1}`);
    const newRows = rows.filter((_, i) => i !== rowIdx);
    const safeRowIdx = Math.min(activeCell.rowIdx, newRows.length - 1);
    setActiveCell((prev) => ({ ...prev, rowIdx: safeRowIdx }));
    commitChanges(columns, newRows);
  };

  // Add / Remove Column
  const handleAddColumn = () => {
    pushHistory('Add Column');
    const nextColIdx = columns.length;
    const nextColLetter = colIndexToName(nextColIdx);
    const newCol: TableColumnEntity = {
      id: nextColLetter,
      name: `${isAr ? 'عمود' : 'Column'} ${nextColLetter}`,
      type: 'text',
      width: 130,
    };
    const newCols = [...columns, newCol];
    const newRows = rows.map((r) => ({ ...r, [nextColLetter]: '' }));
    commitChanges(newCols, newRows);
  };

  const handleDeleteColumn = (colId: string) => {
    if (columns.length <= 1) return;
    pushHistory(`Delete Column ${colId}`);
    const newCols = columns.filter((c) => c.id !== colId);
    const safeCol = newCols[0]?.id || 'A';
    setActiveCell((prev) => ({ ...prev, col: safeCol }));
    const newRows = rows.map((r) => {
      const copy = { ...r };
      delete copy[colId];
      return copy;
    });
    commitChanges(newCols, newRows);
  };

  // Drag Autofill Handlers
  const handleMouseDownOnHandle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (readOnly) return;
    setIsDraggingHandle(true);
    setDragTargetRowIdx(activeCell.rowIdx);
  };

  const handleMouseEnterCellDuringDrag = (rowIdx: number) => {
    if (isDraggingHandle) {
      setDragTargetRowIdx(rowIdx);
    }
  };

  const handleMouseUpAfterDrag = () => {
    if (!isDraggingHandle || dragTargetRowIdx === null) {
      setIsDraggingHandle(false);
      setDragTargetRowIdx(null);
      return;
    }

    const startR = activeCell.rowIdx;
    const endR = dragTargetRowIdx;
    setIsDraggingHandle(false);
    setDragTargetRowIdx(null);

    if (startR === endR) return;

    // Apply Autofill with default mode 'fill_series'
    applyAutofillOperation(activeCell.col, startR, endR, 'fill_series');

    // Show popup menu to toggle to 'copy_cells'
    setLastAutofillInfo({
      targetRowIdx: endR,
      col: activeCell.col,
      mode: 'fill_series',
    });
    setShowAutofillMenu(true);
  };

  // Perform Autofill Execution
  const applyAutofillOperation = (
    col: string,
    sourceRowIdx: number,
    targetRowIdx: number,
    mode: AutofillMode
  ) => {
    pushHistory(`Autofill ${col}${sourceRowIdx + 1}:${col}${targetRowIdx + 1}`);

    const res = executeAutofill({
      sourceRange: {
        startCol: col,
        startRow: sourceRowIdx + 1,
        endCol: col,
        endRow: sourceRowIdx + 1,
      },
      targetRange: {
        startCol: col,
        startRow: sourceRowIdx + 1,
        endCol: col,
        endRow: targetRowIdx + 1,
      },
      currentGridData: cellCoordMap,
      mode,
    });

    const newRows = rows.map((r, rIdx) => {
      const updatedRow = { ...r };
      const rowNum = rIdx + 1;
      const coord = `${col}${rowNum}`.toUpperCase();
      if (res.newCells[coord] !== undefined) {
        updatedRow[col] = res.newCells[coord];
      }
      return updatedRow;
    });

    commitChanges(columns, newRows);
  };

  // Change autofill mode from menu (Fill Series vs Copy Cells)
  const handleChangeAutofillMode = (newMode: AutofillMode) => {
    if (!lastAutofillInfo) return;
    // First undo previous autofill
    handleUndo();
    // Re-apply with new mode
    applyAutofillOperation(
      lastAutofillInfo.col,
      activeCell.rowIdx,
      lastAutofillInfo.targetRowIdx,
      newMode
    );
    setLastAutofillInfo((prev) => (prev ? { ...prev, mode: newMode } : null));
    setShowAutofillMenu(false);
  };

  // Global mouse up for drag release
  useEffect(() => {
    const onGlobalMouseUp = () => {
      if (isDraggingHandle) {
        handleMouseUpAfterDrag();
      }
    };
    window.addEventListener('mouseup', onGlobalMouseUp);
    return () => window.removeEventListener('mouseup', onGlobalMouseUp);
  }, [isDraggingHandle, dragTargetRowIdx, activeCell]);

  return (
    <div
      className="flex flex-col border border-border/80 rounded-xl bg-card shadow-xs overflow-hidden select-none outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* 1. TOP TOOLBAR: Quick Table Actions, Add Row, Add Col, Undo, Redo */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/80 bg-muted/30 px-3 py-2 text-xs">
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={history.length === 0 || readOnly}
            onClick={handleUndo}
            className="h-8 px-2 text-xs font-semibold gap-1"
            title={`${isAr ? 'تراجع' : 'Undo'} (Ctrl+Z)`}
          >
            <Undo2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{isAr ? 'تراجع' : 'Undo'}</span>
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={redoStack.length === 0 || readOnly}
            onClick={handleRedo}
            className="h-8 px-2 text-xs font-semibold gap-1"
            title={`${isAr ? 'إعادة' : 'Redo'} (Ctrl+Y)`}
          >
            <Redo2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{isAr ? 'إعادة' : 'Redo'}</span>
          </Button>

          <div className="h-4 w-px bg-border/60 mx-1" />

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={readOnly}
            onClick={() => handleAddRow()}
            className="h-8 px-2.5 text-xs font-semibold gap-1.5 shadow-2xs"
          >
            <Plus className="h-3.5 w-3.5 text-emerald-600" />
            <span>{isAr ? '+ إضافة صف' : '+ Add Row'}</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={readOnly}
            onClick={handleAddColumn}
            className="h-8 px-2.5 text-xs font-semibold gap-1.5 shadow-2xs"
          >
            <Plus className="h-3.5 w-3.5 text-blue-600" />
            <span>{isAr ? '+ إضافة عمود' : '+ Add Column'}</span>
          </Button>
        </div>

        <div className="flex items-center gap-2 text-muted-foreground text-[11px]">
          <span>
            {rows.length} {isAr ? 'صفوف' : 'rows'} × {columns.length} {isAr ? 'أعمدة' : 'columns'}
          </span>
          <Badge variant="outline" className="text-[10px] font-mono">
            {table.name}
          </Badge>
        </div>
      </div>

      {/* 2. FORMULA BAR */}
      <div className="flex items-center gap-2 border-b border-border/80 bg-background px-3 py-1.5">
        {/* Active Cell Address Badge */}
        <div className="flex h-7 w-14 items-center justify-center rounded-md border border-border/80 bg-muted/50 font-mono text-xs font-bold text-foreground shrink-0 shadow-2xs">
          {activeCoordStr}
        </div>

        {/* Function Icon */}
        <div className="flex items-center justify-center text-muted-foreground font-serif italic text-sm px-1">
          fx
        </div>

        {/* Formula Bar Input */}
        <input
          ref={formulaBarInputRef}
          type="text"
          value={isEditing ? editValue : String(activeRawValue)}
          onChange={(e) => {
            if (!isEditing) setIsEditing(true);
            setEditValue(e.target.value);
          }}
          onFocus={() => {
            if (!isEditing) {
              setEditValue(String(activeRawValue));
              setIsEditing(true);
            }
          }}
          onBlur={() => {
            if (isEditing) commitCellEdit();
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
          placeholder={isAr ? 'اكتب قيمة أو دالة رياضية مثل: =SUM(B1:B5) أو =IF(C1>10, "نعم", "لا")' : 'Enter value or formula like =SUM(A1:A5)'}
          className="h-7 flex-1 rounded-md border border-border/60 bg-transparent px-2 text-xs font-mono text-foreground focus:border-olive-600 focus:outline-none focus:ring-1 focus:ring-olive-600"
          readOnly={readOnly}
        />
      </div>

      {/* 3. EXCEL SPREADSHEET GRID */}
      <div className="relative max-h-[520px] overflow-auto border-t border-border/60">
        <table className="w-full border-collapse text-xs">
          {/* Column Header Row */}
          <thead>
            <tr className="bg-muted/60 sticky top-0 z-20 border-b border-border">
              {/* Corner Cell */}
              <th className="w-10 border-r border-border p-1 text-center font-bold text-[10px] text-muted-foreground select-none">
                #
              </th>
              {columns.map((col) => (
                <th
                  key={col.id}
                  style={{ width: col.width || 140, minWidth: 100 }}
                  className="group relative border-r border-border p-2 text-center font-bold text-muted-foreground select-none"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono text-foreground font-bold">{col.id}</span>
                    <input
                      type="text"
                      value={col.name}
                      onChange={(e) => {
                        const newCols = columns.map((c) =>
                          c.id === col.id ? { ...c, name: e.target.value } : c
                        );
                        commitChanges(newCols, rows);
                      }}
                      className="w-full bg-transparent text-center font-medium text-xs text-muted-foreground hover:text-foreground focus:text-foreground focus:outline-none truncate"
                      title={isAr ? 'انقر لتعديل اسم العمود' : 'Click to rename column'}
                    />
                    <button
                      type="button"
                      onClick={() => handleDeleteColumn(col.id)}
                      className="opacity-0 group-hover:opacity-100 hover:text-red-500 p-0.5 rounded transition-opacity"
                      title={isAr ? 'حذف هذا العمود' : 'Delete column'}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          {/* Table Data Rows */}
          <tbody>
            {rows.map((row, rIdx) => {
              const rowNum = rIdx + 1;
              const isDragHighlightedRow =
                isDraggingHandle &&
                dragTargetRowIdx !== null &&
                ((dragTargetRowIdx >= activeCell.rowIdx &&
                  rIdx > activeCell.rowIdx &&
                  rIdx <= dragTargetRowIdx) ||
                  (dragTargetRowIdx <= activeCell.rowIdx &&
                    rIdx < activeCell.rowIdx &&
                    rIdx >= dragTargetRowIdx));

              return (
                <tr
                  key={rIdx}
                  className="border-b border-border/60 hover:bg-muted/20 transition-colors"
                >
                  {/* Row Header Number */}
                  <td className="group relative w-10 border-r border-border bg-muted/40 p-1 text-center font-mono text-[11px] font-semibold text-muted-foreground select-none">
                    <span>{rowNum}</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteRow(rIdx)}
                      className="absolute inset-y-0 start-0 w-4 items-center justify-center opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity hidden sm:flex"
                      title={isAr ? 'حذف هذا الصف' : 'Delete row'}
                    >
                      <Trash2 className="h-2.5 w-2.5" />
                    </button>
                  </td>

                  {/* Cell Columns */}
                  {columns.map((col) => {
                    const coord = `${col.id}${rowNum}`.toUpperCase();
                    const isSelected = activeCell.col === col.id && activeCell.rowIdx === rIdx;
                    const isDragTarget = isDragHighlightedRow && col.id === activeCell.col;
                    const rawVal = row[col.id];
                    const displayVal = evaluatedMap[coord] !== undefined ? evaluatedMap[coord] : rawVal;

                    return (
                      <td
                        key={col.id}
                        onClick={() => handleSelectCell(col.id, rIdx)}
                        onDoubleClick={() => startEditing()}
                        onMouseEnter={() => handleMouseEnterCellDuringDrag(rIdx)}
                        className={cn(
                          'relative border-r border-border p-0 text-xs transition-colors cursor-cell',
                          isSelected
                            ? 'ring-2 ring-[#2E4034] dark:ring-emerald-400 ring-inset bg-[#2E4034]/5 z-10'
                            : 'hover:bg-muted/30',
                          isDragTarget && 'bg-[#2E4034]/15 border-dashed border-[#2E4034]'
                        )}
                      >
                        {isSelected && isEditing ? (
                          <input
                            ref={editInputRef}
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={commitCellEdit}
                            className="w-full h-full p-2 bg-background text-xs font-mono text-foreground focus:outline-none"
                          />
                        ) : (
                          <div className="w-full h-full min-h-[34px] p-2 flex items-center justify-between gap-1 overflow-hidden">
                            <span
                              className={cn(
                                'truncate font-normal',
                                typeof displayVal === 'number' && 'font-mono text-end w-full',
                                typeof displayVal === 'string' &&
                                  displayVal.startsWith('#') &&
                                  'font-bold text-red-500',
                                typeof rawVal === 'string' && rawVal.startsWith('=') && 'font-mono font-medium'
                              )}
                            >
                              {displayVal !== null && displayVal !== undefined ? String(displayVal) : ''}
                            </span>
                          </div>
                        )}

                        {/* Drag Handle on Bottom-Right corner of Active Cell */}
                        {isSelected && !isEditing && !readOnly && (
                          <div
                            onMouseDown={handleMouseDownOnHandle}
                            className="absolute -bottom-1 -end-1 h-2.5 w-2.5 bg-[#2E4034] dark:bg-emerald-400 border border-white dark:border-black rounded-xs cursor-crosshair z-20 hover:scale-125 transition-transform"
                            title={isAr ? 'سحب التعبئة التلقائية (Autofill Drag Handle)' : 'Drag to autofill'}
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 4. AUTOFILL OPTIONS POPUP (Fill Series vs Copy Cells) */}
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
            >
              {isAr ? 'تعبئة السلسلة (Fill Series)' : 'Fill Series'}
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
            >
              {isAr ? 'نسخ الخلايا (Copy Cells)' : 'Copy Cells'}
            </Button>

            <button
              type="button"
              onClick={() => setShowAutofillMenu(false)}
              className="text-muted-foreground hover:text-foreground text-xs p-1"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
