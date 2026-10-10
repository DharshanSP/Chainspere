/**
 * Crypto design (documented, see docs/cryptography.md):
 * - Wallet signing key (secp256k1, MetaMask) is ONLY for authentication (EIP-4361-style).
 *   It is NEVER used as an encryption key.
 * - Message encryption keys are P-256 ECDH (WebCrypto `ECDH` + `P-256`), because it is
 *   available in every modern browser via Web Crypto and interoperates Node<->browser.
 * - Per message: fresh random 256-bit message key + fresh 96-bit IV (never reused).
 * - Message key is wrapped per-recipient: ECDH(ephemeralPriv, recipientPub) -> HKDF-SHA256
 *   -> KEK (AES-256-GCM) -> wrap message key. AAD binds sender/recipient/message id.
 * - Payload is AES-256-GCM(messageKey, fresh IV). Envelope metadata is AAD.
 * - SHA-256 digest over canonical encrypted bytes for anchoring/verification.
 */
import { HKDF_INFO } from "@chainsphere/shared";

const te = new TextEncoder();
const td = new TextDecoder();

function subtle(): SubtleCrypto {
  const c = globalThis.crypto;
  if (!c?.subtle) throw new Error("WebCrypto SubtleCrypto unavailable in this environment");
  return c.subtle;
}

export function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  globalThis.crypto.getRandomValues(b);
  return b;
}

export function b64encode(bytes: Uint8Array): string {
  let s = "";
  for (const byte of bytes) s += String.fromCharCode(byte);
  return btoa(s);
}

export function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function hexEncode(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function hexDecode(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error("Invalid hex length");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

// ---------- Hashing ----------
export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === "string" ? te.encode(data) : data;
  const d = await subtle().digest("SHA-256", bytes as BufferSource);
  return hexEncode(new Uint8Array(d));
}

// ---------- P-256 ECDH key management ----------
export interface KeyPair {
  /** Raw uncompressed P-256 public key (65 bytes, 0x04 || X || Y), base64. */
  publicKeyB64: string;
  /** Private key: CryptoKey (prefer non-extractable) — kept in memory / encrypted backup only. */
  privateKey: CryptoKey;
  fingerprint: string; // sha256 hex of raw public key
  version: number;
}

export async function generateEncryptionKeyPair(version = 1): Promise<KeyPair> {
  const kp = await subtle().generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const raw = new Uint8Array(await subtle().exportKey("raw", kp.publicKey));
  const fingerprint = await sha256Hex(raw);
  return { publicKeyB64: b64encode(raw), privateKey: kp.privateKey, fingerprint, version };
}

export async function importPublicKey(b64: string): Promise<CryptoKey> {
  const raw = b64decode(b64);
  if (raw.length !== 65 || raw[0] !== 0x04) throw new Error("Invalid P-256 public key encoding");
  return subtle().importKey("raw", raw as BufferSource, { name: "ECDH", namedCurve: "P-256" }, true, []);
}

export async function importPrivateKeyJwk(jwk: JsonWebKey): Promise<CryptoKey> {
  return subtle().importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
}

export async function exportPrivateKeyJwk(key: CryptoKey): Promise<JsonWebKey> {
  return subtle().exportKey("jwk", key);
}

export async function fingerprintOfPublicKeyB64(b64: string): Promise<string> {
  return sha256Hex(b64decode(b64));
}

async function deriveKek(ownPriv: CryptoKey, peerPub: CryptoKey, info: string): Promise<CryptoKey> {
  const bits = await subtle().deriveBits({ name: "ECDH", public: peerPub }, ownPriv, 256);
  const hk = await subtle().importKey("raw", bits, "HKDF", false, ["deriveKey"]);
  return subtle().deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: te.encode(info || HKDF_INFO) },
    hk,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// ---------- AES-256-GCM payload ----------
export async function aesGcmEncrypt(keyBytes: Uint8Array, plaintext: Uint8Array, aad: Uint8Array): Promise<{ iv: Uint8Array; ciphertext: Uint8Array }> {
  if (keyBytes.length !== 32) throw new Error("AES-256 requires 32-byte key");
  const key = await subtle().importKey("raw", keyBytes as BufferSource, "AES-GCM", false, ["encrypt"]);
  const iv = randomBytes(12); // fresh 96-bit IV per encryption — never reused
  const ct = await subtle().encrypt({ name: "AES-GCM", iv: iv as BufferSource, additionalData: aad as BufferSource }, key, plaintext as BufferSource);
  return { iv, ciphertext: new Uint8Array(ct) };
}

export async function aesGcmDecrypt(keyBytes: Uint8Array, iv: Uint8Array, ciphertext: Uint8Array, aad: Uint8Array): Promise<Uint8Array> {
  if (keyBytes.length !== 32) throw new Error("AES-256 requires 32-byte key");
  if (iv.length !== 12) throw new Error("AES-GCM requires 12-byte IV");
  const key = await subtle().importKey("raw", keyBytes as BufferSource, "AES-GCM", false, ["decrypt"]);
  try {
    const pt = await subtle().decrypt(
      { name: "AES-GCM", iv: iv as BufferSource, additionalData: aad as BufferSource },
      key,
      ciphertext as BufferSource
    );
    return new Uint8Array(pt);
  } catch {
    throw new Error("Decryption failed: authentication tag mismatch or wrong key");
  }
}

// ---------- Key wrapping (per recipient) ----------
export async function wrapKeyForRecipient(
  messageKey: Uint8Array,
  recipientPubB64: string,
  aad: Uint8Array
): Promise<{ ephemPubB64: string; wrappedKeyB64: string; ivB64: string }> {
  const recipientPub = await importPublicKey(recipientPubB64);
  const ephem = await subtle().generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const ephemRaw = new Uint8Array(await subtle().exportKey("raw", ephem.publicKey));
  const kek = await deriveKek(ephem.privateKey, recipientPub, HKDF_INFO);
  const iv = randomBytes(12);
  const wrapped = await subtle().encrypt({ name: "AES-GCM", iv: iv as BufferSource, additionalData: aad as BufferSource }, kek, messageKey as BufferSource);
  return { ephemPubB64: b64encode(ephemRaw), wrappedKeyB64: b64encode(new Uint8Array(wrapped)), ivB64: b64encode(iv) };
}

export async function unwrapKeyForRecipient(
  recipientPriv: CryptoKey,
  ephemPubB64: string,
  wrappedKeyB64: string,
  ivB64: string,
  aad: Uint8Array
): Promise<Uint8Array> {
  const ephemPub = await importPublicKey(ephemPubB64);
  const kek = await deriveKek(recipientPriv, ephemPub, HKDF_INFO);
  try {
    const pt = await subtle().decrypt(
      { name: "AES-GCM", iv: b64decode(ivB64) as BufferSource, additionalData: aad as BufferSource },
      kek,
      b64decode(wrappedKeyB64) as BufferSource
    );
    return new Uint8Array(pt);
  } catch {
    throw new Error("Key unwrap failed: wrong recipient key or tampered envelope");
  }
}

export function envelopeAad(params: { id: string; from: string; to: string | null; groupId: string | null; keyVersion: number; timestamp: number }): Uint8Array {
  return te.encode(`v1|${params.id}|${params.from}|${params.to ?? ""}|${params.groupId ?? ""}|${params.keyVersion}|${params.timestamp}`);
}

export function text(): { encode(s: string): Uint8Array; decode(b: Uint8Array): string } {
  return { encode: (s) => te.encode(s), decode: (b) => td.decode(b) };
}
