'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Lock, AlertCircle, CheckCircle2, ArrowRight } from 'lucide-react';
import { confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
import { auth, isFirebaseConfigured } from '@/lib/firebase';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { AppLogo } from '@/components/layout/AppLogo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FieldGroup, Field, FieldLabel } from '@/components/ui/field';
import { PageLoading } from '@/components/ui/loading';
import { PasswordStrength } from '@/components/auth/PasswordStrength';
import { firstPasswordFailure } from '@/lib/password-policy';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const oobCode = searchParams.get('oobCode') || '';
  const emailParam = searchParams.get('email') || '';

  const { lang, t } = useLanguage();
  const isAr = lang === 'ar';

  const [targetEmail, setTargetEmail] = useState(emailParam);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [validatingCode, setValidatingCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // If Firebase code is present, verify it on load
  useEffect(() => {
    if (oobCode && isFirebaseConfigured && auth) {
      setValidatingCode(true);
      verifyPasswordResetCode(auth, oobCode)
        .then((verifiedEmail) => {
          setTargetEmail(verifiedEmail);
        })
        .catch((err) => {
          console.warn('Invalid or expired reset code:', err);
          setError(
            isAr
              ? 'رابط استعادة كلمة المرور غير صالح أو منتهي الصلاحية. يرجى طلب رابط جديد من صفحة تسجيل الدخول.'
              : 'Password reset link is invalid or expired. Please request a new link from the sign in page.'
          );
        })
        .finally(() => {
          setValidatingCode(false);
        });
    }
  }, [oobCode, isAr]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // 1. Frontend validation
    const failure = firstPasswordFailure(newPassword, isAr ? 'ar' : 'en');
    if (failure) {
      setError(failure);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(t('passwordsDoNotMatch'));
      return;
    }

    // 2. Backend validation via dedicated API endpoint
    try {
      const valRes = await fetch('/api/auth/validate-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword, lang: isAr ? 'ar' : 'en' }),
      });
      const valData = await valRes.json();
      if (!valRes.ok || !valData.valid) {
        setError(valData.error || (isAr ? 'كلمة المرور لا تلبي معايير الأمان.' : 'Password does not meet security requirements.'));
        return;
      }
    } catch (valErr) {
      console.warn('Backend password validation network notice:', valErr);
    }

    try {
      setLoading(true);

      if (oobCode && isFirebaseConfigured && auth) {
        // Firebase Auth password reset execution
        await confirmPasswordReset(auth, oobCode, newPassword);
      }

      // Also update local registered users registry for offline/hybrid consistency
      if (typeof window !== 'undefined' && targetEmail) {
        try {
          const raw = localStorage.getItem('review_app_registered_users');
          if (raw) {
            const users = JSON.parse(raw);
            const key = targetEmail.toLowerCase();
            if (users[key]) {
              users[key].pass = newPassword;
              localStorage.setItem('review_app_registered_users', JSON.stringify(users));
            }
          }
        } catch {}
      }

      setSuccess(true);
    } catch (err: any) {
      console.error('Password reset failed:', err);
      if (err.code === 'auth/expired-action-code') {
        setError(
          isAr
            ? 'انتهت صلاحية رابط الاستعادة. يرجى طلب رابط جديد.'
            : 'Reset link has expired. Please request a new one.'
        );
      } else if (err.code === 'auth/invalid-action-code') {
        setError(
          isAr
            ? 'رابط الاستعادة غير صالح أو تم استخدامه مسبقًا.'
            : 'Reset link is invalid or has already been used.'
        );
      } else if (err.code === 'auth/weak-password') {
        setError(isAr ? 'كلمة المرور ضعيفة جداً.' : 'Password is too weak.');
      } else {
        setError(err.message || (isAr ? 'تعذر تعيين كلمة المرور الجديدة.' : 'Failed to reset password.'));
      }
    } finally {
      setLoading(false);
    }
  };

  if (validatingCode) {
    return (
      <div className="flex min-h-[300px] flex-col items-center justify-center gap-3">
        <PageLoading />
        <p className="text-xs text-muted-foreground">
          {isAr ? 'جاري التحقق من رابط الاستعادة…' : 'Verifying reset link…'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-6 bg-background">
      <div className="w-full max-w-md">
        <Card className="shadow-lg border-border">
          <CardHeader className="text-center pb-4 flex flex-col items-center">
            <AppLogo size="xl" showWordmark={true} className="mb-3" />
            <CardTitle className="text-xl sm:text-2xl font-bold">
              {isAr ? 'تعيين كلمة مرور جديدة' : 'Set New Password'}
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm mt-1">
              {targetEmail
                ? (isAr ? `للحساب: ${targetEmail}` : `For account: ${targetEmail}`)
                : (isAr ? 'أدخل كلمة المرور الجديدة لحسابك' : 'Enter your new account password')}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {success ? (
              <div className="space-y-4 py-2">
                <Alert variant="success">
                  <CheckCircle2 data-icon="inline-start" />
                  <AlertDescription>
                    {isAr
                      ? 'تم تغيير كلمة المرور بنجاح! يمكنك الآن تسجيل الدخول باستخدام كلمة المرور الجديدة.'
                      : 'Password updated successfully! You can now sign in with your new password.'}
                  </AlertDescription>
                </Alert>

                <Button
                  type="button"
                  className="w-full gap-2"
                  onClick={() => router.push('/login')}
                >
                  <span>{isAr ? 'الانتقال إلى تسجيل الدخول' : 'Go to Sign In'}</span>
                  <ArrowRight className="size-4 rtl:rotate-180" />
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle data-icon="inline-start" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="newPassword">
                      {isAr ? 'كلمة المرور الجديدة' : 'New Password'}
                    </FieldLabel>
                    <div className="relative">
                      <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-muted-foreground">
                        <Lock className="size-4" />
                      </div>
                      <Input
                        id="newPassword"
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        className="ps-9 text-xs"
                        dir="ltr"
                      />
                    </div>
                    <div className="pt-2">
                      <PasswordStrength password={newPassword} lang={isAr ? 'ar' : 'en'} />
                      <p className="pt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                        {isAr
                          ? 'المعايير: 8 أحرف على الأقل، حرف كبير وصغير، رقم، ورمز — بدون مسافات.'
                          : 'Criteria: 8+ chars, upper + lower case, digit, symbol — no spaces.'}
                      </p>
                    </div>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="confirmNewPassword">
                      {isAr ? 'تأكيد كلمة المرور الجديدة' : 'Confirm New Password'}
                    </FieldLabel>
                    <div className="relative">
                      <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-muted-foreground">
                        <Lock className="size-4" />
                      </div>
                      <Input
                        id="confirmNewPassword"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        className="ps-9 text-xs"
                        dir="ltr"
                      />
                    </div>
                  </Field>
                </FieldGroup>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full"
                  size="default"
                >
                  {loading
                    ? (isAr ? 'جاري الحفظ…' : 'Saving…')
                    : (isAr ? 'حفظ كلمة المرور الجديدة' : 'Save New Password')}
                </Button>

                <div className="text-center pt-2">
                  <Link
                    href="/login"
                    className="text-xs text-primary font-semibold hover:underline"
                  >
                    {isAr ? '← العودة لتسجيل الدخول' : '← Back to sign in'}
                  </Link>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <PageLoading />
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
