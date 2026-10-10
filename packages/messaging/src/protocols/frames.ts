import type { MessageEnvelope } from "@chainsphere/shared";
import { envelopeSchema } from "@chainsphere/shared";

/** Wire protocol for DataChannel frames: envelope delivery + acks + receipts. */
export type WireFrame =
  | { kind: "envelope"; envelope: MessageEnvelope }
  | { kind: "ack"; messageId: string }
  | { kind: "receipt"; messageId: string; status: "delivered" | "read" };

export function serializeFrame(frame: WireFrame): string {
  if (frame.kind === "envelope") {
    const parsed = envelopeSchema.safeParse(frame.envelope);
    if (!parsed.success) throw new Error("Refusing to send malformed envelope");
    return JSON.stringify({ kind: "envelope", envelope: frame.envelope });
  }
  return JSON.stringify(frame);
}

export function parseFrame(raw: string): WireFrame {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    throw new Error("Malformed wire frame: not JSON");
  }
  const o = obj as Record<string, unknown>;
  if (o.kind === "ack" && typeof o.messageId === "string") return { kind: "ack", messageId: o.messageId };
  if (o.kind === "receipt" && typeof o.messageId === "string") {
    if (o.status !== "delivered" && o.status !== "read") throw new Error("Invalid receipt status");
    return { kind: "receipt", messageId: o.messageId, status: o.status };
  }
  if (o.kind === "envelope" && o.envelope) {
    const parsed = envelopeSchema.safeParse(o.envelope);
    if (!parsed.success) throw new Error("Malformed envelope frame: " + parsed.error.issues[0]?.message);
    return { kind: "envelope", envelope: parsed.data as MessageEnvelope };
  }
  throw new Error("Unknown wire frame kind");
}
