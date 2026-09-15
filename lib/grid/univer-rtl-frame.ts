/**
 * UNIVER RTL FRAME — Excel-style right-to-left sheet frame for Univer 0.25.1.
 *
 * WHAT: mirrors the sheet VIEW (not the data) when the worksheet carries
 * `rightToLeft: 1`: column A renders at the right, row numbers at the right,
 * the column header runs right-to-left, hit-testing / selection / scrolling /
 * the cell editor all follow. Formulas, values, merges and exports are
 * untouched — the data model never moves.
 *
 * WHY HERE (not upstream): upstream PR dream-num/univer#7011 (vendored in
 * vendor/univer-rtl) covers bidi TEXT only — `Worksheet.isRightToLeft()`
 * exists in @univerjs/core with ZERO consumers (verified in the 0.25.1
 * bundles: no renderer reads it). Grid-frame mirroring does not exist
 * upstream in any release, so it is implemented here, PR-style: centralized,
 * per-sheet gated, view-layer only.
 *
 * HOW (all pieces verified against the 0.25.1 bundles — see comments):
 *  1. SheetSkeleton coord methods are the single choke point: every render
 *     extension (background/border/font/selection) and every hit-test goes
 *     through `getCellWithCoordByIndex` / `getColumnIndexByOffsetX` /
 *     `getCellWithCoordByIndex`-family on the skeleton instance. Mirroring
 *     their scene-space X outputs mirrors the whole grid consistently.
 *  2. Header labels use raw accumulation arrays (not skeleton methods), so
 *     `ColumnHeaderLayout.draw` runs with an X-mirroring canvas proxy, and
 *     the three header/main component draws are re-issued with RTL-shifted
 *     translates (1-line changes, version-pinned copies).
 *  3. Viewport rects (9 sheet viewports, created in sheets-ui
 *     SheetRenderController + FreezeRenderController) are mirrored at the
 *     INSTANCE level via the public Viewport API — no controller patching.
 *     A per-scene state machine ({ltr|rtl, lastCanvasWidth}) keeps the
 *     mirror exact across resizes and freeze changes: the mirror is an
 *     involution, so re-mirroring with the same canvas width is a no-op and
 *     drift is detected by rect signature (RTL viewMain.left is always 0).
 *  4. Scroll/wheel/pointer mechanics are NOT patched: they pan scene space,
 *     which is already mirrored, so the stock scrollbar behaves like an RTL
 *     scrollbar (thumb starts at the right, drag directions match Excel).
 *
 * SAFETY:
 *  - Every prototype patch self-gates on the sheet's own `rightToLeft`
 *    flag, read live per call. LTR sheets are byte-identical to stock.
 *    Direction toggles rebuild the sheet (new skeleton + config), so the
 *    gate follows automatically. Multiple mounted sheets stay independent.
 *  - Known v1 gaps (documented, not silently broken): floating
 *    drawings/images keep LTR anchoring (sheets-drawing hardcodes
 *    `colStartX + rowHeaderWidth`); `colStartX`/`getDistanceFromTopLeft`
 *    are deliberately NOT patched for that reason.
 *
 * PINNED to @univerjs 0.25.1 (vendored). If the vendor directory is ever
 * dropped for an upstream release with real frame mirroring, delete this
 * module and its wiring in UniverTable.
 */

import { SheetSkeleton, searchArray, getTransformOffsetX } from '@univerjs/core';
import {
  rtlSceneWidth,
  mirrorSceneRect,
  mirrorContentRect,
  mirrorViewBoundX,
  mirrorTextAlign,
  mirrorColumnOffset,
  rtlInitialViewportScrollX,
  isRtlFlag,
} from './rtl-frame-math';

// ---------------------------------------------------------------------------
// Gates (per-sheet, read live — no global flags, no leaks)
// ---------------------------------------------------------------------------

