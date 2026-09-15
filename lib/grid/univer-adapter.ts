/**
 * UNIVER ADAPTER — bridge between TableEntity persistence and Univer snapshots.
 *
 * Architecture (post Univer migration):
 *
 *   Univer snapshot (entity.univerSnapshot)  = CANONICAL spreadsheet state.
 *     values, formulas, styles, merges, dimensions, direction.
 *
 *   columns_data / rows_data / cell_formats / merged_cells = DERIVED cache,
 *     regenerated from the snapshot on every save. Existing readers
 *     (DOCX / Markdown / PDF export, charts, share pages, backup) keep
 *     working byte-for-byte unchanged — they never touch Univer directly.
 *
 *   Lazy migration: tables created before Univer have no snapshot. The first
 *     open converts them via entityToUniverSnapshot() and persists the
 *     snapshot alongside the (unchanged) derived cache. No mass rewrite.
 *
 * This module is PURE (no Univer runtime imports — `import type` only), so it
 * is safe to use from server code, export routes, and node tests.
 */

import type {
  IWorkbookData,
  IWorksheetData,
  ICellData,
  IStyleData,
  IRange,
  IColorStyle,
} from '@univerjs/core';
import { colIndexToName, colNameToIndex } from './formula-parser';
import type { TableColumnEntity, TableEntity } from '../types';
import type { CellFormat, MergedRange } from './table-ops';

export const UNIVER_SHEET_ID = 'sheet-1';
export const UNIVER_APP_VERSION = '0.25.1';
/** Mirrors the legacy TABLE_LIMITS so product constraints do not change. */
export const UNIVER_GRID_CAP = { ROWS: 200, COLS: 26 } as const;

/**
 * Excel-like RTL: Arabic sheets get an Arabic-capable font stack, right
 * default alignment and arSA workbook locale so Arabic input, menus and
 * column mirroring all behave like Excel. LTR sheets keep Univer defaults.
 */
export const ARABIC_FONT_STACK = 'Tahoma, "Segoe UI", Arial, sans-serif';
// Default cell style for Arabic sheets: right-aligned, Arabic-capable
// font. (No `td` text-direction flag: the canvas pipeline does not consume
// it and unproven style fields stay out of persisted snapshots.)
export const ARABIC_DEFAULT_STYLE = {
  ff: ARABIC_FONT_STACK,
  fs: 11,
  ht: 3,
  vt: 2,
} as const;

// ---------------------------------------------------------------------------
// Style mapping (both directions, single place)
// ---------------------------------------------------------------------------

/** HorizontalAlign enum values (mirrors @univerjs/core, kept local to stay pure). */
const HT_LEFT = 1;
const HT_CENTER = 2;
const HT_RIGHT = 3;
const HT_JUSTIFIED = 4;

function rgb(color: unknown): IColorStyle | undefined {
  if (typeof color !== 'string') return undefined;
  const v = color.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return { rgb: v };
  return undefined;
}

/** Canonical CellFormat → Univer IStyleData (only fields we persist). */
export function cellFormatToUniverStyle(fmt: CellFormat): IStyleData {
  const style: IStyleData = {};
  if (fmt.align === 'left') style.ht = HT_LEFT;
  else if (fmt.align === 'center') style.ht = HT_CENTER;
  else if (fmt.align === 'right') style.ht = HT_RIGHT;
  else if (fmt.align === 'justify') style.ht = HT_JUSTIFIED;
  if (fmt.bold === true) style.bl = 1;
  if (fmt.italic === true) style.it = 1;
  if (fmt.underline === true) style.ul = { s: 1 };
  return style;
}

/** Univer IStyleData → canonical CellFormat (lossy by design: colors/numfmt
 *  live in the snapshot; exports keep the pre-Univer fidelity). */
export function univerStyleToCellFormat(style: IStyleData | null | undefined): CellFormat | null {
  if (!style || typeof style !== 'object') return null;
  const out: CellFormat = {};
  if (style.ht === HT_LEFT) out.align = 'left';
  else if (style.ht === HT_CENTER) out.align = 'center';
  else if (style.ht === HT_RIGHT) out.align = 'right';
  else if (style.ht === HT_JUSTIFIED) out.align = 'justify';
  if ((style as IStyleData).bl === 1) out.bold = true;
  if ((style as IStyleData).it === 1) out.italic = true;
  if ((style as IStyleData).ul?.s === 1) out.underline = true;
  return Object.keys(out).length > 0 ? out : null;
}

