export const ENVELOPE_VERSION = 1 as const;
export const AES_GCM_IV_BYTES = 12;
export const AES_KEY_BYTES = 32;
export const MAX_MESSAGE_CHARS = 8_000;
export const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MiB v1 limit (documented)
export const MAX_ENVELOPE_BYTES = 32 * 1024 * 1024;
export const HKDF_INFO = "chainsphere-msg-v1";
export const CHALLENGE_TTL_MS = 5 * 60 * 1000;
export const ACK_TIMEOUT_MS = 8_000;
export const MAX_RETRIES = 5;
export const RECONNECT_BASE_MS = 1_000;
export const RECONNECT_MAX_MS = 30_000;
export const SUPPORTED_NETWORKS: Record<number, string> = {
  31337: "Hardhat Local",
  80002: "Polygon Amoy",
  11155111: "Sepolia",
};
