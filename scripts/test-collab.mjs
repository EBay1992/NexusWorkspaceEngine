/**
 * Multi-user collaboration smoke tests through gateway tickets + relay.
 *
 * Prerequisites: pnpm dev:all (or docker stack with gateway + relay + postgres)
 * Run: pnpm test:collab
 */
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

const GATEWAY = process.env.GATEWAY_URL ?? 'http://localhost:5080';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? 'demo';

const USERS = {
  owner: { email: 'demo@orbit.local', password: 'demo' },
  editor: { email: 'editor@orbit.local', password: 'demo' },
  viewer: { email: 'viewer@orbit.local', password: 'demo' },
};

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitSynced(provider, timeout = 8_000) {
  return new Promise((resolve, reject) => {
    if (provider.synced) return resolve();
    const timer = setTimeout(() => reject(new Error('sync timeout')), timeout);
    provider.on('sync', (synced) => {
      if (synced) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
}

async function login(email, password) {
  const response = await fetch(`${GATEWAY}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    throw new Error(`login failed for ${email}: ${response.status}`);
  }
  const data = await response.json();
  return data.accessToken;
}

async function fetchWsTicket(accessToken) {
  const response = await fetch(
    `${GATEWAY}/api/workspaces/${encodeURIComponent(WORKSPACE_ID)}/ws-ticket`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!response.ok) {
    throw new Error(`ws-ticket failed: ${response.status}`);
  }
  return response.json();
}

async function uploadSnapshot(accessToken, payload) {
  return fetch(`${GATEWAY}/api/workspaces/${encodeURIComponent(WORKSPACE_ID)}/snapshots`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Encoding': 'gzip',
    },
    body: payload,
  });
}

function connectDoc(ticketResponse) {
  const doc = new Y.Doc();
  const provider = new WebsocketProvider(
    ticketResponse.relayUrl,
    WORKSPACE_ID,
    doc,
    {
      connect: true,
      params: { ticket: ticketResponse.ticket },
    },
  );
  return { doc, provider };
}

function getBlocksMap(doc) {
  return doc.getMap('blocks');
}

async function testOwnerEditorSync() {
  const ownerToken = await login(USERS.owner.email, USERS.owner.password);
  const editorToken = await login(USERS.editor.email, USERS.editor.password);

  const ownerTicket = await fetchWsTicket(ownerToken);
  const editorTicket = await fetchWsTicket(editorToken);

  const owner = connectDoc(ownerTicket);
  const editor = connectDoc(editorTicket);

  try {
    await wait(400);
    await Promise.all([waitSynced(owner.provider), waitSynced(editor.provider)]);

    const blockId = 'collab-test-block';
    const ownerBlock = new Y.Map();
    ownerBlock.set('id', blockId);
    ownerBlock.set('content', 'from-owner');
    ownerBlock.set('updatedAt', Date.now());
    getBlocksMap(owner.doc).set(blockId, ownerBlock);

    await wait(500);

    const editorBlock = getBlocksMap(editor.doc).get(blockId);
    if (!editorBlock || editorBlock.get('content') !== 'from-owner') {
      throw new Error('editor did not receive owner update');
    }

    const editorYBlock = getBlocksMap(editor.doc).get(blockId);
    editorYBlock.set('content', 'from-editor');
    await wait(500);

    const ownerBlockAfter = getBlocksMap(owner.doc).get(blockId);
    if (!ownerBlockAfter || ownerBlockAfter.get('content') !== 'from-editor') {
      throw new Error('owner did not receive editor update');
    }

    console.log('PASS: owner ↔ editor real-time sync');
  } finally {
    owner.provider.destroy();
    editor.provider.destroy();
  }
}

async function testConcurrentMerge() {
  const ownerToken = await login(USERS.owner.email, USERS.owner.password);
  const editorToken = await login(USERS.editor.email, USERS.editor.password);

  const owner = connectDoc(await fetchWsTicket(ownerToken));
  const editor = connectDoc(await fetchWsTicket(editorToken));

  try {
    await wait(400);
    await Promise.all([waitSynced(owner.provider), waitSynced(editor.provider)]);

    const blockId = 'concurrent-block';
    const seed = new Y.Map();
    seed.set('id', blockId);
    seed.set('content', 'seed');
    seed.set('updatedAt', 1);
    getBlocksMap(owner.doc).set(blockId, seed);
    await wait(300);

    const ownerBlock = getBlocksMap(owner.doc).get(blockId);
    const editorBlock = getBlocksMap(editor.doc).get(blockId);

    ownerBlock.set('content', 'owner-edit');
    ownerBlock.set('updatedAt', 2);
    editorBlock.set('content', 'editor-edit');
    editorBlock.set('updatedAt', 3);

    await wait(500);

    const finalOwner = getBlocksMap(owner.doc).get(blockId)?.get('content');
    const finalEditor = getBlocksMap(editor.doc).get(blockId)?.get('content');
    if (finalOwner !== finalEditor) {
      throw new Error(`CRDT divergence: owner=${finalOwner} editor=${finalEditor}`);
    }

    console.log(`PASS: concurrent edits converged to "${finalOwner}"`);
  } finally {
    owner.provider.destroy();
    editor.provider.destroy();
  }
}

async function testViewerSnapshotDenied() {
  const viewerToken = await login(USERS.viewer.email, USERS.viewer.password);
  const response = await uploadSnapshot(viewerToken, new Uint8Array([1, 2, 3]));
  if (response.status !== 403) {
    throw new Error(`expected viewer snapshot 403, got ${response.status}`);
  }
  console.log('PASS: viewer snapshot upload forbidden (403)');
}

async function testViewerCanReadTicket() {
  const viewerToken = await login(USERS.viewer.email, USERS.viewer.password);
  const ticket = await fetchWsTicket(viewerToken);
  if (!ticket.ticket) {
    throw new Error('viewer should receive read ticket');
  }
  console.log('PASS: viewer can join relay room (read ticket)');
}

async function main() {
  console.log(`Gateway: ${GATEWAY} · workspace: ${WORKSPACE_ID}`);

  await testViewerCanReadTicket();
  await testViewerSnapshotDenied();
  await testOwnerEditorSync();
  await testConcurrentMerge();

  console.log('\nAll collaboration smoke tests passed.');
}

main().catch((error) => {
  console.error('FAIL:', error.message ?? error);
  process.exit(1);
});
