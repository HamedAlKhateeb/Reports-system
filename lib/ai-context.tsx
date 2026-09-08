'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { usePathname } from 'next/navigation';

export interface SystemStats {
  totalReports: number;
  openIssuesCount: number;
  criticalIssuesCount: number;
}

export interface ActiveReportState {
  id: string;
  title: string;
  content: string; // Parsed markdown or plain text extract
  folder?: string;
  createdAt?: string;
  updatedAt?: string;
  selection?: string;
  issues: Array<{ id: string; title: string; severity: string; status: string }>;
}

export interface AIAssistantRuntimeContext {
  route: string;
  entityType: 'report' | 'issue_board' | 'global';
  activeReport?: ActiveReportState;
  systemStats?: SystemStats;
}

// Backward compatibility alias
export type ActiveContext = AIAssistantRuntimeContext;

export interface ActiveReportInput {
  id: string;
  title: string;
  contentJson?: any;
  plainText?: string;
  folder?: string;
  createdAt?: string;
  updatedAt?: string;
  selection?: string;
  issues?: Array<{ id: string; title: string; severity: string; status: string }>;
}

export interface AIContextType {
  context: AIAssistantRuntimeContext;
  runtimeContext: AIAssistantRuntimeContext;
  setActiveReportInfo: (info: ActiveReportInput | null) => void;
  updateActiveReportContent: (contentJson: any) => void;
  setSystemStats: (stats: SystemStats) => void;
  harvestContext: () => AIAssistantRuntimeContext;
  generateSystemPrompt: () => string;
}

const AIContext = createContext<AIContextType | null>(null);

/**
 * Extracts clean, human-readable markdown/text from TipTap JSON structure,
 * strictly omitting raw HTML, massive base64 payloads, and binary data
 * to optimize token usage and avoid context window overflow.
 */
export function extractCleanTextFromTipTap(node: any, maxLen: number = 6000): string {
  if (!node) return '';

  const chunks: string[] = [];

  function traverse(n: any) {
    if (!n) return;

    if (n.type === 'text') {
      chunks.push(n.text || '');
      return;
    }

    if (n.type === 'heading') {
      const level = n.attrs?.level || 1;
      const prefix = '#'.repeat(level) + ' ';
      chunks.push('\n' + prefix);
      if (Array.isArray(n.content)) n.content.forEach(traverse);
      chunks.push('\n');
      return;
    }

    if (n.type === 'paragraph') {
      chunks.push('\n');
      if (Array.isArray(n.content)) n.content.forEach(traverse);
      chunks.push('\n');
      return;
    }

    if (n.type === 'listItem') {
      chunks.push('\n- ');
      if (Array.isArray(n.content)) n.content.forEach(traverse);
      return;
    }

    if (n.type === 'table') {
      chunks.push('\n[جدول / Table]\n');
      if (Array.isArray(n.content)) n.content.forEach(traverse);
      chunks.push('\n');
      return;
    }

    if (n.type === 'tableRow') {
      chunks.push('\n| ');
      if (Array.isArray(n.content)) {
        n.content.forEach((cell: any) => {
          traverse(cell);
          chunks.push(' | ');
        });
      }
      return;
    }

    if (n.type === 'tableCell' || n.type === 'tableHeader') {
      if (Array.isArray(n.content)) n.content.forEach(traverse);
      return;
    }

    if (n.type === 'reportImage') {
      const caption = n.attrs?.caption;
      const fileName = n.attrs?.fileName || 'صورة';
      chunks.push(` [صورة / Image: ${caption || fileName}] `);
      return;
    }

    if (Array.isArray(n.content)) {
      n.content.forEach(traverse);
    }
  }

  traverse(node);

  let result = chunks
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Strip any inline base64 remnants if present
  result = result.replace(/data:image\/[^;]+;base64,[a-zA-Z0-9+/=]+/g, '[Image Data]');

  // Truncate to protect AI context window
  if (result.length > maxLen) {
    result = result.slice(0, maxLen) + '\n\n... [تم اختصار باقي المحتوى لتوفير مساحة السياق / Content truncated for token efficiency]';
  }

  return result;
}

