/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_URL?: string;
  readonly VITE_CHAIN_ID?: string;
  readonly VITE_LOCAL_RPC_URL?: string;
  readonly VITE_TESTNET_RPC_URL?: string;
  readonly VITE_IDENTITY_REGISTRY_ADDRESS?: string;
  readonly VITE_CONVERSATION_REGISTRY_ADDRESS?: string;
  readonly VITE_MESSAGE_ANCHOR_ADDRESS?: string;
  readonly VITE_IPFS_API_URL?: string;
  readonly VITE_IPFS_GATEWAY_URL?: string;
  readonly VITE_SIGNALING_URL?: string;
  readonly VITE_STUN_SERVERS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  ethereum?: import("ethers").Eip1193Provider;
}
