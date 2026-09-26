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
  rotation?: number;
}

/** Rotate a 2D point around an origin by angle in degrees. */
export function rotatePoint(pt: DrawingPoint, center: DrawingPoint, angleDeg: number): DrawingPoint {
  if (!angleDeg) return pt;
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = pt.x - center.x;
  const dy = pt.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
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

export function getElementCenter(el: HittableElement): DrawingPoint {
  if ((el.type === 'arrow' || el.type === 'line' || el.type === 'freedraw') && el.points && el.points.length >= 2) {
    const xs = el.points.map((p) => p.x);
    const ys = el.points.map((p) => p.y);
    return {
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      y: (Math.min(...ys) + Math.max(...ys)) / 2,
    };
  }
  return {
    x: el.x + (el.width || 0) / 2,
    y: el.y + (el.height || 0) / 2,
  };
}

/** True when a canvas point hits the element (selection / eraser / fill bucket). */
export function isPointNearElement(
  rawPt: DrawingPoint,
  el: HittableElement,
  threshold = 12
): boolean {
  // If the element has a rotation, un-rotate the test point around the element's center.
  let pt = rawPt;
  if (el.rotation) {
    const center = getElementCenter(el);
    pt = rotatePoint(rawPt, center, -el.rotation);
  }

  if (el.type === 'arrow' || el.type === 'line') {
    const th = Math.max(threshold, 20);
    const pts = linePoints(el);
    for (let i = 0; i < pts.length - 1; i++) {
      if (distanceToSegment(pt.x, pt.y, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y) <= th) {
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

/**
 * Wraps text into lines that fit within maxWidth (in pixels) for a given font size.
 * Handles explicit newlines (\n) and word wrapping.
 */
export function wrapTextLines(
  text: string,
  maxWidth: number,
  fontSize: number = 15,
  measureWidth?: (s: string) => number
): string[] {
  if (!text) return [];
  const approxCharWidth = fontSize * 0.58;
  const measure = measureWidth || ((str: string) => str.length * approxCharWidth);
  const paragraphs = String(text).split('\n');
  const lines: string[] = [];

  for (const para of paragraphs) {
    if (!para.trim()) {
      lines.push('');
      continue;
    }
    const words = para.split(/\s+/);
    let currentLine = '';

    for (const word of words) {
      if (!currentLine) {
        currentLine = word;
      } else {
        const testLine = `${currentLine} ${word}`;
        if (measure(testLine) <= maxWidth) {
          currentLine = testLine;
        } else {
          lines.push(currentLine);
          currentLine = word;
        }
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }
  }

  return lines.length ? lines : [''];
}

