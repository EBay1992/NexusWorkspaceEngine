'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { type AuthStatus, useAuthStore } from '@/stores/auth-store';

interface AuthGuardProps {
  children: React.ReactNode;
  redirectTo?: string;
}

export function AuthGuard({ children, redirectTo = '/login' }: AuthGuardProps) {
  const router = useRouter();
  const status = useAuthStore((s) => s.status);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace(redirectTo);
    }
  }, [redirectTo, router, status]);

  if (status === 'unknown') {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        Checking session…
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return null;
  }

  return children;
}

export function useAuthReady(): AuthStatus {
  return useAuthStore((s) => s.status);
}
