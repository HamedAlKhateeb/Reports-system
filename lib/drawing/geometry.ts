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

/**
 * Resolves all element IDs that should move together when `draggedId` is dragged.
 * - If `draggedId` is a text element bound to a shape (has `containerId`), ONLY the text moves.
 * - If `draggedId` is a shape:
 *   - The shape itself moves.
 *   - Any bound text elements (`containerId === shape.id`) move with it.
 *   - Any shapes connected via arrows/lines (flowcharts, diagrams) move with it as a connected unit.
 */
export function getConnectedElementIds(
  draggedId: string,
  elements: DrawingElement[]
): Set<string> {
  const dragged = elements.find((el) => el.id === draggedId);
  if (!dragged) return new Set([draggedId]);

  // If the user is dragging the text element specifically, only move the text itself.
  if (dragged.type === 'text' && dragged.containerId) {
    return new Set([draggedId]);
  }

  // Build undirected adjacency graph for shapes, arrows, and bound elements
  const adj = new Map<string, Set<string>>();
  const addEdge = (u: string, v: string) => {
    if (!adj.has(u)) adj.set(u, new Set());
    if (!adj.has(v)) adj.set(v, new Set());
    adj.get(u)!.add(v);
    adj.get(v)!.add(u);
  };

  // Ensure every element has a node in adj
  for (const el of elements) {
    if (!adj.has(el.id)) adj.set(el.id, new Set());
  }

  // 1. Container <-> Child bindings (e.g. Shape <-> its Text)
  for (const el of elements) {
    if (el.containerId) {
      addEdge(el.id, el.containerId);
    }
    if (el.boundElementIds) {
      for (const bId of el.boundElementIds) {
        addEdge(el.id, bId);
      }
    }
  }

  // 2. Arrow / Line connections to shapes (start / end points near shapes)
  const lineEls = elements.filter(
    (el) => (el.type === 'arrow' || el.type === 'line') && Array.isArray(el.points) && el.points.length >= 2
  );
  const shapeEls = elements.filter(
    (el) => el.type !== 'arrow' && el.type !== 'line' && el.type !== 'freedraw'
  );

  const CONNECTION_THRESHOLD = 26; // Proximity distance for connected arrow/line endpoints

  for (const line of lineEls) {
    const pts = line.points!;
    const pStart = pts[0];
    const pEnd = pts[pts.length - 1];

    for (const shape of shapeEls) {
      if (isPointNearElement(pStart, shape, CONNECTION_THRESHOLD)) {
        addEdge(line.id, shape.id);
      }
      if (isPointNearElement(pEnd, shape, CONNECTION_THRESHOLD)) {
        addEdge(line.id, shape.id);
      }
    }
  }

  // Run BFS starting from draggedId
  const visited = new Set<string>();
  const queue: string[] = [draggedId];
  visited.add(draggedId);

  while (queue.length > 0) {
    const curr = queue.shift()!;
    const neighbors = adj.get(curr);
    if (neighbors) {
      neighbors.forEach((n) => {
        if (!visited.has(n)) {
          visited.add(n);
          queue.push(n);
        }
      });
    }
  }

  return visited;
}

/**
 * Ensures text inside shapes exists as independent child text elements (with `containerId`).
 * Preserves backward compatibility while guaranteeing the text is an independent element.
 */
export function separateShapeTexts(elements: DrawingElement[]): { elements: DrawingElement[]; changed: boolean } {
  let changed = false;
  const result: DrawingElement[] = [];

  for (const el of elements || []) {
    if (el.text && ['rectangle', 'ellipse', 'diamond', 'note'].includes(el.type)) {
      const alreadyHasChild = elements.some((x) => x.type === 'text' && x.containerId === el.id);
      if (!alreadyHasChild) {
        changed = true;
        const pad = 12;
        const w = Math.abs(el.width) || 120;
        const h = Math.abs(el.height) || 60;
        const textEl: DrawingElement = {
          id: `${el.id}_text`,
          type: 'text',
          containerId: el.id,
          x: el.x + pad,
          y: el.y + pad,
          width: Math.max(40, w - pad * 2),
          height: Math.max(24, h - pad * 2),
          text: el.text,
          fontSize: el.fontSize || 18,
          fontFamily: el.fontFamily,
          textColor: el.textColor || el.strokeColor || '#1e1e1e',
          textAlign: el.textAlign || 'center',
          rotation: el.rotation,
        };
        const { text: _t, ...cleanShape } = el;
        result.push(cleanShape as DrawingElement);
        result.push(textEl);
        continue;
      }
    }
    result.push(el);
  }

  return { elements: result, changed };
}

