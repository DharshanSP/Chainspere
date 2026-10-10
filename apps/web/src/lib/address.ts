import type { Address } from "@chainsphere/shared";

export const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

export function isValidAddress(value: string): value is Address {
  return ADDRESS_REGEX.test(value);
}

export function normalizeAddress(value: string): Address {
  if (!isValidAddress(value)) throw new Error(`Invalid wallet address: ${value}`);
  return value.toLowerCase() as Address;
}

export function shortAddress(address: string, chars = 4): string {
  if (!isValidAddress(address)) return address;
  return `${address.slice(0, 2 + chars)}…${address.slice(-chars)}`;
}

export function conversationIdFor(peer: Address): string {
  return normalizeAddress(peer);
}
