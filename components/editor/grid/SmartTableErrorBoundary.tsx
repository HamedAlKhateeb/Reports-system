'use client';

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  tableId?: string;
  isAr?: boolean;
  onDeleteNode?: () => void;
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

/**
 * Isolates smart-table crashes: a single corrupt table shows a fallback card
 * instead of unmounting the whole TipTap editor.
 */
export class SmartTableErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(err: unknown): State {
    return {
      hasError: true,
      message: err instanceof Error ? err.message.slice(0, 300) : 'Unknown error',
    };
  }

  componentDidCatch(err: unknown) {
    console.error('SmartTable crashed (isolated):', err);
  }

  componentDidUpdate(prevProps: Props) {
    if (prevProps.tableId !== this.props.tableId && this.state.hasError) {
      this.setState({ hasError: false, message: '' });
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    const isAr = this.props.isAr !== false;
    return (
      <div
        contentEditable={false}
        className="my-3 rounded-xl border border-red-200 bg-red-50 p-4 text-xs dark:border-red-900 dark:bg-red-950/40"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 font-bold text-red-700 dark:text-red-300">
          <AlertTriangle className="h-4 w-4" />
          <span>{isAr ? 'تعذر عرض هذا الجدول الذكي' : 'This smart table could not be rendered'}</span>
        </div>
        <p className="mt-1 text-red-600/80 dark:text-red-400/80">
          {isAr
            ? 'بيانات الجدول تالفة أو غير متوافقة. باقي التقرير سليم ويمكنك حذف هذا الجدول وإدراج واحد جديد.'
            : 'This table data is corrupt or incompatible. The rest of the report is safe; you can delete this table and insert a new one.'}
        </p>
        {this.state.message && (
          <p className="mt-1 font-mono text-[10px] text-red-500/70" dir="ltr">{this.state.message}</p>
        )}
        <div className="mt-2 flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => this.setState({ hasError: false, message: '' })}
            className="h-7 text-xs"
          >
            {isAr ? 'إعادة المحاولة' : 'Retry'}
          </Button>
          {this.props.onDeleteNode && (
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={this.props.onDeleteNode}
              className="h-7 text-xs"
            >
              {isAr ? 'حذف الجدول التالف' : 'Delete broken table'}
            </Button>
          )}
        </div>
      </div>
    );
  }
}
