import { afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { SignalingServer } from "../src/transports/websocket";

const A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function frame(from: string, to: string, type = "offer", payload: unknown = { sdp: "x" }) {
  return JSON.stringify({ type, from, to, room: [from, to].sort().join(":"), payload, ts: Date.now() });
}

function registerFrame(from: string): string {
  return JSON.stringify({ type: "presence", from, to: from, room: "register", payload: { action: "register" }, ts: Date.now() });
}

function connectClient(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.once("open", () => resolve(ws));
    ws.once("error", reject);
  });
}

function nextMessage(ws: WebSocket, timeoutMs = 3000): Promise<any> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout waiting for message")), timeoutMs);
    ws.once("message", (d) => { clearTimeout(t); resolve(JSON.parse(d.toString())); });
  });
}

describe("SignalingServer", () => {
  let server: SignalingServer;
  const port = 18090;

  beforeEach(async () => {
    server = new SignalingServer({ port });
    await server.start();
  });
  afterEach(async () => { await server.stop(); });

  it("routes offer between registered peers", async () => {
    const a = await connectClient(port);
    const b = await connectClient(port);
    a.send(registerFrame(A));
    b.send(registerFrame(B));
    await new Promise((r) => setTimeout(r, 50));
    const bWait = nextMessage(b);
    a.send(frame(A, B, "offer"));
    const got = await bWait;
    expect(got.type).toBe("offer");
    expect(got.from).toBe(A);
    expect(server.registeredCount).toBe(2);
    a.close(); b.close();
  });

  it("rejects malformed frames", async () => {
    const a = await connectClient(port);
    a.send(registerFrame(A));
    const errWait = nextMessage(a);
    a.send("not-json");
    const e1 = await errWait;
    expect(e1.type).toBe("error");
    const errWait2 = nextMessage(a);
    a.send(JSON.stringify({ type: "hack", from: A, to: B, room: "r", payload: {}, ts: 1 }));
    const e2 = await errWait2;
    expect(e2.type).toBe("error");
    a.close();
  });

  it("rejects sender address spoofing after registration", async () => {
    const a = await connectClient(port);
    a.send(registerFrame(A));
    await new Promise((r) => setTimeout(r, 50));
    const errWait = nextMessage(a);
    a.send(frame("0xcccccccccccccccccccccccccccccccccccccccc", B));
    const e = await errWait;
    expect(e.type).toBe("error");
    expect(e.reason).toMatch(/mismatch/);
    a.close();
  });

  it("drops undeliverable setup frames with ack(delivered:false)", async () => {
    const a = await connectClient(port);
    a.send(registerFrame(A));
    const ackWait = nextMessage(a);
    a.send(frame(A, B)); // B offline
    const ack = await ackWait;
    expect(ack.type).toBe("ack");
    expect(ack.payload.delivered).toBe(false);
    a.close();
  });

  it("does not retain routed payloads (no history storage)", async () => {
    const a = await connectClient(port);
    const b = await connectClient(port);
    a.send(registerFrame(A));
    b.send(registerFrame(B));
    await new Promise((r) => setTimeout(r, 50));
    const bWait = nextMessage(b);
    a.send(frame(A, B));
    await bWait;
    b.close();
    // after B disconnects, replays get delivered:false — nothing queued/stored
    const ackWait = nextMessage(a);
    a.send(frame(A, B));
    const ack = await ackWait;
    expect(ack.payload.delivered).toBe(false);
    a.close();
  });
});
