import type { WebSocket } from 'ws';

export type BroadcastHook = (room: string, data: Uint8Array, isBinary: boolean) => void;

/**
 * Connection registry ONLY (CON-002). We track which sockets are in which room
 * so we can fan out frames. We deliberately never construct or hold a Y.Doc:
 * merge logic lives entirely in the browser, so the relay stays O(connections)
 * in memory and cannot leak document state across reconnects.
 */
export class RoomRegistry {
  private readonly rooms = new Map<string, Set<WebSocket>>();

  /** Optional hook fired on every inbound frame (used for Redis fan-out, Phase 2.5). */
  onBroadcast: BroadcastHook | null = null;

  join(room: string, socket: WebSocket): void {
    let peers = this.rooms.get(room);
    if (!peers) {
      peers = new Set();
      this.rooms.set(room, peers);
    }
    peers.add(socket);
  }

  leave(room: string, socket: WebSocket): void {
    const peers = this.rooms.get(room);
    if (!peers) return;
    peers.delete(socket);
    if (peers.size === 0) {
      this.rooms.delete(room);
    }
  }

  /**
   * Forward a frame to every OTHER socket in the room. Because clients speak
   * the y-websocket sync protocol directly, peer-to-peer broadcast is enough —
   * the relay never needs to interpret the payload.
   */
  broadcastToPeers(room: string, sender: WebSocket, data: Uint8Array, isBinary: boolean): void {
    const peers = this.rooms.get(room);
    if (!peers) return;
    for (const peer of peers) {
      if (peer === sender) continue;
      if (peer.readyState === peer.OPEN) {
        peer.send(data, { binary: isBinary });
      }
    }
    this.onBroadcast?.(room, data, isBinary);
  }

  /** Deliver a frame from an external source (e.g. Redis) to all local sockets. */
  deliverExternal(room: string, data: Uint8Array, isBinary: boolean): void {
    const peers = this.rooms.get(room);
    if (!peers) return;
    for (const peer of peers) {
      if (peer.readyState === peer.OPEN) {
        peer.send(data, { binary: isBinary });
      }
    }
  }

  roomSize(room: string): number {
    return this.rooms.get(room)?.size ?? 0;
  }

  totalConnections(): number {
    let total = 0;
    for (const peers of this.rooms.values()) total += peers.size;
    return total;
  }

  *allSockets(): Iterable<WebSocket> {
    for (const peers of this.rooms.values()) {
      yield* peers;
    }
  }
}
