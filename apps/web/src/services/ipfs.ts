import {
  InMemoryIpfsAdapter,
  KuboHttpAdapter,
  PinataAdapter,
  retrieveAndVerify,
  uploadWithRetry,
  type IpfsAdapter,
} from "@chainsphere/ipfs";
import { config } from "./config";

let cachedAdapter: IpfsAdapter | null = null;

export function getIpfsAdapter(): IpfsAdapter {
  if (cachedAdapter) return cachedAdapter;

  if (config.pinataJwt) {
    cachedAdapter = new PinataAdapter(config.pinataJwt, config.pinataGatewayUrl);
  } else if (config.ipfsApiUrl) {
    cachedAdapter = new KuboHttpAdapter(config.ipfsApiUrl, config.ipfsGatewayUrl);
  } else {
    cachedAdapter = new InMemoryIpfsAdapter();
  }
  return cachedAdapter;
}

/**
 * Stores encrypted message payloads & media files off-chain to IPFS / Pinata;
 * outputs immutable CIDs.
 */
export async function uploadEncryptedPayload(
  payload: Uint8Array,
  filename?: string
): Promise<{ cid: string; digestHex: string }> {
  const adapter = getIpfsAdapter();
  return uploadWithRetry(adapter, payload, { filename });
}

/**
 * Fetches encrypted payload from IPFS / Pinata and verifies digest.
 */
export async function fetchEncryptedPayload(
  cid: string,
  expectedDigestHex?: string
): Promise<Uint8Array> {
  const adapter = getIpfsAdapter();
  const res = await retrieveAndVerify(adapter, cid, expectedDigestHex);
  return res.bytes;
}
