'use client';

import React from 'react';
import { NodeViewWrapper, NodeViewProps } from '@tiptap/react';
import { SmartTable } from './grid/SmartTable';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function SmartTableView(props: NodeViewProps) {
  const { node, deleteNode } = props;
  const { tableId, reportId, displayMode = 'embedded-edit' } = node.attrs;

  return (
    <NodeViewWrapper className="smart-table-node-view relative group my-4 select-none">
      <div className="relative">
        <SmartTable
          tableId={tableId}
          reportId={reportId}
          mode={displayMode}
          onDeleteNode={deleteNode}
        />
        {/* Quick Node Removal button on hover */}
        <div className="absolute top-2 start-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={deleteNode}
            className="h-6 w-6 rounded-md bg-background/90 text-muted-foreground hover:text-red-600 hover:border-red-300 shadow-2xs"
            title="حذف هذا الجدول من التقرير"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </NodeViewWrapper>
  );
}
