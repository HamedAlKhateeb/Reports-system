'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { Mail, RefreshCw, LogOut, CheckCircle2, Clock, ShieldAlert, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isGuest, loading, sendVerificationEmail, reloadUser, signOut } = useAuth();
  const { t, lang } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();

  const [resending, setResending] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const isPublicPage =
    pathname === '/login' ||
    pathname.startsWith('/share/') ||
    pathname.startsWith('/api-guide') ||
    pathname.startsWith('/api/docs') ||
    pathname.startsWith('/api/');

  useEffect(() => {
    if (!loading && !user && !isPublicPage) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
    }
  }, [user, loading, pathname, router, isPublicPage]);

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown((prev) => prev - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  const handleResend = async () => {
    if (cooldown > 0 || resending) return;
    try {
      setResending(true);
      await sendVerificationEmail();
      setResendSuccess(true);
      setCooldown(60);
      setTimeout(() => setResendSuccess(false), 5000);
    } catch (err) {
      console.error('Failed to resend verification email:', err);
    } finally {
      setResending(false);
    }
  };

  const handleReload = async () => {
    try {
      setReloading(true);
      await reloadUser();
    } catch (err) {
      console.error('Failed to reload user:', err);
    } finally {
      setReloading(false);
    }
  };

  if (loading) {
    if (isPublicPage) {
      return <>{children}</>;
    }
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-olive-700 border-t-transparent" />
          <p className="text-sm font-medium text-muted-foreground">{t('loading')}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    if (isPublicPage) {
      return <>{children}</>;
    }
    return null;
  }

  // Email verification required for non-guest users with unverified email
  if (user && !user.emailVerified && !isGuest && !isPublicPage) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 sm:p-6 bg-[#FAFAF8] dark:bg-[#161615]">
        <div
          dir={lang === 'ar' ? 'rtl' : 'ltr'}
          className="w-full max-w-md rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-xl text-card-foreground space-y-6 animate-in fade-in zoom-in-95 duration-200"
        >
          {/* Header Icon */}
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60 shadow-xs">
              <Mail className="h-8 w-8" />
              <div className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-white text-[10px] font-bold">
                !
              </div>
            </div>

            <div className="space-y-1">
              <Badge variant="outline" className="border-amber-300 bg-amber-50/80 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 text-[11px] font-semibold gap-1 py-0.5">
                <Clock className="h-3 w-3" />
                <span>{lang === 'ar' ? 'الحساب غير مفعّل' : 'Account Inactive'}</span>
              </Badge>
              <h1 className="text-xl font-bold tracking-tight text-foreground pt-1">
                {lang === 'ar' ? 'يرجى تأكيد بريدك الإلكتروني' : 'Please Verify Your Email'}
              </h1>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed max-w-sm">
              {lang === 'ar'
                ? 'تم إرسال رابط تأكيد وتفعيل إلى بريدك الإلكتروني:'
                : 'A confirmation and activation link was sent to your email:'}
            </p>

            <div className="w-full rounded-xl border border-border/80 bg-muted/40 p-2.5 font-mono text-xs font-semibold text-foreground break-all select-all text-center">
              {user.email}
            </div>

            {/* Dedicated Notice regarding Junk / Spam Mail */}
            <div className="w-full rounded-xl border border-amber-300/80 bg-amber-50/80 dark:bg-amber-950/40 p-3 text-start space-y-1.5 shadow-2xs">
              <div className="flex items-center gap-2 font-bold text-amber-900 dark:text-amber-200 text-xs">
                <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>
                  {lang === 'ar'
                    ? 'تنبيه: تحقق من مجلد الرسائل غير المرغوب فيها (Junk / Spam)'
                    : 'Notice: Check your Junk / Spam folder'}
                </span>
              </div>
              <p className="text-[11px] text-amber-800/90 dark:text-amber-300/90 leading-relaxed ps-6">
                {lang === 'ar'
                  ? 'إذا لم تجد الرسالة في صندوق الوارد (Inbox)، فغالباً ما تصل إلى مجلد البريد غير الهام (Junk Mail أو Spam). افتح الرسالة واضغط على "ليس بريداً عشوائياً" (Not Junk) ثم انقر على رابط التفعيل.'
                  : 'If you do not see the email in your Inbox, it might have arrived in your Junk or Spam folder. Open it, select "Not Spam / Not Junk", and click the activation link.'}
              </p>
            </div>
          </div>

          {resendSuccess && (
            <div className="rounded-xl border border-emerald-300/80 bg-emerald-50/80 dark:bg-emerald-950/40 p-3 text-xs text-emerald-800 dark:text-emerald-300 flex items-start gap-2 shadow-2xs">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-bold">
                  {lang === 'ar'
                    ? 'تم إرسال رابط تأكيد جديد بنجاح!'
                    : 'A new verification link has been sent!'}
                </p>
                <p className="text-[11px] text-emerald-900/80 dark:text-emerald-200/80">
                  {lang === 'ar'
                    ? 'يرجى فحص صندوق الوارد ومجلد الـ Junk / Spam الآن.'
                    : 'Please check your Inbox and Junk / Spam folder now.'}
                </p>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-2.5 pt-2">
            <Button
              type="button"
              onClick={handleReload}
              disabled={reloading}
              className="w-full h-10 gap-2 bg-[#2E4034] hover:bg-[#24382F] text-white text-xs font-semibold rounded-xl shadow-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${reloading ? 'animate-spin' : ''}`} />
              <span>
                {reloading
                  ? (lang === 'ar' ? 'جارٍ التحقق من التفعيل...' : 'Checking verification...')
                  : (lang === 'ar' ? 'تحققت بالفعل / تحديث الحالة' : "I've Verified / Refresh Status")}
              </span>
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={handleResend}
              disabled={resending || cooldown > 0}
              className="w-full h-9 gap-1.5 text-xs font-semibold rounded-xl"
            >
              <Mail className="h-3.5 w-3.5 text-muted-foreground" />
              <span>
                {cooldown > 0
                  ? (lang === 'ar' ? `إعادة الإرسال بعد (${cooldown} ثانية)` : `Resend in (${cooldown}s)`)
                  : (lang === 'ar' ? 'إعادة إرسال رسالة التأكيد' : 'Resend Confirmation Email')}
              </span>
            </Button>

            <Button
              type="button"
              variant="ghost"
              onClick={() => signOut()}
              className="w-full h-9 gap-1.5 text-xs text-muted-foreground hover:text-red-600 rounded-xl"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>{lang === 'ar' ? 'تسجيل الخروج أو استخدام حساب آخر' : 'Sign out or use another account'}</span>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
