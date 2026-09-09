'use client';

import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, Mail, AlertCircle, Globe, Sparkles, User as UserIcon, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { isFirebaseConfigured } from '@/lib/firebase';
import { AppLogo } from '@/components/layout/AppLogo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FieldGroup, Field, FieldLabel } from '@/components/ui/field';
import { Separator } from '@/components/ui/separator';

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
        setSuccessMessage(
          lang === 'ar'
            ? 'تم إنشاء الحساب بنجاح! أرسلنا رابط التفعيل لبريدك (تحقق من صندوق الوارد ومجلد Junk / Spam).'
            : 'Account created successfully! Verification link sent to your email (check your Inbox & Junk / Spam folder).'
        );
        setTimeout(() => {
          router.push(redirectPath);
        }, 1000);
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
        const host = typeof window !== 'undefined' ? window.location.hostname : '';
        setLocalError(
          lang === 'ar'
            ? `النطاق الحالي (${host}) غير مُعتمد في Firebase Auth. الحل للمشرف (دقيقة واحدة): Firebase Console ← Authentication ← Settings ← Authorized domains ← أضف النطاق: ${host}. بديل مؤقت: أنشئ حساباً بالبريد الإلكتروني أو ادخل كضيف.`
            : `Current domain (${host}) is not authorized in Firebase Auth. Admin fix (1 minute): Firebase Console → Authentication → Settings → Authorized domains → add: ${host}. Temporary workaround: create an email account or use Guest mode.`
        );
      } else if (err.code === 'auth/timeout') {
        setLocalError(
          lang === 'ar'
            ? 'انتهت مهلة تسجيل الدخول بحساب Google. قد يكون النطاق غير مُعتمد أو تم حظر النافذة المنبثقة. جرّب الدخول بالبريد الإلكتروني أو كضيف.'
            : 'Google sign-in timed out. The domain may not be authorized or the popup was blocked. Try email login or Guest mode.'
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
    <div className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-6 lg:p-8 bg-background">
      {/* Top language switch */}
      <div className="absolute top-4 end-4 z-10">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={toggleLanguage}
          className="gap-2 text-xs"
        >
          <Globe data-icon="inline-start" />
          <span>{lang === 'ar' ? 'English' : 'عربي'}</span>
        </Button>
      </div>

      <div className="w-full max-w-md">
        <Card className="shadow-lg border-border">
          <CardHeader className="text-center pb-4 flex flex-col items-center">
            <AppLogo size="xl" showWordmark={true} showSubtitle={true} className="mb-3" />
            <CardTitle className="text-xl sm:text-2xl font-bold">
              {mode === 'signup' ? t('signUpTitle') : t('loginTitle')}
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm mt-1">
              {mode === 'signup' ? t('signUpSubtitle') : t('loginSubtitle')}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Mode Switcher Tabs (Sign In vs Sign Up) */}
            <Tabs
              value={mode}
              onValueChange={(val) => {
                setMode(val as 'signin' | 'signup');
                setLocalError(null);
                setSuccessMessage(null);
              }}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">{t('login')}</TabsTrigger>
                <TabsTrigger value="signup">{t('signUp')}</TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Success Banner */}
            {successMessage && (
              <Alert variant="success">
                <CheckCircle2 data-icon="inline-start" />
                <AlertDescription>{successMessage}</AlertDescription>
              </Alert>
            )}

            {/* Error Banner */}
            {currentError && (
              <Alert variant="destructive">
                <AlertCircle data-icon="inline-start" />
                <AlertDescription>{currentError}</AlertDescription>
              </Alert>
            )}

            {/* Form */}
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <FieldGroup>
                {mode === 'signup' && (
                  <Field>
                    <FieldLabel htmlFor="displayName">{t('displayName')}</FieldLabel>
                    <div className="relative">
                      <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-muted-foreground">
                        <UserIcon className="size-4" />
                      </div>
                      <Input
                        id="displayName"
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder={t('displayNamePlaceholder')}
                        className="ps-9 text-xs"
                      />
                    </div>
                  </Field>
                )}

                <Field>
                  <FieldLabel htmlFor="email">{t('email')}</FieldLabel>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-muted-foreground">
                      <Mail className="size-4" />
                    </div>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t('emailPlaceholder')}
                      required
                      className="ps-9 text-xs"
                    />
                  </div>
                </Field>

                <Field>
                  <FieldLabel htmlFor="password">{t('password')}</FieldLabel>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-muted-foreground">
                      <Lock className="size-4" />
                    </div>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={t('passwordPlaceholder')}
                      required
                      className="ps-9 text-xs"
                    />
                  </div>
                </Field>

                {mode === 'signup' && (
                  <Field>
                    <FieldLabel htmlFor="confirmPassword">{t('confirmPassword')}</FieldLabel>
                    <div className="relative">
                      <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-muted-foreground">
                        <Lock className="size-4" />
                      </div>
                      <Input
                        id="confirmPassword"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder={t('passwordPlaceholder')}
                        required
                        className="ps-9 text-xs"
                      />
                    </div>
                  </Field>
                )}
              </FieldGroup>

              <Button
                type="submit"
                disabled={submitting}
                className="w-full"
                size="default"
              >
                {submitting
                  ? t('loading')
                  : mode === 'signup'
                  ? t('createAccountBtn')
                  : t('signInWithEmail')}
              </Button>
            </form>

            {/* Divider */}
            <div className="relative my-4 flex items-center justify-center">
              <Separator className="w-full" />
              <span className="absolute bg-card px-2 text-[11px] font-medium text-muted-foreground uppercase">
                {lang === 'ar' ? 'أو' : 'OR'}
              </span>
            </div>

            {/* Social Logins */}
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleGoogleLogin}
                disabled={submitting}
                className="w-full"
              >
                <svg className="size-4" viewBox="0 0 24 24" data-icon="inline-start">
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
              </Button>

              <Button
                type="button"
                variant="secondary"
                onClick={handleGuestLogin}
                disabled={submitting}
                className="w-full"
              >
                <Sparkles data-icon="inline-start" />
                <span>{t('continueAsGuest')}</span>
              </Button>
            </div>

            {!isFirebaseConfigured && (
              <Alert variant="default" className="mt-4 bg-muted/50">
                <AlertDescription className="text-xs space-y-1">
                  <p className="font-semibold text-foreground">{t('demoModeNotice')}</p>
                  <p className="text-muted-foreground">
                    {lang === 'ar'
                      ? 'يمكنك إنشاء حساب جديد فوري أو استخدام: reviewer@example.com (أي كلمة مرور).'
                      : 'You can create a new account now or use: reviewer@example.com (any password).'}
                  </p>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="size-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      }
    >
      <LoginFormContent />
    </Suspense>
  );
}

