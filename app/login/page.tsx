'use client';

import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FileText, Lock, Mail, AlertCircle, Globe, Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { isFirebaseConfigured } from '@/lib/firebase';

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get('redirect') || '/reports';

  const { signInWithEmail, signInWithGoogle, signInAsGuest, error: authContextError, clearError } = useAuth();
  const { lang, setLang, t } = useLanguage();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const toggleLanguage = () => {
    setLang(lang === 'ar' ? 'en' : 'ar');
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    if (!email || !password) {
      setLocalError(lang === 'ar' ? 'يرجى إدخال البريد الإلكتروني وكلمة المرور' : 'Please enter email and password');
      return;
    }

    try {
      setSubmitting(true);
      await signInWithEmail(email, password);
      router.push(redirectPath);
    } catch (err: any) {
      if (err.message === 'unauthorizedUserError') {
        setLocalError(t('unauthorizedUserError'));
      } else {
        setLocalError(t('invalidCredentialsError'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLocalError(null);
    clearError();
    try {
      setSubmitting(true);
      await signInWithGoogle();
      router.push(redirectPath);
    } catch (err: any) {
      if (err.message === 'unauthorizedUserError') {
        setLocalError(t('unauthorizedUserError'));
      } else {
        setLocalError(t('invalidCredentialsError'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleGuestLogin = async () => {
    setLocalError(null);
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
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-100 p-4 sm:p-6 lg:p-8">
      {/* Top language switch */}
      <div className="absolute top-4 end-4">
        <button
          type="button"
          onClick={toggleLanguage}
          className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
        >
          <Globe className="h-4 w-4 text-teal-600" />
          <span>{lang === 'ar' ? 'English' : 'عربي'}</span>
        </button>
      </div>

      <div className="w-full max-w-md">
        {/* Card Header */}
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-xl">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-600 text-white shadow-md">
              <FileText className="h-8 w-8" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('loginTitle')}</h1>
            <p className="mt-2 text-sm text-slate-500">{t('loginSubtitle')}</p>
          </div>

          {/* Error Banner */}
          {currentError && (
            <div className="mb-6 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-600 mt-0.5" />
              <div>{currentError}</div>
            </div>
          )}

          {/* Email/Password Form */}
          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-700 mb-1.5">
                {t('email')}
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-slate-400">
                  <Mail className="h-4 w-4" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('emailPlaceholder')}
                  required
                  className="block w-full rounded-lg border border-slate-300 bg-slate-50 ps-10 pe-3 py-2.5 text-sm text-slate-900 transition-colors focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-700 mb-1.5">
                {t('password')}
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-slate-400">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('passwordPlaceholder')}
                  required
                  className="block w-full rounded-lg border border-slate-300 bg-slate-50 ps-10 pe-3 py-2.5 text-sm text-slate-900 transition-colors focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center rounded-lg bg-teal-600 py-2.5 text-sm font-semibold text-white shadow hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:opacity-50 transition-colors"
            >
              {submitting ? t('loading') : t('signInWithEmail')}
            </button>
          </form>

          {/* Divider */}
          <div className="my-6 flex items-center">
            <div className="flex-grow border-t border-slate-200"></div>
            <span className="mx-3 flex-shrink text-xs font-medium text-slate-400">
              {lang === 'ar' ? 'أو' : 'OR'}
            </span>
            <div className="flex-grow border-t border-slate-200"></div>
          </div>

          {/* Google Sign-in */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={submitting}
            className="flex w-full items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:opacity-50 transition-colors"
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
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-teal-300 bg-teal-50/70 py-2.5 text-sm font-semibold text-teal-900 shadow-sm hover:bg-teal-100 hover:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-400 disabled:opacity-50 transition-colors"
          >
            <Sparkles className="h-4 w-4 text-teal-600" />
            <span>{t('continueAsGuest')}</span>
          </button>

          {!isFirebaseConfigured && (
            <div className="mt-6 rounded-lg bg-teal-50 border border-teal-200 p-3 text-xs text-teal-800">
              <p className="font-semibold mb-1">{t('demoModeNotice')}</p>
              <p className="text-teal-700">
                {lang === 'ar'
                  ? 'يمكنك تسجيل الدخول بالبريد: reviewer@example.com (أي كلمة مرور).'
                  : 'You can sign in with: reviewer@example.com (any password).'}
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
