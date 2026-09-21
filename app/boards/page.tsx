'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
export default function BoardsRedirect() {
  const r = useRouter();
  useEffect(() => { r.replace('/tracking'); }, [r]);
  return null;
}
