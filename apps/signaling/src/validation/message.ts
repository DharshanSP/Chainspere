import { signalMessageSchema } from "@chainsphere/shared";

export const MAX_FRAME_BYTES = 64 * 1024;
export const MAX_FRAMES_PER_SEC = 60;

/** Parse + validate an incoming frame. Throws on anything unexpected — never trusts clients. */
export function parseFrame(raw: string | Buffer): unknown {
  if (typeof raw !== "string" && !Buffer.isBuffer(raw)) throw new Error("Unsupported frame type");
  const text = typeof raw === "string" ? raw : raw.toString("utf8");
  if (Buffer.byteLength(text, "utf8") > MAX_FRAME_BYTES) throw new Error("Frame too large");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON");
  }
  return json;
}

export function validateMessage(raw: unknown) {
  const parsed = signalMessageSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Schema validation failed");
  const m = parsed.data;
  // Signaling only routes WebRTC setup frames + presence. Envelope/receipt types are
  // allowed as opaque routing metadata (ciphertext only — server cannot decrypt).
  if (m.type === "offer" || m.type === "answer" || m.type === "ice") {
    if (typeof m.payload !== "object" || m.payload === null) throw new Error("Invalid signaling payload");
  }
  if (m.from === "" || m.to === "") throw new Error("Invalid routing addresses");
  // `from === to` is only valid as an explicit registration frame (presence).
  if (m.from === m.to && m.type !== "presence") throw new Error("Invalid routing addresses");
  return m;
}

export class RateLimiter {
  private buckets = new Map<string, { count: number; resetAt: number }>();
  allow(id: string): boolean {
    const now = Date.now();
    const b = this.buckets.get(id);
    if (!b || now > b.resetAt) {
      this.buckets.set(id, { count: 1, resetAt: now + 1000 });
      return true;
    }
    b.count += 1;
    return b.count <= MAX_FRAMES_PER_SEC;
  }
  drop(id: string): void {
    this.buckets.delete(id);
  }
}
