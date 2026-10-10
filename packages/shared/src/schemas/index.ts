import { z } from "zod";

export const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid wallet address");

export const wrappedKeySchema = z.object({
  recipient: z.string().min(1),
  ephemPub: z.string().min(1),
  wrappedKey: z.string().min(1),
  iv: z.string().min(1),
});

export const envelopeSchema = z.object({
  v: z.literal(1),
  id: z.string().min(1).max(128),
  from: addressSchema,
  to: addressSchema.nullable(),
  groupId: z.string().nullable(),
  keyVersion: z.number().int().min(1),
  iv: z.string().min(1),
  ciphertext: z.string().min(1),
  wrappedKeys: z.array(wrappedKeySchema).min(1).max(256),
  timestamp: z.number().int().positive(),
  contentType: z.enum(["text", "file"]),
  fileName: z.string().max(255).optional(),
  fileMime: z.string().max(127).optional(),
  digest: z.string().regex(/^[0-9a-f]{64}$/i, "digest must be sha256 hex"),
});

export const signalMessageSchema = z.object({
  type: z.enum(["offer", "answer", "ice", "ack", "presence", "envelope", "receipt"]),
  from: z.string().min(1),
  to: z.string().min(1),
  room: z.string().min(1).max(128),
  payload: z.unknown(),
  ts: z.number().int(),
});

export const authChallengeSchema = z.object({
  domain: z.string().min(1),
  uri: z.string().min(1),
  address: addressSchema,
  chainId: z.number().int().positive(),
  nonce: z.string().min(8),
  issuedAt: z.string(),
  expiration: z.string(),
  statement: z.string(),
});