// ---------------------------------------------------------------------------
// Coordinates
// ---------------------------------------------------------------------------

function parseA1(coord: string): { c: number; r: number } | null {
  const m = String(coord || '').trim().match(/^(\$?)([A-Za-z]+)(\$?)([0-9]+)$/);
  if (!m) return null;
  const c = colNameToIndex(m[2].toUpperCase());
  const r = parseInt(m[4], 10) - 1;
  if (c < 0 || r < 0 || !isFinite(c) || !isFinite(r)) return null;
  return { c, r };
}

function toA1(c: number, r: number): string {
  return `${colIndexToName(c)}${r + 1}`.toUpperCase();
}

// ---------------------------------------------------------------------------
// Entity → Univer snapshot (migration + fresh tables)
// ---------------------------------------------------------------------------

export interface EntityToSnapshotOpts {
  /** App language at open time (sheet tab/name only — formulas stay canonical EN). */
  isAr?: boolean;
}

export function entityToUniverSnapshot(
  entity: TableEntity,
  opts: EntityToSnapshotOpts = {}
): IWorkbookData {
  const columns: TableColumnEntity[] = Array.isArray((entity as any).columns_data)
    ? (entity as any).columns_data
    : [];
  const rows: Record<string, any>[] = Array.isArray((entity as any).rows_data)
    ? (entity as any).rows_data
    : [];
  const formats: Record<string, CellFormat> = ((entity as any).cell_formats || {}) as Record<string, CellFormat>;
  const merges: MergedRange[] = Array.isArray((entity as any).merged_cells)
    ? (entity as any).merged_cells
    : [];
  const direction = (entity as any).direction === 'ltr' ? 'ltr' : 'rtl';

  const colCount = Math.min(Math.max(columns.length, 1), UNIVER_GRID_CAP.COLS);
  const rowLen = Math.min(Math.max(rows.length, 1), UNIVER_GRID_CAP.ROWS);

  const styles: Record<string, IStyleData> = {};
  const styleIds = new Map<string, string>();
  let styleSeq = 0;
  const styleIdFor = (fmt: CellFormat): string | undefined => {
    const style = cellFormatToUniverStyle(fmt);
    if (Object.keys(style).length === 0) return undefined;
    const key = JSON.stringify(style);
    let id = styleIds.get(key);
    if (!id) {
      styleSeq += 1;
      id = `s${styleSeq}`;
      styleIds.set(key, id);
      styles[id] = style;
    }
    return id;
  };

  const cellData: Record<number, Record<number, ICellData>> = {};
  for (let r = 0; r < rowLen; r++) {
    const row = rows[r] || {};
    for (let c = 0; c < colCount; c++) {
      const colId = columns[c]?.id || colIndexToName(c);
      const raw = row[colId];
      if (raw === undefined || raw === null || raw === '') continue;
      const cell: ICellData = {};
      if (typeof raw === 'string' && raw.startsWith('=')) {
        cell.f = raw;
      } else if (typeof raw === 'number' || typeof raw === 'boolean') {
        cell.v = raw;
      } else if (typeof raw === 'object') {
        continue;
      } else {
        cell.v = String(raw).slice(0, 10000);
      }
      const coord = toA1(c, r);
      const sid = formats[coord] ? styleIdFor(formats[coord]) : undefined;
      if (sid) cell.s = sid;
      if (cell.f !== undefined || cell.v !== undefined) {
        (cellData[r] ||= {})[c] = cell;
      }
    }
  }

  const mergeData: IRange[] = [];
  for (const m of merges) {
    try {
      const s = parseA1(m.start);
      const e = parseA1(m.end);
      if (!s || !e) continue;
      const sc = Math.min(s.c, e.c);
      const ec = Math.max(s.c, e.c);
      const sr = Math.min(s.r, e.r);
      const er = Math.max(s.r, e.r);
      if (sc === ec && sr === er) continue;
      if (ec >= colCount || er >= rowLen) continue;
      mergeData.push({ startRow: sr, startColumn: sc, endRow: er, endColumn: ec });
    } catch {
      continue;
    }
  }

  const columnData: Record<number, { w: number }> = {};
  columns.slice(0, colCount).forEach((col, i) => {
    const w = typeof col?.width === 'number' && isFinite(col.width)
      ? Math.min(600, Math.max(60, col.width))
      : 140;
    columnData[i] = { w };
  });

  const sheetName = typeof (entity as any).name === 'string' && (entity as any).name
    ? String((entity as any).name).slice(0, 60)
    : opts.isAr ? 'جدول' : 'Sheet';

  const sheet: Partial<IWorksheetData> = {
    id: UNIVER_SHEET_ID,
    name: sheetName,
    rowCount: UNIVER_GRID_CAP.ROWS,
    columnCount: UNIVER_GRID_CAP.COLS,
    defaultColumnWidth: 140,
    defaultRowHeight: 32,
    mergeData,
    cellData: cellData as IWorksheetData['cellData'],
    columnData: columnData as unknown as IWorksheetData['columnData'],
    rowData: {},
    showGridlines: 1,
    rightToLeft: direction === 'rtl' ? 1 : 0,
    rowHeader: { width: 44 },
    columnHeader: { height: 24 },
    // RTL sheets: Excel mirrors the whole grid (col A on the right) via
    // rightToLeft above AND right-aligns Arabic content by default via the
    // sheet default style below. LTR sheets keep Univer defaults.
    ...(direction === 'rtl'
      ? { defaultStyle: { ...ARABIC_DEFAULT_STYLE } as unknown as IWorksheetData['defaultStyle'] }
      : {}),
  };

  return {
    id: `wb-${(entity as any).id || 'table'}`,
    name: sheetName,
    appVersion: UNIVER_APP_VERSION,
    locale: (direction === 'rtl' ? 'arSA' : 'enUS') as unknown as IWorkbookData['locale'],
    styles,
    sheetOrder: [UNIVER_SHEET_ID],
    sheets: { [UNIVER_SHEET_ID]: sheet },
  };
}

