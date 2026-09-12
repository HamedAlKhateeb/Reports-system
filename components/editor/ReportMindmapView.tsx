'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NodeViewWrapper, NodeViewProps } from '@tiptap/react';
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  NodeToolbar,
  useNodesState,
  useEdgesState,
  addEdge,
  type Node as FlowNode,
  type Edge as FlowEdge,
  type Connection,
  type ReactFlowInstance,
} from '@xyflow/react';
import {
  Network,
  Plus,
  GitBranchPlus,
  Trash2,
  Minus,
  AlertTriangle,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Copy,
  CheckCheck,
  Maximize2,
  LayoutDashboard,
  Sliders,
  Download,
  Loader2,
} from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { MindmapErrorBoundary } from './MindmapErrorBoundary';
import { newMindId, layoutMindmap, MIND_COLORS, MIND_SHAPES, MIND_TEXT_COLORS, MIND_FONT_SIZES, MIND_MAP_BACKGROUNDS } from '@/lib/mindmap';
import type { MindNode, MindEdge } from '@/lib/mindmap';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/toast';

type StylePatch = { color?: string; shape?: 'rounded' | 'pill' | 'square'; textColor?: 'default' | 'white' | 'black'; fontSize?: 'sm' | 'md' | 'lg' };

type MindFlowNode = FlowNode<
  { label: string; color?: string; shape?: 'rounded' | 'pill' | 'square'; textColor?: StylePatch['textColor']; fontSize?: StylePatch['fontSize']; onLabel: (id: string, v: string) => void; onStyle: (id: string, patch: StylePatch) => void },
  'mind'
>;

