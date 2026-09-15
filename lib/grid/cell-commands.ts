/**
 * CANONICAL CELL COMMANDS — Single Source of Truth for cell-level mutations.
 *
 * Architecture:
 *   User action → command (here) → canonical TableState → derived (evaluatedMap) → UI → persistence
 *
 * Canonical state: TableState { columns, rows, cellFormats, mergedCells }
 *   - rows[rowIdx][colId] holds the RAW value: '' | number | string | '=FORMULA'
 *   - cellFormats[COORD] holds formatting (see canonicalizeFormat)
 *   - formulas are raw strings starting with '=' — evaluated ONLY via
 *     formula-parser's evaluateFormula (single evaluation path).
 *
 * Derived state (never persisted, never edited directly):
 *   - evaluatedMap[COORD] = evaluateFormula(raw, gridData)
 *   - dependents list, error flags, display strings
 *
 * UI/transient state (never persisted):
 *   - activeCell, selectionRect, editValue, drag state, menus
 *
 * Dependency vs ownership (explicit):
 *   - Formula reference A1→B1 is a DEPENDENCY, not ownership.
 *   - clearCell/deleteCell clears the VALUE only; dependents stay alive and
 *     re-evaluate (blank → 0/empty, never cascade-deleted).
 *   - deleteRow/deleteColumn are STRUCTURAL (table-ops) and remap refs;
 *     refs pointing into removed rows/cols become #REF! (single path:
 *     remapFormulaRefs with null).
 *
 * All creators (typing, paste, autofill, import) MUST go through these
 * primitives so behaviour cannot diverge by code path.
 */

import {
  colIndexToName,
  colNameToIndex,
  parseCellRef,
  adjustFormula,
  extractFormulaRefs,
  expandRange,
} from './formula-parser';
import { executeAutofill, type AutofillMode } from './autofill-engine';
import type { TableColumnEntity } from '../types';
import type { CellFormat, TableState } from './table-ops';
import { safeClone } from './table-guards';

// ---------------------------------------------------------------------------
// Coordinates (single canonical parser — do NOT reimplement elsewhere)
// ---------------------------------------------------------------------------

export function canonicalCoord(colIdx: number, rowIdx: number): string {
  return `${colIndexToName(colIdx)}${rowIdx + 1}`.toUpperCase();
}

/** Canonical coord parser. Returns 0-indexed indices or null. */
export function parseCoord(
  coord: unknown
): { colIdx: number; rowIdx: number; colLetter: string } | null {
  if (typeof coord !== 'string') return null;
  const ref = parseCellRef(coord.trim());
  if (!ref) return null;
  return { colIdx: ref.colIndex, rowIdx: ref.rowIndex, colLetter: ref.colName };
}

export function isValidCoord(coord: unknown): boolean {
  return parseCoord(coord) !== null;
}

// ---------------------------------------------------------------------------
// Grid map (canonical raw-value lookup keyed by 'A1')
// ---------------------------------------------------------------------------

export function buildGridMap(
  rows: Record<string, any>[],
  columns: TableColumnEntity[]
): Record<string, any> {
  const map: Record<string, any> = {};
  rows.forEach((row, rIdx) => {
    columns.forEach((col, cIdx) => {
      const coord = canonicalCoord(cIdx, rIdx);
      const v = row?.[col.id];
      map[coord] = v === undefined || v === null ? '' : v;
    });
  });
  return map;
}

// ---------------------------------------------------------------------------
// Formatting — single canonical model
// ---------------------------------------------------------------------------

/**
 * Canonical format: `align` is the single alignment field.
 * `horizontalAlign` is accepted as a legacy alias and folded into `align`.
 */
export function canonicalizeFormat(raw: unknown): CellFormat | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const f = raw as Record<string, unknown>;
  const out: CellFormat = {};
  const align = (f.align ?? f.horizontalAlign) as string | undefined;
  if (align === 'left' || align === 'center' || align === 'right' || align === 'justify') {
    out.align = align;
  }
  if (f.bold === true) out.bold = true;
  if (f.italic === true) out.italic = true;
  if (f.underline === true) out.underline = true;
  return Object.keys(out).length > 0 ? out : null;
}

