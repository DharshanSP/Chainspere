/**
 * In-memory presence registry. Holds only address -> socket mapping.
 * No conversation plaintext, no encryption secrets, no message history — ever.
 */
export interface SocketLike {
  send(data: string): void;
  readyState: number; // 1 = OPEN (ws convention)
  close(code?: number, reason?: string): void;
}

export class RoomRegistry {
  private byAddress = new Map<string, SocketLike>();

  register(address: string, socket: SocketLike): void {
    const key = address.toLowerCase();
    const prev = this.byAddress.get(key);
    if (prev && prev !== socket) {
      try { prev.close(4001, "superseded"); } catch { /* ignore */ }
    }
    this.byAddress.set(key, socket);
  }

  resolve(address: string): SocketLike | undefined {
    return this.byAddress.get(address.toLowerCase());
  }

  unregister(address: string, socket: SocketLike): void {
    const key = address.toLowerCase();
    if (this.byAddress.get(key) === socket) this.byAddress.delete(key);
  }

  get size(): number {
    return this.byAddress.size;
  }

  /** Route a frame to its addressee. Returns true if delivered to an open socket. */
  route(to: string, frame: string): boolean {
    const sock = this.resolve(to);
    if (!sock || sock.readyState !== 1) return false;
    try {
      sock.send(frame);
      return true;
    } catch {
      return false;
    }
  }
}
