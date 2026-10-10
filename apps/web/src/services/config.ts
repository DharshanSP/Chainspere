export const config = {
  appUrl: import.meta.env.VITE_APP_URL ?? window.location.origin,
  chainId: Number(import.meta.env.VITE_CHAIN_ID ?? 31337),
  rpcUrl: import.meta.env.VITE_LOCAL_RPC_URL ?? "http://127.0.0.1:8545",
  identityRegistry: import.meta.env.VITE_IDENTITY_REGISTRY_ADDRESS ?? "",
  conversationRegistry: import.meta.env.VITE_CONVERSATION_REGISTRY_ADDRESS ?? "",
  messageAnchor: import.meta.env.VITE_MESSAGE_ANCHOR_ADDRESS ?? "",
  ipfsApiUrl: import.meta.env.VITE_IPFS_API_URL ?? "http://127.0.0.1:5001",
  ipfsGatewayUrl: import.meta.env.VITE_IPFS_GATEWAY_URL ?? "https://ipfs.io",
  signalingUrl: import.meta.env.VITE_SIGNALING_URL ?? "ws://localhost:8081",
  stunServers: (import.meta.env.VITE_STUN_SERVERS ?? "stun:stun.l.google.com:19302")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
};

export const identityRegistryConfigured = config.identityRegistry.length > 0;
export const anchorConfigured = config.messageAnchor.length > 0;
