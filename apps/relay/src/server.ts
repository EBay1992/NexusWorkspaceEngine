import websocketPlugin from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { loadConfig, type RelayConfig } from './config.js';
import { logger as defaultLogger, type Logger } from './logger.js';
import { RedisBridge } from './redis-bridge.js';
import { RoomRegistry } from './rooms.js';
import {
  handleConnection,
  startHeartbeat,
  trackLiveness,
} from './yws-handler.js';

export interface RelayServer {
  fastify: FastifyInstance;
  registry: RoomRegistry;
  config: RelayConfig;
  listen: () => Promise<string>;
  close: () => Promise<void>;
}

export interface BuildServerOptions {
  config?: RelayConfig;
  logger?: Logger;
}

export async function buildServer(options: BuildServerOptions = {}): Promise<RelayServer> {
  const config = options.config ?? loadConfig();
  const logger = options.logger ?? defaultLogger;
  const registry = new RoomRegistry();

  // We drive our own pino logger for domain events; Fastify's request log is
  // disabled to avoid per-request noise and a pino<->fastify type coupling.
  const fastify = Fastify({ logger: false });
  await fastify.register(websocketPlugin, {
    options: { maxPayload: 10 * 1024 * 1024 },
  });

  fastify.get('/health', async () => ({
    status: 'ok',
    connections: registry.totalConnections(),
  }));

  fastify.get('/orbit/*', { websocket: true }, (socket: WebSocket, request) => {
    trackLiveness(socket);
    handleConnection(socket, request.url, { registry, config, logger });
  });

  fastify.get('/orbit', { websocket: true }, (socket: WebSocket, request) => {
    trackLiveness(socket);
    handleConnection(socket, request.url, { registry, config, logger });
  });

  const stopHeartbeat = startHeartbeat(() => registry.allSockets());

  // Multi-instance fan-out is opt-in (TASK-018): single-instance dev runs with
  // the flag off and never touches Redis.
  let redisBridge: RedisBridge | null = null;
  if (config.redisEnabled) {
    if (!config.redisUrl) {
      throw new Error('RELAY_REDIS_ENABLED=true but REDIS_URL is not set');
    }
    redisBridge = new RedisBridge(registry, config.redisUrl, logger);
  }

  const listen = async (): Promise<string> => {
    if (redisBridge) await redisBridge.start();
    const address = await fastify.listen({ host: config.host, port: config.port });
    logger.info(
      { address, devNoAuth: config.devNoAuth, redis: config.redisEnabled },
      config.devNoAuth
        ? 'relay listening (DEV: ticket auth bypassed)'
        : 'relay listening',
    );
    return address;
  };

  const close = async (): Promise<void> => {
    stopHeartbeat();
    await redisBridge?.stop();
    await fastify.close();
  };

  return { fastify, registry, config, listen, close };
}
