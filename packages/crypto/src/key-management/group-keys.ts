import { randomBytes, sha256Hex } from "../encryption/primitives";

/** Group key store: keyVersion -> 32-byte group key (memory only; persist encrypted). */
export class GroupKeyStore {
  private keys = new Map<number, Uint8Array>();
  version = 0;

  rotate(): { version: number; key: Uint8Array } {
    const key = randomBytes(32);
    this.version += 1;
    this.keys.set(this.version, key);
    return { version: this.version, key };
  }

  get(version: number): Uint8Array {
    const k = this.keys.get(version);
    if (!k) throw new Error(`Group key v${version} unavailable (member added after rotation?)`);
    return k;
  }

  importKey(version: number, key: Uint8Array): void {
    if (key.length !== 32) throw new Error("Group key must be 32 bytes");
    this.keys.set(version, new Uint8Array(key));
    if (version > this.version) this.version = version;
  }

  /** Drop keys older than minVersion (forward hygiene; does NOT revoke already-seen content). */
  prune(minVersion: number): void {
    for (const v of [...this.keys.keys()]) if (v < minVersion) this.keys.delete(v);
  }
}

export async function fingerprintHex(data: string | Uint8Array): Promise<string> {
  return sha256Hex(data);
}
