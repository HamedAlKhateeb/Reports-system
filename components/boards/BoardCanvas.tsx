'use client';

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import type { Board, BoardWidget, WidgetType, ExcalidrawElement } from '@/lib/boards-types';
import { WidgetRenderer } from './widgets/WidgetRenderer';
import { generateBoardId } from '@/lib/boards-db';
import {
  Lock,
  Unlock,
  Hand,
  MousePointer2,
  Square,
  Diamond,
  Circle,
  MoveRight,
  Minus,
  Pencil,
  Type,
  StickyNote,
  Eraser,
  MoreVertical,
  Image as ImageIcon,
  Frame,
  Code2,
  Shapes,
  Wand2,
  PaintBucket,
  Lasso,
  Brain,
  GitFork,
  Terminal,
  CheckSquare,
  MessageSquare,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Download,
  Share2,
  Copy,
  Trash2,
  Sparkles,
  X,
  Plus,
  Archive,
  GripHorizontal,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { usePomodoro } from '@/lib/pomodoro-context';

const TEXT_FONT_FAMILY = '"IBM Plex Sans Arabic","Noto Sans Arabic",Tahoma,sans-serif';

let textMeasureCtx: CanvasRenderingContext2D | null = null;
function getTextMeasureCtx(): CanvasRenderingContext2D | null {
  try {
    if (!textMeasureCtx) {
      const c = document.createElement('canvas');
      textMeasureCtx = c.getContext('2d');
    }
    return textMeasureCtx;
  } catch {
    return null;
  }
}

/**
 * Live render box of a text element — measured from the actual letters,
 * never from the stored width/height (old boards carry stale boxes from
 * previous estimators, which made clicks "miss" visible text).
 */
export function textRenderBox(el: { x: number; y: number; text?: string; fontSize?: number }): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  const dims = estimateTextBounds(el.text || '', el.fontSize || 18);
  return { x: el.x, y: el.y, w: dims.width, h: dims.height };
}

/** Word-wrap note text to fit a max width (measured with the note font). */
export function wrapNoteText(text: string, fontSize: number, maxWidth: number): string[] {
  const fs = Math.max(8, Math.round(fontSize) || 15);
  const out: string[] = [];
  const measure = (s: string): number => {
    try {
      const ctx = getTextMeasureCtx();
      if (ctx) {
        ctx.font = `500 ${fs}px ${TEXT_FONT_FAMILY}`;
        return ctx.measureText(s).width;
      }
    } catch {}
    return s.length * fs * 0.6;
  };
  for (const para of (text || '').split('\n')) {
    if (!para.trim()) {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const trial = line ? `${line} ${word}` : word;
      if (measure(trial) > maxWidth && line) {
        out.push(line);
        line = word;
      } else {
        line = trial;
      }
    }
    out.push(line);
  }
  return out.length ? out : [''];
}

/** Box used for selection frame + resize handles (text: measured, else stored). */
export function displayBox(el: { type?: string; x: number; y: number; width: number; height: number; text?: string; fontSize?: number }): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  if (el.type === 'text') return textRenderBox(el as { x: number; y: number; text?: string; fontSize?: number });
  return { x: el.x, y: el.y, w: el.width, h: el.height };
}

/**
 * Click/erase hit test for whiteboard elements. Text is tested against its
 * LIVE measured box (same box the selection frame draws), so clicking
 * visible letters always hits — even when the stored width/height is stale.
 */
export function hitTestElement(
  pt: { x: number; y: number },
  el: { type?: string; x: number; y: number; width: number; height: number; text?: string; fontSize?: number; points?: Array<{ x: number; y: number }> },
  threshold = 12
): boolean {
  if (el.type === 'text') {
    const b = textRenderBox(el);
    return pt.x >= b.x - threshold && pt.x <= b.x + b.w + threshold && pt.y >= b.y - threshold && pt.y <= b.y + b.h + threshold;
  }
  return isPointNearElement(pt, el as { type: string; x: number; y: number; width: number; height: number; points?: Array<{ x: number; y: number }> }, threshold);
}
export function estimateTextBounds(text: string, fontSize: number = 18): { width: number; height: number } {
  const fs = Math.max(8, Math.round(fontSize) || 18);
  const lines = (text || '').split('\n');
  const lineHeight = Math.ceil(fs * 1.35);
  try {
    const ctx = getTextMeasureCtx();
    if (ctx) {
      ctx.font = `600 ${fs}px ${TEXT_FONT_FAMILY}`;
      let maxW = 0;
      for (const line of lines) {
        maxW = Math.max(maxW, ctx.measureText(line || ' ').width);
      }
      return {
        width: Math.max(40, Math.ceil(maxW + 16)),
        height: Math.max(24, lines.length * lineHeight + 8),
      };
    }
  } catch {}
  const maxLineLen = Math.max(...lines.map((l) => l.length), 1);
  return {
    width: Math.max(70, Math.ceil(maxLineLen * fs * 0.65 + 24)),
    height: Math.max(34, lines.length * Math.max(22, lineHeight) + 10),
  };
}

export type ExcalidrawTool =
  | 'select'
  | 'hand'
  | 'rectangle'
  | 'diamond'
  | 'ellipse'
  | 'arrow'
  | 'line'
  | 'freedraw'
  | 'text'
  | 'note'
  | 'eraser'
  | 'laser'
  | 'bucket';

interface BoardCanvasProps {
  board: Board;
  onUpdateBoard?: (updatedBoard: Board) => void;
  lang?: 'ar' | 'en';
  onOpenShare?: () => void;
  onArchive?: () => void;
  readOnly?: boolean;
}

const STROKE_COLORS = [
  '#1e1e1e',
  '#e03131',
  '#2f9e44',
  '#1971c2',
  '#f08c00',
  '#9c36b5',
  '#ffffff',
];

const FILL_COLORS = [
  'transparent',
  '#ffc9c9',
  '#b2f2bb',
  '#a5d8ff',
  '#ffec99',
  '#eebefa',
  '#e9ecef',
];

const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 96;

/** Element types that carry editable text (font size applies). */
function elementHasText(t?: string): boolean {
  return t === 'text' || t === 'rectangle' || t === 'diamond' || t === 'ellipse' || t === 'note';
}

// Geometry lives in the shared drawing engine (single source of truth).
import { isPointNearElement } from '@/lib/drawing/geometry';

