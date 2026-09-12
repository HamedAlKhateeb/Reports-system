/**
 * XLSX → TipTap / SmartTable import pipeline.
 *
 *   XLSX → Workbook Parser → Sheet/Row/Cell normalization →
 *     Existing Table UI (native TipTap tables) or Smart Tables
 *
 * No parallel table architecture is introduced: native tables reuse the exact
 * TipTap `table` nodes the editor already supports, and the optional
 * "Smart Table" path builds the existing TableEntity shape persisted with
 * the existing saveTable().
 */

import { MAX_IMPORT_SHEETS, MAX_IMPORT_ROWS, MAX_IMPORT_COLS } from './validation';
import { TABLE_LIMITS } from '../grid/table-guards';
import { colNameToIndex } from '../grid/formula-parser';

export interface NormalizedSheet {
  name: string;
  headers: string[];
  rows: string[][];
  rowCount: number;
  colCount: number;
  truncated: boolean;
  merges: Array<{ start: string; end: string }>;
  /**
   * Phase 3.4/3.5 (B14/B15): path-specific loss warnings, surfaced by
   * ImportModal depending on the plain/smart toggle. Previously all of
   * this was lost silently.
   */
  smartWarnings: string[];
  nativeWarnings: string[];
}

export interface XlsxImportResult {
  sheets: NormalizedSheet[];
  warnings: string[];
}

function colIndexToName(index: number): string {
  let name = '';
  let n = index;
  do {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return name;
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return '';
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    // Avoid 0.30000000000000004-style artifacts for imported values.
    return String(Math.round(value * 1e10) / 1e10);
  }
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return String(value);
}