/** True when the entity predates Univer and needs lazy migration on open. */
export function needsUniverMigration(entity: TableEntity | null | undefined): boolean {
  if (!entity || typeof entity !== 'object') return false;
  const snap = (entity as any).univerSnapshot;
  return !snap || typeof snap !== 'object' || !snap.sheets;
}

/**
 * Heals split-brain rich cells: a cell whose rich body (`p`) renders DIFFERENT
 * text than its canonical value (`v`). Display paths (grid, editor, formula
 * bar) prefer `p.body.dataStream` while value paths (exports, charts,
 * formulas, `getValue()`) read `v` — so a divergent `p` shows one thing and
 * saves another (e.g. reversed Arabic in the grid with a correct value).
 * Repair drops the divergent `p` so display follows `v` (the source every
 * consumer already agrees on). Untouched: formula cells, empty values,
 * cells without `p`, and `p` bodies whose plain text matches `v` (real
 * formatting is preserved). Never throws; returns the same ref when clean.
 */
export function normalizeDivergentRichText(snapshot: any): { snapshot: any; fixed: number } {
  const clean: { snapshot: any; fixed: number } = { snapshot, fixed: 0 };
  try {
    const sheets = snapshot?.sheets;
    if (!sheets || typeof sheets !== 'object') return clean;
    let clone: any = null;
    const cellOf = (sheet: any, r: string, c: string): any => {
      try {
        return sheet?.cellData?.[r]?.[c];
      } catch {
        return undefined;
      }
    };
    for (const sheetId of Object.keys(sheets)) {
      const sheet = sheets[sheetId];
      const cellData = sheet?.cellData;
      if (!cellData || typeof cellData !== 'object') continue;
      for (const rKey of Object.keys(cellData)) {
        const row = cellData[rKey];
        if (!row || typeof row !== 'object') continue;
        for (const cKey of Object.keys(row)) {
          let cell: any;
          try {
            cell = row[cKey];
          } catch {
            continue;
          }
          try {
            if (!cell || typeof cell !== 'object') continue;
            if (cell.f !== undefined && cell.f !== null) continue;
            const v = (cell as any).v;
            if (v === undefined || v === null || v === '') continue;
            const p = (cell as any).p;
            if (!p || typeof p !== 'object') continue;
            const stream = (p as any).body?.dataStream;
            if (typeof stream !== 'string') continue;
            const plain = stream.replace(/(\r\n|\n|\r)+$/, '');
            if (plain === String(v)) continue;
            if (!clone) {
              try {
                clone = JSON.parse(JSON.stringify(snapshot));
              } catch {
                return clean;
              }
            }
            const target = cellOf(clone.sheets[sheetId], rKey, cKey);
            if (target && typeof target === 'object' && target.p) {
              delete target.p;
              clean.fixed += 1;
            }
          } catch {}
        }
      }
    }
    if (clone) clean.snapshot = clone;
    return clean;
  } catch {
    return clean;
  }
}

