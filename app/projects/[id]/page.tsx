'use client';

import React, { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { ProjectWorkspace } from '@/components/projects/ProjectWorkspace';
import { PageLoading } from '@/components/ui/loading';

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) router.push('/login');
  }, [user, loading, router]);

  if (loading) return <PageLoading />;
  if (!user) return null;
  return <ProjectWorkspace projectId={projectId} />;
}
