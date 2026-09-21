'use client';

import React from 'react';
import type { BoardWidget, TaskWidgetData, TaskStatus, TaskPriority } from '@/lib/boards-types';
import { useProject } from '@/lib/project-context';
import { useAuth } from '@/lib/auth-context';
import { usePomodoro } from '@/lib/pomodoro-context';
import { createNotification } from '@/lib/notifications-db';
import { CheckCircle2, Circle, Clock, AlertCircle, Calendar, User, UserCheck, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

interface TaskWidgetProps {
  widget: BoardWidget;
  onChange: (data: Partial<TaskWidgetData>, title?: string) => void;
  lang?: 'ar' | 'en';
}

const statusConfig: Record<TaskStatus, { labelAr: string; labelEn: string; color: string; icon: any }> = {
  todo: {
    labelAr: 'قيد الانتظار',
    labelEn: 'To Do',
    color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700',
    icon: Circle,
  },
  'in-progress': {
    labelAr: 'قيد التنفيذ',
    labelEn: 'In Progress',
    color: 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-300 dark:border-blue-800',
    icon: Clock,
  },
  done: {
    labelAr: 'مكتملة',
    labelEn: 'Done',
    color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800',
    icon: CheckCircle2,
  },
};

const priorityConfig: Record<TaskPriority, { labelAr: string; labelEn: string; color: string }> = {
  low: {
    labelAr: 'منخفضة',
    labelEn: 'Low',
    color: 'text-slate-500 bg-slate-100 dark:bg-slate-800 dark:text-slate-400',
  },
  medium: {
    labelAr: 'متوسطة',
    labelEn: 'Medium',
    color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/50 dark:text-blue-400',
  },
  high: {
    labelAr: 'عالية',
    labelEn: 'High',
    color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/50 dark:text-amber-400',
  },
  urgent: {
    labelAr: 'عاجلة',
    labelEn: 'Urgent',
    color: 'text-rose-600 bg-rose-50 dark:bg-rose-950/50 dark:text-rose-400 font-bold',
  },
};

export function getTextDirection(text?: string, fallback: 'rtl' | 'ltr' = 'rtl'): 'rtl' | 'ltr' {
  if (!text || !text.trim()) return fallback;
  const rtlRegex = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/;
  const ltrRegex = /[A-Za-z]/;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (rtlRegex.test(ch)) return 'rtl';
    if (ltrRegex.test(ch)) return 'ltr';
  }
  return fallback;
}

