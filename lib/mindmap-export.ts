'use client';

/**
 * lib/mindmap-export.ts — deterministic PNG export for the mind-map.
 *
 * Rationale: DOM-snapshot exporters (html-to-image) rasterize through an
 * SVG foreignObject, where React Flow's edge <path> layer is unreliable
 * (missing connectors in production exports). Here every layer —
 * background, edges, nodes, labels — is drawn explicitly on a 2D canvas,
 * so the export can never silently drop the connectors.
 *
 * Measurements come from the live DOM (exact node boxes), converted to
 * flow coordinates by the caller via screenToFlowPosition.
 */
import { CANVAS_FONT_STACK, ensureDocumentFontsLoaded } from './fonts';

export interface MeasuredMindNode {
  id: string;
  label: string;
  color?: string;
  shape?: 'rounded' | 'pill' | 'square';
  textColor?: 'default' | 'white' | 'black';
  fontSize?: 'sm' | 'md' | 'lg';
  /** Top-left corner in flow coordinates. */
  x: number;
  y: number;
  /** Size in flow units. Optional — estimated from the label when absent
      (data-only snapshots outside the live canvas, e.g. share page). */
  w?: number;
  h?: number;
}

export interface MeasuredMindEdge {
  source: string;
  target: string;
}

const NODE_PAINT: Record<string, { fill: string; stroke: string }> = {
  olive: { fill: '#e6ece5', stroke: '#2E4034' },
  emerald: { fill: '#d9f0e3', stroke: '#10b981' },
  blue: { fill: '#dde8fb', stroke: '#3b82f6' },
  violet: { fill: '#eae3fb', stroke: '#8b5cf6' },
  amber: { fill: '#fdf0d3', stroke: '#f59e0b' },
  rose: { fill: '#fce1e7', stroke: '#f43f5e' },
  slate: { fill: '#e3e8ef', stroke: '#64748b' },
};
const DEFAULT_NODE = { fill: '#ffffff', stroke: '#cbd5e1' };
const EDGE_COLOR = '#8fa0b3';

const TEXT_PAINT: Record<string, string> = {
  default: '#1e293b',
  white: '#ffffff',
  black: '#111111',
};

const FONT_PX: Record<string, number> = { sm: 11, md: 13, lg: 15 };
const FONT_STACK = CANVAS_FONT_STACK;
const AR_RE = /[\u0600-\u06FF]/;

/** Snapshot of one mind-map: embeddable PNG data URL + aspect for DOCX sizing. */
export interface MindmapSnapshot {
  dataUrl: string;
  width: number;
  height: number;
}

/** DOM node width (w-44) — the live canvas and the estimator agree on it. */
const NODE_W = 176;

let measureCtx: CanvasRenderingContext2D | null = null;
function getMeasureCtx(): CanvasRenderingContext2D | null {
  try {
    if (!measureCtx) {
      const c = document.createElement('canvas');
      measureCtx = c.getContext('2d');
    }
    return measureCtx;
  } catch {
    return null;
  }
}

/** Estimate a node box from its label (used when no live DOM measurement exists). */
export function estimateNodeBox(label: string, fontSize?: string): { w: number; h: number } {
  const px = FONT_PX[fontSize || 'md'] || FONT_PX.md;
  const maxW = NODE_W - 24;
  let lines = 1;
  try {
    const ctx = getMeasureCtx();
    if (ctx) {
      ctx.font = `700 ${px}px ${FONT_STACK}`;
      lines = Math.max(1, wrapLabel(ctx, label || '', maxW).length);
    } else {
      lines = Math.max(1, Math.ceil((label || '—').length / 16));
    }
  } catch {
    lines = 1;
  }
  return { w: NODE_W, h: Math.round(22 + lines * px * 1.55) };
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  if (typeof (ctx as any).roundRect === 'function') {
    ctx.beginPath();
    (ctx as any).roundRect(x, y, w, h, radius);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function wrapLabel(ctx: CanvasRenderingContext2D, label: string, maxW: number): string[] {
  const words = (label || '—').split(/\s+/).filter(Boolean);
  if (!words.length) return ['—'];
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const trial = current ? `${current} ${word}` : word;
    if (ctx.measureText(trial).width <= maxW || !current) {
      current = trial;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export async function renderMindmapPng(
  nodes: MeasuredMindNode[],
  edges: MeasuredMindEdge[],
  backgroundCss: string
): Promise<Blob> {
  // Fill boxes missing live measurements (data-only snapshots).
  const sized: Array<MeasuredMindNode & { w: number; h: number }> = (nodes || []).map((n) => {
    const w = Number((n as any)?.w) || 0;
    const h = Number((n as any)?.h) || 0;
    if (n && w > 0 && h > 0) return { ...(n as object), w, h } as MeasuredMindNode & { w: number; h: number };
    const est = estimateNodeBox(String((n as any)?.label ?? ''), (n as any)?.fontSize);
    return { ...((n || {}) as object), w: est.w, h: est.h } as MeasuredMindNode & { w: number; h: number };
  });
  const valid = sized.filter((n) => n && n.w > 0 && n.h > 0 && Number.isFinite(n.x) && Number.isFinite(n.y));
  if (!valid.length) throw new Error('empty map');

  // Paint with the real Google fonts, not a silent system-font fallback.
  await ensureDocumentFontsLoaded();

  const PAD = 48;
  const SCALE = 2;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of valid) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.w);
    maxY = Math.max(maxY, n.y + n.h);
  }
  const W = Math.ceil(maxX - minX + PAD * 2);
  const H = Math.ceil(maxY - minY + PAD * 2);

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, W * SCALE);
  canvas.height = Math.max(2, H * SCALE);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');

  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = backgroundCss || '#eef2f5';
  ctx.fillRect(0, 0, W, H);
  ctx.translate(-minX + PAD, -minY + PAD);

  const byId = new Map(valid.map((n) => [n.id, n]));

  // 1) Edges first (under the nodes): bottom-center → top-center beziers.
  ctx.strokeStyle = EDGE_COLOR;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  for (const e of edges || []) {
    const s = byId.get(e.source);
    const t = byId.get(e.target);
    if (!s || !t) continue;
    const sx = s.x + s.w / 2;
    const sy = s.y + s.h;
    const tx = t.x + t.w / 2;
    const ty = t.y;
    const my = sy + (ty - sy) / 2;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.bezierCurveTo(sx, my, tx, my, tx, ty);
    ctx.stroke();
  }

  // 2) Nodes: shape + fill + centered wrapped label.
  for (const n of valid) {
    const paint = (n.color && NODE_PAINT[n.color]) || DEFAULT_NODE;
    const radius = n.shape === 'pill' ? n.h / 2 : n.shape === 'square' ? 3 : 14;
    roundRectPath(ctx, n.x, n.y, n.w, n.h, radius);
    ctx.fillStyle = paint.fill;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = paint.stroke;
    ctx.stroke();

    const px = FONT_PX[n.fontSize || 'md'] || FONT_PX.md;
    ctx.font = `700 ${px}px ${FONT_STACK}`;
    ctx.fillStyle = (n.textColor && TEXT_PAINT[n.textColor]) || TEXT_PAINT.default;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    try {
      (ctx as any).direction = AR_RE.test(n.label || '') ? 'rtl' : 'ltr';
    } catch {}
    const maxW = Math.max(10, n.w - 24);
    const lines = wrapLabel(ctx, n.label || '', maxW).slice(0, 6);
    const lineH = px * 1.55;
    const blockH = lines.length * lineH;
    let ly = n.y + n.h / 2 - blockH / 2 + lineH / 2;
    const cx = n.x + n.w / 2;
    for (const line of lines) {
      if (ly > n.y + n.h - 6) break;
      ctx.fillText(line, cx, ly, maxW);
      ly += lineH;
    }
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('toBlob failed'));
    }, 'image/png');
  });
}