// ---------------------------------------------------------------------------
// Cell-level commands (pure: return next rows/formats)
// ---------------------------------------------------------------------------

export interface CellMutation {
  rows: Record<string, any>[];
  cellFormats: Record<string, CellFormat>;
}

function cloneRows(rows: Record<string, any>[]): Record<string, any>[] {
  return rows.map((r) => ({ ...(r || {}) }));
}

/** Resolve a coord to (rowArrayIndex, columnId). Null when out of bounds. */
function resolveTarget(
  state: TableState,
  coord: string
): { rowIdx: number; colId: string } | null {
  const p = parseCoord(coord);
  if (!p) return null;
  if (p.rowIdx < 0 || p.rowIdx >= state.rows.length) return null;
  if (p.colIdx < 0 || p.colIdx >= state.columns.length) return null;
  return { rowIdx: p.rowIdx, colId: state.columns[p.colIdx].id };
}

export function getRawCell(state: TableState, coord: string): any {
  const t = resolveTarget(state, coord);
  if (!t) return '';
  const v = state.rows[t.rowIdx]?.[t.colId];
  return v === undefined || v === null ? '' : v;
}

/** createCell/updateCell/setCellValue — one path for every writer. */
export function setCellValue(state: TableState, coord: string, value: any): CellMutation {
  const t = resolveTarget(state, coord);
  if (!t) return { rows: state.rows, cellFormats: state.cellFormats };
  const rows = cloneRows(state.rows);
  rows[t.rowIdx] = { ...(rows[t.rowIdx] || {}), [t.colId]: value };
  return { rows, cellFormats: state.cellFormats };
}

/** setCellFormula — formula is part of the canonical cell, not a side string. */
export function setCellFormula(state: TableState, coord: string, formula: string): CellMutation {
  const f = typeof formula === 'string' && formula.startsWith('=') ? formula : `=${formula}`;
  return setCellValue(state, coord, f);
}

/** setCellFormat — merges into canonical format (single model). */
export function setCellFormat(
  state: TableState,
  coord: string,
  patch: CellFormat
): CellMutation {
  const p = parseCoord(coord);
  if (!p) return { rows: state.rows, cellFormats: state.cellFormats };
  const key = canonicalCoord(p.colIdx, p.rowIdx);
  const clean = canonicalizeFormat({ ...(state.cellFormats[key] || {}), ...patch });
  const cellFormats = { ...(state.cellFormats || {}) };
  if (clean) cellFormats[key] = clean;
  else delete cellFormats[key];
  return { rows: state.rows, cellFormats };
}

/**
 * clearCell / deleteCell VALUE semantics (dependency-safe):
 * blanks the raw value, KEEPS the format, KEEPS every dependent formula alive.
 * Dependents re-evaluate against '' (numeric context → 0). Never deletes rows.
 */
export function clearCellValue(state: TableState, coord: string): CellMutation {
  return setCellValue(state, coord, '');
}

/** Remove formatting only (value untouched). */
export function clearCellFormat(state: TableState, coord: string): CellMutation {
  const p = parseCoord(coord);
  if (!p) return { rows: state.rows, cellFormats: state.cellFormats };
  const key = canonicalCoord(p.colIdx, p.rowIdx);
  const cellFormats = { ...(state.cellFormats || {}) };
  delete cellFormats[key];
  return { rows: state.rows, cellFormats };
}

// ---------------------------------------------------------------------------
// Dependency graph (derived — never stored)
// ---------------------------------------------------------------------------

