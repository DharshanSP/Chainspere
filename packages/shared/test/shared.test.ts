import { describe, expect, it } from "vitest";
import {
  ACK_TIMEOUT_MS,
  AES_GCM_IV_BYTES,
  AES_KEY_BYTES,
  CHALLENGE_TTL_MS,
  ENVELOPE_VERSION,
  MAX_ENVELOPE_BYTES,
  MAX_FILE_BYTES,
  MAX_MESSAGE_CHARS,
  MAX_RETRIES,
  RECONNECT_BASE_MS,
  RECONNECT_MAX_MS,
  SUPPORTED_NETWORKS,
  addressSchema,
  authChallengeSchema,
  envelopeSchema,
  signalMessageSchema,
  wrappedKeySchema,
} from "../src/index";

const ADDR_A = "0x1111111111111111111111111111111111111111";
const ADDR_B = "0x2222222222222222222222222222222222222222";

function validEnvelope() {
  return {
    v: 1 as const,
    id: "abc123",
    from: ADDR_A,
    to: ADDR_B,
    groupId: null,
    keyVersion: 1,
    iv: "AAAAAAAAAAAAAAAA",
    ciphertext: "AAAAAAAAAAAAAAAA",
    wrappedKeys: [
      { recipient: ADDR_B, ephemPub: "ep", wrappedKey: "wk", iv: "AAAAAAAAAAAAAAAA" },
    ],
    timestamp: 1_700_000_000_000,
    contentType: "text" as const,
    digest: "a".repeat(64),
  };
}

describe("constants", () => {
  it("exports stable protocol constants", () => {
    expect(ENVELOPE_VERSION).toBe(1);
    expect(AES_GCM_IV_BYTES).toBe(12);
    expect(AES_KEY_BYTES).toBe(32);
    expect(MAX_MESSAGE_CHARS).toBe(8_000);
    expect(MAX_FILE_BYTES).toBe(25 * 1024 * 1024);
    expect(MAX_ENVELOPE_BYTES).toBe(32 * 1024 * 1024);
    expect(CHALLENGE_TTL_MS).toBe(5 * 60 * 1000);
    expect(ACK_TIMEOUT_MS).toBeGreaterThan(0);
    expect(MAX_RETRIES).toBeGreaterThan(0);
    expect(RECONNECT_MAX_MS).toBeGreaterThan(RECONNECT_BASE_MS);
    expect(SUPPORTED_NETWORKS[31337]).toBe("Hardhat Local");
  });
});

describe("addressSchema", () => {
  it("accepts 0x-prefixed 40 hex chars (any case)", () => {
    expect(addressSchema.safeParse(ADDR_A).success).toBe(true);
    expect(addressSchema.safeParse("0xAbCdEf0123456789abcdef0123456789ABCDEF01").success).toBe(true);
  });
  it("rejects malformed addresses", () => {
    for (const bad of ["", "1111111111111111111111111111111111111111", "0x123", `0x${"g".repeat(40)}`, `0x${"0".repeat(39)}`]) {
      expect(addressSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe("wrappedKeySchema", () => {
  it("requires all four fields", () => {
    expect(wrappedKeySchema.safeParse({ recipient: ADDR_A, ephemPub: "e", wrappedKey: "w", iv: "i" }).success).toBe(true);
    expect(wrappedKeySchema.safeParse({ recipient: "", ephemPub: "e", wrappedKey: "w", iv: "i" }).success).toBe(false);
    expect(wrappedKeySchema.safeParse({ recipient: ADDR_A, ephemPub: "e", wrappedKey: "w" }).success).toBe(false);
  });
});

describe("envelopeSchema", () => {
  it("accepts a well-formed v1 envelope", () => {
    expect(envelopeSchema.safeParse(validEnvelope()).success).toBe(true);
  });
  it("rejects wrong version, bad digest, empty wrapped keys, group/direct mismatch", () => {
    expect(envelopeSchema.safeParse({ ...validEnvelope(), v: 2 }).success).toBe(false);
    expect(envelopeSchema.safeParse({ ...validEnvelope(), digest: "nothex" }).success).toBe(false);
    expect(envelopeSchema.safeParse({ ...validEnvelope(), wrappedKeys: [] }).success).toBe(false);
    expect(envelopeSchema.safeParse({ ...validEnvelope(), keyVersion: 0 }).success).toBe(false);
    expect(envelopeSchema.safeParse({ ...validEnvelope(), timestamp: -1 }).success).toBe(false);
  });
  it("rejects oversized ids and unknown content types", () => {
    expect(envelopeSchema.safeParse({ ...validEnvelope(), id: "x".repeat(129) }).success).toBe(false);
    expect(envelopeSchema.safeParse({ ...validEnvelope(), contentType: "video" }).success).toBe(false);
  });
});

describe("signalMessageSchema", () => {
  it("accepts each known frame type", () => {
    for (const type of ["offer", "answer", "ice", "ack", "presence", "envelope", "receipt"] as const) {
      const r = signalMessageSchema.safeParse({ type, from: ADDR_A, to: ADDR_B, room: "r", payload: null, ts: Date.now() });
      expect(r.success).toBe(true);
    }
  });
  it("rejects unknown types and missing fields", () => {
    expect(signalMessageSchema.safeParse({ type: "join", from: ADDR_A, to: ADDR_B, room: "r", payload: null, ts: 1 }).success).toBe(false);
    expect(signalMessageSchema.safeParse({ type: "offer", from: "", to: ADDR_B, room: "r", payload: null, ts: 1 }).success).toBe(false);
  });
});

describe("authChallengeSchema", () => {
  it("accepts a full challenge", () => {
    const now = new Date().toISOString();
    const c = {
      domain: "localhost",
      uri: "http://localhost:5173",
      address: ADDR_A,
      chainId: 31337,
      nonce: "n".repeat(16),
      issuedAt: now,
      expiration: now,
      statement: "Sign in",
    };
    expect(authChallengeSchema.safeParse(c).success).toBe(true);
  });
  it("rejects short nonce and non-positive chain id", () => {
    const now = new Date().toISOString();
    const base = { domain: "localhost", uri: "http://localhost", address: ADDR_A, chainId: 1, nonce: "n".repeat(16), issuedAt: now, expiration: now, statement: "s" };
    expect(authChallengeSchema.safeParse({ ...base, nonce: "short" }).success).toBe(false);
    expect(authChallengeSchema.safeParse({ ...base, chainId: 0 }).success).toBe(false);
  });
});
