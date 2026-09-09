'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  Bot,
  Send,
  Paperclip,
  X,
  FileText,
  FileCode,
  FileDown,
  Sparkles,
  CheckCircle2,
  ExternalLink,
  Trash2,
  Loader2,
  PlusCircle,
  Settings,
  ChevronDown,
  ChevronUp,
  PanelRightClose,
  Check,
  ShieldCheck,
  AlertCircle,
  Database,
  RotateCcw,
  AlertTriangle,
  EyeOff,
} from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useAuth } from '@/lib/auth-context';
import { createReport, createIssue, updateReport, updateIssue, getReports, getReportById, getIssues } from '@/lib/db';
import { ReportItem, IssueItem, IssueStatus } from '@/lib/types';
import { getTemplateContent, TemplateType } from '@/components/editor/templates';
import {
  AiProviderConfig,
  AI_CONFIG_KEY,
  getLocalAiConfig,
  getAiProviderConfig,
  saveAiProviderConfig,
  saveAiAssistantVisible,
} from '@/lib/ai-config';
import { useAIContext, buildAiSystemPrompt, extractCleanTextFromTipTap, ActiveContext } from '@/lib/ai-context';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

export type { AiProviderConfig };
export { AI_CONFIG_KEY };

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachmentName?: string;
  actionData?: any;
  toolCalls?: Array<{ name: string; parameters: any }>;
}

interface AiAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportId?: string;
}