/** All coords whose formula text references `coord` (directly or via range). */
export function getDependents(state: TableState, coord: string): string[] {
  const target = parseCoord(coord);
  if (!target) return [];
  const targetKey = canonicalCoord(target.colIdx, target.rowIdx);
  const grid = buildGridMap(state.rows, state.columns);
  const out: string[] = [];
  for (const key of Object.keys(grid)) {
    const v = grid[key];
    if (typeof v !== 'string' || !v.startsWith('=')) continue;
    if (key === targetKey) continue;
    try {
      const refs = extractFormulaRefs(v);
      const expanded = new Set<string>();
      for (const r of refs) {
        if (r.includes(':')) {
          for (const c of expandRange(r)) expanded.add(c.toUpperCase());
        } else {
          expanded.add(r.toUpperCase());
        }
      }
      if (expanded.has(targetKey)) out.push(key);
    } catch {
      continue;
    }
  }
  return out;
}

/**
 * Human-readable impact statement for a pending clear/delete.
 * Used by UI confirmations — dependency is informational, never ownership.
 */
export function describeDeleteImpact(state: TableState, coord: string): string {
  const deps = getDependents(state, coord);
  if (deps.length === 0) return '';
  return deps.join(', ');
}

// ---------------------------------------------------------------------------
// fillRange — THE single autofill path (values + full format inheritance)
// ---------------------------------------------------------------------------

export interface FillRangeArgs {
  sourceRange: { startCol: string; startRow: number; endCol: string; endRow: number };
  targetRange: { startCol: string; startRow: number; endCol: string; endRow: number };
  mode?: AutofillMode;
}

/**
 * Canonical fill: values via executeAutofill (series/relative-formula aware)
 * + FULL format inheritance (entire CellFormat object cloned from the
 * analogous source cell — including align). No caller may invent its own
 * "carry only bold/italic" subset; that was the architectural root cause of
 * the autofill-formatting divergence class of bugs.
 */
export function fillRange(state: TableState, args: FillRangeArgs): CellMutation {
  const grid = buildGridMap(state.rows, state.columns);
  const res = executeAutofill({
    sourceRange: args.sourceRange,
    targetRange: args.targetRange,
    currentGridData: grid,
    mode: args.mode ?? 'fill_series',
  });

  const rows = cloneRows(state.rows);
  const applyValue = (coord: string, value: any) => {
    const t = resolveTarget({ ...state, rows }, coord);
    if (!t) return;
    rows[t.rowIdx] = { ...(rows[t.rowIdx] || {}), [t.colId]: value };
  };
  for (const ch of res.changes) {
    applyValue(`${ch.col}${ch.row}`, ch.newValue);
  }

  // Full format inheritance: map each filled coord back to its analogous
  // source cell (same modulo used by the value engine) and clone the format.
  const cellFormats = { ...(state.cellFormats || {}) };
  try {
    const sMinC = Math.min(
      colNameToIndex(args.sourceRange.startCol),
      colNameToIndex(args.sourceRange.endCol)
    );
    const sMaxC = Math.max(
      colNameToIndex(args.sourceRange.startCol),
      colNameToIndex(args.sourceRange.endCol)
    );
    const sMinR = Math.min(args.sourceRange.startRow, args.sourceRange.endRow);
    const sMaxR = Math.max(args.sourceRange.startRow, args.sourceRange.endRow);
    const srcW = sMaxC - sMinC + 1;
    const srcH = sMaxR - sMinR + 1;
    for (const ch of res.changes) {
      const tC = colNameToIndex(ch.col);
      const tR = ch.row;
      const srcC = sMinC + (srcW > 0 ? Math.abs(tC - sMinC) % srcW : 0);
      // Vertical fills map within the source column band; horizontal within row band.
      const srcR = sMinR + (srcH > 0 ? Math.abs(tR - sMinR) % srcH : 0);
      const srcKey = `${colIndexToName(srcC)}${srcR}`.toUpperCase();
      const dstKey = `${ch.col}${ch.row}`.toUpperCase();
      const srcFmt = state.cellFormats[srcKey];
      if (srcFmt) cellFormats[dstKey] = safeClone(srcFmt, {} as CellFormat);
      else delete cellFormats[dstKey];
    }
  } catch {
    // values already applied; formats best-effort only
  }

  return { rows, cellFormats };
}

