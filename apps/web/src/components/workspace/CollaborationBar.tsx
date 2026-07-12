'use client';

import { useCallback, useState } from 'react';
import type { WebsocketProvider } from 'y-websocket';
import { Button } from '@/components/ui/button';
import { useCollaborationPresence } from '@/hooks/use-collaboration-presence';
import { cn } from '@/lib/utils';

const TEST_ACCOUNTS = [
  { email: 'demo@orbit.local', password: 'demo', role: 'owner' },
  { email: 'editor@orbit.local', password: 'demo', role: 'editor' },
  { email: 'viewer@orbit.local', password: 'demo', role: 'viewer' },
] as const;

interface CollaborationBarProps {
  workspaceId: string;
  workspaceTitle?: string;
  role: 'owner' | 'editor' | 'viewer';
  syncProvider: WebsocketProvider | null;
  localEmail: string | null;
  readOnly: boolean;
}

const ROLE_LABEL: Record<CollaborationBarProps['role'], string> = {
  owner: 'Owner',
  editor: 'Editor',
  viewer: 'Viewer (read-only)',
};

export function CollaborationBar({
  workspaceId,
  workspaceTitle,
  role,
  syncProvider,
  localEmail,
  readOnly,
}: CollaborationBarProps) {
  const peers = useCollaborationPresence(syncProvider, localEmail);
  const [copied, setCopied] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const shareUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/workspace/${encodeURIComponent(workspaceId)}`
      : `/workspace/${workspaceId}`;

  const copyShareLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2_000);
    } catch {
      setCopied(false);
    }
  }, [shareUrl]);

  const remotePeers = peers.filter((peer) => !peer.isSelf);

  return (
    <div className="border-b border-border px-4 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <p className="font-medium truncate">{workspaceTitle ?? workspaceId}</p>
          <p className="text-muted-foreground">
            Same URL = same document. Invite teammates to sign in, then open this workspace.
          </p>
        </div>

        <span
          className={cn(
            'rounded-full border px-2 py-0.5 font-medium',
            role === 'viewer' && 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
            role === 'editor' && 'border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300',
            role === 'owner' && 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
          )}
        >
          {ROLE_LABEL[role]}
        </span>

        <Button size="sm" variant="outline" onClick={() => void copyShareLink()}>
          {copied ? 'Copied' : 'Copy invite link'}
        </Button>

        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Online</span>
          <div className="flex -space-x-1">
            {peers.length === 0 ? (
              <span className="text-muted-foreground">just you</span>
            ) : (
              peers.map((peer) => (
                <span
                  key={peer.clientId}
                  title={peer.isSelf ? `${peer.email} (you)` : peer.email}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-background text-[10px] font-semibold text-white"
                  style={{ backgroundColor: peer.color }}
                >
                  {peer.email.slice(0, 1).toUpperCase()}
                </span>
              ))
            )}
          </div>
          {remotePeers.length > 0 && (
            <span className="text-muted-foreground">
              +{remotePeers.length} collaborator{remotePeers.length === 1 ? '' : 's'}
            </span>
          )}
        </div>

        {readOnly && (
          <span className="text-amber-700 dark:text-amber-300">
            View-only — edits are disabled on this account.
          </span>
        )}

        {process.env.NODE_ENV === 'development' && (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={() => setShowGuide((open) => !open)}
          >
            {showGuide ? 'Hide test guide' : 'Collab test guide'}
          </Button>
        )}
      </div>

      {showGuide && process.env.NODE_ENV === 'development' && (
        <div className="mt-3 grid gap-3 rounded-md border border-dashed border-border bg-muted/30 p-3 md:grid-cols-2">
          <div>
            <p className="mb-1 font-medium">Test accounts (password: demo)</p>
            <ul className="space-y-1 text-muted-foreground">
              {TEST_ACCOUNTS.map((account) => (
                <li key={account.email}>
                  <span className="font-mono text-foreground">{account.email}</span> — {account.role}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-1 font-medium">Edge cases to exercise</p>
            <ol className="list-decimal space-y-1 pl-4 text-muted-foreground">
              <li>Use two different browsers (not two Chrome tabs — BroadcastChannel bypasses relay).</li>
              <li>Owner + editor: drag/type concurrently; both should converge via CRDT.</li>
              <li>Viewer: canvas is read-only; snapshot upload returns 403 from gateway.</li>
              <li>Relay off: <code className="font-mono">pnpm docker:up:relay-off</code>, edit offline, then <code className="font-mono">pnpm docker:relay</code>.</li>
              <li>Run <code className="font-mono">pnpm test:collab</code> for automated multi-user smoke tests.</li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
