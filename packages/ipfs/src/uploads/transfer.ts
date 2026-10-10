import { sha256HexBytes, type IpfsAdapter } from "../clients/types";
import { MAX_FILE_BYTES } from "@chainsphere/shared";

export interface VerifiedPayload {
  cid: string;
  bytes: Uint8Array;
  digestHex: string;
}

/** Upload ciphertext (already encrypted) with retries + bounded backoff. */
export async function uploadWithRetry(
  adapter: IpfsAdapter,
  payload: Uint8Array,
  opts?: { retries?: number; filename?: string }
): Promise<{ cid: string; digestHex: string }> {
  if (payload.length === 0) throw new Error("Refusing to upload empty payload");
  if (payload.length > MAX_FILE_BYTES + 8 * 1024 * 1024) throw new Error("Payload exceeds size limit");
  const digestHex = await sha256HexBytes(payload);
  const retries = opts?.retries ?? 3;
  let last: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const r = await adapter.uploadEncrypted(payload, { filename: opts?.filename });
      return { cid: r.cid, digestHex };
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** attempt, 8000)));
    }
  }
  throw new Error(`IPFS upload failed after ${retries + 1} attempts: ${(last as Error)?.message}`);
}

/** Retrieve + verify digest (throws on mismatch — never trust IPFS content blindly). */
export async function retrieveAndVerify(
  adapter: IpfsAdapter,
  cid: string,
  expectedDigestHex?: string
): Promise<VerifiedPayload> {
  const bytes = await adapter.fetchEncrypted(cid);
  const digestHex = await sha256HexBytes(bytes);
  if (expectedDigestHex && digestHex.toLowerCase() !== expectedDigestHex.toLowerCase()) {
    throw new Error("Digest mismatch: retrieved bytes do not match expected commitment");
  }
  return { cid, bytes, digestHex };
}