function sanitizeSheetName(raw: unknown, fallback: string): string {
  const name = String(raw || '').trim() || fallback;
  return name.replace(/[\/\\:*?"<>|]/g, '_').slice(0, 60);
}

/**
 * Normalize a raw 2D array (from SheetJS) into a bounded, display-ready sheet.
 * Trims trailing empty rows/columns, caps dimensions, and stringifies values.
 */
export function normalizeSheetGrid(rawGrid: unknown[][], rawName: string, index: number): NormalizedSheet {
  const name = sanitizeSheetName(rawName, `Sheet ${index + 1}`);
  const grid: string[][] = (Array.isArray(rawGrid) ? rawGrid : []).map((row) =>
    (Array.isArray(row) ? row : []).map(formatCellValue)
  );

  // Drop fully-empty trailing rows.
  while (grid.length > 0 && grid[grid.length - 1].every((c) => c === '')) {
    grid.pop();
  }
  // Normalize width, then drop fully-empty trailing columns.
  let width = grid.reduce((max, row) => Math.max(max, row.length), 0);
  while (width > 0 && grid.every((row) => (row[width - 1] || '') === '')) {
    width -= 1;
  }
  const trimmed = grid.map((row) => {
    const out: string[] = [];
    for (let i = 0; i < width; i++) out.push(row[i] || '');
    return out;
  });

  let truncated = false;
  let capped = trimmed;
  if (capped.length > MAX_IMPORT_ROWS) {
    capped = capped.slice(0, MAX_IMPORT_ROWS);
    truncated = true;
  }
  if (width > MAX_IMPORT_COLS) {
    capped = capped.map((row) => row.slice(0, MAX_IMPORT_COLS));
    truncated = true;
  }
  const colCount = capped.reduce((max, row) => Math.max(max, row.length), 0);
  const headers = (capped[0] || []).map((h, i) => h || colIndexToName(i));

  return {
    name,
    headers,
    rows: capped,
    rowCount: capped.length,
    colCount,
    truncated,
    merges: [],
    smartWarnings: [],
    nativeWarnings: [],
  };
}

/**
 * Full pipeline: .xlsx File → normalized sheets.
 * SheetJS is dynamically imported to keep the editor bundle lean.
 */
export async function parseXlsxFile(file: File): Promise<XlsxImportResult> {
  const buffer = await file.arrayBuffer();
  if (!buffer || buffer.byteLength === 0) {
    throw new Error('EMPTY_FILE');
  }
  const XLSX = await import('xlsx');
  let workbook: any;
  try {
    workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  } catch {
    throw new Error('CORRUPTED_FILE');
  }
  const sheetNames: string[] = workbook?.SheetNames || [];
  if (sheetNames.length === 0) {
    throw new Error('EMPTY_DOCUMENT');
  }
  const warnings: string[] = [];
  if (sheetNames.length > MAX_IMPORT_SHEETS) {
    warnings.push(`Only the first ${MAX_IMPORT_SHEETS} sheets were imported.`);
  }

  const sheets: NormalizedSheet[] = [];
  for (let s = 0; s < Math.min(sheetNames.length, MAX_IMPORT_SHEETS); s++) {
    const sheetName = sheetNames[s];
    const ws = workbook.Sheets[sheetName];
    if (!ws) continue;
    let grid: unknown[][] = [];
    // Phase 3.5 (B15): lossy-conversion counters for explicit warnings.
    let dateCells = 0;
    let boolCells = 0;
    let formulaCells = 0;
    try {
      // Formulas: prefer the stored formula text (Smart Tables evaluate `=…`
      // natively); fall back to the cached value otherwise.
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
      const rows: unknown[][] = [];
      for (let r = range.s.r; r <= range.e.r; r++) {
        const row: unknown[] = [];
        for (let c = range.s.c; c <= range.e.c; c++) {
          const addr = XLSX.utils.encode_cell({ r, c });
          const cell = ws[addr];
          if (!cell) {
            row.push('');
          } else if (typeof cell.f === 'string' && cell.f) {
            formulaCells++;
            row.push(`=${cell.f}`);
          } else {
            const v = (cell as any).v;
            if (v instanceof Date) dateCells++;
            else if (typeof v === 'boolean') boolCells++;
            row.push(v ?? '');
          }
        }
        rows.push(row);
      }
      grid = rows;
    } catch {
      grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true }) as unknown[][];
    }
    const normalized = normalizeSheetGrid(grid, sheetName, s);
    // Best-effort merged cells passthrough (kept for Smart Table path).
    try {
      const merges = Array.isArray(ws['!merges']) ? ws['!merges'] : [];
      normalized.merges = merges.slice(0, 50).map((m: any) => ({
        start: `${colIndexToName(m.s.c)}${m.s.r + 1}`,
        end: `${colIndexToName(m.e.c)}${m.e.r + 1}`,
      }));
      if (merges.length > 50) {
        warnings.push(`Sheet "${normalized.name}": only the first 50 merged ranges were kept.`);
      }
    } catch {
      normalized.merges = [];
    }
    if (normalized.rowCount === 0 || normalized.colCount === 0) {
      warnings.push(`Sheet "${normalized.name}" is empty and was skipped.`);
      continue;
    }
    if (normalized.truncated) {
      warnings.push(
        `Sheet "${normalized.name}" was truncated to ${MAX_IMPORT_ROWS} rows × ${MAX_IMPORT_COLS} columns.`
      );
    }
    // Phase 3.5 (B15): type flattening is inherent to the string grid —
    // warn instead of losing it silently (both insert paths).
    if (dateCells > 0) {
      warnings.push(
        `Sheet "${normalized.name}": ${dateCells} date cell(s) imported as text (YYYY-MM-DD).`
      );
    }
    if (boolCells > 0) {
      warnings.push(
        `Sheet "${normalized.name}": ${boolCells} boolean cell(s) imported as text (TRUE/FALSE).`
      );
    }
    // Phase 3.4 (B14): the Smart Table store caps columns at
    // TABLE_LIMITS.MAX_COLS — warn with the exact dropped count.
    if (normalized.colCount > TABLE_LIMITS.MAX_COLS) {
      normalized.smartWarnings.push(
        `Sheet "${normalized.name}": ${normalized.colCount - TABLE_LIMITS.MAX_COLS} column(s) will be dropped in smart tables (limit ${TABLE_LIMITS.MAX_COLS}). Use plain-table insert to keep all ${normalized.colCount}.`
      );
    }
    // Phase 3.5 (B15): path-specific merge/formula notes.
    if (normalized.merges.length > 0) {
      normalized.nativeWarnings.push(
        `Sheet "${normalized.name}": ${normalized.merges.length} merged range(s) will be flattened in plain-table insert. Use smart-table import to preserve them.`
      );
    }
    if (formulaCells > 0) {
      normalized.nativeWarnings.push(
        `Sheet "${normalized.name}": ${formulaCells} formula cell(s) will appear as literal text in plain tables. Use smart-table import to compute them.`
      );
    }
    sheets.push(normalized);
  }

  if (sheets.length === 0) {
    throw new Error('EMPTY_DOCUMENT');
  }
  return { sheets, warnings: Array.from(new Set(warnings)).slice(0, 10) };
}

