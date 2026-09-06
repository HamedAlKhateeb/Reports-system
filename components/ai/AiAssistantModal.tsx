'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
} from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useAuth } from '@/lib/auth-context';
import { createReport, createIssue } from '@/lib/db';
import { ReportItem } from '@/lib/types';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachmentName?: string;
  actionData?: any;
}

interface AiAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AiAssistantModal({ isOpen, onClose }: AiAssistantModalProps) {
  const { lang, t } = useLanguage();
  const { user } = useAuth();
  const router = useRouter();

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

  const [createdReportId, setCreatedReportId] = useState<string | null>(null);
  const [createdIssuesCount, setCreatedIssuesCount] = useState<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

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
      const customApiKey =
        typeof window !== 'undefined'
          ? localStorage.getItem('gemini_custom_api_key') || undefined
          : undefined;

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(customApiKey ? { 'x-gemini-api-key': customApiKey } : {}),
        },
        body: JSON.stringify({
          messages: [...messages, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
          })),
          attachment: currentAttachment,
          userApiKey: customApiKey,
        }),
      });

      if (!res.ok) {
        throw new Error(`AI request failed: ${res.status}`);
      }

      const data = await res.json();
      const rawReply = data.reply || '';

      // Extract json_action if present
      let cleanedReply = rawReply;
      let actionData = null;

      const actionMatch = rawReply.match(/```json_action([\s\S]*?)```/);
      if (actionMatch && actionMatch[1]) {
        try {
          actionData = JSON.parse(actionMatch[1].trim());
          cleanedReply = rawReply.replace(/```json_action[\s\S]*?```/, '').trim();
        } catch (err) {
          console.warn('Could not parse action JSON from AI reply', err);
        }
      }

      const assistantMessage: Message = {
        id: 'reply_' + Date.now(),
        role: 'assistant',
        content: cleanedReply,
        actionData,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: any) {
      console.error('AI chat error:', err);
      setMessages((prev) => [
        ...prev,
        {
          id: 'err_' + Date.now(),
          role: 'assistant',
          content: lang === 'ar' ? 'عذراً، حدث خطأ أثناء الاتصال بالمساعد الذكي.' : 'Sorry, an error occurred while contacting the AI assistant.',
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  // Action: Create Report from AI Action Data
  const handleExecuteCreateReport = async (reportData: any) => {
    if (!user) return;
    try {
      const title = reportData.title || (lang === 'ar' ? 'تقرير منشأ بالذكاء الاصطناعي' : 'AI Generated Review Report');
      const repLang = reportData.language || lang;
      const system = reportData.systemUnderReview || (lang === 'ar' ? 'نظام المراجعة' : 'Reviewed System');

      // Construct rich TipTap JSON content
      const contentJson = {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: lang === 'ar' ? '1. الملخص التنفيذي' : '1. Executive Summary' }],
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: reportData.summary || '' }],
          },
        ],
      };

      // If bugs exist, add Software Defects table
      if (reportData.issues && reportData.issues.length > 0) {
        contentJson.content.push(
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: lang === 'ar' ? '2. تقرير أخطاء النظام' : '2. Software Defects Report' }],
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

      // If MQM items exist, add MQM assessment table
      if (reportData.mqmItems && reportData.mqmItems.length > 0) {
        contentJson.content.push(
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: lang === 'ar' ? '3. مراجعة جودة الترجمة واللغة' : '3. Translation Quality Review' }],
          } as any,
          {
            type: 'table',
            content: [
              {
                type: 'tableRow',
                content: [
                  { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: t('colMqmSource') }] }] },
                  { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: t('colMqmTarget') }] }] },
                  { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: t('colMqmCategory') }] }] },
                  { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: t('colMqmCorrection') }] }] },
                  { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: t('colMqmImpact') }] }] },
                ],
              },
              ...reportData.mqmItems.map((mqm: any) => ({
                type: 'tableRow',
                content: [
                  { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: mqm.source || '' }] }] },
                  { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: mqm.target || '' }] }] },
                  { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: mqm.category || '' }] }] },
                  { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: mqm.correction || '' }] }] },
                  { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: mqm.penalty || '' }] }] },
                ],
              })),
            ],
          } as any
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

      setCreatedReportId(created.id);
    } catch (err) {
      console.error('Failed to create report from AI action', err);
    }
  };

  // Action: Create Issues from AI Action Data
  const handleExecuteCreateIssues = async (issuesList: any[]) => {
    try {
      let count = 0;
      for (const item of issuesList) {
        await createIssue({
          title: item.title || 'AI Detected Defect',
          description: item.description || '',
          severity: item.severity || 'major',
          status: item.status || 'open',
          linkedReportId: null,
        });
        count++;
      }
      setCreatedIssuesCount(count);
    } catch (err) {
      console.error('Failed to create issues from AI action', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fade-in">
      <div className="flex h-[88vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200">
        {/* Modal Top Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-6 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-teal-600 to-emerald-500 text-white shadow-sm">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">{t('aiAssistant')}</h2>
                <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-800">
                  {t('aiRoleBadge')}
                </span>
              </div>
              <p className="text-xs text-slate-500">{t('aiAssistantDesc')}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setMessages([
                  {
                    id: 'welcome',
                    role: 'assistant',
                    content: t('aiWelcomeMessage'),
                  },
                ])
              }
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-colors"
              title={t('clearChat')}
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Chat History Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/30">
          {messages.map((msg) => {
            const isAi = msg.role === 'assistant';
            return (
              <div
                key={msg.id}
                className={`flex gap-3 ${isAi ? 'justify-start' : 'justify-end'}`}
              >
                {isAi && (
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-teal-600 text-white shadow-sm">
                    <Bot className="h-4 w-4" />
                  </div>
                )}

                <div
                  className={`max-w-2xl rounded-2xl p-4 text-sm leading-relaxed shadow-sm ${
                    isAi
                      ? 'border border-slate-200 bg-white text-slate-800'
                      : 'bg-teal-600 text-white'
                  }`}
                >
                  {/* Attachment Pill if any */}
                  {msg.attachmentName && (
                    <div
                      className={`mb-2 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold ${
                        isAi ? 'bg-slate-100 text-slate-700' : 'bg-teal-700 text-teal-50'
                      }`}
                    >
                      <Paperclip className="h-3 w-3" />
                      <span>{msg.attachmentName}</span>
                    </div>
                  )}

                  {/* Message Body */}
                  <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>

                  {/* Action Buttons generated by AI */}
                  {msg.actionData && (
                    <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
                      {msg.actionData.action === 'create_report' && (
                        <div>
                          {createdReportId ? (
                            <div className="flex items-center justify-between rounded-lg bg-emerald-50 border border-emerald-200 p-2.5 text-xs text-emerald-800">
                              <div className="flex items-center gap-1.5 font-bold">
                                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                <span>{t('aiReportCreatedSuccess')}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  onClose();
                                  router.push(`/reports/${createdReportId}`);
                                }}
                                className="flex items-center gap-1 font-semibold text-emerald-700 hover:underline"
                              >
                                <span>{lang === 'ar' ? 'عرض التقرير' : 'View Report'}</span>
                                <ExternalLink className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleExecuteCreateReport(msg.actionData.report)}
                              className="flex items-center gap-2 rounded-lg bg-teal-600 px-3.5 py-2 text-xs font-bold text-white shadow hover:bg-teal-700 transition-colors"
                            >
                              <PlusCircle className="h-4 w-4" />
                              <span>{t('createReportFromAi')}</span>
                            </button>
                          )}
                        </div>
                      )}

                      {msg.actionData.action === 'create_issues' && (
                        <div>
                          {createdIssuesCount ? (
                            <div className="flex items-center justify-between rounded-lg bg-emerald-50 border border-emerald-200 p-2.5 text-xs text-emerald-800">
                              <div className="flex items-center gap-1.5 font-bold">
                                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                <span>
                                  {t('aiIssuesCreatedSuccess')} ({createdIssuesCount})
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  onClose();
                                  router.push('/dashboard');
                                }}
                                className="flex items-center gap-1 font-semibold text-emerald-700 hover:underline"
                              >
                                <span>{lang === 'ar' ? 'فتح لوحة المشاكل' : 'Open Kanban'}</span>
                                <ExternalLink className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleExecuteCreateIssues(msg.actionData.issues)}
                              className="flex items-center gap-2 rounded-lg bg-amber-600 px-3.5 py-2 text-xs font-bold text-white shadow hover:bg-amber-700 transition-colors"
                            >
                              <PlusCircle className="h-4 w-4" />
                              <span>{t('createIssuesFromAi')}</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {sending && (
            <div className="flex items-center gap-2 text-xs text-slate-500 italic">
              <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
              <span>{t('processingDocument')}</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Attached File Preview Bar */}
        {attachedFile && (
          <div className="flex items-center justify-between border-t border-slate-200 bg-teal-50/70 px-4 py-2 text-xs text-teal-900">
            <div className="flex items-center gap-2">
              <Paperclip className="h-3.5 w-3.5 text-teal-600" />
              <span className="font-semibold truncate max-w-sm">{attachedFile.name}</span>
            </div>
            <button
              type="button"
              onClick={() => setAttachedFile(null)}
              className="text-teal-700 hover:text-red-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Input Bar */}
        <div className="border-t border-slate-200 bg-white p-4">
          {/* Quick Prompts */}
          <div className="mb-2 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() =>
                handleSendMessage(
                  lang === 'ar'
                    ? 'قم بتحليل المستند المرفق واستخراج أخطاء البرنامج ومقاييس MQM منه'
                    : 'Audit the attached document and extract software defects and MQM translation metrics'
                )
              }
              className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:border-teal-300 hover:bg-teal-50/50 hover:text-teal-800 transition-colors"
            >
              {lang === 'ar' ? '🔍 تحليل المستند المرفق' : '🔍 Audit Document'}
            </button>

            <button
              type="button"
              onClick={() =>
                handleSendMessage(
                  lang === 'ar'
                    ? 'استخرج المشاكل والأخطاء وحولها لبطاقات جاهزة للإضافة في لوحة المتابعة'
                    : 'Extract defects and format them as Kanban issues'
                )
              }
              className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:border-teal-300 hover:bg-teal-50/50 hover:text-teal-800 transition-colors"
            >
              {lang === 'ar' ? '⚡ استخراج مشاكل لوحة كانبان' : '⚡ Extract Kanban Issues'}
            </button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2"
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
              className="rounded-lg border border-slate-300 p-2.5 text-slate-600 hover:bg-slate-100 hover:text-teal-700 transition-colors"
              title={t('attachDocument')}
            >
              <Paperclip className="h-5 w-5" />
            </button>

            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={t('aiChatPlaceholder')}
              className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />

            <button
              type="submit"
              disabled={sending || (!inputValue.trim() && !attachedFile)}
              className="rounded-lg bg-teal-600 p-2.5 text-white shadow hover:bg-teal-700 disabled:opacity-50 transition-colors"
            >
              <Send className="h-5 w-5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
