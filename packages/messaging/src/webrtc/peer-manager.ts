import {
  ACK_TIMEOUT_MS,
  MAX_RETRIES,
  RECONNECT_BASE_MS,
  RECONNECT_MAX_MS,
} from "@chainsphere/shared";
import type { SignalingTransport, SignalWireMessage } from "./transport";

export type ChannelState = "idle" | "connecting" | "connected" | "reconnecting" | "failed";

export interface PeerMessage {
  kind: "envelope" | "ack" | "receipt";
  id: string;
  data: unknown;
}

export interface PeerConnectionHandlers {
  onEnvelope?: (from: string, msgId: string, data: unknown) => void;
  onStateChange?: (peer: string, state: ChannelState) => void;
  onAck?: (msgId: string) => void;
}

interface PendingSend {
  msgId: string;
  resolve: (ok: boolean) => void;
  timer: ReturnType<typeof setTimeout>;
}

const RTC_CONFIG_PLACEHOLDER = undefined;

/**
 * WebRTC DataChannel manager.
 * - offer/answer/ICE via a SignalingTransport (transport routes setup data only)
 * - ack + timeout + bounded retry + duplicate detection
 * - bounded exponential backoff reconnect
 * - caller-injected RTCPeerConnection factory so tests run in Node (no WebRTC) with a stub,
 *   while the browser uses the real RTCPeerConnection. No crypto here — payloads are pre-encrypted.
 */
export type PeerConnectionFactory = (config?: RTCConfiguration) => RTCPeerConnection;

export class PeerManager {
  private pcs = new Map<string, RTCPeerConnection>();
  private channels = new Map<string, RTCDataChannel>();
  private states = new Map<string, ChannelState>();
  private attempts = new Map<string, number>();
  private seenIds = new Set<string>();
  private pending = new Map<string, PendingSend>();
  private unsubMsg?: () => void;
  private makingOffer = new Set<string>();
  private readonly ackTimeoutMs: number;
  private readonly maxRetries: number;
  private readonly backoffBaseMs: number;

  constructor(
    private selfId: string,
    private transport: SignalingTransport,
    private handlers: PeerConnectionHandlers = {},
    private pcFactory: PeerConnectionFactory | undefined = undefined,
    private rtcConfig: RTCConfiguration | undefined = undefined,
    opts: { ackTimeoutMs?: number; maxRetries?: number; backoffBaseMs?: number } = {}
  ) {
    this.ackTimeoutMs = opts.ackTimeoutMs ?? ACK_TIMEOUT_MS;
    this.maxRetries = opts.maxRetries ?? MAX_RETRIES;
    this.backoffBaseMs = opts.backoffBaseMs ?? RECONNECT_BASE_MS;
  }

  async start(): Promise<void> {
    if (!this.transport.connected) await this.transport.connect();
    this.unsubMsg = this.transport.onMessage((m) => this.handleSignal(m));
  }

  stop(): void {
    this.unsubMsg?.();
    for (const [, t] of this.pending) { clearTimeout(t.timer); t.resolve(false); }
    this.pending.clear();
    for (const [, ch] of this.channels) ch.close();
    for (const [, pc] of this.pcs) pc.close();
    this.pcs.clear(); this.channels.clear();
  }

  state(peer: string): ChannelState {
    return this.states.get(peer) ?? "idle";
  }

  private setState(peer: string, s: ChannelState): void {
    if (this.states.get(peer) === s) return;
    this.states.set(peer, s);
    this.handlers.onStateChange?.(peer, s);
  }

  private makePc(peer: string): RTCPeerConnection {
    const existing = this.pcs.get(peer);
    if (existing) return existing;
    const factory = this.pcFactory ?? ((c?: RTCConfiguration) => new RTCPeerConnection(c ?? RTC_CONFIG_PLACEHOLDER ?? this.rtcConfig ?? { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] }));
    const pc = factory();
    this.pcs.set(peer, pc);
    this.setState(peer, "connecting");

