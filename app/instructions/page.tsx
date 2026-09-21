'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
export default function InstructionsRedirect() {
  const r = useRouter();
  useEffect(() => { r.replace('/reports'); }, [r]);
  return null;
}
