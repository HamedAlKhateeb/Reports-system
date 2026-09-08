'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { ReportItem } from '@/lib/types';
import { AppLanguage } from '@/lib/i18n/dictionary';

const TipTapEditor = dynamic(
  () => import('@/components/editor/TipTapEditor').then((m) => m.TipTapEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#2E4034] border-t-transparent" />
      </div>
    ),
  }
);

interface ContentTabProps {
  report: ReportItem;
  reportLanguage: AppLanguage;
  themeColor?: string;
  backgroundColor?: string;
  onEditorSave: (contentJson: any) => Promise<void>;
  onContentChange: (contentJson: any) => void;
  onSaveImmediately: () => Promise<void>;
  onEditorReady: (editor: any) => void;
}

export function ContentTab({
  report,
  reportLanguage,
  themeColor,
  backgroundColor,
  onEditorSave,
  onContentChange,
  onSaveImmediately,
  onEditorReady,
}: ContentTabProps) {
  return (
    <div className="space-y-4">
      <TipTapEditor
        reportId={report.id}
        initialContent={report.contentJson}
        reportLanguage={reportLanguage}
        onSave={onEditorSave}
        onContentChange={onContentChange}
        onSaveImmediately={onSaveImmediately}
        onEditorReady={onEditorReady}
        themeColor={themeColor}
        backgroundColor={backgroundColor}
      />
    </div>
  );
}
