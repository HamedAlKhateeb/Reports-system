/**
 * HYBRID TABLE STRUCTURAL OPERATIONS ENGINE
 *
 * Single source of truth for every structural mutation of the unified table:
 * - Insert/delete rows & columns at a precise index (with reference remapping)
 * - Full transpose (values, formulas, formats, merges)
 * - Context-aware formula reference insertion (arithmetic vs function args)
 *
 * All functions are PURE: they receive the current table state and return the
 * next state without touching React or the DOM. Crash-safe by construction:
 * indices are always clamped and remapping never throws.
 */

import {
  colIndexToName,
  colNameToIndex,
  remapFormulaRefs,
  ERROR_VALUES,
} from './formula-parser';
import type { TableColumnEntity } from '../types';

// ==========================================
// TYPES
// ==========================================

export interface CellFormat {
  align?: 'left' | 'center' | 'right' | 'justify';
  horizontalAlign?: 'left' | 'center' | 'right' | 'justify';
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

export interface MergedRange {
  start: string; // e.g. 'A1'
  end: string; // e.g. 'B2'
  rowSpan?: number;
  colSpan?: number;
}

export interface TableState {
  columns: TableColumnEntity[];
  rows: Record<string, any>[];
  cellFormats: Record<string, CellFormat>;
  mergedCells: MergedRange[];
}

function makeEmptyRow(columns: TableColumnEntity[]): Record<string, any> {
  const row: Record<string, any> = {};
  columns.forEach((c) => {
    row[c.id] = '';
  });
  return row;
}

function reIdColumns(
  columns: TableColumnEntity[]
): { columns: TableColumnEntity[]; colMap: Record<string, string> } {
  const colMap: Record<string, string> = {};
  const next = columns.map((c, idx) => {
    const newId = colIndexToName(idx);
    colMap[c.id] = newId;
    return { ...c, id: newId };
  });
  return { columns: next, colMap };
}

function remapRows(
  rows: Record<string, any>[],
  colMap: Record<string, string>
): Record<string, any>[] {
  return rows.map((row) => {
    const newRow: Record<string, any> = {};
    Object.keys(row).forEach((key) => {
      newRow[colMap[key] || key] = row[key];
    });
    return newRow;
  });
}

function remapFormats(
  formats: Record<string, CellFormat>,
  colMap: Record<string, string>
): Record<string, CellFormat> {
  const next: Record<string, CellFormat> = {};
  Object.keys(formats).forEach((coord) => {
    const m = coord.match(/^([A-Za-z]+)([0-9]+)$/);
    if (!m) return;
    const newCol = colMap[m[1].toUpperCase()] || m[1].toUpperCase();
    next[`${newCol}${m[2]}`] = formats[coord];
  });
  return next;
}

function remapMerges(
  merges: MergedRange[],
  colMap: Record<string, string>
): MergedRange[] {
  const remapOne = (coord: string): string => {
    const m = coord.match(/^([A-Za-z]+)([0-9]+)$/);
    if (!m) return coord;
    const newCol = colMap[m[1].toUpperCase()] || m[1].toUpperCase();
    return `${newCol}${m[2]}`;
  };
  return merges.map((m) => ({
    ...m,
    start: remapOne(m.start),
    end: remapOne(m.end),
  }));
}

/**
 * Remaps every formula in every row through a coordinate transform.
 * Used by insert/delete row & column so dependent formulas stay correct.
 */
function remapAllFormulas(
  rows: Record<string, any>[],
  mapRef: (colIndex: number, rowIndex: number) => { colIndex: number; rowIndex: number } | null
): Record<string, any>[] {
  return rows.map((row) => {
    const newRow: Record<string, any> = {};
    Object.keys(row).forEach((key) => {
      const val = row[key];
      newRow[key] =
        typeof val === 'string' && val.startsWith('=')
          ? remapFormulaRefs(val, mapRef)
          : val;
    });
    return newRow;
  });
}

// ==========================================
// INSERT / DELETE ROWS
// ==========================================

export function insertRow(
  state: TableState,
  atIndex: number
): TableState {
  const rows = Array.isArray(state.rows) ? [...state.rows] : [];
  const idx = Math.max(0, Math.min(atIndex, rows.length));
  const newRow = makeEmptyRow(state.columns);
  rows.splice(idx, 0, newRow);

  // References to rows at or below the insertion point shift down by 1.
  // Formats below the insertion point shift down by 1 as well.
  const shiftedFormats: Record<string, CellFormat> = {};
  Object.keys(state.cellFormats).forEach((coord) => {
    const m = coord.match(/^([A-Za-z]+)([0-9]+)$/);
    if (!m) return;
    const rowNum = parseInt(m[2], 10);
    const newRowNum = rowNum >= idx + 1 ? rowNum + 1 : rowNum;
    shiftedFormats[`${m[1].toUpperCase()}${newRowNum}`] = state.cellFormats[coord];
  });

  const remappedRows = remapAllFormulas(rows, (c, r) => {
    if (r >= idx) return { colIndex: c, rowIndex: r + 1 };
    return { colIndex: c, rowIndex: r };
  });

  return { columns: state.columns, rows: remappedRows, cellFormats: shiftedFormats, mergedCells: state.mergedCells };
}

export function deleteRow(
  state: TableState,
  atIndex: number
): TableState {
  const rows = Array.isArray(state.rows) ? [...state.rows] : [];
  if (rows.length <= 1) return state; // Never allow removing the last row
  const idx = Math.max(0, Math.min(atIndex, rows.length - 1));
  rows.splice(idx, 1);

  // Formats on the deleted row vanish; below it they shift up by 1.
  const shiftedFormats: Record<string, CellFormat> = {};
  Object.keys(state.cellFormats).forEach((coord) => {
    const m = coord.match(/^([A-Za-z]+)([0-9]+)$/);
    if (!m) return;
    const rowNum = parseInt(m[2], 10);
    if (rowNum - 1 === idx) return; // format belonged to the deleted row
    const newRowNum = rowNum > idx + 1 ? rowNum - 1 : rowNum;
    shiftedFormats[`${m[1].toUpperCase()}${newRowNum}`] = state.cellFormats[coord];
  });

  const remappedRows = remapAllFormulas(rows, (c, r) => {
    if (r === idx) return null; // referenced row itself was deleted
    if (r > idx) return { colIndex: c, rowIndex: r - 1 };
    return { colIndex: c, rowIndex: r };
  });

  return { columns: state.columns, rows: remappedRows, cellFormats: shiftedFormats, mergedCells: state.mergedCells };
}

// ==========================================
// INSERT / DELETE COLUMNS
// ==========================================

export function insertColumn(
  state: TableState,
  atIndex: number,
  namePrefixAr: string,
  namePrefixEn: string
): TableState {
  const columns = [...state.columns];
  const idx = Math.max(0, Math.min(atIndex, columns.length));

  // Rebuild the full column list with the new blank column inserted, then
  // re-id every column to its new canonical letter.
  const tempCols = [...columns.slice(0, idx), {
    id: `__new__${idx}`,
    name: `${namePrefixEn} ${colIndexToName(idx)}`,
    type: 'text' as const,
    width: 130,
  } as TableColumnEntity, ...columns.slice(idx)];

  const { columns: newCols, colMap } = reIdColumns(tempCols);

  // Remap formula references on the ORIGINAL column letters first (single
  // pass: references to columns >= insertion index shift right by one),
  // then rename row keys to the new canonical letters.
  const remappedRows = remapAllFormulas(state.rows, (c, r) => {
    if (c >= idx) return { colIndex: c + 1, rowIndex: r };
    return { colIndex: c, rowIndex: r };
  });
  const newRows = remapRows(remappedRows, colMap).map((row) => {
    const newRow = { ...row };
    const newId = colMap[`__new__${idx}`];
    if (newId && newRow[newId] === undefined) newRow[newId] = '';
    return newRow;
  });

  // colMap already maps every old column letter to its final new letter, so a
  // single remap pass yields the final format coordinates (no extra shift).
  const shiftedFormats = remapFormats(state.cellFormats, colMap);

  return {
    columns: newCols,
    rows: newRows,
    cellFormats: shiftedFormats,
    mergedCells: remapMerges(state.mergedCells, colMap),
  };
}

export function deleteColumn(
  state: TableState,
  atIndex: number
): TableState {
  const columns = [...state.columns];
  if (columns.length <= 1) return state; // Never allow removing the last column
  const idx = Math.max(0, Math.min(atIndex, columns.length - 1));
  const removedId = columns[idx].id;
  const remaining = columns.filter((_, i) => i !== idx);

  const { columns: newCols, colMap } = reIdColumns(remaining);

  const strippedRows = state.rows.map((row) => {
    const copy = { ...row };
    delete copy[removedId];
    return copy;
  });

  // Remap references on ORIGINAL letters first (single pass), then rename keys.
  const remappedRows = remapAllFormulas(strippedRows, (c, r) => {
    if (c === idx) return null;
    if (c > idx) return { colIndex: c - 1, rowIndex: r };
    return { colIndex: c, rowIndex: r };
  });
  const newRows = remapRows(remappedRows, colMap);

  // colMap already maps surviving columns to their final letters, so a single
  // remap pass produces final coordinates. Formats of the deleted column are
  // dropped by filtering on the pre-map column index.
  const survivingCoords: Record<string, CellFormat> = {};
  Object.keys(state.cellFormats).forEach((coord) => {
    const m = coord.match(/^([A-Za-z]+)([0-9]+)$/);
    if (!m) return;
    if (colNameToIndex(m[1].toUpperCase()) === idx) return; // deleted column
    survivingCoords[coord] = state.cellFormats[coord];
  });
  const shiftedFormats = remapFormats(survivingCoords, colMap);

  // Drop merges touching the deleted column, remap the rest.
  const merges = remapMerges(
    state.mergedCells.filter((m) => {
      const s = m.start.match(/^([A-Za-z]+)([0-9]+)$/);
      const e = m.end.match(/^([A-Za-z]+)([0-9]+)$/);
      if (!s || !e) return true;
      return (
        colNameToIndex(s[1].toUpperCase()) !== idx &&
        colNameToIndex(e[1].toUpperCase()) !== idx
      );
    }),
    colMap
  );

  return {
    columns: newCols,
    rows: newRows,
    cellFormats: shiftedFormats,
    mergedCells: merges,
  };
}

// ==========================================
// TRANSPOSE
// ==========================================

/**
 * Transposes the whole table (rows <-> columns) preserving:
 * - values and raw formulas (with fully remapped references)
 * - cell formats
 * - rectangular merges that still fit the new dimensions
 *
 * Old coordinate (colIndex C, rowIndex R) becomes
 * new coordinate (colIndex R, rowIndex C).
 */
export function transposeTable(state: TableState): TableState {
  const rows = Array.isArray(state.rows) ? state.rows : [];
  const columns = state.columns;
  if (rows.length === 0 || columns.length === 0) return state;

  // New column count = old row count.
  const newColumns: TableColumnEntity[] = rows.map((_, rIdx) => ({
    id: colIndexToName(rIdx),
    name: colIndexToName(rIdx),
    type: 'text',
    width: 130,
  }));

  // New row count = old column count. Every old column becomes a new row.
  const newRows: Record<string, any>[] = columns.map((oldCol) => {
    const newRowObj: Record<string, any> = {};
    rows.forEach((oldRow, rIdx) => {
      const newColLetter = colIndexToName(rIdx);
      newRowObj[newColLetter] = oldRow[oldCol.id] ?? '';
    });
    return newRowObj;
  });

  // Remap formula references: (C, R) -> (R, C)
  const remappedRows = remapAllFormulas(newRows, (c, r) => {
    return { colIndex: r, rowIndex: c };
  });

  // Remap formats with the same swap.
  const newFormats: Record<string, CellFormat> = {};
  Object.keys(state.cellFormats).forEach((coord) => {
    const m = coord.match(/^([A-Za-z]+)([0-9]+)$/);
    if (!m) return;
    const oldColIdx = colNameToIndex(m[1].toUpperCase());
    const oldRowIdx = parseInt(m[2], 10) - 1;
    const newColName = colIndexToName(oldRowIdx);
    const newFormatsCoord = `${newColName}${oldColIdx + 1}`;
    if (oldRowIdx < newColumns.length && oldColIdx < newRows.length) {
      newFormats[newFormatsCoord] = state.cellFormats[coord];
    }
  });

  // Remap merges: keep only rectangles that still fit after the swap.
  // Old rectangle spanning old columns [sc..ec] and old rows [sr..er]
  // becomes a rectangle spanning NEW columns [sr..er] and NEW rows [sc..ec].
  const newMerges: MergedRange[] = [];
  state.mergedCells.forEach((m) => {
    const s = m.start.match(/^([A-Za-z]+)([0-9]+)$/);
    const e = m.end.match(/^([A-Za-z]+)([0-9]+)$/);
    if (!s || !e) return;
    const sc = colNameToIndex(s[1].toUpperCase());
    const sr = parseInt(s[2], 10) - 1;
    const ec = colNameToIndex(e[1].toUpperCase());
    const er = parseInt(e[2], 10) - 1;
    const newStartCol = Math.min(sr, er);
    const newEndCol = Math.max(sr, er);
    const newStartRow = Math.min(sc, ec);
    const newEndRow = Math.max(sc, ec);
    // newColumns.length = old row count; newRows.length = old column count
    if (
      newEndCol < newColumns.length &&
      newEndRow < newRows.length
    ) {
      newMerges.push({
        start: `${colIndexToName(newStartCol)}${newStartRow + 1}`,
        end: `${colIndexToName(newEndCol)}${newEndRow + 1}`,
        rowSpan: newEndRow - newStartRow + 1,
        colSpan: newEndCol - newStartCol + 1,
      });
    }
  });

  return {
    columns: newColumns,
    rows: remappedRows,
    cellFormats: newFormats,
    mergedCells: newMerges,
  };
}

// ==========================================
// CONTEXT-AWARE FORMULA REFERENCE INSERTION
// ==========================================

/**
 * Computes what should be inserted into the formula string when the user
 * clicks cell `coord` while editing a formula.
 *
 * Arithmetic context ("=C2" + click D2)  -> inserts "D2" directly? NO:
 *   clicking a cell in arithmetic context without an explicit operator is
 *   ambiguous, so the caller decides. This function only reports the context.
 *
 * Function-args context ("=SUM(C2" + click D2) -> auto-inserts "," before the ref.
 *
 * Returns:
 *   insert: the exact string to splice at the cursor ("," + coord, or coord)
 *   context: 'function-args' | 'arithmetic' | 'start'
 */
export function computeReferenceInsertion(
  formula: string,
  cursorPos: number
): { insert: (coord: string) => string; context: 'function-args' | 'arithmetic' | 'start' } {
  const before = formula.slice(0, cursorPos);

  // Walk the prefix keeping a stack of open parens. The top of the stack is
  // the function (or group) whose arguments the cursor currently sits in.
  // `argLevelChars` records the last significant char seen at that level.
  const openParens: number[] = [];
  let lastSignificantAtCurrentLevel = '';
  let levelJustOpened = false; // last significant event was opening a paren

  for (let i = 0; i < before.length; i++) {
    const ch = before[i];
    if (/\s/.test(ch)) continue;

    if (ch === '(') {
      openParens.push(i);
      lastSignificantAtCurrentLevel = '(';
      levelJustOpened = true;
      continue;
    }
    if (ch === ')') {
      openParens.pop();
      lastSignificantAtCurrentLevel = ')';
      levelJustOpened = false;
      continue;
    }
    lastSignificantAtCurrentLevel = ch;
    levelJustOpened = false;
  }

  // Cursor sits inside an unclosed function call's argument list
  if (openParens.length > 0) {
    const afterCommaOrOpen =
      lastSignificantAtCurrentLevel === ',' || levelJustOpened;
    if (afterCommaOrOpen) {
      return { insert: (coord) => coord, context: 'function-args' };
    }
    // After a complete value inside function args: start a new argument.
    return { insert: (coord) => `,${coord}`, context: 'function-args' };
  }

  // Arithmetic context at top level
  const trimmedFormula = before.trimEnd();
  if (trimmedFormula === '' || trimmedFormula === '=') {
    return {
      insert: (coord) => coord,
      context: 'start',
    };
  }
  const lastCh = trimmedFormula[trimmedFormula.length - 1];
  const afterOperator =
    ['+', '-', '*', '/', '(', ',', '&', '=', '<', '>'].includes(lastCh);
  if (afterOperator) {
    return {
      insert: (coord) => coord,
      context: 'arithmetic',
    };
  }
  // After a value with no operator: ambiguous. Do NOT silently produce "=C2D2".
  return {
    insert: () => '',
    context: 'arithmetic',
  };
}

export { ERROR_VALUES };
