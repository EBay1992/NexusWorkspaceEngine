'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { LoginForm } from '@/components/auth/LoginForm';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { useAuthStore } from '@/stores/auth-store';

export default function LoginPage() {
  const router = useRouter();
  const status = useAuthStore((s) => s.status);

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace('/workspaces');
    }
  }, [router, status]);

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
        <ThemeToggle size="icon" />
      </div>
      <div className="max-w-sm space-y-2 text-center">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Orbit</p>
        <h1 className="text-3xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          Authenticate with the gateway to access workspaces, relay tickets, and snapshots.
        </p>
      </div>

      <LoginForm />

      <Link href="/" className="text-xs text-muted-foreground transition-colors hover:text-foreground">
        Back to home
      </Link>
    </main>
  );
}
