import type { WsTicketClaims } from '@orbit/shared-types';
import jwt from 'jsonwebtoken';

export const WS_TICKET_TTL_SECONDS = 5 * 60;

export type TicketValidation =
  | { valid: true; claims: WsTicketClaims }
  | { valid: false; reason: string };

/**
 * Validate a WS ticket using only the shared signing key (SEC-002).
 * No DB round-trip: the gateway already performed RBAC when it signed the
 * ticket, so the relay just verifies signature + expiry + required claims.
 */
export function validateWsTicket(
  token: string,
  signingKey: string,
): TicketValidation {
  if (!token) return { valid: false, reason: 'missing token' };

  try {
    const decoded = jwt.verify(token, signingKey);
    if (typeof decoded !== 'object' || decoded === null) {
      return { valid: false, reason: 'malformed payload' };
    }

    const payload = decoded as Record<string, unknown>;
    const sub = payload.sub;
    const workspaceId = payload.workspaceId;
    const scopeId = payload.scopeId;
    const exp = payload.exp;

    if (typeof sub !== 'string' || !sub) {
      return { valid: false, reason: 'missing sub' };
    }
    if (typeof workspaceId !== 'string' || !workspaceId) {
      return { valid: false, reason: 'missing workspaceId' };
    }
    if (typeof scopeId !== 'string' || !scopeId) {
      return { valid: false, reason: 'missing scopeId' };
    }
    if (typeof exp !== 'number') {
      return { valid: false, reason: 'missing exp' };
    }

    return {
      valid: true,
      claims: { sub, workspaceId, scopeId, exp },
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'verification failed';
    return { valid: false, reason };
  }
}

/**
 * Test/dev helper mirroring the gateway ticket signing (Phase 3 owns the real one).
 */
export function signWsTicket(
  claims: Omit<WsTicketClaims, 'exp'>,
  signingKey: string,
  ttlSeconds: number = WS_TICKET_TTL_SECONDS,
): string {
  return jwt.sign(
    {
      sub: claims.sub,
      workspaceId: claims.workspaceId,
      scopeId: claims.scopeId,
    },
    signingKey,
    { expiresIn: ttlSeconds },
  );
}
