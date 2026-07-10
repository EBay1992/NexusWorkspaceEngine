import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { buildRoomName } from '@orbit/yjs-protocol';
import { signWsTicket } from '@orbit/yjs-protocol/ticket';
import type { RelayConfig } from './config.js';
import { buildServer, type RelayServer } from './server.js';

const SIGNING_KEY = 'integration-test-signing-key-32-bytes-x';

function makeConfig(overrides: Partial<RelayConfig> = {}): RelayConfig {
  return {
    host: '127.0.0.1',
    port: 0,
    signingKey: SIGNING_KEY,
    devNoAuth: false,
    redisEnabled: false,
    redisUrl: undefined,
    logLevel: 'silent',
    ...overrides,
  };
}

function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
}

function nextMessage(ws: WebSocket): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('timed out waiting for message')), 2000);
    ws.once('message', (data: Buffer) => {
      clearTimeout(timeout);
      resolve(new Uint8Array(data));
    });
    ws.once('error', reject);
  });
}

describe('relay room broadcast', () => {
  let server: RelayServer;
  let baseUrl: string;

  beforeAll(async () => {
    server = await buildServer({ config: makeConfig() });
    const address = await server.listen();
    const port = new URL(address).port;
    baseUrl = `ws://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await server.close();
  });

  function connect(room: string, sub: string): WebSocket {
    const ticket = signWsTicket(
      { sub, workspaceId: parseWs(room), scopeId: 'default' },
      SIGNING_KEY,
    );
    return new WebSocket(`${baseUrl}/orbit?room=${encodeURIComponent(room)}&ticket=${ticket}`);
  }

  function parseWs(room: string): string {
    return room.split(':')[2];
  }

  it('forwards a binary frame from one peer to the other', async () => {
    const room = buildRoomName('ws-1');
    const clientA = connect(room, 'user-a');
    const clientB = connect(room, 'user-b');

    await Promise.all([waitForOpen(clientA), waitForOpen(clientB)]);

    const payload = new Uint8Array([1, 2, 3, 4, 5]);
    const received = nextMessage(clientB);
    clientA.send(payload, { binary: true });

    const result = await received;
    expect(Array.from(result)).toEqual([1, 2, 3, 4, 5]);

    clientA.close();
    clientB.close();
  });

  it('rejects a connection without a valid ticket', async () => {
    // @fastify/websocket completes the HTTP upgrade before the route handler
    // runs, so an unauthorized socket briefly opens and is then closed with our
    // application close code. We assert on that close code (4401).
    const room = buildRoomName('ws-2');
    const bad = new WebSocket(`${baseUrl}/orbit?room=${encodeURIComponent(room)}`);

    const closeCode = await new Promise<number>((resolve, reject) => {
      bad.once('close', (code: number) => resolve(code));
      setTimeout(() => reject(new Error('no close event')), 2000);
    });

    expect(closeCode).toBe(4401);
  });

  it('isolates rooms — no cross-room delivery', async () => {
    const roomA = buildRoomName('ws-a');
    const roomB = buildRoomName('ws-b');
    const a = connect(roomA, 'user-a');
    const b = connect(roomB, 'user-b');

    await Promise.all([waitForOpen(a), waitForOpen(b)]);

    let bGotMessage = false;
    b.once('message', () => {
      bGotMessage = true;
    });

    a.send(new Uint8Array([9, 9, 9]), { binary: true });
    await new Promise((r) => setTimeout(r, 300));

    expect(bGotMessage).toBe(false);

    a.close();
    b.close();
  });
});