/** Build native TipTap nodes (heading + table per sheet) for the existing editor. */
export function sheetsToTipTapNodes(sheets: NormalizedSheet[]): any[] {
  const nodes: any[] = [];
  for (const sheet of sheets) {
    nodes.push({
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: sheet.name }],
    });
    const widths = sheet.headers.length;
    const tableRows: any[] = [];
    // Header row from first grid row (or generated column names).
    tableRows.push({
      type: 'tableRow',
      content: sheet.headers.slice(0, widths).map((h) => ({
        type: 'tableHeader',
        content: [{ type: 'paragraph', ...(h ? { content: [{ type: 'text', text: h }] } : {}) }],
      })),
    });
    // Data rows skip the header row when it carried real values.
    const dataStart = sheet.rows.length > 1 ? 1 : 1;
    for (let r = dataStart; r < sheet.rows.length; r++) {
      const row = sheet.rows[r];
      tableRows.push({
        type: 'tableRow',
        content: sheet.headers.slice(0, widths).map((_, c) => {
          const text = row[c] || '';
          return {
            type: 'tableCell',
            content: [{ type: 'paragraph', ...(text ? { content: [{ type: 'text', text }] } : {}) }],
          };
        }),
      });
    }
    // Single-row sheet (header only) still yields a valid 1-row table.
    nodes.push({ type: 'table', content: tableRows });
  }
  return nodes;
}

/** Parse an "A1"-style coord into 0-based col / 1-based row. */
function parseMergeCoord(coord: string): { col: number; row: number } | null {
  const m = /^([A-Za-z]+)([0-9]+)$/.exec(String(coord || '').trim());
  if (!m) return null;
  const col = colNameToIndex(m[1]);
  const row = parseInt(m[2], 10);
  if (col < 0 || !Number.isInteger(row) || row < 1) return null;
  return { col, row };
}

/** Build an existing-shape TableEntity for the Smart Table path (no new architecture). */
export function sheetToSmartTableEntity(
  sheet: NormalizedSheet,
  reportId: string,
  tableId: string,
  isAr: boolean
): any {
  // Phase 3.4 (B14): hard-cap at the store limit here (saveTable would
  // slice silently via normalizeColumns); the drop is already warned in
  // sheet.smartWarnings at parse time.
  const colCount = Math.max(Math.min(sheet.colCount, TABLE_LIMITS.MAX_COLS), 1);
  const columns = Array.from({ length: colCount }, (_, i) => {
    const id = colIndexToName(i);
    return {
      id,
      name: sheet.headers[i] || id,
      type: 'text' as const,
      width: 140,
    };
  });
  const rows = sheet.rows.slice(1).map((row) => {
    const record: Record<string, any> = {};
    columns.forEach((col, i) => {
      record[col.id] = row[i] || '';
    });
    return record;
  });
  const dataRowCount = Math.max(rows.length, 1);
  // Phase 3.5 (B15): preserve merges (clamped to the surviving grid)
  // instead of dropping them. Sheet row 1 is the header (stored as column
  // names, NOT in rows_data), so entity rowNum = sheetRow - 1. Merges
  // touching only the header row cannot be represented and are dropped
  // with a count (warned below).
  const mergedCells: Array<{ start: string; end: string; rowSpan?: number; colSpan?: number }> = [];
  let droppedMerges = 0;
  for (const m of sheet.merges || []) {
    const s = parseMergeCoord(m.start);
    const e = parseMergeCoord(m.end);
    if (!s || !e) {
      droppedMerges++;
      continue;
    }
    const cMin = Math.min(s.col, e.col);
    const cMax = Math.max(s.col, e.col);
    const rMinE = Math.min(s.row, e.row) - 1;
    const rMaxE = Math.max(s.row, e.row) - 1;
    // Single-cell "merges" are noise; ranges fully outside the kept grid
    // (incl. header-only) are dropped.
    if (cMin === cMax && rMinE === rMaxE) continue;
    if (cMin >= colCount || rMaxE < 1 || rMinE > dataRowCount) {
      droppedMerges++;
      continue;
    }
    const cc = Math.min(cMax, colCount - 1);
    const rr = Math.min(rMaxE, dataRowCount);
    const r0 = Math.max(rMinE, 1);
    if (cc < cMin || rr < r0 || (cc === cMin && rr === r0)) {
      droppedMerges++;
      continue;
    }
    const start = `${colIndexToName(cMin)}${r0}`;
    const end = `${colIndexToName(cc)}${rr}`;
    mergedCells.push({
      start,
      end,
      rowSpan: rr - r0 + 1,
      colSpan: cc - cMin + 1,
    });
  }
  if (droppedMerges > 0) {
    sheet.smartWarnings.push(
      `Sheet "${sheet.name}": ${droppedMerges} merged range(s) outside the kept grid were dropped.`
    );
  }
  const now = new Date().toISOString();
  return {
    id: tableId,
    report_id: reportId,
    name: sheet.name || (isAr ? 'جدول مستورد' : 'Imported table'),
    direction: isAr ? 'rtl' : 'ltr',
    cell_formats: {},
    merged_cells: mergedCells,
    columns_data: columns,
    rows_data: rows.length > 0 ? rows : [Object.fromEntries(columns.map((c) => [c.id, '']))],
    version: 1,
    created_at: now,
    updated_at: now,
  };
}
