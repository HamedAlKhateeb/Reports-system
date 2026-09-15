/**
 * RTL FRAME MATH — pure helpers for mirroring a Univer sheet frame.
 *
 * Excel-style RTL layout keeps the DATA MODEL untouched (column A is still
 * index 0, formulas keep referencing the same cells) and mirrors only the
 * VIEW: column A renders at the right, row numbers at the right, the column
 * header runs right-to-left.
 *
 * Coordinate frames (all numbers are X-axis pixels unless noted):
 *   - LTR scene:  [ row-header L ][ columns W ]  → total scene width S = L + W
 *   - RTL scene:  [ columns W ][ row-header L ]  → same total S
 *   - header=false content space: columns only, zone [0 .. W]
 *
 * The mirror is an involution: mirror(mirror(p)) === p. Every consumer that
 * reads a mirrored coordinate behaves as the exact mirror image of the LTR
 * layout, so selection, scrolling, hit-testing and the editor stay correct
 * without touching any of their logic.
 *
 * This module is PURE (zero imports) so it is safe for server code and unit
 * tests. The engine wiring lives in ./univer-rtl-frame.
 */

export interface SceneXRange {
  startX: number;
  endX: number;
}

export interface ViewBoundX {
  left: number;
  right: number;
}

/** Total scene width: columns + left margin. Identical in LTR and RTL. */
export function rtlSceneWidth(columnTotalWidth: number, rowHeaderWidthAndMarginLeft: number): number {
  return columnTotalWidth + rowHeaderWidthAndMarginLeft;
}

/** Mirror a scene-space X point (zone [0 .. sceneWidth]). */
export function mirrorScenePoint(x: number, sceneWidth: number): number {
  return sceneWidth - x;
}

/** Mirror a scene-space X range (zone [0 .. sceneWidth]). */
export function mirrorSceneRect(rect: SceneXRange, sceneWidth: number): SceneXRange {
  return { startX: sceneWidth - rect.endX, endX: sceneWidth - rect.startX };
}

/** Mirror a header-excluded content X point (zone [0 .. columnTotalWidth]). */
export function mirrorContentPoint(x: number, columnTotalWidth: number): number {
  return columnTotalWidth - x;
}

/** Mirror a header-excluded content X range (zone [0 .. columnTotalWidth]). */
export function mirrorContentRect(rect: SceneXRange, columnTotalWidth: number): SceneXRange {
  return { startX: columnTotalWidth - rect.endX, endX: columnTotalWidth - rect.startX };
}

/** Mirror a view-bound {left, right} pair (other fields untouched by caller). */
export function mirrorViewBoundX<T extends ViewBoundX>(bound: T, sceneWidth: number): T {
  return { ...bound, left: sceneWidth - bound.right, right: sceneWidth - bound.left };
}

/**
 * Mirror a horizontal viewport rect in CANVAS space (canvas width C).
 * - left+right viewports (no explicit width): swap left/right values.
 * - width viewports: keep width, re-anchor left. Returns the props to write.
 */
export function mirrorViewportH(
  rect: { left: number; right: number; width: number | null | undefined },
  canvasWidth: number
): { left: number; right: number } {
  if (rect.width == null) {
    return { left: rect.right, right: rect.left };
  }
  return { left: canvasWidth - rect.left - rect.width, right: canvasWidth - (canvasWidth - rect.left - rect.width) - rect.width };
}

/**
 * Fresh-open scroll for an RTL sheet (Excel behaviour): column A at the
 * right edge of the viewport. Pan space equals content coords, so the target
 * is simply contentWidth - viewportWidth, clamped at 0.
 */
export function rtlInitialViewportScrollX(columnTotalWidth: number, viewportWidth: number): number {
  if (!isFinite(columnTotalWidth) || !isFinite(viewportWidth)) return 0;
  return Math.max(0, columnTotalWidth - viewportWidth);
}

/** Swap left/center/right text alignment for mirrored header labels. */
export function mirrorTextAlign(align: string | undefined): string | undefined {
  if (align === 'left') return 'right';
  if (align === 'right') return 'left';
  return align;
}

/**
 * Mirror an intra-cell X offset: a point `offset` px right of the cell's
 * LTR start sits `cellWidth - offset` px right of the mirrored cell's start.
 */
export function mirrorColumnOffset(columnOffset: number, cellWidth: number): number {
  if (!isFinite(columnOffset) || !isFinite(cellWidth) || cellWidth <= 0) return 0;
  return Math.max(0, cellWidth - columnOffset);
}

/** True when a worksheet config carries the RTL flag (BooleanNumber 1). */
export function isRtlFlag(rightToLeft: unknown): boolean {
  return rightToLeft === 1;
}
