'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { TrackingWorkspace } from '@/components/tracking/TrackingWorkspace';
import { PageLoading } from '@/components/ui/loading';

export default function TrackingPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) router.push('/login');
  }, [user, loading, router]);

  if (loading) return <PageLoading />;
  if (!user) return null;
  return <TrackingWorkspace />;
}
