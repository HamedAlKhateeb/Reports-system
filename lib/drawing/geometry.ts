/**
 * lib/drawing/geometry.ts — shared hit-testing + stroke helpers.
 * Single implementation used by the editor drawing view and the
 * tracking-board canvas (previously duplicated in both).
 */
import type { DrawingElement, DrawingPoint } from './types';

/** Minimal structural shape for hit-testing (covers DrawingElement + board extras like image/frame). */
export interface HittableElement {
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  points?: DrawingPoint[];
}

export function distanceToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function linePoints(el: HittableElement): DrawingPoint[] {
  if (el.points && el.points.length >= 2) return el.points;
  return [
    { x: el.x, y: el.y },
    { x: el.x + (el.width || 0), y: el.y + (el.height || 0) },
  ];
}

/** True when a canvas point hits the element (selection / eraser / fill bucket). */
export function isPointNearElement(
  pt: DrawingPoint,
  el: HittableElement,
  threshold = 12
): boolean {
  if (el.type === 'arrow' || el.type === 'line') {
    const pts = linePoints(el);
    for (let i = 0; i < pts.length - 1; i++) {
      if (distanceToSegment(pt.x, pt.y, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y) <= threshold) {
        return true;
      }
    }
    return false;
  }

  if (el.type === 'freedraw') {
    const pts = el.points || [];
    if (pts.length === 0) return false;
    if (pts.length === 1) {
      return Math.hypot(pt.x - pts[0].x, pt.y - pts[0].y) <= threshold;
    }
    for (let i = 0; i < pts.length - 1; i++) {
      if (distanceToSegment(pt.x, pt.y, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y) <= threshold) {
        return true;
      }
    }
    return false;
  }

  // Rectangle, diamond, ellipse, note, text: box hit (threshold-padded).
  const minX = Math.min(el.x, el.x + (el.width || 0)) - threshold;
  const maxX = Math.max(el.x, el.x + (el.width || 0)) + threshold;
  const minY = Math.min(el.y, el.y + (el.height || 0)) - threshold;
  const maxY = Math.max(el.y, el.y + (el.height || 0)) + threshold;
  return pt.x >= minX && pt.x <= maxX && pt.y >= minY && pt.y <= maxY;
}

/** SVG stroke-dasharray for a stored stroke style. */
export function dashFor(style?: string): string | undefined {
  if (style === 'dashed') return '7 6';
  if (style === 'dotted') return '2 5';
  return undefined;
}

/** Bounding box of a set of elements (for fit-view / PNG export). */
export function elementsBounds(elements: DrawingElement[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const el of elements || []) {
    const pts = Array.isArray(el.points) && el.points.length ? el.points : null;
    if (pts) {
      for (const p of pts) {
        const x = Number(p.x) || 0;
        const y = Number(p.y) || 0;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    } else {
      const x = Number(el.x) || 0;
      const y = Number(el.y) || 0;
      const w = Number(el.width) || 0;
      const h = Number(el.height) || 0;
      minX = Math.min(minX, Math.min(x, x + w));
      minY = Math.min(minY, Math.min(y, y + h));
      maxX = Math.max(maxX, Math.max(x, x + w));
      maxY = Math.max(maxY, Math.max(y, y + h));
    }
  }
  if (!isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}
