function resolveHost(url: string): string {
  if (typeof window === "undefined") return url;
  const host = window.location.hostname;
  if (!host || host === "localhost" || host === "127.0.0.1") return url;
  return url.replace("localhost", host).replace("127.0.0.1", host);
}

export const config = {
  appUrl: import.meta.env.VITE_APP_URL ?? (typeof window !== "undefined" ? window.location.origin : "http://localhost:5173"),
  chainId: Number(import.meta.env.VITE_CHAIN_ID ?? 31337),
  rpcUrl: resolveHost(import.meta.env.VITE_LOCAL_RPC_URL ?? "http://127.0.0.1:8545"),
  identityRegistry: import.meta.env.VITE_IDENTITY_REGISTRY_ADDRESS ?? "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  conversationRegistry: import.meta.env.VITE_CONVERSATION_REGISTRY_ADDRESS ?? "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  messageAnchor: import.meta.env.VITE_MESSAGE_ANCHOR_ADDRESS ?? "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
  ipfsApiUrl: resolveHost(import.meta.env.VITE_IPFS_API_URL ?? "http://127.0.0.1:5001"),
  ipfsGatewayUrl: import.meta.env.VITE_IPFS_GATEWAY_URL ?? "https://ipfs.io",
  pinataJwt: import.meta.env.VITE_PINATA_JWT ?? "",
  pinataGatewayUrl: import.meta.env.VITE_PINATA_GATEWAY_URL ?? "https://gateway.pinata.cloud",
  signalingUrl: resolveHost(import.meta.env.VITE_SIGNALING_URL ?? "ws://localhost:8081"),
  stunServers: (import.meta.env.VITE_STUN_SERVERS ?? "stun:stun.l.google.com:19302")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
};

export const identityRegistryConfigured = config.identityRegistry.length > 0;
export const anchorConfigured = config.messageAnchor.length > 0;
