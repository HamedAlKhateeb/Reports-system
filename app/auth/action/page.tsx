'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageLoading } from '@/components/ui/loading';

function ActionHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = searchParams.get('mode');
  const oobCode = searchParams.get('oobCode') || '';

  useEffect(() => {
    if (mode === 'resetPassword' && oobCode) {
      router.replace(`/reset-password?oobCode=${encodeURIComponent(oobCode)}`);
    } else {
      router.replace('/login');
    }
  }, [mode, oobCode, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <PageLoading />
    </div>
  );
}

export default function AuthActionPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <PageLoading />
        </div>
      }
    >
      <ActionHandler />
    </Suspense>
  );
}
