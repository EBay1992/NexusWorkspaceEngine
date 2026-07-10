import { buildRoomName, normalizeRoomName, type WsTicketClaims } from '@orbit/yjs-protocol';
import { validateWsTicket } from '@orbit/yjs-protocol/ticket';
import type { RelayConfig } from './config.js';

export interface ConnectionRequest {
  room: string | null;
  ticket: string | null;
}

export type AuthResult =
  | { ok: true; room: string; claims: WsTicketClaims | null }
  | { ok: false; code: number; reason: string };

/**
 * Parse `room` and `ticket` from a WebSocket upgrade URL.
 * Supports both `?room=` query style and y-websocket's path style
 * (`/orbit/{room}?ticket=`), so the same relay works with the native
 * WebsocketProvider and with direct test clients.
 */
export function parseConnectionRequest(rawUrl: string): ConnectionRequest {
  const url = new URL(rawUrl, 'http://relay.local');
  const queryRoom = url.searchParams.get('room');
  const ticket = url.searchParams.get('ticket');

  let room = queryRoom;
  if (!room) {
    const segments = url.pathname.split('/').filter(Boolean);
    // Path is /orbit/{room}; take the last non-empty segment if it isn't "orbit".
    const last = segments.at(-1);
    if (last && last !== 'orbit') {
      room = decodeURIComponent(last);
    }
  }

  return { room, ticket };
}

export function authorizeConnection(
  req: ConnectionRequest,
  config: RelayConfig,
): AuthResult {
  const room = req.room ? normalizeRoomName(req.room) : null;
  if (!room) {
    return { ok: false, code: 4400, reason: 'invalid or missing room' };
  }

  if (config.devNoAuth) {
    return { ok: true, room, claims: null };
  }

  if (!req.ticket) {
    return { ok: false, code: 4401, reason: 'missing ticket' };
  }

  const validation = validateWsTicket(req.ticket, config.signingKey);
  if (!validation.valid) {
    return { ok: false, code: 4401, reason: validation.reason };
  }

  const expectedRoom = normalizeRoomName(room);
  const ticketRoom = buildRoomName(
    validation.claims.workspaceId,
    validation.claims.scopeId,
  );
  if (expectedRoom && ticketRoom === expectedRoom) {
    return { ok: true, room: expectedRoom, claims: validation.claims };
  }

  return { ok: false, code: 4403, reason: 'ticket does not match room' };
}
