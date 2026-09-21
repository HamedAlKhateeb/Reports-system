'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileText, Settings, Globe, LogOut, Menu, FolderGit2, ChevronDown, Check, KanbanSquare } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useAuth } from '@/lib/auth-context';
import { useProject } from '@/lib/project-context';
import { Button } from '@/components/ui/button';
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
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { AppLogo } from './AppLogo';

export function Navbar() {
  const pathname = usePathname();
  const { lang, setLang, t } = useLanguage();
  const { user, isGuest, signOut } = useAuth();
  const { activeProject, projects, setActiveProject } = useProject();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  if (pathname === '/login' || !user || pathname.startsWith('/share/')) {
    return null;
  }

  const toggleLanguage = () => setLang(lang === 'ar' ? 'en' : 'ar');

  const navItems = [
    { href: '/projects', label: lang === 'ar' ? 'المشاريع' : 'Projects', icon: FolderGit2, active: pathname.startsWith('/projects') },
    { href: '/reports', label: t('reports'), icon: FileText, active: pathname.startsWith('/reports') },
    { href: '/tracking', label: lang === 'ar' ? 'لوحات التتبع' : 'Tracking', icon: KanbanSquare, active: pathname.startsWith('/tracking') },
    { href: '/settings', label: t('settings'), icon: Settings, active: pathname.startsWith('/settings') },
  ];

  const userInitial = user.displayName
    ? user.displayName.charAt(0).toUpperCase()
    : user.email
      ? user.email.charAt(0).toUpperCase()
      : 'U';

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/80 bg-background/80 backdrop-blur-md no-print transition-colors">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-3 sm:px-6 lg:px-8 gap-2 sm:gap-4">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <Link href="/reports" className="flex items-center hover:opacity-90 transition-opacity shrink-0">
            <AppLogo size="md" showWordmark={true} />
          </Link>
          {activeProject && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 max-w-[130px] sm:max-w-[180px] gap-1.5 px-2 text-xs font-semibold shrink-0 bg-background/60 hover:bg-accent" title={lang === 'ar' ? 'تبديل المشروع' : 'Switch project'}>
                  <FolderGit2 className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="truncate">{activeProject.name}</span>
                  <ChevronDown className="h-3 w-3 opacity-60 shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel className="text-xs font-bold text-muted-foreground">
                  {lang === 'ar' ? 'المشاريع المتاحة' : 'Available Projects'}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  {projects.map((p) => {
                    const isCur = p.id === activeProject.id;
                    return (
                      <DropdownMenuItem key={p.id} onClick={() => setActiveProject(p)} className="flex items-center justify-between cursor-pointer text-xs py-1.5">
                        <span className={cn('truncate', isCur && 'font-bold text-primary')}>{p.name}</span>
                        {isCur && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild className="cursor-pointer text-xs font-medium text-primary">
                  <Link href="/projects" className="flex items-center gap-1.5">
                    <FolderGit2 className="h-3.5 w-3.5" />
                    <span>{lang === 'ar' ? 'إدارة المشاريع' : 'Manage Projects'}</span>
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Separator orientation="vertical" className="hidden md:block h-5 shrink-0" />
          <nav className="hidden md:flex items-center gap-1 shrink-0">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Button key={item.href} asChild variant={item.active ? 'secondary' : 'ghost'} size="sm" className={cn('font-medium text-xs h-8 px-2.5 sm:px-3 gap-1.5 shrink-0 transition-colors', item.active && 'font-semibold text-foreground bg-secondary shadow-xs')}>
                  <Link href={item.href} title={item.label}>
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                </Button>
              );
            })}
          </nav>
        </div>
        <div className="hidden md:flex items-center gap-1.5 shrink-0">
          <Button type="button" variant="outline" size="sm" onClick={toggleLanguage} className="h-8 px-2.5 text-xs font-semibold gap-1.5 shrink-0 bg-background/60 hover:bg-accent" title={lang === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}>
            <Globe className="size-3.5 text-primary" />
            <span>{lang === 'ar' ? 'EN' : 'عربي'}</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2 px-2 h-8 hover:bg-accent shrink-0">
                <Avatar className="size-7">
                  <AvatarFallback className="text-[11px] bg-primary text-primary-foreground font-bold">{userInitial}</AvatarFallback>
                </Avatar>
                <span className="text-xs font-medium text-foreground max-w-[120px] truncate hidden xl:inline">{user.displayName || user.email}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-foreground truncate">{user.displayName || (lang === 'ar' ? 'المستخدم' : 'User')}</span>
                  <span className="text-[11px] text-muted-foreground truncate font-normal">{user.email}</span>
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/settings" className="flex items-center gap-2 cursor-pointer">
                  <Settings className="size-4 text-muted-foreground" />
                  <span>{t('settings')}</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => signOut()} className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer">
                <LogOut data-icon="inline-start" />
                <span>{t('logout')}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex md:hidden items-center gap-2 shrink-0">
          <Button type="button" variant="outline" size="sm" onClick={toggleLanguage} className="h-8 px-2.5 text-xs font-semibold" title={lang === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}>
            <Globe className="size-3.5 text-primary" />
            <span>{lang === 'ar' ? 'EN' : 'عربي'}</span>
          </Button>
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="sm" className="size-9 p-0" aria-label={lang === 'ar' ? 'فتح القائمة' : 'Open Menu'}>
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side={lang === 'ar' ? 'right' : 'left'} className="w-72 sm:w-80 flex flex-col justify-between p-6">
              <div className="space-y-6">
                <SheetHeader className="text-start">
                  <SheetTitle className="flex items-center gap-3">
                    <Avatar className="size-9">
                      <AvatarFallback className="text-xs bg-primary text-primary-foreground font-bold">{userInitial}</AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col text-start min-w-0">
                      <span className="text-xs font-bold text-foreground truncate">{user.displayName || (lang === 'ar' ? 'المستخدم' : 'User')}</span>
                      <span className="text-[11px] text-muted-foreground truncate font-normal">{user.email}</span>
                    </div>
                  </SheetTitle>
                </SheetHeader>
                <Separator />
                <nav className="flex flex-col gap-1.5">
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Button key={item.href} asChild variant={item.active ? 'secondary' : 'ghost'} className={cn('justify-start gap-3 h-10 text-xs font-medium', item.active && 'font-semibold text-foreground bg-secondary')} onClick={() => setMobileMenuOpen(false)}>
                        <Link href={item.href}>
                          <Icon className="size-4" />
                          <span>{item.label}</span>
                        </Link>
                      </Button>
                    );
                  })}
                </nav>
              </div>
              <div className="pt-4 border-t border-border">
                <Button type="button" variant="ghost" className="w-full justify-start gap-3 text-xs text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => { setMobileMenuOpen(false); signOut(); }}>
                  <LogOut className="size-4" />
                  <span>{t('logout')}</span>
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
