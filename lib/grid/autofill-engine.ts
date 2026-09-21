/**
 * EXCEL-LIKE AUTOFILL & PATTERN RECOGNITION ENGINE
 * 
 * Supports:
 * - Single number series increment (1 -> 2, 3, 4 / 5 -> 6, 7, 8).
 * - Multi-number sequence arithmetic steps (1, 3 -> 5, 7, 9).
 * - Negative arithmetic steps (10, 8 -> 6, 4, 2).
 * - Issue key & alphanumeric sequence (PRB-001 -> PRB-002, PRB-003).
 * - Date progression (2026-09-01 -> 2026-09-02, 2026-09-03).
 * - Formula relative reference adjustment (=A1+B1 -> =A2+B2 or =B1+C1).
 * - "Fill Series" vs "Copy Cells" options.
 * - Single atomic undoable transaction for the entire autofill operation.
 */

import {
  parseCellRef,
  colIndexToName,
  colNameToIndex,
  adjustFormula,
  evaluateFormula,
} from './formula-parser';

export type AutofillMode = 'fill_series' | 'copy_cells';

export interface CellChange {
  col: string;     // Column letter, e.g. 'A'
  row: number;     // Row number 1-indexed
  oldValue: any;
  newValue: any;
}

export interface AutofillResult {
  changes: CellChange[];
  newCells: Record<string, any>;
  affectedRange: string;
}

/**
 * Parses an alphanumeric string with a trailing or embedded number (e.g. "PRB-001", "Item_5", "Row-99")
 */
export function parseAlphanumericPattern(val: string): {
  prefix: string;
  num: number;
  digitsCount: number;
  suffix: string;
} | null {
  const match = val.match(/^(.*?)(\d+)(.*?)$/);
  if (!match) return null;

  const prefix = match[1];
  const digitsStr = match[2];
  const suffix = match[3];
  const num = parseInt(digitsStr, 10);
  const digitsCount = digitsStr.length;

  return { prefix, num, digitsCount, suffix };
}

/**
 * Formats an alphanumeric pattern with incremented number, preserving zero-padding
 */
export function formatAlphanumeric(
  prefix: string,
  num: number,
  digitsCount: number,
  suffix: string
): string {
  const numStr = String(Math.max(0, num)).padStart(digitsCount, '0');
  return `${prefix}${numStr}${suffix}`;
}

/**
 * Checks if a string is a valid ISO date (YYYY-MM-DD)
 */
