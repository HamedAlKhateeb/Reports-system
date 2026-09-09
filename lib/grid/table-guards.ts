/**
 * SMART TABLE CRASH GUARDS
 *
 * Centralized defensive helpers so a single malformed table entity
 * (bad Firestore/localStorage payload, out-of-bounds merge, huge paste, ...)
 * can never crash the whole editor. Every helper is pure and never throws.
 */

import { colIndexToName, colNameToIndex } from './formula-parser';
import type { TableColumnEntity } from '../types';
import type { CellFormat, MergedRange } from './table-ops';

export const TABLE_LIMITS = {
  MAX_ROWS: 200,
  MAX_COLS: 26,
  MAX_CELLS_PASTE: 2000,
  MAX_HISTORY: 40,
} as const;

export function safeClone<T>(value: T, fallback: T): T {
  try {
    if (value === undefined || value === null) return fallback;
    if (typeof structuredClone === 'function') {
      return structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value));
  } catch {
    try {
      return JSON.parse(JSON.stringify(value ?? fallback));
    } catch {
      return fallback;
    }
  }
}

function sanitizeColumn(c: any, idx: number): TableColumnEntity {
  const id = typeof c?.id === 'string' && c.id.trim() ? c.id.trim().toUpperCase().slice(0, 4) : colIndexToName(idx);
  const name = typeof c?.name === 'string' ? c.name.slice(0, 200) : id;
  const width = typeof c?.width === 'number' && isFinite(c.width)
    ? Math.min(600, Math.max(60, c.width))
    : 140;
  return { id, name, type: 'text', width } as TableColumnEntity;
}

export function normalizeColumns(raw: unknown): TableColumnEntity[] {
  try {
    if (!Array.isArray(raw)) return [];
    const cols = (raw as any[])
      .filter((c) => c && typeof c === 'object')
      .slice(0, TABLE_LIMITS.MAX_COLS)
      .map((c, i) => sanitizeColumn(c, i));
    // Re-id canonically (A, B, C...) so merges/formulas stay consistent.
    return cols.map((c, i) => ({ ...c, id: colIndexToName(i) }));
  } catch {
    return [];
  }
}

export function normalizeRows(raw: unknown, columns: TableColumnEntity[]): Record<string, any>[] {
  try {
    if (!Array.isArray(raw)) return [];
    return (raw as any[]).slice(0, TABLE_LIMITS.MAX_ROWS).map((r) => {
      const row: Record<string, any> = {};
      columns.forEach((c) => {
        let v: unknown = r && typeof r === 'object' ? (r as any)[c.id] : '';
        if (v === undefined || v === null) v = '';
        if (typeof v === 'string' && v.length > 10000) v = v.slice(0, 10000);
        if (typeof v === 'object') {
          try {
            v = String((v as any)?.value ?? '');
          } catch {
            v = '';
          }
        }
        row[c.id] = v as string | number;
      });
      return row;
    });
  } catch {
    return [];
  }
}

export function normalizeFormats(raw: unknown): Record<string, CellFormat> {
  try {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out: Record<string, CellFormat> = {};
    for (const key of Object.keys(raw as Record<string, unknown>)) {
      if (!/^([A-Za-z]+)([0-9]+)$/.test(key)) continue;
      const fmt = (raw as any)[key];
      if (!fmt || typeof fmt !== 'object') continue;
      const clean: CellFormat = {};
      if (['left', 'center', 'right', 'justify'].includes((fmt as any).align)) clean.align = (fmt as any).align;
      if (['left', 'center', 'right', 'justify'].includes((fmt as any).horizontalAlign)) clean.horizontalAlign = (fmt as any).horizontalAlign;
      if ((fmt as any).bold === true) clean.bold = true;
      if ((fmt as any).italic === true) clean.italic = true;
      if ((fmt as any).underline === true) clean.underline = true;
      if (Object.keys(clean).length > 0) out[key.toUpperCase()] = clean;
    }
    return out;
  } catch {
    return {};
  }
}

function parseCoordSafe(coord: unknown): { colIdx: number; rowIdx: number } | null {
  try {
    if (typeof coord !== 'string') return null;
    const m = coord.match(/^([A-Za-z]+)([0-9]+)$/);
    if (!m) return null;
    const colIdx = colNameToIndex(m[1].toUpperCase());
    const rowIdx = parseInt(m[2], 10) - 1;
    if (colIdx < 0 || rowIdx < 0 || !isFinite(colIdx) || !isFinite(rowIdx)) return null;
    return { colIdx, rowIdx };
  } catch {
    return null;
  }
}

