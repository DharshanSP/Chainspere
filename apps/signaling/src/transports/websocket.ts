import { WebSocketServer, type WebSocket } from "ws";
import { RoomRegistry } from "../rooms/registry";
import { MAX_FRAME_BYTES, RateLimiter, parseFrame, validateMessage } from "../validation/message";

export interface SignalingServerOptions {
  port: number;
  /** Require an address registration before routing (default true). */
  requireRegister?: boolean;
  log?: (msg: string) => void;
}

/**
 * WebSocket signaling server.
 * Routes WebRTC setup frames (offer/answer/ice) + presence between registered addresses.
 * Deliberately does NOT store chat plaintext, message history, or encryption keys.
 */
export class SignalingServer {
  private wss: WebSocketServer | null = null;
  private registry = new RoomRegistry();
  private limiter = new RateLimiter();
  private sockets = new Map<WebSocket, { address?: string }>();

  constructor(private opts: SignalingServerOptions) {}

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wss = new WebSocketServer({ port: this.opts.port, maxPayload: MAX_FRAME_BYTES });
      this.wss = wss;
      wss.on("listening", () => {
        this.opts.log?.(`[signaling] listening on ws://localhost:${this.opts.port}`);
        resolve();
      });
      wss.on("error", reject);
      wss.on("connection", (ws) => this.onConnection(ws));
    });
  }

  async stop(): Promise<void> {
    for (const ws of this.sockets.keys()) ws.close(1001, "server shutdown");
    await new Promise<void>((resolve) => this.wss?.close(() => resolve()));
    this.sockets.clear();
  }

  private onConnection(ws: WebSocket): void {
    const meta = { address: undefined as string | undefined };
    this.sockets.set(ws, meta);
    const peerKey = (): string => (ws as unknown as { remoteAddress?: string }).remoteAddress ?? "anon";

    ws.on("message", (data) => {
      try {
        if (!this.limiter.allow(meta.address ?? peerKey())) {
          ws.send(JSON.stringify({ type: "error", reason: "rate limited" }));
          return;
        }
        const raw = parseFrame(data.toString());
        const msg = validateMessage(raw);

        // Binding: first frame registers the sender's address. Address format checked by schema? — check loose.
        if (!/^(0x[a-fA-F0-9]{40}|[a-z0-9_-]{3,64})$/.test(msg.from)) throw new Error("Invalid sender address");
        if (!meta.address) {
          meta.address = msg.from.toLowerCase();
          this.registry.register(meta.address, ws);
          this.opts.log?.(`[signaling] registered ${meta.address}`);
        } else if (meta.address !== msg.from.toLowerCase()) {
          throw new Error("Sender address mismatch after registration");
        }

        // Registration frames (presence with from === to) only bind the address.
        if (msg.type === "presence" && msg.from.toLowerCase() === msg.to.toLowerCase()) return;

        // Route to addressee (no persistence; undeliverable frames are dropped —
        // senders fall back to IPFS CID delivery for offline peers).
        const frame = JSON.stringify(msg);
        const delivered = this.registry.route(msg.to, frame);
        if (!delivered && (msg.type === "offer" || msg.type === "answer" || msg.type === "ice")) {
          ws.send(JSON.stringify({ type: "ack", from: "signaling", to: meta.address, room: msg.room, payload: { of: msg.type, delivered: false }, ts: Date.now() }));
        }
      } catch (e) {
        this.opts.log?.(`[signaling] rejected frame: ${(e as Error).message}`);
        try { ws.send(JSON.stringify({ type: "error", reason: (e as Error).message })); } catch { /* ignore */ }
      }
    });

    ws.on("close", () => {
      if (meta.address) this.registry.unregister(meta.address, ws);
      this.limiter.drop(meta.address ?? peerKey());
      this.sockets.delete(ws);
    });
    ws.on("error", () => { /* handled by close */ });
  }

  /** Test helper: number of registered addresses. */
  get registeredCount(): number {
    return this.registry.size;
  }
}
