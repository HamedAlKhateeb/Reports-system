/**
 * Phase 3.1 (B9) — shared merge-coverage helper.
 *
 * Merge entries are `{ start: 'A1', end: 'C3', rowSpan?, colSpan? }` where
 * coords are `${columnId}${1-basedRow}` (uppercased at the call sites).
 * The old check (`m.end === coord && m.start !== coord`) only skipped the
 * single END cell, so interior cells of any merge larger than 2 cells were
 * emitted as extra cells, corrupting column counts in DOCX/PDF/share.
 * This is a true point-in-rect test: a coord is covered when it lies inside
 * a merge rect but is not the rect's start cell.
 */

export interface MergeRange {
  start?: string;
  end?: string;
  rowSpan?: number;
  colSpan?: number;
}

import { parseCellRef } from './formula-parser';

function splitCoord(coord: string): { colId: string; row: number } | null {
  // Canonical row parsing via parseCellRef (single $-aware parser);
  // column stays as letter-id because merges are keyed by column position.
  const ref = parseCellRef(String(coord || ''));
  if (!ref) return null;
  return { colId: ref.colName, row: ref.rowNumber };
}

function colIndex(columns: Array<{ id?: string }>, colId: string): number {
  const target = String(colId).toUpperCase();
  for (let i = 0; i < columns.length; i++) {
    if (String(columns[i]?.id || '').toUpperCase() === target) return i;
  }
  return -1;
}

/**
 * True when `coord` lies inside any merge rect without being its start.
 * Falls back to the legacy endpoint check when a merge entry or the
 * column layout cannot be parsed (fail-safe: never emit a duplicate cell
 * for a known end, never skip a cell we cannot place).
 */
export function isCoveredByMerge(
  coord: string,
  mergedList: MergeRange[] | undefined | null,
  columns: Array<{ id?: string }>
): boolean {
  if (!mergedList || mergedList.length === 0) return false;
  const target = splitCoord(coord);
  const targetCol = target ? colIndex(columns, target.colId) : -1;

  for (const m of mergedList) {
    if (!m || typeof m.start !== 'string') continue;
    const startUpper = m.start.toUpperCase();
    const coordUpper = String(coord).toUpperCase();
    // The start cell itself is always rendered (it carries the span).
    if (startUpper === coordUpper) continue;
    // Legacy fast path: known end cell is always covered.
    if (typeof m.end === 'string' && m.end.toUpperCase() === coordUpper) return true;
    if (!target || targetCol < 0) continue;

    const start = splitCoord(m.start);
    const end = typeof m.end === 'string' ? splitCoord(m.end) : null;
    if (!start) continue;
    const startCol = colIndex(columns, start.colId);
    if (startCol < 0) continue;

    if (end) {
      const endCol = colIndex(columns, end.colId);
      if (endCol < 0) continue;
      const cMin = Math.min(startCol, endCol);
      const cMax = Math.max(startCol, endCol);
      const rMin = Math.min(start.row, end.row);
      const rMax = Math.max(start.row, end.row);
      if (targetCol >= cMin && targetCol <= cMax && target.row >= rMin && target.row <= rMax) {
        return true;
      }
    } else {
      // No end recorded — reconstruct the rect from rowSpan/colSpan.
      const colSpan = m.colSpan && m.colSpan > 1 ? m.colSpan : 1;
      const rowSpan = m.rowSpan && m.rowSpan > 1 ? m.rowSpan : 1;
      if (
        targetCol >= startCol &&
        targetCol < startCol + colSpan &&
        target.row >= start.row &&
        target.row < start.row + rowSpan
      ) {
        return true;
      }
    }
  }
  return false;
}

/** Finds the merge entry starting at `coord` (case-insensitive). */
export function findMergeStart(
  coord: string,
  mergedList: MergeRange[] | undefined | null
): MergeRange | undefined {
  if (!mergedList) return undefined;
  const upper = String(coord).toUpperCase();
  return mergedList.find((m) => typeof m?.start === 'string' && m.start.toUpperCase() === upper);
}