function MindNodeCard({ id, data, selected }: { id: string; data: MindFlowNode['data']; selected?: boolean }) {
  const palette = (data.color && MIND_COLORS[data.color]) || null;
  const shapeCls = (data.shape && MIND_SHAPES[data.shape]?.cls) || MIND_SHAPES.rounded.cls;
  const textCls = (data.textColor && MIND_TEXT_COLORS[data.textColor]?.cls) || MIND_TEXT_COLORS.default.cls;
  const sizeCls = (data.fontSize && MIND_FONT_SIZES[data.fontSize]?.cls) || MIND_FONT_SIZES.md.cls;
  return (
    <>
      <NodeToolbar isVisible={!!selected} position={Position.Top} align="center">
        <div dir="auto" className="flex items-center gap-1.5 rounded-xl border border-border bg-card p-1.5 shadow-xl">
          <div className="flex items-center gap-1">
            {Object.entries(MIND_COLORS).map(([key, c]) => (
              <button
                key={key}
                type="button"
                onClick={() => data.onStyle(id, { color: key })}
                title={c.labelAr}
                className={cn(
                  'h-5 w-5 rounded-full transition-transform hover:scale-125',
                  c.swatch,
                  data.color === key && 'ring-2 ring-foreground ring-offset-1 ring-offset-card'
                )}
              />
            ))}
          </div>
          <span className="h-4 w-px bg-border" />
          <div className="flex items-center gap-1">
            {Object.entries(MIND_SHAPES).map(([key, s]) => (
              <button
                key={key}
                type="button"
                onClick={() => data.onStyle(id, { shape: key as StylePatch['shape'] })}
                title={s.labelAr}
                className={cn(
                  'flex h-5 w-7 items-center justify-center rounded-md border border-border bg-muted/50 transition-colors hover:border-foreground',
                  (data.shape || 'rounded') === key && 'border-foreground bg-muted'
                )}
              >
                <span className={cn('block h-2.5 w-4 border-2 border-current', s.cls)} />
              </button>
            ))}
          </div>
          <span className="h-4 w-px bg-border" />
          <div className="flex items-center gap-1">
            {Object.entries(MIND_TEXT_COLORS).map(([key, tc]) => (
              <button
                key={key}
                type="button"
                onClick={() => data.onStyle(id, { textColor: key as StylePatch['textColor'] })}
                title={tc.labelAr}
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-md border border-border bg-muted/50 text-[11px] font-black transition-colors hover:border-foreground',
                  (data.textColor || 'default') === key && 'border-foreground bg-muted'
                )}
              >
                <span className={tc.cls}>A</span>
              </button>
            ))}
          </div>
          <span className="h-4 w-px bg-border" />
          <div className="flex items-center gap-1">
            {Object.entries(MIND_FONT_SIZES).map(([key, fs]) => (
              <button
                key={key}
                type="button"
                onClick={() => data.onStyle(id, { fontSize: key as StylePatch['fontSize'] })}
                title={fs.labelAr}
                className={cn(
                  'flex h-5 w-7 items-center justify-center rounded-md border border-border bg-muted/50 font-black text-foreground transition-colors hover:border-foreground',
                  (data.fontSize || 'md') === key && 'border-foreground bg-muted',
                  fs.cls
                )}
              >
                A
              </button>
            ))}
          </div>
        </div>
      </NodeToolbar>
      <div
        dir="auto"
        className={cn(
          'w-44 border-2 px-3 py-2 text-center font-bold shadow-sm transition-colors',
          shapeCls,
          textCls,
          sizeCls,
          palette
            ? `${palette.bg} ${palette.border}`
            : 'border-border bg-card hover:border-[#2E4034]/50',
          selected && 'shadow-md ring-2 ring-[#2E4034]/40 dark:ring-emerald-400/40'
        )}
      >
        <Handle type="target" position={Position.Top} className={cn('!bg-[#2E4034] dark:!bg-emerald-400', palette?.handle)} />
        {selected ? (
          <input
            value={data.label}
            onChange={(e) => data.onLabel(id, e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            autoFocus
            className={cn(
              'w-full rounded-md border border-[#2E4034]/40 bg-background px-1.5 py-1 text-center font-bold focus:outline-none focus:ring-1 focus:ring-[#2E4034]',
              textCls,
              sizeCls
            )}
          />
        ) : (
          <div className="leading-relaxed break-words">{data.label || '—'}</div>
        )}
        <Handle type="source" position={Position.Bottom} className={cn('!bg-[#2E4034] dark:!bg-emerald-400', palette?.handle)} />
      </div>
    </>
  );
}

const nodeTypes = { mind: MindNodeCard };

const MIN_H = 280;
const MAX_H = 640;
const WIDTH_PRESETS = [50, 75, 100];

