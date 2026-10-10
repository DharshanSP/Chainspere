/** IPFS adapter: ciphertext bytes in, CID out. Never upload plaintext. */
export interface UploadResult {
  cid: string;
  bytes: number;
  provider: string;
}

export interface IpfsAdapter {
  name: string;
  uploadEncrypted(payload: Uint8Array, opts?: { filename?: string; signal?: AbortSignal }): Promise<UploadResult>;
  fetchEncrypted(cid: string, opts?: { signal?: AbortSignal }): Promise<Uint8Array>;
  pin?(cid: string): Promise<void>;
}

export interface PinningProvider {
  name: string;
  pin(cid: string, opts?: { filename?: string }): Promise<void>;
}

export async function sha256HexBytes(data: Uint8Array): Promise<string> {
  const d = await globalThis.crypto.subtle.digest("SHA-256", data as BufferSource);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Pseudo-CID for the in-memory fallback (clearly NOT a real IPFS CID; used for local demo/tests). */
export function fallbackCidFor(bytes: Uint8Array, digestHex: string): string {
  void bytes;
  return `fallback-${digestHex.slice(0, 32)}`;
}
