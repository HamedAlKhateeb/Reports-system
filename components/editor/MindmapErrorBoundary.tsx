'use client';

import React from 'react';

interface Props {
  children: React.ReactNode;
  isAr?: boolean;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  message?: string;
}

/**
 * Scope-limited error boundary for the mind-map canvas only.
 * If the canvas library throws (e.g. an extreme viewport state),
 * the rest of the report — editor, toolbar, content — keeps working
 * instead of falling through to the app-wide global-error page.
 */
export class MindmapErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, message: error instanceof Error ? error.message : String(error ?? '') };
  }

  componentDidCatch(error: unknown) {
    try {
      console.error('[mindmap] canvas error captured:', error);
    } catch {}
  }

  private handleRetry = () => {
    this.setState({ hasError: false });
    try {
      this.props.onReset?.();
    } catch {}
  };

  render() {
    if (this.state.hasError) {
      const isAr = this.props.isAr !== false;
      return (
        <div
          dir={isAr ? 'rtl' : 'ltr'}
          className="flex flex-col items-center justify-center gap-2 bg-muted/20 px-4 py-10 text-center"
        >
          <div className="text-xs font-bold text-foreground">
            {isAr ? 'تعذر عرض الخريطة الذهنية مؤقتاً — بياناتك محفوظة' : 'Mind map preview failed temporarily — your data is safe'}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {isAr ? 'المحرر وبقية التقرير يعملان بشكل طبيعي.' : 'The editor and the rest of the report keep working.'}
          </div>
          {!!this.state.message && (
            <div dir="ltr" className="max-w-full overflow-x-auto rounded-md bg-muted px-2 py-1 font-mono text-[10px] text-muted-foreground">
              {this.state.message}
            </div>
          )}
          <button
            type="button"
            onClick={this.handleRetry}
            className="mt-1 h-8 rounded-lg bg-[#2E4034] px-4 text-xs font-bold text-white hover:bg-[#24382F]"
          >
            {isAr ? 'إعادة عرض الخريطة' : 'Reload map'}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
