import { describe, expect, it } from "vitest";
import { ethers } from "ethers";
import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  decryptEnvelope,
  decryptText,
  encryptEnvelope,
  encryptText,
  envelopeAad,
  generateEncryptionKeyPair,
  newMessageIdHex,
  randomBytes,
  sha256Hex,
  verifyDigest,
  importPrivateKeyJwk,
  exportPrivateKeyJwk,
} from "../src/index";
import { buildChallenge, formatChallengeMessage, verifyChallengeSignature } from "../src/signatures/siwe";
import { GroupKeyStore } from "../src/key-management/group-keys";

async function twoUsers() {
  const a = await generateEncryptionKeyPair(1);
  const b = await generateEncryptionKeyPair(1);
  // export/import roundtrip to simulate persistence
  const jwk = await exportPrivateKeyJwk(a.privateKey);
  const restored = await importPrivateKeyJwk(jwk);
  return { a: { ...a, privateKey: restored }, b };
}

describe("AES-GCM", () => {
  it("encrypt/decrypt roundtrip + wrong key fails + tamper fails", async () => {
    const key = randomBytes(32);
    const aad = new TextEncoder().encode("aad");
    const { iv, ciphertext } = await aesGcmEncrypt(key, new TextEncoder().encode("hello"), aad);
    expect(new TextDecoder().decode(await aesGcmDecrypt(key, iv, ciphertext, aad))).toBe("hello");
    await expect(aesGcmDecrypt(randomBytes(32), iv, ciphertext, aad)).rejects.toThrow();
    const bad = new Uint8Array(ciphertext); bad[0] ^= 1;
    await expect(aesGcmDecrypt(key, iv, bad, aad)).rejects.toThrow();
  });
  it("rejects reused-short IV", async () => {
    await expect(aesGcmDecrypt(randomBytes(32), new Uint8Array(8), new Uint8Array(8), new Uint8Array(0))).rejects.toThrow();
  });
});

describe("1:1 envelope", () => {
  it("encrypt for recipient; recipient decrypts; sender self-read via own wrapped key", async () => {
    const { a, b } = await twoUsers();
    const env = await encryptText("secret hello", {
      id: newMessageIdHex(), from: "0x1111111111111111111111111111111111111111",
      to: "0x2222222222222222222222222222222222222222", groupId: null, keyVersion: 1,
      recipients: [
        { id: "0x2222222222222222222222222222222222222222", publicKeyB64: b.publicKeyB64 },
        { id: "0x1111111111111111111111111111111111111111", publicKeyB64: a.publicKeyB64 },
      ],
    });
    expect(env.v).toBe(1);
    expect(await decryptText(env, "0x2222222222222222222222222222222222222222", b.privateKey)).toBe("secret hello");
    expect(await decryptText(env, "0x1111111111111111111111111111111111111111", a.privateKey)).toBe("secret hello");
  });

  it("unauthorized recipient cannot decrypt", async () => {
    const { a, b } = await twoUsers();
    const eve = await generateEncryptionKeyPair(1);
    const env = await encryptText("x", {
      id: newMessageIdHex(), from: "0x1111111111111111111111111111111111111111",
      to: "0x2222222222222222222222222222222222222222", groupId: null, keyVersion: 1,
      recipients: [{ id: "0x2222222222222222222222222222222222222222", publicKeyB64: b.publicKeyB64 }],
    });
    await expect(decryptEnvelope(env, "0x9999999999999999999999999999999999999999", eve.privateKey)).rejects.toThrow(/No wrapped key/);
    // wrong private key with right id still fails auth
    const tampered = { ...env, wrappedKeys: env.wrappedKeys.map((w) => ({ ...w, recipient: "0x9999999999999999999999999999999999999999" })) };
    await expect(decryptEnvelope(tampered as any, "0x9999999999999999999999999999999999999999", eve.privateKey)).rejects.toThrow();
    void a;
  });

  it("tampered ciphertext/IV detected via digest + GCM tag", async () => {
    const { b } = await twoUsers();
    const env = await encryptText("abc", {
      id: newMessageIdHex(), from: "0x1111111111111111111111111111111111111111",
      to: "0x2222222222222222222222222222222222222222", groupId: null, keyVersion: 1,
      recipients: [{ id: "0x2222222222222222222222222222222222222222", publicKeyB64: b.publicKeyB64 }],
    });
    const bad = { ...env, ciphertext: env.ciphertext.slice(0, -2) + "AA" };
    await expect(decryptText(bad, "0x2222222222222222222222222222222222222222", b.privateKey)).rejects.toThrow(/Digest mismatch/);
    expect(await verifyDigest(env, env.digest)).toBe(true);
    expect(await verifyDigest(env, "00".repeat(32))).toBe(false);
  });

  it("fresh IV per message (same plaintext -> different ciphertext)", async () => {
    const { b } = await twoUsers();
    const mk = (id: string) => encryptText("same", {
      id, from: "0x1111111111111111111111111111111111111111",
      to: "0x2222222222222222222222222222222222222222", groupId: null, keyVersion: 1,
      recipients: [{ id: "0x2222222222222222222222222222222222222222", publicKeyB64: b.publicKeyB64 }],
    });
    const e1 = await mk(newMessageIdHex());
    const e2 = await mk(newMessageIdHex());
    expect(e1.ciphertext).not.toBe(e2.ciphertext);
    expect(e1.iv).not.toBe(e2.iv);
  });
});

