// ChainSphere shared domain types. No secrets here — envelopes carry ciphertext only.

export type Address = `0x${string}`;

export type MessageStatus =
  | "composing" | "encrypting" | "sending" | "sent" | "received"
  | "delivered" | "read" | "anchoring" | "anchored"
  | "verified" | "failed";

export interface WrappedKey {
  recipient: string; // wallet address (lowercased) or member id
  ephemPub: string; // base64 raw uncompressed P-256 (65 bytes)
  wrappedKey: string; // base64 AES-GCM wrap of message/group key
  iv: string; // base64 12-byte IV used for key wrap
}

export interface MessageEnvelope {
  v: 1;
  id: string; // client-generated unique id (hex)
  from: Address;
  to: Address | null; // null for group messages
  groupId: string | null;
  keyVersion: number;
  iv: string; // base64 12B
  ciphertext: string; // base64 AES-256-GCM(payload)
  wrappedKeys: WrappedKey[];
  timestamp: number;
  contentType: "text" | "file";
  fileName?: string;
  fileMime?: string;
  digest: string; // hex SHA-256 over canonical encrypted bytes (integrity)
}

export interface Contact {
  address: Address;
  label?: string;
  keyFingerprint?: string;
  keyVersion?: number;
  addedAt: number;
}

export interface Conversation {
  id: string; // 1:1 => peer address lowercased; group => groupId
  kind: "direct" | "group";
  peer?: Address;
  groupId?: string;
  name: string;
  lastMessageAt?: number;
  unread?: number;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  from: Address;
  plaintext?: string; // only held in memory after decrypt; never persisted in clear
  envelope: MessageEnvelope;
  status: MessageStatus;
  txHash?: string;
  cid?: string;
  verified?: boolean;
  createdAt: number;
}

export interface AuthChallenge {
  domain: string;
  uri: string;
  address: Address;
  chainId: number;
  nonce: string;
  issuedAt: string;
  expiration: string;
  statement: string;
}

export interface Session {
  address: Address;
  chainId: number;
  issuedAt: number;
  expiresAt: number;
  signature: string;
}
