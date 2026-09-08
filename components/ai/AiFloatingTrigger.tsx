'use client';

import React, { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Sparkles, Bot, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { getAiAssistantVisible } from '@/lib/ai-config';
import { AiAssistantModal } from './AiAssistantModal';

export function AiFloatingTrigger() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const { user } = useAuth();
  const { lang } = useLanguage();
  const isAr = lang === 'ar';
  const [isVisible, setIsVisible] = useState<boolean>(() => getAiAssistantVisible(user?.uid));

  // Sync visibility with global settings and events
  useEffect(() => {
    setIsVisible(getAiAssistantVisible(user?.uid));
  }, [user?.uid]);

  useEffect(() => {
    const handleVisChange = (e: any) => {
      if (typeof e.detail?.visible === 'boolean') {
        setIsVisible(e.detail.visible);
      }
    };
    window.addEventListener('ai-assistant-visibility-changed', handleVisChange);
    return () => window.removeEventListener('ai-assistant-visibility-changed', handleVisChange);
  }, []);

  // Keyboard shortcut listener: Alt + A to toggle AI Assistant (only active if visible)
  useEffect(() => {
    if (!isVisible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === 'a' || e.key === 'A' || e.key === 'ش')) {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isVisible]);

  // Do not render if disabled by user, or on login page, or if user is not authenticated, or on shared public reports
  if (!isVisible || pathname === '/login' || !user || pathname.startsWith('/share/')) {
    return null;
  }

  return (
    <>
      {/* Floating Side Action Button on the RIGHT of the page */}
      <aside
        aria-label={isAr ? 'زر المساعد الذكي' : 'AI Assistant Button'}
        className="fixed right-3 bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:right-6 sm:bottom-6 z-40 no-print flex items-center gap-2 group"
      >
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-label={
            isOpen
              ? isAr ? 'إغلاق المساعد الذكي' : 'Close AI Copilot'
              : isAr ? 'المساعد الذكي (Alt+A)' : 'AI Copilot (Alt+A)'
          }
          className={`relative flex items-center justify-center gap-2.5 rounded-full size-11 sm:size-auto sm:px-4 sm:py-3 text-white shadow-xl transition-all duration-300 ease-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#2E4034] ${
            isOpen
              ? 'bg-[#1D2B22] shadow-2xl scale-95'
              : 'bg-gradient-to-r from-[#2E4034] to-[#3B5444] hover:from-[#24382F] hover:to-[#2E4034] hover:scale-105 hover:shadow-2xl'
          }`}
          title={
            isOpen
              ? isAr ? 'إغلاق المساعد الذكي' : 'Close AI Copilot'
              : isAr ? 'المساعد الذكي (Alt+A)' : 'AI Copilot (Alt+A)'
          }
        >

          <div className="flex items-center gap-1.5">
            {isOpen ? (
              <X className="h-5 w-5 text-olive-100 transition-transform duration-200" />
            ) : (
              <Sparkles className="h-5 w-5 text-olive-200 transition-transform duration-200 group-hover:rotate-12" />
            )}
            <span className="text-xs font-bold tracking-tight select-none hidden sm:inline-block">
              {isAr ? 'المساعد الذكي' : 'AI Copilot'}
            </span>
          </div>

          <span className="hidden sm:inline-block rounded-full bg-white/15 px-1.5 py-0.5 text-[10px] font-semibold text-olive-100">
            Alt+A
          </span>
        </button>
      </aside>

      {/* AI Assistant Sidecar Popup Drawer */}
      <AiAssistantModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
