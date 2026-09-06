'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('App Router caught error:', error);
  }, [error]);

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center p-6 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400 mb-6">
        <AlertTriangle className="h-8 w-8" />
      </div>

      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 sm:text-3xl">
        حدث خطأ غير متوقع
      </h1>
      <p className="mt-2 max-w-md text-sm text-slate-600 dark:text-slate-400">
        نعتذر عن هذا الخطأ. يمكنك إعادة المحاولة أو العودة إلى الصفحة الرئيسية.
      </p>

      {error.message && process.env.NODE_ENV === 'development' && (
        <div className="mt-4 max-w-lg rounded-lg bg-slate-100 dark:bg-slate-800 p-3 text-start font-mono text-xs text-red-600 dark:text-red-400">
          {error.message}
        </div>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="inline-flex items-center gap-2 rounded-lg bg-[#2E4034] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#3D5645] transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          <span>إعادة المحاولة / Try Again</span>
        </button>

        <Link
          href="/reports"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          <Home className="h-4 w-4" />
          <span>الرئيسية / Home</span>
        </Link>
      </div>
    </div>
  );
}
