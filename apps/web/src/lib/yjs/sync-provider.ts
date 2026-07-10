import { buildRoomName } from '@orbit/yjs-protocol';
import type { WebsocketProvider } from 'y-websocket';
import type * as Y from 'yjs';

export interface SyncHandle {
  provider: WebsocketProvider;
  destroy: () => void;
  getStatus: () => 'connected' | 'connecting' | 'disconnected';
  whenSynced: Promise<void>;
}

export interface SyncOptions {
  workspaceId: string;
  scopeId?: string;
  ticket?: string;
  relayUrl?: string;
  /** Called before each reconnect so the relay always gets a fresh WS ticket. */
  refreshTicket?: () => Promise<string | undefined>;
  onSynced?: () => void;
}

const STUCK_CONNECTING_MS = 10_000;
const TICKET_REFRESH_MS = 4 * 60 * 1000;

function resolveRelayUrl(explicit?: string): string | null {
  if (explicit) return explicit;
  if (process.env.NEXT_PUBLIC_RELAY_WS_URL) {
    return process.env.NEXT_PUBLIC_RELAY_WS_URL;
  }
  if (process.env.NODE_ENV === 'development') {
    return 'ws://localhost:1234/orbit';
  }
  return null;
}

function relayRoomName(workspaceId: string, scopeId?: string): string {
  if (!scopeId || scopeId === 'default') return workspaceId;
  return buildRoomName(workspaceId, scopeId);
}

async function applyFreshTicket(
  provider: WebsocketProvider,
  refreshTicket?: () => Promise<string | undefined>,
): Promise<void> {
  if (!refreshTicket) return;
  const ticket = await refreshTicket();
  if (ticket) {
    provider.params = { ...provider.params, ticket };
  }
}

/**
 * Connect the local Y.Doc to the relay. Network sync is a side effect on top of
 * the local-first loop (PAT-001). Uses a short room id for stable websocket URLs
 * and BroadcastChannel keys across tabs.
 */
export async function connectSync(
  doc: Y.Doc,
  options: SyncOptions,
): Promise<SyncHandle | null> {
  const relayUrl = resolveRelayUrl(options.relayUrl);
  if (!relayUrl) return null;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return null;

  const { WebsocketProvider } = await import('y-websocket');
  const room = relayRoomName(options.workspaceId, options.scopeId);
  const params: Record<string, string> = {};
  if (options.ticket) params.ticket = options.ticket;

  let syncedResolve: (() => void) | null = null;
  const whenSynced = new Promise<void>((resolve) => {
    syncedResolve = resolve;
  });

  const provider = new WebsocketProvider(relayUrl, room, doc, {
    params,
    connect: true,
    // Recover from missed frames when a tab reconnects or joins late.
    resyncInterval: 3_000,
    // Allow more time for relay/gateway to come back after docker restarts.
    maxBackoffTime: 10_000,
  });

  const notifySynced = () => {
    options.onSynced?.();
    syncedResolve?.();
    syncedResolve = null;
  };

  provider.on('sync', (isSynced: boolean) => {
    if (isSynced) notifySynced();
  });

  if (provider.synced) {
    notifySynced();
  }

  // y-websocket docs: update params before each new connection (tickets expire).
  provider.on('connection-close', () => {
    void applyFreshTicket(provider, options.refreshTicket);
  });

  provider.on('status', (event: { status: string }) => {
    if (event.status === 'disconnected') {
      void applyFreshTicket(provider, options.refreshTicket);
    }
  });

  let stuckConnectingAt: number | null = null;

  const watchdog = setInterval(() => {
    if (!provider.shouldConnect) return;

    if (provider.wsconnecting) {
      stuckConnectingAt ??= Date.now();
      if (Date.now() - stuckConnectingAt >= STUCK_CONNECTING_MS) {
        stuckConnectingAt = null;
        void (async () => {
          await applyFreshTicket(provider, options.refreshTicket);
          provider.ws?.close();
          if (provider.ws === null) {
            provider.connect();
          }
        })();
      }
      return;
    }

    stuckConnectingAt = null;
  }, 2_000);

  const ticketRefresh = setInterval(() => {
    if (provider.wsconnected) {
      void applyFreshTicket(provider, options.refreshTicket);
    }
  }, TICKET_REFRESH_MS);

  const destroy = () => {
    clearInterval(watchdog);
    clearInterval(ticketRefresh);
    provider.disconnect();
    provider.destroy();
  };

  const getStatus = (): 'connected' | 'connecting' | 'disconnected' => {
    if (provider.wsconnected) return 'connected';
    if (provider.wsconnecting) return 'connecting';
    return 'disconnected';
  };

  return { provider, destroy, getStatus, whenSynced };
}
