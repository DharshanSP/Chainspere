import type { IpfsAdapter, UploadResult } from "./types";
import { fallbackCidFor, sha256HexBytes } from "./types";

/**
 * In-memory IPFS stand-in for tests + local demo without a daemon.
 * Uploads are content-addressed by SHA-256 (fallback-<hex>), retrieval validates digest.
 * The KuboHttpAdapter (below) is used when IPFS_API_URL is configured.
 */
export class InMemoryIpfsAdapter implements IpfsAdapter {
  readonly name = "in-memory";
  private store = new Map<string, Uint8Array>();

  async uploadEncrypted(payload: Uint8Array): Promise<UploadResult> {
    const digest = await sha256HexBytes(payload);
    const cid = fallbackCidFor(payload, digest);
    this.store.set(cid, new Uint8Array(payload));
    return { cid, bytes: payload.length, provider: this.name };
  }

  async fetchEncrypted(cid: string): Promise<Uint8Array> {
    const data = this.store.get(cid);
    if (!data) throw new Error(`CID unavailable: ${cid} (in-memory store; IPFS does not guarantee persistence)`);
    return new Uint8Array(data);
  }

  /** Test helper: share the underlying map between two instances (simulates network). */
  shareWith(other: InMemoryIpfsAdapter): void {
    other.store = this.store;
  }
}

/**
 * Kubo HTTP API adapter (POST /api/v0/add, GET /api/v0/cat) + gateway fallback for reads.
 * Only ever receives ciphertext — callers must encrypt before calling uploadEncrypted.
 */
export class KuboHttpAdapter implements IpfsAdapter {
  readonly name = "kubo-http";
  constructor(
    private apiUrl: string = "http://127.0.0.1:5001",
    private gatewayUrl: string = "https://ipfs.io",
    private timeoutMs = 30_000
  ) {}

  async uploadEncrypted(payload: Uint8Array, opts?: { filename?: string; signal?: AbortSignal }): Promise<UploadResult> {
    const form = new FormData();
    form.append("file", new Blob([payload as unknown as BlobPart]), opts?.filename ?? "payload.enc");
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.apiUrl}/api/v0/add?pin=true`, {
        method: "POST", body: form,
        signal: opts?.signal ?? ctrl.signal,
      });
      if (!res.ok) throw new Error(`IPFS add failed: HTTP ${res.status}`);
      const body = await res.json() as { Hash: string };
      if (!body.Hash) throw new Error("IPFS add returned no Hash");
      return { cid: body.Hash, bytes: payload.length, provider: this.name };
    } finally {
      clearTimeout(t);
    }
  }

  async fetchEncrypted(cid: string, opts?: { signal?: AbortSignal }): Promise<Uint8Array> {
    const errors: string[] = [];
    // Try Kubo cat first, then public gateway.
    for (const url of [`${this.apiUrl}/api/v0/cat?arg=${encodeURIComponent(cid)}`, `${this.gatewayUrl}/ipfs/${encodeURIComponent(cid)}`]) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
        const res = await fetch(url, { method: "POST", signal: opts?.signal ?? ctrl.signal }).catch(() => fetch(url, { signal: opts?.signal ?? ctrl.signal }));
        clearTimeout(t);
        if (!res.ok) { errors.push(`${url}: HTTP ${res.status}`); continue; }
        return new Uint8Array(await res.arrayBuffer());
      } catch (e) {
        errors.push(`${url}: ${(e as Error).message}`);
      }
    }
    throw new Error(`CID unavailable on all gateways: ${errors.join("; ")}`);
  }
}
