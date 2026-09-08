'use client';

import React from 'react';
import { Home, ChevronLeft, ChevronRight, Folder, FolderOpen } from 'lucide-react';
import { FolderItem } from '@/lib/types';
import { useLanguage } from '@/lib/i18n/LanguageContext';

interface FolderBreadcrumbProps {
  currentFolderId: string | null;
  folders: FolderItem[];
  onNavigate: (folderId: string | null) => void;
}

export function FolderBreadcrumb({
  currentFolderId,
  folders,
  onNavigate,
}: FolderBreadcrumbProps) {
  const { lang } = useLanguage();
  const isAr = lang === 'ar';
  const SeparatorIcon = isAr ? ChevronLeft : ChevronRight;

  // Build trail from current folder up to root
  const trail: FolderItem[] = [];
  if (currentFolderId) {
    const map = new Map<string, FolderItem>();
    folders.forEach((f) => map.set(f.id, f));

    let curr: string | null = currentFolderId;
    const visited = new Set<string>();

    while (curr && !visited.has(curr)) {
      visited.add(curr);
      const f = map.get(curr);
      if (f) {
        trail.unshift(f);
        curr = f.parentId || null;
      } else {
        break;
      }
    }
  }

  return (
    <nav aria-label="Breadcrumb" className="flex items-center flex-wrap gap-1.5 text-xs text-muted-foreground">
      {/* Root / All Reports */}
      <button
        type="button"
        onClick={() => onNavigate(null)}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-lg transition-colors hover:bg-muted hover:text-foreground font-medium ${
          currentFolderId === null ? 'bg-muted/70 text-foreground font-bold' : ''
        }`}
      >
        <Home className="h-3.5 w-3.5" />
        <span>{isAr ? 'الرئيسية (كافة التقارير)' : 'All Reports'}</span>
      </button>

      {trail.map((folder, index) => {
        const isLast = index === trail.length - 1;
        return (
          <React.Fragment key={folder.id}>
            <SeparatorIcon className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
            <button
              type="button"
              onClick={() => onNavigate(folder.id)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-lg transition-colors hover:bg-muted hover:text-foreground font-medium max-w-[160px] truncate ${
                isLast ? 'bg-muted/70 text-foreground font-bold' : ''
              }`}
              title={folder.name}
            >
              {isLast ? (
                <FolderOpen className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
              ) : (
                <Folder className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              )}
              <span className="truncate">{folder.name}</span>
            </button>
          </React.Fragment>
        );
      })}
    </nav>
  );
}
