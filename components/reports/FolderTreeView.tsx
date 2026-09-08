'use client';

import React, { useState } from 'react';
import {
  Folder,
  FolderOpen,
  FolderPlus,
  ChevronRight,
  ChevronDown,
  MoreVertical,
  Edit2,
  Trash2,
  Move,
  Home,
  Layers,
  Check,
  FilePlus,
} from 'lucide-react';
import { FolderItem, ReportItem } from '@/lib/types';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

interface FolderTreeViewProps {
  folders: FolderItem[];
  reports: ReportItem[];
  selectedFolderId: string | null | 'all'; // null = uncategorized/root, 'all' = all reports, string = specific folder
  onSelectFolder: (folderId: string | null | 'all') => void;
  onCreateFolder: (parentId: string | null) => void;
  onRenameFolder: (folder: FolderItem) => void;
  onMoveFolder: (folder: FolderItem) => void;
  onDeleteFolder: (folder: FolderItem) => void;
  onDropReportOnFolder: (reportId: string, targetFolderId: string | null) => void;
  onNewReportInFolder?: (folderId: string) => void;
}

export function FolderTreeView({
  folders,
  reports,
  selectedFolderId,
  onSelectFolder,
  onCreateFolder,
  onRenameFolder,
  onMoveFolder,
  onDeleteFolder,
  onDropReportOnFolder,
  onNewReportInFolder,
}: FolderTreeViewProps) {
  const { lang } = useLanguage();
  const isAr = lang === 'ar';

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null | 'root'>(null);

  const toggleExpand = (folderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  // Drag & drop report on folder
  const handleDragOver = (e: React.DragEvent, folderId: string | null | 'root') => {
    e.preventDefault();
    e.stopPropagation();
    if (dragOverFolderId !== folderId) {
      setDragOverFolderId(folderId);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverFolderId(null);
  };

  const handleDrop = (e: React.DragEvent, folderId: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverFolderId(null);
    const reportId = e.dataTransfer.getData('text/report-id') || e.dataTransfer.getData('text/plain');
    if (reportId) {
      onDropReportOnFolder(reportId, folderId);
    }
  };

  // Report count calculation
  const getFolderReportCount = (folderId: string): number => {
    return reports.filter((r) => r.folderId === folderId).length;
  };

  const rootReportsCount = reports.filter((r) => !r.folderId).length;
  const totalReportsCount = reports.length;

  const renderTreeNodes = (parentId: string | null = null, depth: number = 0): React.ReactNode => {
    const children = folders.filter((f) => (f.parentId || null) === parentId);
    if (children.length === 0) return null;

    return (
      <div className="space-y-0.5">
        {children.map((f) => {
          const hasChildren = folders.some((child) => child.parentId === f.id);
          const isExpanded = expandedFolders.has(f.id);
          const isSelected = selectedFolderId === f.id;
          const isDragOver = dragOverFolderId === f.id;
          const reportCount = getFolderReportCount(f.id);

          const ArrowIcon = isExpanded ? ChevronDown : isAr ? ChevronLeftIcon : ChevronRight;

          return (
            <React.Fragment key={f.id}>
              <div
                style={{ paddingInlineStart: `${depth * 14 + 6}px` }}
                className={`group relative flex items-center justify-between py-1.5 px-2 rounded-xl text-xs transition-all cursor-pointer select-none ${
                  isDragOver
                    ? 'bg-amber-100 dark:bg-amber-950/60 ring-2 ring-amber-500 scale-[1.02]'
                    : isSelected
                    ? 'bg-[#2E4034] text-white font-bold shadow-xs'
                    : 'hover:bg-muted/60 text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => onSelectFolder(f.id)}
                onDragOver={(e) => handleDragOver(e, f.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, f.id)}
              >
                <div className="flex items-center gap-1.5 truncate flex-1 min-w-0">
                  {hasChildren ? (
                    <button
                      type="button"
                      onClick={(e) => toggleExpand(f.id, e)}
                      className={`p-0.5 rounded hover:bg-black/10 shrink-0 ${isSelected ? 'text-white' : 'text-muted-foreground'}`}
                    >
                      <ArrowIcon className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <span className="w-4 shrink-0" />
                  )}

                  {isSelected || isExpanded ? (
                    <FolderOpen className={`h-4 w-4 shrink-0 ${isSelected ? 'text-white' : 'text-amber-500'}`} />
                  ) : (
                    <Folder className={`h-4 w-4 shrink-0 ${isSelected ? 'text-white' : 'text-amber-500'}`} />
                  )}

                  <span className="truncate">{f.name}</span>
                </div>

                <div className="flex items-center gap-1 shrink-0 ms-1">
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                      isSelected ? 'bg-white/20 text-white font-bold' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {reportCount}
                  </span>

                  {/* Actions Dropdown Toggle using Radix/shadcn DropdownMenu */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        onClick={(e) => e.stopPropagation()}
                        className={`p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100 data-[state=open]:opacity-100 ${
                          isSelected ? 'hover:bg-white/20 text-white' : 'hover:bg-muted text-muted-foreground'
                        }`}
                        title={isAr ? 'خيارات المجلد' : 'Folder options'}
                      >
                        <MoreVertical className="h-3.5 w-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align={isAr ? 'start' : 'end'}
                      className="w-44"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {onNewReportInFolder && (
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            onNewReportInFolder(f.id);
                          }}
                          className="cursor-pointer gap-2"
                        >
                          <FilePlus className="h-3.5 w-3.5 text-emerald-600" />
                          <span>{isAr ? 'تقرير جديد' : 'New Report'}</span>
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          onCreateFolder(f.id);
                        }}
                        className="cursor-pointer gap-2"
                      >
                        <FolderPlus className="h-3.5 w-3.5 text-emerald-600" />
                        <span>{isAr ? 'مجلد فرعي جديد' : 'New Subfolder'}</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          onRenameFolder(f);
                        }}
                        className="cursor-pointer gap-2"
                      >
                        <Edit2 className="h-3.5 w-3.5 text-blue-600" />
                        <span>{isAr ? 'إعادة تسمية' : 'Rename'}</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          onMoveFolder(f);
                        }}
                        className="cursor-pointer gap-2"
                      >
                        <Move className="h-3.5 w-3.5 text-amber-600" />
                        <span>{isAr ? 'نقل المجلد' : 'Move Folder'}</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteFolder(f);
                        }}
                        className="cursor-pointer gap-2 text-rose-600 focus:text-rose-600 focus:bg-rose-50 dark:focus:bg-rose-950/40"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>{isAr ? 'حذف المجلد' : 'Delete'}</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {isExpanded && renderTreeNodes(f.id, depth + 1)}
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* Top Header & New Folder Button */}
      <div className="flex items-center justify-between gap-2 px-1">
        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
          {isAr ? 'المجلدات والتصنيفات' : 'Folders'}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onCreateFolder(null)}
          className="h-7 gap-1 px-2 rounded-lg text-xs font-semibold"
          title={isAr ? 'إنشاء مجلد رئيسي جديد' : 'Create new root folder'}
        >
          <FolderPlus className="h-3.5 w-3.5 text-amber-600" />
          <span>{isAr ? 'مجلد جديد' : 'New Folder'}</span>
        </Button>
      </div>

      {/* Main Standard Nav Items */}
      <div className="space-y-0.5">
        {/* All Reports */}
        <div
          onClick={() => onSelectFolder('all')}
          className={`flex items-center justify-between py-1.5 px-2.5 rounded-xl text-xs transition-colors cursor-pointer select-none ${
            selectedFolderId === 'all'
              ? 'bg-[#2E4034] text-white font-bold shadow-xs'
              : 'hover:bg-muted/60 text-muted-foreground hover:text-foreground'
          }`}
        >
          <div className="flex items-center gap-2">
            <Layers className={`h-4 w-4 shrink-0 ${selectedFolderId === 'all' ? 'text-white' : 'text-slate-500'}`} />
            <span>{isAr ? 'كافة التقارير (شامل)' : 'All Reports'}</span>
          </div>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
              selectedFolderId === 'all' ? 'bg-white/20 text-white font-bold' : 'bg-muted text-muted-foreground'
            }`}
          >
            {totalReportsCount}
          </span>
        </div>

        {/* Root / Uncategorized Reports */}
        <div
          onClick={() => onSelectFolder(null)}
          onDragOver={(e) => handleDragOver(e, 'root')}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, null)}
          className={`flex items-center justify-between py-1.5 px-2.5 rounded-xl text-xs transition-all cursor-pointer select-none ${
            dragOverFolderId === 'root'
              ? 'bg-amber-100 dark:bg-amber-950/60 ring-2 ring-amber-500 scale-[1.02]'
              : selectedFolderId === null
              ? 'bg-[#2E4034] text-white font-bold shadow-xs'
              : 'hover:bg-muted/60 text-muted-foreground hover:text-foreground'
          }`}
        >
          <div className="flex items-center gap-2">
            <Home className={`h-4 w-4 shrink-0 ${selectedFolderId === null ? 'text-white' : 'text-slate-500'}`} />
            <span>{isAr ? 'بدون مجلد (الجذر)' : 'Uncategorized (Root)'}</span>
          </div>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
              selectedFolderId === null ? 'bg-white/20 text-white font-bold' : 'bg-muted text-muted-foreground'
            }`}
          >
            {rootReportsCount}
          </span>
        </div>
      </div>

      <div className="border-t border-border/70 my-2" />

      {/* Folders Tree Nodes */}
      <div className="space-y-0.5">
        {folders.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 p-3 text-center text-[11px] text-muted-foreground">
            {isAr ? 'لا توجد مجلدات بعد. يمكنك إنشاء مجلد لتنظيم تقاريرك.' : 'No folders yet. Create folders to organize your reports.'}
          </div>
        ) : (
          renderTreeNodes(null, 0)
        )}
      </div>
    </div>
  );
}

function ChevronLeftIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}
