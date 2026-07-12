'use client';

import { useEffect, useState } from 'react';
import type { WebsocketProvider } from 'y-websocket';
import { colorFromEmail } from '@/lib/collaboration/colors';

export interface CollaborationPeer {
  clientId: number;
  email: string;
  color: string;
  isSelf: boolean;
}

export interface AwarenessUser {
  email: string;
  color?: string;
}

export function setLocalAwarenessUser(
  provider: WebsocketProvider,
  user: AwarenessUser,
): void {
  provider.awareness.setLocalStateField('user', {
    email: user.email,
    color: user.color ?? colorFromEmail(user.email),
  });
}

export function useCollaborationPresence(
  provider: WebsocketProvider | null | undefined,
  localEmail: string | null | undefined,
): CollaborationPeer[] {
  const [peers, setPeers] = useState<CollaborationPeer[]>([]);

  useEffect(() => {
    if (!provider || !localEmail) {
      setPeers([]);
      return;
    }

    const readPeers = () => {
      const localClientId = provider.awareness.clientID;
      const states = provider.awareness.getStates();
      const next: CollaborationPeer[] = [];

      states.forEach((state, clientId) => {
        const user = state.user as { email?: string; color?: string } | undefined;
        if (!user?.email) return;

        next.push({
          clientId,
          email: user.email,
          color: user.color ?? colorFromEmail(user.email),
          isSelf: clientId === localClientId,
        });
      });

      next.sort((a, b) => {
        if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1;
        return a.email.localeCompare(b.email);
      });

      setPeers(next);
    };

    readPeers();
    provider.awareness.on('change', readPeers);
    return () => {
      provider.awareness.off('change', readPeers);
    };
  }, [localEmail, provider]);

  return peers;
}
