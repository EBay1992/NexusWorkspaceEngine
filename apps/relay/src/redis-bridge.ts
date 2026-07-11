import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import type { Logger } from './logger.js';
import type { RoomRegistry } from './rooms.js';

export const CHANNEL_PREFIX = 'orbit:pub:';
export const CHANNEL_PATTERN = `${CHANNEL_PREFIX}*`;

/** Fixed-width origin tag (UUID v4 string) prepended to every published frame. */
const ORIGIN_TAG_BYTES = 36;

function channelForRoom(room: string): string {
  return `${CHANNEL_PREFIX}${room}`;
}

function roomFromChannel(channel: string): string {
  return channel.slice(CHANNEL_PREFIX.length);
}

/**
 * Cross-instance fan-out (GOAL-003). The relay stays stateless: Redis only
 * transports the same binary Y.js frames between relay processes, it never
 * stores document state. Each frame is tagged with the originating instance id
 * so an instance ignores the echo of its own publish (Yjs updates are
 * idempotent anyway, this just avoids redundant local sends).
 */
export class RedisBridge {
  private readonly instanceId = randomUUID();
  private pub: Redis | null = null;
  private sub: Redis | null = null;

  constructor(
    private readonly registry: RoomRegistry,
    private readonly redisUrl: string,
    private readonly logger: Logger,
  ) {}

  async start(): Promise<void> {
    this.pub = new Redis(this.redisUrl, { lazyConnect: true });
    this.sub = new Redis(this.redisUrl, { lazyConnect: true });

    await Promise.all([this.pub.connect(), this.sub.connect()]);

    this.sub.on('pmessageBuffer', (_pattern, channelBuf: Buffer, messageBuf: Buffer) => {
      const origin = messageBuf.subarray(0, ORIGIN_TAG_BYTES).toString('utf8');
      if (origin === this.instanceId) return; // ignore our own echo

      const room = roomFromChannel(channelBuf.toString('utf8'));
      const frame = new Uint8Array(
        messageBuf.subarray(ORIGIN_TAG_BYTES, messageBuf.length),
      );
      this.registry.deliverExternal(room, frame, true);
    });

    await this.sub.psubscribe(CHANNEL_PATTERN);

    // Publish locally-originated frames to peers on other instances.
    this.registry.onBroadcast = (room, data, _isBinary) => {
      if (!this.pub) return;
      const payload = Buffer.concat([
        Buffer.from(this.instanceId, 'utf8'),
        Buffer.from(data),
      ]);
      void this.pub.publish(channelForRoom(room), payload);
    };

    this.logger.info(
      { instanceId: this.instanceId, pattern: CHANNEL_PATTERN },
      'redis bridge started',
    );
  }

  async stop(): Promise<void> {
    this.registry.onBroadcast = null;
    await Promise.allSettled([this.sub?.quit(), this.pub?.quit()]);
    this.sub = null;
    this.pub = null;
  }
}