export function parseIsoDate(val: string): Date | null {
  if (typeof val !== 'string') return null;
  const match = val.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Formats a Date as YYYY-MM-DD
 */
export function formatIsoDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Generates an autofill sequence of values from a 1D source array along a single dimension
 */
export function generateSeriesValues(
  sourceValues: any[],
  targetLength: number,
  mode: AutofillMode = 'fill_series',
  directionMultiplier: number = 1 // 1 for forward (down/right), -1 for backward (up/left)
): any[] {
  if (sourceValues.length === 0 || targetLength <= 0) return [];

  // If user requested "Copy Cells", repeat source cyclically
  if (mode === 'copy_cells') {
    const result: any[] = [];
    for (let i = 0; i < targetLength; i++) {
      result.push(sourceValues[i % sourceValues.length]);
    }
    return result;
  }

  // 1. Formula Series
  const isAllFormulas = sourceValues.every(
    (v) => typeof v === 'string' && v.startsWith('=')
  );
  if (isAllFormulas) {
    // Return raw formulas to be adjusted with coordinates later
    const result: any[] = [];
    for (let i = 0; i < targetLength; i++) {
      result.push(sourceValues[i % sourceValues.length]);
    }
    return result;
  }

  // 2. Pure Numeric Series
  const isAllNumbers = sourceValues.every(
    (v) => typeof v === 'number' || (!isNaN(Number(v)) && v !== '' && typeof v !== 'boolean')
  );
  if (isAllNumbers) {
    const numbers = sourceValues.map(Number);
    let step = 1;

    if (numbers.length >= 2) {
      // Calculate constant arithmetic step from the source sequence
      const deltas: number[] = [];
      for (let i = 1; i < numbers.length; i++) {
        deltas.push(numbers[i] - numbers[i - 1]);
      }
      // Average step
      step = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    }

    const lastNum = numbers[numbers.length - 1];
    const result: number[] = [];
    for (let i = 1; i <= targetLength; i++) {
      const nextVal = lastNum + i * step * directionMultiplier;
      // Round to 4 decimal places to prevent floating point noise
      result.push(Math.round(nextVal * 10000) / 10000);
    }
    return result;
  }

  // 3. Date Pattern (YYYY-MM-DD)
  const dates = sourceValues.map((v) => parseIsoDate(String(v)));
  const isAllDates = dates.every((d) => d !== null);
  if (isAllDates && dates.length > 0) {
    const validDates = dates as Date[];
    let dayStep = 1;
    if (validDates.length >= 2) {
      const msDiff =
        validDates[validDates.length - 1].getTime() - validDates[0].getTime();
      dayStep = Math.round(msDiff / (1000 * 60 * 60 * 24)) / (validDates.length - 1);
      if (dayStep === 0) dayStep = 1;
    }

    const lastDate = validDates[validDates.length - 1];
    const result: string[] = [];
    for (let i = 1; i <= targetLength; i++) {
      const nextDate = new Date(lastDate);
      nextDate.setDate(nextDate.getDate() + Math.round(i * dayStep * directionMultiplier));
      result.push(formatIsoDate(nextDate));
    }
    return result;
  }

  // 4. Alphanumeric Pattern (e.g. PRB-001, ISSUE-10)
  const alphaPatterns = sourceValues.map((v) =>
    typeof v === 'string' ? parseAlphanumericPattern(v) : null
  );
  const isAllAlpha = alphaPatterns.every((p) => p !== null);
  if (isAllAlpha && alphaPatterns.length > 0) {
    const patterns = alphaPatterns as NonNullable<(typeof alphaPatterns)[0]>[];
    const firstP = patterns[0];
    const samePrefixSuffix = patterns.every(
      (p) => p.prefix === firstP.prefix && p.suffix === firstP.suffix
    );

    if (samePrefixSuffix) {
      let step = 1;
      if (patterns.length >= 2) {
        step = (patterns[patterns.length - 1].num - patterns[0].num) / (patterns.length - 1);
      }
      const lastNum = patterns[patterns.length - 1].num;
      const result: string[] = [];
      for (let i = 1; i <= targetLength; i++) {
        const nextNum = Math.round(lastNum + i * step * directionMultiplier);
        result.push(
          formatAlphanumeric(firstP.prefix, nextNum, firstP.digitsCount, firstP.suffix)
        );
      }
      return result;
    }
  }

  // 5. Default Fallback: Cyclical Copy
  const fallbackResult: any[] = [];
  for (let i = 0; i < targetLength; i++) {
    fallbackResult.push(sourceValues[i % sourceValues.length]);
  }
  return fallbackResult;
}

/**
 * Resolves a cell's calculated value (either from calculatedGridData or by evaluating formula).
 */
export function resolveCellValue(
  coord: string,
  gridData: Record<string, any>,
  calculatedData?: Record<string, any>,
  visiting = new Set<string>()
): any {
  if (calculatedData && calculatedData[coord] !== undefined && calculatedData[coord] !== null && calculatedData[coord] !== '') {
    const cv = calculatedData[coord];
    const n = Number(cv);
    return typeof cv === 'number' ? cv : (!isNaN(n) && String(cv).trim() !== '' ? n : cv);
  }
  const raw = gridData[coord];
  if (raw === undefined || raw === null || raw === '') return '';
  if (typeof raw === 'string' && raw.trim().startsWith('=')) {
    const up = coord.toUpperCase();
    if (visiting.has(up)) return 0;
    visiting.add(up);
    try {
      const res = evaluateFormula(raw, (ref) => resolveCellValue(ref, gridData, calculatedData, visiting));
      visiting.delete(up);
      const n = Number(res);
      return typeof res === 'number' ? res : (!isNaN(n) && String(res).trim() !== '' ? n : res);
    } catch {
      visiting.delete(up);
      return 0;
    }
  }
  const n = Number(raw);
  return typeof raw === 'number' ? raw : (!isNaN(n) && String(raw).trim() !== '' ? n : raw);
}

/**
 * Performs a 2D Grid Autofill operation from source range to target range.
 * 
 * Returns an atomic list of cell changes suitable for a single Ctrl+Z undo transaction.
 */
export function executeAutofill({
  sourceRange,
  targetRange,
  currentGridData,
  calculatedGridData,
  mode = 'fill_series',
}: {
  sourceRange: { startCol: string; startRow: number; endCol: string; endRow: number };
  targetRange: { startCol: string; startRow: number; endCol: string; endRow: number };
  currentGridData: Record<string, any>; // key: 'A1', value: any
  calculatedGridData?: Record<string, any>; // key: 'A1', calculated display value
  mode?: AutofillMode;
}): AutofillResult {
  const changes: CellChange[] = [];
  const newCells: Record<string, any> = { ...currentGridData };

  const srcStartColIdx = colNameToIndex(sourceRange.startCol);
  const srcEndColIdx = colNameToIndex(sourceRange.endCol);
  const srcMinCol = Math.min(srcStartColIdx, srcEndColIdx);
  const srcMaxCol = Math.max(srcStartColIdx, srcEndColIdx);
  const srcMinRow = Math.min(sourceRange.startRow, sourceRange.endRow);
  const srcMaxRow = Math.max(sourceRange.startRow, sourceRange.endRow);

  const tgtStartColIdx = colNameToIndex(targetRange.startCol);
  const tgtEndColIdx = colNameToIndex(targetRange.endCol);
  const tgtMinCol = Math.min(tgtStartColIdx, tgtEndColIdx);
  const tgtMaxCol = Math.max(tgtStartColIdx, tgtEndColIdx);
  const tgtMinRow = Math.min(targetRange.startRow, targetRange.endRow);
  const tgtMaxRow = Math.max(targetRange.startRow, targetRange.endRow);

  // Determine Primary Fill Direction
  const isVertical = tgtMaxRow > srcMaxRow || tgtMinRow < srcMinRow;
  const isHorizontal = tgtMaxCol > srcMaxCol || tgtMinCol < srcMinCol;

  if (isVertical) {
    // Filling Vertically (Down or Up)
    const isDown = tgtMaxRow > srcMaxRow;
    const fillStartRow = isDown ? srcMaxRow + 1 : tgtMinRow;
    const fillEndRow = isDown ? tgtMaxRow : srcMinRow - 1;
    const rowCount = fillEndRow - fillStartRow + 1;

    if (rowCount > 0) {
      for (let c = srcMinCol; c <= srcMaxCol; c++) {
        const colLetter = colIndexToName(c);

        // Collect source column values
        const colSourceValues: any[] = [];
        const colSourceCoords: Array<{ row: number; rawVal: any; calcVal: any; isFormula: boolean }> = [];
        for (let r = srcMinRow; r <= srcMaxRow; r++) {
          const coord = `${colLetter}${r}`;
          const rawVal = currentGridData[coord] !== undefined ? currentGridData[coord] : '';
          const isFormula = typeof rawVal === 'string' && rawVal.trim().startsWith('=');
          const calcVal = isFormula
            ? resolveCellValue(coord, currentGridData, calculatedGridData)
            : rawVal;
          colSourceValues.push(calcVal);
          colSourceCoords.push({ row: r, rawVal, calcVal, isFormula });
        }

        const generated = generateSeriesValues(
          colSourceValues,
          rowCount,
          mode,
          isDown ? 1 : -1
        );

        for (let idx = 0; idx < rowCount; idx++) {
          const targetRowNum = isDown ? fillStartRow + idx : fillEndRow - idx;
          const targetCoord = `${colLetter}${targetRowNum}`;
          const srcIdx = idx % colSourceCoords.length;
          const srcItem = colSourceCoords[srcIdx];

          let valToSet: any;
          if (srcItem.isFormula) {
            const dRow = targetRowNum - srcItem.row;
            valToSet = adjustFormula(srcItem.rawVal, dRow, 0);
          } else {
            valToSet = generated[idx];
          }

          const oldValue = currentGridData[targetCoord];
          changes.push({
            col: colLetter,
            row: targetRowNum,
            oldValue,
            newValue: valToSet,
          });
          newCells[targetCoord] = valToSet;
        }
      }
    }
  } else if (isHorizontal) {
    // Filling Horizontally (Right or Left)
    const isRight = tgtMaxCol > srcMaxCol;
    const fillStartCol = isRight ? srcMaxCol + 1 : tgtMinCol;
    const fillEndCol = isRight ? tgtMaxCol : srcMinCol - 1;
    const colCount = fillEndCol - fillStartCol + 1;

    if (colCount > 0) {
      for (let r = srcMinRow; r <= srcMaxRow; r++) {
        // Collect source row values
        const rowSourceValues: any[] = [];
        const rowSourceCoords: Array<{ colIdx: number; rawVal: any; calcVal: any; isFormula: boolean }> = [];
        for (let c = srcMinCol; c <= srcMaxCol; c++) {
          const colLetter = colIndexToName(c);
          const coord = `${colLetter}${r}`;
          const rawVal = currentGridData[coord] !== undefined ? currentGridData[coord] : '';
          const isFormula = typeof rawVal === 'string' && rawVal.trim().startsWith('=');
          const calcVal = isFormula
            ? resolveCellValue(coord, currentGridData, calculatedGridData)
            : rawVal;
          rowSourceValues.push(calcVal);
          rowSourceCoords.push({ colIdx: c, rawVal, calcVal, isFormula });
        }

        const generated = generateSeriesValues(
          rowSourceValues,
          colCount,
          mode,
          isRight ? 1 : -1
        );

        for (let idx = 0; idx < colCount; idx++) {
          const targetColIdx = isRight ? fillStartCol + idx : fillEndCol - idx;
          const targetColLetter = colIndexToName(targetColIdx);
          const targetCoord = `${targetColLetter}${r}`;
          const srcIdx = idx % rowSourceCoords.length;
          const srcItem = rowSourceCoords[srcIdx];

          let valToSet: any;
          if (srcItem.isFormula) {
            const dCol = targetColIdx - srcItem.colIdx;
            valToSet = adjustFormula(srcItem.rawVal, 0, dCol);
          } else {
            valToSet = generated[idx];
          }

          const oldValue = currentGridData[targetCoord];
          changes.push({
            col: targetColLetter,
            row: r,
            oldValue,
            newValue: valToSet,
          });
          newCells[targetCoord] = valToSet;
        }
      }
    }
  }

  const affectedRange = `${targetRange.startCol}${targetRange.startRow}:${targetRange.endCol}${targetRange.endRow}`;
  return { changes, newCells, affectedRange };
}
