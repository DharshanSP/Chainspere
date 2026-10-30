import { decryptEnvelope, decryptText, encryptEnvelope, encryptText, newMessageIdHex } from "@chainsphere/crypto";
import type { Address, MessageEnvelope } from "@chainsphere/shared";
import type { StoredKeyMaterial } from "../stores/keyStore";

export interface DirectMessageInput {
  plaintext: string;
  from: Address;
  to: Address;
  self: StoredKeyMaterial;
  peerPublicKeyB64: string;
  keyVersion?: number;
  timestamp?: number;
}

export interface DirectFileInput {
  fileBytes: Uint8Array;
  fileName: string;
  fileMime: string;
  from: Address;
  to: Address;
  self: StoredKeyMaterial;
  peerPublicKeyB64: string;
  keyVersion?: number;
  timestamp?: number;
}

/** Encrypt a 1:1 message for the peer + self (self-wrapped key enables own-history reads). */
export async function encryptDirectMessage(input: DirectMessageInput): Promise<MessageEnvelope> {
  return encryptText(input.plaintext, {
    id: newMessageIdHex(),
    from: input.from,
    to: input.to,
    groupId: null,
    keyVersion: input.keyVersion ?? 1,
    timestamp: input.timestamp,
    contentType: "text",
    recipients: [
      { id: input.to.toLowerCase(), publicKeyB64: input.peerPublicKeyB64 },
      { id: input.from.toLowerCase(), publicKeyB64: input.self.publicKeyB64 },
    ],
  });
}

/** Encrypt a 1:1 file attachment for the peer + self. */
export async function encryptDirectFile(input: DirectFileInput): Promise<MessageEnvelope> {
  return encryptEnvelope(input.fileBytes, {
    id: newMessageIdHex(),
    from: input.from,
    to: input.to,
    groupId: null,
    keyVersion: input.keyVersion ?? 1,
    timestamp: input.timestamp,
    contentType: "file",
    fileName: input.fileName,
    fileMime: input.fileMime,
    recipients: [
      { id: input.to.toLowerCase(), publicKeyB64: input.peerPublicKeyB64 },
      { id: input.from.toLowerCase(), publicKeyB64: input.self.publicKeyB64 },
    ],
  });
}

/** Decrypt an incoming envelope for the local wallet. Throws when unauthorized/tampered. */
export async function decryptIncomingMessage(
  envelope: MessageEnvelope,
  self: StoredKeyMaterial
): Promise<string> {
  return decryptText(envelope, self.address, self.privateKey);
}

/** Decrypt an incoming file envelope for the local wallet. */
export async function decryptIncomingFile(
  envelope: MessageEnvelope,
  self: StoredKeyMaterial
): Promise<Uint8Array> {
  return decryptEnvelope(envelope, self.address, self.privateKey);
}

export function isForUs(envelope: MessageEnvelope, self: Address): boolean {
  const me = self.toLowerCase();
  if (envelope.to && envelope.to.toLowerCase() === me) return true;
  return envelope.wrappedKeys.some((w) => w.recipient.toLowerCase() === me);
}

