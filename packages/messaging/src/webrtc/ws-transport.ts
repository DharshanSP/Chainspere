import type { SignalingTransport, SignalWireMessage } from "./transport";
import { validateSignalMessage } from "./transport";

/**
 * Browser/Node WebSocket signaling transport.
 * Connects to the lightweight signaling server (or any endpoint implementing the same
 * frame protocol). The server only routes setup frames — it holds no chat plaintext.
 */
export class WebSocketTransport implements SignalingTransport {
  private ws: WebSocket | null = null;
  private msgCbs = new Set<(m: SignalWireMessage) => void>();
  private statusCbs = new Set<(c: boolean) => void>();
  private _connected = false;
  private closedByUs = false;

  constructor(private url: string, private selfId?: string) {}

  get connected(): boolean {
    return this._connected;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket(this.url);
        this.ws = ws;
        ws.onopen = () => {
          this._connected = true;
          this.statusCbs.forEach((c) => c(true));
          // Bind our address with the signaling server before routing anything.
          if (this.selfId) {
            ws.send(JSON.stringify({ type: "presence", from: this.selfId, to: this.selfId, room: "register", payload: { action: "register" }, ts: Date.now() }));
          }
          resolve();
        };
        ws.onmessage = (ev) => {
          try {
            const msg = validateSignalMessage(JSON.parse(String(ev.data)));
            this.msgCbs.forEach((cb) => cb(msg));
          } catch { /* drop malformed frames from server/peers */ }
        };
        ws.onerror = () => {
          if (!this._connected) reject(new Error(`Signaling connection failed: ${this.url}`));
        };
        ws.onclose = () => {
          const was = this._connected;
          this._connected = false;
          if (was) this.statusCbs.forEach((c) => c(false));
          if (!this.closedByUs) this.scheduleReconnect();
        };
      } catch (e) {
        reject(e);
      }
    });
  }

  private reconnectAttempt = 0;
  private reconnectTimer?: ReturnType<typeof setTimeout>;

  private scheduleReconnect(): void {
    if (this.closedByUs) return;
    const delay = Math.min(1000 * 2 ** this.reconnectAttempt, 30_000);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      void this.connect().catch(() => this.scheduleReconnect());
    }, delay);
  }

  disconnect(): void {
    this.closedByUs = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this._connected = false;
    this.ws?.close();
    this.ws = null;
  }

  send(msg: SignalWireMessage): void {
    validateSignalMessage(msg);
    if (!this.ws || this.ws.readyState !== 1) {
      // Buffer-less design: callers rely on retry/ack layers.
      return;
    }
    this.ws.send(JSON.stringify(msg));
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
