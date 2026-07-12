'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { AuthNav } from '@/components/auth/AuthNav';
import { Button } from '@/components/ui/button';
import { listWorkspaces, type WorkspaceListItem } from '@/lib/gateway/client';
import { useAuthStore } from '@/stores/auth-store';

export default function WorkspacesPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [workspaces, setWorkspaces] = useState<WorkspaceListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accessToken) return;

    let cancelled = false;
    void (async () => {
      const items = await listWorkspaces(accessToken);
      if (!cancelled) {
        setWorkspaces(items);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  return (
    <AuthGuard>
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 p-8">
        <header className="flex items-center gap-4 border-b border-border pb-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Orbit</p>
            <h1 className="text-2xl font-semibold tracking-tight">Your workspaces</h1>
          </div>
          <AuthNav />
        </header>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading workspaces…</p>
        ) : workspaces.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">No workspaces are assigned to this account.</p>
          </div>
        ) : (
          <ul className="grid gap-3">
            {workspaces.map((workspace) => (
              <li key={workspace.id}>
                <Link
                  href={`/workspace/${workspace.id}`}
                  className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:bg-muted/40"
                >
                  <div>
                    <p className="font-medium">{workspace.title}</p>
                    <p className="font-mono text-xs text-muted-foreground">{workspace.id}</p>
                  </div>
                  <span className="rounded-full bg-secondary px-2.5 py-1 text-xs capitalize text-secondary-foreground">
                    {workspace.role}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {workspaces.some((workspace) => workspace.id === 'demo') ? (
          <Link href="/workspace/demo">
            <Button variant="outline">Open demo workspace</Button>
          </Link>
        ) : null}
      </main>
    </AuthGuard>
  );
}
