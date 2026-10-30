import { describe, expect, it } from "vitest";
import { InMemoryIpfsAdapter } from "../src/index";
import { retrieveAndVerify, uploadWithRetry } from "../src/uploads/transfer";

describe("ipfs adapter", () => {
  it("upload -> retrieve -> digest verifies", async () => {
    const a = new InMemoryIpfsAdapter();
    const b = new InMemoryIpfsAdapter();
    a.shareWith(b);
    const payload = new TextEncoder().encode("ciphertext-bytes");
    const { cid, digestHex } = await uploadWithRetry(a, payload);
    expect(cid.startsWith("fallback-")).toBe(true);
    const got = await retrieveAndVerify(b, cid, digestHex);
    expect(new TextDecoder().decode(got.bytes)).toBe("ciphertext-bytes");
  });
  it("unknown CID throws (no persistence guarantee)", async () => {
    const a = new InMemoryIpfsAdapter();
    await expect(retrieveAndVerify(a, "fallback-deadbeef")).rejects.toThrow(/unavailable/);
  });
  it("digest mismatch detected", async () => {
    const a = new InMemoryIpfsAdapter();
    const { cid } = await uploadWithRetry(a, new TextEncoder().encode("x"));
    await expect(retrieveAndVerify(a, cid, "00".repeat(32))).rejects.toThrow(/Digest mismatch/);
  });
  it("empty payload refused", async () => {
    const a = new InMemoryIpfsAdapter();
    await expect(uploadWithRetry(a, new Uint8Array(0))).rejects.toThrow(/empty/);
  });

  it("PinataAdapter formats request and parses IpfsHash CID", async () => {
    const origFetch = globalThis.fetch;
    try {
      globalThis.fetch = (async (url: string | URL | Request) => {
        const urlStr = String(url);
        if (urlStr.includes("pinFileToIPFS")) {
          return new Response(JSON.stringify({ IpfsHash: "QmPinataCid12345" }), { status: 200 });
        }
        if (urlStr.includes("/ipfs/QmPinataCid12345")) {
          return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
        }
        return new Response("Not found", { status: 404 });
      }) as typeof fetch;

      const { PinataAdapter } = await import("../src/clients/adapters");
      const pinata = new PinataAdapter("fake-jwt-token");
      const res = await pinata.uploadEncrypted(new Uint8Array([1, 2, 3]));
      expect(res.cid).toBe("QmPinataCid12345");
      expect(res.provider).toBe("pinata");

      const fetched = await pinata.fetchEncrypted("QmPinataCid12345");
      expect(fetched).toEqual(new Uint8Array([1, 2, 3]));
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
