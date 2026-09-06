'use client';

import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FileText, Lock, Mail, AlertCircle, Globe, Sparkles, User as UserIcon, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { isFirebaseConfigured } from '@/lib/firebase';

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get('redirect') || '/reports';

  const { signInWithEmail, signUpWithEmail, signInWithGoogle, signInAsGuest, error: authContextError, clearError } = useAuth();
  const { lang, setLang, t } = useLanguage();

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const toggleLanguage = () => {
    setLang(lang === 'ar' ? 'en' : 'ar');
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setSuccessMessage(null);
    clearError();

    if (!email || !password) {
      setLocalError(lang === 'ar' ? 'يرجى إدخال البريد الإلكتروني وكلمة المرور' : 'Please enter email and password');
      return;
    }

    if (mode === 'signup') {
      if (password.length < 6) {
        setLocalError(t('passwordTooShort'));
        return;
      }
      if (password !== confirmPassword) {
        setLocalError(t('passwordsDoNotMatch'));
        return;
      }
    }

    try {
      setSubmitting(true);
      if (mode === 'signup') {
        await signUpWithEmail(email, password, displayName);
        setSuccessMessage(t('signUpSuccess'));
        setTimeout(() => {
          router.push(redirectPath);
        }, 600);
      } else {
        await signInWithEmail(email, password);
        router.push(redirectPath);
      }
    } catch (err: any) {
      console.error('Auth error:', err);
      if (err.code === 'auth/email-already-in-use') {
        setLocalError(lang === 'ar' ? 'هذا البريد الإلكتروني مسجل بالفعل. يرجى تسجيل الدخول.' : 'This email is already registered. Please sign in.');
      } else if (err.code === 'auth/weak-password') {
        setLocalError(t('passwordTooShort'));
      } else if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setLocalError(t('invalidCredentialsError'));
      } else if (err.message === 'unauthorizedUserError') {
        setLocalError(t('unauthorizedUserError'));
      } else {
        setLocalError(err.message || t('invalidCredentialsError'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLocalError(null);
    setSuccessMessage(null);
    clearError();
    try {
      setSubmitting(true);
      await signInWithGoogle();
      router.push(redirectPath);
    } catch (err: any) {
      console.error('Google login error:', err);
      if (err.code === 'auth/popup-blocked') {
        setLocalError(
          lang === 'ar'
            ? 'تم حظر النافذة المنبثقة من قِبل المتصفح. يرجى السماح بالنوافذ المنبثقة أو استخدام الدخول بالبريد الإلكتروني.'
            : 'Popup blocked by your browser. Please allow popups or use email login.'
        );
      } else if (err.code === 'auth/popup-closed-by-user') {
        setLocalError(
          lang === 'ar'
            ? 'تم إغلاق نافذة تسجيل الدخول قبل إتمام العملية.'
            : 'The sign-in popup was closed before completion.'
        );
      } else if (err.code === 'auth/unauthorized-domain') {
        setLocalError(
          lang === 'ar'
            ? 'النطاق الحالي قيد الإعداد في Firebase Auth. يمكنك إنشاء حساب بالبريد الإلكتروني الآن أو الدخول كضيف لمتابعة العمل فوراً وبشكل معزول.'
            : 'Domain pending in Firebase. You can create an email account or use Guest mode immediately.'
        );
      } else {
        setLocalError(
          lang === 'ar'
            ? `تعذر الاتصال بمزود Google. يمكنك إنشاء حساب فوري بالبريد أو استخدام "الدخول كضيف".`
            : `Google sign-in unavailable. You can sign up with email or continue as Guest.`
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleGuestLogin = async () => {
    setLocalError(null);
    setSuccessMessage(null);
    clearError();
    try {
      setSubmitting(true);
      await signInAsGuest();
      router.push(redirectPath);
    } catch (err: any) {
      setLocalError('Guest login failed');
    } finally {
      setSubmitting(false);
    }
  };

  const currentError = localError || (authContextError ? t(authContextError as any) : null);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#FAFAF8] dark:bg-[#161615] p-3 sm:p-6 lg:p-8">
      {/* Top language switch */}
      <div className="absolute top-4 end-4 z-10">
        <button
          type="button"
          onClick={toggleLanguage}
          className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground shadow-xs hover:bg-muted transition-colors"
        >
          <Globe className="h-4 w-4 text-olive-600 dark:text-olive-400" />
          <span>{lang === 'ar' ? 'English' : 'عربي'}</span>
        </button>
      </div>

      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-xl">
          {/* Card Header */}
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#2E4034] text-white shadow-md">
              <FileText className="h-7 w-7" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              {mode === 'signup' ? t('signUpTitle') : t('loginTitle')}
            </h1>
            <p className="mt-1.5 text-xs sm:text-sm text-muted-foreground">
              {mode === 'signup' ? t('signUpSubtitle') : t('loginSubtitle')}
            </p>
          </div>

          {/* Mode Switcher Tabs (Sign In vs Sign Up) */}
          <div className="mb-6 flex rounded-xl border border-border bg-muted/40 p-1">
            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setLocalError(null);
                setSuccessMessage(null);
              }}
              className={`flex-1 rounded-lg py-2 text-xs sm:text-sm font-semibold transition-all ${
                mode === 'signin'
                  ? 'bg-card text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t('login')}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setLocalError(null);
                setSuccessMessage(null);
              }}
              className={`flex-1 rounded-lg py-2 text-xs sm:text-sm font-semibold transition-all ${
                mode === 'signup'
                  ? 'bg-card text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t('signUp')}
            </button>
          </div>

          {/* Success Banner */}
          {successMessage && (
            <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 p-3.5 text-xs sm:text-sm text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-600 mt-0.5" />
              <div>{successMessage}</div>
            </div>
          )}

          {/* Error Banner */}
          {currentError && (
            <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 p-3.5 text-xs sm:text-sm text-red-800 dark:text-red-300">
              <AlertCircle className="h-4 w-4 flex-shrink-0 text-red-600 mt-0.5" />
              <div>{currentError}</div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleEmailSubmit} className="space-y-3.5">
            {mode === 'signup' && (
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  {t('displayName')}
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-muted-foreground">
                    <UserIcon className="h-4 w-4" />
                  </div>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder={t('displayNamePlaceholder')}
                    className="block w-full rounded-xl border border-border bg-background ps-10 pe-3 py-2.5 text-base sm:text-sm text-foreground placeholder:text-muted-foreground focus:border-olive-600 focus:outline-none focus:ring-1 focus:ring-olive-600 transition-colors"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                {t('email')}
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-muted-foreground">
                  <Mail className="h-4 w-4" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('emailPlaceholder')}
                  required
                  className="block w-full rounded-xl border border-border bg-background ps-10 pe-3 py-2.5 text-base sm:text-sm text-foreground placeholder:text-muted-foreground focus:border-olive-600 focus:outline-none focus:ring-1 focus:ring-olive-600 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                {t('password')}
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-muted-foreground">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('passwordPlaceholder')}
                  required
                  className="block w-full rounded-xl border border-border bg-background ps-10 pe-3 py-2.5 text-base sm:text-sm text-foreground placeholder:text-muted-foreground focus:border-olive-600 focus:outline-none focus:ring-1 focus:ring-olive-600 transition-colors"
                />
              </div>
            </div>

            {mode === 'signup' && (
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  {t('confirmPassword')}
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-muted-foreground">
                    <Lock className="h-4 w-4" />
                  </div>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={t('passwordPlaceholder')}
                    required
                    className="block w-full rounded-xl border border-border bg-background ps-10 pe-3 py-2.5 text-base sm:text-sm text-foreground placeholder:text-muted-foreground focus:border-olive-600 focus:outline-none focus:ring-1 focus:ring-olive-600 transition-colors"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center rounded-xl bg-[#2E4034] py-2.5 text-sm font-semibold text-white shadow hover:bg-[#24382F] focus:outline-none focus:ring-2 focus:ring-olive-600 focus:ring-offset-2 disabled:opacity-50 transition-colors"
            >
              {submitting
                ? t('loading')
                : mode === 'signup'
                ? t('createAccountBtn')
                : t('signInWithEmail')}
            </button>
          </form>

          {/* Divider */}
          <div className="my-5 flex items-center">
            <div className="flex-grow border-t border-border"></div>
            <span className="mx-3 flex-shrink text-xs font-medium text-muted-foreground">
              {lang === 'ar' ? 'أو' : 'OR'}
            </span>
            <div className="flex-grow border-t border-border"></div>
          </div>

          {/* Google Sign-in */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={submitting}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-border bg-card py-2.5 text-sm font-semibold text-foreground shadow-xs hover:bg-muted focus:outline-none focus:ring-2 focus:ring-border disabled:opacity-50 transition-colors"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.03 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
              />
            </svg>
            <span>{t('signInWithGoogle')}</span>
          </button>

          {/* Guest Sign-in */}
          <button
            type="button"
            onClick={handleGuestLogin}
            disabled={submitting}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-olive-300 dark:border-olive-800/60 bg-olive-50/70 dark:bg-olive-950/30 py-2.5 text-sm font-semibold text-olive-900 dark:text-olive-200 shadow-xs hover:bg-olive-100 dark:hover:bg-olive-900/40 focus:outline-none focus:ring-2 focus:ring-olive-500 disabled:opacity-50 transition-colors"
          >
            <Sparkles className="h-4 w-4 text-olive-600 dark:text-olive-400" />
            <span>{t('continueAsGuest')}</span>
          </button>

          {!isFirebaseConfigured && (
            <div className="mt-5 rounded-xl bg-olive-50 dark:bg-olive-950/40 border border-olive-200 dark:border-olive-800 p-3 text-xs text-olive-800 dark:text-olive-300">
              <p className="font-semibold mb-1">{t('demoModeNotice')}</p>
              <p className="text-olive-700 dark:text-olive-400">
                {lang === 'ar'
                  ? 'يمكنك إنشاء حساب جديد فوري أو استخدام: reviewer@example.com (أي كلمة مرور).'
                  : 'You can create a new account now or use: reviewer@example.com (any password).'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#FAFAF8] dark:bg-[#161615]">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#2E4034] border-t-transparent" />
        </div>
      }
    >
      <LoginFormContent />
    </Suspense>
  );
}
