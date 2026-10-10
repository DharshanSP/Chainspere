import { signalMessageSchema } from "@chainsphere/shared";

/** Signaling transport interface — swap WebSocket for decentralized transport later. */
export interface SignalWireMessage {
  type: "offer" | "answer" | "ice" | "ack" | "presence" | "envelope" | "receipt";
  from: string;
  to: string;
  room: string;
  payload: unknown;
  ts: number;
}

export interface SignalingTransport {
  connect(): Promise<void>;
  disconnect(): void;
  readonly connected: boolean;
  send(msg: SignalWireMessage): void;
  onMessage(cb: (msg: SignalWireMessage) => void): () => void;
  onStatus(cb: (connected: boolean) => void): () => void;
}

export function validateSignalMessage(raw: unknown): SignalWireMessage {
  const parsed = signalMessageSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Invalid signaling message: " + parsed.error.issues[0]?.message);
  return parsed.data as SignalWireMessage;
}

/** In-memory transport for tests + local demo fallback. Routes by `to`; stores nothing. */
export class InMemoryTransport implements SignalingTransport {
  private peers = new Set<InMemoryTransport>();
  private msgCbs = new Set<(m: SignalWireMessage) => void>();
  private statusCbs = new Set<(c: boolean) => void>();
  connected = false;
  /** Artificial latency for tests. */
  constructor(public readonly id: string = "anon", public latencyMs = 0) {}
  static pair(a: InMemoryTransport, b: InMemoryTransport): void {
    a.peers.add(b); b.peers.add(a);
  }
  async connect(): Promise<void> {
    this.connected = true;
    this.statusCbs.forEach((c) => c(true));
  }
  disconnect(): void {
    this.connected = false;
    this.statusCbs.forEach((c) => c(false));
  }
  send(msg: SignalWireMessage): void {
    validateSignalMessage(msg);
    for (const p of this.peers) {
      if (p.id !== msg.to) continue; // route only to addressed peer
      const deliver = () => p.msgCbs.forEach((c) => c(msg));
      if (this.latencyMs > 0) setTimeout(deliver, this.latencyMs);
      else deliver();
    }
  }
  onMessage(cb: (msg: SignalWireMessage) => void): () => void {
    this.msgCbs.add(cb);
    return () => { this.msgCbs.delete(cb); };
  }
  onStatus(cb: (connected: boolean) => void): () => void {
    this.statusCbs.add(cb);
    return () => { this.statusCbs.delete(cb); };
  }
}