/**
 * Boot-time snapshot guard: never hand the engine a structurally insane
 * workbook (absurd dimensions, out-of-bounds cells, non-array merges) —
 * the renderer can hang the tab trying to lay it out. Returns a SAFE
 * snapshot: the input pruned to grid caps when salvageable, otherwise null
 * (callers fall back to a fresh empty snapshot). Never throws.
 */
export function sanitizeSnapshotForBoot(snapshot: any): any | null {
  try {
    if (!snapshot || typeof snapshot !== 'object') return null;
    const sheets = (snapshot as any).sheets;
    if (!sheets || typeof sheets !== 'object') return null;
    const order = Array.isArray((snapshot as any).sheetOrder)
      ? (snapshot as any).sheetOrder.filter((id: unknown) => typeof id === 'string' && sheets[id])
      : Object.keys(sheets);
    if (order.length === 0) return null;
    const sheetId = order[0];
    const sheet = sheets[sheetId];
    if (!sheet || typeof sheet !== 'object') return null;

    const ROWS = UNIVER_GRID_CAP.ROWS;
    const COLS = UNIVER_GRID_CAP.COLS;
    const rowCount = typeof sheet.rowCount === 'number' && isFinite(sheet.rowCount) ? sheet.rowCount : ROWS;
    const colCount = typeof sheet.columnCount === 'number' && isFinite(sheet.columnCount) ? sheet.columnCount : COLS;
    // Absurd dimensions (corrupt or foreign snapshot) → refuse, caller rebuilds.
    if (rowCount < 1 || colCount < 1 || rowCount > 2000 || colCount > 500) return null;

    const maxR = Math.min(rowCount, ROWS) - 1;
    const maxC = Math.min(colCount, COLS) - 1;

    // Prune out-of-bounds cells (keeps everything inside caps as-is).
    let pruned = false;
    const cellData = sheet.cellData;
    if (cellData && typeof cellData === 'object') {
      for (const rKey of Object.keys(cellData)) {
        const r = parseInt(rKey, 10);
        if (!isFinite(r) || r < 0 || r > maxR) {
          delete cellData[rKey];
          pruned = true;
          continue;
        }
        const row = cellData[rKey];
        if (!row || typeof row !== 'object') {
          delete cellData[rKey];
          pruned = true;
          continue;
        }
        for (const cKey of Object.keys(row)) {
          const c = parseInt(cKey, 10);
          if (!isFinite(c) || c < 0 || c > maxC || row[cKey] == null || typeof row[cKey] !== 'object') {
            delete row[cKey];
            pruned = true;
          }
        }
      }
    } else if (cellData !== undefined) {
      sheet.cellData = {};
      pruned = true;
    }
    // Clamp dimensions to caps (empty padding beyond caps is meaningless).
    if (rowCount > ROWS || colCount > COLS) {
      sheet.rowCount = Math.min(rowCount, ROWS);
      sheet.columnCount = Math.min(colCount, COLS);
      pruned = true;
    }
    // Merges must be arrays inside bounds; drop the insane ones.
    if (sheet.mergeData !== undefined) {
      if (!Array.isArray(sheet.mergeData)) {
        sheet.mergeData = [];
        pruned = true;
      } else {
        const kept = sheet.mergeData.filter((m: any) => {
          try {
            if (!m || typeof m !== 'object') return false;
            const sr = Math.min(m.startRow, m.endRow);
            const er = Math.max(m.startRow, m.endRow);
            const sc = Math.min(m.startColumn, m.endColumn);
            const ec = Math.max(m.startColumn, m.endColumn);
            return (
              isFinite(sr) && isFinite(er) && isFinite(sc) && isFinite(ec) &&
              sr >= 0 && sc >= 0 && er <= maxR && ec <= maxC && !(sr === er && sc === ec)
            );
          } catch {
            return false;
          }
        });
        if (kept.length !== sheet.mergeData.length) {
          sheet.mergeData = kept;
          pruned = true;
        }
      }
    }
    if (!(snapshot as any).styles || typeof (snapshot as any).styles !== 'object') {
      (snapshot as any).styles = {};
      pruned = true;
    }
    (snapshot as any).sheetOrder = order;
    void pruned;
    return snapshot;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Snapshot → derived TableEntity fields (for readers: export/charts/share)
// ---------------------------------------------------------------------------

export interface DerivedTableFields {
  columns: TableColumnEntity[];
  rows: Record<string, any>[];
  cellFormats: Record<string, CellFormat>;
  mergedCells: MergedRange[];
  direction: 'rtl' | 'ltr';
  name: string;
}

export function univerSnapshotToDerived(snapshot: IWorkbookData): DerivedTableFields {
  const fallback: DerivedTableFields = {
    columns: [{ id: 'A', name: 'A', type: 'text', width: 140 } as TableColumnEntity],
    rows: [{ A: '' }],
    cellFormats: {},
    mergedCells: [],
    direction: 'rtl',
    name: '',
  };
  try {
    if (!snapshot || typeof snapshot !== 'object' || !snapshot.sheets) return fallback;
    const sheetId = (snapshot.sheetOrder || [])[0] || Object.keys(snapshot.sheets)[0];
    const sheet = snapshot.sheets[sheetId] as Partial<IWorksheetData> | undefined;
    if (!sheet) return fallback;

    const styles = (snapshot.styles || {}) as Record<string, IStyleData>;
    const cellData = (sheet.cellData || {}) as Record<string, Record<string, ICellData>>;
    const columnData = (sheet.columnData || {}) as Record<string, { w?: number }>;

    // Used extent (bounded — ignores Univer's empty padding rows/cols).
    let maxR = -1;
    let maxC = -1;
    for (const rKey of Object.keys(cellData)) {
      const r = parseInt(rKey, 10);
      if (!isFinite(r)) continue;
      for (const cKey of Object.keys(cellData[rKey] || {})) {
        const c = parseInt(cKey, 10);
        if (!isFinite(c)) continue;
        const cell = cellData[rKey][cKey];
        if (!cell) continue;
        const v: unknown = cell.v;
        const hasValue = v !== undefined && v !== null && v !== '';
        if (!hasValue && cell.f === undefined) continue;
        if (r > maxR) maxR = r;
        if (c > maxC) maxC = c;
      }
    }
    const colCount = Math.min(Math.max(maxC + 1, 1), UNIVER_GRID_CAP.COLS);
    const rowCount = Math.min(Math.max(maxR + 1, 1), UNIVER_GRID_CAP.ROWS);

    const columns: TableColumnEntity[] = [];
    for (let c = 0; c < colCount; c++) {
      const w = columnData[String(c)]?.w;
      columns.push({
        id: colIndexToName(c),
        name: colIndexToName(c),
        type: 'text',
        width: typeof w === 'number' && isFinite(w) ? Math.min(600, Math.max(60, w)) : 140,
      } as TableColumnEntity);
    }

    const rows: Record<string, any>[] = [];
    const cellFormats: Record<string, CellFormat> = {};
    for (let r = 0; r < rowCount; r++) {
      const row: Record<string, any> = {};
      for (let c = 0; c < colCount; c++) {
        const colId = colIndexToName(c);
        const cell = cellData[String(r)]?.[String(c)];
        let raw: any = '';
        if (cell) {
          if (typeof cell.f === 'string' && cell.f) raw = cell.f.startsWith('=') ? cell.f : `=${cell.f}`;
          else if (cell.v !== undefined && cell.v !== null) raw = cell.v;
        }
        row[colId] = raw;
        const sid = typeof cell?.s === 'string' ? cell.s : undefined;
        const fmt = sid && styles[sid] ? univerStyleToCellFormat(styles[sid]) : null;
        if (fmt) cellFormats[toA1(c, r)] = fmt;
      }
      rows.push(row);
    }

    const mergedCells: MergedRange[] = [];
    for (const m of sheet.mergeData || []) {
      try {
        const sr = Math.min(m.startRow, m.endRow);
        const er = Math.max(m.startRow, m.endRow);
        const sc = Math.min(m.startColumn, m.endColumn);
        const ec = Math.max(m.startColumn, m.endColumn);
        if (sc === ec && sr === er) continue;
        if (ec >= colCount || er >= rowCount) continue;
        mergedCells.push({ start: toA1(sc, sr), end: toA1(ec, er) });
      } catch {
        continue;
      }
    }

    return {
      columns,
      rows,
      cellFormats,
      mergedCells,
      direction: (sheet as IWorksheetData).rightToLeft === 1 ? 'rtl' : 'ltr',
      name: typeof sheet.name === 'string' ? sheet.name : '',
    };
  } catch {
    return fallback;
  }
}

/** Column header names live on the entity (Univer has no column-name concept);
 *  re-applied onto derived columns after regeneration. */
export function applyColumnNames(
  derived: DerivedTableFields,
  names: Array<string | undefined>
): DerivedTableFields {
  derived.columns.forEach((col, i) => {
    const n = names[i];
    if (typeof n === 'string' && n) col.name = n.slice(0, 120);
  });
  return derived;
}

// ---------------------------------------------------------------------------
// Explicit column-order mirror (REPAIR tool only — never automatic).
//
// History: a direction toggle that mirrored data automatically was shipped
// and REVERTED: without engine frame mirroring it only scrambles values
// while columns A/B/C stay left. Tables toggled during that window may
// have swapped columns. Because mirroring is an involution (mirror twice =
// identity), the affected user can restore their table by running the
// mirror once more — exposed as an explicit "repair column order" button
// with a confirm dialog (pressing twice undoes). Toggle/direction logic
// must NEVER call these implicitly (see toggleTableDirection).
// ---------------------------------------------------------------------------

/** Used column count of a snapshot sheet (1..COLS). */
export function snapshotUsedColCount(snapshot: any): number {
  try {
    const sheets = snapshot?.sheets;
    if (!sheets || typeof sheets !== 'object') return 1;
    const sheetId = (snapshot.sheetOrder || [])[0] || Object.keys(sheets)[0];
    const sheet = sheets[sheetId];
    if (!sheet || typeof sheet !== 'object') return 1;
    let maxC = -1;
    const cellData = sheet.cellData || {};
    for (const rKey of Object.keys(cellData)) {
      for (const cKey of Object.keys(cellData[rKey] || {})) {
        const c = parseInt(cKey, 10);
        if (isFinite(c) && c > maxC) maxC = c;
      }
    }
    for (const m of sheet.mergeData || []) {
      try {
        const e = Math.max(m.startColumn, m.endColumn);
        if (isFinite(e) && e > maxC) maxC = e;
      } catch {}
    }
    return Math.min(Math.max(maxC + 1, 1), UNIVER_GRID_CAP.COLS);
  } catch {
    return 1;
  }
}

const A1_REF_RE = /((?:'[^']+'|[A-Za-z0-9_\u0600-\u06FF]+)!)?(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7})/g;

/**
 * Rewrites A1 column references for a horizontal mirror of width W columns:
 * column c → W-1-c. Row numbers, $ markers and sheet qualifiers are kept.
 * String literals ("...") are never touched; function names (SUM() etc.)
 * are skipped via the trailing-( lookahead. References outside the mirrored
 * extent are left as-is (conservative: never corrupt).
 */
export function mirrorFormulaColumns(formula: string, colCount: number): string {
  if (typeof formula !== 'string' || !formula || !(colCount > 1)) return formula;
  const W = Math.min(Math.max(Math.floor(colCount), 2), UNIVER_GRID_CAP.COLS);
  const parts = formula.split('"');
  for (let i = 0; i < parts.length; i += 2) {
    A1_REF_RE.lastIndex = 0;
    parts[i] = parts[i].replace(
      A1_REF_RE,
      (match: string, sheet: string | undefined, colFix: string, letters: string, rowFix: string, rowNum: string, offset: number, whole: string) => {
        if (whole[offset + match.length] === '(') return match;
        const prev = offset > 0 ? whole[offset - 1] : '';
        if (prev && /[A-Za-z0-9_.]/.test(prev)) return match;
        let c: number;
        try {
          c = colNameToIndex(letters.toUpperCase());
        } catch {
          return match;
        }
        if (c < 0 || c >= W) return match;
        const mirrored = W - 1 - c;
        return `${sheet || ''}${colFix}${colIndexToName(mirrored)}${rowFix}${rowNum}`;
      }
    );
  }
  let out = parts.join('"');
  out = out.replace(
    /(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7}):(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7})/g,
    (m: string, cf1: string, l1: string, rf1: string, r1: string, cf2: string, l2: string, rf2: string, r2: string) => {
      let c1: number;
      let c2: number;
      try {
        c1 = colNameToIndex(l1.toUpperCase());
        c2 = colNameToIndex(l2.toUpperCase());
      } catch {
        return m;
      }
      const n1 = parseInt(r1, 10);
      const n2 = parseInt(r2, 10);
      if (c1 > c2 || (c1 === c2 && n1 > n2)) {
        return `${cf2}${l2}${rf2}${r2}:${cf1}${l1}${rf1}${r1}`;
      }
      return m;
    }
  );
  return out;
}

/**
 * Returns a horizontally mirrored copy of a Univer workbook snapshot
 * (used extent only). The input is never mutated. Involution: mirroring
 * twice restores the exact original.
 */
export function mirrorSnapshotHorizontally(snapshot: any): any {
  if (!snapshot || typeof snapshot !== 'object' || !snapshot.sheets) return snapshot;
  const W = snapshotUsedColCount(snapshot);
  if (W <= 1) return snapshot;
  let clone: any;
  try {
    clone = JSON.parse(JSON.stringify(snapshot));
  } catch {
    return snapshot;
  }
  try {
    const sheetId = (clone.sheetOrder || [])[0] || Object.keys(clone.sheets)[0];
    const sheet = clone.sheets[sheetId];
    if (!sheet || typeof sheet !== 'object') return snapshot;

    const nextCellData: Record<string, Record<string, ICellData>> = {};
    for (const rKey of Object.keys(sheet.cellData || {})) {
      for (const cKey of Object.keys(sheet.cellData[rKey] || {})) {
        const c = parseInt(cKey, 10);
        if (!isFinite(c) || c < 0 || c >= W) {
          (nextCellData[rKey] ||= {})[cKey] = sheet.cellData[rKey][cKey];
          continue;
        }
        const mc = W - 1 - c;
        const cell = sheet.cellData[rKey][cKey];
        const moved: ICellData = { ...(cell as object) } as ICellData;
        if (typeof (moved as any).f === 'string' && (moved as any).f) {
          (moved as any).f = mirrorFormulaColumns((moved as any).f, W);
        }
        (nextCellData[rKey] ||= {})[String(mc)] = moved;
      }
    }
    sheet.cellData = nextCellData;

    if (sheet.columnData && typeof sheet.columnData === 'object') {
      const nextColData: Record<string, unknown> = {};
      for (const cKey of Object.keys(sheet.columnData)) {
        const c = parseInt(cKey, 10);
        if (isFinite(c) && c >= 0 && c < W) nextColData[String(W - 1 - c)] = sheet.columnData[cKey];
        else nextColData[cKey] = sheet.columnData[cKey];
      }
      sheet.columnData = nextColData;
    }

    if (Array.isArray(sheet.mergeData)) {
      sheet.mergeData = sheet.mergeData.map((m: any) => {
        try {
          const sc = Math.min(m.startColumn, m.endColumn);
          const ec = Math.max(m.startColumn, m.endColumn);
          if (!isFinite(sc) || !isFinite(ec) || sc < 0 || ec >= W) return m;
          const nsc = W - 1 - ec;
          const nec = W - 1 - sc;
          return {
            ...m,
            startColumn: Math.min(nsc, nec),
            endColumn: Math.max(nsc, nec),
          };
        } catch {
          return m;
        }
      });
    }
  } catch {
    return snapshot;
  }
  return clone;
}

/** Reverses the first W header names so they travel with mirrored columns. */
export function mirrorColumnNames(
  names: Array<string | undefined>,
  colCount: number
): Array<string | undefined> {
  const W = Math.min(Math.max(Math.floor(colCount) || 0, 0), names.length);
  const head = names.slice(0, W).reverse();
  return [...head, ...names.slice(W)];
}

export { rgb as _rgbHelper };
