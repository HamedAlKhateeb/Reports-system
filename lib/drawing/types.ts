/**
 * lib/drawing/types.ts — THE single source of truth for freeform drawing elements.
 *
 * Used by:
 * - components/editor/ReportDrawingView.tsx (unified report editor)
 * - components/boards/BoardCanvas.tsx (tracking boards whiteboard)
 * - lib/drawing-export.ts (PNG snapshots for PDF/DOCX/Markdown/share)
 * - lib/boards-types.ts (ExcalidrawElement extends this)
 */

export interface DrawingPoint {
  x: number;
  y: number;
}

export type DrawingElementType =
  | 'rectangle'
  | 'diamond'
  | 'ellipse'
  | 'arrow'
  | 'line'
  | 'freedraw'
  | 'text'
  | 'note';

export type DrawingStrokeStyle = 'solid' | 'dashed' | 'dotted';

export interface DrawingElement {
  id: string;
  type: DrawingElementType;
  /** Top-left anchor in canvas coordinates (for arrows/lines: bounding anchor; exact path lives in `points`). */
  x: number;
  y: number;
  width: number;
  height: number;
  strokeColor?: string;
  backgroundColor?: string;
  strokeWidth?: number;
  strokeStyle?: DrawingStrokeStyle;
  text?: string;
  fontSize?: number;
  /** Independent text color inside the shape (falls back to strokeColor). */
  textColor?: string;
  /** Alignment of text inside the shape ('left' | 'center' | 'right'). Defaults to 'center'. */
  textAlign?: 'left' | 'center' | 'right';
  /** CSS font stack for text-bearing elements (rectangle/note/ellipse/diamond/text). Optional — falls back to the site font. */
  fontFamily?: string;
  /** Exact path for arrow/line/freedraw (canvas coordinates). */
  points?: DrawingPoint[];
  /** Rotation angle in degrees (0-360). */
  rotation?: number;
  /** ID of container shape if this element is bound text inside a shape. */
  containerId?: string;
  /** IDs of bound elements (e.g. text element or connected arrows). */
  boundElementIds?: string[];
}

export type DrawingTool =
  | 'select'
  | 'hand'
  | 'rectangle'
  | 'ellipse'
  | 'diamond'
  | 'arrow'
  | 'line'
  | 'freedraw'
  | 'text'
  | 'note'
  | 'eraser';

export const DRAWING_STROKE_COLORS = [
  '#1e1e1e',
  '#e03131',
  '#2f9e44',
  '#1971c2',
  '#f08c00',
  '#9c36b5',
] as const;

export const DRAWING_FILL_COLORS = [
  'transparent',
  '#ffc9c9',
  '#b2f2bb',
  '#a5d8ff',
  '#ffec99',
  '#eebefa',
  '#e9ecef',
] as const;

export function newDrawingElementId(prefix = 'de'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}
