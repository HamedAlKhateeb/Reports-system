'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { updateIssue, getIssueById } from '@/lib/db';
import { toast } from '@/components/ui/toast';

export type PomodoroMode = 'work' | 'short_break' | 'long_break';

export interface PomodoroSettings {
  workMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  longBreakInterval: number;
}

export interface PomodoroTaskInfo {
  id: string;
  title: string;
}

interface PomodoroContextType {
  mode: PomodoroMode;
  timeLeft: number;
  totalDuration: number;
  isRunning: boolean;
  activeTask: PomodoroTaskInfo | null;
  completedWorkSessions: number;
  isOpen: boolean;
  settings: PomodoroSettings;
  startTaskPomodoro: (taskId: string, taskTitle: string) => void;
  startTimer: () => void;
  pauseTimer: () => void;
  toggleTimer: () => void;
  resetTimer: () => void;
  skipPhase: () => void;
  switchMode: (mode: PomodoroMode) => void;
  setIsOpen: (open: boolean) => void;
  updateSettings: (newSettings: Partial<PomodoroSettings>) => void;
}

const DEFAULT_SETTINGS: PomodoroSettings = {
  workMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakInterval: 4,
};

const POMODORO_STORAGE_KEY = 'review_app_pomodoro_state';

const PomodoroContext = createContext<PomodoroContextType | undefined>(undefined);

function playChime(type: 'work_complete' | 'break_complete') {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'work_complete') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime);
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.12);
      osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.24);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.setValueAtTime(349.23, ctx.currentTime + 0.15);
    }

    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9);
    osc.start();
    osc.stop(ctx.currentTime + 0.9);
  } catch (e) {}
}

