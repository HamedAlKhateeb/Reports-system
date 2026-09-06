import React from 'react';
import Link from 'next/link';
import { FileQuestion, Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center p-6 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 mb-6">
        <FileQuestion className="h-8 w-8 text-[#2E4034]" />
      </div>

      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 sm:text-3xl">
        404 - الصفحة غير موجودة
      </h1>
      <p className="mt-2 max-w-md text-sm text-slate-600 dark:text-slate-400">
        الصفحة التي تبحث عنها غير متوفرة أو تم نقلها.
      </p>

      <div className="mt-8 flex items-center justify-center">
        <Link
          href="/reports"
          className="inline-flex items-center gap-2 rounded-lg bg-[#2E4034] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#3D5645] transition-colors"
        >
          <Home className="h-4 w-4" />
          <span>العودة للتقارير / Back to Reports</span>
        </Link>
      </div>
    </div>
  );
}
