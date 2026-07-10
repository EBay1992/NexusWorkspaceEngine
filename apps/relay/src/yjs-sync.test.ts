import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import type { RelayConfig } from './config.js';
import { buildServer, type RelayServer } from './server.js';

function makeConfig(overrides: Partial<RelayConfig> = {}): RelayConfig {
  return {
    host: '127.0.0.1',
    port: 0,
    signingKey: 'integration-test-signing-key-32-bytes-x',
    devNoAuth: true,
    redisEnabled: false,
    redisUrl: undefined,
    logLevel: 'silent',
    ...overrides,
  };
}

function blockCount(doc: Y.Doc): number {
  const blocks = doc.getMap('blocks');
  let count = 0;
  blocks.forEach(() => {
    count += 1;
  });
  return count;
}

function addTextBlock(doc: Y.Doc, id: string, content: string, x = 0): void {
  const blocks = doc.getMap('blocks');
  const yBlock = new Y.Map<unknown>();
  yBlock.set('id', id);
  yBlock.set('type', 'text');
  yBlock.set('x', x);
  yBlock.set('y', 0);
  yBlock.set('w', 4);
  yBlock.set('h', 2);
  yBlock.set('content', content);
  yBlock.set('updatedAt', Date.now());
  doc.transact(() => {
    blocks.set(id, yBlock);
  });
}

function waitForSync(provider: WebsocketProvider, timeoutMs = 5_000): Promise<void> {
  if (provider.synced) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('sync timeout')), timeoutMs);
    provider.on('sync', (isSynced: boolean) => {
      if (isSynced) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
}

function waitForBlockCount(doc: Y.Doc, count: number, timeoutMs = 5_000): Promise<void> {
  if (blockCount(doc) === count) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`expected ${count} blocks, got ${blockCount(doc)}`)),
      timeoutMs,
    );
    const onUpdate = () => {
      if (blockCount(doc) === count) {
        clearTimeout(timer);
        doc.off('update', onUpdate);
        resolve();
      }
    };
    doc.on('update', onUpdate);
  });
}

describe('yjs sync through relay', () => {
  let server: RelayServer;
  let relayUrl: string;

  beforeAll(async () => {
    server = await buildServer({ config: makeConfig() });
    const address = await server.listen();
    const port = new URL(address).port;
    relayUrl = `ws://127.0.0.1:${port}/orbit`;
  });

  afterAll(async () => {
    await server.close();
  });

  function connectProvider(doc: Y.Doc, room: string): WebsocketProvider {
    return new WebsocketProvider(relayUrl, room, doc, {
      connect: true,
      disableBc: true,
      WebSocketPolyfill: WebSocket as unknown as typeof globalThis.WebSocket,
      resyncInterval: 1_000,
    });
  }

  it('syncs add, edit, and delete across two clients', async () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();

    const providerA = connectProvider(docA, 'demo');
    const providerB = connectProvider(docB, 'demo');

    await Promise.all([waitForSync(providerA), waitForSync(providerB)]);

    addTextBlock(docA, 'sync-test-block', 'hello from A', 3);
    await waitForBlockCount(docB, 1);

    const remote = docB.getMap('blocks').get('sync-test-block') as Y.Map<unknown>;
    expect(remote?.get('content')).toBe('hello from A');
    expect(remote?.get('x')).toBe(3);

    docB.transact(() => {
      remote.set('content', 'edited on B');
      remote.set('x', 9);
    });
    await new Promise((r) => setTimeout(r, 200));

    const local = docA.getMap('blocks').get('sync-test-block') as Y.Map<unknown>;
    expect(local?.get('content')).toBe('edited on B');
    expect(local?.get('x')).toBe(9);

    docA.transact(() => {
      docA.getMap('blocks').delete('sync-test-block');
    });
    await waitForBlockCount(docB, 0);

    providerA.destroy();
    providerB.destroy();
    docA.destroy();
    docB.destroy();
  });

  it('accepts short room names used by the web client', async () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();

    const providerA = connectProvider(docA, 'workspace-short');
    const providerB = connectProvider(docB, 'workspace-short');

    await Promise.all([waitForSync(providerA), waitForSync(providerB)]);

    addTextBlock(docA, 'short-room-block', 'short room');
    await waitForBlockCount(docB, 1);

    providerA.destroy();
    providerB.destroy();
    docA.destroy();
    docB.destroy();
  });
});
