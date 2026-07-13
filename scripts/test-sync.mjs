/**
 * Quick smoke test: two y-websocket clients sync through the relay.
 * Run: node scripts/test-sync.mjs
 */
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

const RELAY = process.env.RELAY_URL ?? 'ws://localhost:1234/orbit';
const ROOM = 'orbit:ws:smoke-test:default';

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function waitSynced(provider, timeout = 5000) {
  return new Promise((resolve, reject) => {
    if (provider.synced) return resolve();
    const t = setTimeout(() => reject(new Error('sync timeout')), timeout);
    provider.on('sync', (synced) => {
      if (synced) {
        clearTimeout(t);
        resolve();
      }
    });
  });
}

const docA = new Y.Doc();
const docB = new Y.Doc();

const providerA = new WebsocketProvider(RELAY, ROOM, docA, { connect: true });
const providerB = new WebsocketProvider(RELAY, ROOM, docB, { connect: true });

try {
  await wait(500);
  await Promise.all([waitSynced(providerA), waitSynced(providerB)]);

  const mapA = docA.getMap('test');
  mapA.set('hello', 'world');

  await wait(300);

  const mapB = docB.getMap('test');
  const value = mapB.get('hello');
  if (value !== 'world') {
    console.error('FAIL: expected "world", got', value);
    process.exit(1);
  }

  console.log('PASS: two clients synced via relay');
} finally {
  providerA.destroy();
  providerB.destroy();
  process.exit(0);
}
