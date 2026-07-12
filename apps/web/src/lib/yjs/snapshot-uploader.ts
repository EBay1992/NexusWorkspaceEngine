import * as Y from 'yjs';
import { getStoredAccessToken, uploadSnapshot } from '@/lib/gateway/client';

const SNAPSHOT_DEBOUNCE_MS = 30_000;

export interface SnapshotUploader {
  destroy: () => void;
}

export function bindSnapshotUploader(
  doc: Y.Doc,
  workspaceId: string,
  options?: { enabled?: boolean },
): SnapshotUploader | null {
  if (options?.enabled === false) return null;
  if (typeof window === 'undefined') return null;
  if (!process.env.NEXT_PUBLIC_GATEWAY_URL && process.env.NODE_ENV !== 'development') {
    return null;
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  let destroyed = false;

  const scheduleUpload = () => {
    if (destroyed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      void flushSnapshot(doc, workspaceId);
    }, SNAPSHOT_DEBOUNCE_MS);
  };

  const onUpdate = () => scheduleUpload();
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      void flushSnapshot(doc, workspaceId);
    }
  };

  doc.on('update', onUpdate);
  document.addEventListener('visibilitychange', onVisibility);

  return {
    destroy: () => {
      destroyed = true;
      if (timer) clearTimeout(timer);
      doc.off('update', onUpdate);
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}

async function flushSnapshot(doc: Y.Doc, workspaceId: string): Promise<void> {
  try {
    const token = getStoredAccessToken();
    if (!token) return;

    const update = Y.encodeStateAsUpdate(doc);
    const gzipPayload = await gzipBytes(update);
    await uploadSnapshot(workspaceId, token, gzipPayload);
  } catch {
    // Gateway offline or unreachable — local IndexedDB state is unaffected.
  }
}

async function gzipBytes(data: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === 'undefined') {
    return data;
  }

  const stream = new Blob([new Uint8Array(data)])
    .stream()
    .pipeThrough(new CompressionStream('gzip'));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}