export interface MindmapDocEntry {
  id: string;
  title: string;
  caption: string;
  background: string;
  nodes: MeasuredMindNode[];
  edges: MeasuredMindEdge[];
}

/** Collect every reportMindmap node from TipTap JSON (any depth). */
export function collectMindmaps(contentJson: any): MindmapDocEntry[] {
  const out: MindmapDocEntry[] = [];
  const visit = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'reportMindmap' && node.attrs?.mindmapId) {
      const rawNodes = Array.isArray(node.attrs.nodes) ? node.attrs.nodes : [];
      const rawEdges = Array.isArray(node.attrs.edges) ? node.attrs.edges : [];
      out.push({
        id: String(node.attrs.mindmapId),
        title: String(node.attrs.title || ''),
        caption: String(node.attrs.caption || ''),
        background: String(node.attrs.background || 'default'),
        nodes: rawNodes.map((n: any) => ({
          id: String(n?.id ?? ''),
          label: String(n?.label ?? ''),
          color: typeof n?.color === 'string' ? n.color : undefined,
          shape: n?.shape,
          textColor: n?.textColor,
          fontSize: n?.fontSize,
          x: Number(n?.x) || 0,
          y: Number(n?.y) || 0,
          w: Number(n?.w) || 0,
          h: Number(n?.h) || 0,
        })),
        edges: rawEdges.map((e: any) => ({ source: String(e?.source ?? ''), target: String(e?.target ?? '') })),
      });
    }
    if (Array.isArray(node.content)) node.content.forEach(visit);
  };
  visit(contentJson);
  return out.filter((m) => m.nodes.length > 0);
}

const MAP_BG_PNG: Record<string, string> = {
  default: '#eef2f5',
  white: '#ffffff',
  dark: '#0f172a',
  cream: '#FAF7F0',
};

/**
 * Data-only PNG snapshots (no live DOM needed): positions come from the
 * persisted node attrs, boxes are estimated. Used by the share page and by
 * server-side exports, where no canvas is mounted.
 */
export async function snapshotMindmaps(contentJson: any): Promise<Record<string, MindmapSnapshot>> {
  const out: Record<string, MindmapSnapshot> = {};
  if (typeof document === 'undefined') return out;
  const entries = collectMindmaps(contentJson);
  for (const entry of entries) {
    try {
      const blob = await renderMindmapPng(entry.nodes, entry.edges, MAP_BG_PNG[entry.background] || MAP_BG_PNG.default);
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('read failed'));
        reader.readAsDataURL(blob);
      });
      if (!dataUrl) continue;
      // Recover pixel dimensions for DOCX aspect sizing.
      const dims = await new Promise<{ w: number; h: number }>((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth || 0, h: img.naturalHeight || 0 });
        img.onerror = () => resolve({ w: 0, h: 0 });
        img.src = dataUrl;
      });
      out[entry.id] = { dataUrl, width: dims.w, height: dims.h };
    } catch (err) {
      console.warn('Mindmap snapshot failed for', entry.id, err);
    }
  }
  return out;
}