export function ReportMindmapView(props: NodeViewProps) {
  const { node, updateAttributes } = props;
  const {
    mindmapId,
    title = '',
    caption = '',
    height = 400,
    width = 100,
    alignment = 'center',
    background = 'default',
  } = node.attrs;
  const { t, lang } = useLanguage();
  const isAr = lang === 'ar';
  const [showCustomWidth, setShowCustomWidth] = useState(false);

  const initialNodes: MindFlowNode[] = useMemo(() => {
    const list = (node.attrs.nodes || []) as MindNode[];
    const noop = (_id: string, _v: string) => {};
    const noopStyle = (_id: string, _p: StylePatch) => {};
    return list.map((n) => ({
      id: String(n.id),
      type: 'mind' as const,
      position: { x: Number(n.x) || 0, y: Number(n.y) || 0 },
      data: { label: String(n.label ?? ''), color: n.color, shape: n.shape, textColor: n.textColor, fontSize: n.fontSize, onLabel: noop, onStyle: noopStyle },
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initialEdges: FlowEdge[] = useMemo(() => {
    const list = (node.attrs.edges || []) as MindEdge[];
    return list.map((e) => ({ id: String(e.id), source: String(e.source), target: String(e.target) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [armNodeDelete, setArmNodeDelete] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [exportingPng, setExportingPng] = useState(false);
  const persistRef = useRef<string>('');
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flowRef = useRef<ReactFlowInstance<MindFlowNode, FlowEdge> | null>(null);
  const canvasBoxRef = useRef<HTMLDivElement | null>(null);

  const handleLabel = useCallback((id: string, v: string) => {
    setNodes((nds) =>
      nds.map((n) => (n.id === id ? { ...n, data: { ...(n.data as object), label: v } as MindFlowNode['data'] } : n))
    );
  }, [setNodes]);

  const handleStyle = useCallback((id: string, patch: StylePatch) => {
    setNodes((nds) =>
      nds.map((n) => (n.id === id ? { ...n, data: { ...(n.data as object), ...patch } as MindFlowNode['data'] } : n))
    );
  }, [setNodes]);

  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: { ...(n.data as object), onLabel: handleLabel, onStyle: handleStyle } as MindFlowNode['data'],
      }))
    );
  }, [handleLabel, handleStyle, setNodes]);

  // Persist canvas state back into the TipTap node (→ autosave pipeline).
  useEffect(() => {
    const sn = nodes.map((n) => {
      const d = n.data as unknown as { label?: unknown; color?: unknown; shape?: unknown; textColor?: unknown; fontSize?: unknown };
      const entry: MindNode = {
        id: n.id,
        label: String(d?.label ?? ''),
        x: Math.round(n.position.x),
        y: Math.round(n.position.y),
      };
      if (typeof d?.color === 'string' && MIND_COLORS[d.color]) entry.color = d.color;
      if (d?.shape === 'rounded' || d?.shape === 'pill' || d?.shape === 'square') entry.shape = d.shape;
      if (d?.textColor === 'default' || d?.textColor === 'white' || d?.textColor === 'black') entry.textColor = d.textColor;
      if (d?.fontSize === 'sm' || d?.fontSize === 'md' || d?.fontSize === 'lg') entry.fontSize = d.fontSize;
      return entry;
    });
    const se = edges.map((e) => ({ id: e.id, source: e.source, target: e.target }));
    const key = JSON.stringify([sn, se]);
    if (key !== persistRef.current) {
      persistRef.current = key;
      updateAttributes({ nodes: sn, edges: se });
    }
  }, [nodes, edges, updateAttributes]);

  useEffect(() => {
    return () => {
      if (armTimer.current) clearTimeout(armTimer.current);
    };
  }, []);

  const fitMap = useCallback(() => {
    try {
      flowRef.current?.fitView({ padding: 0.25, maxZoom: 1.5, duration: 250 });
    } catch {}
  }, []);

  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target || params.source === params.target) return;
      setEdges((eds) => addEdge({ ...params, id: newMindId('me') }, eds));
    },
    [setEdges]
  );

  // ROOT-CAUSE FIX (React #185 infinite loop): the previous code passed an
  // INLINE arrow to ReactFlow's onSelectionChange. Its SelectionListener runs
  // `useEffect(..., [selectedNodes, selectedEdges, onSelectionChange])`, so a
  // new function identity every render re-fired the effect → setSelectedIds
  // (new array) → re-render → … until "Maximum update depth exceeded".
  // Any parent re-render (page scroll/sticky toolbar, style click, zoom)
  // triggered it — hence the crashes. Stable callback + equality bailout:
  const handleSelectionChange = useCallback(({ nodes: sel }: { nodes: FlowNode[] }) => {
    const ids = sel.map((n) => n.id);
    setSelectedIds((prev) =>
      prev.length === ids.length && prev.every((v, i) => v === ids[i]) ? prev : ids
    );
  }, []);

  const handleInit = useCallback((instance: ReactFlowInstance<MindFlowNode, FlowEdge>) => {
    flowRef.current = instance;
  }, []);

  const handleAddRoot = useCallback(() => {
    const id = newMindId('mn');
    const ys = nodes.map((n) => n.position.y);
    const maxY = ys.length ? Math.max(...ys) : 0;
    const root: MindFlowNode = {
      id,
      type: 'mind',
      position: { x: 0, y: maxY + 180 },
      data: { label: isAr ? 'فكرة جديدة' : 'New idea', onLabel: handleLabel, onStyle: handleStyle },
    };
    setNodes((nds) => [...nds, root]);
    setTimeout(fitMap, 60);
  }, [nodes, setNodes, handleLabel, handleStyle, isAr, fitMap]);

  const handleAddChild = useCallback(() => {
    const parentId = selectedIds[0] || nodes[0]?.id;
    if (!parentId) {
      handleAddRoot();
      return;
    }
    const parent = nodes.find((n) => n.id === parentId);
    const siblings = edges.filter((e) => e.source === parentId).length;
    const id = newMindId('mn');
    const child: MindFlowNode = {
      id,
      type: 'mind',
      position: { x: (parent?.position.x ?? 0) + siblings * 220 - 110, y: (parent?.position.y ?? 0) + 170 },
      data: { label: isAr ? 'فرع جديد' : 'New branch', onLabel: handleLabel, onStyle: handleStyle },
    };
    setNodes((nds) => [...nds, child]);
    setEdges((eds) => [...eds, { id: newMindId('me'), source: parentId, target: id }]);
  }, [selectedIds, nodes, edges, setNodes, setEdges, handleLabel, handleStyle, handleAddRoot, isAr]);

  const handleAutoArrange = useCallback(() => {
    const plain: MindNode[] = nodes.map((n) => {
      const d = n.data as unknown as { label?: unknown; color?: unknown; shape?: unknown; textColor?: unknown; fontSize?: unknown };
      return { id: n.id, label: String(d?.label ?? ''), x: n.position.x, y: n.position.y, color: typeof d?.color === 'string' ? d.color : undefined, shape: (d?.shape as MindNode['shape']) || undefined, textColor: (d?.textColor as MindNode['textColor']) || undefined, fontSize: (d?.fontSize as MindNode['fontSize']) || undefined };
    });
    const plainEdges: MindEdge[] = edges.map((e) => ({ id: e.id, source: e.source, target: e.target }));
    const laid = new Map(layoutMindmap(plain, plainEdges).map((n) => [n.id, n]));
    setNodes((nds) => nds.map((n) => ({ ...n, position: { x: laid.get(n.id)?.x ?? n.position.x, y: laid.get(n.id)?.y ?? n.position.y } })));
    setTimeout(fitMap, 60);
    toast.success(isAr ? 'تم ترتيب الخريطة وتوسيطها' : 'Map arranged and centered');
  }, [nodes, edges, setNodes, fitMap, isAr]);

  const handleDeleteNodes = useCallback(() => {
    if (!selectedIds.length) return;
    if (!armNodeDelete) {
      setArmNodeDelete(true);
      if (armTimer.current) clearTimeout(armTimer.current);
      armTimer.current = setTimeout(() => setArmNodeDelete(false), 2500);
      return;
    }
    setArmNodeDelete(false);
    if (armTimer.current) clearTimeout(armTimer.current);
    // Cascade: selected nodes + all descendants (they would dangle otherwise).
    const doomed = new Set<string>(selectedIds);
    let grew = true;
    while (grew) {
      grew = false;
      for (const e of edges) {
        if (doomed.has(e.source) && !doomed.has(e.target)) {
          doomed.add(e.target);
          grew = true;
        }
      }
    }
    setEdges((eds) => eds.filter((e) => !doomed.has(e.source) && !doomed.has(e.target)));
    setNodes((nds) => nds.filter((n) => !doomed.has(n.id)));
    setSelectedIds([]);
    toast.success(isAr ? 'تم حذف العقد المحددة وفروعها' : 'Selected nodes and their branches deleted');
  }, [selectedIds, edges, armNodeDelete, setEdges, setNodes, isAr]);

  const handleSetHeight = useCallback(
    (h: number) => {
      updateAttributes({ height: Math.max(MIN_H, Math.min(MAX_H, Math.round(h))) });
    },
    [updateAttributes]
  );

  const handleSetWidth = useCallback(
    (w: number) => {
      updateAttributes({ width: Math.max(30, Math.min(100, Math.round(w))) });
    },
    [updateAttributes]
  );

  const handleSetAlignment = useCallback(
    (a: 'left' | 'center' | 'right') => {
      updateAttributes({ alignment: a });
    },
    [updateAttributes]
  );

  const handleSetBackground = useCallback(
    (key: string) => {
      if (MIND_MAP_BACKGROUNDS[key]) updateAttributes({ background: key });
    },
    [updateAttributes]
  );

  // Export the map area as a PNG image (same background as the canvas).
  // Deterministic canvas renderer (lib/mindmap-export): background, edges,
  // nodes and labels are ALL drawn explicitly, so connectors can never go
  // missing the way DOM-snapshot exporters drop SVG edge layers.
  const handleExportPng = useCallback(async () => {
    const box = canvasBoxRef.current;
    const inst = flowRef.current;
    if (!box || !inst || exportingPng) return;
    setExportingPng(true);
    try {
      const { renderMindmapPng } = await import('@/lib/mindmap-export');
      const zoom = inst.getViewport().zoom || 1;
      const measured = nodes
        .map((n) => {
          let el: Element | null = null;
          try {
            el = box.querySelector(`.react-flow__node[data-id="${typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(n.id) : n.id}"]`);
          } catch {}
          if (!(el instanceof HTMLElement)) return null;
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height) return null;
          const topLeft = inst.screenToFlowPosition({ x: r.left, y: r.top });
          const d = n.data as unknown as { label?: unknown; color?: unknown; shape?: unknown; textColor?: unknown; fontSize?: unknown };
          return {
            id: n.id,
            label: String(d?.label ?? ''),
            color: typeof d?.color === 'string' ? d.color : undefined,
            shape: (d?.shape as MindNode['shape']) || undefined,
            textColor: (d?.textColor as MindNode['textColor']) || undefined,
            fontSize: (d?.fontSize as MindNode['fontSize']) || undefined,
            x: topLeft.x,
            y: topLeft.y,
            w: r.width / zoom,
            h: r.height / zoom,
          };
        })
        .filter((m): m is NonNullable<typeof m> => m !== null);
      if (!measured.length) throw new Error('empty');
      const bg = MIND_MAP_BACKGROUNDS[background]?.png || MIND_MAP_BACKGROUNDS.default.png;
      const blob = await renderMindmapPng(
        measured,
        edges.map((e) => ({ source: e.source, target: e.target })),
        bg
      );
      const safeTitle = String(title || (isAr ? 'خريطة ذهنية' : 'mindmap')).replace(/[\/\\:*?"<>|]/g, '_').trim() || 'mindmap';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeTitle}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success(isAr ? 'تم تصدير الخريطة كصورة' : 'Mind map exported as image');
    } catch (err) {
      console.error('Mindmap PNG export failed', err);
      toast.error(isAr ? 'فشل تصدير الصورة' : 'Image export failed');
    } finally {
      setExportingPng(false);
    }
  }, [background, title, isAr, exportingPng, nodes, edges]);

  const handleCopyReference = useCallback(async () => {
    const token = isAr ? `[خريطة ذهنية: ${title || 'بدون عنوان'}]` : `[mindmap: ${title || 'untitled'}]`;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(token);
      } else {
        throw new Error('Clipboard API unavailable');
      }
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = token;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        setCopyFeedback(true);
        setTimeout(() => setCopyFeedback(false), 2000);
      } catch (e) {
        console.error('Copy mindmap reference failed', e);
      }
    }
  }, [title, isAr]);

  const handleCaptionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateAttributes({ caption: e.target.value });
  };

  const handleDeleteMap = () => {
    props.deleteNode();
    toast.success(isAr ? 'تم حذف الخريطة الذهنية' : 'Mind map deleted');
  };

  const canvasH = Math.max(MIN_H, Math.min(MAX_H, Number(height) || 400));
  const frameW = `${Math.max(30, Math.min(100, Number(width) || 100))}%`;
  const alignmentClass =
    alignment === 'left' ? 'ms-0 me-auto' : alignment === 'right' ? 'ms-auto me-0' : 'mx-auto';

  return (
    <NodeViewWrapper dir={isAr ? 'rtl' : 'ltr'} className="my-6 block not-prose w-full max-w-full">
      <div
        style={{ width: frameW }}
        className={cn(
          'group relative overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-shadow hover:border-[#2E4034]/40 hover:shadow-md',
          alignmentClass
        )}
      >
        {/* Header: title + actions */}
        <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-border bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground">
          <div className="flex min-w-0 items-center gap-1.5">
            <Network className="h-3.5 w-3.5 shrink-0 text-[#2E4034] dark:text-emerald-400" />
            <input
              value={title}
              onChange={(e) => updateAttributes({ title: e.target.value })}
              onKeyDown={(e) => e.stopPropagation()}
              dir={isAr ? 'rtl' : 'ltr'}
              placeholder={isAr ? 'عنوان الخريطة الذهنية' : 'Mind map title'}
              className="h-7 w-40 rounded-md border border-transparent bg-transparent px-2 text-xs font-bold text-foreground placeholder:font-normal placeholder:text-muted-foreground/70 hover:border-border focus:border-[#2E4034] focus:bg-background focus:outline-none sm:w-56"
            />
            <button
              type="button"
              onClick={handleCopyReference}
              className={cn(
                'flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors',
                copyFeedback
                  ? 'bg-emerald-500/15 font-medium text-emerald-600'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
              title={isAr ? 'نسخ إشارة الخريطة' : 'Copy map reference'}
            >
              <Copy className="h-3 w-3" />
              <span className="hidden sm:inline">{copyFeedback ? (isAr ? 'تم النسخ' : 'Copied') : isAr ? 'نسخ الإشارة' : 'Copy ref'}</span>
            </button>
            <button
              type="button"
              onClick={handleExportPng}
              disabled={exportingPng}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
              title={isAr ? 'تصدير الخريطة كصورة PNG' : 'Export map as PNG image'}
            >
              {exportingPng ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
              <span className="hidden sm:inline">{isAr ? 'صورة' : 'PNG'}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-600"
              title={isAr ? 'حذف الخريطة كلها' : 'Delete entire map'}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={handleAddRoot}
              className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title={isAr ? 'إضافة عقدة' : 'Add node'}
            >
              <Plus className="h-3 w-3" />
              <span className="hidden sm:inline">{isAr ? 'عقدة' : 'Node'}</span>
            </button>
            <button
              type="button"
              onClick={handleAddChild}
              className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title={isAr ? 'إضافة فرع للعقدة المحددة (أو الأولى)' : 'Add child to selected node (or first)'}
            >
              <GitBranchPlus className="h-3 w-3" />
              <span className="hidden sm:inline">{isAr ? 'فرع' : 'Branch'}</span>
            </button>
            <button
              type="button"
              onClick={handleDeleteNodes}
              disabled={!selectedIds.length}
              className={cn(
                'flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-40',
                armNodeDelete
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'text-muted-foreground hover:bg-red-500/10 hover:text-red-600'
              )}
              title={isAr ? 'حذف العقد المحددة (اضغط مرتين للتأكيد)' : 'Delete selected nodes (press twice to confirm)'}
            >
              <Trash2 className="h-3 w-3" />
              <span className="hidden sm:inline">{armNodeDelete ? (isAr ? 'تأكيد؟' : 'Sure?') : isAr ? 'حذف' : 'Delete'}</span>
            </button>
            <span className="mx-0.5 h-4 w-px bg-border" />
            <button
              type="button"
              onClick={handleAutoArrange}
              className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title={isAr ? 'ترتيب تلقائي وتوسيط' : 'Auto-arrange and center'}
            >
              <LayoutDashboard className="h-3 w-3" />
              <span className="hidden sm:inline">{isAr ? 'ترتيب' : 'Arrange'}</span>
            </button>
            <button
              type="button"
              onClick={fitMap}
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title={isAr ? 'ملاءمة العرض وتوسيط' : 'Fit view and center'}
            >
              <Maximize2 className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* Delete-confirm banner (same pattern as ReportImageView) */}
        {showDeleteConfirm && (
          <div className="flex items-center justify-between gap-2 border-b border-red-200 bg-red-50/95 px-3 py-1.5 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/70 dark:text-red-300">
            <span className="flex items-center gap-1.5 font-medium">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {isAr ? 'هل أنت متأكد من حذف هذه الخريطة الذهنية نهائياً؟' : 'Delete this mind map permanently?'}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleDeleteMap}
                className="rounded bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white transition-colors hover:bg-red-700"
              >
                {isAr ? 'حذف' : 'Delete'}
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded border border-border bg-background px-2 py-0.5 text-[11px] text-foreground transition-colors hover:bg-muted"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
            </div>
          </div>
        )}

        {/* Size row: width presets + fine slider + height stepper + alignment (mirrors image UX) */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border bg-muted/20 px-3 py-1.5 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-1">
            <span className="font-medium">{isAr ? 'العرض:' : 'Width:'}</span>
            {WIDTH_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => handleSetWidth(p)}
                className={cn(
                  'rounded-md px-1.5 py-0.5 text-[10px] font-bold transition-colors',
                  Math.round(Number(width)) === p
                    ? 'bg-[#2E4034] text-white shadow-2xs'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                {p}%
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowCustomWidth(!showCustomWidth)}
              className={cn(
                'rounded-md p-1 transition-colors',
                showCustomWidth ? 'bg-[#2E4034]/15 text-[#2E4034] dark:text-emerald-300' : 'text-muted-foreground hover:bg-muted'
              )}
              title={isAr ? 'شريط تحكم دقيق بالعرض' : 'Fine width slider'}
            >
              <Sliders className="h-3 w-3" />
            </button>
          </div>
          {showCustomWidth && (
            <div className="flex min-w-[140px] flex-1 items-center gap-2">
              <input
                type="range"
                min="30"
                max="100"
                step="5"
                value={Math.max(30, Math.min(100, Number(width) || 100))}
                onChange={(e) => handleSetWidth(Number(e.target.value))}
                className="h-1.5 flex-1 cursor-pointer rounded-lg bg-muted accent-[#2E4034]"
              />
              <span className="w-10 text-end font-mono font-bold text-foreground">{Math.round(Number(width) || 100)}%</span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <span className="font-medium">{isAr ? 'الارتفاع:' : 'Height:'}</span>
            <button
              type="button"
              onClick={() => handleSetHeight(canvasH - 40)}
              disabled={canvasH <= MIN_H}
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="w-12 text-center font-mono font-bold text-foreground">{canvasH}px</span>
            <button
              type="button"
              onClick={() => handleSetHeight(canvasH + 40)}
              disabled={canvasH >= MAX_H}
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => handleSetAlignment('right')}
              className={cn('rounded-md p-1 transition-colors', alignment === 'right' ? 'bg-[#2E4034] text-white shadow-2xs' : 'text-muted-foreground hover:bg-muted')}
              title={isAr ? 'محاذاة لليمين' : 'Align Right'}
            >
              <AlignRight className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => handleSetAlignment('center')}
              className={cn('rounded-md p-1 transition-colors', alignment === 'center' ? 'bg-[#2E4034] text-white shadow-2xs' : 'text-muted-foreground hover:bg-muted')}
              title={isAr ? 'محاذاة للوسط' : 'Align Center'}
            >
              <AlignCenter className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => handleSetAlignment('left')}
              className={cn('rounded-md p-1 transition-colors', alignment === 'left' ? 'bg-[#2E4034] text-white shadow-2xs' : 'text-muted-foreground hover:bg-muted')}
              title={isAr ? 'محاذاة لليسار' : 'Align Left'}
            >
              <AlignLeft className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-1">
            <span className="font-medium">{isAr ? 'الخلفية:' : 'Background:'}</span>
            {Object.entries(MIND_MAP_BACKGROUNDS).map(([key, b]) => (
              <button
                key={key}
                type="button"
                onClick={() => handleSetBackground(key)}
                title={isAr ? b.labelAr : b.labelEn}
                style={{ backgroundColor: b.css }}
                className={cn(
                  'h-5 w-5 rounded-md border border-border transition-transform hover:scale-110',
                  background === key && 'ring-2 ring-[#2E4034] ring-offset-1 ring-offset-card dark:ring-emerald-400'
                )}
              />
            ))}
          </div>
        </div>

        {/* Canvas — LTR coordinate space; labels themselves are dir="auto".
            Scoped error boundary: a canvas failure must never take down the
            whole page. maxZoom caps extreme viewport states. */}
        <MindmapErrorBoundary
          key={mindmapId}
          isAr={isAr}
          onReset={() => {
            try {
              flowRef.current?.fitView({ padding: 0.25, maxZoom: 1 });
            } catch {}
          }}
        >
        <div
          ref={canvasBoxRef}
          dir="ltr"
          style={{ height: canvasH, backgroundColor: MIND_MAP_BACKGROUNDS[background]?.css || MIND_MAP_BACKGROUNDS.default.css }}
          className="w-full"
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={handleInit}
            onSelectionChange={handleSelectionChange}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.25, maxZoom: 1.5 }}
            minZoom={0.2}
            maxZoom={2.5}
            deleteKeyCode={null}
            multiSelectionKeyCode="Shift"
            proOptions={{ hideAttribution: false }}
            className="rounded-none"
          >
            <Background gap={18} size={1.2} />
            <Controls position="bottom-right" showInteractive={false} />
          </ReactFlow>
        </div>
        </MindmapErrorBoundary>

        {/* Caption (metadata like the image) */}
        <div className="border-t border-border bg-card/60 p-2.5 sm:p-3">
          <input
            type="text"
            dir={isAr ? 'rtl' : 'ltr'}
            value={caption}
            onChange={handleCaptionChange}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder={t('imageCaptionPlaceholder')}
            className="w-full rounded-lg border border-border/80 bg-background/90 px-4 py-2 text-xs text-foreground placeholder:text-muted-foreground/70 transition-colors focus:border-[#2E4034] focus:bg-background focus:outline-none focus:ring-1 focus:ring-[#2E4034] sm:text-sm"
          />
        </div>

        {/* Footer hint */}
        <div className="border-t border-border bg-card/60 px-3 py-1.5 text-[11px] text-muted-foreground">
          {isAr
            ? 'حدد عقدة لتعديل نصها ولونها وشكلها ولون الخط وحجمه • اسحب من النقاط للربط • زر ترتيب يعيد التوسيط'
            : 'Select a node to edit its text, colors, shape and font • Drag from dots to connect • Arrange re-centers'}
          <span className="font-mono text-muted-foreground/70"> · {nodes.length} {isAr ? 'عقدة' : 'nodes'}</span>
          {copyFeedback && (
            <span className="ms-2 inline-flex items-center gap-1 font-medium text-emerald-600">
              <CheckCheck className="h-3 w-3" />
              {isAr ? 'تم نسخ الإشارة' : 'Ref copied'}
            </span>
          )}
        </div>
      </div>
    </NodeViewWrapper>
  );
}
