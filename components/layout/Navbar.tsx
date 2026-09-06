'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileText, Kanban, Settings, Globe, LogOut, User as UserIcon, Sparkles } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useAuth } from '@/lib/auth-context';
import { AiAssistantModal } from '@/components/ai/AiAssistantModal';

export function Navbar() {
  const pathname = usePathname();
  const { lang, setLang, t } = useLanguage();
  const { user, isGuest, signOut } = useAuth();
  const [showAiModal, setShowAiModal] = useState(false);

  if (pathname === '/login' || !user) {
    return null;
  }

  const toggleLanguage = () => {
    setLang(lang === 'ar' ? 'en' : 'ar');
  };

  const navItems = [
    {
      href: '/reports',
      label: t('reports'),
      icon: FileText,
      active: pathname.startsWith('/reports'),
    },
    {
      href: '/dashboard',
      label: t('dashboard'),
      icon: Kanban,
      active: pathname.startsWith('/dashboard'),
    },
    {
      href: '/settings',
      label: t('settings'),
      icon: Settings,
      active: pathname.startsWith('/settings'),
    },
  ];

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-[#E7E6E2] dark:border-[#2B2B29] bg-[#FAFAF8]/90 dark:bg-[#161615]/90 backdrop-blur-md no-print transition-colors">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Brand & Main Nav */}
          <div className="flex items-center gap-8">
            <Link href="/reports" className="flex items-center gap-2.5 font-bold text-[#202020] dark:text-[#F2F2EE] text-base sm:text-lg">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#2E4034] text-white shadow-none">
                <FileText className="h-4.5 w-4.5" />
              </div>
              <span className="hidden sm:inline font-bold tracking-tight">{t('appName')}</span>
            </Link>

            <nav className="flex items-center gap-1 sm:gap-1.5">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition-all ${
                      item.active
                        ? 'bg-olive-100/70 dark:bg-[#20201F] text-olive-900 dark:text-olive-200 border border-olive-200/60 dark:border-[#2B2B29]'
                        : 'text-[#6B6964] dark:text-[#9E9C96] hover:bg-black/5 dark:hover:bg-white/5 hover:text-[#202020] dark:hover:text-[#F2F2EE]'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right Section: AI Assistant button, Language Toggle, User profile, Logout */}
          <div className="flex items-center gap-2 sm:gap-2.5">
            {/* AI Assistant Button */}
            <button
              type="button"
              onClick={() => setShowAiModal(true)}
              className="flex items-center gap-1.5 rounded-xl border border-olive-700/30 bg-[#2E4034] hover:bg-[#24382F] px-3 py-1.5 text-xs font-semibold text-white transition-all shadow-none"
              title={t('aiAssistant')}
            >
              <Sparkles className="h-3.5 w-3.5 text-olive-200" />
              <span className="hidden md:inline">{t('aiAssistant')}</span>
            </button>

            {/* Language Switcher */}
            <button
              type="button"
              onClick={toggleLanguage}
              className="flex items-center gap-1.5 rounded-xl border border-[#E7E6E2] dark:border-[#2B2B29] bg-white dark:bg-[#20201F] px-2.5 py-1.5 text-xs font-semibold text-[#202020] dark:text-[#F2F2EE] hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              title={lang === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
            >
              <Globe className="h-3.5 w-3.5 text-olive-700 dark:text-olive-400" />
              <span>{lang === 'ar' ? 'English' : 'عربي'}</span>
            </button>

            {/* User badge */}
            <div className="hidden md:flex items-center gap-2 rounded-xl bg-white dark:bg-[#20201F] px-2.5 py-1.5 text-xs text-[#6B6964] dark:text-[#9E9C96] border border-[#E7E6E2] dark:border-[#2B2B29]">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-olive-100 dark:bg-olive-950 text-olive-800 dark:text-olive-200 font-bold">
                {user.email ? user.email.charAt(0).toUpperCase() : 'U'}
              </div>
              <span className="max-w-[130px] truncate font-medium text-[#202020] dark:text-[#F2F2EE]">
                {user.displayName || user.email}
              </span>
              {isGuest && (
                <span className="rounded-md bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                  {t('guestBadge')}
                </span>
              )}
            </div>

            {/* Logout */}
            <button
              type="button"
              onClick={() => signOut()}
              className="flex items-center gap-1 rounded-xl p-2 text-[#6B6964] dark:text-[#9E9C96] hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-600 transition-colors"
              title={t('logout')}
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline text-xs font-medium">{t('logout')}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Floating AI Assistant Trigger Button (Bottom-End corner) */}
      <div className="no-print fixed bottom-6 end-6 z-40">
        <button
          type="button"
          onClick={() => setShowAiModal(true)}
          className="group relative flex h-13 w-13 items-center justify-center rounded-2xl bg-[#2E4034] hover:bg-[#24382F] text-white border border-[#3E5C4E] shadow-sm hover:scale-105 transition-all focus:outline-none focus:ring-2 focus:ring-olive-400 p-3.5"
          title={t('aiAssistant')}
        >
          <Sparkles className="h-5 w-5 text-olive-100" />
        </button>
      </div>

      {/* AI Assistant Dialogue Modal */}
      <AiAssistantModal isOpen={showAiModal} onClose={() => setShowAiModal(false)} />
    </>
  );
}
