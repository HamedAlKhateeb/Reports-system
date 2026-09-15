'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  FileText,
  Kanban,
  Settings,
  Globe,
  LogOut,
  Sparkles,
  Menu,
  BookOpen,
  Bell,
  UserPlus,
} from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useAuth } from '@/lib/auth-context';
import { useInviteInbox } from '@/lib/invites';
import { InviteInboxDialog } from '@/components/collaboration/InviteInboxDialog';
import { getAiAssistantVisible, saveAiAssistantVisible } from '@/lib/ai-config';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuGroup,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { AppLogo } from './AppLogo';

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { lang, setLang, t } = useLanguage();
  const { user, isGuest, signOut } = useAuth();
  const [isAiVisible, setIsAiVisible] = useState(() => getAiAssistantVisible(user?.uid));
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // Invite inbox: reports shared with me (bell + account menu entry).
  const { inbox, unseen, unseenCount, markSeen, markAllSeen } = useInviteInbox(
    isGuest ? null : user?.uid,
    isGuest ? null : user?.email
  );
  // Account-click invites dialog (the user asked: pressing my account shows the invite).
  const [showInvites, setShowInvites] = useState(false);

  useEffect(() => {
    setIsAiVisible(getAiAssistantVisible(user?.uid));
    const handleVis = (e: any) => {
      if (typeof e.detail?.visible === 'boolean') {
        setIsAiVisible(e.detail.visible);
      }
    };
    window.addEventListener('ai-assistant-visibility-changed', handleVis);
    return () => window.removeEventListener('ai-assistant-visibility-changed', handleVis);
  }, [user?.uid]);

  const toggleAiVisibility = async () => {
    const next = !isAiVisible;
    setIsAiVisible(next);
    await saveAiAssistantVisible(next, user?.uid);
  };

  if (pathname === '/login' || !user || pathname.startsWith('/share/')) {
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
      active: pathname.startsWith('/dashboard') || pathname.startsWith('/issues'),
    },
    {
      href: '/instructions',
      label: t('instructions'),
      icon: BookOpen,
      active: pathname.startsWith('/instructions'),
    },
    {
      href: '/settings',
      label: t('settings'),
      icon: Settings,
      active: pathname.startsWith('/settings'),
    },
  ];

  const userInitial = user.displayName
    ? user.displayName.charAt(0).toUpperCase()
    : user.email
    ? user.email.charAt(0).toUpperCase()
    : 'U';

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/80 bg-background/80 backdrop-blur-md no-print transition-colors">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-3 sm:px-6 lg:px-8">
        {/* Brand & Main Nav (Desktop) */}
        <div className="flex items-center gap-2 sm:gap-4 lg:gap-6 min-w-0">
          <Link
            href="/reports"
            className="flex items-center hover:opacity-90 transition-opacity shrink-0"
          >
            <AppLogo size="md" showWordmark={true} />
          </Link>

          <Separator orientation="vertical" className="hidden md:block h-5" />

          {/* Desktop Nav Items */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Button
                  key={item.href}
                  asChild
                  variant={item.active ? 'secondary' : 'ghost'}
                  size="sm"
                  className={cn(
                    'font-medium text-xs',
                    item.active && 'font-semibold text-foreground bg-secondary'
                  )}
                >
                  <Link href={item.href} title={item.label}>
                    <Icon data-icon="inline-start" />
                    <span>{item.label}</span>
                  </Link>
                </Button>
              );
            })}
          </nav>
        </div>

        {/* Right Section: Desktop User Menu & Language Toggle */}
        <div className="hidden md:flex items-center gap-2 shrink-0">
          {/* Language Switcher */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={toggleLanguage}
            title={lang === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
          >
            <Globe data-icon="inline-start" />
            <span>{lang === 'ar' ? 'English' : 'العربية'}</span>
          </Button>

          {/* Invite inbox bell (shared-with-me reports) */}
          {!isGuest && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="relative gap-2 px-2 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                  title={lang === 'ar' ? 'دعوات المشاركة' : 'Share invites'}
                  aria-label={lang === 'ar' ? `دعوات المشاركة (${unseenCount} جديدة)` : `Share invites (${unseenCount} new)`}
                >
                  <Bell className="size-4" />
                  {unseenCount > 0 && (
                    <span className="absolute -top-0.5 -end-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-bold text-white">
                      {unseenCount > 99 ? '99+' : unseenCount}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel className="flex items-center justify-between">
                  <span className="text-xs font-bold">
                    {lang === 'ar' ? 'تقارير شاركها معي الآخرون' : 'Reports shared with me'}
                  </span>
                  {inbox.length > 0 && unseenCount > 0 && (
                    <button
                      type="button"
                      onClick={() => markAllSeen()}
                      className="text-[10px] font-semibold text-muted-foreground hover:text-foreground"
                    >
                      {lang === 'ar' ? 'تعليم الكل كمقروء' : 'Mark all read'}
                    </button>
                  )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {inbox.length === 0 ? (
                  <div className="px-3 py-4 text-center text-[11px] text-muted-foreground">
                    {lang === 'ar' ? 'لا توجد دعوات — التقارير المشاركة معك ستظهر هنا.' : 'No invites — reports shared with you will appear here.'}
                  </div>
                ) : (
                  <DropdownMenuGroup>
                    {inbox.slice(0, 8).map((rep) => {
                      const isNew = unseen.includes(rep.id);
                      return (
                        <DropdownMenuItem
                          key={rep.id}
                          onClick={() => {
                            markSeen(rep.id);
                            router.push(`/reports/${rep.id}`);
                          }}
                          className="flex cursor-pointer items-start gap-2"
                        >
                          <UserPlus className="mt-0.5 size-3.5 shrink-0 text-teal-600 dark:text-teal-400" />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                              <span className="truncate">{rep.title || (lang === 'ar' ? 'تقرير' : 'Report')}</span>
                              {isNew && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-600" />}
                            </span>
                            <span className="block text-[10px] text-muted-foreground">
                              #{rep.reportNumber}
                            </span>
                          </span>
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuGroup>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* User Profile Dropdown Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="gap-2 px-2 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Avatar className="size-7">
                  <AvatarFallback className="text-[11px] bg-primary text-primary-foreground font-bold">
                    {userInitial}
                  </AvatarFallback>
                </Avatar>
                <span className="text-xs font-medium text-foreground max-w-[120px] truncate">
                  {user.displayName || user.email}
                </span>
                {isGuest && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {t('guestBadge')}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-foreground truncate">
                    {user.displayName || (lang === 'ar' ? 'المستخدم' : 'User')}
                  </span>
                  <span className="text-[11px] text-muted-foreground truncate font-normal">
                    {user.email}
                  </span>
                  {isGuest && (
                    <div className="mt-1">
                      <Badge variant="secondary" className="text-[10px]">
                        {t('guestBadge')}
                      </Badge>
                    </div>
                  )}
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                {!isGuest && (
                  <DropdownMenuItem
                    onClick={() => setShowInvites(true)}
                    className="flex cursor-pointer items-center gap-2"
                  >
                    <Bell className="size-4 text-teal-600 dark:text-teal-400" />
                    <span className="flex-1">{lang === 'ar' ? 'دعوات المشاركة' : 'Share invites'}</span>
                    {unseenCount > 0 ? (
                      <Badge variant="destructive" className="px-1.5 py-0 text-[10px]">
                        {unseenCount > 99 ? '99+' : unseenCount}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                        {inbox.length}
                      </Badge>
                    )}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={toggleAiVisibility}
                  className="flex items-center justify-between cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    <span>{t('showAiAssistant')}</span>
                  </div>
                  <Badge variant={isAiVisible ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0">
                    {isAiVisible ? (lang === 'ar' ? 'ظاهر' : 'On') : (lang === 'ar' ? 'مخفي' : 'Off')}
                  </Badge>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/settings" className="flex items-center gap-2">
                    <Settings data-icon="inline-start" />
                    <span>{t('settings')}</span>
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => signOut()}
                className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
              >
                <LogOut data-icon="inline-start" />
                <span>{t('logout')}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Mobile Compact Header: Menu Trigger opening Sheet */}
        <div className="flex md:hidden items-center gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={toggleLanguage}
            className="h-8 px-2.5 text-xs font-semibold"
            title={lang === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
          >
            <Globe className="size-3.5 text-primary" />
            <span>{lang === 'ar' ? 'EN' : 'عربي'}</span>
          </Button>

          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="size-9 p-0"
                aria-label={lang === 'ar' ? 'فتح القائمة' : 'Open Menu'}
              >
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side={lang === 'ar' ? 'right' : 'left'}
              className="w-72 sm:w-80 flex flex-col justify-between p-6"
            >
              <div className="space-y-6">
                <SheetHeader className="text-start">
                  <SheetTitle className="flex items-center gap-3">
                    <Avatar className="size-9">
                      <AvatarFallback className="text-xs bg-primary text-primary-foreground font-bold">
                        {userInitial}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col text-start min-w-0">
                      <span className="text-xs font-bold text-foreground truncate">
                        {user.displayName || (lang === 'ar' ? 'المستخدم' : 'User')}
                      </span>
                      <span className="text-[11px] text-muted-foreground truncate font-normal">
                        {user.email}
                      </span>
                    </div>
                  </SheetTitle>
                  {isGuest && (
                    <div className="pt-1">
                      <Badge variant="secondary" className="text-[10px]">
                        {t('guestBadge')}
                      </Badge>
                    </div>
                  )}
                </SheetHeader>

                <Separator />

                {/* Navigation Links */}
                <nav className="flex flex-col gap-1.5">
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Button
                        key={item.href}
                        asChild
                        variant={item.active ? 'secondary' : 'ghost'}
                        className={cn(
                          'justify-start gap-3 h-10 text-xs font-medium',
                          item.active && 'font-semibold text-foreground bg-secondary'
                        )}
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        <Link href={item.href}>
                          <Icon className="size-4" />
                          <span>{item.label}</span>
                        </Link>
                      </Button>
                    );
                  })}
                </nav>

                <Separator />

                {/* Invite inbox (mobile) — tapping opens the full dialog too */}
                {!isGuest && (
                  <>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between px-2">
                        <div className="flex items-center gap-2">
                          <Bell className="size-4 text-teal-600 dark:text-teal-400" />
                          <span className="text-xs font-bold text-foreground">
                            {lang === 'ar' ? 'دعوات المشاركة' : 'Share invites'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {unseenCount > 0 && (
                            <Badge variant="destructive" className="px-1.5 py-0 text-[10px]">
                              {unseenCount > 99 ? '99+' : unseenCount}
                            </Badge>
                          )}
                          {inbox.length > 5 && (
                            <button
                              type="button"
                              onClick={() => {
                                setMobileMenuOpen(false);
                                setShowInvites(true);
                              }}
                              className="text-[10px] font-bold text-teal-700 dark:text-teal-300 hover:underline"
                            >
                              {lang === 'ar' ? 'عرض الكل' : 'View all'}
                            </button>
                          )}
                        </div>
                      </div>
                      {inbox.length === 0 ? (
                        <p className="px-2 text-[11px] text-muted-foreground">
                          {lang === 'ar' ? 'لا توجد دعوات بعد.' : 'No invites yet.'}
                        </p>
                      ) : (
                        inbox.slice(0, 5).map((rep) => (
                          <Button
                            key={rep.id}
                            variant="ghost"
                            className="w-full justify-start gap-2 h-9 text-xs font-medium"
                            onClick={() => {
                              markSeen(rep.id);
                              setMobileMenuOpen(false);
                              router.push(`/reports/${rep.id}`);
                            }}
                          >
                            <span className="truncate flex-1 text-start">
                              {rep.title || (lang === 'ar' ? 'تقرير' : 'Report')}
                            </span>
                            {unseen.includes(rep.id) && (
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-600" />
                            )}
                          </Button>
                        ))
                      )}
                    </div>
                    <Separator />
                  </>
                )}

                {/* AI Assistant Quick Toggle */}
                <div className="flex items-center justify-between px-2 py-1">
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-4 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-xs font-medium text-foreground">{t('showAiAssistant')}</span>
                  </div>
                  <Button
                    type="button"
                    variant={isAiVisible ? 'default' : 'secondary'}
                    size="sm"
                    className="h-7 text-[11px] px-2.5"
                    onClick={toggleAiVisibility}
                  >
                    {isAiVisible ? (lang === 'ar' ? 'ظاهر' : 'On') : (lang === 'ar' ? 'مخفي' : 'Off')}
                  </Button>
                </div>
              </div>

              {/* Bottom Actions: Logout */}
              <div className="pt-4 border-t border-border">
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full justify-start gap-3 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    signOut();
                  }}
                >
                  <LogOut className="size-4" />
                  <span>{t('logout')}</span>
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
      {/* Full invite inbox — opened from the account menu (desktop) or mobile */}
      {!isGuest && (
        <InviteInboxDialog
          isOpen={showInvites}
          onClose={() => setShowInvites(false)}
          inbox={inbox}
          unseen={unseen}
          onOpenReport={(id) => markSeen(id)}
          onMarkAllSeen={() => markAllSeen()}
          userEmail={user?.email}
        />
      )}
    </header>
  );
}
