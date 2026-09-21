'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Plus,
  GitBranchPlus,
  Trash2,
  LayoutDashboard,
  Maximize2,
} from 'lucide-react';
import type { BoardWidget, MindmapWidgetData } from '@/lib/boards-types';
import { MindmapErrorBoundary } from '@/components/editor/MindmapErrorBoundary';
import { newMindId, layoutMindmap, MIND_COLORS, MIND_SHAPES, MIND_TEXT_COLORS, MIND_FONT_SIZES } from '@/lib/mindmap';
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

export interface MindmapWidgetProps {
  widget: BoardWidget;
  onUpdateWidget: (w: BoardWidget) => void;
  lang?: 'ar' | 'en';
}

export function MindmapWidget({ widget, onUpdateWidget, lang = 'ar' }: MindmapWidgetProps) {
  const isAr = lang === 'ar';
  const mindData = widget.data as Partial<MindmapWidgetData> | undefined;
  
  const initialNodes: MindFlowNode[] = useMemo(() => {
    const list = mindData?.nodes || [];
    const noop = (_id: string, _v: string) => {};
    const noopStyle = (_id: string, _p: StylePatch) => {};
    return list.map((n: any) => ({
      id: String(n.id),
      type: 'mind' as const,
      position: { x: Number(n.x) || 0, y: Number(n.y) || 0 },
      data: { label: String(n.label ?? ''), color: n.color, shape: n.shape, textColor: n.textColor, fontSize: n.fontSize, onLabel: noop, onStyle: noopStyle },
    }));
  }, [mindData?.nodes]);

  const initialEdges: FlowEdge[] = useMemo(() => {
    const list = mindData?.edges || [];
    return list.map((e: any) => ({ id: String(e.id), source: String(e.source), target: String(e.target) }));
  }, [mindData?.edges]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [armNodeDelete, setArmNodeDelete] = useState(false);
  const persistRef = useRef<string>('');
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flowRef = useRef<ReactFlowInstance<MindFlowNode, FlowEdge> | null>(null);

  const handleLabel = useCallback((id: string, v: string) => {
    setNodes((nds) =>
      nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, label: v } } : n))
    );
  }, [setNodes]);

  const handleStyle = useCallback((id: string, patch: StylePatch) => {
    setNodes((nds) =>
      nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n))
    );
  }, [setNodes]);

  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: { ...n.data, onLabel: handleLabel, onStyle: handleStyle },
      }))
    );
  }, [handleLabel, handleStyle, setNodes]);

  useEffect(() => {
    const sn = nodes.map((n) => {
      const entry: any = {
        id: n.id,
        label: String(n.data?.label ?? ''),
        x: Math.round(n.position.x),
        y: Math.round(n.position.y),
      };
      if (typeof n.data?.color === 'string' && MIND_COLORS[n.data.color]) entry.color = n.data.color;
      if (n.data?.shape === 'rounded' || n.data?.shape === 'pill' || n.data?.shape === 'square') entry.shape = n.data.shape;
      if (n.data?.textColor === 'default' || n.data?.textColor === 'white' || n.data?.textColor === 'black') entry.textColor = n.data.textColor;
      if (n.data?.fontSize === 'sm' || n.data?.fontSize === 'md' || n.data?.fontSize === 'lg') entry.fontSize = n.data.fontSize;
      return entry;
    });
    const se = edges.map((e) => ({ id: e.id, source: e.source, target: e.target }));
    const key = JSON.stringify([sn, se]);
    if (key !== persistRef.current) {
      persistRef.current = key;
      onUpdateWidget({
        ...widget,
        data: {
          ...widget.data,
          nodes: sn,
          edges: se,
        },
      });
    }
  }, [nodes, edges, onUpdateWidget, widget]);

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
    const plain = nodes.map((n) => {
      return { id: n.id, label: String(n.data?.label ?? ''), x: n.position.x, y: n.position.y, color: n.data?.color, shape: n.data?.shape, textColor: n.data?.textColor, fontSize: n.data?.fontSize };
    }) as any[];
    const plainEdges = edges.map((e) => ({ id: e.id, source: e.source, target: e.target })) as any[];
    const laid = new Map(layoutMindmap(plain, plainEdges).map((n: any) => [n.id, n]));
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

  return (
    <div className="flex flex-col h-full w-full bg-card">
      <div
        className="flex shrink-0 items-center justify-between gap-1 border-b border-border bg-muted/40 px-2.5 py-1.5"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center gap-1">
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
        </div>
        <div className="flex shrink-0 items-center gap-1">
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

      <div className="flex-1 w-full relative min-h-0">
        <MindmapErrorBoundary
          isAr={isAr}
          onReset={() => {
            try {
              flowRef.current?.fitView({ padding: 0.25, maxZoom: 1 });
            } catch {}
          }}
        >
          <div dir="ltr" className="h-full w-full">
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
              className="rounded-none bg-background"
            >
              <Background gap={18} size={1.2} />
              <Controls position="bottom-right" showInteractive={false} />
            </ReactFlow>
          </div>
        </MindmapErrorBoundary>
      </div>
    </div>
  );
}