export function PomodoroProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<PomodoroSettings>(DEFAULT_SETTINGS);
  const [mode, setMode] = useState<PomodoroMode>('work');
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [activeTask, setActiveTask] = useState<PomodoroTaskInfo | null>(null);
  const [completedWorkSessions, setCompletedWorkSessions] = useState<number>(0);
  const [isOpen, setIsOpen] = useState<boolean>(false);

  const getDurationForMode = useCallback(
    (m: PomodoroMode, cfg: PomodoroSettings): number => {
      switch (m) {
        case 'work':
          return cfg.workMinutes * 60;
        case 'short_break':
          return cfg.shortBreakMinutes * 60;
        case 'long_break':
          return cfg.longBreakMinutes * 60;
      }
    },
    []
  );

  const [timeLeft, setTimeLeft] = useState<number>(() => getDurationForMode('work', DEFAULT_SETTINGS));
  const totalDuration = getDurationForMode(mode, settings);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(POMODORO_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.settings) setSettings(parsed.settings);
        if (parsed.mode) setMode(parsed.mode);
        if (typeof parsed.timeLeft === 'number') setTimeLeft(parsed.timeLeft);
        if (parsed.activeTask) setActiveTask(parsed.activeTask);
        if (typeof parsed.completedWorkSessions === 'number') {
          setCompletedWorkSessions(parsed.completedWorkSessions);
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        POMODORO_STORAGE_KEY,
        JSON.stringify({
          settings,
          mode,
          timeLeft,
          activeTask,
          completedWorkSessions,
        })
      );
    } catch {}
  }, [settings, mode, timeLeft, activeTask, completedWorkSessions]);

  const logSessionToTask = useCallback(
    async (task: PomodoroTaskInfo, durationMinutes: number) => {
      try {
        const existing = await getIssueById(task.id);
        const currentSessions = existing?.pomodoroSessions || 0;
        const currentMinutes = existing?.timeSpentMinutes || 0;

        await updateIssue(task.id, {
          pomodoroSessions: currentSessions + 1,
          timeSpentMinutes: currentMinutes + durationMinutes,
          updatedAt: new Date().toISOString(),
        });

        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('issues-updated', {
              detail: { issueId: task.id },
            })
          );
        }
      } catch (err) {
        console.warn('Failed to record pomodoro on task:', err);
      }
    },
    []
  );

  const handlePhaseComplete = useCallback(async () => {
    setIsRunning(false);

    if (mode === 'work') {
      playChime('work_complete');
      const nextCompleted = completedWorkSessions + 1;
      setCompletedWorkSessions(nextCompleted);

      if (activeTask) {
        void logSessionToTask(activeTask, settings.workMinutes);
        toast.success(
          `🎉 رائع! أكملت جلسة تركيز (${settings.workMinutes} دقيقة) للمهمة «${activeTask.title}». حان وقت الراحة.`
        );
      } else {
        toast.success(`🎉 أحسنت! أكملت جلسة تركيز (${settings.workMinutes} دقيقة). حان وقت الراحة.`);
      }

      const isLong = nextCompleted % settings.longBreakInterval === 0;
      const nextMode: PomodoroMode = isLong ? 'long_break' : 'short_break';
      setMode(nextMode);
      setTimeLeft(getDurationForMode(nextMode, settings));
    } else {
      playChime('break_complete');
      toast.info('انتهت الاستراحة! جاهز لبدء جلسة تركيز جديدة؟');
      setMode('work');
      setTimeLeft(getDurationForMode('work', settings));
    }
  }, [mode, activeTask, completedWorkSessions, settings, getDurationForMode, logSessionToTask]);

  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          void handlePhaseComplete();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, handlePhaseComplete]);

  const startTimer = useCallback(() => {
    setIsRunning(true);
  }, []);

  const pauseTimer = useCallback(() => {
    setIsRunning(false);
  }, []);

  const toggleTimer = useCallback(() => {
    setIsRunning((prev) => !prev);
  }, []);

  const resetTimer = useCallback(() => {
    setIsRunning(false);
    setTimeLeft(getDurationForMode(mode, settings));
  }, [mode, settings, getDurationForMode]);

  const skipPhase = useCallback(() => {
    setIsRunning(false);
    if (mode === 'work') {
      const isLong = (completedWorkSessions + 1) % settings.longBreakInterval === 0;
      const nextMode: PomodoroMode = isLong ? 'long_break' : 'short_break';
      setMode(nextMode);
      setTimeLeft(getDurationForMode(nextMode, settings));
    } else {
      setMode('work');
      setTimeLeft(getDurationForMode('work', settings));
    }
  }, [mode, completedWorkSessions, settings, getDurationForMode]);

  const switchMode = useCallback(
    (newMode: PomodoroMode) => {
      setIsRunning(false);
      setMode(newMode);
      setTimeLeft(getDurationForMode(newMode, settings));
    },
    [settings, getDurationForMode]
  );

  const startTaskPomodoro = useCallback(
    (taskId: string, taskTitle: string) => {
      setActiveTask({ id: taskId, title: taskTitle });
      setMode('work');
      setTimeLeft(getDurationForMode('work', settings));
      setIsRunning(true);
      setIsOpen(true);
      toast.success(`تم بدء جلسة بومودورو للمهمة: ${taskTitle}`);
    },
    [settings, getDurationForMode]
  );

  const updateSettings = useCallback(
    (newSettings: Partial<PomodoroSettings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...newSettings };
        if (!isRunning) {
          setTimeLeft(getDurationForMode(mode, next));
        }
        return next;
      });
    },
    [isRunning, mode, getDurationForMode]
  );

  return (
    <PomodoroContext.Provider
      value={{
        mode,
        timeLeft,
        totalDuration,
        isRunning,
        activeTask,
        completedWorkSessions,
        isOpen,
        settings,
        startTaskPomodoro,
        startTimer,
        pauseTimer,
        toggleTimer,
        resetTimer,
        skipPhase,
        switchMode,
        setIsOpen,
        updateSettings,
      }}
    >
      {children}
    </PomodoroContext.Provider>
  );
}

export function usePomodoro() {
  const context = useContext(PomodoroContext);
  if (!context) {
    throw new Error('usePomodoro must be used within a PomodoroProvider');
  }
  return context;
}
