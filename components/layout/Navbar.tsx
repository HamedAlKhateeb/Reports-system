import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileText, Kanban, Settings, Globe, LogOut, Sparkles } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useAuth } from '@/lib/auth-context';
import { AiAssistantModal } from '@/components/ai/AiAssistantModal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

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
      <header className="sticky top-0 z-40 w-full border-b border-border/80 bg-background/80 backdrop-blur-md no-print transition-colors">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-2.5 sm:px-6 lg:px-8">
          {/* Brand & Main Nav */}
          <div className="flex items-center gap-2 sm:gap-5 lg:gap-7">
            <Link
              href="/reports"
              className="flex items-center gap-2.5 font-bold text-foreground text-base sm:text-lg flex-shrink-0 hover:opacity-90 transition-opacity"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#2E4034] text-white shadow-xs">
                <FileText className="h-4.5 w-4.5" />
              </div>
              <span className="hidden sm:inline font-bold tracking-tight">{t('appName')}</span>
            </Link>

            <Separator orientation="vertical" className="hidden sm:block h-5" />

            <nav className="flex items-center gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Button
                    key={item.href}
                    asChild
                    variant={item.active ? 'secondary' : 'ghost'}
                    size="sm"
                    className={cn(
                      'h-9 gap-1.5 rounded-lg text-xs font-semibold px-2.5 sm:px-3',
                      item.active &&
                        'bg-olive-100 text-olive-900 border border-olive-200/80 dark:bg-olive-950/70 dark:text-olive-200 dark:border-olive-800/80 font-bold shadow-2xs'
                    )}
                  >
                    <Link href={item.href} title={item.label}>
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      <span className="hidden sm:inline">{item.label}</span>
                    </Link>
                  </Button>
                );
              })}
            </nav>
          </div>

          {/* Right Section: AI Assistant button, Language Toggle, User profile, Logout */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            {/* AI Assistant Button */}
            <Button
              type="button"
              size="sm"
              onClick={() => setShowAiModal(true)}
              className="h-9 gap-1.5 rounded-lg bg-[#2E4034] hover:bg-[#24382F] text-white shadow-xs font-semibold text-xs px-2.5 sm:px-3"
              title={t('aiAssistant')}
            >
              <Sparkles className="h-3.5 w-3.5 text-olive-200" />
              <span className="hidden md:inline">{t('aiAssistant')}</span>
            </Button>

            {/* Language Switcher */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={toggleLanguage}
              className="h-9 gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-foreground hover:bg-muted/80 shadow-2xs"
              title={lang === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
            >
              <Globe className="h-3.5 w-3.5 text-olive-700 dark:text-olive-400" />
              <span className="text-[11px] sm:text-xs font-bold">{lang === 'ar' ? 'EN' : 'ع'}</span>
            </Button>

            {/* User badge */}
            <div className="hidden md:flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground h-9 shadow-2xs">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-olive-100 text-olive-800 dark:bg-olive-950 dark:text-olive-200 font-bold text-[10px]">
                {user.email ? user.email.charAt(0).toUpperCase() : 'U'}
              </div>
              <span className="max-w-[120px] truncate font-medium text-foreground text-xs">
                {user.displayName || user.email}
              </span>
              {isGuest && (
                <Badge
                  variant="outline"
                  className="border-amber-400/80 bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 text-[10px] font-bold px-1.5 py-0 rounded-md"
                >
                  {t('guestBadge')}
                </Badge>
              )}
            </div>

            {/* Logout */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => signOut()}
              className="h-9 gap-1.5 rounded-lg px-2 text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
              title={t('logout')}
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline text-xs font-medium">{t('logout')}</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Floating AI Assistant Trigger Button (Bottom-End corner) */}
      <div className="no-print fixed bottom-6 end-6 z-40">
        <Button
          type="button"
          onClick={() => setShowAiModal(true)}
          className="h-12 w-12 rounded-xl bg-[#2E4034] hover:bg-[#24382F] text-white border border-[#3E5C4E] shadow-lg hover:scale-105 transition-transform p-0 flex items-center justify-center"
          title={t('aiAssistant')}
        >
          <Sparkles className="h-5 w-5 text-olive-100" />
        </Button>
      </div>

      {/* AI Assistant Dialogue Modal */}
      <AiAssistantModal isOpen={showAiModal} onClose={() => setShowAiModal(false)} />
    </>
  );
}