    pc.onicecandidate = (ev) => {
      if (ev.candidate) this.sendSignal(peer, { type: "ice", payload: ev.candidate.toJSON() });
    };
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === "connected") { this.setState(peer, "connected"); this.attempts.set(peer, 0); }
      else if (s === "failed" || s === "disconnected") void this.reconnect(peer);
      else if (s === "closed") this.setState(peer, "idle");
    };
    pc.ondatachannel = (ev) => this.attachChannel(peer, ev.channel);
    return pc;
  }

  private attachChannel(peer: string, ch: RTCDataChannel): void {
    this.channels.set(peer, ch);
    ch.onopen = () => { this.setState(peer, "connected"); this.attempts.set(peer, 0); };
    ch.onclose = () => this.setState(peer, "reconnecting");
    ch.onerror = () => this.setState(peer, "failed");
    ch.onmessage = (ev) => this.onChannelMessage(peer, String(ev.data));
  }

  private onChannelMessage(peer: string, raw: string): void {
    let msg: PeerMessage;
    try { msg = JSON.parse(raw) as PeerMessage; } catch { return; }
    if (msg.id && this.seenIds.has(msg.id)) return; // duplicate detection
    if (msg.id) this.seenIds.add(msg.id);
    if (msg.kind === "ack") {
      const p = this.pending.get(msg.id);
      if (p) { clearTimeout(p.timer); this.pending.delete(msg.id); p.resolve(true); this.handlers.onAck?.(msg.id); }
      return;
    }
    if (msg.kind === "receipt") { this.handlers.onAck?.(msg.id); return; }
    if (msg.kind === "envelope") {
      this.handlers.onEnvelope?.(msg.id, msg.id, msg.data);
      // ack back
      this.sendRaw(peer, { kind: "ack", id: msg.id, data: null });
    }
  }

  private sendSignal(peer: string, partial: { type: SignalWireMessage["type"]; payload: unknown }): void {
    this.transport.send({ type: partial.type, from: this.selfId, to: peer, room: peer, payload: partial.payload, ts: Date.now() });
  }

  private async handleSignal(m: SignalWireMessage): Promise<void> {
    if (m.to !== this.selfId) return;
    const peer = m.from;
    try {
      if (m.type === "offer") {
        const pc = this.makePc(peer);
        await pc.setRemoteDescription(m.payload as RTCSessionDescriptionInit);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.sendSignal(peer, { type: "answer", payload: pc.localDescription });
      } else if (m.type === "answer") {
        const pc = this.pcs.get(peer);
        if (pc && pc.signalingState === "have-local-offer") await pc.setRemoteDescription(m.payload as RTCSessionDescriptionInit);
      } else if (m.type === "ice") {
        const pc = this.makePc(peer);
        await pc.addIceCandidate(m.payload as RTCIceCandidateInit);
      }
    } catch { /* malformed signal ignored (defense against bad peers) */ }
  }

  /** Create an outbound DataChannel and negotiate (glare-safe via perfect-negotiation-lite: only caller offers). */
  async connect(peer: string): Promise<void> {
    if (this.channels.get(peer)?.readyState === "open") return;
    if (this.makingOffer.has(peer)) return;
    this.makingOffer.add(peer);
    try {
      const pc = this.makePc(peer);
      const ch = pc.createDataChannel("chainsphere", { ordered: true });
      this.attachChannel(peer, ch);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.sendSignal(peer, { type: "offer", payload: pc.localDescription });
    } finally {
      this.makingOffer.delete(peer);
    }
  }

  private sendRaw(peer: string, msg: PeerMessage): boolean {
    const ch = this.channels.get(peer);
    if (!ch || ch.readyState !== "open") return false;
    const str = JSON.stringify(msg);
    if (str.length > 64 * 1024) return false; // bounded frame; large payloads go via IPFS CID path
    ch.send(str);
    return true;
  }

  /**
   * Send with ack + retry. Resolves true when recipient acks, false on timeout/failure.
   * On false, the caller falls back to IPFS CID delivery.
   */
  async sendEnvelope(peer: string, msgId: string, data: unknown): Promise<boolean> {
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const delivered = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => { this.pending.delete(msgId); resolve(false); }, this.ackTimeoutMs);
        this.pending.set(msgId, { msgId, resolve, timer });
        if (!this.sendRaw(peer, { kind: "envelope", id: msgId, data })) {
          clearTimeout(timer); this.pending.delete(msgId); resolve(false);
        }
      });
      if (delivered) return true;
      if (attempt < this.maxRetries) {
        const delay = Math.min(this.backoffBaseMs * 2 ** attempt, RECONNECT_MAX_MS);
        await new Promise((r) => setTimeout(r, delay));
        await this.connect(peer);
      }
    }
    return false;
  }

  private async reconnect(peer: string): Promise<void> {
    const n = (this.attempts.get(peer) ?? 0) + 1;
    this.attempts.set(peer, n);
    if (n > this.maxRetries) { this.setState(peer, "failed"); return; }
    this.setState(peer, "reconnecting");
    const delay = Math.min(this.backoffBaseMs * 2 ** (n - 1), RECONNECT_MAX_MS);
    await new Promise((r) => setTimeout(r, delay));
    const old = this.pcs.get(peer);
    old?.close();
    this.pcs.delete(peer);
    this.channels.delete(peer);
    await this.connect(peer);
  }
}
