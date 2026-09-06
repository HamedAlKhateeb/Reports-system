'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileText, Kanban, Settings, Globe, LogOut, User as UserIcon } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useAuth } from '@/lib/auth-context';

export function Navbar() {
  const pathname = usePathname();
  const { lang, setLang, t } = useLanguage();
  const { user, isGuest, signOut } = useAuth();

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
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/95 backdrop-blur shadow-sm">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand & Main Nav */}
        <div className="flex items-center gap-8">
          <Link href="/reports" className="flex items-center gap-2.5 font-bold text-teal-800 text-lg">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-600 text-white shadow-sm">
              <FileText className="h-5 w-5" />
            </div>
            <span className="hidden sm:inline font-bold">{t('appName')}</span>
          </Link>

          <nav className="flex items-center gap-1 sm:gap-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    item.active
                      ? 'bg-teal-50 text-teal-800 font-semibold'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right Section: Language Toggle, User profile, Logout */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Language Switcher */}
          <button
            type="button"
            onClick={toggleLanguage}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            title={lang === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
          >
            <Globe className="h-3.5 w-3.5 text-teal-600" />
            <span>{lang === 'ar' ? 'English' : 'عربي'}</span>
          </button>

          {/* User badge */}
          <div className="hidden md:flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600 border border-slate-200">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-100 text-teal-800 font-bold">
              {user.email ? user.email.charAt(0).toUpperCase() : 'U'}
            </div>
            <span className="max-w-[140px] truncate font-medium">{user.displayName || user.email}</span>
            {isGuest && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-200">
                {t('guestBadge')}
              </span>
            )}
          </div>

          {/* Logout */}
          <button
            type="button"
            onClick={() => signOut()}
            className="flex items-center gap-1 rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors"
            title={t('logout')}
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline text-xs font-medium">{t('logout')}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
