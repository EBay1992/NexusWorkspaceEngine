import { describe, expect, it } from 'vitest';
import { buildRoomName, parseRoomName, isValidRoomName, normalizeRoomName } from './index';
import { signWsTicket, validateWsTicket } from './ticket';

const KEY = 'test-signing-key-at-least-32-bytes-long!!';

describe('room naming', () => {
  it('builds and parses round-trip', () => {
    const room = buildRoomName('ws-1', 'scope-a');
    expect(room).toBe('orbit:ws:ws-1:scope-a');
    expect(parseRoomName(room)).toEqual({ workspaceId: 'ws-1', scopeId: 'scope-a' });
  });

  it('defaults scope', () => {
    expect(buildRoomName('ws-1')).toBe('orbit:ws:ws-1:default');
  });

  it('rejects malformed rooms', () => {
    expect(parseRoomName('nope')).toBeNull();
    expect(parseRoomName('orbit:ws:only-three')).toBeNull();
    expect(isValidRoomName('orbit:ws:a:b')).toBe(true);
    expect(isValidRoomName('bad:ns:a:b')).toBe(false);
  });

  it('normalizes workspace id aliases', () => {
    expect(normalizeRoomName('demo')).toBe('orbit:ws:demo:default');
    expect(normalizeRoomName('orbit:ws:demo:default')).toBe('orbit:ws:demo:default');
    expect(normalizeRoomName('bad:room')).toBeNull();
  });
});

describe('ws ticket', () => {
  it('validates a freshly signed ticket', () => {
    const token = signWsTicket({ sub: 'u1', workspaceId: 'ws-1', scopeId: 'default' }, KEY);
    const result = validateWsTicket(token, KEY);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.claims.workspaceId).toBe('ws-1');
      expect(result.claims.sub).toBe('u1');
    }
  });

  it('rejects a bad signature', () => {
    const token = signWsTicket({ sub: 'u1', workspaceId: 'ws-1', scopeId: 'default' }, KEY);
    const result = validateWsTicket(token, 'wrong-key');
    expect(result.valid).toBe(false);
  });

  it('rejects an expired ticket', () => {
    const token = signWsTicket({ sub: 'u1', workspaceId: 'ws-1', scopeId: 'default' }, KEY, -1);
    const result = validateWsTicket(token, KEY);
    expect(result.valid).toBe(false);
  });

  it('rejects a missing token', () => {
    expect(validateWsTicket('', KEY).valid).toBe(false);
  });
});
