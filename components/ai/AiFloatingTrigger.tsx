'use client';

import React, { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Sparkles, Bot, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { AiAssistantModal } from './AiAssistantModal';

export function AiFloatingTrigger() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const { user } = useAuth();
  const { lang } = useLanguage();
  const isAr = lang === 'ar';

  // Keyboard shortcut listener: Alt + A to toggle AI Assistant
  useEffect(() => {
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
  }, [isOpen]);

  // Do not render on login page or if user is not authenticated
  if (pathname === '/login' || !user) {
    return null;
  }

  return (
    <>
      {/* Floating Side Action Button on the RIGHT of the page */}
      <aside
        aria-label={isAr ? 'زر المساعد الذكي' : 'AI Assistant Button'}
        className="fixed right-4 bottom-6 z-40 no-print flex items-center gap-2 group"
      >
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`relative flex items-center gap-2.5 rounded-full px-4 py-3 text-white shadow-xl transition-all duration-300 ease-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#2E4034] ${
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
          {/* Animated Glow Pill */}
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
          </span>

          <div className="flex items-center gap-1.5">
            {isOpen ? (
              <X className="h-5 w-5 text-olive-100 transition-transform duration-200" />
            ) : (
              <Sparkles className="h-5 w-5 text-olive-200 transition-transform duration-200 group-hover:rotate-12" />
            )}
            <span className="text-xs font-bold tracking-tight select-none">
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