describe("group rotation", () => {
  it("old member cannot read post-rotation messages; new key version decrypts", async () => {
    const alice = await generateEncryptionKeyPair(1);
    const bob = await generateEncryptionKeyPair(1);
    const store = new GroupKeyStore();
    const v1 = store.rotate();
    const env1 = await encryptEnvelope(new TextEncoder().encode("v1 msg"), {
      id: newMessageIdHex(), from: "0x1111111111111111111111111111111111111111",
      to: null, groupId: "g1", keyVersion: v1.version, groupKey: v1.key,
      recipients: [
        { id: "0x1111111111111111111111111111111111111111", publicKeyB64: alice.publicKeyB64 },
        { id: "0x2222222222222222222222222222222222222222", publicKeyB64: bob.publicKeyB64 },
      ],
    });
    expect(await decryptEnvelope(env1, "0x2222222222222222222222222222222222222222", bob.privateKey)).toBeTruthy();
    // bob removed -> rotate, encrypt only for alice
    const v2 = store.rotate();
    const env2 = await encryptEnvelope(new TextEncoder().encode("v2 msg"), {
      id: newMessageIdHex(), from: "0x1111111111111111111111111111111111111111",
      to: null, groupId: "g1", keyVersion: v2.version, groupKey: v2.key,
      recipients: [{ id: "0x1111111111111111111111111111111111111111", publicKeyB64: alice.publicKeyB64 }],
    });
    await expect(decryptEnvelope(env2, "0x2222222222222222222222222222222222222222", bob.privateKey)).rejects.toThrow(/No wrapped key/);
    expect(new TextDecoder().decode(await decryptEnvelope(env2, "0x1111111111111111111111111111111111111111", alice.privateKey))).toBe("v2 msg");
  });
});

describe("hashing + auth", () => {
  it("sha256 known vector", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("SIWE challenge sign/verify; replay + expiry rejected", async () => {
    const wallet = ethers.Wallet.createRandom();
    const c = buildChallenge({ domain: "localhost", uri: "http://localhost:5173", address: wallet.address as `0x${string}`, chainId: 31337 });
    const sig = await wallet.signMessage(formatChallengeMessage(c));
    expect(verifyChallengeSignature(c, sig).toLowerCase()).toBe(wallet.address.toLowerCase());
    expect(() => verifyChallengeSignature(c, sig)).toThrow(/Replayed/);
    const expired = { ...buildChallenge({ domain: "d", uri: "u", address: wallet.address as `0x${string}`, chainId: 1 }), expiration: new Date(Date.now() - 1000).toISOString() };
    const sig2 = await wallet.signMessage(formatChallengeMessage(expired));
    expect(() => verifyChallengeSignature(expired, sig2)).toThrow(/expired/);
  });
  it("envelopeAad binds metadata", () => {
    const a = envelopeAad({ id: "1", from: "0xA", to: "0xB", groupId: null, keyVersion: 1, timestamp: 5 });
    const b = envelopeAad({ id: "1", from: "0xA", to: "0xC", groupId: null, keyVersion: 1, timestamp: 5 });
    expect(Buffer.from(a).toString()).not.toBe(Buffer.from(b).toString());
  });
});
