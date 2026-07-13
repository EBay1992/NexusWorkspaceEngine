'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { Button } from '@/components/ui/button';
import { joinViaShareLink } from '@/lib/gateway/client';
import { useAuthStore } from '@/stores/auth-store';

interface JoinPageClientProps {
  workspaceId: string;
  role: string;
  token: string;
}

export function JoinPageClient({ workspaceId, role, token }: JoinPageClientProps) {
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const startedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!accessToken || startedRef.current) return;
    startedRef.current = true;

    let cancelled = false;
    void (async () => {
      const result = await joinViaShareLink(workspaceId, role, token, accessToken);
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDone(true);
      router.replace(`/workspace/${encodeURIComponent(result.workspaceId)}`);
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, role, router, token, workspaceId]);

  return (
    <AuthGuard>
      <main className="relative flex min-h-screen flex-col items-center justify-center gap-4 p-8">
        <div className="absolute right-4 top-4">
          <ThemeToggle size="icon" />
        </div>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Orbit join</p>
        <h1 className="text-2xl font-semibold tracking-tight">Joining workspace</h1>
        <p className="max-w-sm text-center text-sm text-muted-foreground">
          Access level in this invite:{' '}
          <span className="font-medium text-foreground">{role}</span>
          <br />
          Workspace <span className="font-mono text-foreground">{workspaceId}</span>
        </p>

        {!error && !done && (
          <p className="text-sm text-muted-foreground">Validating share link…</p>
        )}

        {error && (
          <div className="max-w-sm space-y-3 text-center">
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
            <p className="text-xs text-muted-foreground">
              Owners can invalidate invites by regenerating the share URL.
            </p>
            <Button variant="outline" onClick={() => router.push('/workspaces')}>
              Back to workspaces
            </Button>
          </div>
        )}
      </main>
    </AuthGuard>
  );
}
