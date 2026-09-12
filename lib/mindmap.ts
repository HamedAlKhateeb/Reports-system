'use client';

/**
 * lib/mindmap.ts — single source of truth for the report mind-map element.
 *
 * Storage model (persisted inside the TipTap `reportMindmap` node attrs):
 *   { nodes: MindNode[], edges: MindEdge[] }
 * where MindNode = { id, label, x, y } and MindEdge = { id, source, target }.
 *
 * This module is deliberately UI-free (no React Flow imports) so the export
 * pipelines (PDF/HTML, DOCX, Markdown) can reuse the same tree logic without
 * pulling the canvas library into server bundles.
 */

export interface MindNode {
  id: string;
  label: string;
  x: number;
  y: number;
  /** Palette key from MIND_COLORS (optional — default theme when unset). */
  color?: string;
  /** Shape key from MIND_SHAPES (optional — 'rounded' when unset). */
  shape?: 'rounded' | 'pill' | 'square';
  /** Text color key from MIND_TEXT_COLORS (optional — default when unset). */
  textColor?: 'default' | 'white' | 'black';
  /** Text size key from MIND_FONT_SIZES (optional — 'md' when unset). */
  fontSize?: 'sm' | 'md' | 'lg';
}

export interface MindEdge {
  id: string;
  source: string;
  target: string;
}

export interface MindTree {
  id: string;
  label: string;
  children: MindTree[];
}

export function newMindId(prefix: string): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
    }
  } catch {}
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Seed data for a freshly inserted mind-map (bilingual label, centered on origin). */
export function seedMindmap(isAr: boolean): { nodes: MindNode[]; edges: MindEdge[] } {
  const root = newMindId('mn');
  const c1 = newMindId('mn');
  const c2 = newMindId('mn');
  const c3 = newMindId('mn');
  return {
    nodes: [
      { id: root, label: isAr ? 'الموضوع الرئيسي' : 'Main topic', x: 0, y: 0, color: 'olive' },
      { id: c1, label: isAr ? 'الفكرة الأولى' : 'First idea', x: -240, y: 180 },
      { id: c2, label: isAr ? 'الفكرة الثانية' : 'Second idea', x: 0, y: 180 },
      { id: c3, label: isAr ? 'الفكرة الثالثة' : 'Third idea', x: 240, y: 180 },
    ],
    edges: [
      { id: newMindId('me'), source: root, target: c1 },
      { id: newMindId('me'), source: root, target: c2 },
      { id: newMindId('me'), source: root, target: c3 },
    ],
  };
}

/**
 * Node color palette. Classes are FULL literals (never interpolated) so the
 * Tailwind JIT scanner picks them up.
 */
export const MIND_COLORS: Record<string, { swatch: string; bg: string; border: string; handle: string; labelAr: string; labelEn: string }> = {
  olive: { swatch: 'bg-[#2E4034]', bg: 'bg-[#2E4034]/10 dark:bg-emerald-400/10', border: '!border-[#2E4034] dark:!border-emerald-400', handle: '!bg-[#2E4034] dark:!bg-emerald-400', labelAr: 'زيتي', labelEn: 'Olive' },
  emerald: { swatch: 'bg-emerald-500', bg: 'bg-emerald-500/10', border: '!border-emerald-500', handle: '!bg-emerald-500', labelAr: 'زمردي', labelEn: 'Emerald' },
  blue: { swatch: 'bg-blue-500', bg: 'bg-blue-500/10', border: '!border-blue-500', handle: '!bg-blue-500', labelAr: 'أزرق', labelEn: 'Blue' },
  violet: { swatch: 'bg-violet-500', bg: 'bg-violet-500/10', border: '!border-violet-500', handle: '!bg-violet-500', labelAr: 'بنفسجي', labelEn: 'Violet' },
  amber: { swatch: 'bg-amber-500', bg: 'bg-amber-500/15', border: '!border-amber-500', handle: '!bg-amber-500', labelAr: 'كهرماني', labelEn: 'Amber' },
  rose: { swatch: 'bg-rose-500', bg: 'bg-rose-500/10', border: '!border-rose-500', handle: '!bg-rose-500', labelAr: 'وردي', labelEn: 'Rose' },
  slate: { swatch: 'bg-slate-500', bg: 'bg-slate-500/10', border: '!border-slate-500', handle: '!bg-slate-500', labelAr: 'رمادي', labelEn: 'Slate' },
};

/** Node shapes (full literals for the JIT scanner). */
export const MIND_SHAPES: Record<string, { cls: string; labelAr: string; labelEn: string }> = {
  rounded: { cls: 'rounded-xl', labelAr: 'مستطيل', labelEn: 'Rounded' },
  pill: { cls: 'rounded-full', labelAr: 'حبوب', labelEn: 'Pill' },
  square: { cls: 'rounded-none', labelAr: 'حاد', labelEn: 'Square' },
};

/** Node text colors (full literals for the JIT scanner). */
export const MIND_TEXT_COLORS: Record<string, { cls: string; labelAr: string; labelEn: string }> = {
  default: { cls: 'text-foreground', labelAr: 'تلقائي', labelEn: 'Auto' },
  white: { cls: '!text-white', labelAr: 'أبيض', labelEn: 'White' },
  black: { cls: '!text-black', labelAr: 'أسود', labelEn: 'Black' },
};

