import type { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';

let persistenceModule: typeof import('y-indexeddb') | null = null;

async function loadPersistenceModule() {
  if (!persistenceModule) {
    persistenceModule = await import('y-indexeddb');
  }
  return persistenceModule;
}

export async function bindWorkspacePersistence(
  doc: Y.Doc,
  workspaceId: string,
): Promise<IndexeddbPersistence> {
  const { IndexeddbPersistence } = await loadPersistenceModule();
  const dbName = `orbit-${workspaceId}`;
  const persistence = new IndexeddbPersistence(dbName, doc);
  await persistence.whenSynced;
  return persistence;
}

export function destroyWorkspacePersistence(
  persistence: IndexeddbPersistence | null,
): void {
  persistence?.destroy();
}
