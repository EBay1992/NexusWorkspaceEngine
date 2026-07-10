export type { WsTicketClaims } from '@orbit/shared-types';

export const ROOM_PREFIX = 'orbit:ws';
export const DEFAULT_SCOPE_ID = 'default';

export interface RoomParts {
  workspaceId: string;
  scopeId: string;
}

/**
 * Room naming (PAT-004): `orbit:ws:{workspaceId}:{scopeId}`.
 * The scopeId maps to an RBAC-partitioned Y.js sub-document (Phase 3+),
 * so the relay never needs to inspect document contents to enforce isolation —
 * clients only ever join rooms they hold a ticket for.
 */
export function buildRoomName(
  workspaceId: string,
  scopeId: string = DEFAULT_SCOPE_ID,
): string {
  return `${ROOM_PREFIX}:${workspaceId}:${scopeId}`;
}

export function parseRoomName(room: string): RoomParts | null {
  const parts = room.split(':');
  if (parts.length !== 4) return null;
  const [prefixA, prefixB, workspaceId, scopeId] = parts;
  if (`${prefixA}:${prefixB}` !== ROOM_PREFIX) return null;
  if (!workspaceId || !scopeId) return null;
  return { workspaceId, scopeId };
}

/**
 * Normalize any supported room identifier to the canonical PAT-004 name.
 * Accepts `demo` (workspace id) or `orbit:ws:demo:default`.
 */
export function normalizeRoomName(
  room: string,
  defaultScopeId: string = DEFAULT_SCOPE_ID,
): string | null {
  const parsed = parseRoomName(room);
  if (parsed) return buildRoomName(parsed.workspaceId, parsed.scopeId);
  if (room && !room.includes(':')) return buildRoomName(room, defaultScopeId);
  return null;
}

export function isValidRoomName(room: string): boolean {
  return normalizeRoomName(room) !== null;
}