export function AiAssistantModal({ isOpen, onClose, reportId }: AiAssistantModalProps) {
  const { lang, t } = useLanguage();
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { harvestContext, context: liveContext, setSystemStats } = useAIContext();

  const isAr = lang === 'ar';

  // Config State
  const [providerConfig, setProviderConfig] = useState<AiProviderConfig>({
    provider: 'gemini',
    modelName: 'gemini-1.5-flash',
    apiKey: '',
    baseUrl: '',
  });
  const [showSettingsAccordion, setShowSettingsAccordion] = useState(false);
  const [configSavedNotice, setConfigSavedNotice] = useState(false);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: t('aiWelcomeMessage'),
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);
  const [attachedFile, setAttachedFile] = useState<{
    name: string;
    type: string;
    base64?: string;
    text?: string;
  } | null>(null);

  const [createdReports, setCreatedReports] = useState<Record<string, string>>({});
  const [createdIssues, setCreatedIssues] = useState<Record<string, number>>({});
  const [appliedModifications, setAppliedModifications] = useState<Record<string, { type: 'issue' | 'report'; id: string; success: boolean }>>({});
  const [dismissedModifications, setDismissedModifications] = useState<Record<string, boolean>>({});
  const [appliedContentUpdates, setAppliedContentUpdates] = useState<
    Record<string, { applied: boolean; reverted: boolean; backupSnapshot?: any }>
  >({});
  const [dismissedContentUpdates, setDismissedContentUpdates] = useState<Record<string, boolean>>({});
  const [actionLoadingMsgId, setActionLoadingMsgId] = useState<string | null>(null);

  // Context State
  const [currentReport, setCurrentReport] = useState<ReportItem | null>(null);
  const [includeCurrentReportContext, setIncludeCurrentReportContext] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load provider configuration on mount and on open
  useEffect(() => {
    // Synchronous immediate load from cache
    const initial = getLocalAiConfig(user?.uid);
    setProviderConfig(initial);

    // Asynchronous sync from Firestore user_settings
    if (isOpen) {
      getAiProviderConfig(user?.uid)
        .then((cfg) => {
          if (cfg.apiKey || cfg.provider) {
            setProviderConfig((prev) => ({ ...prev, ...cfg }));
          }
        })
        .catch((e) => console.warn('Could not sync AI config', e));
    }
  }, [isOpen, user?.uid]);

  // Determine active report ID from prop or URL
  const effectiveReportId =
    reportId || (pathname?.startsWith('/reports/') ? pathname.split('/')[2] : undefined);

  useEffect(() => {
    if (!effectiveReportId || effectiveReportId === 'new') {
      setCurrentReport(null);
      return;
    }
    let isMounted = true;
    getReportById(effectiveReportId)
      .then((rep) => {
        if (isMounted) setCurrentReport(rep);
      })
      .catch((err) => console.warn('Could not fetch current report context', err));
    return () => {
      isMounted = false;
    };
  }, [effectiveReportId, isOpen]);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, sending, isOpen]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveAiProviderConfig(providerConfig, user?.uid);
      setConfigSavedNotice(true);
      setTimeout(() => setConfigSavedNotice(false), 2000);
      setShowSettingsAccordion(false);
    } catch (err) {
      console.error('Failed to save AI config', err);
    }
  };

  if (!isOpen) return null;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.name.endsWith('.pdf')) {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        setAttachedFile({
          name: file.name,
          type: 'application/pdf',
          base64,
        });
      };
      reader.readAsDataURL(file);
    } else if (file.name.endsWith('.docx')) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const JSZip = (await import('jszip')).default;
        const zip = await JSZip.loadAsync(arrayBuffer);
        const docXml = await zip.file('word/document.xml')?.async('text');
        if (docXml) {
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(docXml, 'text/xml');
          const pNodes = xmlDoc.getElementsByTagName('w:p');
          const lines: string[] = [];
          for (let i = 0; i < pNodes.length; i++) {
            const tNodes = pNodes[i].getElementsByTagName('w:t');
            let pText = '';
            for (let j = 0; j < tNodes.length; j++) {
              pText += tNodes[j].textContent || '';
            }
            if (pText.trim()) {
              lines.push(pText.trim());
            }
          }
          const text = lines.join('\n');
          setAttachedFile({
            name: file.name,
            type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            text: text || 'مستند Word تم استخراجه بنجاح.',
          });
        } else {
          throw new Error('document.xml not found');
        }
      } catch (docxErr) {
        console.warn('DOCX extraction fallback:', docxErr);
        const text = await file.text().catch(() => '');
        setAttachedFile({
          name: file.name,
          type: 'text/plain',
          text,
        });
      }
    } else {
      const text = await file.text();
      setAttachedFile({
        name: file.name,
        type: file.type || 'text/plain',
        text,
      });
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const getSeverityBadgeVariant = (severity?: string): 'destructive' | 'default' | 'secondary' | 'outline' => {
    const s = (severity || '').toLowerCase();
    if (s === 'critical' || s === 'حرجة') return 'destructive';
    if (s === 'major' || s === 'كبيرة') return 'default';
    if (s === 'medium' || s === 'متوسطة') return 'secondary';
    if (s === 'normal' || s === 'عادية') return 'secondary';
    return 'outline';
  };

  // Tool 1: update_report_content (Safe proposal handler with automatic backup and undo)
  const handleApplyContentUpdate = async (
    updateKey: string,
    parameters: { mode?: string; content?: string }
  ) => {
    const mode = parameters.mode || 'append';
    const content = parameters.content || '';

    let snapshot = (window as any).__lastReportAiSnapshot || currentReport?.contentJson || null;
    if (typeof window !== 'undefined' && effectiveReportId) {
      try {
        const localSaved = localStorage.getItem(`report_ai_backup_${effectiveReportId}`);
        if (localSaved) {
          snapshot = JSON.parse(localSaved);
        }
      } catch (_) {}
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('ai-update-report-content', {
          detail: {
            mode,
            content,
            onSnapshotSaved: (snap: any) => {
              snapshot = snap;
              setAppliedContentUpdates((prev) => ({
                ...prev,
                [updateKey]: { applied: true, reverted: false, backupSnapshot: snap },
              }));
            },
          },
        })
      );
    }

    setAppliedContentUpdates((prev) => ({
      ...prev,
      [updateKey]: { applied: true, reverted: false, backupSnapshot: snapshot },
    }));

    toast.success(
      isAr ? 'تم تطبيق التعديل على محتوى التقرير بنجاح' : 'Report content updated successfully'
    );
  };

  const handleRevertContentUpdate = async (updateKey: string) => {
    const record = appliedContentUpdates[updateKey];
    let snapshot = record?.backupSnapshot;

    if (!snapshot && typeof window !== 'undefined' && effectiveReportId) {
      try {
        const localSaved = localStorage.getItem(`report_ai_backup_${effectiveReportId}`);
        if (localSaved) {
          snapshot = JSON.parse(localSaved);
        }
      } catch (_) {}
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('ai-revert-report-content', {
          detail: { snapshot },
        })
      );
    }

    setAppliedContentUpdates((prev) => ({
      ...prev,
      [updateKey]: { applied: true, reverted: true, backupSnapshot: snapshot },
    }));

    toast.success(
      isAr
        ? 'تم التراجع عن تعديل المساعد الذكي واستعادة المحتوى السابق بنجاح'
        : 'Reverted AI modification and restored previous content successfully'
    );
  };

  // Tool 2: create_new_report
  const executeCreateNewReport = async (parameters: {
    title?: string;
    folder?: string;
    content?: string;
    autoRedirect?: boolean;
  }): Promise<string | null> => {
    if (!user) return null;
    const repTitle = parameters.title || (isAr ? 'مسودة تقرير جديد' : 'New Report Draft');
    const folder = parameters.folder && parameters.folder !== 'root' ? parameters.folder : null;
    const rawContent = parameters.content || '';

    const contentLines = rawContent.split('\n');
    const contentNodes: any[] = [];
    contentLines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      if (trimmed.startsWith('# ')) {
        contentNodes.push({
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: trimmed.slice(2).trim() }],
        });
      } else if (trimmed.startsWith('## ')) {
        contentNodes.push({
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: trimmed.slice(3).trim() }],
        });
      } else if (trimmed.startsWith('### ')) {
        contentNodes.push({
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: trimmed.slice(4).trim() }],
        });
      } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        contentNodes.push({
          type: 'paragraph',
          content: [{ type: 'text', text: '• ' + trimmed.slice(2).trim() }],
        });
      } else {
        contentNodes.push({
          type: 'paragraph',
          content: [{ type: 'text', text: trimmed }],
        });
      }
    });

    const contentJson = {
      type: 'doc',
      content:
        contentNodes.length > 0
          ? contentNodes
          : [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: rawContent || (isAr ? 'محتوى التقرير...' : 'Report content...') }],
              },
            ],
    };

    const created = await createReport({
      title: repTitle,
      language: lang,
      author: user.displayName || user.email?.split('@')[0] || 'المراجع',
      systemUnderReview: isAr ? 'النظام الأساسي' : 'Core Platform',
      contentJson,
      folderId: folder,
      ownerUid: user.uid,
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('report-created', {
          detail: { reportId: created.id },
        })
      );
    }

    toast.success(isAr ? `تم إنشاء تقرير جديد: ${repTitle}` : `Created new report: ${repTitle}`);

    return created.id;
  };

  // Tool 3: create_kanban_issue
  const executeCreateKanbanIssue = async (parameters: {
    title?: string;
    description?: string;
    severity?: string;
    status?: string;
    reportId?: string;
  }) => {
    if (!user) return;
    const issueTitle = parameters.title || (isAr ? 'مشكلة مرصودة جديدة' : 'New Logged Issue');
    const description = parameters.description || '';

    let normSeverity: 'critical' | 'major' | 'medium' | 'normal' | 'minor' = 'medium';
    const rawSev = (parameters.severity || '').toLowerCase();
    if (rawSev === 'حرجة' || rawSev === 'critical') normSeverity = 'critical';
    else if (rawSev === 'كبيرة' || rawSev === 'major') normSeverity = 'major';
    else if (rawSev === 'متوسطة' || rawSev === 'medium') normSeverity = 'medium';
    else if (rawSev === 'عادية' || rawSev === 'normal') normSeverity = 'normal';
    else if (rawSev === 'طفيفة' || rawSev === 'minor') normSeverity = 'minor';

    let normStatus: IssueStatus = 'open';
    const rawStat = (parameters.status || '').toLowerCase();
    if (rawStat === 'مفتوحة' || rawStat === 'open') normStatus = 'open';
    else if (rawStat === 'قيد التنفيذ' || rawStat === 'in_progress') normStatus = 'in_progress';
    else if (rawStat === 'مكتملة' || rawStat === 'completed' || rawStat === 'done') normStatus = 'done';

    const linkedRepId =
      parameters.reportId ||
      currentReport?.id ||
      (pathname?.startsWith('/reports/') ? pathname.split('/')[2] : null);

    const newIssue = await createIssue({
      title: issueTitle,
      description,
      severity: normSeverity,
      status: normStatus,
      linkedReportId: linkedRepId || null,
      ownerUid: user.uid,
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('issue-created', {
          detail: { count: 1, issue: newIssue },
        })
      );
    }

    toast.success(isAr ? `تم رصد مشكلة: ${issueTitle}` : `Issue logged: ${issueTitle}`);
  };

  // Tool 4: query_system_data
  const executeQuerySystemData = async (parameters: { target?: string; filter?: string }) => {
    const target = parameters.target || 'all_reports_metadata';
    const filter = parameters.filter || '';
    let dataSlice: any = null;

    if (target === 'all_reports_metadata') {
      const allReps = await getReports(user?.uid).catch(() => []);
      let filtered = allReps;
      if (filter && filter.trim()) {
        const q = filter.toLowerCase().trim();
        filtered = allReps.filter(
          (r) => r.title?.toLowerCase().includes(q) || r.author?.toLowerCase().includes(q)
        );
      }
      dataSlice = filtered.slice(0, 15).map((r) => ({
        id: r.id,
        reportNumber: r.reportNumber,
        title: r.title,
        author: r.author,
        createdAt: r.createdAt,
        folderId: r.folderId,
      }));
    } else if (target === 'all_issues') {
      const issues = await getIssues(user?.uid).catch(() => []);
      let filtered = issues;
      if (filter && filter.trim()) {
        const q = filter.toLowerCase().trim();
        filtered = issues.filter(
          (i) =>
            i.title?.toLowerCase().includes(q) ||
            i.severity?.toLowerCase().includes(q) ||
            i.status?.toLowerCase().includes(q) ||
            i.description?.toLowerCase().includes(q)
        );
      }
      dataSlice = filtered.slice(0, 20).map((i) => ({
        id: i.id,
        title: i.title,
        severity: i.severity,
        status: i.status,
        linkedReportId: i.linkedReportId,
      }));
    } else if (target === 'specific_report_by_id') {
      const repId = filter || currentReport?.id;
      if (repId) {
        const rep = await getReportById(repId, user?.uid).catch(() => null);
        if (rep) {
          dataSlice = {
            id: rep.id,
            reportNumber: rep.reportNumber,
            title: rep.title,
            author: rep.author,
            systemUnderReview: rep.systemUnderReview,
            contentSummary: extractCleanTextFromTipTap(rep.contentJson, 2500),
            createdAt: rep.createdAt,
          };
        }
      }
    }

    return dataSlice;
  };

  const handleSendMessage = async (textToSend?: string) => {
    const query = textToSend || inputValue;
    if (!query.trim() && !attachedFile) return;

    const userMessage: Message = {
      id: 'msg_' + Date.now(),
      role: 'user',
      content: query || (attachedFile ? `${t('attachDocument')}: ${attachedFile.name}` : ''),
      attachmentName: attachedFile?.name,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    const currentAttachment = attachedFile;
    setAttachedFile(null);
    setSending(true);

    try {
      // Gather context & harvest live state
      const activeContext = harvestContext();

      let currentReportContext: any = undefined;
      if (includeCurrentReportContext) {
        if (activeContext.activeReport) {
          currentReportContext = {
            id: activeContext.activeReport.id,
            reportNumber: currentReport?.reportNumber || 'N/A',
            title: activeContext.activeReport.title,
            author: currentReport?.author,
            systemUnderReview: currentReport?.systemUnderReview,
            contentPreview: activeContext.activeReport.content,
          };
        } else if (currentReport) {
          currentReportContext = {
            id: currentReport.id,
            reportNumber: currentReport.reportNumber,
            title: currentReport.title,
            author: currentReport.author,
            systemUnderReview: currentReport.systemUnderReview,
            contentPreview: extractCleanTextFromTipTap(currentReport.contentJson),
          };
        }
      }

      // Always fetch user's live issues and reports for complete context
      const [issues, allReps] = await Promise.all([
        getIssues(user?.uid).catch(() => []),
        getReports(user?.uid).catch(() => []),
      ]);

      const totalReports = allReps.length;
      const openIssuesCount = issues.filter((i) => i.status === 'open').length;
      const criticalIssuesCount = issues.filter((i) => i.severity === 'critical').length;
      const liveStats = { totalReports, openIssuesCount, criticalIssuesCount };
      setSystemStats(liveStats);

      const issuesSummary = issues.map((iss) => ({
        id: iss.id,
        title: iss.title,
        status: iss.status,
        severity: iss.severity,
        description: iss.description,
        linkedReportId: iss.linkedReportId,
      }));

      const allReportsSummary = allReps.map((r) => ({
        id: r.id,
        reportNumber: r.reportNumber,
        title: r.title,
        author: r.author,
        systemUnderReview: r.systemUnderReview,
        createdAt: r.createdAt,
      }));

      // Enrich activeContext with related issues and system stats
      const activeRepId = activeContext.activeReport?.id || currentReport?.id;
      const effectiveIssues = activeContext.activeReport?.issues?.length
        ? activeContext.activeReport.issues
        : activeRepId
        ? issuesSummary
            .filter((i) => i.linkedReportId === activeRepId)
            .map((i) => ({ id: i.id, title: i.title, severity: i.severity, status: i.status }))
        : [];

      const enrichedActiveContext: ActiveContext = {
        ...activeContext,
        systemStats: liveStats,
        activeReport: activeContext.activeReport
          ? {
              ...activeContext.activeReport,
              issues: effectiveIssues,
            }
          : currentReportContext
          ? {
              id: currentReportContext.id,
              title: currentReportContext.title,
              content: currentReportContext.contentPreview || '',
              issues: effectiveIssues,
            }
          : undefined,
      };

      const systemPrompt = buildAiSystemPrompt(enrichedActiveContext);

      // Read freshest config from storage in case it was updated in settings
      let activeConfig = { ...providerConfig };
      try {
        const saved = localStorage.getItem(AI_CONFIG_KEY);
        if (saved) {
          activeConfig = { ...activeConfig, ...JSON.parse(saved) };
        }
      } catch (_) {}

      // Filter out the welcome message so payload starts strictly with user turn
      const historyToSend = [...messages, userMessage]
        .filter((m) => m.id !== 'welcome')
        .map((m) => ({
          role: m.role,
          content: m.content,
        }));

      const firstUserIndex = historyToSend.findIndex((m) => m.role === 'user');
      const sanitizedMessages = firstUserIndex >= 0 ? historyToSend.slice(firstUserIndex) : historyToSend;

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: sanitizedMessages,
          attachment: currentAttachment,
          provider: activeConfig.provider,
          modelName: activeConfig.modelName,
          apiKey: activeConfig.apiKey,
          baseUrl: activeConfig.baseUrl,
          systemPrompt,
          activeContext: enrichedActiveContext,
          context: {
            currentReport: currentReportContext,
            issuesSummary,
            allReportsSummary,
          },
        }),
      });

      if (!res.ok) {
        throw new Error(`AI request failed: ${res.status}`);
      }

      const data = await res.json();
      const rawReply = data.reply || '';

      // 1. Extract tool_call blocks if present
      const toolCalls: Array<{ name: string; parameters: any }> = [];
      const toolRegex = /```tool_call([\s\S]*?)```/g;
      let toolMatch;
      while ((toolMatch = toolRegex.exec(rawReply)) !== null) {
        try {
          const parsed = JSON.parse(toolMatch[1].trim());
          if (parsed && (parsed.name || parsed.tool)) {
            toolCalls.push({
              name: parsed.name || parsed.tool,
              parameters: parsed.parameters || parsed.args || {},
            });
          }
        } catch (err) {
          console.warn('Could not parse tool_call JSON from AI reply', err);
        }
      }

      // 2. Extract legacy json_action if present
      let actionData = null;
      const actionMatch = rawReply.match(/```json_action([\s\S]*?)```/);
      if (actionMatch && actionMatch[1]) {
        try {
          actionData = JSON.parse(actionMatch[1].trim());
        } catch (err) {
          console.warn('Could not parse action JSON from AI reply', err);
        }
      }

      // Clean markdown tags from display content
      const cleanedReply = rawReply
        .replace(/```tool_call[\s\S]*?```/g, '')
        .replace(/```json_action[\s\S]*?```/g, '')
        .trim();

      const assistantMsgId = 'reply_' + Date.now();
      const assistantMessage: Message = {
        id: assistantMsgId,
        role: 'assistant',
        content: cleanedReply,
        actionData,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // 3. Execute Structured Tools
      for (const tc of toolCalls) {
        if (tc.name === 'update_report_content') {
          // CRITICAL SAFEGUARD: Do NOT auto-execute content mutations!
          // The proposal is displayed interactively with approval and rollback controls.
        } else if (tc.name === 'create_new_report') {
          const newRepId = await executeCreateNewReport(tc.parameters);
          if (newRepId) {
            setCreatedReports((prev) => ({ ...prev, [assistantMsgId]: newRepId }));
          }
        } else if (tc.name === 'create_kanban_issue') {
          await executeCreateKanbanIssue(tc.parameters);
        } else if (tc.name === 'query_system_data') {
          const queryResult = await executeQuerySystemData(tc.parameters);
          if (queryResult) {
            setTimeout(() => {
              handleSendMessage(
                `[نتيجة استعلام بيانات النظام / System Query Result for "${tc.parameters.target}"]:\n${JSON.stringify(queryResult, null, 2)}`
              );
            }, 350);
          }
        } else if (
          tc.name === 'create_chart' ||
          tc.name === 'update_chart' ||
          tc.name === 'delete_chart' ||
          tc.name === 'change_chart_type' ||
          tc.name === 'update_chart_source'
        ) {
          // Chart tools execute against the live report editor (verified there).
          // Never requires HTML/SVG from the model.
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('chart-ai-action', { detail: { name: tc.name, params: tc.parameters } }));
          }
        }
      }
    } catch (err: any) {
      console.error('AI chat error:', err);
      setMessages((prev) => [
        ...prev,
        {
          id: 'err_' + Date.now(),
          role: 'assistant',
          content: isAr
            ? 'عذراً، حدث خطأ أثناء الاتصال بالمساعد الذكي. يرجى مراجعة إعدادات المزود والـ API في الأعلى.'
            : 'Sorry, an error occurred while contacting the AI assistant. Please check your provider and API settings above.',
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  // Action: Construct and Create Report from AI Action Data
  const handleCreateReport = async (reportData: any): Promise<string> => {
    if (!user) throw new Error('User not logged in');
    try {
      const repLang = reportData.language || lang;
      const isReportAr = repLang === 'ar';
      const title =
        reportData.title ||
        (isReportAr ? 'تقرير منشأ بواسطة المساعد الذكي' : 'AI Generated Report');
      const system =
        reportData.systemUnderReview ||
        (isReportAr ? 'المشروع العام' : 'General Project');

      // Construct rich TipTap JSON content
      const contentJson: { type: string; content: any[] } = {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [
              {
                type: 'text',
                text: isReportAr ? '1. الملخص التنفيذي' : '1. Executive Summary',
              },
            ],
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: reportData.summary || '' }],
          },
        ],
      };

      // Custom headers and rows if provided
      if (reportData.tableHeaders && reportData.tableRows) {
        contentJson.content.push(
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [
              {
                type: 'text',
                text: isReportAr ? '2. جدول البيانات والتحليل' : '2. Data & Analysis Table',
              },
            ],
          },
          {
            type: 'table',
            content: [
              {
                type: 'tableRow',
                content: reportData.tableHeaders.map((h: string) => ({
                  type: 'tableHeader',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: h }] }],
                })),
              },
              ...reportData.tableRows.map((row: string[]) => ({
                type: 'tableRow',
                content: row.map((cell: string) => ({
                  type: 'tableCell',
                  content: [
                    { type: 'paragraph', content: [{ type: 'text', text: String(cell || '') }] },
                  ],
                })),
              })),
            ],
          }
        );
      } else if (reportData.templateType) {
        const tpl = getTemplateContent(reportData.templateType as TemplateType, repLang);
        if (tpl?.content && tpl.content.length > 2) {
          contentJson.content.push(...tpl.content.slice(2));
        }
      } else if (reportData.issues && reportData.issues.length > 0) {
        contentJson.content.push(
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: isReportAr ? '2. تقرير أخطاء النظام' : '2. Software Defects Report' }],
          } as any,
          {
            type: 'table',
            content: [
              {
                type: 'tableRow',
                content: [
                  { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: t('colBugId') }] }] },
                  { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: t('colDefectDescription') }] }] },
                  { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: t('colStepsToReproduce') }] }] },
                  { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: t('colExpectedResult') }] }] },
                  { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: t('colActualResult') }] }] },
                  { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: t('colSeverity') }] }] },
                ],
              },
              ...reportData.issues.map((iss: any) => ({
                type: 'tableRow',
                content: [
                  { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: iss.id || 'BUG' }] }] },
                  { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: iss.description || '' }] }] },
                  { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: iss.steps || '' }] }] },
                  { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: iss.expected || '' }] }] },
                  { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: iss.actual || '' }] }] },
                  { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: iss.severity || 'major' }] }] },
                ],
              })),
            ],
          } as any
        );
      }

      // Add recommendations if provided
      if (reportData.recommendations && reportData.recommendations.length > 0) {
        contentJson.content.push(
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [
              {
                type: 'text',
                text: isReportAr ? '3. التوصيات وخطة العمل' : '3. Recommendations & Action Plan',
              },
            ],
          },
          {
            type: 'bulletList',
            content: reportData.recommendations.map((rec: string) => ({
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: rec }] }],
            })),
          }
        );
      }

      const created = await createReport({
        title,
        language: repLang,
        author: user.displayName || user.email.split('@')[0],
        systemUnderReview: system,
        contentJson,
        ownerUid: user.uid,
      });

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('report-created', {
            detail: { reportId: created.id },
          })
        );
      }

      return created.id;
    } catch (err) {
      console.error('Failed to create report from AI action', err);
      throw err;
    }
  };

  const handleExecuteCreateReport = async (msgId: string, reportData: any) => {
    try {
      setActionLoadingMsgId(msgId);
      const repId = await handleCreateReport(reportData);
      setCreatedReports((prev) => ({ ...prev, [msgId]: repId }));
    } catch (err) {
      console.error('Execution error:', err);
    } finally {
      setActionLoadingMsgId(null);
    }
  };

  // Action: Create Issues from AI Action Data
  const handleExecuteCreateIssues = async (msgId: string, issuesList: any[]) => {
    try {
      setActionLoadingMsgId(msgId);
      let count = 0;
      for (const item of issuesList) {
        await createIssue({
          title: item.title || 'AI Detected Defect',
          description: item.description || '',
          severity: item.severity || 'major',
          status: item.status || 'open',
          linkedReportId: currentReport?.id || null,
          ownerUid: user?.uid,
        });
        count++;
      }
      setCreatedIssues((prev) => ({ ...prev, [msgId]: count }));

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('issue-created', {
            detail: { count },
          })
        );
      }
    } catch (err) {
      console.error('Failed to create issues from AI action', err);
    } finally {
      setActionLoadingMsgId(null);
    }
  };

  // Action: Update Issue with Explicit Permission
  const handleExecuteUpdateIssue = async (msgId: string, actionData: any) => {
    try {
      setActionLoadingMsgId(msgId);
      let targetIssueId = actionData.issueId;
      if (!targetIssueId) {
        throw new Error('Issue ID could not be determined');
      }

      const numMatch = typeof targetIssueId === 'string' ? targetIssueId.replace(/^#/, '').trim() : String(targetIssueId);
      if (/^\d+$/.test(numMatch)) {
        try {
          const userIssues = await getIssues(user?.uid);
          const matched = userIssues.find((i) => i.id === targetIssueId || i.id.endsWith(numMatch));
          if (matched) {
            targetIssueId = matched.id;
          }
        } catch (_) {}
      }

      const { title, status, severity, description } = actionData;
      const updates: any = {};
      if (title !== undefined) updates.title = title;
      if (status !== undefined) {
        let normStatus = status;
        if (status === 'مفتوحة' || status === 'open') normStatus = 'open';
        else if (status === 'قيد التنفيذ' || status === 'in_progress') normStatus = 'in_progress';
        else if (status === 'مكتملة' || status === 'completed' || status === 'resolved') normStatus = 'completed';
        updates.status = normStatus;
      }
      if (severity !== undefined) updates.severity = severity;
      if (description !== undefined) updates.description = description;

      await updateIssue(targetIssueId, updates);
      setAppliedModifications((prev) => ({
        ...prev,
        [msgId]: { type: 'issue', id: targetIssueId, success: true },
      }));

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('issue-updated', {
            detail: { issueId: targetIssueId, updates },
          })
        );
      }
    } catch (err) {
      console.error('Failed to update issue from AI action', err);
    } finally {
      setActionLoadingMsgId(null);
    }
  };

  // Action: Update Report with Explicit Permission
  const handleExecuteUpdateReport = async (msgId: string, actionData: any) => {
    try {
      setActionLoadingMsgId(msgId);
      let targetReportId = actionData.reportId;
      if (!targetReportId || targetReportId === 'current' || targetReportId === 'N/A') {
        targetReportId = currentReport?.id;
      }

      // If targetReportId looks like a report number (e.g. "#1" or "1" or numeric)
      const numMatch = typeof targetReportId === 'string' ? targetReportId.replace(/^#/, '').trim() : String(targetReportId);
      if (/^\d+$/.test(numMatch)) {
        const num = parseInt(numMatch, 10);
        if (currentReport && (currentReport.reportNumber === num || currentReport.id === targetReportId)) {
          targetReportId = currentReport.id;
        } else {
          try {
            const userReps = await getReports(user?.uid);
            const matched = userReps.find((r) => r.reportNumber === num || r.id === targetReportId);
            if (matched) {
              targetReportId = matched.id;
            }
          } catch (_) {}
        }
      } else if (currentReport?.id && (!targetReportId || targetReportId === currentReport.reportNumber?.toString())) {
        targetReportId = currentReport.id;
      }

      if (!targetReportId) {
        throw new Error('Report ID could not be determined');
      }

      const { title, summary, systemUnderReview } = actionData;
      const updates: any = {};
      if (title !== undefined) updates.title = title;
      if (systemUnderReview !== undefined) updates.systemUnderReview = systemUnderReview;
      if (summary !== undefined) updates.summary = summary;

      await updateReport(targetReportId, updates);
      setAppliedModifications((prev) => ({
        ...prev,
        [msgId]: { type: 'report', id: targetReportId, success: true },
      }));

      // Update currentReport local state if it is the one being modified
      if (currentReport && currentReport.id === targetReportId) {
        setCurrentReport((prev) => (prev ? { ...prev, ...updates } : null));
      }

      // Notify all pages and components that this report was updated
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('report-updated', {
            detail: { reportId: targetReportId, updates },
          })
        );
      }
    } catch (err) {
      console.error('Failed to update report from AI action', err);
    } finally {
      setActionLoadingMsgId(null);
    }
  };

  const getProviderBadge = () => {
    switch (providerConfig.provider) {
      case 'openai':
        return `OpenAI (${providerConfig.modelName || 'gpt-4o'})`;
      case 'anthropic':
        return `Claude (${providerConfig.modelName ? providerConfig.modelName.split('-')[1] || providerConfig.modelName : 'Sonnet'})`;
      case 'custom':
        return `Custom (${providerConfig.modelName || 'API'})`;
      default:
        return `Gemini (${providerConfig.modelName || '1.5-flash'})`;
    }
  };

  return (
    <>
      {/* Backdrop overlay for quick exit */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[2px] transition-opacity duration-200"
      />
      <aside
        dir={isAr ? 'rtl' : 'ltr'}
        className="fixed top-16 right-0 h-[calc(100vh-4rem)] w-[460px] max-w-[95vw] sm:max-w-[480px] z-50 bg-[#FAFAF8] dark:bg-[#1A1A19] text-[#202020] dark:text-[#F2F2EE] border-l border-[#E7E6E2] dark:border-[#2B2B29] shadow-2xl flex flex-col transition-all duration-300 ease-in-out no-print animate-slide-in"
      >
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-[#E7E6E2] dark:border-[#2B2B29] bg-white/80 dark:bg-[#20201F]/90 backdrop-blur px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#2E4034] text-white shadow-sm">
              <Sparkles className="h-4 w-4 text-olive-100" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-bold tracking-tight">{t('aiAssistant')}</h2>
                <span className="rounded-full bg-olive-100/70 dark:bg-olive-950/70 px-1.5 py-0.5 text-[10px] font-bold text-olive-900 dark:text-olive-200">
                  Sidecar
                </span>
              </div>
              <p className="text-[11px] text-[#6B6964] dark:text-[#9E9C96]">
                {providerConfig.apiKey ? getProviderBadge() : t('apiKeyStatusDefault')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* Quick Provider Settings Toggle */}
            <button
              type="button"
              onClick={() => setShowSettingsAccordion(!showSettingsAccordion)}
              className={`rounded-lg p-1.5 transition-colors ${
                showSettingsAccordion
                  ? 'bg-olive-100 dark:bg-olive-950 text-olive-900 dark:text-olive-200'
                  : 'text-[#6B6964] dark:text-[#9E9C96] hover:bg-black/5 dark:hover:bg-white/5 hover:text-[#202020]'
              }`}
              title={t('aiApiKeyTitle')}
            >
              <Settings className="h-4 w-4" />
            </button>

            {/* Clear Chat */}
            <button
              type="button"
              onClick={() => {
                setMessages([
                  {
                    id: 'welcome',
                    role: 'assistant',
                    content: isAr
                      ? 'تم مسح المحادثة. يمكنك الآن طرح سؤال جديد أو إرفاق ملف للتحليل.'
                      : 'Chat cleared. Ask a new question or attach a file to begin.',
                  },
                ]);
                setCreatedReports({});
                setCreatedIssues({});
                setAppliedModifications({});
                setDismissedModifications({});
                setAppliedContentUpdates({});
                setDismissedContentUpdates({});
              }}
              className="rounded-lg p-1.5 text-[#6B6964] dark:text-[#9E9C96] hover:bg-black/5 dark:hover:bg-white/5 hover:text-[#202020] transition-colors"
              title={t('clearChat')}
            >
              <Trash2 className="h-4 w-4" />
            </button>

            {/* Hide AI Assistant Button */}
            <button
              type="button"
              onClick={async () => {
                await saveAiAssistantVisible(false, user?.uid);
                toast.info(t('aiAssistantHiddenNotice'));
                onClose();
              }}
              className="rounded-lg p-1.5 text-[#6B6964] dark:text-[#9E9C96] hover:bg-black/5 dark:hover:bg-white/5 hover:text-[#202020] transition-colors"
              title={t('hideAiAssistant')}
            >
              <EyeOff className="h-4 w-4" />
            </button>

            {/* Close Drawer Button */}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-[#6B6964] dark:text-[#9E9C96] hover:bg-black/5 dark:hover:bg-white/5 hover:text-[#202020] transition-colors"
              title={t('close')}
            >
              <PanelRightClose className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Quick Settings Accordion */}
        {showSettingsAccordion && (
          <form
            onSubmit={handleSaveConfig}
            className="border-b border-[#E7E6E2] dark:border-[#2B2B29] bg-[#F4F4F0] dark:bg-[#242423] p-3.5 text-xs space-y-3 animate-fade-in"
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#202020] dark:text-[#F2F2EE]">
                {t('aiApiKeyTitle')}
              </span>
              {configSavedNotice && (
                <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600">
                  <Check className="h-3.5 w-3.5" />
                  <span>{t('apiKeySavedSuccess')}</span>
                </span>
              )}
            </div>

            {/* Provider Selector */}
            <div>
              <label className="block text-[11px] font-semibold text-[#6B6964] dark:text-[#9E9C96] mb-1">
                {t('aiProviderLabel')}
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {(['gemini', 'openai', 'anthropic', 'custom'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      let defaultModel = providerConfig.modelName;
                      if (p === 'gemini') defaultModel = 'gemini-1.5-flash';
                      if (p === 'openai') defaultModel = 'gpt-4o';
                      if (p === 'anthropic') defaultModel = 'claude-3-7-sonnet-20250219';
                      if (p === 'custom') defaultModel = 'deepseek-chat';
                      setProviderConfig({ ...providerConfig, provider: p, modelName: defaultModel });
                    }}
                    className={`rounded-lg py-1 px-1.5 text-[10px] font-bold uppercase transition-all ${
                      providerConfig.provider === p
                        ? 'bg-[#2E4034] text-white shadow-xs'
                        : 'bg-white dark:bg-[#1A1A19] text-[#6B6964] dark:text-[#9E9C96] border border-[#E7E6E2] dark:border-[#2B2B29] hover:bg-black/5'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Free-form Model Name Input */}
            <div>
              <label className="block text-[11px] font-semibold text-[#6B6964] dark:text-[#9E9C96] mb-1">
                {t('aiModelNameLabel')}
              </label>
              <input
                type="text"
                value={providerConfig.modelName}
                onChange={(e) => setProviderConfig({ ...providerConfig, modelName: e.target.value })}
                placeholder={t('aiModelNamePlaceholder')}
                className="w-full rounded-lg border border-[#E7E6E2] dark:border-[#2B2B29] bg-white dark:bg-[#1A1A19] px-2.5 py-1.5 font-mono text-xs text-[#202020] dark:text-[#F2F2EE] focus:border-olive-600 focus:outline-none"
              />
            </div>

            {/* API Key Input */}
            <div>
              <label className="block text-[11px] font-semibold text-[#6B6964] dark:text-[#9E9C96] mb-1">
                {t('aiApiKeyLabel')}
              </label>
              <input
                type="password"
                value={providerConfig.apiKey}
                onChange={(e) => setProviderConfig({ ...providerConfig, apiKey: e.target.value })}
                placeholder={t('aiApiKeyPlaceholder')}
                className="w-full rounded-lg border border-[#E7E6E2] dark:border-[#2B2B29] bg-white dark:bg-[#1A1A19] px-2.5 py-1.5 font-mono text-xs text-[#202020] dark:text-[#F2F2EE] focus:border-olive-600 focus:outline-none"
              />
            </div>

            {/* Custom Base URL (if custom) */}
            {providerConfig.provider === 'custom' && (
              <div>
                <label className="block text-[11px] font-semibold text-[#6B6964] dark:text-[#9E9C96] mb-1">
                  {t('aiBaseUrlLabel')}
                </label>
                <input
                  type="text"
                  value={providerConfig.baseUrl || ''}
                  onChange={(e) => setProviderConfig({ ...providerConfig, baseUrl: e.target.value })}
                  placeholder={t('aiBaseUrlPlaceholder')}
                  className="w-full rounded-lg border border-[#E7E6E2] dark:border-[#2B2B29] bg-white dark:bg-[#1A1A19] px-2.5 py-1.5 font-mono text-xs text-[#202020] dark:text-[#F2F2EE] focus:border-olive-600 focus:outline-none"
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setProviderConfig({
                    provider: 'gemini',
                    modelName: 'gemini-1.5-flash',
                    apiKey: '',
                    baseUrl: '',
                  });
                  localStorage.removeItem(AI_CONFIG_KEY);
                  localStorage.removeItem('gemini_custom_api_key');
                  setShowSettingsAccordion(false);
                }}
                className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-black/5"
              >
                {t('removeApiKey')}
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#2E4034] hover:bg-[#24382F] px-3.5 py-1 text-[11px] font-semibold text-white shadow-xs"
              >
                {t('saveApiKey')}
              </button>
            </div>
          </form>
        )}

        {/* Current Report Context Indicator Banner */}
        {currentReport && (
          <div className="border-b border-[#E7E6E2] dark:border-[#2B2B29] bg-olive-50/70 dark:bg-[#222A25] px-4 py-2 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 truncate">
              <FileText className="h-3.5 w-3.5 text-olive-700 dark:text-olive-400 flex-shrink-0" />
              <span className="font-semibold text-olive-900 dark:text-olive-200 truncate">
                {t('aiContextLinkedReport')} #{currentReport.reportNumber} - {currentReport.title}
              </span>
            </div>
            <label className="flex items-center gap-1.5 text-[11px] font-medium text-olive-800 dark:text-olive-300 cursor-pointer flex-shrink-0">
              <input
                type="checkbox"
                checked={includeCurrentReportContext}
                onChange={(e) => setIncludeCurrentReportContext(e.target.checked)}
                className="rounded text-olive-600 focus:ring-olive-500 h-3.5 w-3.5"
              />
              <span>{lang === 'ar' ? 'تضمين' : 'Include'}</span>
            </label>
          </div>
        )}

        {/* Chat History Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-transparent">
          {messages.map((msg) => {
            const isAi = msg.role === 'assistant';
            const repId = createdReports[msg.id];
            const issCount = createdIssues[msg.id];
            const isActionLoading = actionLoadingMsgId === msg.id;

            return (
              <div
                key={msg.id}
                className={`flex gap-2.5 ${isAi ? 'justify-start' : 'justify-end'}`}
              >
                {isAi && (
                  <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-[#2E4034] text-white shadow-xs mt-0.5">
                    <Bot className="h-3.5 w-3.5" />
                  </div>
                )}

                <div
                  className={`max-w-[85%] rounded-2xl p-3.5 text-xs leading-relaxed shadow-none ${
                    isAi
                      ? 'border border-[#E7E6E2] dark:border-[#2B2B29] bg-white dark:bg-[#20201F] text-[#202020] dark:text-[#F2F2EE]'
                      : 'bg-[#2E4034] text-white'
                  }`}
                >
                  {/* Attachment Pill if any */}
                  {msg.attachmentName && (
                    <div
                      className={`mb-2 inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                        isAi
                          ? 'bg-[#F4F4F0] dark:bg-[#2A2A29] text-[#6B6964] dark:text-[#9E9C96]'
                          : 'bg-[#24382F] text-olive-100'
                      }`}
                    >
                      <Paperclip className="h-3 w-3" />
                      <span className="truncate max-w-[200px]">{msg.attachmentName}</span>
                    </div>
                  )}

                  {/* Message Body */}
                  <div className="whitespace-pre-wrap leading-relaxed space-y-1.5">
                    {msg.content}
                  </div>

                  {/* Action Cards generated by AI */}
                  {msg.actionData && (
                    <div className="mt-3.5 space-y-2 border-t border-[#E7E6E2] dark:border-[#2B2B29] pt-2.5">
                      {msg.actionData.action === 'create_report' && (
                        <div className="rounded-xl border border-olive-200 dark:border-olive-800/60 bg-olive-50/50 dark:bg-olive-950/30 p-2.5">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="rounded-md bg-olive-200/60 dark:bg-olive-900/60 px-1.5 py-0.5 text-[10px] font-bold text-olive-900 dark:text-olive-200">
                              {msg.actionData.report?.templateType || 'General Report'}
                            </span>
                          </div>
                          <p className="font-bold text-xs text-olive-950 dark:text-olive-100 mb-1">
                            {msg.actionData.report?.title}
                          </p>

                          {repId ? (
                            <div className="mt-2 flex items-center justify-between rounded-lg bg-emerald-100/70 dark:bg-emerald-950/60 p-2 text-xs font-bold text-emerald-900 dark:text-emerald-200">
                              <span className="flex items-center gap-1">
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                <span>{t('aiReportCreatedSuccess')}</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  onClose();
                                  router.push(`/reports/${repId}`);
                                }}
                                className="flex items-center gap-1 text-emerald-800 dark:text-emerald-300 underline font-bold"
                              >
                                <span>{lang === 'ar' ? 'عرض التقرير' : 'View Report'}</span>
                                <ExternalLink className="h-3 w-3" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              disabled={isActionLoading}
                              onClick={() =>
                                handleExecuteCreateReport(msg.id, msg.actionData.report)
                              }
                              className="mt-2 flex items-center gap-1.5 rounded-lg bg-[#2E4034] hover:bg-[#24382F] px-3 py-1.5 text-xs font-bold text-white shadow-xs transition-colors disabled:opacity-50"
                            >
                              {isActionLoading ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <PlusCircle className="h-3.5 w-3.5" />
                              )}
                              <span>{t('createReportFromAi')}</span>
                            </button>
                          )}
                        </div>
                      )}

                      {msg.actionData.action === 'create_issues' && (
                        <div className="rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50/50 dark:bg-amber-950/30 p-2.5">
                          <p className="font-bold text-xs text-amber-950 dark:text-amber-100 mb-1">
                            {lang === 'ar' ? 'قائمة المشاكل المستخرجة' : 'Extracted Defect Cards'}
                          </p>
                          {issCount !== undefined ? (
                            <div className="mt-2 flex items-center justify-between rounded-lg bg-emerald-100/70 dark:bg-emerald-950/60 p-2 text-xs font-bold text-emerald-900 dark:text-emerald-200">
                              <span className="flex items-center gap-1">
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                <span>
                                  {t('aiIssuesCreatedSuccess')} ({issCount})
                                </span>
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  onClose();
                                  router.push('/dashboard');
                                }}
                                className="flex items-center gap-1 text-emerald-800 dark:text-emerald-300 underline font-bold"
                              >
                                <span>{lang === 'ar' ? 'فتح اللوحة' : 'Open Board'}</span>
                                <ExternalLink className="h-3 w-3" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              disabled={isActionLoading}
                              onClick={() =>
                                handleExecuteCreateIssues(msg.id, msg.actionData.issues)
                              }
                              className="mt-2 flex items-center gap-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 px-3 py-1.5 text-xs font-bold text-white shadow-xs transition-colors disabled:opacity-50"
                            >
                              {isActionLoading ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <PlusCircle className="h-3.5 w-3.5" />
                              )}
                              <span>{t('createIssuesFromAi')}</span>
                            </button>
                          )}
                        </div>
                      )}

                      {/* Action: Update Issue with Explicit Permission */}
                      {msg.actionData.action === 'update_issue' && (
                        <div className="rounded-xl border border-sky-200 dark:border-sky-800/60 bg-sky-50/50 dark:bg-sky-950/30 p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="rounded-md bg-sky-200/70 dark:bg-sky-900/70 px-1.5 py-0.5 text-[10px] font-bold text-sky-900 dark:text-sky-200">
                              {isAr ? 'طلب إذن لتعديل مشكلة' : 'Permission Request: Update Issue'}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-mono">
                              ID: {msg.actionData.issueId}
                            </span>
                          </div>

                          {msg.actionData.reason && (
                            <p className="text-[11px] text-muted-foreground italic">
                              {msg.actionData.reason}
                            </p>
                          )}

                          {/* Change Details */}
                          <div className="rounded-lg bg-white dark:bg-[#1A1A19] border border-border/70 p-2 text-[11px] space-y-1">
                            {msg.actionData.title && (
                              <div>
                                <span className="font-semibold text-muted-foreground">{isAr ? 'العنوان الجديد: ' : 'New Title: '}</span>
                                <span className="font-bold text-foreground">{msg.actionData.title}</span>
                              </div>
                            )}
                            {msg.actionData.status && (
                              <div>
                                <span className="font-semibold text-muted-foreground">{isAr ? 'الحالة المقترحة: ' : 'Target Status: '}</span>
                                <span className="font-bold text-sky-700 dark:text-sky-400 uppercase">{msg.actionData.status}</span>
                              </div>
                            )}
                            {msg.actionData.severity && (
                              <div>
                                <span className="font-semibold text-muted-foreground">{isAr ? 'درجة الخطورة: ' : 'Severity: '}</span>
                                <span className="font-bold text-amber-700 dark:text-amber-400 uppercase">{msg.actionData.severity}</span>
                              </div>
                            )}
                            {msg.actionData.description && (
                              <div>
                                <span className="font-semibold text-muted-foreground">{isAr ? 'الوصف: ' : 'Description: '}</span>
                                <span className="text-foreground">{msg.actionData.description}</span>
                              </div>
                            )}
                          </div>

                          {appliedModifications[msg.id] ? (
                            <div className="flex items-center justify-between rounded-lg bg-emerald-100/70 dark:bg-emerald-950/60 p-2 text-xs font-bold text-emerald-900 dark:text-emerald-200">
                              <span className="flex items-center gap-1">
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                <span>{isAr ? 'تم اعتماد وتطبيق التعديل بنجاح' : 'Modification approved and applied'}</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  onClose();
                                  router.push('/dashboard');
                                }}
                                className="flex items-center gap-1 text-emerald-800 dark:text-emerald-300 underline font-bold"
                              >
                                <span>{isAr ? 'عرض في اللوحة' : 'View in Board'}</span>
                                <ExternalLink className="h-3 w-3" />
                              </button>
                            </div>
                          ) : dismissedModifications[msg.id] ? (
                            <div className="p-1.5 text-center text-[11px] text-muted-foreground italic">
                              {isAr ? 'تم تجاهل هذا التعديل ولم يتم حفظ أي تغيير.' : 'Modification dismissed. No changes were made.'}
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => setDismissedModifications((prev) => ({ ...prev, [msg.id]: true }))}
                                className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
                              >
                                {isAr ? 'تجاهل' : 'Dismiss'}
                              </button>
                              <button
                                type="button"
                                disabled={isActionLoading}
                                onClick={() => handleExecuteUpdateIssue(msg.id, msg.actionData)}
                                className="flex items-center gap-1 rounded-lg bg-sky-700 hover:bg-sky-800 px-3 py-1 text-xs font-bold text-white shadow-xs disabled:opacity-50"
                              >
                                {isActionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                                <span>{isAr ? 'موافقة وتطبيق التعديل' : 'Approve & Apply'}</span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Action: Update Report with Explicit Permission */}
                      {msg.actionData.action === 'update_report' && (
                        <div className="rounded-xl border border-olive-200 dark:border-olive-800/60 bg-olive-50/50 dark:bg-olive-950/30 p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="rounded-md bg-olive-200/70 dark:bg-olive-900/70 px-1.5 py-0.5 text-[10px] font-bold text-olive-900 dark:text-olive-200">
                              {isAr ? 'طلب إذن لتعديل تقرير' : 'Permission Request: Update Report'}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-mono">
                              ID: {msg.actionData.reportId}
                            </span>
                          </div>

                          {msg.actionData.reason && (
                            <p className="text-[11px] text-muted-foreground italic">
                              {msg.actionData.reason}
                            </p>
                          )}

                          {/* Change Details */}
                          <div className="rounded-lg bg-white dark:bg-[#1A1A19] border border-border/70 p-2 text-[11px] space-y-1">
                            {msg.actionData.title && (
                              <div>
                                <span className="font-semibold text-muted-foreground">{isAr ? 'العنوان الجديد: ' : 'New Title: '}</span>
                                <span className="font-bold text-foreground">{msg.actionData.title}</span>
                              </div>
                            )}
                            {msg.actionData.summary && (
                              <div>
                                <span className="font-semibold text-muted-foreground">{isAr ? 'الملخص التنفيذي الجديد: ' : 'Updated Summary: '}</span>
                                <span className="text-foreground">{msg.actionData.summary}</span>
                              </div>
                            )}
                            {msg.actionData.systemUnderReview && (
                              <div>
                                <span className="font-semibold text-muted-foreground">{isAr ? 'النظام / المشروع: ' : 'System: '}</span>
                                <span className="text-foreground">{msg.actionData.systemUnderReview}</span>
                              </div>
                            )}
                          </div>

                          {appliedModifications[msg.id] ? (
                            <div className="flex items-center justify-between rounded-lg bg-emerald-100/70 dark:bg-emerald-950/60 p-2 text-xs font-bold text-emerald-900 dark:text-emerald-200">
                              <span className="flex items-center gap-1">
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                <span>{isAr ? 'تم تطبيق التعديل على التقرير بنجاح' : 'Report updated successfully'}</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  onClose();
                                  router.push(`/reports/${msg.actionData.reportId}`);
                                }}
                                className="flex items-center gap-1 text-emerald-800 dark:text-emerald-300 underline font-bold"
                              >
                                <span>{isAr ? 'عرض التقرير' : 'View Report'}</span>
                                <ExternalLink className="h-3 w-3" />
                              </button>
                            </div>
                          ) : dismissedModifications[msg.id] ? (
                            <div className="p-1.5 text-center text-[11px] text-muted-foreground italic">
                              {isAr ? 'تم تجاهل هذا التعديل ولم يتم حفظ أي تغيير.' : 'Modification dismissed. No changes were made.'}
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => setDismissedModifications((prev) => ({ ...prev, [msg.id]: true }))}
                                className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
                              >
                                {isAr ? 'تجاهل' : 'Dismiss'}
                              </button>
                              <button
                                type="button"
                                disabled={isActionLoading}
                                onClick={() => handleExecuteUpdateReport(msg.id, msg.actionData)}
                                className="flex items-center gap-1 rounded-lg bg-[#2E4034] hover:bg-[#24382F] px-3 py-1 text-xs font-bold text-white shadow-xs disabled:opacity-50"
                              >
                                {isActionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                                <span>{isAr ? 'موافقة وتطبيق التعديل' : 'Approve & Apply'}</span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Tool Call Cards executed by Autonomous AI Agent */}
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div className="mt-3.5 space-y-2 border-t border-[#E7E6E2] dark:border-[#2B2B29] pt-2.5">
                      {msg.toolCalls.map((tool, idx) => {
                        if (tool.name === 'update_report_content') {
                          const updateKey = `${msg.id}_tool_${idx}`;
                          const status = appliedContentUpdates[updateKey];
                          const isDismissed = dismissedContentUpdates[updateKey];
                          const mode = tool.parameters?.mode || 'append';
                          const content = tool.parameters?.content || '';
                          const isReplaceAll = mode === 'replace_all';

                          if (isDismissed) {
                            return (
                              <div
                                key={idx}
                                className="rounded-xl border border-border/60 bg-muted/30 p-2.5 text-xs text-muted-foreground italic text-center"
                              >
                                {isAr ? 'تم تجاهل اقتراح تعديل المحتوى.' : 'Content update proposal dismissed.'}
                              </div>
                            );
                          }

                          return (
                            <div
                              key={idx}
                              className={cn(
                                'rounded-xl border p-3 text-xs space-y-2.5 shadow-2xs transition-all',
                                isReplaceAll
                                  ? 'border-red-300 dark:border-red-900/60 bg-red-50/40 dark:bg-red-950/20'
                                  : 'border-olive-300 dark:border-olive-800/60 bg-olive-50/40 dark:bg-olive-950/20'
                              )}
                            >
                              {/* Header with Mode Badge */}
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 font-bold">
                                  {isReplaceAll ? (
                                    <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
                                  ) : (
                                    <FileText className="h-4 w-4 text-olive-700 dark:text-olive-400 shrink-0" />
                                  )}
                                  <span className={isReplaceAll ? 'text-red-900 dark:text-red-200' : 'text-foreground'}>
                                    {t('aiProposalTitle')}
                                  </span>
                                </div>

                                <Badge
                                  variant={isReplaceAll ? 'destructive' : 'secondary'}
                                  className="text-[10px] font-bold px-2 py-0.5"
                                >
                                  {mode === 'replace_all'
                                    ? t('aiProposalReplaceAll')
                                    : mode === 'prepend'
                                    ? t('aiProposalPrepend')
                                    : mode === 'replace_selection'
                                    ? t('aiProposalReplaceSelection')
                                    : t('aiProposalAppend')}
                                </Badge>
                              </div>

                              {/* Critical Warning if Replace All */}
                              {isReplaceAll && (
                                <div className="rounded-lg border border-red-200 dark:border-red-800/80 bg-red-100/60 dark:bg-red-950/50 p-2 text-[11px] text-red-800 dark:text-red-300 leading-relaxed font-medium">
                                  {t('aiProposalReplaceWarning')}
                                </div>
                              )}

                              {/* Content Preview */}
                              <div className="space-y-1">
                                <span className="text-[11px] font-semibold text-muted-foreground">
                                  {isAr ? 'معاينة النص المقترح:' : 'Proposed Content Preview:'}
                                </span>
                                <div className="max-h-40 overflow-y-auto rounded-lg border border-border/80 bg-background/80 p-2 font-mono text-[11px] whitespace-pre-wrap text-foreground">
                                  {content.length > 800 ? content.slice(0, 800) + '...' : content}
                                </div>
                              </div>

                              {/* Status & Action Buttons */}
                              {status?.applied && !status?.reverted ? (
                                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-emerald-100/80 dark:bg-emerald-950/60 p-2 text-xs font-bold text-emerald-900 dark:text-emerald-200">
                                  <span className="flex items-center gap-1.5">
                                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                                    <span>{t('aiModificationApplied')}</span>
                                  </span>

                                  <button
                                    type="button"
                                    onClick={() => handleRevertContentUpdate(updateKey)}
                                    className="flex items-center gap-1.5 text-xs text-rose-700 dark:text-rose-300 hover:text-rose-900 dark:hover:text-rose-100 font-bold bg-white/80 dark:bg-black/40 hover:bg-white dark:hover:bg-black/60 px-2.5 py-1 rounded-md border border-rose-300 dark:border-rose-800 transition-all shadow-2xs cursor-pointer"
                                    title={t('aiUndoModification')}
                                  >
                                    <RotateCcw className="h-3.5 w-3.5" />
                                    <span>{t('aiUndoModification')}</span>
                                  </button>
                                </div>
                              ) : status?.reverted ? (
                                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-100/80 dark:bg-amber-950/60 p-2 text-xs font-bold text-amber-900 dark:text-amber-200">
                                  <span className="flex items-center gap-1.5">
                                    <RotateCcw className="h-4 w-4 text-amber-600 shrink-0" />
                                    <span>{t('aiModificationUndone')}</span>
                                  </span>

                                  <button
                                    type="button"
                                    onClick={() => handleApplyContentUpdate(updateKey, tool.parameters)}
                                    className="flex items-center gap-1 text-xs text-primary font-bold hover:underline"
                                  >
                                    <span>{t('aiApplyProposal')}</span>
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-end gap-2 pt-1 border-t border-border/40">
                                  <button
                                    type="button"
                                    onClick={() => setDismissedContentUpdates((prev) => ({ ...prev, [updateKey]: true }))}
                                    className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors cursor-pointer"
                                  >
                                    {t('aiDismissProposal')}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleApplyContentUpdate(updateKey, tool.parameters)}
                                    className={cn(
                                      'flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold text-white shadow-2xs transition-colors cursor-pointer',
                                      isReplaceAll
                                        ? 'bg-red-700 hover:bg-red-800'
                                        : 'bg-[#2E4034] hover:bg-[#24382F]'
                                    )}
                                  >
                                    <ShieldCheck className="h-3.5 w-3.5" />
                                    <span>{t('aiApplyProposal')}</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        }

                        if (tool.name === 'create_new_report') {
                          return (
                            <div key={idx} className="flex items-center justify-between rounded-lg border border-border bg-card/60 p-2.5 text-xs">
                              <div className="flex items-center gap-2 truncate">
                                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                                <span className="font-semibold text-foreground truncate">
                                  {isAr ? 'تم إنشاء تقرير جديد:' : 'Report created:'} {tool.parameters?.title}
                                </span>
                              </div>
                              {repId && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onClose();
                                    router.push(`/reports/${repId}`);
                                  }}
                                  className="flex items-center gap-1 text-xs text-primary font-bold hover:underline shrink-0"
                                >
                                  <span>{isAr ? 'عرض' : 'View'}</span>
                                  <ExternalLink className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          );
                        }

                        if (tool.name === 'create_kanban_issue') {
                          return (
                            <div key={idx} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card/60 p-2.5 text-xs">
                              <div className="flex items-center gap-2 truncate">
                                <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                                <span className="font-semibold text-foreground truncate">
                                  [تم رصد مشكلة: {tool.parameters?.title} - تصنيف: {tool.parameters?.severity}]
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <Badge variant={getSeverityBadgeVariant(tool.parameters?.severity)}>
                                  {tool.parameters?.severity}
                                </Badge>
                                <button
                                  type="button"
                                  onClick={() => {
                                    onClose();
                                    router.push('/dashboard');
                                  }}
                                  className="text-[11px] text-muted-foreground hover:text-foreground hover:underline flex items-center gap-0.5"
                                >
                                  <span>{isAr ? 'اللوحة' : 'Board'}</span>
                                  <ExternalLink className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                          );
                        }

                        if (tool.name === 'query_system_data') {
                          return (
                            <div key={idx} className="flex items-center gap-2 rounded-lg border border-border bg-card/60 p-2 text-xs text-muted-foreground">
                              <Database className="h-4 w-4 text-primary shrink-0" />
                              <span>
                                {isAr ? 'تم استعلام بيانات النظام:' : 'System query executed:'} {tool.parameters?.target}
                              </span>
                            </div>
                          );
                        }

                        return null;
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {sending && (
            <div className="flex items-center gap-2 text-xs text-[#6B6964] dark:text-[#9E9C96] italic p-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-olive-700 dark:text-olive-400" />
              <span>{t('processingDocument')}</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Attached File Preview Bar */}
        {attachedFile && (
          <div className="flex items-center justify-between border-t border-[#E7E6E2] dark:border-[#2B2B29] bg-olive-50/70 dark:bg-[#20201F] px-4 py-1.5 text-xs text-olive-900 dark:text-olive-200">
            <div className="flex items-center gap-2">
              <Paperclip className="h-3.5 w-3.5 text-olive-700 dark:text-olive-400" />
              <span className="font-semibold truncate max-w-[260px]">{attachedFile.name}</span>
            </div>
            <button
              type="button"
              onClick={() => setAttachedFile(null)}
              className="text-olive-700 dark:text-olive-400 hover:text-red-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Input & Quick Chips Area */}
        <div className="border-t border-[#E7E6E2] dark:border-[#2B2B29] bg-white dark:bg-[#20201F] p-3 space-y-2">
          {/* Quick Prompt Chips */}
          <div className="flex flex-wrap gap-1.5 max-h-[70px] overflow-y-auto">
            {currentReport && (
              <button
                type="button"
                onClick={() =>
                  handleSendMessage(
                    isAr
                      ? 'حلل محتوى التقرير الحالي واستخرج أبرز الملاحظات والتوصيات'
                      : 'Analyze the current report and summarize key insights and recommendations'
                  )
                }
                className="rounded-lg border border-olive-200 dark:border-olive-800/80 bg-olive-50/60 dark:bg-olive-950/40 px-2 py-1 text-[11px] font-medium text-olive-900 dark:text-olive-200 hover:bg-olive-100 transition-colors"
              >
                {t('aiChipCurrentReport')}
              </button>
            )}

            <button
              type="button"
              onClick={() =>
                handleSendMessage(
                  isAr
                    ? 'أعطني ملخصاً عن المشاكل الحرجة والمفتوحة في لوحة المتابعة وتوصيات حلها'
                    : 'Summarize critical and open issues from the Kanban board and recommend actions'
                )
              }
              className="rounded-lg border border-[#E7E6E2] dark:border-[#2B2B29] bg-[#FAFAF8] dark:bg-[#1A1A19] px-2 py-1 text-[11px] font-medium text-[#6B6964] dark:text-[#9E9C96] hover:text-[#202020] hover:border-olive-400 transition-colors"
            >
              {t('aiChipOpenIssues')}
            </button>

            <button
              type="button"
              onClick={() =>
                handleSendMessage(
                  isAr
                    ? 'حلل كافة التقارير المسجلة في النظام وأعطني استنتاجاً للمؤشرات العامة'
                    : 'Analyze all existing reports and synthesize macro trends across them'
                )
              }
              className="rounded-lg border border-[#E7E6E2] dark:border-[#2B2B29] bg-[#FAFAF8] dark:bg-[#1A1A19] px-2 py-1 text-[11px] font-medium text-[#6B6964] dark:text-[#9E9C96] hover:text-[#202020] hover:border-olive-400 transition-colors"
            >
              {t('aiChipAllReports')}
            </button>

            <button
              type="button"
              onClick={() =>
                handleSendMessage(
                  isAr
                    ? 'اقترح مسودة تقرير عمل مستقلين جديد مع تفصيل المهام والساعات والمبالغ'
                    : 'Draft a new Freelancer Work Report with tasks, hours, and compensation'
                )
              }
              className="rounded-lg border border-[#E7E6E2] dark:border-[#2B2B29] bg-[#FAFAF8] dark:bg-[#1A1A19] px-2 py-1 text-[11px] font-medium text-[#6B6964] dark:text-[#9E9C96] hover:text-[#202020] hover:border-olive-400 transition-colors"
            >
              {t('aiChipDraftReport')}
            </button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-1.5"
          >
            {/* Hidden File Input */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept=".pdf,.docx,.md,.txt"
              className="hidden"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-xl border border-[#E7E6E2] dark:border-[#2B2B29] p-2 text-[#6B6964] dark:text-[#9E9C96] hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              title={t('attachDocument')}
            >
              <Paperclip className="h-4 w-4" />
            </button>

            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={t('aiChatPlaceholder')}
              className="flex-1 rounded-xl border border-[#E7E6E2] dark:border-[#2B2B29] bg-[#FAFAF8] dark:bg-[#161615] px-3 py-2 text-xs text-[#202020] dark:text-[#F2F2EE] focus:border-olive-600 focus:outline-none"
            />

            <button
              type="submit"
              disabled={sending || (!inputValue.trim() && !attachedFile)}
              className="rounded-xl bg-[#2E4034] hover:bg-[#24382F] p-2 text-white shadow-xs disabled:opacity-50 transition-colors"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}

// Alias export for backward and future compatibility
export { AiAssistantModal as AiAssistantDrawer };

