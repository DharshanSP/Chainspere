import type { MessageEnvelope, WrappedKey } from "@chainsphere/shared";
import { envelopeSchema, MAX_MESSAGE_CHARS } from "@chainsphere/shared";
import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  b64decode,
  b64encode,
  envelopeAad,
  randomBytes,
  sha256Hex,
  text,
  unwrapKeyForRecipient,
  wrapKeyForRecipient,
  type KeyPair,
} from "../encryption/primitives";

export interface RecipientKey {
  id: string; // wallet address (lowercased) — matches WrappedKey.recipient
  publicKeyB64: string;
}

function canonicalBytes(parts: { iv: Uint8Array; ciphertext: Uint8Array; wrapped: WrappedKey[] }): Uint8Array {
  const enc = new TextEncoder();
  const wk = [...parts.wrapped]
    .sort((a, b) => a.recipient.localeCompare(b.recipient))
    .map((w) => `${w.recipient}:${w.ephemPub}:${w.iv}:${w.wrappedKey}`)
    .join(";");
  const head = enc.encode(`${b64encode(parts.iv)}.${b64encode(parts.ciphertext)}|${wk}`);
  return head;
}

export interface EncryptArgs {
  id: string;
  from: `0x${string}`;
  to: `0x${string}` | null;
  groupId: string | null;
  keyVersion: number;
  timestamp?: number;
  contentType?: "text" | "file";
  fileName?: string;
  fileMime?: string;
  recipients: RecipientKey[]; // authorized recipients (+sender for self-read)
  senderKeyPair?: KeyPair; // not needed for ECDH-ephemeral scheme; kept for API compat
  groupKey?: Uint8Array; // if provided (group), wrap this key instead of random one
}

/** Encrypt plaintext bytes for the authorized recipients. Returns a versioned envelope. */
export async function encryptEnvelope(plaintext: Uint8Array, args: EncryptArgs): Promise<MessageEnvelope> {
  if (args.recipients.length === 0) throw new Error("At least one recipient required");
  if (plaintext.length > 32 * 1024 * 1024) throw new Error("Payload exceeds 32 MiB envelope limit");
  const timestamp = args.timestamp ?? Date.now();
  const aad = envelopeAad({ id: args.id, from: args.from, to: args.to, groupId: args.groupId, keyVersion: args.keyVersion, timestamp });
  const messageKey = args.groupKey ? new Uint8Array(args.groupKey) : randomBytes(32);
  if (messageKey.length !== 32) throw new Error("Message/group key must be 32 bytes");
  const { iv, ciphertext } = await aesGcmEncrypt(messageKey, plaintext, aad);
  const wrappedKeys: WrappedKey[] = [];
  for (const r of args.recipients) {
    const w = await wrapKeyForRecipient(messageKey, r.publicKeyB64, aad);
    wrappedKeys.push({ recipient: r.id.toLowerCase(), ephemPub: w.ephemPubB64, wrappedKey: w.wrappedKeyB64, iv: w.ivB64 });
  }
  // Ephemeral message keys are zeroed by GC scope; caller should zero groupKey copies they own if needed.
  const digest = await sha256Hex(canonicalBytes({ iv, ciphertext, wrapped: wrappedKeys }));
  return {
    v: 1,
    id: args.id,
    from: args.from,
    to: args.to,
    groupId: args.groupId,
    keyVersion: args.keyVersion,
    iv: b64encode(iv),
    ciphertext: b64encode(ciphertext),
    wrappedKeys,
    timestamp,
    contentType: args.contentType ?? "text",
    fileName: args.fileName,
    fileMime: args.fileMime,
    digest,
  };
}

export async function encryptText(plain: string, args: EncryptArgs): Promise<MessageEnvelope> {
  if (plain.length > MAX_MESSAGE_CHARS) throw new Error(`Message exceeds ${MAX_MESSAGE_CHARS} chars`);
  return encryptEnvelope(text().encode(plain), args);
}

/** Decrypt an envelope with the recipient's private key. Validates version, digest, AAD auth. */
export async function decryptEnvelope(
  env: MessageEnvelope,
  recipientId: string,
  recipientPriv: CryptoKey
): Promise<Uint8Array> {
  const parsed = envelopeSchema.safeParse(env);
  if (!parsed.success) throw new Error("Malformed envelope: " + parsed.error.issues[0]?.message);
  const e = parsed.data;
  const wk = e.wrappedKeys.find((w) => w.recipient.toLowerCase() === recipientId.toLowerCase());
  if (!wk) throw new Error("No wrapped key for this recipient — unauthorized");
  const aad = envelopeAad({ id: e.id, from: e.from, to: e.to, groupId: e.groupId, keyVersion: e.keyVersion, timestamp: e.timestamp });
  // Verify digest BEFORE decrypt (tamper detection + commitment check).
  const recomputed = await sha256Hex(
    canonicalBytes({ iv: b64decode(e.iv), ciphertext: b64decode(e.ciphertext), wrapped: e.wrappedKeys as WrappedKey[] })
  );
  if (recomputed.toLowerCase() !== e.digest.toLowerCase()) throw new Error("Digest mismatch: envelope tampered");
  const messageKey = await unwrapKeyForRecipient(recipientPriv, wk.ephemPub, wk.wrappedKey, wk.iv, aad);
  if (messageKey.length !== 32) throw new Error("Unwrapped key has invalid length");
  return aesGcmDecrypt(messageKey, b64decode(e.iv), b64decode(e.ciphertext), aad);
}

export async function decryptText(env: MessageEnvelope, recipientId: string, recipientPriv: CryptoKey): Promise<string> {
  const bytes = await decryptEnvelope(env, recipientId, recipientPriv);
  return text().decode(bytes);
}

/** Verify envelope integrity against an anchored digest (e.g. from MessageAnchor). */
export async function verifyDigest(env: MessageEnvelope, expectedDigestHex: string): Promise<boolean> {
  const recomputed = await sha256Hex(
    canonicalBytes({ iv: b64decode(env.iv), ciphertext: b64decode(env.ciphertext), wrapped: env.wrappedKeys })
  );
  return recomputed.toLowerCase() === expectedDigestHex.toLowerCase();
}

export function newMessageIdHex(): string {
  const b = randomBytes(16);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}
