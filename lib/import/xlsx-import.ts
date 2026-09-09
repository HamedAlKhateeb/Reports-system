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

export interface NormalizedSheet {
  name: string;
  headers: string[];
  rows: string[][];
  rowCount: number;
  colCount: number;
  truncated: boolean;
  merges: Array<{ start: string; end: string }>;
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
            row.push(`=${cell.f}`);
          } else {
            row.push((cell as any).v ?? '');
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

/** Build an existing-shape TableEntity for the Smart Table path (no new architecture). */
export function sheetToSmartTableEntity(
  sheet: NormalizedSheet,
  reportId: string,
  tableId: string,
  isAr: boolean
): any {
  const colCount = Math.max(sheet.colCount, 1);
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
  const now = new Date().toISOString();
  return {
    id: tableId,
    report_id: reportId,
    name: sheet.name || (isAr ? 'جدول مستورد' : 'Imported table'),
    direction: isAr ? 'rtl' : 'ltr',
    cell_formats: {},
    merged_cells: [],
    columns_data: columns,
    rows_data: rows.length > 0 ? rows : [Object.fromEntries(columns.map((c) => [c.id, '']))],
    version: 1,
    created_at: now,
    updated_at: now,
  };
}
