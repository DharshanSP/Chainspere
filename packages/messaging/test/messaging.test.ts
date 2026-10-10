import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Address, MessageEnvelope } from "@chainsphere/shared";
import { PeerManager } from "../src/webrtc/peer-manager";
import { InMemoryTransport, validateSignalMessage } from "../src/webrtc/transport";
import { DeliveryQueue } from "../src/delivery/delivery-queue";
import { validateEnvelopePayload, validateFileSize, validateTextLength } from "../src/protocols/validation";
import { FakePeerConnection, resetRegistry } from "./fake-webrtc";

const A = "0xaaaa";
const B = "0xbbbb";

function envelopeFixture(id: string): MessageEnvelope {
  const from = ("0x" + "1".repeat(40)) as Address;
  const to = ("0x" + "2".repeat(40)) as Address;
  return {
    v: 1, id, from, to,
    groupId: null, keyVersion: 1, iv: "aXY=", ciphertext: "Y3Q=", wrappedKeys: [
      { recipient: to, ephemPub: "ZWY=", wrappedKey: "d3I=", iv: "aXY=" },
    ], timestamp: Date.now(), contentType: "text", digest: "ab".repeat(32),
  };
}

describe("signaling validation", () => {
  it("accepts valid, rejects malformed", () => {
    expect(() => validateSignalMessage({ type: "offer", from: A, to: B, room: B, payload: {}, ts: 1 })).not.toThrow();
    expect(() => validateSignalMessage({ type: "hack", from: A })).toThrow(/Invalid/);
    expect(() => validateSignalMessage({ type: "offer", from: A, to: B, room: "r", payload: null, ts: 1 })).not.toThrow();
  });
});

describe("protocol validation", () => {
  it("validates envelope schema", () => {
    expect(() => validateEnvelopePayload(envelopeFixture("m1"))).not.toThrow();
    expect(() => validateEnvelopePayload({ ...envelopeFixture("m2"), v: 2 })).toThrow(/Invalid/);
    expect(() => validateEnvelopePayload({ ...envelopeFixture("m3"), digest: "short" })).toThrow(/Invalid/);
  });
  it("validates text and file limits", () => {
    expect(() => validateTextLength("hi")).not.toThrow();
    expect(() => validateTextLength("")).toThrow(/Empty/);
    expect(() => validateTextLength("x".repeat(9000))).toThrow(/exceeds/);
    expect(() => validateFileSize(100)).not.toThrow();
    expect(() => validateFileSize(30 * 1024 * 1024)).toThrow(/exceeds/);
  });
});

describe("PeerManager over simulated WebRTC", () => {
  let ta: InMemoryTransport, tb: InMemoryTransport;
  let pa: PeerManager, pb: PeerManager;
  let bReceived: Array<{ from: string; msgId: string; data: unknown }>;

  beforeEach(async () => {
    resetRegistry();
    ta = new InMemoryTransport(A);
    tb = new InMemoryTransport(B);
    InMemoryTransport.pair(ta, tb);
    bReceived = [];
    const factory = () => new FakePeerConnection() as unknown as RTCPeerConnection;
    pb = new PeerManager(B, tb, {
      onEnvelope: (from, msgId, data) => bReceived.push({ from, msgId, data }),
    }, factory, undefined, { ackTimeoutMs: 300, maxRetries: 2, backoffBaseMs: 50 });
    pa = new PeerManager(A, ta, {}, factory, undefined, { ackTimeoutMs: 300, maxRetries: 2, backoffBaseMs: 50 });
    await pb.start();
    await pa.start();
  });

  afterEach(() => { pa.stop(); pb.stop(); });

  it("connects and reports channel state", async () => {
    await pa.connect(B);
    await new Promise((r) => setTimeout(r, 60));
    expect(pa.state(B)).toBe("connected");
    expect(pb.state(A)).toBe("connected");
  });

  it("delivers envelope with ack", async () => {
    await pa.connect(B);
    await new Promise((r) => setTimeout(r, 60));
    const ok = await pa.sendEnvelope(B, "m-1", envelopeFixture("m-1"));
    await new Promise((r) => setTimeout(r, 40));
    expect(ok).toBe(true);
    expect(bReceived).toHaveLength(1);
    expect(bReceived[0].msgId).toBe("m-1");
  });

  it("deduplicates replayed envelopes", async () => {
    await pa.connect(B);
    await new Promise((r) => setTimeout(r, 60));
    const raw = JSON.stringify({ kind: "envelope", id: "dup-1", data: envelopeFixture("dup-1") });
    const ch = (pa as unknown as { channels: Map<string, RTCDataChannel> }).channels.get(B);
    ch!.send(raw);
    ch!.send(raw); // duplicate frame
    await new Promise((r) => setTimeout(r, 40));
    expect(bReceived).toHaveLength(1);
  });

  it("fails to unreachable peer (no transport peer) and returns false", async () => {
    const lonelyT = new InMemoryTransport("0xdead");
    const factory = () => new FakePeerConnection() as unknown as RTCPeerConnection;
    const lonely = new PeerManager("0xdead", lonelyT, {}, factory, undefined, { ackTimeoutMs: 100, maxRetries: 1, backoffBaseMs: 20 });
    await lonely.start();
    const ok = await lonely.sendEnvelope("0xnowhere", "m-x", envelopeFixture("m-x"));
    expect(ok).toBe(false);
    lonely.stop();
  });
});

describe("DeliveryQueue", () => {
  it("retries until delivered, then marks sent", async () => {
    let calls = 0;
    const statuses: string[] = [];
    const q = new DeliveryQueue({
      maxAttempts: 4,
      deliver: async () => { calls += 1; return calls >= 2; },
      onStatus: (_e, s) => statuses.push(s),
      backoffBaseMs: 30,
      backoffMaxMs: 60,
      tickIntervalMs: 40,
    });
    q.enqueue(B, envelopeFixture("q-1"));
    await new Promise((r) => setTimeout(r, 700));
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(statuses).toContain("sent");
    expect(q.size()).toBe(0);
    q.stop();
  });

  it("marks failed after max attempts", async () => {
    const statuses: string[] = [];
    const q = new DeliveryQueue({
      maxAttempts: 2,
      deliver: async () => false,
      onStatus: (_e, s) => statuses.push(s),
      backoffBaseMs: 20,
      backoffMaxMs: 40,
      tickIntervalMs: 30,
    });
    q.enqueue(B, envelopeFixture("q-2"));
    await new Promise((r) => setTimeout(r, 500));
    expect(statuses).toContain("failed");
    q.stop();
  });
});
