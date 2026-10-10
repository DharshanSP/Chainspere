import { BrowserProvider, Contract, JsonRpcSigner } from "ethers";
import type { Address } from "@chainsphere/shared";

const IDENTITY_ABI = [
  "function register(string profileRef, bytes32 keyFingerprint, string keyRef) external",
  "function updateProfile(string profileRef) external",
  "function rotateKey(bytes32 newFingerprint, string newKeyRef) external",
  "function getIdentity(address wallet) view returns (bool registered, bool active, string profileRef, bytes32 keyFingerprint, uint32 keyVersion, string keyRef)",
  "function isActive(address wallet) view returns (bool)",
];

const ANCHOR_ABI = [
  "function anchor(bytes32 messageId, bytes32 groupId, bytes32 digest, string cid) external",
  "function getAnchor(bytes32 messageId) view returns (address sender, bytes32 groupId, bytes32 digest, string cid, uint64 timestamp)",
  "function verify(bytes32 messageId, bytes32 digest, string cid) view returns (bool digestMatch, bool cidMatch)",
];

export interface OnChainIdentity {
  registered: boolean;
  active: boolean;
  profileRef: string;
  keyFingerprint: string;
  keyVersion: number;
  keyRef: string;
}

/** bytes32 helper: sha256 fingerprint hex -> 0x-prefixed 32-byte hex. */
export function fingerprintToBytes32(fingerprintHex: string): string {
  const hex = fingerprintHex.replace(/^0x/, "");
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error("Fingerprint must be 32-byte sha256 hex");
  return `0x${hex.toLowerCase()}`;
}

export function identityContract(signer: JsonRpcSigner, address: string): Contract {
  return new Contract(address, IDENTITY_ABI, signer);
}

export function identityReader(provider: BrowserProvider, address: string): Contract {
  return new Contract(address, IDENTITY_ABI, provider);
}

export function anchorContract(signer: JsonRpcSigner, address: string): Contract {
  return new Contract(address, ANCHOR_ABI, signer);
}

export async function fetchIdentity(
  provider: BrowserProvider,
  registryAddress: string,
  wallet: Address
): Promise<OnChainIdentity | null> {
  const [registered, active, profileRef, keyFingerprint, keyVersion, keyRef] = await identityReader(
    provider,
    registryAddress
  ).getIdentity(wallet);
  return {
    registered,
    active,
    profileRef,
    keyFingerprint,
    keyVersion: Number(keyVersion),
    keyRef,
  };
}

export async function registerIdentity(
  signer: JsonRpcSigner,
  registryAddress: string,
  fingerprintHex: string,
  publicKeyB64: string
): Promise<string> {
  const tx = await identityContract(signer, registryAddress).register("", fingerprintToBytes32(fingerprintHex), publicKeyB64);
  await tx.wait();
  return String(tx.hash);
}

/** Public encryption key for a peer: keyRef holds the P-256 public key (base64). */
export function publicKeyFromIdentity(identity: OnChainIdentity | null): string | null {
  if (!identity || !identity.registered || !identity.active) return null;
  const keyRef = identity.keyRef.trim();
  return keyRef.length > 0 ? keyRef : null;
}
