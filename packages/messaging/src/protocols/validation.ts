import { MAX_MESSAGE_CHARS, MAX_FILE_BYTES } from "@chainsphere/shared";
import type { MessageEnvelope } from "@chainsphere/shared";
import { envelopeSchema } from "@chainsphere/shared";

/** Wire-level validation for message payloads before they touch decrypt/decrypt handlers. */
export function validateEnvelopePayload(raw: unknown): MessageEnvelope {
  if (typeof raw === "string") throw new Error("Envelope must be an object");
  const parsed = envelopeSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Invalid envelope: " + parsed.error.issues[0]?.message);
  return parsed.data as MessageEnvelope;
}

export function validateTextLength(text: string): void {
  if (text.length === 0) throw new Error("Empty message");
  if (text.length > MAX_MESSAGE_CHARS) throw new Error(`Message exceeds ${MAX_MESSAGE_CHARS} characters`);
}

export function validateFileSize(size: number): void {
  if (size === 0) throw new Error("Empty file");
  if (size > MAX_FILE_BYTES) throw new Error(`File exceeds ${MAX_FILE_BYTES} bytes limit`);
}
