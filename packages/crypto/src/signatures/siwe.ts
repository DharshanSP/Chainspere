import { ethers } from "ethers";
import type { Address, AuthChallenge } from "@chainsphere/shared";
import { CHALLENGE_TTL_MS } from "@chainsphere/shared";

const usedNonces = new Set<string>(); // client-side replay cache (server/signaling keeps authoritative set)

export function buildChallenge(params: {
  domain: string; uri: string; address: Address; chainId: number; nonce?: string; statement?: string;
}): AuthChallenge {
  const now = new Date();
  const exp = new Date(now.getTime() + CHALLENGE_TTL_MS);
  const nonce = params.nonce ?? ethers.hexlify(ethers.randomBytes(16)).slice(2);
  return {
    domain: params.domain,
    uri: params.uri,
    address: params.address,
    chainId: params.chainId,
    nonce,
    issuedAt: now.toISOString(),
    expiration: exp.toISOString(),
    statement: params.statement ?? "Sign in to ChainSphere. This signature never moves funds or reveals keys.",
  };
}

/** EIP-4361-style human-readable message (SIWE-compatible subset). */
export function formatChallengeMessage(c: AuthChallenge): string {
  return [
    `${c.domain} wants you to sign in with your Ethereum account:`,
    `${c.address}`,
    ``,
    `${c.statement}`,
    ``,
    `URI: ${c.uri}`,
    `Chain ID: ${c.chainId}`,
    `Nonce: ${c.nonce}`,
    `Issued At: ${c.issuedAt}`,
    `Expiration Time: ${c.expiration}`,
  ].join("\n");
}

/** Verify signature + freshness + nonce replay. Returns signer address. */
export function verifyChallengeSignature(challenge: AuthChallenge, signature: string): Address {
  if (usedNonces.has(challenge.nonce)) throw new Error("Replayed nonce");
  const now = Date.now();
  if (Date.parse(challenge.expiration) <= now) throw new Error("Challenge expired");
  if (Date.parse(challenge.issuedAt) > now + 60_000) throw new Error("Challenge issued in the future");
  const recovered = ethers.verifyMessage(formatChallengeMessage(challenge), signature);
  if (recovered.toLowerCase() !== challenge.address.toLowerCase()) throw new Error("Signature does not match challenge address");
  usedNonces.add(challenge.nonce);
  return recovered as Address;
}

export function consumeNonce(nonce: string): void {
  usedNonces.add(nonce);
}
