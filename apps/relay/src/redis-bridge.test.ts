import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Redis } from 'ioredis';
import { WebSocket } from 'ws';
import { buildRoomName } from '@orbit/yjs-protocol';
import type { RelayConfig } from './config.js';
import { buildServer, type RelayServer } from './server.js';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

async function redisAvailable(): Promise<boolean> {
  const probe = new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
  try {
    await probe.connect();
    await probe.ping();
    return true;
  } catch {
    return false;
  } finally {
    probe.disconnect();
  }
}

function makeConfig(port: number): RelayConfig {
  return {
    host: '127.0.0.1',
    port,
    signingKey: 'redis-test-signing-key-32-bytes-xxxxx',
    devNoAuth: true,
    redisEnabled: true,
    redisUrl: REDIS_URL,
    logLevel: 'silent',
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
    const timeout = setTimeout(() => reject(new Error('timed out')), 3000);
    ws.once('message', (data: Buffer) => {
      clearTimeout(timeout);
      resolve(new Uint8Array(data));
    });
    ws.once('error', reject);
  });
}

const available = await redisAvailable();

describe.skipIf(!available)('redis cross-instance fan-out', () => {
  let serverA: RelayServer;
  let serverB: RelayServer;
  let urlA: string;
  let urlB: string;

  beforeAll(async () => {
    serverA = await buildServer({ config: makeConfig(0) });
    serverB = await buildServer({ config: makeConfig(0) });
    urlA = await serverA.listen();
    urlB = await serverB.listen();
  });

  afterAll(async () => {
    await serverA?.close();
    await serverB?.close();
  });

  it('delivers a frame published on instance A to a client on instance B', async () => {
    const room = buildRoomName('ws-xinst');
    const portA = new URL(urlA).port;
    const portB = new URL(urlB).port;

    const clientA = new WebSocket(
      `ws://127.0.0.1:${portA}/orbit?room=${encodeURIComponent(room)}`,
    );
    const clientB = new WebSocket(
      `ws://127.0.0.1:${portB}/orbit?room=${encodeURIComponent(room)}`,
    );

    await Promise.all([waitForOpen(clientA), waitForOpen(clientB)]);
    // Allow psubscribe + join to settle.
    await new Promise((r) => setTimeout(r, 150));

    const received = nextMessage(clientB);
    clientA.send(new Uint8Array([42, 7, 13]), { binary: true });

    const result = await received;
    expect(Array.from(result)).toEqual([42, 7, 13]);

    clientA.close();
    clientB.close();
  });
});