/**
 * Drops merges that are malformed, single-cell, out of bounds,
 * or overlapping another merge. Never throws.
 */
export function normalizeMerges(raw: unknown, colCount: number, rowCount: number): MergedRange[] {
  try {
    if (!Array.isArray(raw)) return [];
    const out: MergedRange[] = [];
    const occupied = new Set<string>();
    for (const m of raw as any[]) {
      try {
        if (!m || typeof m !== 'object') continue;
        const s = parseCoordSafe((m as any).start);
        const e = parseCoordSafe((m as any).end);
        if (!s || !e) continue;
        const c1 = Math.min(s.colIdx, e.colIdx);
        const c2 = Math.max(s.colIdx, e.colIdx);
        const r1 = Math.min(s.rowIdx, e.rowIdx);
        const r2 = Math.max(s.rowIdx, e.rowIdx);
        if (c2 >= colCount || r2 >= rowCount) continue;
        if (c1 === c2 && r1 === r2) continue; // single cell
        // Overlap check
        let overlap = false;
        for (let c = c1; c <= c2 && !overlap; c++) {
          for (let r = r1; r <= r2 && !overlap; r++) {
            if (occupied.has(`${c}:${r}`)) overlap = true;
          }
        }
        if (overlap) continue;
        for (let c = c1; c <= c2; c++) {
          for (let r = r1; r <= r2; r++) occupied.add(`${c}:${r}`);
        }
        out.push({
          start: `${colIndexToName(c1)}${r1 + 1}`,
          end: `${colIndexToName(c2)}${r2 + 1}`,
          colSpan: c2 - c1 + 1,
          rowSpan: r2 - r1 + 1,
        });
      } catch {
        continue;
      }
    }
    return out;
  } catch {
    return [];
  }
}

/** Shifts merge rectangles down/up when rows are inserted/deleted. */
export function shiftMergesOnRowChange(
  merges: MergedRange[],
  atIndex: number,
  delta: 1 | -1,
  colCount: number,
  rowCount: number
): MergedRange[] {
  try {
    if (!Array.isArray(merges)) return [];
    const out: MergedRange[] = [];
    for (const m of merges) {
      const s = parseCoordSafe(m?.start);
      const e = parseCoordSafe(m?.end);
      if (!s || !e) continue;
      let r1 = Math.min(s.rowIdx, e.rowIdx);
      let r2 = Math.max(s.rowIdx, e.rowIdx);
      const c1 = Math.min(s.colIdx, e.colIdx);
      const c2 = Math.max(s.colIdx, e.colIdx);
      if (delta === -1) {
        // Delete row atIndex: drop merges touching it, shift those below up.
        if (atIndex >= r1 && atIndex <= r2) continue;
        if (r1 > atIndex) r1 -= 1;
        if (r2 > atIndex) r2 -= 1;
      } else {
        // Insert row atIndex: shift merges at/below down.
        if (r1 >= atIndex) r1 += 1;
        if (r2 >= atIndex) r2 += 1;
      }
      if (r2 >= rowCount || c2 >= colCount) continue;
      out.push({
        start: `${colIndexToName(c1)}${r1 + 1}`,
        end: `${colIndexToName(c2)}${r2 + 1}`,
        colSpan: c2 - c1 + 1,
        rowSpan: r2 - r1 + 1,
      });
    }
    return out;
  } catch {
    return [];
  }
}

export function defaultTableState(isAr: boolean, tableId: string, reportId: string) {
  const columns: TableColumnEntity[] = [
    { id: 'A', name: isAr ? 'البند' : 'Item', type: 'text', width: 200 },
    { id: 'B', name: isAr ? 'الوصف' : 'Description', type: 'text', width: 260 },
    { id: 'C', name: isAr ? 'العدد' : 'Count', type: 'number', width: 110 },
  ];
  return {
    columns,
    rows: [{ A: '', B: '', C: '' }, { A: '', B: '', C: '' }, { A: '', B: '', C: '' }],
    cellFormats: {} as Record<string, CellFormat>,
    mergedCells: [] as MergedRange[],
    direction: (isAr ? 'rtl' : 'ltr') as 'rtl' | 'ltr',
    tableId,
    reportId,
  };
}