export function TaskWidget({ widget, onChange, lang = 'ar' }: TaskWidgetProps) {
  const { team } = useProject();
  const { user } = useAuth();
  const { activeTask, isRunning, startTaskPomodoro, toggleTimer } = usePomodoro();
  const data = (widget.data || {}) as TaskWidgetData;
  const status = data.status || 'todo';
  const priority = data.priority || 'medium';
  const isArabic = lang === 'ar';
  const isPomodoroActive = activeTask?.id === widget.id && isRunning;

  const currentStatus = statusConfig[status] || statusConfig.todo;
  const currentPriority = priorityConfig[priority] || priorityConfig.medium;
  const StatusIcon = currentStatus.icon;

  const titleDir = getTextDirection(widget.title, isArabic ? 'rtl' : 'ltr');
  const descDir = getTextDirection(data.description, isArabic ? 'rtl' : 'ltr');

  const cycleStatus = (e: React.MouseEvent) => {
    e.stopPropagation();
    const sequence: TaskStatus[] = ['todo', 'in-progress', 'done'];
    const nextIdx = (sequence.indexOf(status) + 1) % sequence.length;
    const nextStatus = sequence[nextIdx];
    onChange({ status: nextStatus });

    // Notify assignee if someone else updated status
    if (data.assigneeUid && data.assigneeUid !== user?.uid) {
      const nextConfig = statusConfig[nextStatus];
      void createNotification({
        recipientUid: data.assigneeUid,
        recipientEmail: data.assigneeEmail,
        senderUid: user?.uid || 'user',
        senderName: user?.displayName || user?.email?.split('@')[0] || (isArabic ? 'عضو الفريق' : 'Team Member'),
        type: 'task_updated',
        title: isArabic ? 'تحديث على المهمة' : 'Task updated',
        body: isArabic
          ? `تم تحديث حالة المهمة "${widget.title || 'مهمة'}" إلى: ${nextConfig.labelAr}`
          : `Task "${widget.title || 'Task'}" status updated to: ${nextConfig.labelEn}`,
        link: '/boards',
        entityId: widget.id,
      });
    }
  };

  const cyclePriority = (e: React.MouseEvent) => {
    e.stopPropagation();
    const sequence: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];
    const nextIdx = (sequence.indexOf(priority) + 1) % sequence.length;
    onChange({ priority: sequence[nextIdx] });
  };

  const handleAssign = (member: { userId?: string; email: string; name?: string } | null) => {
    if (!member) {
      onChange({
        assigneeUid: undefined,
        assigneeEmail: undefined,
        assigneeName: undefined,
      });
    } else {
      const targetUid = member.userId || member.email;
      onChange({
        assigneeUid: targetUid,
        assigneeEmail: member.email,
        assigneeName: member.name || member.email.split('@')[0],
      });

      // Send assignment notification to the assigned user
      if (targetUid && targetUid !== user?.uid && member.email !== user?.email) {
        void createNotification({
          recipientUid: targetUid,
          recipientEmail: member.email,
          senderUid: user?.uid || 'user',
          senderName: user?.displayName || user?.email?.split('@')[0] || (isArabic ? 'عضو الفريق' : 'Team Member'),
          type: 'task_assigned',
          title: isArabic ? 'تم تعيين مهمة جديدة لك' : 'New task assigned to you',
          body: isArabic
            ? `قام ${user?.displayName || user?.email?.split('@')[0] || 'أحد أعضاء الفريق'} بتعيين المهمة "${widget.title || 'مهمة'}" لك.`
            : `${user?.displayName || user?.email?.split('@')[0] || 'A team member'} assigned task "${widget.title || 'Task'}" to you.`,
          link: '/boards',
          entityId: widget.id,
        });
      }
    }
  };

  const teamMembers = team?.members || [];

  return (
    <div className="flex flex-col h-full w-full p-3 gap-2 select-text">
      {/* Header: Title and Status badge */}
      <div className="flex items-start justify-between gap-2">
        <input
          type="text"
          value={widget.title || ''}
          placeholder={isArabic ? 'عنوان المهمة...' : 'Task title...'}
          onChange={(e) => onChange({}, e.target.value)}
          onMouseDown={(e) => e.stopPropagation()}
          className={cn(
            'flex-1 font-semibold text-sm bg-transparent border-b border-transparent hover:border-border/60 focus:border-primary focus:outline-none px-1 py-0.5 transition-colors',
            status === 'done' && 'line-through text-muted-foreground',
            titleDir === 'rtl' ? 'text-right text-arabic' : 'text-left'
          )}
          dir={titleDir}
          style={{ unicodeBidi: 'plaintext' }}
        />

        {/* Status Clickable Pill */}
        <button
          type="button"
          onClick={cycleStatus}
          onMouseDown={(e) => e.stopPropagation()}
          title={isArabic ? 'اضغط لتغيير الحالة' : 'Click to cycle status'}
          className={cn(
            'flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border transition-transform active:scale-95 shrink-0',
            currentStatus.color
          )}
        >
          <StatusIcon className="w-3 h-3" />
          <span>{isArabic ? currentStatus.labelAr : currentStatus.labelEn}</span>
        </button>
      </div>

      {/* Description */}
      <textarea
        value={data.description || ''}
        placeholder={isArabic ? 'تفاصيل المهمة...' : 'Task description...'}
        onChange={(e) => onChange({ description: e.target.value })}
        onMouseDown={(e) => e.stopPropagation()}
        className={cn(
          'flex-1 w-full text-xs text-foreground/80 bg-background/50 dark:bg-background/30 rounded border border-border/40 p-2 resize-none focus:outline-none focus:border-primary/60 transition-colors leading-relaxed',
          descDir === 'rtl' ? 'text-right text-arabic' : 'text-left'
        )}
        dir={descDir}
        style={{ unicodeBidi: 'plaintext' }}
      />

      {/* Assignee Row */}
      <div className="flex items-center justify-between gap-1 text-[11px] text-muted-foreground pt-1 border-t border-border/20">
        <div className="flex items-center gap-1.5" onMouseDown={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  'flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium transition-colors hover:bg-muted border border-border/50',
                  data.assigneeEmail ? 'bg-primary/10 text-primary border-primary/30' : 'text-muted-foreground'
                )}
                title={isArabic ? 'تعيين مسؤول عن المهمة' : 'Assign task'}
              >
                {data.assigneeEmail ? (
                  <>
                    <UserCheck className="w-3 h-3 text-primary shrink-0" />
                    <span className="truncate max-w-[110px]">{data.assigneeName || data.assigneeEmail}</span>
                  </>
                ) : (
                  <>
                    <User className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span>{isArabic ? 'غير معيّنة' : 'Unassigned'}</span>
                  </>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              <DropdownMenuLabel className="text-xs font-bold text-muted-foreground">
                {isArabic ? 'تعيين إلى عضو الفريق' : 'Assign to team member'}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {teamMembers.length === 0 ? (
                <div className="p-2 text-center text-xs text-muted-foreground">
                  {isArabic ? 'لا يوجد أعضاء بالفريق' : 'No team members'}
                </div>
              ) : (
                teamMembers.map((m) => {
                  const isAssigned = data.assigneeEmail?.toLowerCase() === m.email.toLowerCase();
                  return (
                    <DropdownMenuItem
                      key={m.id}
                      onClick={() => handleAssign(m)}
                      className="flex items-center justify-between text-xs cursor-pointer"
                    >
                      <span className="truncate">{m.name || m.email}</span>
                      {isAssigned && <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />}
                    </DropdownMenuItem>
                  );
                })
              )}
              {data.assigneeEmail && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => handleAssign(null)}
                    className="text-xs text-rose-600 hover:text-rose-700 cursor-pointer gap-1.5"
                  >
                    <X className="w-3 h-3" />
                    <span>{isArabic ? 'إلغاء التعيين' : 'Remove assignment'}</span>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Due date */}
        <div className="flex items-center gap-1 text-muted-foreground text-[10px]">
          <Calendar className="w-3 h-3 text-muted-foreground/70" />
          <input
            type="date"
            value={data.dueDate || ''}
            onChange={(e) => onChange({ dueDate: e.target.value })}
            onMouseDown={(e) => e.stopPropagation()}
            className="bg-transparent border-0 text-[10px] text-muted-foreground focus:outline-none cursor-pointer"
          />
        </div>
      </div>

      {/* Footer: Priority cycle button & Pomodoro */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/30 text-xs">
        <button
          type="button"
          onClick={cyclePriority}
          onMouseDown={(e) => e.stopPropagation()}
          title={isArabic ? 'اضغط لتغيير الأولوية' : 'Click to cycle priority'}
          className={cn(
            'flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md font-medium transition-transform active:scale-95',
            currentPriority.color
          )}
        >
          <AlertCircle className="w-2.5 h-2.5" />
          <span>{isArabic ? currentPriority.labelAr : currentPriority.labelEn}</span>
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (isPomodoroActive) {
              toggleTimer();
            } else {
              startTaskPomodoro(widget.id, widget.title || (isArabic ? 'مهمة' : 'Task'));
            }
          }}
          onMouseDown={(e) => e.stopPropagation()}
          className={cn(
            'flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md font-medium transition-all',
            isPomodoroActive
              ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 animate-pulse font-bold'
              : 'text-muted-foreground hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40'
          )}
          title={isArabic ? 'بدء مؤقت بومودورو لهذه المهمة' : 'Start Pomodoro timer for this task'}
        >
          <span>🍅</span>
          <span>{isPomodoroActive ? (isArabic ? 'جارية' : 'Running') : (isArabic ? 'بومودورو' : 'Pomodoro')}</span>
        </button>
      </div>
    </div>
  );
}
