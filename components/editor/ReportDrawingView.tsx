'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NodeViewWrapper, NodeViewProps } from '@tiptap/react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/toast';
import type { DrawingElement, DrawingTool } from '@/lib/drawing/types';
import { DRAWING_STROKE_COLORS, DRAWING_FILL_COLORS, newDrawingElementId } from '@/lib/drawing/types';
import { isPointNearElement, dashFor } from '@/lib/drawing/geometry';
import {
  MousePointer2, Hand, Square, Diamond, Circle, MoveRight, Minus, Pencil,
  Type, StickyNote, Eraser, Undo2, Redo2, ZoomIn, ZoomOut, Maximize2, Trash2, Copy,
} from 'lucide-react';

/**
 * ReportDrawingView — Excalidraw-like canvas embedded in the unified editor.
 *
 * Single source of truth: `elementsRef` always holds the current element list.
 * - Direct manipulation (drag / erase strokes) mutates WITHOUT history spam.
 * - `commit()` pushes ONE history entry + persists to the TipTap node.
 * - Autosave persists only on commit (never mid-drag), via updateAttributes.
 */
export function ReportDrawingView(props: NodeViewProps) {
  const { node, updateAttributes } = props;
  const { drawingId, title = '', caption = '', width = 100, height = 380, alignment = 'center', background = 'white', direction = 'rtl' } = node.attrs;
  const drawDir: 'rtl' | 'ltr' = direction === 'ltr' ? 'ltr' : 'rtl';
  const { lang } = useLanguage();
  const isAr = lang === 'ar';

  const initial: DrawingElement[] = useMemo(
    () => (Array.isArray(node.attrs.elements) ? node.attrs.elements : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const [elements, setElements] = useState<DrawingElement[]>(initial);
  const elementsRef = useRef<DrawingElement[]>(initial);
  const [history, setHistory] = useState<DrawingElement[][]>([initial]);
  const [hIdx, setHIdx] = useState(0);
  const historyRef = useRef<DrawingElement[][]>([initial]);
  const hIdxRef = useRef(0);

  const [tool, setTool] = useState<DrawingTool>('select');
  const [stroke, setStroke] = useState<string>(DRAWING_STROKE_COLORS[0]);
  const [fill, setFill] = useState<string>(DRAWING_FILL_COLORS[0]);
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [strokeStyle, setStrokeStyle] = useState<'solid' | 'dashed' | 'dotted'>('solid');
  const [fontSize, setFontSize] = useState(18);
  const [pan, setPan] = useState({ x: 20, y: 20 });
  const [zoom, setZoom] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DrawingElement | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [textDraft, setTextDraft] = useState('');
  const [showDelete, setShowDelete] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  // Canvas frame height (drag the bottom edge to resize; persisted to the node).
  const MIN_CANVAS_H = 240;
  const MAX_CANVAS_H = 900;
  const [canvasH, setCanvasH] = useState(() =>
    Math.max(MIN_CANVAS_H, Math.min(MAX_CANVAS_H, Number(height) || 380))
  );
  const canvasDragRef = useRef<{ startY: number; startH: number } | null>(null);
  const [canvasDragging, setCanvasDragging] = useState(false);
  useEffect(() => {
    if (!canvasDragRef.current) {
      setCanvasH(Math.max(MIN_CANVAS_H, Math.min(MAX_CANVAS_H, Number(node.attrs.height) || 380)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.attrs.height]);

  // Interaction session state (refs so mousemove never works on stale closures)
  const interactingRef = useRef(false);
  const mouseDownRef = useRef(false);
  const dragIdRef = useRef<string | null>(null);
  const dragOffRef = useRef({ x: 0, y: 0 });
  const dragMovedRef = useRef(false);
  // Click-vs-drag: a press only becomes a MOVE after the pointer travels
  // past this threshold — a plain click is selection only, never a move.
  const DRAG_THRESHOLD = 5;
  const dragStartedRef = useRef(false);
  const dragStartClientRef = useRef({ x: 0, y: 0 });
  // Click on an already-selected text opens the inline editor directly
  // (edit from the text itself — no separate toolbar button needed).
  const pendingEditRef = useRef<string | null>(null);
  // Resize session: dragging a selection handle reshapes the element.
  type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'start' | 'end';
  const resizeRef = useRef<{
    id: string;
    handle: ResizeHandle;
    startPt: { x: number; y: number };
    orig: { x0: number; y0: number; x1: number; y1: number };
    origFontSize: number;
    origPoints?: { x: number; y: number }[];
  } | null>(null);
  const resizeMovedRef = useRef(false);
  const erasingRef = useRef(false);
  const erasedRef = useRef(false);
  const panningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const persistKeyRef = useRef('');

  const setAll = useCallback((next: DrawingElement[]) => {
    elementsRef.current = next;
    setElements(next);
  }, []);

  /** ONE history entry + persist to the TipTap node (→ editor autosave). */
  const commit = useCallback(
    (next: DrawingElement[]) => {
      setAll(next);
      const h = historyRef.current.slice(0, hIdxRef.current + 1);
      h.push(next);
      const trimmed = h.length > 60 ? h.slice(h.length - 60) : h;
      historyRef.current = trimmed;
      hIdxRef.current = Math.min(hIdxRef.current + 1, trimmed.length - 1);
      setHistory(trimmed);
      setHIdx(hIdxRef.current);
      try {
        persistKeyRef.current = JSON.stringify(next);
        updateAttributes({ elements: next });
      } catch {}
    },
    [setAll, updateAttributes]
  );

  const undo = useCallback(() => {
    if (hIdxRef.current <= 0) return;
    hIdxRef.current -= 1;
    setHIdx(hIdxRef.current);
    const next = historyRef.current[hIdxRef.current];
    setAll(next);
    try {
      persistKeyRef.current = JSON.stringify(next);
      updateAttributes({ elements: next });
    } catch {}
  }, [setAll, updateAttributes]);

  const redo = useCallback(() => {
    if (hIdxRef.current >= historyRef.current.length - 1) return;
    hIdxRef.current += 1;
    setHIdx(hIdxRef.current);
    const next = historyRef.current[hIdxRef.current];
    setAll(next);
    try {
      persistKeyRef.current = JSON.stringify(next);
      updateAttributes({ elements: next });
    } catch {}
  }, [setAll, updateAttributes]);

  const toCanvas = useCallback(
    (clientX: number, clientY: number) => {
      if (!boxRef.current) return { x: 0, y: 0 };
      const r = boxRef.current.getBoundingClientRect();
      return { x: (clientX - r.left - pan.x) / zoom, y: (clientY - r.top - pan.y) / zoom };
    },
    [pan, zoom]
  );

  const eraseAt = useCallback(
    (pt: { x: number; y: number }) => {
      const hit = [...elementsRef.current].reverse().find((el) => isPointNearElement(pt, el, 14));
      if (hit) {
        setAll(elementsRef.current.filter((el) => el.id !== hit.id));
        erasedRef.current = true;
        if (selectedId === hit.id) setSelectedId(null);
      }
    },
    [selectedId, setAll]
  );

  /** Normalized bounding box of an element (points bbox for paths). */
  const boxOf = (el: DrawingElement) => {
    if ((el.type === 'arrow' || el.type === 'line' || el.type === 'freedraw') && el.points && el.points.length) {
      const xs = el.points.map((p) => p.x);
      const ys = el.points.map((p) => p.y);
      return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
    }
    return {
      x0: Math.min(el.x, el.x + el.width),
      y0: Math.min(el.y, el.y + el.height),
      x1: Math.max(el.x, el.x + el.width),
      y1: Math.max(el.y, el.y + el.height),
    };
  };

  /** Tight box for standalone text (measured, so the frame hugs the letters). */
  const measureCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const measureTextWidth = (text: string, fontSize: number): number => {
    try {
      if (!measureCtxRef.current) {
        const c = document.createElement('canvas');
        measureCtxRef.current = c.getContext('2d');
      }
      const ctx = measureCtxRef.current;
      if (ctx) {
        ctx.font = `700 ${fontSize}px Tahoma, sans-serif`;
        return ctx.measureText(text || ' ').width;
      }
    } catch {}
    return (text || ' ').length * fontSize * 0.6;
  };
  const tightTextBox = useCallback((text: string, fontSize: number) => {
    const fs = Math.max(8, Math.round(fontSize) || 18);
    return {
      width: Math.max(60, Math.ceil(measureTextWidth(text, fs) + 24)),
      height: Math.ceil(fs * 1.5) + 10,
    };
  }, []);

  const beginResize = (e: React.MouseEvent, id: string, handle: ResizeHandle) => {
    e.stopPropagation();
    e.preventDefault();
    const el = elementsRef.current.find((x) => x.id === id);
    if (!el) return;
    mouseDownRef.current = true;
    interactingRef.current = true;
    const pt = toCanvas(e.clientX, e.clientY);
    const b = boxOf(el);
    resizeRef.current = {
      id,
      handle,
      startPt: pt,
      orig: { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 },
      origFontSize: el.fontSize || 18,
      origPoints: (el.points || []).map((p) => ({ ...p })),
    };
    resizeMovedRef.current = false;
    setSelectedId(id);
  };

  const onDown = (e: React.MouseEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    // Keep keyboard focus on the canvas (without scrolling) so Delete-key
    // handling below works — but never steal focus from a text field.
    try {
      const t = e.target as HTMLElement | null;
      const tag = (t?.tagName || '').toLowerCase();
      if (!(t && (tag === 'input' || tag === 'textarea' || t.isContentEditable))) {
        (boxRef.current as HTMLElement | null)?.focus?.({ preventScroll: true } as FocusOptions);
      }
    } catch {}
    mouseDownRef.current = true;
    interactingRef.current = true;
    const pt = toCanvas(e.clientX, e.clientY);

    if (e.button === 1 || tool === 'hand') {
      panningRef.current = true;
      panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
      return;
    }
    if (tool === 'eraser') {
      erasingRef.current = true;
      erasedRef.current = false;
      eraseAt(pt);
      return;
    }
    if (tool === 'select') {
      const hit = [...elementsRef.current].reverse().find((el) => isPointNearElement(pt, el, 10));
      if (hit) {
        // Select immediately; movement starts only past DRAG_THRESHOLD.
        // Second click on an already-selected text edits it directly.
        pendingEditRef.current = hit.type === 'text' && selectedId === hit.id ? hit.id : null;
        setSelectedId(hit.id);
        dragIdRef.current = hit.id;
        dragStartedRef.current = false;
        dragMovedRef.current = false;
        dragStartClientRef.current = { x: e.clientX, y: e.clientY };
        dragOffRef.current = { x: pt.x - hit.x, y: pt.y - hit.y };
      } else {
        setSelectedId(null);
        panningRef.current = true;
        panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
      }
      return;
    }
    const id = newDrawingElementId();
    if (tool === 'text') {
      const el: DrawingElement = { id, type: 'text', x: Math.round(pt.x), y: Math.round(pt.y), width: 180, height: 44, strokeColor: stroke, text: isAr ? 'نص جديد' : 'New text', fontSize };
      commit([...elementsRef.current, el]);
      setSelectedId(id);
      setEditingTextId(id);
      setTextDraft(el.text || '');
      setTool('select');
      interactingRef.current = false;
      mouseDownRef.current = false;
      return;
    }
    if (tool === 'note') {
      const el: DrawingElement = { id, type: 'note', x: Math.round(pt.x), y: Math.round(pt.y), width: 180, height: 150, strokeColor: '#e0c030', backgroundColor: '#fff3b0', strokeWidth: 1, text: isAr ? 'ملاحظة' : 'Note', fontSize: 15 };
      commit([...elementsRef.current, el]);
      setSelectedId(id);
      setEditingTextId(id);
      setTextDraft(el.text || '');
      setTool('select');
      interactingRef.current = false;
      mouseDownRef.current = false;
      return;
    }
    const base: DrawingElement =
      tool === 'ellipse' || tool === 'diamond' || tool === 'rectangle'
        ? { id, type: tool, x: pt.x, y: pt.y, width: 0, height: 0, strokeColor: stroke, backgroundColor: fill, strokeWidth, strokeStyle, fontSize }
        : tool === 'arrow' || tool === 'line'
          ? { id, type: tool, x: pt.x, y: pt.y, width: 0, height: 0, strokeColor: stroke, strokeWidth, strokeStyle, points: [{ x: pt.x, y: pt.y }, { x: pt.x, y: pt.y }] }
          : { id, type: 'freedraw', x: pt.x, y: pt.y, width: 0, height: 0, strokeColor: stroke, strokeWidth, points: [{ x: pt.x, y: pt.y }] };
    setDraft(base);
  };

  const onMove = (e: React.MouseEvent) => {
    if (!mouseDownRef.current) return;
    if (panningRef.current) {
      setPan({ x: e.clientX - panStartRef.current.x, y: e.clientY - panStartRef.current.y });
      return;
    }
    const pt = toCanvas(e.clientX, e.clientY);
    if (resizeRef.current) {
      const rs = resizeRef.current;
      if (rs.handle === 'start' || rs.handle === 'end') {
        const pts = (rs.origPoints || []).map((p) => ({ ...p }));
        if (!pts.length) return;
        const idx = rs.handle === 'start' ? 0 : pts.length - 1;
        pts[idx] = { x: Math.round(pt.x), y: Math.round(pt.y) };
        const xs = pts.map((p) => p.x);
        const ys = pts.map((p) => p.y);
        const nx0 = Math.min(...xs);
        const ny0 = Math.min(...ys);
        resizeMovedRef.current = true;
        setAll(
          elementsRef.current.map((x) =>
            x.id === rs.id
              ? { ...x, points: pts, x: nx0, y: ny0, width: Math.max(...xs) - nx0, height: Math.max(...ys) - ny0 }
              : x
          )
        );
      } else {
        let { x0, y0, x1, y1 } = rs.orig;
        const dx = pt.x - rs.startPt.x;
        const dy = pt.y - rs.startPt.y;
        const h = rs.handle;
        if (h.includes('e')) x1 = rs.orig.x1 + dx;
        if (h.includes('w')) x0 = rs.orig.x0 + dx;
        if (h.includes('s')) y1 = rs.orig.y1 + dy;
        if (h.includes('n')) y0 = rs.orig.y0 + dy;
        const MIN = 20;
        if (x1 - x0 < MIN) {
          if (h.includes('e')) x1 = x0 + MIN;
          else x0 = x1 - MIN;
        }
        if (y1 - y0 < MIN) {
          if (h.includes('s')) y1 = y0 + MIN;
          else y0 = y1 - MIN;
        }
        const W = Math.round(x1 - x0);
        const H = Math.round(y1 - y0);
        const cur = elementsRef.current.find((x) => x.id === rs.id);
        if (cur && (cur.x !== Math.round(x0) || cur.y !== Math.round(y0) || Math.abs(cur.width) !== W || Math.abs(cur.height) !== H)) {
          resizeMovedRef.current = true;
          // Standalone text scales its letters with the frame (like Excalidraw).
          const patch: Partial<DrawingElement> = { x: Math.round(x0), y: Math.round(y0), width: W, height: H };
          if (cur.type === 'text') {
            const origW = Math.max(20, rs.orig.x1 - rs.orig.x0);
            const origH = Math.max(20, rs.orig.y1 - rs.orig.y0);
            const scale = Math.min(W / origW, H / origH);
            patch.fontSize = Math.max(8, Math.min(72, Math.round((rs.origFontSize || 18) * scale)));
          }
          setAll(
            elementsRef.current.map((x) =>
              x.id === rs.id ? { ...x, ...patch } : x
            )
          );
        }
      }
      return;
    }
    if (erasingRef.current) {
      eraseAt(pt);
      return;
    }
    if (dragIdRef.current) {
      const id = dragIdRef.current;
      // Arm the drag only after a real pointer travel — plain clicks stay put.
      if (!dragStartedRef.current) {
        const dx = e.clientX - dragStartClientRef.current.x;
        const dy = e.clientY - dragStartClientRef.current.y;
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        dragStartedRef.current = true;
      }
      const el = elementsRef.current.find((x) => x.id === id);
      if (!el) return;
      const nx = Math.round(pt.x - dragOffRef.current.x);
      const ny = Math.round(pt.y - dragOffRef.current.y);
      if (nx !== el.x || ny !== el.y) dragMovedRef.current = true;
      const dx = nx - el.x;
      const dy = ny - el.y;
      setAll(
        elementsRef.current.map((x) => {
          if (x.id !== id) return x;
          if ((x.type === 'arrow' || x.type === 'line' || x.type === 'freedraw') && x.points) {
            return { ...x, x: nx, y: ny, points: x.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
          }
          return { ...x, x: nx, y: ny };
        })
      );
      return;
    }
    setDraft((prev) => {
      if (!prev) return prev;
      if (prev.type === 'freedraw') {
        return { ...prev, points: [...(prev.points || []), { x: pt.x, y: pt.y }] };
      }
      if (prev.type === 'arrow' || prev.type === 'line') {
        const s = prev.points ? prev.points[0] : { x: prev.x, y: prev.y };
        return { ...prev, width: pt.x - s.x, height: pt.y - s.y, points: [s, { x: pt.x, y: pt.y }] };
      }
      const w = pt.x - prev.x;
      const h = pt.y - prev.y;
      return { ...prev, x: w < 0 ? pt.x : prev.x, y: h < 0 ? pt.y : prev.y, width: Math.abs(w), height: Math.abs(h) };
    });
  };

  const endStroke = useCallback(() => {
    mouseDownRef.current = false;
    interactingRef.current = false;
    if (resizeRef.current) {
      const rs = resizeRef.current;
      const moved = resizeMovedRef.current;
      resizeRef.current = null;
      resizeMovedRef.current = false;
      if (moved) {
        // Snap a resized text frame tight around its letters at the final size.
        const target = elementsRef.current.find((x) => x.id === rs.id);
        if (target && target.type === 'text') {
          const dims = tightTextBox(target.text || '', target.fontSize || 18);
          commit(
            elementsRef.current.map((x) =>
              x.id === rs.id ? { ...x, width: dims.width, height: dims.height } : x
            )
          );
        } else {
          commit([...elementsRef.current]);
        }
      }
      return;
    }
    if (panningRef.current) {
      panningRef.current = false;
      return;
    }
    if (erasingRef.current) {
      erasingRef.current = false;
      if (erasedRef.current) {
        erasedRef.current = false;
        commit([...elementsRef.current]);
      }
      return;
    }
    if (dragIdRef.current) {
      // Click without travel = selection only: no move, no history entry.
      // Second click on an already-selected text edits it directly.
      const moved = dragStartedRef.current && dragMovedRef.current;
      const id = dragIdRef.current;
      dragIdRef.current = null;
      dragStartedRef.current = false;
      dragMovedRef.current = false;
      if (moved) {
        pendingEditRef.current = null;
        commit([...elementsRef.current]);
        return;
      }
      if (pendingEditRef.current === id) {
        pendingEditRef.current = null;
        const clickedEl = elementsRef.current.find((x) => x.id === id);
        if (clickedEl && clickedEl.type === 'text') {
          setEditingTextId(id);
          setTextDraft(clickedEl.text || '');
        }
      }
      return;
    }
    setDraft((prev) => {
      if (!prev) return prev;
      const ok =
        prev.type === 'freedraw'
          ? (prev.points || []).length > 1
          : prev.type === 'arrow' || prev.type === 'line'
            ? true
            : Math.abs(prev.width) >= 8 && Math.abs(prev.height) >= 8;
      if (ok) {
        const done = { ...prev, width: Math.abs(prev.width), height: Math.abs(prev.height) };
        commit([...elementsRef.current, done]);
        setSelectedId(done.id);
      }
      return null;
    });
    setTool('select');
  }, [commit, tightTextBox]);

  const commitText = () => {
    if (!editingTextId) return;
    const v = textDraft;
    commit(
      elementsRef.current.map((el) => {
        if (el.id !== editingTextId) return el;
        if (el.type !== 'text') return { ...el, text: v };
        const dims = tightTextBox(v, el.fontSize || 18);
        return { ...el, text: v, width: dims.width, height: dims.height };
      })
    );
    setEditingTextId(null);
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    commit(elementsRef.current.filter((x) => x.id !== selectedId));
    setSelectedId(null);
  };

  // Keyboard Delete/Backspace removes the selected element. Capture phase
  // on the canvas box so TipTap's Backspace-guard never sees it while the
  // canvas has focus. Never fires while editing text or typing in a field.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (editingTextId) return;
      const t = document.activeElement as HTMLElement | null;
      const tag = (t?.tagName || '').toLowerCase();
      if (t && (t.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select')) return;
      if (!selectedId) return;
      e.preventDefault();
      e.stopPropagation();
      commit(elementsRef.current.filter((x) => x.id !== selectedId));
      setSelectedId(null);
    };
    box.addEventListener('keydown', onKey, true);
    return () => box.removeEventListener('keydown', onKey, true);
  }, [editingTextId, selectedId, commit]);

  const BOX_TYPES: DrawingElement['type'][] = ['rectangle', 'ellipse', 'diamond', 'note'];

  /**
   * Style controls do double duty: they set the defaults for NEW shapes,
   * and when a shape is selected they restyle it live (single history entry).
   */
  const restyleSelected = (patch: Partial<DrawingElement>, applies: (el: DrawingElement) => boolean) => {
    if (!selectedId) return;
    const el = elementsRef.current.find((x) => x.id === selectedId);
    if (!el || !applies(el)) return;
    const changed = (Object.keys(patch) as Array<keyof DrawingElement>).some((k) => el[k] !== patch[k]);
    if (!changed) return;
    commit(elementsRef.current.map((x) => (x.id === el.id ? { ...x, ...patch } : x)));
  };

  /** Reverse an arrow/line direction (swap endpoints). */
  const flipSelected = () => {
    if (!selectedId) return;
    const el = elementsRef.current.find((x) => x.id === selectedId);
    if (!el || (el.type !== 'arrow' && el.type !== 'line') || !el.points || el.points.length < 2) return;
    const pts = [...el.points].reverse().map((p) => ({ ...p }));
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const nx0 = Math.min(...xs);
    const ny0 = Math.min(...ys);
    commit(
      elementsRef.current.map((x) =>
        x.id === el.id
          ? { ...x, points: pts, x: nx0, y: ny0, width: Math.max(...xs) - nx0, height: Math.max(...ys) - ny0 }
          : x
      )
    );
  };

  /** Duplicate (clone) the selected shape with a slight offset. */
  const duplicateSelected = () => {
    if (!selectedId) return;
    const el = elementsRef.current.find((x) => x.id === selectedId);
    if (!el) return;
    const OFF = 24;
    const copy: DrawingElement = {
      ...el,
      id: newDrawingElementId(),
      x: el.x + OFF,
      y: el.y + OFF,
      points: el.points?.map((p) => ({ x: p.x + OFF, y: p.y + OFF })),
    };
    commit([...elementsRef.current, copy]);
    setSelectedId(copy.id);
    toast.success(isAr ? 'تم استنساخ الشكل' : 'Shape duplicated');
  };

  const fitView = () => {
    setPan({ x: 20, y: 20 });
    setZoom(1);
  };

  const frameW = `${Math.max(30, Math.min(100, Number(width) || 100))}%`;
  const alignCls = alignment === 'left' ? 'ms-0 me-auto' : alignment === 'right' ? 'ms-auto me-0' : 'mx-auto';
  const all = draft ? [...elements, draft] : elements;

  const tools: Array<{ k: DrawingTool; icon: any; label: string }> = [
    { k: 'select', icon: MousePointer2, label: isAr ? 'تحديد' : 'Select' },
    { k: 'hand', icon: Hand, label: isAr ? 'تحريك' : 'Pan' },
    { k: 'rectangle', icon: Square, label: isAr ? 'مستطيل' : 'Rect' },
    { k: 'diamond', icon: Diamond, label: isAr ? 'معين' : 'Diamond' },
    { k: 'ellipse', icon: Circle, label: isAr ? 'دائرة' : 'Ellipse' },
    { k: 'arrow', icon: MoveRight, label: isAr ? 'سهم' : 'Arrow' },
    { k: 'line', icon: Minus, label: isAr ? 'خط' : 'Line' },
    { k: 'freedraw', icon: Pencil, label: isAr ? 'رسم حر' : 'Draw' },
    { k: 'text', icon: Type, label: isAr ? 'نص' : 'Text' },
    { k: 'note', icon: StickyNote, label: isAr ? 'ملاحظة' : 'Note' },
    { k: 'eraser', icon: Eraser, label: isAr ? 'ممحاة' : 'Eraser' },
  ];

  return (
    <NodeViewWrapper dir={isAr ? 'rtl' : 'ltr'} className="my-6 block not-prose w-full max-w-full">
      <div style={{ width: frameW }} className={cn('group relative overflow-hidden rounded-xl border border-border bg-card shadow-sm', alignCls)}>
        <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-border bg-muted/40 px-2.5 py-1.5 text-xs">
          <div className="flex min-w-0 items-center gap-1.5">
            <Pencil className="h-3.5 w-3.5 shrink-0 text-[#2E4034] dark:text-emerald-400" />
            <input value={title} onChange={(e) => updateAttributes({ title: e.target.value })} onKeyDown={(e) => e.stopPropagation()} dir={isAr ? 'rtl' : 'ltr'} placeholder={isAr ? 'عنوان الرسم' : 'Drawing title'} className="h-7 w-40 rounded-md border border-transparent bg-transparent px-2 text-xs font-bold text-foreground placeholder:font-normal placeholder:text-muted-foreground/70 hover:border-border focus:border-[#2E4034] focus:bg-background focus:outline-none sm:w-52" />
            <button type="button" onClick={() => setShowDelete(true)} className="rounded p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-600" title={isAr ? 'حذف الرسم' : 'Delete drawing'}>
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={undo} disabled={hIdx <= 0} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40" title={isAr ? 'تراجع' : 'Undo'}><Undo2 className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={redo} disabled={hIdx >= history.length - 1} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40" title={isAr ? 'إعادة' : 'Redo'}><Redo2 className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={() => setZoom((z) => Math.min(3, +(z + 0.1).toFixed(2)))} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="+"><ZoomIn className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={() => setZoom((z) => Math.max(0.3, +(z - 0.1).toFixed(2)))} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="-"><ZoomOut className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={fitView} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title={isAr ? 'ملاءمة العرض' : 'Fit view'}><Maximize2 className="h-3.5 w-3.5" /></button>
          </div>
        </div>
        {showDelete && (
          <div className="flex items-center justify-between gap-2 border-b border-red-200 bg-red-50/95 px-3 py-1.5 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/70 dark:text-red-300">
            <span>{isAr ? 'حذف هذا الرسم نهائياً؟' : 'Delete this drawing permanently?'}</span>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => { props.deleteNode(); toast.success(isAr ? 'تم حذف الرسم' : 'Drawing deleted'); }} className="rounded bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-red-700">{isAr ? 'حذف' : 'Delete'}</button>
              <button type="button" onClick={() => setShowDelete(false)} className="rounded border border-border bg-background px-2 py-0.5 text-[11px] text-foreground hover:bg-muted">{isAr ? 'إلغاء' : 'Cancel'}</button>
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1 border-b border-border bg-muted/20 px-2 py-1.5">
          {tools.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.k} type="button" onClick={() => setTool(t.k)} title={t.label} aria-pressed={tool === t.k} className={cn('flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] font-semibold transition-colors', tool === t.k ? 'bg-[#2E4034] text-white shadow-2xs' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden lg:inline">{t.label}</span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/20 px-3 py-1.5 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-1" title={isAr ? 'لون الحد (يطبق على المحدد)' : 'Stroke color (applies to selection)'}>
            {DRAWING_STROKE_COLORS.map((c) => (
              <button key={c} type="button" onClick={() => { setStroke(c); restyleSelected({ strokeColor: c }, () => true); }} style={{ backgroundColor: c }} aria-label={`stroke ${c}`} className={cn('h-5 w-5 rounded-full border border-border transition-transform hover:scale-110', stroke === c && 'ring-2 ring-foreground ring-offset-1 ring-offset-card')} />
            ))}
          </div>
          <span className="h-4 w-px bg-border" />
          <div className="flex items-center gap-1" title={isAr ? 'لون التعبئة (يطبق على المحدد)' : 'Fill color (applies to selection)'}>
            {DRAWING_FILL_COLORS.map((c) => (
              <button key={c} type="button" onClick={() => { setFill(c); restyleSelected({ backgroundColor: c }, (el) => BOX_TYPES.includes(el.type)); }} style={{ backgroundColor: c === 'transparent' ? 'repeating-conic-gradient(#ddd 0 25%, #fff 0 50%) 0 0 / 8px 8px' : c }} aria-label={`fill ${c}`} className={cn('h-5 w-5 rounded-md border border-border transition-transform hover:scale-110', fill === c && 'ring-2 ring-foreground ring-offset-1 ring-offset-card')} />
            ))}
          </div>
          <span className="h-4 w-px bg-border" />
          <select value={strokeWidth} onChange={(e) => { const v = Number(e.target.value); setStrokeWidth(v); restyleSelected({ strokeWidth: v }, (el) => el.type !== 'text'); }} className="h-6 rounded border border-border bg-card px-1 text-[11px] font-bold" dir="ltr" aria-label="stroke width">
            <option value={1}>1px</option>
            <option value={2}>2px</option>
            <option value={4}>4px</option>
            <option value={6}>6px</option>
          </select>
          <select value={strokeStyle} onChange={(e) => { const v = e.target.value as 'solid' | 'dashed' | 'dotted'; setStrokeStyle(v); restyleSelected({ strokeStyle: v }, (el) => el.type !== 'text'); }} className="h-6 rounded border border-border bg-card px-1 text-[11px]" aria-label="stroke style">
            <option value="solid">{isAr ? 'متصل' : 'Solid'}</option>
            <option value="dashed">{isAr ? 'متقطع' : 'Dashed'}</option>
            <option value="dotted">{isAr ? 'منقط' : 'Dotted'}</option>
          </select>
          <select value={fontSize} onChange={(e) => { const v = Number(e.target.value); setFontSize(v); restyleSelected({ fontSize: v }, (el) => el.type !== 'arrow' && el.type !== 'line' && el.type !== 'freedraw'); }} className="h-6 rounded border border-border bg-card px-1 text-[11px] font-bold" dir="ltr" aria-label="font size">
            <option value={14}>14</option>
            <option value={18}>18</option>
            <option value={24}>24</option>
            <option value={32}>32</option>
          </select>
          <span className="h-4 w-px bg-border" />
          <div className="flex items-center overflow-hidden rounded border border-border" role="group" aria-label={isAr ? 'اتجاه الرسم' : 'Drawing direction'}>
            <button
              type="button"
              onClick={() => updateAttributes({ direction: 'rtl' })}
              title={isAr ? 'من اليمين لليسار' : 'Right to left'}
              className={cn('h-6 px-1.5 text-[11px] font-bold transition-colors', drawDir === 'rtl' ? 'bg-[#2E4034] text-white' : 'text-muted-foreground hover:bg-muted')}
            >
              RTL
            </button>
            <button
              type="button"
              onClick={() => updateAttributes({ direction: 'ltr' })}
              title={isAr ? 'من اليسار لليمين' : 'Left to right'}
              className={cn('h-6 px-1.5 text-[11px] font-bold transition-colors', drawDir === 'ltr' ? 'bg-[#2E4034] text-white' : 'text-muted-foreground hover:bg-muted')}
            >
              LTR
            </button>
          </div>
        </div>
        <div ref={boxRef} dir="ltr" tabIndex={0} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={endStroke} onMouseLeave={endStroke} className="relative w-full touch-none select-none overflow-hidden outline-none" style={{ height: canvasH, backgroundColor: background === 'dark' ? '#0f172a' : background === 'cream' ? '#FAF7F0' : '#ffffff', backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)', backgroundSize: '18px 18px', cursor: tool === 'hand' ? 'grab' : tool === 'select' ? 'default' : 'crosshair' }}>
          <svg className="absolute inset-0 h-full w-full">
            <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
              {all.map((el) => {
                const common: any = { stroke: el.strokeColor || '#1e1e1e', strokeWidth: el.strokeWidth || 2, strokeDasharray: dashFor(el.strokeStyle), fill: el.backgroundColor && el.backgroundColor !== 'transparent' ? el.backgroundColor : 'none' };
                if (el.type === 'rectangle' || el.type === 'note') {
                  return (
                    <g key={el.id}>
                      <rect x={Math.min(el.x, el.x + el.width)} y={Math.min(el.y, el.y + el.height)} width={Math.abs(el.width) || 2} height={Math.abs(el.height) || 2} rx={el.type === 'note' ? 8 : 4} {...common} opacity={0.95} />
                      {el.text ? <text x={Math.min(el.x, el.x + el.width) + Math.abs(el.width) / 2} y={Math.min(el.y, el.y + el.height) + Math.abs(el.height) / 2} textAnchor="middle" dominantBaseline="middle" style={{ direction: drawDir }} fontSize={el.fontSize || 15} fontWeight={700} fill={el.strokeColor || '#1e1e1e'}>{String(el.text).slice(0, 80)}</text> : null}
                    </g>
                  );
                }
                if (el.type === 'ellipse') {
                  const cx = Math.min(el.x, el.x + el.width) + Math.abs(el.width) / 2;
                  const cy = Math.min(el.y, el.y + el.height) + Math.abs(el.height) / 2;
                  return (
                    <g key={el.id}>
                      <ellipse cx={cx} cy={cy} rx={Math.abs(el.width) / 2 || 2} ry={Math.abs(el.height) / 2 || 2} {...common} />
                      {el.text ? <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" style={{ direction: drawDir }} fontSize={el.fontSize || 15} fontWeight={700} fill={el.strokeColor || '#1e1e1e'}>{String(el.text).slice(0, 80)}</text> : null}
                    </g>
                  );
                }
                if (el.type === 'diamond') {
                  const x0 = Math.min(el.x, el.x + el.width);
                  const y0 = Math.min(el.y, el.y + el.height);
                  const w = Math.abs(el.width) || 2;
                  const h = Math.abs(el.height) || 2;
                  const pts = `${x0 + w / 2},${y0} ${x0 + w},${y0 + h / 2} ${x0 + w / 2},${y0 + h} ${x0},${y0 + h / 2}`;
                  return (
                    <g key={el.id}>
                      <polygon points={pts} {...common} />
                      {el.text ? <text x={x0 + w / 2} y={y0 + h / 2} textAnchor="middle" dominantBaseline="middle" style={{ direction: drawDir }} fontSize={el.fontSize || 15} fontWeight={700} fill={el.strokeColor || '#1e1e1e'}>{String(el.text).slice(0, 80)}</text> : null}
                    </g>
                  );
                }
                if (el.type === 'text') {
                  // Vertically + horizontally centered in its own frame, so the
                  // letters always sit exactly inside the box at any font size.
                  const tFs = el.fontSize || 18;
                  const tLines = String(el.text || '').split('\n');
                  const tLineH = Math.ceil(tFs * 1.35);
                  const tBlockH = tLines.length * tLineH;
                  const tBaseline = el.y + (el.height - tBlockH) / 2 + tFs * 0.85;
                  const tCx = el.x + el.width / 2;
                  return (
                    <g key={el.id}>
                      <text
                        x={tCx}
                        y={tBaseline}
                        fontSize={tFs}
                        fontWeight={700}
                        fill={el.strokeColor || '#1e1e1e'}
                        textAnchor="middle"
                        style={{ direction: drawDir }}
                      >
                        {tLines.map((line, i) => (
                          <tspan key={i} x={tCx} dy={i === 0 ? 0 : tLineH}>
                            {line || ' '}
                          </tspan>
                        ))}
                      </text>
                    </g>
                  );
                }
                const pts = el.points && el.points.length >= 2 ? el.points : [{ x: el.x, y: el.y }, { x: el.x + el.width, y: el.y + el.height }];
                if (el.type === 'freedraw') {
                  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
                  return <path key={el.id} d={d} fill="none" stroke={el.strokeColor || '#1e1e1e'} strokeWidth={el.strokeWidth || 2} strokeLinecap="round" strokeLinejoin="round" />;
                }
                const [p1, p2] = [pts[0], pts[pts.length - 1]];
                const ang = Math.atan2(p2.y - p1.y, p2.x - p1.x);
                const hl = 12;
                return (
                  <g key={el.id}>
                    <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={el.strokeColor || '#1e1e1e'} strokeWidth={el.strokeWidth || 2} strokeDasharray={dashFor(el.strokeStyle)} strokeLinecap="round" />
                    {el.type === 'arrow' ? <polygon points={`0,0 ${-hl},${-hl / 2.4} ${-hl},${hl / 2.4}`} fill={el.strokeColor || '#1e1e1e'} transform={`translate(${p2.x},${p2.y}) rotate(${(ang * 180) / Math.PI})`} /> : null}
                  </g>
                );
              })}
              {/* Selection overlay: dashed bounds + resize handles for every shape */}
              {(() => {
                const selEl = elements.find((x) => x.id === selectedId);
                if (!selEl || draft?.id === selEl.id) return null;
                const hs = 10 / zoom;
                const sw = 1.5 / zoom;
                if (selEl.type === 'arrow' || selEl.type === 'line') {
                  const pts = selEl.points && selEl.points.length >= 2
                    ? selEl.points
                    : [{ x: selEl.x, y: selEl.y }, { x: selEl.x + selEl.width, y: selEl.y + selEl.height }];
                  const r = 6.5 / zoom;
                  return (
                    <g key={`sel-${selEl.id}`}>
                      <line x1={pts[0].x} y1={pts[0].y} x2={pts[pts.length - 1].x} y2={pts[pts.length - 1].y} stroke="#2E4034" strokeWidth={sw} strokeDasharray={`${6 / zoom} ${4 / zoom}`} />
                      <circle cx={pts[0].x} cy={pts[0].y} r={r} fill="#fff" stroke="#2E4034" strokeWidth={sw} style={{ cursor: 'move' }} onMouseDown={(e) => beginResize(e, selEl.id, 'start')} />
                      <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r={r} fill="#2E4034" stroke="#fff" strokeWidth={sw} style={{ cursor: 'move' }} onMouseDown={(e) => beginResize(e, selEl.id, 'end')} />
                    </g>
                  );
                }
                const b = boxOf(selEl);
                const mx = (b.x0 + b.x1) / 2;
                const my = (b.y0 + b.y1) / 2;
                const resizable = selEl.type !== 'freedraw';
                const H: Array<{ k: ResizeHandle; x: number; y: number; cursor: string }> = resizable
                  ? [
                      { k: 'nw', x: b.x0, y: b.y0, cursor: 'nwse-resize' },
                      { k: 'n', x: mx, y: b.y0, cursor: 'ns-resize' },
                      { k: 'ne', x: b.x1, y: b.y0, cursor: 'nesw-resize' },
                      { k: 'e', x: b.x1, y: my, cursor: 'ew-resize' },
                      { k: 'se', x: b.x1, y: b.y1, cursor: 'nwse-resize' },
                      { k: 's', x: mx, y: b.y1, cursor: 'ns-resize' },
                      { k: 'sw', x: b.x0, y: b.y1, cursor: 'nesw-resize' },
                      { k: 'w', x: b.x0, y: my, cursor: 'ew-resize' },
                    ]
                  : [];
                return (
                  <g key={`sel-${selEl.id}`}>
                    <rect x={b.x0} y={b.y0} width={Math.max(b.x1 - b.x0, 2)} height={Math.max(b.y1 - b.y0, 2)} fill="none" stroke="#2E4034" strokeWidth={sw} strokeDasharray={`${6 / zoom} ${4 / zoom}`} rx={4} />
                    {H.map((hh) => (
                      <rect
                        key={hh.k}
                        x={hh.x - hs / 2}
                        y={hh.y - hs / 2}
                        width={hs}
                        height={hs}
                        rx={2}
                        fill="#fff"
                        stroke="#2E4034"
                        strokeWidth={sw}
                        style={{ cursor: hh.cursor }}
                        onMouseDown={(e) => beginResize(e, selEl.id, hh.k)}
                      />
                    ))}
                  </g>
                );
              })()}
            </g>
          </svg>
          {editingTextId ? (
            <div className="absolute inset-x-3 bottom-3 flex items-center gap-2 rounded-lg border border-border bg-card/95 p-2 shadow-lg" dir={isAr ? 'rtl' : 'ltr'}>
              <input autoFocus value={textDraft} onChange={(e) => setTextDraft(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') commitText(); if (e.key === 'Escape') setEditingTextId(null); }} placeholder={isAr ? 'نص الشكل…' : 'Shape text…'} className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-[#2E4034]" />
              <button type="button" onClick={commitText} className="h-8 rounded-md bg-[#2E4034] px-3 text-xs font-bold text-white">{isAr ? 'تم' : 'OK'}</button>
            </div>
          ) : null}
        </div>
        {/* Bottom-edge grip: drag vertically to resize the frame height */}
        <div
          dir="ltr"
          className={cn(
            'flex cursor-ns-resize touch-none select-none items-center justify-center gap-1.5 border-t border-border bg-muted/30 py-1 text-[10px] font-bold text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground',
            canvasDragging && 'bg-[#2E4034]/10 text-[#2E4034]'
          )}
          style={{ touchAction: 'none' }}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            try {
              (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            } catch {}
            canvasDragRef.current = { startY: e.clientY, startH: canvasH };
            setCanvasDragging(true);
          }}
          onPointerMove={(e) => {
            const s = canvasDragRef.current;
            if (!s) return;
            e.stopPropagation();
            setCanvasH(Math.max(MIN_CANVAS_H, Math.min(MAX_CANVAS_H, Math.round(s.startH + (e.clientY - s.startY)))));
          }}
          onPointerUp={(e) => {
            if (!canvasDragRef.current) return;
            e.stopPropagation();
            canvasDragRef.current = null;
            setCanvasDragging(false);
            updateAttributes({ height: canvasH });
          }}
          onPointerCancel={() => {
            canvasDragRef.current = null;
            setCanvasDragging(false);
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => {
            e.stopPropagation();
            setCanvasH(380);
            updateAttributes({ height: 380 });
          }}
          title={isAr ? 'اسحب عمودياً لتغيير طول اللوحة — ضغطة مزدوجة للطول الافتراضي' : 'Drag vertically to resize frame height — double-click for default'}
        >
          <span className="inline-block h-1 w-10 rounded-full bg-current opacity-50" />
          <span className="font-mono">{canvasH}px</span>
        </div>
        <div className="border-t border-border bg-card/60 p-2.5">
          <input type="text" dir={isAr ? 'rtl' : 'ltr'} value={caption} onChange={(e) => updateAttributes({ caption: e.target.value })} onKeyDown={(e) => e.stopPropagation()} placeholder={isAr ? 'وصف الرسم (اختياري)' : 'Drawing caption (optional)'} className="w-full rounded-lg border border-border/80 bg-background/90 px-4 py-2 text-xs text-foreground placeholder:text-muted-foreground/70 focus:border-[#2E4034] focus:outline-none focus:ring-1 focus:ring-[#2E4034]" />
        </div>
        <div className="border-t border-border bg-card/60 px-3 py-1.5 text-[11px] text-muted-foreground">
          {isAr ? 'اسحب للرسم • حدد الشكل لتحريكه • اضغط على النص المحدد لتحريره • اسحب الزوايا لتكبير/تصغير الخط • Delete لحذف المحدد' : 'Drag to draw • Select to move • Click selected text to edit • Drag corners to scale font • Delete removes selection'}
          <span className="font-mono text-muted-foreground/70"> · {elements.length} {isAr ? 'عنصر' : 'shapes'}</span>
          {selectedId && (() => { const se = elementsRef.current.find((x) => x.id === selectedId); return se && (se.type === 'arrow' || se.type === 'line'); })() ? (
            <button type="button" onClick={flipSelected} className="ms-2 inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 font-bold hover:bg-muted" title={isAr ? 'عكس اتجاه السهم' : 'Flip arrow direction'}>
              ⇄ {isAr ? 'عكس الاتجاه' : 'Flip'}
            </button>
          ) : null}
          {selectedId ? <button type="button" onClick={duplicateSelected} className="ms-2 inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 font-bold hover:bg-muted"><Copy className="h-3 w-3" />{isAr ? 'استنساخ' : 'Duplicate'}</button> : null}
          {selectedId ? <button type="button" onClick={deleteSelected} className="ms-1 rounded border border-red-200 px-1.5 py-0.5 font-bold text-red-600 hover:bg-red-50">{isAr ? 'حذف المحدد' : 'Delete selected'}</button> : null}
        </div>
      </div>
    </NodeViewWrapper>
  );
}
