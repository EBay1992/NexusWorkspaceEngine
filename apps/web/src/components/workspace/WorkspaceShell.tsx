'use client';

import { useEffect, useRef, useState } from 'react';
import type { IndexeddbPersistence } from 'y-indexeddb';
import {
  createWorkspaceDoc,
  ensureStackOrders,
  seedDemoBlockIfEmpty,
} from '@/lib/yjs/workspace-doc';
import { fetchFreshWsTicket, fetchWorkspace, fetchWsTicket } from '@/lib/gateway/client';
import { setLocalAwarenessUser } from '@/hooks/use-collaboration-presence';
import { useAuthStore } from '@/stores/auth-store';
import {
  bindWorkspacePersistence,
  destroyWorkspacePersistence,
} from '@/lib/yjs/persistence';
import { bindSnapshotUploader, type SnapshotUploader } from '@/lib/yjs/snapshot-uploader';
import { connectSync, type SyncHandle } from '@/lib/yjs/sync-provider';
import { useCanvasStore } from '@/stores/canvas-store';
import { WorkspaceCanvas } from '@/components/canvas/WorkspaceCanvas';
import { CollaborationBar } from '@/components/workspace/CollaborationBar';
import { WorkspaceAccessPanel } from '@/components/workspace/WorkspaceAccessPanel';
import type { WebsocketProvider } from 'y-websocket';

interface WorkspaceShellProps {
  workspaceId: string;
}

export function WorkspaceShell({ workspaceId }: WorkspaceShellProps) {
  const bindDoc = useCanvasStore((s) => s.bindDoc);
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const persistenceRef = useRef<IndexeddbPersistence | null>(null);
  const syncRef = useRef<SyncHandle | null>(null);
  const snapshotRef = useRef<SnapshotUploader | null>(null);
  const initializedRef = useRef(false);
  const [syncStatus, setSyncStatus] = useState<'offline' | 'connecting' | 'connected' | 'disconnected'>('offline');
  const [syncProvider, setSyncProvider] = useState<WebsocketProvider | null>(null);
  const [workspaceRole, setWorkspaceRole] = useState<'owner' | 'editor' | 'viewer' | null>(null);
  const [workspaceTitle, setWorkspaceTitle] = useState<string | null>(null);

  useEffect(() => {
    if (initializedRef.current) return;

    let unbindDoc: (() => void) | undefined;
    let cancelled = false;
    let statusInterval: ReturnType<typeof setInterval> | undefined;

    async function init() {
      if (!accessToken) return;

      const workspace = await fetchWorkspace(workspaceId, accessToken);
      if (cancelled) return;
      if (!workspace) {
        setWorkspaceRole(null);
        setWorkspaceTitle(null);
        return;
      }

      initializedRef.current = true;
      setWorkspaceRole(workspace.role);
      setWorkspaceTitle(workspace.title);

      const doc = createWorkspaceDoc(workspaceId);
      const persistence = await bindWorkspacePersistence(doc, workspaceId);
      if (cancelled) {
        destroyWorkspacePersistence(persistence);
        return;
      }

      persistenceRef.current = persistence;
      ensureStackOrders(doc);
      unbindDoc = bindDoc(doc);

      const token = accessToken;
      const ticketResponse = token
        ? await fetchWsTicket(workspaceId, token)
        : null;

      const sync = await connectSync(doc, {
        workspaceId,
        ticket: ticketResponse?.ticket,
        relayUrl: ticketResponse?.relayUrl,
        refreshTicket: () => fetchFreshWsTicket(workspaceId),
        onSynced: () => {
          seedDemoBlockIfEmpty(doc);
          useCanvasStore.getState().syncFromDoc();
        },
      });

      if (cancelled) {
        sync?.destroy();
        return;
      }
      syncRef.current = sync;
      setSyncProvider(sync?.provider ?? null);
      if (sync && user?.email) {
        setLocalAwarenessUser(sync.provider, { email: user.email });
      }

      const canWrite = workspace.role !== 'viewer';
      snapshotRef.current = bindSnapshotUploader(doc, workspaceId, { enabled: canWrite });

      if (sync) {
        setSyncStatus(sync.provider.synced ? 'connected' : 'connecting');

        sync.provider.on('status', (event: { status: string }) => {
          if (event.status === 'connected') setSyncStatus('connected');
          else if (event.status === 'connecting') setSyncStatus('connecting');
          else setSyncStatus('disconnected');
        });

        sync.provider.on('sync', (isSynced: boolean) => {
          if (isSynced) {
            setSyncStatus('connected');
            useCanvasStore.getState().syncFromDoc();
          }
        });

        await Promise.race([
          sync.whenSynced,
          new Promise((resolve) => setTimeout(resolve, 2_000)),
        ]);

        if (!cancelled) {
          seedDemoBlockIfEmpty(doc);
          useCanvasStore.getState().syncFromDoc();
        }

        statusInterval = setInterval(() => {
          setSyncStatus(sync.getStatus());
        }, 2_000);
      } else {
        seedDemoBlockIfEmpty(doc);
        useCanvasStore.getState().syncFromDoc();
        setSyncStatus('offline');
      }
    }

    void init();

    return () => {
      cancelled = true;
      if (statusInterval) clearInterval(statusInterval);
      unbindDoc?.();
      syncRef.current?.destroy();
      syncRef.current = null;
      setSyncProvider(null);
      snapshotRef.current?.destroy();
      snapshotRef.current = null;
      destroyWorkspacePersistence(persistenceRef.current);
      persistenceRef.current = null;
      initializedRef.current = false;
    };
  }, [accessToken, bindDoc, user?.email, workspaceId]);

  const readOnly = workspaceRole === 'viewer';

  const syncLabel =
    syncStatus === 'connected'
      ? 'Synced'
      : syncStatus === 'connecting'
        ? 'Connecting…'
        : syncStatus === 'disconnected'
          ? 'Reconnecting…'
          : 'Offline only';

  const syncColor =
    syncStatus === 'connected'
      ? 'bg-emerald-500'
      : syncStatus === 'offline'
        ? 'bg-muted-foreground'
        : 'bg-amber-500';

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {workspaceRole && (
        <CollaborationBar
          workspaceId={workspaceId}
          workspaceTitle={workspaceTitle ?? undefined}
          role={workspaceRole}
          syncProvider={syncProvider}
          localEmail={user?.email ?? null}
          readOnly={readOnly}
        />
      )}
      {workspaceRole === 'owner' && <WorkspaceAccessPanel workspaceId={workspaceId} />}
      <div className="flex items-center gap-2 border-b border-border px-4 py-1 text-xs text-muted-foreground">
        <span className={`inline-block h-2 w-2 rounded-full ${syncColor}`} />
        <span>{syncLabel}</span>
      </div>
      <WorkspaceCanvas readOnly={readOnly} />
    </div>
  );
}
