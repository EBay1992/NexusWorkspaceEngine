import type { WebSocket } from 'ws';
import type { RelayConfig } from './config.js';
import type { Logger } from './logger.js';
import type { RoomRegistry } from './rooms.js';
import { authorizeConnection, parseConnectionRequest } from './auth.js';

export const HEARTBEAT_INTERVAL_MS = 30_000;

interface LiveSocket extends WebSocket {
  isAlive?: boolean;
}

function toUint8Array(data: unknown): Uint8Array {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (Buffer.isBuffer(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (Array.isArray(data)) return new Uint8Array(Buffer.concat(data));
  if (data instanceof Uint8Array) return data;
  return new Uint8Array(Buffer.from(String(data)));
}

export interface HandleConnectionDeps {
  registry: RoomRegistry;
  config: RelayConfig;
  logger: Logger;
}

export function handleConnection(
  socket: WebSocket,
  requestUrl: string,
  deps: HandleConnectionDeps,
): void {
  const { registry, config, logger } = deps;
  const parsed = parseConnectionRequest(requestUrl);
  const auth = authorizeConnection(parsed, config);

  if (!auth.ok) {
    logger.warn({ reason: auth.reason, room: parsed.room }, 'connection rejected');
    socket.close(auth.code, auth.reason);
    return;
  }

  const room = auth.room;
  registry.join(room, socket);
  logger.info(
    { room, userId: auth.claims?.sub ?? 'dev', peers: registry.roomSize(room) },
    'connection joined',
  );

  socket.binaryType = 'arraybuffer';

  socket.on('message', (data: unknown) => {
    const frame = toUint8Array(data);
    registry.broadcastToPeers(room, socket, frame, true);
  });

  socket.on('close', () => {
    registry.leave(room, socket);
    logger.info({ room, peers: registry.roomSize(room) }, 'connection left');
  });

  socket.on('error', (err: Error) => {
    logger.error({ room, err: err.message }, 'socket error');
    registry.leave(room, socket);
  });
}

/**
 * Heartbeat (SEC-002 / free-tier idle timeouts): ping every socket; terminate
 * any that failed to pong since the last sweep.
 */
export function startHeartbeat(
  getSockets: () => Iterable<WebSocket>,
  intervalMs: number = HEARTBEAT_INTERVAL_MS,
): () => void {
  const interval = setInterval(() => {
    for (const raw of getSockets()) {
      const socket = raw as LiveSocket;
      if (socket.isAlive === false) {
        socket.terminate();
        continue;
      }
      socket.isAlive = false;
      socket.ping();
    }
  }, intervalMs);

  return () => clearInterval(interval);
}

export function trackLiveness(socket: WebSocket): void {
  const live = socket as LiveSocket;
  live.isAlive = true;
  socket.on('pong', () => {
    live.isAlive = true;
  });
}