/** True when the skeleton's worksheet is an RTL sheet. Never throws. */
export function isRtlSkeleton(skeleton: any): boolean {
  try {
    const ws = skeleton?.worksheet;
    const cfg = typeof ws?.getConfig === 'function' ? ws.getConfig() : ws?.getConfig?.();
    // getConfig() may be the data object itself on some paths; accept both.
    const flag = cfg && typeof cfg === 'object' ? (cfg as any).rightToLeft : undefined;
    return isRtlFlag(flag);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// X-mirroring canvas proxy (header labels + gridlines: pure line/text draws)
// ---------------------------------------------------------------------------

type CtxMethod4 = (x: number, y: number, w: number, h: number, ...rest: any[]) => unknown;
type CtxMethod2 = (x: number, y: number, ...rest: any[]) => unknown;

const RECT_METHODS = new Set(['fillRectByPrecision', 'rectByPrecision', 'clearRectByPrecision']);
const POINT_METHODS = new Set(['moveToByPrecision', 'lineToByPrecision', 'moveTo', 'lineTo']);

/**
 * Wraps a UniverRenderingContext so every X coordinate is mirrored around
 * `size` (columns zone [0 .. size], header-excluded). Unknown methods and
 * property writes pass through untouched, except `textAlign` (left↔right).
 * Closed method set verified against ColumnHeaderLayout.draw and
 * Spreadsheet._drawAuxiliary in 0.25.1 — see module header.
 */
function mirrorCtxX(ctx: any, size: number): any {
  return new Proxy(ctx, {
    get(target: any, prop: string | symbol): unknown {
      if (prop === 'fillText') {
        return (text: unknown, x: number, y: number, ...rest: any[]) =>
          (target.fillText as (...a: any[]) => unknown).call(target, text, size - x, y, ...rest);
      }
      if (typeof prop === 'string' && RECT_METHODS.has(prop)) {
        const fn = target[prop] as CtxMethod4;
        return (x: number, y: number, w: number, h: number, ...rest: any[]) =>
          fn.call(target, size - x - w, y, w, h, ...rest);
      }
      if (typeof prop === 'string' && POINT_METHODS.has(prop)) {
        const fn = target[prop] as CtxMethod2;
        return (x: number, y: number, ...rest: any[]) => fn.call(target, size - x, y, ...rest);
      }
      const value: unknown = target[prop];
      return typeof value === 'function' ? (value as (...a: any[]) => unknown).bind(target) : value;
    },
    set(target: any, prop: string | symbol, value: unknown): boolean {
      (target as any)[prop] = prop === 'textAlign' && typeof value === 'string' ? (mirrorTextAlign(value) ?? value) : value;
      return true;
    },
  });
}

// ---------------------------------------------------------------------------
// Prototype patching (idempotent, gated, additive-only)
// ---------------------------------------------------------------------------

// Module-level idempotency, HMR-safe: a dev hot-reload re-executes this
// module, but the live prototypes keep prior patches — re-wrapping them
// would stack mirrors (two mirrors = silently unmirrored). The flag lives
// on globalThis so re-execution still sees it.
const patchedMethods: Set<string> = (() => {
  try {
    const g = globalThis as any;
    if (!(g.__univerRtlFramePatched instanceof Set)) g.__univerRtlFramePatched = new Set<string>();
    return g.__univerRtlFramePatched as Set<string>;
  } catch {
    return new Set<string>();
  }
})();

function patchOnce(key: string, apply: () => void): void {
  if (patchedMethods.has(key)) return;
  try {
    apply();
    patchedMethods.add(key);
  } catch (err) {
    console.warn(`[rtl-frame] patch skipped: ${key}`, err);
  }
}

function sheetMetrics(skeleton: any): { W: number; L: number; H: number } {
  const W = Number(skeleton?.columnTotalWidth) || 0;
  const L = Number(skeleton?.rowHeaderWidthAndMarginLeft) || 0;
  const H = Number(skeleton?.columnHeaderHeightAndMarginTop) || 0;
  return { W, L, H };
}

function patchSheetSkeletonCoords(): void {
  const proto = SheetSkeleton.prototype as any;

  patchOnce('SheetSkeleton.getCellWithCoordByIndex', () => {
    const orig = proto.getCellWithCoordByIndex;
    if (typeof orig !== 'function') return;
    proto.getCellWithCoordByIndex = function (row: number, column: number, header = true) {
      const res = orig.call(this, row, column, header);
      try {
        if (!isRtlSkeleton(this) || !res) return res;
        const { W, L } = sheetMetrics(this);
        const rect = header === false
          ? mirrorContentRect({ startX: res.startX, endX: res.endX }, W)
          : mirrorSceneRect({ startX: res.startX, endX: res.endX }, rtlSceneWidth(W, L));
        res.startX = rect.startX;
        res.endX = rect.endX;
        const mi = res.mergeInfo;
        if (mi && typeof mi.startX === 'number' && typeof mi.endX === 'number') {
          const m = header === false
            ? mirrorContentRect({ startX: mi.startX, endX: mi.endX }, W)
            : mirrorSceneRect({ startX: mi.startX, endX: mi.endX }, rtlSceneWidth(W, L));
          mi.startX = m.startX;
          mi.endX = m.endX;
        }
      } catch {}
      return res;
    };
  });

  patchOnce('SheetSkeleton.getNoMergeCellWithCoordByIndex', () => {
    const orig = proto.getNoMergeCellWithCoordByIndex;
    if (typeof orig !== 'function') return;
    proto.getNoMergeCellWithCoordByIndex = function (rowIndex: number, columnIndex: number, header = true) {
      const res = orig.call(this, rowIndex, columnIndex, header);
      try {
        if (!isRtlSkeleton(this) || !res) return res;
        const { W, L } = sheetMetrics(this);
        const rect = header === false
          ? mirrorContentRect({ startX: res.startX, endX: res.endX }, W)
          : mirrorSceneRect({ startX: res.startX, endX: res.endX }, rtlSceneWidth(W, L));
        res.startX = rect.startX;
        res.endX = rect.endX;
      } catch {}
      return res;
    };
  });

  patchOnce('SheetSkeleton.getOffsetByColumn', () => {
    const orig = proto.getOffsetByColumn;
    if (typeof orig !== 'function') return;
    proto.getOffsetByColumn = function (column: number) {
      const value = orig.call(this, column);
      try {
        if (!isRtlSkeleton(this) || typeof value !== 'number') return value;
        const { W, L } = sheetMetrics(this);
        return rtlSceneWidth(W, L) - value;
      } catch {
        return value;
      }
    };
  });

  patchOnce('SheetSkeleton.getColumnIndexByOffsetX', () => {
    const orig = proto.getColumnIndexByOffsetX;
    if (typeof orig !== 'function') return;
    proto.getColumnIndexByOffsetX = function (evtOffsetX: number, scaleX: number, scrollXY: { x: number; y: number }, options?: any) {
      try {
        if (!isRtlSkeleton(this)) return orig.call(this, evtOffsetX, scaleX, scrollXY, options);
        // RTL scene has no left header: scene x = evt/scale + scroll.x,
        // grid x = W - scene x. Then the stock search runs unchanged.
        const { W } = sheetMetrics(this);
        const sceneX = getTransformOffsetX(evtOffsetX, scaleX, scrollXY, 0);
        const mx = W - sceneX;
        const acc = this.columnWidthAccumulation as number[];
        let column: number = searchArray(acc, mx, options?.firstMatch);
        if (options?.closeFirst) {
          const prev = acc[column - 1] ?? 0;
          if (Math.abs(acc[column] - mx) < Math.abs(mx - prev)) column = column + 1;
        }
        return column;
      } catch {
        return orig.call(this, evtOffsetX, scaleX, scrollXY, options);
      }
    };
  });

  patchOnce('SheetSkeleton.getOffsetRelativeToRowCol', () => {
    const orig = proto.getOffsetRelativeToRowCol;
    if (typeof orig !== 'function') return;
    proto.getOffsetRelativeToRowCol = function (offsetX: number, offsetY: number) {
      try {
        if (!isRtlSkeleton(this)) return orig.call(this, offsetX, offsetY);
        const { W } = sheetMetrics(this);
        const res = orig.call(this, W - offsetX, offsetY);
        // Intra-cell offset mirrors within the cell's content width.
        const acc = this.columnWidthAccumulation as number[];
        const gap = typeof this.getColGapSize === 'function' ? Number(this.getColGapSize(res.column)) || 0 : 0;
        const prev = acc[res.column - 1] ?? 0;
        const end = acc[res.column];
        if (typeof end === 'number') {
          res.columnOffset = mirrorColumnOffset(res.columnOffset, end - prev - gap);
        }
        return res;
      } catch {
        return orig.call(this, offsetX, offsetY);
      }
    };
  });
}

/** Engine-render-side patches (loaded lazily — engine-render cannot be node-required). */
async function patchEngineRender(): Promise<void> {
  const er = await import('@univerjs/engine-render');
  const Spreadsheet = (er as any).Spreadsheet;
  const SpreadsheetColumnHeader = (er as any).SpreadsheetColumnHeader;
  const SpreadsheetRowHeader = (er as any).SpreadsheetRowHeader;
  const ColumnHeaderLayout = (er as any).ColumnHeaderLayout;
  if (!Spreadsheet || !SpreadsheetColumnHeader || !SpreadsheetRowHeader || !ColumnHeaderLayout) return;

  // Visible-range choke: every range-from-viewport query funnels through
  // SpreadsheetSkeleton._getRangeByViewBounding (verified: getRangeByViewport,
  // getCacheRangeByViewport, getRangeByViewBound, getRangeByBounding,
  // updateVisibleRange, setStylesCache). Mirror the bound, delegate.
  patchOnce('SpreadsheetSkeleton._getRangeByViewBounding', () => {
    const proto = (er as any).SpreadsheetSkeleton?.prototype;
    const orig = proto?.['_getRangeByViewBounding'];
    if (!proto || typeof orig !== 'function') return;
    proto['_getRangeByViewBounding'] = function (
      rowHeightAccumulation: number[],
      columnWidthAccumulation: number[],
      viewBound: any,
      isPrinting?: boolean
    ) {
      try {
        if (!isRtlSkeleton(this) || !viewBound) {
          return orig.call(this, rowHeightAccumulation, columnWidthAccumulation, viewBound, isPrinting);
        }
        const { W, L } = sheetMetrics(this);
        const mirrored = mirrorViewBoundX(viewBound, rtlSceneWidth(W, L));
        return orig.call(this, rowHeightAccumulation, columnWidthAccumulation, mirrored, isPrinting);
      } catch {
        return orig.call(this, rowHeightAccumulation, columnWidthAccumulation, viewBound, isPrinting);
      }
    };
  });

  // Main grid render: version-pinned copy of Spreadsheet.render with the
  // content translate moved from (L, T) to (0, T) for RTL sheets — the
  // mirrored skeleton coords already occupy [0 .. W]. updateTransformerZero
  // intentionally keeps (L, T): the Transformer drives floating drawings,
  // which stay LTR-anchored in v1 (see module header).
  patchOnce('Spreadsheet.render', () => {
    const CONTENT_KEYS = ['viewMain', 'viewMainLeftTop', 'viewMainTop', 'viewMainLeft'];
    const HEADER_KEYS = ['viewRowTop', 'viewRowBottom', 'viewColumnLeft', 'viewColumnRight', 'viewLeftTop'];
    const orig = Spreadsheet.prototype.render;
    if (typeof orig !== 'function') return;
    Spreadsheet.prototype.render = function (mainCtx: any, viewportInfo: any) {
      let rtl = false;
      try {
        rtl = isRtlSkeleton(this.getSkeleton?.());
      } catch {}
      if (!rtl) return orig.call(this, mainCtx, viewportInfo);
      if (!this.visible) {
        this.makeDirty(false);
        return this;
      }
      const spreadsheetSkeleton = this.getSkeleton();
      if (!spreadsheetSkeleton) return;
      spreadsheetSkeleton.setStylesCache(viewportInfo);
      const segment = spreadsheetSkeleton.rowColumnSegment;
      if (!segment) return;
      if (
        (segment.startRow === -1 && segment.endRow === -1) ||
        (segment.startColumn === -1 && segment.endColumn === -1)
      ) {
        return;
      }
      mainCtx.save();
      const { rowHeaderWidthAndMarginLeft, columnHeaderHeightAndMarginTop } = spreadsheetSkeleton;
      mainCtx.translateWithPrecision(0, columnHeaderHeightAndMarginTop);
      this.getScene()?.updateTransformerZero(rowHeaderWidthAndMarginLeft, columnHeaderHeightAndMarginTop);
      const { viewportKey } = viewportInfo;
      if (CONTENT_KEYS.includes(viewportKey)) {
        if (viewportInfo && viewportInfo.cacheCanvas) this.renderByViewports(mainCtx, viewportInfo, spreadsheetSkeleton);
        else this._draw(mainCtx, viewportInfo);
      } else if (HEADER_KEYS.includes(viewportKey)) {
        // Header viewports never paint grid content (matches upstream).
      } else if (viewportInfo && viewportInfo.cacheCanvas) {
        this.renderByViewports(mainCtx, viewportInfo, spreadsheetSkeleton);
      } else {
        this._draw(mainCtx, viewportInfo);
      }
      mainCtx.restore();
      return this;
    };
  });

  // Gridlines/auxiliary: same draws, X-mirrored ctx (no text involved).
  patchOnce('Spreadsheet._drawAuxiliary', () => {
    const orig = Spreadsheet.prototype._drawAuxiliary;
    if (typeof orig !== 'function') return;
    Spreadsheet.prototype._drawAuxiliary = function (ctx: any, ...rest: any[]) {
      try {
        const skel = this.getSkeleton?.();
        if (skel && isRtlSkeleton(skel)) {
          return orig.call(this, mirrorCtxX(ctx, Number(skel.columnTotalWidth) || 0), ...rest);
        }
      } catch {}
      return orig.call(this, ctx, ...rest);
    };
  });

  // Scroll-exposed strip repaint: cache math subtracts the left header,
  // which is on the right in RTL — neutralize it for RTL sheets.
  patchOnce('Spreadsheet.paintNewAreaForScrolling', () => {
    const orig = Spreadsheet.prototype.paintNewAreaForScrolling;
    if (typeof orig !== 'function') return;
    Spreadsheet.prototype.paintNewAreaForScrolling = function (viewportInfo: any, param: any) {
      try {
        const skel = this.getSkeleton?.();
        if (skel && isRtlSkeleton(skel) && param && typeof param === 'object') {
          return orig.call(this, viewportInfo, { ...param, rowHeaderWidthAndMarginLeft: 0 });
        }
      } catch {}
      return orig.call(this, viewportInfo, param);
    };
  });

  // Overflow clip: _clipByRenderBounds mixes already-mirrored cell rects
  // (renderFontCtx.startX/endX) with raw-accumulation overflow spans
  // (_clipRectangleForOverflow, header-excluded LTR space). Without this,
  // overflowed Arabic text is clipped away and its cell renders EMPTY.
  // Fix: run the original against un-mirrored (LTR content) coords under an
  // X-mirroring proxy, so both the single-cell rect and the overflow span
  // come out mirrored exactly once; then map the adjusted rect back.
  patchOnce('Font._clipByRenderBounds', () => {
    const Font = (er as any).Font;
    const orig = Font?.prototype?._clipByRenderBounds;
    if (!Font || typeof orig !== 'function') return;
    Font.prototype._clipByRenderBounds = function (renderFontCtx: any, row: number, col: number, padding = 0) {
      let skel: any = null;
      try {
        skel = renderFontCtx?.spreadsheetSkeleton;
        if (!skel || !isRtlSkeleton(skel)) return orig.call(this, renderFontCtx, row, col, padding);
        const { W } = sheetMetrics(skel);
        const sx = Number(renderFontCtx?.startX);
        const ex = Number(renderFontCtx?.endX);
        const ctx = renderFontCtx?.ctx;
        if (!(W > 0) || !isFinite(sx) || !isFinite(ex) || !ctx) {
          return orig.call(this, renderFontCtx, row, col, padding);
        }
        const un = { ...renderFontCtx, startX: W - ex, endX: W - sx, ctx: mirrorCtxX(ctx, W) };
        const out = orig.call(this, un, row, col, padding);
        try {
          const ux = Number(un.startX);
          const uex = Number(un.endX);
          if (isFinite(ux) && isFinite(uex)) {
            renderFontCtx.startX = W - uex;
            renderFontCtx.endX = W - ux;
          }
          renderFontCtx.startY = un.startY;
          renderFontCtx.endY = un.endY;
        } catch {}
        return out;
      } catch {
        return orig.call(this, renderFontCtx, row, col, padding);
      }
    };
  });

  // Column header component: pinned copy with translate (0, marginTop) for
  // RTL (labels are mirrored by the layout proxy below into [0 .. W]).
  patchOnce('SpreadsheetColumnHeader.draw', () => {
    const orig = SpreadsheetColumnHeader.prototype.draw;
    if (typeof orig !== 'function') return;
    SpreadsheetColumnHeader.prototype.draw = function (ctx: any, bounds: any) {
      let rtl = false;
      try {
        rtl = isRtlSkeleton(this.getSkeleton?.());
      } catch {}
      if (!rtl) return orig.call(this, ctx, bounds);
      const spreadsheetSkeleton = this.getSkeleton();
      if (!spreadsheetSkeleton) return;
      const parentScale = this.getParentScale();
      spreadsheetSkeleton.updateVisibleRange(bounds);
      const segment = spreadsheetSkeleton.rowColumnSegment;
      if (!segment) return;
      if (segment.startColumn === -1 && segment.endColumn === -1) return;
      const { columnHeaderHeightAndMarginTop, columnHeaderHeight } = spreadsheetSkeleton;
      const marginTop = columnHeaderHeightAndMarginTop - columnHeaderHeight;
      ctx.translateWithPrecision(0, marginTop);
      const extensions = this.getExtensionsByOrder();
      for (const extension of extensions) extension.draw(ctx, parentScale, spreadsheetSkeleton);
    };
  });

  // Row header component: pinned copy shifting the number strip right by W.
  patchOnce('SpreadsheetRowHeader.draw', () => {
    const orig = SpreadsheetRowHeader.prototype.draw;
    if (typeof orig !== 'function') return;
    SpreadsheetRowHeader.prototype.draw = function (ctx: any, bounds: any) {
      let rtl = false;
      try {
        rtl = isRtlSkeleton(this.getSkeleton?.());
      } catch {}
      if (!rtl) return orig.call(this, ctx, bounds);
      const spreadsheetSkeleton = this.getSkeleton();
      if (!spreadsheetSkeleton) return;
      const parentScale = this.getParentScale();
      spreadsheetSkeleton.updateVisibleRange(bounds);
      const segment = spreadsheetSkeleton.rowColumnSegment;
      if (!segment) return;
      if (segment.startRow === -1 && segment.endRow === -1) return;
      const { columnHeaderHeightAndMarginTop, rowHeaderWidth, rowHeaderWidthAndMarginLeft } = spreadsheetSkeleton;
      const marginLeft = rowHeaderWidthAndMarginLeft - rowHeaderWidth;
      ctx.translateWithPrecision(marginLeft + (Number(spreadsheetSkeleton.columnTotalWidth) || 0), columnHeaderHeightAndMarginTop);
      const extensions = this.getExtensionsByOrder();
      for (const extension of extensions) extension.draw(ctx, parentScale, spreadsheetSkeleton);
    };
  });

  // Column header labels: raw accumulation positions → mirror them.
  patchOnce('ColumnHeaderLayout.draw', () => {
    const orig = ColumnHeaderLayout.prototype.draw;
    if (typeof orig !== 'function') return;
    ColumnHeaderLayout.prototype.draw = function (ctx: any, parentScale: any, spreadsheetSkeleton: any) {
      try {
        if (spreadsheetSkeleton && isRtlSkeleton(spreadsheetSkeleton)) {
          return orig.call(this, mirrorCtxX(ctx, Number(spreadsheetSkeleton.columnTotalWidth) || 0), parentScale, spreadsheetSkeleton);
        }
      } catch {}
      return orig.call(this, ctx, parentScale, spreadsheetSkeleton);
    };
  });

  // Overflow documents: _renderDocuments positions the overflow span via
  // getCellWithCoordByIndex(endRow, endColumn) / (startRow, startColumn) and
  // assumes data order == x order (startX <= endX). In a mirrored frame the
  // data-first column sits at a HIGHER scene x, so the span inverts and the
  // view bound goes negative → the text never paints (empty cell). Fix: hand
  // the original a cache shim whose getValue swaps the two column ends. The
  // column SET is identical (same span, ordered low..high), so every other
  // consumer of the range is unaffected.
  patchOnce('Font._renderDocuments', () => {
    const Font = (er as any).Font;
    const orig = Font?.prototype?._renderDocuments;
    if (!Font || typeof orig !== 'function') return;
    Font.prototype._renderDocuments = function (ctx: any, row: number, col: number, renderFontCtx: any, overflowCache: any) {
      try {
        const skel = renderFontCtx?.spreadsheetSkeleton;
        if (!skel || !isRtlSkeleton(skel) || !overflowCache || typeof overflowCache.getValue !== 'function') {
          return orig.call(this, ctx, row, col, renderFontCtx, overflowCache);
        }
        let probe: any = null;
        try {
          probe = overflowCache.getValue(row, col);
        } catch {}
        if (
          !probe ||
          typeof probe !== 'object' ||
          typeof probe.startColumn !== 'number' ||
          typeof probe.endColumn !== 'number' ||
          probe.startColumn === probe.endColumn
        ) {
          return orig.call(this, ctx, row, col, renderFontCtx, overflowCache);
        }
        const shimmed = new Proxy(overflowCache, {
          get(target: any, prop: string | symbol): unknown {
            if (prop === 'getValue') {
              return (r: number, c: number) => {
                const range = target.getValue(r, c);
                if (!range || typeof range !== 'object') return range;
                const { startColumn, endColumn } = range;
                if (typeof startColumn !== 'number' || typeof endColumn !== 'number' || startColumn === endColumn) {
                  return range;
                }
                return { ...range, startColumn: endColumn, endColumn: startColumn };
              };
            }
            const value: unknown = target[prop];
            return typeof value === 'function' ? (value as (...a: any[]) => unknown).bind(target) : value;
          },
        });
        return orig.call(this, ctx, row, col, renderFontCtx, shimmed);
      } catch {
        return orig.call(this, ctx, row, col, renderFontCtx, overflowCache);
      }
    };
  });

  // Hit tests: exact mirrors of the upstream conditions (same strictness),
  // evaluated on the LTR-equivalent x (mx = S - oCoord.x).
  patchOnce('Spreadsheet.isHit', () => {
    const orig = Spreadsheet.prototype.isHit;
    if (typeof orig !== 'function') return;
    // Upstream: oCoord.x > L && oCoord.y > T.
    Spreadsheet.prototype.isHit = function (this: any, coord: any) {
      const skeleton = this.getSkeleton?.();
      if (!skeleton) return false;
      let oCoord: any;
      try {
        oCoord = this.getInverseCoord(coord);
      } catch {
        return false;
      }
      try {
        if (isRtlSkeleton(skeleton)) {
          const { W, L, H } = sheetMetrics(skeleton);
          return rtlSceneWidth(W, L) - oCoord.x > L && oCoord.y > H;
        }
      } catch {}
      return orig.call(this, coord);
    };
  });

  patchOnce('SpreadsheetColumnHeader.isHit', () => {
    const orig = SpreadsheetColumnHeader.prototype.isHit;
    if (typeof orig !== 'function') return;
    // Upstream: oCoord.x > L && y in [marginTop, T].
    SpreadsheetColumnHeader.prototype.isHit = function (this: any, coord: any) {
      const skeleton = this.getSkeleton?.();
      if (!skeleton) return false;
      let oCoord: any;
      try {
        oCoord = this.getInverseCoord(coord);
      } catch {
        return false;
      }
      try {
        if (isRtlSkeleton(skeleton)) {
          const { W, L, H } = sheetMetrics(skeleton);
          const marginTop = H - Number(skeleton?.columnHeaderHeight || 0);
          const mx = rtlSceneWidth(W, L) - oCoord.x;
          return mx > L && oCoord.y >= marginTop && oCoord.y <= H;
        }
      } catch {}
      return orig.call(this, coord);
    };
  });

  patchOnce('SpreadsheetRowHeader.isHit', () => {
    const orig = SpreadsheetRowHeader.prototype.isHit;
    if (typeof orig !== 'function') return;
    // Upstream: oCoord.x in [marginLeft, L] && oCoord.y > T.
    SpreadsheetRowHeader.prototype.isHit = function (this: any, coord: any) {
      const skeleton = this.getSkeleton?.();
      if (!skeleton) return false;
      let oCoord: any;
      try {
        oCoord = this.getInverseCoord(coord);
      } catch {
        return false;
      }
      try {
        if (isRtlSkeleton(skeleton)) {
          const { W, L, H } = sheetMetrics(skeleton);
          const marginLeft = L - Number(skeleton?.rowHeaderWidth || 0);
          const mx = rtlSceneWidth(W, L) - oCoord.x;
          return mx >= marginLeft && mx <= L && oCoord.y > H;
        }
      } catch {}
      return orig.call(this, coord);
    };
  });
}

/** Installs all RTL frame patches (idempotent). Safe to call repeatedly. */
export async function installRtlFramePatches(): Promise<boolean> {  try {
    patchSheetSkeletonCoords();
  } catch (err) {
    console.warn('[rtl-frame] core patches failed', err);
    return false;
  }
  try {
    await patchEngineRender();
  } catch (err) {
    console.warn('[rtl-frame] engine-render patches failed', err);
    return false;
  }
  return true;
}

/** Diagnostic: names of the patches installed so far (console verification). */
export function __rtlFramePatched(): string[] {
  return Array.from(patchedMethods);
}

// ---------------------------------------------------------------------------
// Instance layout: viewport rects, corner placeholder, initial scroll
// ---------------------------------------------------------------------------

const SHEET_VIEWPORT_KEYS = [
  'viewMain',
  'viewMainLeftTop',
  'viewMainTop',
  'viewMainLeft',
  'viewRowTop',
  'viewRowBottom',
  'viewColumnLeft',
  'viewColumnRight',
  'viewLeftTop',
];

export interface RtlSheetContext {
  scene: any;
  skeleton: any;
  viewMain: any;
}

interface SceneFrameState {
  state: 'ltr' | 'rtl';
  lastCanvasWidth: number;
}

const sceneFrameState = new WeakMap<object, SceneFrameState>();

function canvasWidthOf(scene: any, domFallback?: number): number | null {
  const pick = (v: unknown): number | null =>
    typeof v === 'number' && isFinite(v) && v > 0 ? v : null;
  // Viewport rects live in canvas space (parentWidth - (left + right)), so
  // every source below must be the canvas/host width, never scene content.
  try {
    const c1 = pick((scene as any)?.getParent?.()?.width);
    if (c1) return c1;
  } catch {}
  try {
    const eng = (scene as any)?.getEngine?.();
    const c2 = pick((eng as any)?.width) ?? pick((eng as any)?.getCanvas?.()?.getWidth?.());
    if (c2) return c2;
  } catch {}
  return pick(domFallback);
}

function readViewportH(vp: any): { left: number | null; right: number | null; width: number | null } | null {
  try {
    const left = typeof vp?.left === 'number' ? (vp.left as number) : null;
    const right = typeof vp?.right === 'number' ? (vp.right as number) : null;
    const width = typeof vp?.width === 'number' ? (vp.width as number) : null;
    // Width-mode viewports (row header, frozen panes) carry no `right`;
    // left+right viewports (viewMain, column header) carry no `width`.
    if (width != null && left == null) return null;
    if (width == null && (left == null || right == null)) return null;
    return { left, right, width };
  } catch {
    return null;
  }
}

/**
 * Mirror one viewport's horizontal rect in canvas space.
 * - left+right viewports: swap both values (exact involution).
 * - width viewports: re-anchor left ONLY, keep width, never touch `right`
 *   (writing right would break the toggle-back exactness; width-mode sizing
 *   ignores `right` by construction: _calcViewPortSize prefers widthOrigin,
 *   clip/hit use left+width).
 */
function mirrorOneViewport(vp: any, canvasWidth: number): boolean {
  const rect = readViewportH(vp);
  if (!rect || rect.left == null) return false;
  try {
    if (rect.width == null) {
      vp.setViewportSize({ left: rect.right as number, right: rect.left });
    } else {
      vp.setViewportSize({ left: canvasWidth - rect.left - rect.width });
    }
    try {
      vp.markDirty?.(true);
    } catch {}
    return true;
  } catch {
    return false;
  }
}

function moveCornerPlaceholder(scene: any, skeleton: any): void {
  try {
    const { W, L } = sheetMetrics(skeleton);
    const obj = scene?.getObject?.('__SpreadsheetLeftTopPlaceholder__');
    if (!obj || typeof obj.transformByState !== 'function') return;
    // LTR occupies [-1 .. L-1]; exact mirror around S is [W+1 .. S+1].
    obj.transformByState({ left: W + 1 });
  } catch {}
}

/**
 * Applies the RTL frame to a sheet scene (idempotent via per-scene state).
 * Besides mirroring the 9 viewport rects, it pins the row-header and corner
 * viewports' horizontal scroll to W: those viewports never scroll with the
 * main view, so without this they would keep showing scene [0 .. L] (empty
 * mirrored end-columns) instead of the number strip / corner at [W .. S].
 * Returns 'applied' | 'ok' (already correct) | 'not-ready' (retry later).
 */
export function ensureRtlFrameLayout(
  scene: any,
  skeleton: any,
  domWidthFallback?: number
): 'applied' | 'ok' | 'not-ready' {
  try {
    if (!scene || !skeleton || !isRtlSkeleton(skeleton)) return 'ok';
    const { W, L } = sheetMetrics(skeleton);
    if (!(W > 0) || !(L > 0)) {
      // No row header (L = 0): scene needs no rect changes; skeleton
      // patches alone mirror the columns. Degenerate sheet: wait.
      if (!(W > 0)) return 'not-ready';
      return 'ok';
    }
    const C = canvasWidthOf(scene, domWidthFallback);
    if (!C) return 'not-ready';
    const viewMain = scene.getViewport?.('viewMain');
    const rowBottom = scene.getViewport?.('viewRowBottom');
    const leftTop = scene.getViewport?.('viewLeftTop');
    const vmLeft = viewMain?.left;
    if (typeof vmLeft !== 'number') return 'not-ready';

    const headerScrollsOk = (): boolean => {
      try {
        if (rowBottom && Math.abs(Number(rowBottom.viewportScrollX) - W) > 1) return false;
        if (leftTop && Math.abs(Number(leftTop.viewportScrollX) - W) > 1) return false;
        return true;
      } catch {
        return false;
      }
    };
    const pinHeaderScrolls = (): void => {
      try {
        if (rowBottom) rowBottom.viewportScrollX = W;
      } catch {}
      try {
        if (leftTop) leftTop.viewportScrollX = W;
      } catch {}
      try {
        rowBottom?.markDirty?.(true);
      } catch {}
      try {
        leftTop?.markDirty?.(true);
      } catch {}
    };

    const looksLtr = vmLeft > 0;
    const rowBLeft = rowBottom?.left;
    const looksRtlReady =
      vmLeft === 0 &&
      (typeof rowBLeft !== 'number' || Math.abs(rowBLeft - (C - L - 1)) <= 1.5) &&
      headerScrollsOk();

    const st = sceneFrameState.get(scene) ?? { state: 'ltr' as const, lastCanvasWidth: C };
    if (!looksLtr && looksRtlReady && st.state === 'rtl' && st.lastCanvasWidth === C) {
      return 'ok';
    }

    const toggleWith = (width: number): boolean => {
      let touched = false;
      for (const key of SHEET_VIEWPORT_KEYS) {
        try {
          const vp = scene.getViewport?.(key);
          if (!vp) continue;
          touched = mirrorOneViewport(vp, width) || touched;
        } catch {}
      }
      return touched;
    };
    const finish = (): 'applied' => {
      pinHeaderScrolls();
      moveCornerPlaceholder(scene, skeleton);
      sceneFrameState.set(scene, { state: 'rtl', lastCanvasWidth: C });
      return 'applied';
    };

    if (looksLtr) {
      // Upstream just wrote LTR rects (boot / freeze / header resize).
      toggleWith(C);
      return finish();
    }
    if (vmLeft === 0) {
      if (typeof rowBLeft === 'number' && Math.abs(rowBLeft - (C - L - 1)) <= 1.5) {
        // Rects already RTL (fresh canvas width or same width): only the
        // header scrolls drifted (e.g. after a canvas resize reset).
        return finish();
      }
      // Stale RTL frame (canvas width changed): un-mirror with the old
      // width first (involution is exact only with the same width), verify
      // the LTR baseline, then mirror with the new width.
      toggleWith(st.lastCanvasWidth);
      const check = scene.getViewport?.('viewMain')?.left;
      if (!(typeof check === 'number' && check > 0)) {
        // Baseline not recovered — undo the toggle (involution restores the
        // prior state exactly) and retry on the next trigger. Never persist
        // an unverified frame.
        try {
          toggleWith(st.lastCanvasWidth);
        } catch {}
        return 'not-ready';
      }
      toggleWith(C);
      return finish();
    }
    return 'not-ready';
  } catch {
    return 'not-ready';
  }
}

/** Excel-open for RTL: column A visible at the viewport's right edge. */
export function scrollRtlSheetToStart(scene: any, skeleton: any): boolean {
  try {
    if (!scene || !skeleton || !isRtlSkeleton(skeleton)) return false;
    const { W } = sheetMetrics(skeleton);
    if (!(W > 0)) return false;
    const viewMain = scene.getViewport?.('viewMain');
    const vw = Number(viewMain?.width);
    if (!viewMain || !isFinite(vw) || vw <= 0) return false;
    const target = rtlInitialViewportScrollX(W, vw);
    viewMain.scrollToViewportPos?.({ viewportScrollX: target });
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolves the render scene + skeleton for a sheet. Iterates ALL renders and
 * matches by sheet id (no workbook/subunit keying guesswork): robust whether
 * renders are keyed per workbook or per sheet. Retried by the caller until
 * the async scene boot finishes.
 */
export async function getSheetRenderContext(
  univer: any,
  sheetId: string
): Promise<RtlSheetContext | null> {
  try {
    const er = await import('@univerjs/engine-render');
    const injector = univer?.__getInjector?.();
    const renderManager = injector?.get?.((er as any).IRenderManagerService);
    if (!renderManager) return null;
    let renders: Array<any> = [];
    try {
      const all = renderManager.getRenderAll?.();
      if (all && typeof all.values === 'function') renders = Array.from(all.values());
    } catch {}
    if (renders.length === 0) {
      // Fallback: single-render lookup by common unit id shapes.
      try {
        const single = renderManager.getRenderById?.(sheetId) ?? renderManager.getRenderUnitById?.(sheetId);
        if (single) renders = [single];
      } catch {}
    }
    for (const render of renders) {
      try {
        const skeleton = render?.mainComponent?.getSkeleton?.();
        const sid: unknown =
          typeof skeleton?.worksheet?.getSheetId === 'function' ? skeleton.worksheet.getSheetId() : undefined;
        if (sid !== sheetId) continue;
        const scene = render?.scene;
        if (scene && skeleton) {
          return { scene, skeleton, viewMain: scene.getViewport?.('viewMain') };
        }
      } catch {}
    }
    return null;
  } catch {
    return null;
  }
}
