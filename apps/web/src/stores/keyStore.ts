import {
  exportPrivateKeyJwk,
  generateEncryptionKeyPair,
  importPrivateKeyJwk,
  type KeyPair,
} from "@chainsphere/crypto";
import type { Address } from "@chainsphere/shared";
import { readJson, removeKey, writeJson } from "../lib/storage";

export interface StoredKeyMaterial extends KeyPair {
  address: Address;
  publicKeyB64: string;
  fingerprint: string;
  version: number;
}

interface StoredKeyRecord {
  address: string;
  publicKeyB64: string;
  privateJwk: JsonWebKey;
  fingerprint: string;
  version: number;
}

const storageKey = (address: Address) => `chainsphere.keys.v1.${address.toLowerCase()}`;

/**
 * Per-wallet P-256 encryption keypair, kept in sessionStorage (cleared when the tab closes).
 * The private key never touches the chain, the signaling server, or IPFS.
 */
export async function loadOrCreateKeyPair(address: Address): Promise<StoredKeyMaterial> {
  const existing = readJson<StoredKeyRecord | null>(sessionStorage, storageKey(address), null);
  if (existing && existing.address.toLowerCase() === address.toLowerCase()) {
    const privateKey = await importPrivateKeyJwk(existing.privateJwk);
    return {
      address: address.toLowerCase() as Address,
      publicKeyB64: existing.publicKeyB64,
      fingerprint: existing.fingerprint,
      version: existing.version,
      privateKey,
    };
  }
  const pair = await generateEncryptionKeyPair(1);
  const privateJwk = await exportPrivateKeyJwk(pair.privateKey);
  const record: StoredKeyRecord = {
    address: address.toLowerCase(),
    publicKeyB64: pair.publicKeyB64,
    privateJwk,
    fingerprint: pair.fingerprint,
    version: pair.version,
  };
  writeJson(sessionStorage, storageKey(address), record);
  return {
    address: address.toLowerCase() as Address,
    publicKeyB64: pair.publicKeyB64,
    fingerprint: pair.fingerprint,
    version: pair.version,
    privateKey: pair.privateKey,
  };
}

export function clearKeyPair(address: Address): void {
  removeKey(sessionStorage, storageKey(address));
}