/** Node text sizes (full literals for the JIT scanner). */
export const MIND_FONT_SIZES: Record<string, { cls: string; labelAr: string; labelEn: string }> = {
  sm: { cls: 'text-[11px]', labelAr: 'صغير', labelEn: 'Small' },
  md: { cls: 'text-xs', labelAr: 'متوسط', labelEn: 'Medium' },
  lg: { cls: 'text-sm', labelAr: 'كبير', labelEn: 'Large' },
};

/**
 * Canvas backgrounds. `css` paints the live canvas, `png` is passed as the
 * html-to-image backgroundColor so the exported PNG matches the canvas.
 */
export const MIND_MAP_BACKGROUNDS: Record<string, { css: string; png: string; labelAr: string; labelEn: string }> = {
  default: { css: '#eef2f5', png: '#eef2f5', labelAr: 'افتراضي', labelEn: 'Default' },
  white: { css: '#ffffff', png: '#ffffff', labelAr: 'أبيض', labelEn: 'White' },
  dark: { css: '#0f172a', png: '#0f172a', labelAr: 'داكن', labelEn: 'Dark' },
  cream: { css: '#FAF7F0', png: '#FAF7F0', labelAr: 'كريمي', labelEn: 'Cream' },
};

/** Layered auto-layout centered on the origin: depth → vertical level, order within level → horizontal. */
export function layoutMindmap(nodes: MindNode[], edges: MindEdge[]): MindNode[] {
  if (!nodes.length) return nodes;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const childrenOf = new Map<string, string[]>();
  const hasParent = new Set<string>();
  for (const e of edges) {
    if (!byId.has(e.source) || !byId.has(e.target)) continue;
    if (!childrenOf.has(e.source)) childrenOf.set(e.source, []);
    childrenOf.get(e.source)!.push(e.target);
    hasParent.add(e.target);
  }
  const roots = nodes.filter((n) => !hasParent.has(n.id));
  const depth = new Map<string, number>();
  const queue: Array<{ id: string; d: number }> = (roots.length ? roots : nodes.slice(0, 1)).map((n) => ({ id: n.id, d: 0 }));
  for (const r of queue) depth.set(r.id, r.d);
  let qi = 0;
  while (qi < queue.length) {
    const cur = queue[qi++];
    for (const child of childrenOf.get(cur.id) || []) {
      if (!depth.has(child)) {
        depth.set(child, cur.d + 1);
        queue.push({ id: child, d: cur.d + 1 });
      }
    }
  }
  const levels = new Map<number, string[]>();
  for (const n of nodes) {
    const d = depth.get(n.id) ?? 0;
    if (!levels.has(d)) levels.set(d, []);
    levels.get(d)!.push(n.id);
  }
  const X_GAP = 220;
  const Y_GAP = 150;
  const out = nodes.map((n) => {
    const d = depth.get(n.id) ?? 0;
    const row = levels.get(d) || [n.id];
    const idx = Math.max(0, row.indexOf(n.id));
    const mid = (row.length - 1) / 2;
    return { ...n, x: Math.round((idx - mid) * X_GAP), y: Math.round(d * Y_GAP) };
  });
  return out;
}

/** Forest of trees from the flat node/edge lists (cycle-safe). Roots = nodes with no incoming edge. */
export function buildMindTrees(nodes: MindNode[], edges: MindEdge[]): MindTree[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const childrenOf = new Map<string, string[]>();
  const hasParent = new Set<string>();
  for (const e of edges || []) {
    if (!byId.has(e.source) || !byId.has(e.target)) continue;
    if (!childrenOf.has(e.source)) childrenOf.set(e.source, []);
    childrenOf.get(e.source)!.push(e.target);
    hasParent.add(e.target);
  }
  const visit = (id: string, seen: Set<string>): MindTree | null => {
    const n = byId.get(id);
    if (!n || seen.has(id)) return null;
    seen.add(id);
    const kids: MindTree[] = [];
    for (const c of childrenOf.get(id) || []) {
      const t = visit(c, seen);
      if (t) kids.push(t);
    }
    return { id, label: n.label || '', children: kids };
  };
  const roots = nodes.filter((n) => !hasParent.has(n.id));
  const seen = new Set<string>();
  const trees: MindTree[] = [];
  for (const r of roots.length ? roots : nodes) {
    const t = visit(r.id, seen);
    if (t) trees.push(t);
  }
  // Orphan cycle fallback: any node never visited becomes its own root.
  for (const n of nodes) {
    if (!seen.has(n.id)) trees.push({ id: n.id, label: n.label || '', children: [] });
  }
  return trees;
}

/** Nested <ul> HTML for the print/PDF/Word-HTML export path. */
export function mindTreesToHtml(trees: MindTree[], esc: (s: string) => string): string {
  const render = (list: MindTree[]): string => {
    if (!list.length) return '';
    const items = list
      .map((t) => `<li class="mind-li"><span class="mind-label">${esc(t.label || '—')}</span>${t.children.length ? render(t.children) : ''}</li>`)
      .join('');
    return `<ul class="mind-ul">${items}</ul>`;
  };
  return render(trees);
}

/** Nested bullet Markdown for the Markdown/ZIP export path. */
export function mindTreesToMarkdown(trees: MindTree[], depth = 0): string {
  const lines: string[] = [];
  for (const t of trees) {
    const indent = '  '.repeat(depth);
    lines.push(`${indent}- ${t.label || '—'}`);
    if (t.children.length) lines.push(mindTreesToMarkdown(t.children, depth + 1));
  }
  return lines.join('\n');
}
