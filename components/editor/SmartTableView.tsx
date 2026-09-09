'use client';

import React from 'react';
import { NodeViewWrapper, NodeViewProps } from '@tiptap/react';
import { SmartTable } from './grid/SmartTable';
import { SmartTableErrorBoundary } from './grid/SmartTableErrorBoundary';

export function SmartTableView(props: NodeViewProps) {
  const { node, deleteNode } = props;
  const { tableId, reportId, displayMode = 'embedded-edit' } = node.attrs;

  if (!tableId || typeof tableId !== 'string') {
    return (
      <NodeViewWrapper className="smart-table-node-view relative my-4">
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
          جدول ذكي بدون معرّف — احذفه وأدرج جدولاً جديداً.
        </div>
      </NodeViewWrapper>
    );
  }

  // Single delete path: the toolbar "Delete Table" button inside SmartTable
  // (with confirmation). No hover quick-delete here to avoid duplicate options.
  return (
    <NodeViewWrapper className="smart-table-node-view relative my-4 select-none">
      <div
        className="relative"
        contentEditable={false}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <SmartTableErrorBoundary tableId={tableId} onDeleteNode={deleteNode}>
          <SmartTable
            tableId={tableId}
            reportId={reportId}
            mode={displayMode}
            onDeleteNode={deleteNode}
            toolbar="external"
          />
        </SmartTableErrorBoundary>
      </div>
    </NodeViewWrapper>
  );
}
