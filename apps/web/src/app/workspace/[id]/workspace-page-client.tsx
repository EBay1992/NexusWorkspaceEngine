'use client';

import { AuthGuard } from '@/components/auth/AuthGuard';
import { AuthNav } from '@/components/auth/AuthNav';
import { WorkspaceShell } from '@/components/workspace/WorkspaceShell';

interface WorkspacePageClientProps {
  workspaceId: string;
}

export function WorkspacePageClient({ workspaceId }: WorkspacePageClientProps) {
  return (
    <AuthGuard>
      <main className="flex min-h-screen flex-col">
        <header className="flex h-14 items-center border-b border-border px-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Orbit Workspace</p>
            <h1 className="text-sm font-medium font-mono">{workspaceId}</h1>
          </div>
          <AuthNav />
        </header>
        <WorkspaceShell workspaceId={workspaceId} />
      </main>
    </AuthGuard>
  );
}