export function buildAiSystemPrompt(context: AIAssistantRuntimeContext): string {
  let reportBlock = 'No active report currently opened.';
  if (context.activeReport) {
    reportBlock = `
- ID: "${context.activeReport.id}"
- Title: "${context.activeReport.title}"
- Folder: "${context.activeReport.folder || 'root'}"
- Created: ${context.activeReport.createdAt || 'N/A'} | Updated: ${context.activeReport.updatedAt || 'N/A'}
- Active Highlighted/Selected Text: ${context.activeReport.selection ? `"${context.activeReport.selection}"` : 'None (No text highlighted)'}
- Report Content Extract:
${context.activeReport.content}
- Linked Issues:
${JSON.stringify(context.activeReport.issues || [], null, 2)}
    `.trim();
  }

  const statsBlock = context.systemStats
    ? `
- Total System Reports: ${context.systemStats.totalReports}
- Total Open Issues: ${context.systemStats.openIssuesCount}
- Critical Issues: ${context.systemStats.criticalIssuesCount}
    `.trim()
    : '- System stats not yet loaded.';

  return `
You are the Executive AI Report Analyst & Autonomous Copilot for the "Review Reports & Issue Tracker" system.

CURRENT RUNTIME CONTEXT:
- Current Route: ${context.route}
- Interface Mode: ${context.entityType}

SYSTEM SUMMARY METRICS:
${statsBlock}

ACTIVE REPORT CONTEXT:
${reportBlock}

AVAILABLE AGENT TOOLS:
You have write and query access to the system via the following 4 structured tools:

CRITICAL REPORT SAFETY RULES:
- NEVER call update_report_content unless the user explicitly and directly requests to edit, insert, or modify the active document.
- NEVER use 'replace_all' unless the user explicitly and unequivocally commands: "استبدل كل محتوى التقرير" or "امسح التقرير الحالي واستبدله بـ".
- For answering questions, discussions, summaries, reviews, MQM audits, translations, or advice: respond in chat conversation text ONLY. Do NOT call update_report_content.
- When user asks to add a section, table, or recommendations, use mode: 'append'.
- When asked to create a new report, use create_new_report, NEVER wipe the active report.

1. update_report_content:
   - Parameters:
     * mode: 'replace_all' | 'append' | 'prepend' | 'replace_selection'
     * content: string (The text / markdown / HTML to insert or replace)
   - Use 'replace_selection' when the user asks to rewrite, improve, expand, or translate the currently highlighted text in the editor.
   - Use 'append' to add a new section, table, or paragraph to the bottom of the active report (preferred mode for adding content).
   - Use 'prepend' to add content at the top.
   - Use 'replace_all' ONLY when user explicitly asks to wipe and overwrite the entire report.

2. create_new_report:
   - Parameters:
     * title: string
     * folder: string (optional, defaults to "root")
     * content: string (initial markdown/text content)
     * autoRedirect: boolean (if true, immediately navigates to the newly created report)

3. create_kanban_issue:
   - Parameters:
     * title: string
     * description: string
     * severity: 'حرجة' | 'كبيرة' | 'متوسطة' | 'عادية' | 'طفيفة'
     * status: 'مفتوحة' | 'قيد التنفيذ' | 'مكتملة' (defaults to 'مفتوحة')
     * reportId: string (optional, defaults to active report if open)

4. query_system_data:
   - Parameters:
     * target: 'all_reports_metadata' | 'all_issues' | 'specific_report_by_id'
     * filter: string (optional search keyword, issue status, or specific report ID)

When you need to execute a tool, output a structured JSON block enclosed in triple backticks:
\`\`\`tool_call
{
  "name": "update_report_content",
  "parameters": {
    "mode": "append",
    "content": "..."
  }
}
\`\`\`
(You may output multiple \`\`\`tool_call blocks if multiple operations are requested).
`.trim();
}

export function AIContextProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [activeReportInfo, setActiveReportInfoState] = useState<ActiveReportInput | null>(null);
  const activeReportInfoRef = useRef<ActiveReportInput | null>(null);
  activeReportInfoRef.current = activeReportInfo;

  const [editorSelection, setEditorSelection] = useState<string>('');
  const [systemStats, setSystemStatsState] = useState<SystemStats | undefined>(undefined);

  // Derive entity type based on route
  const entityType: 'report' | 'issue_board' | 'global' = useMemo(() => {
    if (!pathname) return 'global';
    if (pathname.startsWith('/reports/') && pathname !== '/reports') return 'report';
    if (pathname === '/dashboard') return 'issue_board';
    return 'global';
  }, [pathname]);

  // Listen to editor selection changes
  useEffect(() => {
    const handleSelectionChange = (e: any) => {
      const sel = e.detail?.selection || '';
      setEditorSelection(sel);
    };

    window.addEventListener('editor-selection-changed', handleSelectionChange);
    return () => {
      window.removeEventListener('editor-selection-changed', handleSelectionChange);
    };
  }, []);

  // Clear active report when navigating away from report detail page
  useEffect(() => {
    if (!pathname?.startsWith('/reports/')) {
      setActiveReportInfoState(null);
      setEditorSelection('');
    }
  }, [pathname]);

  const setActiveReportInfo = useCallback((info: ActiveReportInput | null) => {
    setActiveReportInfoState(info);
  }, []);

  const updateActiveReportContent = useCallback((contentJson: any) => {
    setActiveReportInfoState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        contentJson,
        plainText: extractCleanTextFromTipTap(contentJson),
      };
    });
  }, []);

  const setSystemStats = useCallback((stats: SystemStats) => {
    setSystemStatsState(stats);
  }, []);

  const harvestContext = useCallback((): AIAssistantRuntimeContext => {
    const current = activeReportInfoRef.current;
    let activeReport: ActiveReportState | undefined = undefined;

    if (current) {
      const cleanContent =
        current.plainText ||
        (current.contentJson ? extractCleanTextFromTipTap(current.contentJson) : '');

      activeReport = {
        id: current.id,
        title: current.title,
        content: cleanContent || 'التقرير لا يحتوي على نص حتى الآن.',
        folder: current.folder || 'root',
        createdAt: current.createdAt,
        updatedAt: current.updatedAt,
        selection: editorSelection || current.selection || '',
        issues: current.issues || [],
      };
    }

    return {
      route: pathname || '/',
      entityType,
      activeReport,
      systemStats,
    };
  }, [pathname, entityType, editorSelection, systemStats]);

  const generateSystemPrompt = useCallback((): string => {
    const ctx = harvestContext();
    return buildAiSystemPrompt(ctx);
  }, [harvestContext]);

  const currentContext = useMemo((): AIAssistantRuntimeContext => {
    return harvestContext();
  }, [harvestContext]);

  const value = useMemo(
    () => ({
      context: currentContext,
      runtimeContext: currentContext,
      setActiveReportInfo,
      updateActiveReportContent,
      setSystemStats,
      harvestContext,
      generateSystemPrompt,
    }),
    [currentContext, setActiveReportInfo, updateActiveReportContent, setSystemStats, harvestContext, generateSystemPrompt]
  );

  return <AIContext.Provider value={value}>{children}</AIContext.Provider>;
}

export function useAIContext(): AIContextType {
  const context = useContext(AIContext);
  if (!context) {
    throw new Error('useAIContext must be used within an AIContextProvider');
  }
  return context;
}
