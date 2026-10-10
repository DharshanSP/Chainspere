/**
 * Minimal RTCPeerConnection/RTCDataChannel simulation for Node tests.
 * Pairs peers by sdp id embedded in offer/answer — exercises PeerManager logic
 * (offer/answer, ICE, channel open, message framing, acks) without a real browser.
 * Real browser WebRTC is exercised by the app; this validates our manager logic.
 */

const registry = new Map<string, FakePeerConnection>();

function genId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export class FakeDataChannel {
  readyState: RTCDataChannelState = "connecting";
  onopen: ((ev: Event) => void) | null = null;
  onclose: ((ev: Event) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  counterpart?: FakeDataChannel;

  constructor(public label: string) {}

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    if (this.readyState !== "open") throw new Error("Channel not open");
    const peer = this.counterpart;
    if (!peer) return;
    // async delivery like real RTC
    setTimeout(() => peer.onmessage?.({ data } as MessageEvent), 1);
  }

  close(): void {
    if (this.readyState === "closed") return;
    this.readyState = "closed";
    this.onclose?.(new Event("close"));
  }

  open(): void {
    if (this.readyState === "open") return;
    this.readyState = "open";
    this.onopen?.(new Event("open"));
  }
}

export class FakePeerConnection {
  connectionState: RTCPeerConnectionState = "new";
  signalingState: RTCSignalingState = "stable";
  localDescription: RTCSessionDescription | null = null;
  remoteDescription: RTCSessionDescription | null = null;
  onicecandidate: ((ev: RTCPeerConnectionIceEvent) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  ondatachannel: ((ev: RTCDataChannelEvent) => void) | null = null;
  channels: FakeDataChannel[] = [];
  id = genId();

  constructor(public config?: RTCConfiguration) {
    registry.set(this.id, this);
  }

  createDataChannel(label: string): RTCDataChannel {
    const ch = new FakeDataChannel(label);
    this.channels.push(ch);
    return ch as unknown as RTCDataChannel;
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    return { type: "offer", sdp: `v=0\r\no=- ${this.id} 0 IN IP4 127.0.0.1\r\n` };
  }

  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    return { type: "answer", sdp: `v=0\r\no=- ${this.id} 0 IN IP4 127.0.0.1\r\n` };
  }

  async setLocalDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription = { type: desc.type!, sdp: desc.sdp! } as RTCSessionDescription;
    this.signalingState = desc.type === "offer" ? "have-local-offer" : "stable";
    const cand = { candidate: "candidate:1 1 udp 1 127.0.0.1 1 typ host", sdpMid: "0", sdpMLineIndex: 0, toJSON: () => ({ candidate: "candidate:1 1 udp 1 127.0.0.1 1 typ host", sdpMid: "0", sdpMLineIndex: 0 }) };
    this.onicecandidate?.({ candidate: cand as unknown as RTCIceCandidate } as RTCPeerConnectionIceEvent);
    this.onicecandidate?.({ candidate: null } as RTCPeerConnectionIceEvent);
  }

  async setRemoteDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    this.remoteDescription = { type: desc.type!, sdp: desc.sdp! } as RTCSessionDescription;
    const remoteId = /o=- (\w+) 0/.exec(desc.sdp ?? "")?.[1];
    const other = remoteId ? registry.get(remoteId) : undefined;
    this.signalingState = "stable";
    if (desc.type === "offer" && other) this.pair(other);
    if (desc.type === "answer" && other) this.pair(other);
    this.connectionState = "connected";
    this.onconnectionstatechange?.();
  }

  private pair(other: FakePeerConnection): void {
    // link this pc's channels with the other pc's channels
    if (this.channels.length > 0 && other.channels.length > 0) {
      const a = this.channels[0];
      const b = other.channels[0];
      a.counterpart = b;
      b.counterpart = a;
      setTimeout(() => { b.open(); a.open(); }, 2);
    } else if (other.channels.length > 0 && this.channels.length === 0) {
      // answerer receives remote channel via ondatachannel
      const remoteCh = other.channels[0];
      const local = new FakeDataChannel(remoteCh.label);
      local.counterpart = remoteCh;
      remoteCh.counterpart = local;
      this.channels.push(local);
      setTimeout(() => {
        this.ondatachannel?.({ channel: local } as unknown as RTCDataChannelEvent);
        local.open(); remoteCh.open();
      }, 2);
    }
  }

  async addIceCandidate(_c: RTCIceCandidateInit): Promise<void> { /* no-op in sim */ }

  close(): void {
    this.connectionState = "closed";
    for (const ch of this.channels) ch.close();
    registry.delete(this.id);
    this.onconnectionstatechange?.();
  }
}

export function resetRegistry(): void { registry.clear(); }