// ---------------------------------------------------------------------------
// copyRange / pasteRange — same primitives as typing + autofill
// ---------------------------------------------------------------------------

export interface GridRect {
  startColIdx: number;
  startRowIdx: number;
  endColIdx: number;
  endRowIdx: number;
}

export function copyRange(
  state: TableState,
  rect: GridRect
): { values: any[][]; formats: (CellFormat | null)[][] } {
  const c1 = Math.min(rect.startColIdx, rect.endColIdx);
  const c2 = Math.max(rect.startColIdx, rect.endColIdx);
  const r1 = Math.min(rect.startRowIdx, rect.endRowIdx);
  const r2 = Math.max(rect.startRowIdx, rect.endRowIdx);
  const values: any[][] = [];
  const formats: (CellFormat | null)[][] = [];
  for (let r = r1; r <= r2; r++) {
    const vRow: any[] = [];
    const fRow: (CellFormat | null)[] = [];
    for (let c = c1; c <= c2; c++) {
      const coord = canonicalCoord(c, r);
      vRow.push(getRawCell(state, coord));
      const fmt = state.cellFormats[coord];
      fRow.push(fmt ? safeClone(fmt, null as unknown as CellFormat) : null);
    }
    values.push(vRow);
    formats.push(fRow);
  }
  return { values, formats };
}

/**
 * Paste with relative-formula adjustment (same adjustFormula as autofill)
 * and full format carry. Values are trimmed to table bounds.
 *
 * Formula semantics (explicit):
 * - When `sourceOrigin` is provided (copyRange→pasteRange inside one table),
 *   formulas shift by the relocation delta (target − origin), exactly like
 *   Excel move/copy. This is the same adjustFormula primitive as autofill.
 * - When omitted (e.g. TSV/clipboard paste with no known origin), formulas
 *   are pasted LITERALLY (no shift) — safer than guessing a delta that would
 *   corrupt user-typed formulas. This matches the pre-refactor TSV behaviour.
 */
export function pasteRange(
  state: TableState,
  atColIdx: number,
  atRowIdx: number,
  values: any[][],
  formats?: (CellFormat | null)[][],
  sourceOrigin?: { colIdx: number; rowIdx: number }
): CellMutation {
  const rows = cloneRows(state.rows);
  const cellFormats = { ...(state.cellFormats || {}) };
  // Uniform relocation delta for the whole block (Excel semantics: every
  // formula shifts by target-origin, NOT per-cell — per-cell deltas would
  // skew references across the block, e.g. =A1+B1 → =B3+C3 instead of =A2+B2).
  const dRowAll = sourceOrigin ? atRowIdx - sourceOrigin.rowIdx : 0;
  const dColAll = sourceOrigin ? atColIdx - sourceOrigin.colIdx : 0;
  for (let dr = 0; dr < values.length; dr++) {
    for (let dc = 0; dc < (values[dr]?.length || 0); dc++) {
      const tC = atColIdx + dc;
      const tR = atRowIdx + dr;
      if (tC < 0 || tR < 0 || tC >= state.columns.length || tR >= rows.length) continue;
      let v = values[dr][dc];
      if (typeof v === 'string') {
        v = v.trim();
        if (v.length > 10000) v = v.slice(0, 10000);
        if (v.startsWith('=') && sourceOrigin) {
          v = adjustFormula(v, dRowAll, dColAll);
        }
      }
      const colId = state.columns[tC].id;
      rows[tR] = { ...(rows[tR] || {}), [colId]: v };
      const key = canonicalCoord(tC, tR);
      const f = formats?.[dr]?.[dc];
      if (f) cellFormats[key] = safeClone(f, {} as CellFormat);
    }
  }
  return { rows, cellFormats };
}