export function BoardCanvas({
  board,
  onUpdateBoard,
  lang = 'ar',
  onOpenShare,
  onArchive,
  readOnly = false,
}: BoardCanvasProps) {
  const isArabic = lang === 'ar';
  const { activeTask, isRunning, startTaskPomodoro, toggleTimer } = usePomodoro();
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Active Tool & Lock State
  const [activeTool, setActiveTool] = useState<ExcalidrawTool>('select');
  const [isLocked, setIsLocked] = useState(false);

  // Canvas Viewport (Pan & Zoom)
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [isErasing, setIsErasing] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0 });

  // Whiteboard frame height (px). null = fill the available viewport.
  // Width always stays full — only the length is user-controllable.
  const [frameH, setFrameH] = useState<number | null>(() => board.whiteboard?.canvasHeight ?? null);
  const frameDragRef = useRef<{ startY: number; startH: number } | null>(null);
  const [frameDragging, setFrameDragging] = useState(false);
  const MIN_FRAME_H = 320;
  const MAX_FRAME_H = 2400;

  // Widget Interaction State
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);
  const [draggingWidgetId, setDraggingWidgetId] = useState<string | null>(null);
  const dragOffsetRef = useRef({ mouseX: 0, mouseY: 0, origX: 0, origY: 0 });
  const [resizingWidgetId, setResizingWidgetId] = useState<string | null>(null);
  const resizeStartRef = useRef({ mouseX: 0, mouseY: 0, origW: 0, origH: 0 });

  // Excalidraw Element Styling defaults
  const [strokeColor, setStrokeColor] = useState('#1e1e1e');
  const [backgroundColor, setBackgroundColor] = useState('transparent');
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [strokeStyle, setStrokeStyle] = useState<'solid' | 'dashed' | 'dotted'>('solid');
  const [fontSize, setFontSize] = useState(18);

  // Seed / migrate existing elements from board
  const initialElements = useMemo<ExcalidrawElement[]>(() => {
    if (board.whiteboard?.elements && board.whiteboard.elements.length > 0) {
      return board.whiteboard.elements;
    }
    // Migration: if previous mindmap nodes exist, convert them to whiteboard elements
    if (board.mindmap?.nodes && board.mindmap.nodes.length > 0) {
      const converted: ExcalidrawElement[] = [];
      const nodeMap = new Map<string, { x: number; y: number }>();

      board.mindmap.nodes.forEach((n, idx) => {
        const x = Number(n.x) || 100 + (idx % 3) * 220;
        const y = Number(n.y) || 100 + Math.floor(idx / 3) * 140;
        nodeMap.set(n.id, { x, y });

        converted.push({
          id: n.id,
          type: n.shape === 'pill' ? 'ellipse' : 'rectangle',
          x,
          y,
          width: 170,
          height: 60,
          strokeColor: '#1971c2',
          backgroundColor: '#a5d8ff',
          strokeWidth: 2,
          strokeStyle: 'solid',
          text: n.label || '',
          fontSize: 16,
        });
      });

      (board.mindmap.edges || []).forEach((e, idx) => {
        const sourcePos = nodeMap.get(e.source);
        const targetPos = nodeMap.get(e.target);
        if (sourcePos && targetPos) {
          converted.push({
            id: `arrow_${idx}_${Date.now()}`,
            type: 'arrow',
            x: sourcePos.x + 85,
            y: sourcePos.y + 60,
            width: targetPos.x + 85 - (sourcePos.x + 85),
            height: targetPos.y - (sourcePos.y + 60),
            strokeColor: '#3b82f6',
            strokeWidth: 2,
            strokeStyle: 'solid',
            points: [
              { x: sourcePos.x + 85, y: sourcePos.y + 60 },
              { x: targetPos.x + 85, y: targetPos.y },
            ],
          });
        }
      });

      return converted;
    }

    return [];
  }, [board.whiteboard, board.mindmap]);

  const [elements, setElements] = useState<ExcalidrawElement[]>(initialElements);
  const [history, setHistory] = useState<ExcalidrawElement[][]>([initialElements]);
  const [historyIdx, setHistoryIdx] = useState(0);

  // Selection & Interactions for Excalidraw Elements
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [editingShapeId, setEditingShapeId] = useState<string | null>(null);
  const [drawingElement, setDrawingElement] = useState<ExcalidrawElement | null>(null);
  const [isDraggingShape, setIsDraggingShape] = useState(false);
  const [shapeDragOffset, setShapeDragOffset] = useState({ x: 0, y: 0 });
  // Click-vs-drag: a press becomes a MOVE only past this threshold —
  // a plain click is selection only, never a move (and never a history entry).
  const SHAPE_DRAG_THRESHOLD = 5;
  const shapeDragArmedRef = useRef(false);
  const shapeDragStartRef = useRef({ x: 0, y: 0 });
  const shapeDragMovedRef = useRef(false);
  const [resizingShapeHandle, setResizingShapeHandle] = useState<string | null>(null);
  const [shapeResizeStart, setShapeResizeStart] = useState({ x: 0, y: 0, w: 0, h: 0, elemX: 0, elemY: 0, fontSize: 18 });

  // Laser Pointer Trail
  const [laserPoints, setLaserPoints] = useState<Array<{ x: number; y: number; time: number }>>([]);

  // AI & Mermaid Dialogs
  const [isMermaidOpen, setIsMermaidOpen] = useState(false);
  const [mermaidInput, setMermaidInput] = useState('graph TD\n  Start[المهمة] --> Process[المعالجة]\n  Process --> End[الإنجاز]');
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');

  // Auto-save sync for Excalidraw elements
  const saveKeyRef = useRef<string>('');
  useEffect(() => {
    if (readOnly || !onUpdateBoard) return;
    const key = JSON.stringify([elements, frameH]);
    if (key !== saveKeyRef.current) {
      saveKeyRef.current = key;
      onUpdateBoard({
        ...board,
        whiteboard: {
          elements,
          viewBackgroundColor: '#ffffff',
          zoom,
          scrollX: pan.x,
          scrollY: pan.y,
          canvasHeight: frameH,
        },
      });
    }
  }, [elements, frameH, pan, zoom, board, onUpdateBoard, readOnly]);

  // History Push Helper
  const pushHistory = useCallback((nextElements: ExcalidrawElement[]) => {
    setElements(nextElements);
    setHistory((prev) => {
      const upToCurrent = prev.slice(0, historyIdx + 1);
      return [...upToCurrent, nextElements];
    });
    setHistoryIdx((prev) => prev + 1);
  }, [historyIdx]);

  // Fresh-elements mirror for window-level handlers (keyboard delete).
  const elementsRef = useRef(elements);
  useEffect(() => {
    elementsRef.current = elements;
  }, [elements]);
  const selectedShapeIdRef = useRef<string | null>(null);
  useEffect(() => {
    selectedShapeIdRef.current = selectedShapeId;
  }, [selectedShapeId]);

  // One-time self-heal per board: snap every stored text box to its live
  // measured box (fixes tall/wide stale frames from older estimators).
  // Silent — no history entry; autosave persists the healed dims.
  const healedBoardRef = useRef<string>('');
  useEffect(() => {
    if (readOnly) return;
    const key = board.id || '';
    if (!key || healedBoardRef.current === key) return;
    healedBoardRef.current = key;
    setElements((prev) => {
      let changed = false;
      const next = prev.map((el) => {
        if (el.type !== 'text') return el;
        const live = textRenderBox(el);
        if (Math.abs((el.width || 0) - live.w) > 2 || Math.abs((el.height || 0) - live.h) > 2) {
          changed = true;
          return { ...el, width: live.w, height: live.h };
        }
        return el;
      });
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.id, readOnly]);

  // Keyboard Delete/Backspace removes the selected shape (never while typing).
  useEffect(() => {
    if (readOnly) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const t = document.activeElement as HTMLElement | null;
      const tag = (t?.tagName || '').toLowerCase();
      if (t && (t.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select')) return;
      const selId = selectedShapeIdRef.current;
      if (!selId) return;
      e.preventDefault();
      const next = elementsRef.current.filter((el) => el.id !== selId);
      setElements(next);
      setHistory((prev) => [...prev, next]);
      setHistoryIdx((prev) => prev + 1);
      setSelectedShapeId(null);
      setEditingShapeId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [readOnly]);

  // Undo / Redo
  const handleUndo = useCallback(() => {
    if (historyIdx > 0) {
      const nextIdx = historyIdx - 1;
      setHistoryIdx(nextIdx);
      setElements(history[nextIdx]);
    }
  }, [historyIdx, history]);

  const handleRedo = useCallback(() => {
    if (historyIdx < history.length - 1) {
      const nextIdx = historyIdx + 1;
      setHistoryIdx(nextIdx);
      setElements(history[nextIdx]);
    }
  }, [historyIdx, history]);

  // Screen to Canvas Coordinates Converter
  const getCanvasPoint = useCallback((e: React.MouseEvent | MouseEvent) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    return {
      x: (screenX - pan.x) / zoom,
      y: (screenY - pan.y) / zoom,
    };
  }, [pan, zoom]);

  // Viewport Center in Canvas Coordinates
  const getViewportCenter = useCallback(() => {
    if (!containerRef.current) return { x: 300, y: 200 };
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = (-pan.x + rect.width / 2) / zoom;
    const centerY = (-pan.y + rect.height / 2) / zoom;
    return { x: Math.round(centerX - 130), y: Math.round(centerY - 90) };
  }, [pan, zoom]);

  // Add new widget (Task, Note, Comment)
  const handleAddWidget = (type: WidgetType) => {
    if (readOnly || !onUpdateBoard) return;
    const center = getViewportCenter();
    const newId = generateBoardId('w');

    let newWidget: BoardWidget;

    if (type === 'task') {
      newWidget = {
        id: newId,
        type: 'task',
        x: center.x,
        y: center.y,
        width: 260,
        height: 180,
        title: isArabic ? 'مهمة جديدة' : 'New Task',
        data: {
          status: 'todo',
          priority: 'medium',
          description: '',
        },
      };
    } else if (type === 'comment') {
      newWidget = {
        id: newId,
        type: 'comment',
        x: center.x,
        y: center.y,
        width: 240,
        height: 150,
        title: isArabic ? 'تعليق' : 'Comment',
        data: {
          text: '',
          author: isArabic ? 'مستخدم' : 'User',
          createdAt: new Date().toISOString(),
        },
      };
    } else {
      newWidget = {
        id: newId,
        type: 'note',
        x: center.x,
        y: center.y,
        width: 220,
        height: 200,
        title: isArabic ? 'فكرة' : 'Quick Note',
        data: {
          content: '',
          color: 'yellow',
        },
      };
    }

    const updatedWidgets = [...(board.widgets || []), newWidget];
    onUpdateBoard({ ...board, widgets: updatedWidgets });
    setSelectedWidgetId(newId);
    setSelectedShapeId(null);
    toast.success(isArabic ? 'تمت إضافة البطاقة' : 'Widget added');
  };

  // Update widget
  const handleUpdateWidget = (widgetId: string, data: any, title?: string) => {
    if (readOnly || !onUpdateBoard) return;
    const updatedWidgets = (board.widgets || []).map((w) => {
      if (w.id === widgetId) {
        return {
          ...w,
          data,
          title: title !== undefined ? title : w.title,
        };
      }
      return w;
    });
    onUpdateBoard({ ...board, widgets: updatedWidgets });
  };

  // Duplicate widget
  const handleDuplicateWidget = (widgetId: string) => {
    if (readOnly || !onUpdateBoard) return;
    const orig = (board.widgets || []).find((w) => w.id === widgetId);
    if (!orig) return;

    const newId = generateBoardId('w');
    const copy: BoardWidget = {
      ...orig,
      id: newId,
      x: orig.x + 28,
      y: orig.y + 28,
      title: orig.title ? `${orig.title} (نسخة)` : undefined,
      data: JSON.parse(JSON.stringify(orig.data || {})),
    };

    const updatedWidgets = [...(board.widgets || []), copy];
    onUpdateBoard({ ...board, widgets: updatedWidgets });
    setSelectedWidgetId(newId);
  };

  // Delete widget
  const handleDeleteWidget = useCallback((widgetId: string) => {
    if (readOnly || !onUpdateBoard) return;
    const updatedWidgets = (board.widgets || []).filter((w) => w.id !== widgetId);
    onUpdateBoard({ ...board, widgets: updatedWidgets });
    if (selectedWidgetId === widgetId) setSelectedWidgetId(null);
  }, [readOnly, onUpdateBoard, board, selectedWidgetId]);

  // Drag start for widget
  const handleWidgetDragStart = (e: React.MouseEvent, widgetId: string) => {
    if (readOnly) return;
    const widget = (board.widgets || []).find((w) => w.id === widgetId);
    if (!widget) return;

    setDraggingWidgetId(widgetId);
    dragOffsetRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      origX: widget.x,
      origY: widget.y,
    };
  };

  // Resize start for widget
  const handleWidgetResizeStart = (e: React.MouseEvent, widgetId: string) => {
    if (readOnly) return;
    const widget = (board.widgets || []).find((w) => w.id === widgetId);
    if (!widget) return;

    setResizingWidgetId(widgetId);
    resizeStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      origW: widget.width,
      origH: widget.height,
    };
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.code === 'Space' && !isSpacePressed) {
        setIsSpacePressed(true);
      } else if (e.key === 'v' || e.key === 'V') {
        setActiveTool('select');
      } else if (e.key === 'h' || e.key === 'H') {
        setActiveTool('hand');
      } else if (e.key === 'r' || e.key === 'R') {
        setActiveTool('rectangle');
      } else if (e.key === 'd' || e.key === 'D') {
        setActiveTool('diamond');
      } else if (e.key === 'o' || e.key === 'O') {
        setActiveTool('ellipse');
      } else if (e.key === 'a' || e.key === 'A') {
        setActiveTool('arrow');
      } else if (e.key === 'l' || e.key === 'L') {
        setActiveTool('line');
      } else if (e.key === 'p' || e.key === 'P') {
        setActiveTool('freedraw');
      } else if (e.key === 't' || e.key === 'T') {
        setActiveTool('text');
      } else if (e.key === 'n' || e.key === 'N') {
        setActiveTool('note');
      } else if (e.key === 'e' || e.key === 'E') {
        setActiveTool('eraser');
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedShapeId) {
          pushHistory(elements.filter((el) => el.id !== selectedShapeId));
          setSelectedShapeId(null);
        } else if (selectedWidgetId) {
          handleDeleteWidget(selectedWidgetId);
        }
      } else if (e.ctrlKey && e.key === 'z') {
        e.preventDefault();
        handleUndo();
      } else if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) {
        e.preventDefault();
        handleRedo();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
        setIsPanning(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isSpacePressed, selectedShapeId, selectedWidgetId, elements, pushHistory, handleUndo, handleRedo, handleDeleteWidget]);

  // Clean laser pointer trail
  useEffect(() => {
    if (laserPoints.length === 0) return;
    const interval = setInterval(() => {
      const now = Date.now();
      setLaserPoints((pts) => pts.filter((p) => now - p.time < 900));
    }, 50);
    return () => clearInterval(interval);
  }, [laserPoints]);

  // Mouse Down handler
  const handleMouseDown = (e: React.MouseEvent) => {
    if (readOnly) {
      setIsPanning(true);
      panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
      return;
    }

    if (activeTool === 'hand' || isSpacePressed || e.button === 1) {
      setIsPanning(true);
      panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
      return;
    }

    const pt = getCanvasPoint(e);

    // Laser pointer
    if (activeTool === 'laser') {
      setLaserPoints((prev) => [...prev, { x: pt.x, y: pt.y, time: Date.now() }]);
      return;
    }

    // Eraser Tool
    if (activeTool === 'eraser') {
      setIsErasing(true);
      const hit = [...elements].reverse().find((el) => hitTestElement(pt, el, 14));
      if (hit) {
        pushHistory(elements.filter((el) => el.id !== hit.id));
        if (selectedShapeId === hit.id) setSelectedShapeId(null);
      }
      return;
    }

    // Bucket Tool
    if (activeTool === 'bucket') {
      const clicked = [...elements].reverse().find((el) => hitTestElement(pt, el, 12));
      if (clicked) {
        const next = elements.map((el) =>
          el.id === clicked.id ? { ...el, backgroundColor } : el
        );
        pushHistory(next);
      }
      return;
    }

    // Select Tool: check if clicked on an existing Excalidraw element
    if (activeTool === 'select') {
      const clicked = [...elements].reverse().find((el) => hitTestElement(pt, el, 12));

      if (clicked) {
        // Self-heal: snap a stale stored text box to the live measured box
        // so frame, handles, drag and delete all match the visible letters.
        if (clicked.type === 'text') {
          const live = textRenderBox(clicked);
          if (
            Math.abs((clicked.width || 0) - live.w) > 2 ||
            Math.abs((clicked.height || 0) - live.h) > 2
          ) {
            setElements((prev) =>
              prev.map((el) => (el.id === clicked.id ? { ...el, width: live.w, height: live.h } : el))
            );
          }
        }
        setSelectedShapeId(clicked.id);
        setSelectedWidgetId(null);
        setIsDraggingShape(true);
        shapeDragArmedRef.current = false;
        shapeDragMovedRef.current = false;
        shapeDragStartRef.current = { x: e.clientX, y: e.clientY };
        setShapeDragOffset({ x: pt.x - clicked.x, y: pt.y - clicked.y });
      } else {
        setSelectedShapeId(null);
        setEditingShapeId(null);
        // Canvas background pan if dragging empty space
        setIsPanning(true);
        panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
      }
      return;
    }

    // Drawing Tools: Create new shape
    const newId = `elem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    let newElem: ExcalidrawElement;

    if (activeTool === 'rectangle') {
      newElem = {
        id: newId,
        type: 'rectangle',
        x: pt.x,
        y: pt.y,
        width: 0,
        height: 0,
        strokeColor,
        backgroundColor,
        strokeWidth,
        strokeStyle,
        fontSize,
      };
    } else if (activeTool === 'diamond') {
      newElem = {
        id: newId,
        type: 'diamond',
        x: pt.x,
        y: pt.y,
        width: 0,
        height: 0,
        strokeColor,
        backgroundColor,
        strokeWidth,
        strokeStyle,
        fontSize,
      };
    } else if (activeTool === 'ellipse') {
      newElem = {
        id: newId,
        type: 'ellipse',
        x: pt.x,
        y: pt.y,
        width: 0,
        height: 0,
        strokeColor,
        backgroundColor,
        strokeWidth,
        strokeStyle,
        fontSize,
      };
    } else if (activeTool === 'arrow') {
      newElem = {
        id: newId,
        type: 'arrow',
        x: pt.x,
        y: pt.y,
        width: 0,
        height: 0,
        strokeColor,
        strokeWidth,
        strokeStyle,
        points: [{ x: pt.x, y: pt.y }, { x: pt.x, y: pt.y }],
      };
    } else if (activeTool === 'line') {
      newElem = {
        id: newId,
        type: 'line',
        x: pt.x,
        y: pt.y,
        width: 0,
        height: 0,
        strokeColor,
        strokeWidth,
        strokeStyle,
        points: [{ x: pt.x, y: pt.y }, { x: pt.x, y: pt.y }],
      };
    } else if (activeTool === 'freedraw') {
      newElem = {
        id: newId,
        type: 'freedraw',
        x: pt.x,
        y: pt.y,
        width: 0,
        height: 0,
        strokeColor,
        strokeWidth,
        points: [{ x: pt.x, y: pt.y }],
      };
    } else if (activeTool === 'text') {
      const defaultText = isArabic ? 'نص جديد' : 'New text';
      const dims = estimateTextBounds(defaultText, fontSize || 18);
      newElem = {
        id: newId,
        type: 'text',
        x: pt.x,
        y: pt.y,
        width: dims.width,
        height: dims.height,
        strokeColor,
        text: defaultText,
        fontSize,
      };
      pushHistory([...elements, newElem]);
      setSelectedShapeId(newId);
      setEditingShapeId(newId);
      if (!isLocked) setActiveTool('select');
      return;
    } else if (activeTool === 'note') {
      newElem = {
        id: newId,
        type: 'note',
        x: pt.x,
        y: pt.y,
        width: 180,
        height: 160,
        backgroundColor: '#fff3b0',
        strokeColor: '#e0c030',
        strokeWidth: 1,
        text: isArabic ? 'ملاحظة جديدة' : 'New sticky note',
        fontSize: 16,
      };
      pushHistory([...elements, newElem]);
      setSelectedShapeId(newId);
      setEditingShapeId(newId);
      if (!isLocked) setActiveTool('select');
      return;
    } else {
      return;
    }

    setDrawingElement(newElem);
  };

  // Mouse Move handler
  const handleMouseMove = (e: React.MouseEvent) => {
    // 0. Continuous Eraser Brush
    if (isErasing && activeTool === 'eraser') {
      const pt = getCanvasPoint(e);
      const hit = [...elements].reverse().find((el) => hitTestElement(pt, el, 14));
      if (hit) {
        setElements((prev) => prev.filter((el) => el.id !== hit.id));
        if (selectedShapeId === hit.id) setSelectedShapeId(null);
      }
      return;
    }

    // 1. Moving widget
    if (draggingWidgetId) {
      const dx = (e.clientX - dragOffsetRef.current.mouseX) / zoom;
      const dy = (e.clientY - dragOffsetRef.current.mouseY) / zoom;
      const nextX = Math.round(dragOffsetRef.current.origX + dx);
      const nextY = Math.round(dragOffsetRef.current.origY + dy);

      const updated = (board.widgets || []).map((w) =>
        w.id === draggingWidgetId ? { ...w, x: nextX, y: nextY } : w
      );
      onUpdateBoard?.({ ...board, widgets: updated });
      return;
    }

    // 2. Resizing widget
    if (resizingWidgetId) {
      const widget = (board.widgets || []).find((w) => w.id === resizingWidgetId);
      const dx = (e.clientX - resizeStartRef.current.mouseX) / zoom;
      const dy = (e.clientY - resizeStartRef.current.mouseY) / zoom;
      const minW = 180;
      const minH = 100;
      const nextW = Math.max(minW, Math.round(resizeStartRef.current.origW + dx));
      const nextH = Math.max(minH, Math.round(resizeStartRef.current.origH + dy));

      const updated = (board.widgets || []).map((w) =>
        w.id === resizingWidgetId ? { ...w, width: nextW, height: nextH } : w
      );
      onUpdateBoard?.({ ...board, widgets: updated });
      return;
    }

    // 3. Panning canvas
    if (isPanning) {
      setPan({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y,
      });
      return;
    }

    const pt = getCanvasPoint(e);

    // Laser pointer trailing
    if (activeTool === 'laser' && e.buttons === 1) {
      setLaserPoints((prev) => [...prev, { x: pt.x, y: pt.y, time: Date.now() }]);
      return;
    }

    // 4. Resizing Excalidraw shape (direction-aware; text objects scale their font)
    if (resizingShapeHandle && selectedShapeId) {
      const selected = elements.find((el) => el.id === selectedShapeId);
      if (!selected) return;

      const dx = pt.x - shapeResizeStart.x;
      const dy = pt.y - shapeResizeStart.y;
      const handle = resizingShapeHandle;
      const origW = Math.max(20, shapeResizeStart.w);
      const origH = Math.max(20, shapeResizeStart.h);

      // Direction-aware box: SE grows, NW/SW/NE adjust origin too.
      let newW = origW;
      let newH = origH;
      let newX = shapeResizeStart.elemX;
      let newY = shapeResizeStart.elemY;
      if (handle.includes('e')) newW = Math.max(20, origW + dx);
      if (handle.includes('w')) {
        newW = Math.max(20, origW - dx);
        newX = shapeResizeStart.elemX + (origW - newW);
      }
      if (handle.includes('s')) newH = Math.max(20, origH + dy);
      if (handle.includes('n')) {
        newH = Math.max(20, origH - dy);
        newY = shapeResizeStart.elemY + (origH - newH);
      }

      setElements((prev) =>
        prev.map((el) => {
          if (el.id !== selectedShapeId) return el;
          // Standalone text scales its font with the box (like Excalidraw):
          // dragging smaller shrinks the letters, dragging bigger enlarges them.
          if (el.type === 'text') {
            const scale = Math.min(newW / origW, newH / origH);
            const base = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, shapeResizeStart.fontSize || el.fontSize || 18));
            const nextFont = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, Math.round(base * scale)));
            return { ...el, x: Math.round(newX), y: Math.round(newY), width: Math.round(newW), height: Math.round(newH), fontSize: nextFont };
          }
          return { ...el, x: Math.round(newX), y: Math.round(newY), width: Math.round(newW), height: Math.round(newH) };
        })
      );
      return;
    }

    // 5. Dragging selected Excalidraw shape (armed past threshold only)
    if (isDraggingShape && selectedShapeId) {
      if (!shapeDragArmedRef.current) {
        const dx0 = e.clientX - shapeDragStartRef.current.x;
        const dy0 = e.clientY - shapeDragStartRef.current.y;
        if (Math.hypot(dx0, dy0) < SHAPE_DRAG_THRESHOLD) return;
        shapeDragArmedRef.current = true;
      }
      const nextX = Math.round(pt.x - shapeDragOffset.x);
      const nextY = Math.round(pt.y - shapeDragOffset.y);

      setElements((prev) =>
        prev.map((el) => {
          if (el.id !== selectedShapeId) return el;
          if (nextX === el.x && nextY === el.y) return el;
          shapeDragMovedRef.current = true;
          if (el.type === 'arrow' || el.type === 'line' || el.type === 'freedraw') {
            const dx = nextX - el.x;
            const dy = nextY - el.y;
            const shiftedPoints = (el.points || []).map((p) => ({ x: p.x + dx, y: p.y + dy }));
            return { ...el, x: nextX, y: nextY, points: shiftedPoints };
          }
          return { ...el, x: nextX, y: nextY };
        })
      );
      return;
    }

    // 6. Drawing new Excalidraw shape
    if (drawingElement) {
      if (drawingElement.type === 'freedraw') {
        const nextPoints = [...(drawingElement.points || []), { x: pt.x, y: pt.y }];
        setDrawingElement({ ...drawingElement, points: nextPoints });
      } else if (drawingElement.type === 'arrow' || drawingElement.type === 'line') {
        const start = drawingElement.points ? drawingElement.points[0] : { x: drawingElement.x, y: drawingElement.y };
        setDrawingElement({
          ...drawingElement,
          width: pt.x - start.x,
          height: pt.y - start.y,
          points: [start, { x: pt.x, y: pt.y }],
        });
      } else {
        const w = pt.x - drawingElement.x;
        const h = pt.y - drawingElement.y;
        setDrawingElement({
          ...drawingElement,
          x: w < 0 ? pt.x : drawingElement.x,
          y: h < 0 ? pt.y : drawingElement.y,
          width: Math.abs(w),
          height: Math.abs(h),
        });
      }
    }
  };

  // Mouse Up handler
  const handleMouseUp = () => {
    if (isErasing) {
      setIsErasing(false);
      pushHistory(elements);
      return;
    }

    if (draggingWidgetId) setDraggingWidgetId(null);
    if (resizingWidgetId) setResizingWidgetId(null);

    if (isPanning) {
      setIsPanning(false);
      return;
    }

    if (isDraggingShape) {
      setIsDraggingShape(false);
      // Click without travel = selection only: no move, no history entry.
      const moved = shapeDragArmedRef.current && shapeDragMovedRef.current;
      shapeDragArmedRef.current = false;
      shapeDragMovedRef.current = false;
      if (moved) pushHistory(elements);
      return;
    }

    if (resizingShapeHandle) {
      const handle = resizingShapeHandle;
      setResizingShapeHandle(null);
      // Snap standalone text boxes tight around the letters at the final
      // font size, so the frame always hugs the text after a drag-resize.
      if (selectedShapeId) {
        const target = elements.find((el) => el.id === selectedShapeId);
        if (target && target.type === 'text') {
          const dims = estimateTextBounds(target.text || '', target.fontSize || 18);
          // Keep the dragged corner anchored: adjust origin only when the
          // user pulled a west/north handle.
          const snapped = elements.map((el) => {
            if (el.id !== selectedShapeId) return el;
            const nx = handle.includes('w') ? el.x + (el.width - dims.width) : el.x;
            const ny = handle.includes('n') ? el.y + (el.height - dims.height) : el.y;
            return { ...el, x: Math.round(nx), y: Math.round(ny), width: dims.width, height: dims.height };
          });
          pushHistory(snapped);
          return;
        }
      }
      pushHistory(elements);
      return;
    }

    if (drawingElement) {
      const minDimension = drawingElement.type === 'freedraw' ? 0 : 10;
      if (
        (drawingElement.points && drawingElement.points.length > 1) ||
        (drawingElement.width >= minDimension && drawingElement.height >= minDimension) ||
        drawingElement.type === 'arrow' ||
        drawingElement.type === 'line'
      ) {
        const finalElem = { ...drawingElement };
        pushHistory([...elements, finalElem]);
        setSelectedShapeId(finalElem.id);
      }
      setDrawingElement(null);

      if (!isLocked) {
        setActiveTool('select');
      }
    }
  };

  // Wheel Zoom handler
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const nextZoom = Math.min(3, Math.max(0.2, zoom * zoomFactor));
      setZoom(nextZoom);
    } else {
      setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
    }
  };

  // Fit View
  const handleFitView = () => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    const hasShapes = elements.length > 0;
    const hasWidgets = (board.widgets || []).length > 0;

    if (!hasShapes && !hasWidgets) {
      setPan({ x: 0, y: 0 });
      setZoom(1);
      return;
    }

    elements.forEach((el) => {
      minX = Math.min(minX, el.x);
      minY = Math.min(minY, el.y);
      maxX = Math.max(maxX, el.x + (el.width || 100));
      maxY = Math.max(maxY, el.y + (el.height || 60));
    });

    (board.widgets || []).forEach((w) => {
      minX = Math.min(minX, w.x);
      minY = Math.min(minY, w.y);
      maxX = Math.max(maxX, w.x + w.width);
      maxY = Math.max(maxY, w.y + w.height);
    });

    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const contentW = maxX - minX + 160;
      const contentH = maxY - minY + 160;
      const fitZoom = Math.min(1.5, Math.max(0.3, Math.min(rect.width / contentW, rect.height / contentH)));
      const nextPanX = rect.width / 2 - ((minX + maxX) / 2) * fitZoom;
      const nextPanY = rect.height / 2 - ((minY + maxY) / 2) * fitZoom;
      setZoom(fitZoom);
      setPan({ x: nextPanX, y: nextPanY });
    }
  };

  // Export PNG
  const handleExportPNG = async () => {
    try {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      const hasShapes = elements.length > 0;
      const hasWidgets = (board.widgets || []).length > 0;

      if (!hasShapes && !hasWidgets) {
        toast.error(isArabic ? 'اللوحة فارغة' : 'Canvas is empty');
        return;
      }

      elements.forEach((el) => {
        minX = Math.min(minX, el.x);
        minY = Math.min(minY, el.y);
        maxX = Math.max(maxX, el.x + (el.width || 100));
        maxY = Math.max(maxY, el.y + (el.height || 60));
      });

      (board.widgets || []).forEach((w) => {
        minX = Math.min(minX, w.x);
        minY = Math.min(minY, w.y);
        maxX = Math.max(maxX, w.x + w.width);
        maxY = Math.max(maxY, w.y + w.height);
      });

      const padding = 60;
      const width = Math.max(400, maxX - minX + padding * 2);
      const height = Math.max(300, maxY - minY + padding * 2);

      const canvas = document.createElement('canvas');
      canvas.width = width * 2;
      canvas.height = height * 2;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.scale(2, 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);

      // Render Excalidraw Elements
      elements.forEach((el) => {
        const x = el.x - minX + padding;
        const y = el.y - minY + padding;

        ctx.save();
        ctx.strokeStyle = el.strokeColor || '#1e1e1e';
        ctx.fillStyle = el.backgroundColor || 'transparent';
        ctx.lineWidth = el.strokeWidth || 2;
        if (el.strokeStyle === 'dashed') ctx.setLineDash([6, 6]);
        if (el.strokeStyle === 'dotted') ctx.setLineDash([2, 4]);

        if (el.type === 'rectangle' || el.type === 'note') {
          if (el.backgroundColor && el.backgroundColor !== 'transparent') {
            ctx.fillRect(x, y, el.width, el.height);
          }
          ctx.strokeRect(x, y, el.width, el.height);
        } else if (el.type === 'diamond') {
          ctx.beginPath();
          ctx.moveTo(x + el.width / 2, y);
          ctx.lineTo(x + el.width, y + el.height / 2);
          ctx.lineTo(x + el.width / 2, y + el.height);
          ctx.lineTo(x, y + el.height / 2);
          ctx.closePath();
          if (el.backgroundColor && el.backgroundColor !== 'transparent') ctx.fill();
          ctx.stroke();
        } else if (el.type === 'ellipse') {
          ctx.beginPath();
          ctx.ellipse(x + el.width / 2, y + el.height / 2, el.width / 2, el.height / 2, 0, 0, Math.PI * 2);
          if (el.backgroundColor && el.backgroundColor !== 'transparent') ctx.fill();
          ctx.stroke();
        } else if (el.type === 'arrow' && el.points && el.points.length >= 2) {
          const p1 = { x: el.points[0].x - minX + padding, y: el.points[0].y - minY + padding };
          const p2 = { x: el.points[1].x - minX + padding, y: el.points[1].y - minY + padding };
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();

          const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
          const headLen = 14;
          ctx.beginPath();
          ctx.moveTo(p2.x, p2.y);
          ctx.lineTo(p2.x - headLen * Math.cos(angle - Math.PI / 6), p2.y - headLen * Math.sin(angle - Math.PI / 6));
          ctx.lineTo(p2.x - headLen * Math.cos(angle + Math.PI / 6), p2.y - headLen * Math.sin(angle + Math.PI / 6));
          ctx.closePath();
          ctx.fillStyle = el.strokeColor || '#1e1e1e';
          ctx.fill();
        } else if (el.type === 'line' && el.points && el.points.length >= 2) {
          const p1 = { x: el.points[0].x - minX + padding, y: el.points[0].y - minY + padding };
          const p2 = { x: el.points[1].x - minX + padding, y: el.points[1].y - minY + padding };
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        } else if (el.type === 'freedraw' && el.points && el.points.length > 0) {
          ctx.beginPath();
          el.points.forEach((p, i) => {
            const px = p.x - minX + padding;
            const py = p.y - minY + padding;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          });
          ctx.stroke();
        }

        if (el.text) {
          ctx.fillStyle = el.strokeColor || '#1e1e1e';
          const fontSize = el.fontSize || 16;
          ctx.font = `600 ${fontSize}px "IBM Plex Sans Arabic", sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const paragraphs = String(el.text).split('\n');
          const lines: string[] = [];
          for (const para of paragraphs) {
            if (!para.trim()) { lines.push(''); continue; }
            const words = para.split(/\s+/);
            let line = '';
            for (const word of words) {
              const testLine = line ? `${line} ${word}` : word;
              if (ctx.measureText(testLine).width > Math.max(80, el.width - 16) && line) {
                lines.push(line);
                line = word;
              } else {
                line = testLine;
              }
            }
            if (line) lines.push(line);
          }
          const lineHeight = fontSize * 1.3;
          const totalTextH = lines.length * lineHeight;
          const startY = y + el.height / 2 - totalTextH / 2 + lineHeight / 2;
          lines.forEach((tLine, idx) => {
            ctx.fillText(tLine, x + el.width / 2, startY + idx * lineHeight);
          });
        }

        ctx.restore();
      });

      // Helper: wrap text into multiple lines given maxWidth
      const wrapCanvasText = (context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
        if (!text) return [];
        const resultLines: string[] = [];
        const paragraphs = String(text).split('\n');
        for (const para of paragraphs) {
          if (!para.trim()) {
            resultLines.push('');
            continue;
          }
          const words = para.split(/\s+/);
          let currentLine = '';
          for (const word of words) {
            const testLine = currentLine ? `${currentLine} ${word}` : word;
            if (context.measureText(testLine).width > maxWidth && currentLine) {
              resultLines.push(currentLine);
              currentLine = word;
            } else {
              currentLine = testLine;
            }
          }
          if (currentLine) resultLines.push(currentLine);
        }
        return resultLines;
      };

      // Helper: draw rounded rectangle
      const drawRoundRect = (
        context: CanvasRenderingContext2D,
        rx: number,
        ry: number,
        rw: number,
        rh: number,
        radius: number
      ) => {
        context.beginPath();
        context.moveTo(rx + radius, ry);
        context.lineTo(rx + rw - radius, ry);
        context.quadraticCurveTo(rx + rw, ry, rx + rw, ry + radius);
        context.lineTo(rx + rw, ry + rh - radius);
        context.quadraticCurveTo(rx + rw, ry + rh, rx + rw - radius, ry + rh);
        context.lineTo(rx + radius, ry + rh);
        context.quadraticCurveTo(rx, ry + rh, rx, ry + rh - radius);
        context.lineTo(rx, ry + radius);
        context.quadraticCurveTo(rx, ry, rx + radius, ry);
        context.closePath();
      };

      // Render Widgets faithfully as rich informative cards
      (board.widgets || []).forEach((w) => {
        const x = w.x - minX + padding;
        const y = w.y - minY + padding;
        const data = (w.data || {}) as any;

        ctx.save();

        if (w.type === 'task') {
          // Card background with rounded corners
          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = '#cbd5e1';
          ctx.lineWidth = 1.5;
          drawRoundRect(ctx, x, y, w.width, w.height, 8);
          ctx.fill();
          ctx.stroke();

          // Top status accent stripe
          ctx.fillStyle = data.status === 'done' ? '#22c55e' : data.status === 'in-progress' ? '#3b82f6' : '#94a3b8';
          ctx.fillRect(x + 4, y, w.width - 8, 4);

          let curY = y + 14;
          const contentLeft = x + 12;
          const contentRight = x + w.width - 12;
          const maxTextW = w.width - 24;

          // Status Badge
          const statusText = data.status === 'done'
            ? (isArabic ? 'مكتمل' : 'Done')
            : data.status === 'in-progress'
            ? (isArabic ? 'قيد التنفيذ' : 'In Progress')
            : (isArabic ? 'قيد الانتظار' : 'To Do');
          const statusBg = data.status === 'done' ? '#dcfce7' : data.status === 'in-progress' ? '#dbeafe' : '#f1f5f9';
          const statusFg = data.status === 'done' ? '#15803d' : data.status === 'in-progress' ? '#1d4ed8' : '#475569';

          ctx.font = 'bold 10px "IBM Plex Sans Arabic", sans-serif';
          const statusW = ctx.measureText(statusText).width + 12;

          const badgeX = isArabic ? contentRight - statusW : contentLeft;
          ctx.fillStyle = statusBg;
          drawRoundRect(ctx, badgeX, curY, statusW, 18, 4);
          ctx.fill();
          ctx.fillStyle = statusFg;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(statusText, badgeX + statusW / 2, curY + 9);

          // Priority Badge
          if (data.priority) {
            const prioLabel = data.priority === 'urgent'
              ? (isArabic ? 'عاجل' : 'Urgent')
              : data.priority === 'high'
              ? (isArabic ? 'مرتفع' : 'High')
              : data.priority === 'medium'
              ? (isArabic ? 'متوسط' : 'Medium')
              : (isArabic ? 'منخفض' : 'Low');
            const prioBg = (data.priority === 'urgent' || data.priority === 'high') ? '#fee2e2' : data.priority === 'medium' ? '#fef9c3' : '#f1f5f9';
            const prioFg = (data.priority === 'urgent' || data.priority === 'high') ? '#b91c1c' : data.priority === 'medium' ? '#a16207' : '#64748b';
            const prioW = ctx.measureText(prioLabel).width + 12;
            const prioX = isArabic ? badgeX - prioW - 6 : badgeX + statusW + 6;
            ctx.fillStyle = prioBg;
            drawRoundRect(ctx, prioX, curY, prioW, 18, 4);
            ctx.fill();
            ctx.fillStyle = prioFg;
            ctx.fillText(prioLabel, prioX + prioW / 2, curY + 9);
          }

          curY += 24;

          // Title
          ctx.fillStyle = '#0f172a';
          ctx.font = 'bold 13px "IBM Plex Sans Arabic", sans-serif';
          ctx.textAlign = isArabic ? 'right' : 'left';
          ctx.textBaseline = 'top';
          const titleText = w.title || (isArabic ? 'مهمة' : 'Task');
          const titleLines = wrapCanvasText(ctx, titleText, maxTextW);
          titleLines.slice(0, 2).forEach((tl) => {
            ctx.fillText(tl, isArabic ? contentRight : contentLeft, curY);
            curY += 18;
          });

          // Meta line (Assignee / Due date)
          const metaParts: string[] = [];
          if (data.assigneeName) metaParts.push(`👤 ${data.assigneeName}`);
          if (data.dueDate) metaParts.push(`📅 ${data.dueDate}`);
          if (metaParts.length > 0) {
            curY += 2;
            ctx.font = '11px "IBM Plex Sans Arabic", sans-serif';
            ctx.fillStyle = '#64748b';
            ctx.fillText(metaParts.join('  •  '), isArabic ? contentRight : contentLeft, curY);
            curY += 18;
          }

          // Description (multiline wrapped text)
          if (data.description && curY < y + w.height - 16) {
            curY += 4;
            ctx.strokeStyle = '#f1f5f9';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(contentLeft, curY);
            ctx.lineTo(contentRight, curY);
            ctx.stroke();
            curY += 6;

            ctx.font = '11px "IBM Plex Sans Arabic", sans-serif';
            ctx.fillStyle = '#334155';
            const descLines = wrapCanvasText(ctx, data.description, maxTextW);
            const maxDescLines = Math.max(1, Math.floor((y + w.height - curY - 8) / 16));
            descLines.slice(0, maxDescLines).forEach((dl) => {
              ctx.fillText(dl, isArabic ? contentRight : contentLeft, curY);
              curY += 16;
            });
          }
        } else if (w.type === 'note') {
          const noteColor = data.color || 'yellow';
          let noteBg = '#fef9c3';
          let noteBorder = '#fde047';
          if (noteColor === 'blue') { noteBg = '#e0f2fe'; noteBorder = '#7dd3fc'; }
          else if (noteColor === 'green') { noteBg = '#dcfce7'; noteBorder = '#86efac'; }
          else if (noteColor === 'pink') { noteBg = '#fce7f3'; noteBorder = '#f472b6'; }
          else if (noteColor === 'purple') { noteBg = '#f3e8ff'; noteBorder = '#d8b4fe'; }

          ctx.fillStyle = noteBg;
          ctx.strokeStyle = noteBorder;
          ctx.lineWidth = 1.5;
          drawRoundRect(ctx, x, y, w.width, w.height, 8);
          ctx.fill();
          ctx.stroke();

          let curY = y + 12;
          const contentLeft = x + 12;
          const contentRight = x + w.width - 12;
          const maxTextW = w.width - 24;

          if (w.title) {
            ctx.fillStyle = '#1e293b';
            ctx.font = 'bold 13px "IBM Plex Sans Arabic", sans-serif';
            ctx.textAlign = isArabic ? 'right' : 'left';
            ctx.textBaseline = 'top';
            const titleLines = wrapCanvasText(ctx, w.title, maxTextW);
            titleLines.slice(0, 2).forEach((tl) => {
              ctx.fillText(tl, isArabic ? contentRight : contentLeft, curY);
              curY += 18;
            });
            curY += 4;
          }

          const content = data.content || '';
          if (content) {
            ctx.fillStyle = '#334155';
            ctx.font = '12px "IBM Plex Sans Arabic", sans-serif';
            ctx.textAlign = isArabic ? 'right' : 'left';
            ctx.textBaseline = 'top';
            const bodyLines = wrapCanvasText(ctx, content, maxTextW);
            const maxBodyLines = Math.max(1, Math.floor((y + w.height - curY - 8) / 18));
            bodyLines.slice(0, maxBodyLines).forEach((bl) => {
              ctx.fillText(bl, isArabic ? contentRight : contentLeft, curY);
              curY += 18;
            });
          }
        } else if (w.type === 'comment') {
          ctx.fillStyle = '#f8fafc';
          ctx.strokeStyle = '#cbd5e1';
          ctx.lineWidth = 1.5;
          drawRoundRect(ctx, x, y, w.width, w.height, 8);
          ctx.fill();
          ctx.stroke();

          let curY = y + 12;
          const contentLeft = x + 12;
          const contentRight = x + w.width - 12;
          const maxTextW = w.width - 24;

          ctx.fillStyle = '#0f172a';
          ctx.font = 'bold 12px "IBM Plex Sans Arabic", sans-serif';
          ctx.textAlign = isArabic ? 'right' : 'left';
          ctx.textBaseline = 'top';
          const author = data.author || (isArabic ? 'مستخدم' : 'User');
          ctx.fillText(author, isArabic ? contentRight : contentLeft, curY);
          curY += 18;

          if (data.text) {
            ctx.fillStyle = '#334155';
            ctx.font = '12px "IBM Plex Sans Arabic", sans-serif';
            const textLines = wrapCanvasText(ctx, data.text, maxTextW);
            const maxLines = Math.max(1, Math.floor((y + w.height - curY - 8) / 18));
            textLines.slice(0, maxLines).forEach((tl) => {
              ctx.fillText(tl, isArabic ? contentRight : contentLeft, curY);
              curY += 18;
            });
          }
        } else {
          ctx.fillStyle = '#f8fafc';
          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = 1.5;
          drawRoundRect(ctx, x, y, w.width, w.height, 8);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#1e293b';
          ctx.font = 'bold 13px "IBM Plex Sans Arabic", sans-serif';
          ctx.textAlign = isArabic ? 'right' : 'left';
          ctx.textBaseline = 'top';
          ctx.fillText(w.title || 'Widget', isArabic ? x + w.width - 12 : x + 12, y + 12);
        }

        ctx.restore();
      });

      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `${board.title || 'board'}.png`;
      a.click();
      toast.success(isArabic ? 'تم تصدير الصورة بنجاح' : 'Image exported');
    } catch (err) {
      console.error(err);
      toast.error(isArabic ? 'فشل التصدير' : 'Export failed');
    }
  };

  // Image Upload handler
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const center = getViewportCenter();
      const newElem: ExcalidrawElement = {
        id: `img_${Date.now()}`,
        type: 'image',
        x: center.x,
        y: center.y,
        width: 280,
        height: 180,
        imageData: dataUrl,
      };
      pushHistory([...elements, newElem]);
      setSelectedShapeId(newElem.id);
      toast.success(isArabic ? 'تم إدراج الصورة' : 'Image inserted');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Mermaid to Excalidraw parser
  const handleMermaidParse = () => {
    try {
      const lines = mermaidInput.split('\n');
      const nodes: Array<{ id: string; label: string }> = [];
      const edges: Array<{ from: string; to: string }> = [];

      lines.forEach((line) => {
        const arrowMatch = line.match(/([a-zA-Z0-9_]+)(\[.*?\])?\s*-->\s*([a-zA-Z0-9_]+)(\[.*?\])?/);
        if (arrowMatch) {
          const fromId = arrowMatch[1];
          const fromLabel = arrowMatch[2] ? arrowMatch[2].slice(1, -1) : fromId;
          const toId = arrowMatch[3];
          const toLabel = arrowMatch[4] ? arrowMatch[4].slice(1, -1) : toId;

          if (!nodes.find((n) => n.id === fromId)) nodes.push({ id: fromId, label: fromLabel });
          if (!nodes.find((n) => n.id === toId)) nodes.push({ id: toId, label: toLabel });
          edges.push({ from: fromId, to: toId });
        }
      });

      if (nodes.length === 0) {
        toast.error(isArabic ? 'لم يتم العثور على علاقات صالحة في كود Mermaid' : 'No valid nodes found in Mermaid code');
        return;
      }

      const newElems: ExcalidrawElement[] = [];
      const posMap = new Map<string, { x: number; y: number }>();
      const startX = -pan.x / zoom + 150;
      const startY = -pan.y / zoom + 100;

      nodes.forEach((n, i) => {
        const x = startX + (i % 3) * 240;
        const y = startY + Math.floor(i / 3) * 140;
        posMap.set(n.id, { x, y });

        newElems.push({
          id: `m_${n.id}_${Date.now()}`,
          type: 'rectangle',
          x,
          y,
          width: 170,
          height: 60,
          strokeColor: '#1971c2',
          backgroundColor: '#e7f5ff',
          strokeWidth: 2,
          strokeStyle: 'solid',
          text: n.label,
          fontSize: 16,
        });
      });

      edges.forEach((e) => {
        const p1 = posMap.get(e.from);
        const p2 = posMap.get(e.to);
        if (p1 && p2) {
          newElems.push({
            id: `edge_${e.from}_${e.to}_${Date.now()}`,
            type: 'arrow',
            x: p1.x + 85,
            y: p1.y + 60,
            width: p2.x + 85 - (p1.x + 85),
            height: p2.y - (p1.y + 60),
            strokeColor: '#3b82f6',
            strokeWidth: 2,
            points: [
              { x: p1.x + 85, y: p1.y + 60 },
              { x: p2.x + 85, y: p2.y },
            ],
          });
        }
      });

      pushHistory([...elements, ...newElems]);
      setIsMermaidOpen(false);
      toast.success(isArabic ? 'تم استيراد مخطط Mermaid بنجاح' : 'Mermaid diagram imported');
    } catch {
      toast.error(isArabic ? 'خطأ في معالجة كود Mermaid' : 'Error parsing Mermaid code');
    }
  };

  // AI Text to Diagram generator
  const handleAiGenerate = () => {
    if (!aiPrompt.trim()) return;
    const startX = -pan.x / zoom + 160;
    const startY = -pan.y / zoom + 120;

    const steps = [
      isArabic ? `البداية: ${aiPrompt}` : `Start: ${aiPrompt}`,
      isArabic ? 'تحليل ومعالجة البيانات' : 'Analyze & Process Data',
      isArabic ? 'التحقق واتخاذ القرار' : 'Verification & Decision',
      isArabic ? 'إتمام المخرجات والتقرير' : 'Final Outputs & Report',
    ];

    const newElems: ExcalidrawElement[] = [];

    steps.forEach((step, idx) => {
      const x = startX + idx * 230;
      const y = startY + (idx % 2 === 1 ? 50 : 0);

      newElems.push({
        id: `ai_${Date.now()}_${idx}`,
        type: idx === 2 ? 'diamond' : 'rectangle',
        x,
        y,
        width: idx === 2 ? 160 : 180,
        height: idx === 2 ? 90 : 64,
        strokeColor: idx === 0 ? '#1971c2' : idx === 2 ? '#f08c00' : '#2f9e44',
        backgroundColor: idx === 0 ? '#e7f5ff' : idx === 2 ? '#fff9db' : '#ebfbee',
        strokeWidth: 2,
        text: step,
        fontSize: 14,
      });

      if (idx > 0) {
        const prevX = startX + (idx - 1) * 230 + (idx - 1 === 2 ? 160 : 180);
        const prevY = startY + ((idx - 1) % 2 === 1 ? 50 : 0) + 32;
        newElems.push({
          id: `ai_edge_${idx}_${Date.now()}`,
          type: 'arrow',
          x: prevX,
          y: prevY,
          width: x - prevX,
          height: y + 32 - prevY,
          strokeColor: '#3b82f6',
          strokeWidth: 2,
          points: [
            { x: prevX, y: prevY },
            { x, y: y + 32 },
          ],
        });
      }
    });

    pushHistory([...elements, ...newElems]);
    setIsAiOpen(false);
    setAiPrompt('');
    toast.success(isArabic ? 'تم توليد المخطط بالذكاء الاصطناعي' : 'Diagram generated with AI');
  };

  const selectedElement = elements.find((el) => el.id === selectedShapeId);

  // Frame-height drag (bottom-edge grip): press + drag vertically with the
  // mouse. Width always stays full — only the length changes.
  const onFrameGripDown = (e: React.PointerEvent) => {
    if (readOnly) return;
    e.stopPropagation();
    e.preventDefault();
    try {
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch {}
    const startH = frameH ?? containerRef.current?.clientHeight ?? 600;
    frameDragRef.current = { startY: e.clientY, startH };
    setFrameDragging(true);
  };
  const onFrameGripMove = (e: React.PointerEvent) => {
    const s = frameDragRef.current;
    if (!s) return;
    e.stopPropagation();
    setFrameH(Math.max(MIN_FRAME_H, Math.min(MAX_FRAME_H, Math.round(s.startH + (e.clientY - s.startY)))));
  };
  const endFrameDrag = (e: React.PointerEvent) => {
    if (!frameDragRef.current) return;
    e.stopPropagation();
    frameDragRef.current = null;
    setFrameDragging(false);
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
      className={cn(
        frameH != null
          ? 'relative flex-none w-full overflow-hidden select-none bg-[#fdfdfd] dark:bg-[#121212]'
          : 'relative flex-1 w-full h-full overflow-hidden select-none bg-[#fdfdfd] dark:bg-[#121212]',
        activeTool === 'hand' || isSpacePressed ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') :
        activeTool === 'freedraw' ? 'cursor-crosshair' :
        activeTool === 'eraser' ? 'cursor-cell' :
        activeTool === 'text' ? 'cursor-text' :
        activeTool !== 'select' ? 'cursor-crosshair' : 'cursor-default'
      )}
      style={{
        ...(frameH != null ? { height: `${frameH}px` } : {}),
        backgroundImage: `radial-gradient(circle, currentColor 1px, transparent 1px)`,
        backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
        backgroundPosition: `${pan.x}px ${pan.y}px`,
        color: 'rgba(150, 150, 150, 0.16)',
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageUpload}
        className="hidden"
      />

      {/* TOP FLOATING EXCALIDRAW TOOLBAR (Directly in the task board) */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center select-none pointer-events-auto">
        <div
          dir="ltr"
          className="flex items-center gap-1 p-1 rounded-2xl border border-neutral-200/90 dark:border-neutral-800/90 bg-white/95 dark:bg-neutral-900/95 shadow-xl backdrop-blur-md"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* 1. Lock Tool */}
          <button
            type="button"
            onClick={() => setIsLocked(!isLocked)}
            className={cn(
              'relative flex items-center justify-center w-9 h-9 rounded-xl text-neutral-700 dark:text-neutral-200 transition-colors',
              isLocked
                ? 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300 font-bold'
                : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
            )}
            title={isLocked ? 'Keep selected tool active (Locked)' : 'Lock tool'}
          >
            {isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4 opacity-75" />}
          </button>

          <span className="h-5 w-px bg-neutral-200 dark:bg-neutral-800 mx-0.5" />

          {/* 2. Hand (Pan) */}
          <button
            type="button"
            onClick={() => setActiveTool('hand')}
            className={cn(
              'relative flex items-center justify-center w-9 h-9 rounded-xl transition-colors',
              activeTool === 'hand'
                ? 'bg-[#e0dfff] text-[#5e54d8] dark:bg-violet-950 dark:text-violet-300 font-bold'
                : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            )}
            title="Hand (panning tool) — H"
          >
            <Hand className="w-4 h-4" />
          </button>

          {/* 3. Selection (V) */}
          <button
            type="button"
            onClick={() => setActiveTool('select')}
            className={cn(
              'relative flex items-center justify-center w-9 h-9 rounded-xl transition-colors',
              activeTool === 'select'
                ? 'bg-[#e0dfff] text-[#5e54d8] dark:bg-violet-950 dark:text-violet-300 font-bold'
                : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            )}
            title="Selection — V"
          >
            <MousePointer2 className="w-4 h-4" />
            <span className="absolute bottom-0.5 end-1 text-[9px] font-mono leading-none opacity-60">V</span>
          </button>

          {/* 4. Rectangle (R) */}
          <button
            type="button"
            onClick={() => setActiveTool('rectangle')}
            className={cn(
              'relative flex items-center justify-center w-9 h-9 rounded-xl transition-colors',
              activeTool === 'rectangle'
                ? 'bg-[#e0dfff] text-[#5e54d8] dark:bg-violet-950 dark:text-violet-300 font-bold'
                : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            )}
            title="Rectangle — R"
          >
            <Square className="w-4 h-4" />
            <span className="absolute bottom-0.5 end-1 text-[9px] font-mono leading-none opacity-60">R</span>
          </button>

          {/* 5. Diamond (D) */}
          <button
            type="button"
            onClick={() => setActiveTool('diamond')}
            className={cn(
              'relative flex items-center justify-center w-9 h-9 rounded-xl transition-colors',
              activeTool === 'diamond'
                ? 'bg-[#e0dfff] text-[#5e54d8] dark:bg-violet-950 dark:text-violet-300 font-bold'
                : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            )}
            title="Diamond — D"
          >
            <Diamond className="w-4 h-4" />
            <span className="absolute bottom-0.5 end-1 text-[9px] font-mono leading-none opacity-60">D</span>
          </button>

          {/* 6. Ellipse (O) */}
          <button
            type="button"
            onClick={() => setActiveTool('ellipse')}
            className={cn(
              'relative flex items-center justify-center w-9 h-9 rounded-xl transition-colors',
              activeTool === 'ellipse'
                ? 'bg-[#e0dfff] text-[#5e54d8] dark:bg-violet-950 dark:text-violet-300 font-bold'
                : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            )}
            title="Ellipse — O"
          >
            <Circle className="w-4 h-4" />
            <span className="absolute bottom-0.5 end-1 text-[9px] font-mono leading-none opacity-60">O</span>
          </button>

          {/* 7. Arrow (A) */}
          <button
            type="button"
            onClick={() => setActiveTool('arrow')}
            className={cn(
              'relative flex items-center justify-center w-9 h-9 rounded-xl transition-colors',
              activeTool === 'arrow'
                ? 'bg-[#e0dfff] text-[#5e54d8] dark:bg-violet-950 dark:text-violet-300 font-bold'
                : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            )}
            title="Arrow — A"
          >
            <MoveRight className="w-4 h-4" />
            <span className="absolute bottom-0.5 end-1 text-[9px] font-mono leading-none opacity-60">A</span>
          </button>

          {/* 8. Line (L) */}
          <button
            type="button"
            onClick={() => setActiveTool('line')}
            className={cn(
              'relative flex items-center justify-center w-9 h-9 rounded-xl transition-colors',
              activeTool === 'line'
                ? 'bg-[#e0dfff] text-[#5e54d8] dark:bg-violet-950 dark:text-violet-300 font-bold'
                : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            )}
            title="Line — L"
          >
            <Minus className="w-4 h-4" />
            <span className="absolute bottom-0.5 end-1 text-[9px] font-mono leading-none opacity-60">L</span>
          </button>

          {/* 9. Draw / Pen (P) */}
          <button
            type="button"
            onClick={() => setActiveTool('freedraw')}
            className={cn(
              'relative flex items-center justify-center w-9 h-9 rounded-xl transition-colors',
              activeTool === 'freedraw'
                ? 'bg-[#e0dfff] text-[#5e54d8] dark:bg-violet-950 dark:text-violet-300 font-bold'
                : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            )}
            title="Draw — P"
          >
            <Pencil className="w-4 h-4" />
            <span className="absolute bottom-0.5 end-1 text-[9px] font-mono leading-none opacity-60">P</span>
          </button>

          {/* 10. Text (T) */}
          <button
            type="button"
            onClick={() => setActiveTool('text')}
            className={cn(
              'relative flex items-center justify-center w-9 h-9 rounded-xl transition-colors',
              activeTool === 'text'
                ? 'bg-[#e0dfff] text-[#5e54d8] dark:bg-violet-950 dark:text-violet-300 font-bold'
                : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            )}
            title="Text — T"
          >
            <Type className="w-4 h-4" />
            <span className="absolute bottom-0.5 end-1 text-[9px] font-mono leading-none opacity-60">T</span>
          </button>

          {/* 11. Note (N) */}
          <button
            type="button"
            onClick={() => setActiveTool('note')}
            className={cn(
              'relative flex items-center justify-center w-9 h-9 rounded-xl transition-colors',
              activeTool === 'note'
                ? 'bg-[#e0dfff] text-[#5e54d8] dark:bg-violet-950 dark:text-violet-300 font-bold'
                : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            )}
            title="Note — N"
          >
            <StickyNote className="w-4 h-4" />
            <span className="absolute bottom-0.5 end-1 text-[9px] font-mono leading-none opacity-60">N</span>
          </button>

          {/* 12. Eraser (E) */}
          <button
            type="button"
            onClick={() => setActiveTool('eraser')}
            className={cn(
              'relative flex items-center justify-center w-9 h-9 rounded-xl transition-colors',
              activeTool === 'eraser'
                ? 'bg-[#e0dfff] text-[#5e54d8] dark:bg-violet-950 dark:text-violet-300 font-bold'
                : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            )}
            title="Eraser — E"
          >
            <Eraser className="w-4 h-4" />
            <span className="absolute bottom-0.5 end-1 text-[9px] font-mono leading-none opacity-60">E</span>
          </button>

          {/* 13. Three Dots Dropdown Menu (Exact replica of user screenshot) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center justify-center w-8 h-9 rounded-xl text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                title="More tools"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 text-xs p-1.5 font-medium shadow-2xl rounded-xl">
              <DropdownMenuItem onClick={() => fileInputRef.current?.click()} className="flex items-center justify-between py-1.5 cursor-pointer">
                <div className="flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 opacity-75" />
                  <span>Insert image</span>
                </div>
                <span className="text-[11px] text-muted-foreground font-mono">9</span>
              </DropdownMenuItem>

              <DropdownMenuItem onClick={() => setActiveTool('rectangle')} className="flex items-center justify-between py-1.5 cursor-pointer">
                <div className="flex items-center gap-2">
                  <Frame className="w-4 h-4 opacity-75" />
                  <span>Frame tool</span>
                </div>
                <span className="text-[11px] text-muted-foreground font-mono">F</span>
              </DropdownMenuItem>

              <DropdownMenuItem onClick={() => toast.info('Web Embed')} className="flex items-center justify-between py-1.5 cursor-pointer">
                <div className="flex items-center gap-2">
                  <Code2 className="w-4 h-4 opacity-75" />
                  <span>Web Embed</span>
                </div>
              </DropdownMenuItem>

              <DropdownMenuItem onClick={() => setActiveTool('freedraw')} className="flex items-center justify-between py-1.5 cursor-pointer">
                <div className="flex items-center gap-2">
                  <Shapes className="w-4 h-4 opacity-75" />
                  <span>Draw to shape</span>
                </div>
                <span className="text-[11px] text-muted-foreground font-mono">Shift+X</span>
              </DropdownMenuItem>

              <DropdownMenuItem onClick={() => setActiveTool('laser')} className="flex items-center justify-between py-1.5 cursor-pointer">
                <div className="flex items-center gap-2">
                  <Wand2 className="w-4 h-4 text-red-500" />
                  <span>Laser pointer</span>
                </div>
                <span className="text-[11px] text-muted-foreground font-mono">K</span>
              </DropdownMenuItem>

              <DropdownMenuItem onClick={() => setActiveTool('bucket')} className="flex items-center justify-between py-1.5 cursor-pointer">
                <div className="flex items-center gap-2">
                  <PaintBucket className="w-4 h-4 opacity-75" />
                  <span>Bucket fill</span>
                </div>
                <span className="text-[11px] text-muted-foreground font-mono">B</span>
              </DropdownMenuItem>

              <DropdownMenuItem onClick={() => setActiveTool('select')} className="flex items-center justify-between py-1.5 cursor-pointer">
                <div className="flex items-center gap-2">
                  <Lasso className="w-4 h-4 opacity-75" />
                  <span>Lasso selection</span>
                </div>
              </DropdownMenuItem>

              <DropdownMenuSeparator className="my-1" />

              <DropdownMenuLabel className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider px-2 py-1">
                Generate
              </DropdownMenuLabel>

              <DropdownMenuItem onClick={() => setIsAiOpen(true)} className="flex items-center justify-between py-1.5 cursor-pointer">
                <div className="flex items-center gap-2">
                  <Brain className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                  <span>Text to diagram</span>
                </div>
                <span className="px-1.5 py-0.5 rounded bg-violet-600 text-white text-[9px] font-bold">AI</span>
              </DropdownMenuItem>

              <DropdownMenuItem onClick={() => setIsMermaidOpen(true)} className="flex items-center justify-between py-1.5 cursor-pointer">
                <div className="flex items-center gap-2">
                  <GitFork className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Mermaid to Excalidraw</span>
                </div>
              </DropdownMenuItem>

              <DropdownMenuItem onClick={() => toast.info('Wireframe to code: Export ready')} className="flex items-center justify-between py-1.5 cursor-pointer">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                  <span>Wireframe to code</span>
                </div>
                <span className="px-1.5 py-0.5 rounded bg-violet-600 text-white text-[9px] font-bold">AI</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Direct Task, Note, Comment & Pomodoro */}
          {!readOnly && (
            <>
              <span className="h-5 w-px bg-neutral-200 dark:bg-neutral-800 mx-0.5" />
              <button
                type="button"
                onClick={() => handleAddWidget('task')}
                className="flex items-center gap-1.5 px-2.5 h-8 rounded-xl text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 text-xs font-semibold transition-colors"
                title={isArabic ? 'إضافة بطاقة مهمة' : 'Add Task Card'}
              >
                <CheckSquare className="w-4 h-4" />
                <span>{isArabic ? 'مهمة' : 'Task'}</span>
              </button>

              <button
                type="button"
                onClick={() => handleAddWidget('note')}
                className="flex items-center gap-1.5 px-2.5 h-8 rounded-xl text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-xs font-semibold transition-colors"
                title={isArabic ? 'إضافة ملاحظة لاصقة' : 'Add Sticky Note'}
              >
                <StickyNote className="w-4 h-4" />
                <span>{isArabic ? 'ملاحظة' : 'Note'}</span>
              </button>

              <button
                type="button"
                onClick={() => handleAddWidget('comment')}
                className="flex items-center gap-1.5 px-2.5 h-8 rounded-xl text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-xs font-semibold transition-colors"
                title={isArabic ? 'إضافة بطاقة تعليق' : 'Add Comment Card'}
              >
                <MessageSquare className="w-4 h-4" />
                <span>{isArabic ? 'تعليق' : 'Comment'}</span>
              </button>

              <span className="h-5 w-px bg-neutral-200 dark:bg-neutral-800 mx-0.5" />
              <button
                type="button"
                onClick={() => {
                  if (activeTask) {
                    toggleTimer();
                  } else {
                    startTaskPomodoro('board-canvas', isArabic ? 'جلسة تركيز اللوحة' : 'Board Focus Session');
                  }
                }}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 h-8 rounded-xl text-xs font-semibold transition-colors",
                  isRunning
                    ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 animate-pulse font-bold"
                    : "text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                )}
                title={isArabic ? 'مؤقت بومودورو للتركيز' : 'Pomodoro Focus Timer'}
              >
                <span>🍅</span>
                <span>{isRunning ? (isArabic ? 'بومودورو شغال' : 'Running') : (isArabic ? 'بومودورو' : 'Pomodoro')}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* FLOATING CONTEXTUAL PROPERTY PANEL (When an Excalidraw element is selected) */}
      {selectedElement && !readOnly && (
        <div
          dir="ltr"
          className="absolute top-20 start-4 z-40 p-2.5 rounded-2xl border border-border/80 bg-card/95 backdrop-blur-md shadow-2xl flex flex-col gap-2.5 select-none animate-in fade-in zoom-in-95 duration-150 text-xs w-52"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider flex items-center justify-between">
            <span>Properties</span>
            <button
              type="button"
              onClick={() => setSelectedShapeId(null)}
              className="p-0.5 rounded hover:bg-muted text-muted-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Stroke Color */}
          <div>
            <div className="text-[11px] text-muted-foreground mb-1">Stroke color</div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {STROKE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setStrokeColor(c);
                    pushHistory(elements.map((el) => (el.id === selectedShapeId ? { ...el, strokeColor: c } : el)));
                  }}
                  style={{ backgroundColor: c }}
                  className={cn(
                    'w-5 h-5 rounded-full border border-black/20 dark:border-white/20 transition-transform hover:scale-115',
                    selectedElement.strokeColor === c && 'ring-2 ring-primary ring-offset-1'
                  )}
                />
              ))}
            </div>
          </div>

          {/* Background Fill */}
          <div>
            <div className="text-[11px] text-muted-foreground mb-1">Background fill</div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {FILL_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setBackgroundColor(c);
                    pushHistory(elements.map((el) => (el.id === selectedShapeId ? { ...el, backgroundColor: c } : el)));
                  }}
                  style={{ backgroundColor: c === 'transparent' ? '#ffffff' : c }}
                  className={cn(
                    'w-5 h-5 rounded-md border border-neutral-300 dark:border-neutral-700 transition-transform hover:scale-115 flex items-center justify-center text-[9px]',
                    selectedElement.backgroundColor === c && 'ring-2 ring-primary ring-offset-1'
                  )}
                  title={c}
                >
                  {c === 'transparent' && '✕'}
                </button>
              ))}
            </div>
          </div>

          {/* Stroke Width */}
          <div>
            <div className="text-[11px] text-muted-foreground mb-1">Stroke width</div>
            <div className="flex items-center gap-1">
              {[1, 2, 4].map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => {
                    setStrokeWidth(w);
                    pushHistory(elements.map((el) => (el.id === selectedShapeId ? { ...el, strokeWidth: w } : el)));
                  }}
                  className={cn(
                    'flex-1 py-1 rounded-md border border-border text-[11px] font-semibold transition-colors',
                    selectedElement.strokeWidth === w ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                  )}
                >
                  {w === 1 ? 'Thin' : w === 2 ? 'Med' : 'Thick'}
                </button>
              ))}
            </div>
          </div>

          {/* Font Size — drag the slider (mouse) to grow/shrink the letters */}
          {elementHasText(selectedElement.type) && (
            <div>
              <div className="text-[11px] text-muted-foreground mb-1 flex items-center justify-between">
                <span>{isArabic ? 'حجم الخط — اسحب' : 'Font size — drag'}</span>
                <span className="font-mono font-bold text-foreground">{selectedElement.fontSize || 18}</span>
              </div>
              <input
                type="range"
                min={MIN_FONT_SIZE}
                max={MAX_FONT_SIZE}
                step={1}
                value={selectedElement.fontSize || 18}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setFontSize(next);
                  setElements((prev) =>
                    prev.map((el) => {
                      if (el.id !== selectedShapeId) return el;
                      if (el.type === 'text') {
                        const dims = estimateTextBounds(el.text || '', next);
                        return { ...el, fontSize: next, width: dims.width, height: dims.height };
                      }
                      return { ...el, fontSize: next };
                    })
                  );
                }}
                onMouseUp={() => pushHistory(elements)}
                onTouchEnd={() => pushHistory(elements)}
                className="w-full h-1.5 cursor-ew-resize accent-[#5e54d8]"
                dir="ltr"
                aria-label={isArabic ? 'حجم الخط' : 'Font size'}
              />
            </div>
          )}

          {/* Action Row */}
          <div className="flex items-center gap-1 pt-1 border-t border-border">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const dup: ExcalidrawElement = {
                  ...selectedElement,
                  id: `elem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                  x: selectedElement.x + 24,
                  y: selectedElement.y + 24,
                };
                pushHistory([...elements, dup]);
                setSelectedShapeId(dup.id);
              }}
              className="flex-1 h-7 text-[11px] gap-1"
            >
              <Copy className="w-3 h-3" />
              <span>Clone</span>
            </Button>

            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                pushHistory(elements.filter((el) => el.id !== selectedShapeId));
                setSelectedShapeId(null);
              }}
              className="h-7 text-[11px] px-2.5"
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>
      )}

      {/* FRAME-HEIGHT GRIP: drag up/down to change board length (width stays full).
          Double-click resets to auto-fill. */}
      {!readOnly && (
        <div
          dir="ltr"
          className={cn(
            'absolute bottom-1.5 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1.5 px-3 py-1 rounded-full border shadow-lg backdrop-blur-md cursor-ns-resize select-none',
            frameDragging
              ? 'border-[#5e54d8] bg-[#e0dfff] dark:bg-violet-950'
              : 'border-border/80 bg-card/95 hover:border-[#5e54d8]/60'
          )}
          style={{ touchAction: 'none' }}
          onPointerDown={onFrameGripDown}
          onPointerMove={onFrameGripMove}
          onPointerUp={endFrameDrag}
          onPointerCancel={endFrameDrag}
          onMouseDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => {
            e.stopPropagation();
            setFrameH(null);
          }}
          title={isArabic ? 'اسحب عمودياً لتغيير طول اللوحة — ضغطة مزدوجة للرجوع للملء التلقائي' : 'Drag vertically to resize board height — double-click to auto-fill'}
        >
          <GripHorizontal className="w-4 h-4 text-muted-foreground" />
          <span className="text-[10px] font-bold text-muted-foreground font-mono">
            {frameH ? `${frameH}px` : isArabic ? 'طول تلقائي' : 'Auto height'}
          </span>
        </div>
      )}

      {/* BOTTOM FLOATING CONTROLS: Zoom, Fit, Undo/Redo, Export, Share */}
      <div
        dir="ltr"
        className="absolute bottom-4 start-4 z-30 flex items-center gap-1 p-1 rounded-xl border border-border/80 bg-card/90 shadow-lg backdrop-blur-md text-xs"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={handleUndo}
          disabled={historyIdx <= 0 || readOnly}
          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-40"
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={handleRedo}
          disabled={historyIdx >= history.length - 1 || readOnly}
          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-40"
          title="Redo (Ctrl+Y)"
        >
          <Redo2 className="w-4 h-4" />
        </button>

        <span className="h-4 w-px bg-border mx-0.5" />

        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(0.2, z - 0.15))}
          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => setZoom(1)}
          className="px-2 py-1 text-[11px] font-mono text-muted-foreground hover:text-foreground hover:bg-muted rounded"
          title="Reset Zoom"
        >
          {Math.round(zoom * 100)}%
        </button>

        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(3, z + 0.15))}
          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={handleFitView}
          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
          title="Fit View"
        >
          <Maximize2 className="w-4 h-4" />
        </button>

        <span className="h-4 w-px bg-border mx-0.5" />

        <button
          type="button"
          onClick={handleExportPNG}
          className="p-1.5 rounded hover:bg-muted text-emerald-600 dark:text-emerald-400 font-semibold"
          title="Export PNG"
        >
          <Download className="w-4 h-4" />
        </button>

        {onOpenShare && (
          <button
            type="button"
            onClick={onOpenShare}
            className="p-1.5 rounded hover:bg-muted text-primary"
            title={isArabic ? 'مشاركة اللوحة' : 'Share Board'}
          >
            <Share2 className="w-4 h-4" />
          </button>
        )}

        {onArchive && (
          <button
            type="button"
            onClick={onArchive}
            className="p-1.5 rounded hover:bg-muted text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
            title={isArabic ? 'أرشفة اللوحة' : 'Archive Board'}
          >
            <Archive className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* CANVAS WORKSPACE LAYER: EXCALIDRAW SVG SHAPES + WIDGETS */}
      <div
        dir="ltr"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
        }}
      >
        {/* SVG Drawing Layer for Excalidraw Elements */}
        <svg
          style={{ direction: 'ltr' }}
          className="w-full h-full absolute inset-0 overflow-visible pointer-events-none"
        >
          <defs>
            <marker
              id="arrowhead-canvas"
              markerWidth="12"
              markerHeight="12"
              refX="10"
              refY="6"
              orient="auto"
            >
              <path d="M2,2 L10,6 L2,10 L4,6 Z" fill="currentColor" />
            </marker>
          </defs>

          {/* Render Excalidraw Shapes */}
          {elements.map((el) => {
            if (el.type === 'rectangle') {
              return (
                <g key={el.id} className="pointer-events-auto cursor-pointer">
                  <rect
                    x={el.x}
                    y={el.y}
                    width={el.width}
                    height={el.height}
                    rx="6"
                    ry="6"
                    fill={el.backgroundColor || 'transparent'}
                    stroke={el.strokeColor || '#1e1e1e'}
                    strokeWidth={el.strokeWidth || 2}
                    strokeDasharray={
                      el.strokeStyle === 'dashed' ? '6 6' : el.strokeStyle === 'dotted' ? '2 4' : undefined
                    }
                    onDoubleClick={() => !readOnly && setEditingShapeId(el.id)}
                  />
                  {el.text && (
                    <text
                      x={el.x + el.width / 2}
                      y={el.y + el.height / 2 + 5}
                      textAnchor="middle"
                      fill={el.strokeColor || '#1e1e1e'}
                      fontSize={el.fontSize || 16}
                      fontFamily="IBM Plex Sans Arabic, sans-serif"
                      fontWeight="600"
                      className="select-none pointer-events-none"
                    >
                      {el.text}
                    </text>
                  )}
                </g>
              );
            }

            if (el.type === 'diamond') {
              const cx = el.x + el.width / 2;
              const cy = el.y + el.height / 2;
              const pts = `${cx},${el.y} ${el.x + el.width},${cy} ${cx},${el.y + el.height} ${el.x},${cy}`;
              return (
                <g key={el.id} className="pointer-events-auto cursor-pointer">
                  <polygon
                    points={pts}
                    fill={el.backgroundColor || 'transparent'}
                    stroke={el.strokeColor || '#1e1e1e'}
                    strokeWidth={el.strokeWidth || 2}
                    strokeDasharray={
                      el.strokeStyle === 'dashed' ? '6 6' : el.strokeStyle === 'dotted' ? '2 4' : undefined
                    }
                    onDoubleClick={() => !readOnly && setEditingShapeId(el.id)}
                  />
                  {el.text && (
                    <text
                      x={cx}
                      y={cy + 5}
                      textAnchor="middle"
                      fill={el.strokeColor || '#1e1e1e'}
                      fontSize={el.fontSize || 16}
                      fontFamily="IBM Plex Sans Arabic, sans-serif"
                      fontWeight="600"
                      className="select-none pointer-events-none"
                    >
                      {el.text}
                    </text>
                  )}
                </g>
              );
            }

            if (el.type === 'ellipse') {
              const rx = el.width / 2;
              const ry = el.height / 2;
              return (
                <g key={el.id} className="pointer-events-auto cursor-pointer">
                  <ellipse
                    cx={el.x + rx}
                    cy={el.y + ry}
                    rx={Math.max(2, rx)}
                    ry={Math.max(2, ry)}
                    fill={el.backgroundColor || 'transparent'}
                    stroke={el.strokeColor || '#1e1e1e'}
                    strokeWidth={el.strokeWidth || 2}
                    strokeDasharray={
                      el.strokeStyle === 'dashed' ? '6 6' : el.strokeStyle === 'dotted' ? '2 4' : undefined
                    }
                    onDoubleClick={() => !readOnly && setEditingShapeId(el.id)}
                  />
                  {el.text && (
                    <text
                      x={el.x + rx}
                      y={el.y + ry + 5}
                      textAnchor="middle"
                      fill={el.strokeColor || '#1e1e1e'}
                      fontSize={el.fontSize || 16}
                      fontFamily="IBM Plex Sans Arabic, sans-serif"
                      fontWeight="600"
                      className="select-none pointer-events-none"
                    >
                      {el.text}
                    </text>
                  )}
                </g>
              );
            }

            if (el.type === 'arrow' && el.points && el.points.length >= 2) {
              const p1 = el.points[0];
              const p2 = el.points[el.points.length - 1];
              return (
                <g key={el.id} className="pointer-events-auto cursor-pointer" color={el.strokeColor || '#1e1e1e'}>
                  <line
                    x1={p1.x}
                    y1={p1.y}
                    x2={p2.x}
                    y2={p2.y}
                    stroke={el.strokeColor || '#1e1e1e'}
                    strokeWidth={el.strokeWidth || 2}
                    strokeDasharray={
                      el.strokeStyle === 'dashed' ? '6 6' : el.strokeStyle === 'dotted' ? '2 4' : undefined
                    }
                    markerEnd="url(#arrowhead-canvas)"
                  />
                </g>
              );
            }

            if (el.type === 'line' && el.points && el.points.length >= 2) {
              const p1 = el.points[0];
              const p2 = el.points[el.points.length - 1];
              return (
                <g key={el.id} className="pointer-events-auto cursor-pointer">
                  <line
                    x1={p1.x}
                    y1={p1.y}
                    x2={p2.x}
                    y2={p2.y}
                    stroke={el.strokeColor || '#1e1e1e'}
                    strokeWidth={el.strokeWidth || 2}
                    strokeDasharray={
                      el.strokeStyle === 'dashed' ? '6 6' : el.strokeStyle === 'dotted' ? '2 4' : undefined
                    }
                  />
                </g>
              );
            }

            if (el.type === 'freedraw' && el.points && el.points.length > 0) {
              const d = el.points
                .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
                .join(' ');
              return (
                <g key={el.id} className="pointer-events-auto cursor-pointer">
                  <path
                    d={d}
                    fill="none"
                    stroke={el.strokeColor || '#1e1e1e'}
                    strokeWidth={el.strokeWidth || 2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>
              );
            }

            if (el.type === 'text') {
              const fSize = el.fontSize || 18;
              // Centered in its live box (horizontally + vertically), so the
              // letters always sit exactly in the middle of the frame.
              const tBox = textRenderBox(el);
              const tLines = (el.text || '').split('\n');
              const tLineH = Math.ceil(fSize * 1.35);
              const tBlockH = tLines.length * tLineH;
              const tFirstBaseline = tBox.y + (tBox.h - tBlockH) / 2 + fSize * 0.85;
              const tCx = tBox.x + tBox.w / 2;
              return (
                <g key={el.id} className="pointer-events-auto cursor-pointer">
                  <text
                    x={tCx}
                    y={tFirstBaseline}
                    fill={el.strokeColor || '#1e1e1e'}
                    fontSize={fSize}
                    fontFamily="IBM Plex Sans Arabic, sans-serif"
                    fontWeight="600"
                    textAnchor="middle"
                    direction="auto"
                    className="select-none pointer-events-none"
                    onDoubleClick={() => !readOnly && setEditingShapeId(el.id)}
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

            if (el.type === 'note') {
              // Sticky-note look: wrapped centered lines + folded corner.
              const nfs = el.fontSize || 15;
              const nPad = 14;
              const nMaxW = Math.max(40, el.width - nPad * 2);
              const nLines = wrapNoteText(el.text || '', nfs, nMaxW);
              const nLineH = Math.round(nfs * 1.5);
              const nMaxLines = Math.max(1, Math.floor((el.height - 18) / nLineH));
              const nShown = nLines.slice(0, nMaxLines);
              const nCx = el.x + el.width / 2;
              const nFirstBaseline = el.y + 16 + nfs * 0.85;
              const fold = Math.min(26, Math.max(14, Math.min(el.width, el.height) * 0.16));
              const nFx = el.x + el.width;
              const nFy = el.y + el.height;
              return (
                <g key={el.id} className="pointer-events-auto cursor-pointer">
                  <rect
                    x={el.x}
                    y={el.y}
                    width={el.width}
                    height={el.height}
                    rx="4"
                    ry="4"
                    fill={el.backgroundColor || '#fff3b0'}
                    stroke={el.strokeColor || '#e0c030'}
                    strokeWidth={1}
                    className="filter drop-shadow-md"
                    onDoubleClick={() => !readOnly && setEditingShapeId(el.id)}
                  />
                  {/* Folded sticky corner (bottom-end) */}
                  <polygon
                    points={`${nFx - fold},${nFy} ${nFx},${nFy - fold} ${nFx},${nFy}`}
                    fill="rgba(0,0,0,0.14)"
                  />
                  <polyline
                    points={`${nFx - fold},${nFy} ${nFx},${nFy - fold}`}
                    fill="none"
                    stroke="rgba(0,0,0,0.18)"
                    strokeWidth={1}
                  />
                  <text
                    x={nCx}
                    y={nFirstBaseline}
                    fill="#2b2b2b"
                    fontSize={nfs}
                    fontFamily="IBM Plex Sans Arabic, sans-serif"
                    fontWeight="500"
                    textAnchor="middle"
                    direction="auto"
                    className="select-none pointer-events-none"
                    onDoubleClick={() => !readOnly && setEditingShapeId(el.id)}
                  >
                    {nShown.map((line, i) => (
                      <tspan key={i} x={nCx} dy={i === 0 ? 0 : nLineH}>
                        {line || ' '}
                      </tspan>
                    ))}
                  </text>
                </g>
              );
            }

            if (el.type === 'image' && el.imageData) {
              return (
                <g key={el.id} className="pointer-events-auto cursor-pointer">
                  <image
                    href={el.imageData}
                    x={el.x}
                    y={el.y}
                    width={el.width}
                    height={el.height}
                    preserveAspectRatio="xMidYMid meet"
                  />
                </g>
              );
            }

            return null;
          })}

          {/* Live Drawing Preview */}
          {drawingElement && (
            <g opacity={0.85}>
              {drawingElement.type === 'rectangle' && (
                <rect
                  x={drawingElement.x}
                  y={drawingElement.y}
                  width={drawingElement.width}
                  height={drawingElement.height}
                  rx="6"
                  ry="6"
                  fill={drawingElement.backgroundColor || 'transparent'}
                  stroke={drawingElement.strokeColor || '#1e1e1e'}
                  strokeWidth={drawingElement.strokeWidth || 2}
                />
              )}
              {drawingElement.type === 'diamond' && (
                <polygon
                  points={`${drawingElement.x + drawingElement.width / 2},${drawingElement.y} ${drawingElement.x + drawingElement.width},${drawingElement.y + drawingElement.height / 2} ${drawingElement.x + drawingElement.width / 2},${drawingElement.y + drawingElement.height} ${drawingElement.x},${drawingElement.y + drawingElement.height / 2}`}
                  fill={drawingElement.backgroundColor || 'transparent'}
                  stroke={drawingElement.strokeColor || '#1e1e1e'}
                  strokeWidth={drawingElement.strokeWidth || 2}
                />
              )}
              {drawingElement.type === 'ellipse' && (
                <ellipse
                  cx={drawingElement.x + drawingElement.width / 2}
                  cy={drawingElement.y + drawingElement.height / 2}
                  rx={Math.max(2, drawingElement.width / 2)}
                  ry={Math.max(2, drawingElement.height / 2)}
                  fill={drawingElement.backgroundColor || 'transparent'}
                  stroke={drawingElement.strokeColor || '#1e1e1e'}
                  strokeWidth={drawingElement.strokeWidth || 2}
                />
              )}
              {drawingElement.type === 'arrow' && drawingElement.points && drawingElement.points.length >= 2 && (
                <line
                  x1={drawingElement.points[0].x}
                  y1={drawingElement.points[0].y}
                  x2={drawingElement.points[1].x}
                  y2={drawingElement.points[1].y}
                  stroke={drawingElement.strokeColor || '#1e1e1e'}
                  strokeWidth={drawingElement.strokeWidth || 2}
                  markerEnd="url(#arrowhead-canvas)"
                />
              )}
              {drawingElement.type === 'line' && drawingElement.points && drawingElement.points.length >= 2 && (
                <line
                  x1={drawingElement.points[0].x}
                  y1={drawingElement.points[0].y}
                  x2={drawingElement.points[1].x}
                  y2={drawingElement.points[1].y}
                  stroke={drawingElement.strokeColor || '#1e1e1e'}
                  strokeWidth={drawingElement.strokeWidth || 2}
                />
              )}
              {drawingElement.type === 'freedraw' && drawingElement.points && (
                <path
                  d={drawingElement.points
                    .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
                    .join(' ')}
                  fill="none"
                  stroke={drawingElement.strokeColor || '#1e1e1e'}
                  strokeWidth={drawingElement.strokeWidth || 2}
                  strokeLinecap="round"
                />
              )}
            </g>
          )}

          {/* Selected Shape Bounding Box & 4 Resize Handles */}
          {selectedElement && !readOnly && (
            (() => {
              const box = displayBox(selectedElement);
              return (
            <g className="pointer-events-auto">
              <rect
                x={box.x - 4}
                y={box.y - 4}
                width={box.w + 8}
                height={box.h + 8}
                fill="none"
                stroke="#5e54d8"
                strokeWidth={1.5}
                strokeDasharray="4 4"
              />
              {[
                { id: 'nw', x: box.x - 8, y: box.y - 8 },
                { id: 'ne', x: box.x + box.w, y: box.y - 8 },
                { id: 'se', x: box.x + box.w, y: box.y + box.h },
                { id: 'sw', x: box.x - 8, y: box.y + box.h },
              ].map((h) => (
                <rect
                  key={h.id}
                  x={h.x}
                  y={h.y}
                  width={8}
                  height={8}
                  fill="#ffffff"
                  stroke="#5e54d8"
                  strokeWidth={1.5}
                  className="cursor-nwse-resize"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setResizingShapeHandle(h.id);
                    setShapeResizeStart({
                      x: getCanvasPoint(e).x,
                      y: getCanvasPoint(e).y,
                      w: box.w,
                      h: box.h,
                      elemX: box.x,
                      elemY: box.y,
                      fontSize: selectedElement.fontSize || 18,
                    });
                  }}
                />
              ))}
            </g>
              );
            })()
          )}

          {/* Laser Pointer Trail */}
          {laserPoints.length > 1 && (
            <path
              d={laserPoints
                .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
                .join(' ')}
              fill="none"
              stroke="#ff2a55"
              strokeWidth={4}
              strokeLinecap="round"
              className="filter drop-shadow-[0_0_8px_#ff2a55]"
              opacity={0.9}
            />
          )}
        </svg>

        {/* Widgets Layer (Tasks, Notes, Comments) */}
        {(board.widgets || []).map((widget) => (
          <WidgetRenderer
            key={widget.id}
            widget={widget}
            isSelected={selectedWidgetId === widget.id}
            zoom={zoom}
            lang={lang}
            readOnly={readOnly}
            onSelect={(_, id) => {
              setSelectedWidgetId(id);
              setSelectedShapeId(null);
            }}
            onUpdate={handleUpdateWidget}
            onDuplicate={handleDuplicateWidget}
            onDelete={handleDeleteWidget}
            onDragStart={handleWidgetDragStart}
            onResizeStart={handleWidgetResizeStart}
          />
        ))}
      </div>

      {/* INLINE TEXT EDITING INPUT OVER SHAPE */}
      {editingShapeId && !readOnly && (
        (() => {
          const el = elements.find((item) => item.id === editingShapeId);
          if (!el) return null;
          const left = el.x * zoom + pan.x;
          const top = el.y * zoom + pan.y;
          const isTextType = el.type === 'text';

          const commitTextEdit = (val: string) => {
            const dims = isTextType ? estimateTextBounds(val, el.fontSize || 18) : null;
            pushHistory(
              elements.map((item) =>
                item.id === editingShapeId
                  ? {
                      ...item,
                      text: val,
                      ...(dims ? { width: dims.width, height: dims.height } : {}),
                    }
                  : item
              )
            );
            setEditingShapeId(null);
          };

          return (
            <div
              style={{
                position: 'absolute',
                left: `${left}px`,
                top: `${top}px`,
                width: `${Math.max(130, el.width * zoom)}px`,
                height: `${Math.max(38, el.height * zoom)}px`,
              }}
              className="z-50 flex items-center justify-center pointer-events-auto"
              onMouseDown={(e) => e.stopPropagation()}
            >
              {el.type === 'note' ? (
                <textarea
                  defaultValue={el.text || ''}
                  autoFocus
                  dir="auto"
                  rows={4}
                  onBlur={(e) => {
                    commitTextEdit(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if ((e.key === 'Enter' && (e.ctrlKey || e.metaKey)) || e.key === 'F2') {
                      e.preventDefault();
                      commitTextEdit((e.target as HTMLTextAreaElement).value);
                    } else if (e.key === 'Escape') {
                      setEditingShapeId(null);
                    }
                  }}
                  placeholder={isArabic ? 'اكتب نص الملاحظة... (Enter لسطر جديد)' : 'Write the note... (Enter for new line)'}
                  className="w-full h-full min-h-[90px] bg-[#fff8c9] dark:bg-amber-950/90 border border-primary px-3 py-2 rounded text-center font-medium text-foreground outline-none shadow-xl text-sm resize-none leading-relaxed"
                />
              ) : (
              <input
                type="text"
                defaultValue={el.text || ''}
                autoFocus
                dir="auto"
                onBlur={(e) => {
                  commitTextEdit(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    commitTextEdit((e.target as HTMLInputElement).value);
                  } else if (e.key === 'Escape') {
                    setEditingShapeId(null);
                  }
                }}
                className="w-full h-full bg-white/95 dark:bg-neutral-900/95 border border-primary px-2.5 py-1 rounded text-center font-bold text-foreground outline-none shadow-xl text-sm"
              />
              )}
            </div>
          );
        })()
      )}

      {/* MERMAID TO EXCALIDRAW MODAL */}
      {isMermaidOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4" dir="rtl">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <GitFork className="w-4 h-4 text-emerald-600" />
                <span>تحويل كود Mermaid إلى أشكال Excalidraw</span>
              </h3>
              <button onClick={() => setIsMermaidOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <textarea
              value={mermaidInput}
              onChange={(e) => setMermaidInput(e.target.value)}
              rows={6}
              dir="ltr"
              className="w-full rounded-xl border border-border bg-muted/40 p-3 font-mono text-xs text-foreground focus:outline-none focus:border-primary"
              placeholder="graph TD&#10;A --> B"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsMermaidOpen(false)}>
                إلغاء
              </Button>
              <Button size="sm" onClick={handleMermaidParse} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                توليد الأشكال
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* AI TEXT TO DIAGRAM MODAL */}
      {isAiOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4" dir="rtl">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <Brain className="w-4 h-4 text-violet-600" />
                <span>توليد مخطط ذكي (Text to Diagram AI)</span>
              </h3>
              <button onClick={() => setIsAiOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              type="text"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAiGenerate()}
              placeholder="اكتب فكرة المخطط، مثال: دورة حياة المنتج أو تدفق تسجيل الدخول..."
              className="w-full rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm text-foreground focus:outline-none focus:border-violet-600"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsAiOpen(false)}>
                إلغاء
              </Button>
              <Button size="sm" onClick={handleAiGenerate} className="bg-violet-600 hover:bg-violet-700 text-white gap-1.5 font-semibold">
                <Sparkles className="w-3.5 h-3.5" />
                <span>توليد المخطط</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
