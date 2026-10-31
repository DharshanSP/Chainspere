import { PeerManager, WebSocketTransport } from "@chainsphere/messaging";
import { envelopeSchema } from "@chainsphere/shared";
import type { Address, MessageEnvelope } from "@chainsphere/shared";
import { ZeroHash } from "ethers";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  decryptIncomingFile,
  decryptIncomingMessage,
  encryptDirectFile,
  encryptDirectMessage,
  isForUs,
} from "../services/chat";
import { anchorConfigured, config, identityRegistryConfigured } from "../services/config";
import { anchorContract, fetchIdentity, publicKeyFromIdentity } from "../services/contracts";
import { ChatStore, type Contact, type Conversation, type StoredMessage } from "../stores/chatStore";
import { loadOrCreateKeyPair, type StoredKeyMaterial } from "../stores/keyStore";
import { uploadEncryptedPayload } from "../services/ipfs";
import { useWallet } from "./WalletProvider";

export interface DecryptedFile {
  name: string;
  mime: string;
  url: string;
}

interface ChatContextValue {
  ready: boolean;
  keys: StoredKeyMaterial | null;
  signalingConnected: boolean;
  contacts: Contact[];
  conversations: Conversation[];
  activePeer: string | null;
  setActivePeer: (peer: string | null) => void;
  messages: StoredMessage[];
  lastError: string | null;
  /** Plaintext lives in memory only — never persisted. */
  plaintextOf: (messageId: string) => string | undefined;
  fileDataOf: (messageId: string) => DecryptedFile | undefined;
  addContact: (address: Address, label?: string, publicKeyB64?: string) => Promise<void>;
  removeContact: (address: Address) => void;
  deleteConversation: (conversationId: string) => void;
  sendText: (peer: Address, plaintext: string) => Promise<void>;
  sendFile: (peer: Address, file: File) => Promise<void>;
}

const ChatContext = createContext<ChatContextValue | null>(null);

const emptySnapshot = { contacts: [] as Contact[], conversations: [] as Conversation[], messages: {} };

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { address, provider, signer, session } = useWallet();
  const [keys, setKeys] = useState<StoredKeyMaterial | null>(null);
  const [ready, setReady] = useState(false);
  const [signalingConnected, setSignalingConnected] = useState(false);
  const [activePeer, setActivePeer] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [plaintext, setPlaintext] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, DecryptedFile>>({});

  const owner = address;
  const storeRef = useRef<ChatStore | null>(null);
  if (owner && storeRef.current === null) storeRef.current = new ChatStore(owner);
  const store = storeRef.current;

  const snapshot = useSyncExternalStore(
    (cb) => (store ? store.subscribe(cb) : () => {}),
    () => (store ? store.getSnapshot() : emptySnapshot)
  );

  const transportRef = useRef<WebSocketTransport | null>(null);
  const peersRef = useRef<PeerManager | null>(null);

  useEffect(() => {
    if (!session || !owner) return;
    let cancelled = false;
    setReady(false);
    void loadOrCreateKeyPair(owner).then((k) => {
      if (cancelled) return;
      setKeys(k);
      setReady(true);
    });
    return () => { cancelled = true; };
  }, [owner, session]);

  const rememberPlaintext = useCallback((id: string, text: string) => {
    setPlaintext((prev) => ({ ...prev, [id]: text }));
  }, []);

  const rememberFile = useCallback((id: string, file: DecryptedFile) => {
    setFiles((prev) => ({ ...prev, [id]: file }));
  }, []);

  const findConversationOf = useCallback((messageId: string): string | null => {
    if (!store) return null;
    const snap = store.getSnapshot();
    for (const [conversationId, list] of Object.entries(snap.messages)) {
      if (list.some((m) => m.id === messageId)) return conversationId;
    }
    return null;
  }, [store]);

  const handleIncoming = useCallback(async (payload: unknown) => {
    if (!keys || !owner || !store) return;
    const parsed = envelopeSchema.safeParse(payload);
    if (!parsed.success) return;
    const envelope = parsed.data as MessageEnvelope;
    if (!isForUs(envelope, owner)) return;
    const conversationId = envelope.from.toLowerCase();
    const base: StoredMessage = {
      id: envelope.id,
      conversationId,
      from: envelope.from,
      envelope,
      status: "received",
      createdAt: envelope.timestamp,
    };
    try {
      if (envelope.contentType === "file") {
        const fileBytes = await decryptIncomingFile(envelope, keys);
        const mime = envelope.fileMime || "application/octet-stream";
        const blob = new Blob([fileBytes as unknown as BlobPart], { type: mime });
        const url = URL.createObjectURL(blob);
        const name = envelope.fileName || "attachment";
        rememberFile(envelope.id, { name, mime, url });
      } else {
        const plain = await decryptIncomingMessage(envelope, keys);
        rememberPlaintext(envelope.id, plain);
      }
      store.upsertConversation(owner, envelope.from);
      store.addMessage(owner, { ...base, status: "delivered" });
    } catch {
      store.addMessage(owner, { ...base, status: "failed" });
    }
  }, [keys, owner, store, rememberPlaintext, rememberFile]);

  useEffect(() => {
    if (!ready || !owner || !keys) return;
    const transport = new WebSocketTransport(config.signalingUrl, owner);
    transportRef.current = transport;
    const peers = new PeerManager(
      owner,
      transport,
      {
        onAck: (msgId) => {
          const conversationId = findConversationOf(msgId);
          if (conversationId) store?.updateMessage(owner, conversationId, msgId, { status: "delivered" });
        },
      },
      undefined,
      { iceServers: config.stunServers.map((urls) => ({ urls })) }
    );
    peersRef.current = peers;

    const offStatus = transport.onStatus(setSignalingConnected);
    const offMsg = transport.onMessage((m) => {
      if (m.type === "envelope") void handleIncoming(m.payload);
    });

    void transport.connect().catch((e) => setLastError((e as Error).message));
    void peers.start().catch(() => { /* connect errors surface through transport status */ });

    return () => {
      offStatus();
      offMsg();
      peers.stop();
      transport.disconnect();
      transportRef.current = null;
      peersRef.current = null;
    };
  }, [ready, owner, keys, handleIncoming, store, findConversationOf]);

  const resolvePeerPublicKey = useCallback(async (peer: Address): Promise<string | null> => {
    if (!provider || !identityRegistryConfigured || !owner) return null;
    try {
      const identity = await fetchIdentity(provider, config.identityRegistry, peer);
      const pub = publicKeyFromIdentity(identity);
      if (pub) store?.upsertContact(owner, { address: peer, publicKeyB64: pub, addedAt: Date.now() });
      return pub;
    } catch {
      return null;
    }
  }, [provider, store, owner]);

  const addContact = useCallback(async (peer: Address, label?: string, publicKeyB64?: string) => {
    if (!owner || !store) return;
    const targetPeer = peer.toLowerCase() as Address;
    const cleanKey = publicKeyB64 ? publicKeyB64.replace(/\s+/g, "+").trim() : undefined;
    const resolved = cleanKey ?? (await resolvePeerPublicKey(targetPeer));
    store.upsertContact(owner, { address: targetPeer, label, publicKeyB64: resolved ?? undefined, addedAt: Date.now() });
    store.upsertConversation(owner, targetPeer, label);
  }, [owner, store, resolvePeerPublicKey]);

  const removeContact = useCallback((peer: Address) => {
    if (!owner || !store) return;
    store.removeContact(owner, peer.toLowerCase() as Address);
  }, [owner, store]);

  const deleteConversation = useCallback((conversationId: string) => {
    if (!owner || !store) return;
    store.deleteConversation(owner, conversationId);
    if (activePeer && (activePeer.toLowerCase() === conversationId.toLowerCase())) {
      setActivePeer(null);
    }
  }, [owner, store, activePeer]);

  const anchorMessage = useCallback(async (conversationId: string, envelope: MessageEnvelope) => {
    if (!signer || !anchorConfigured || !store || !owner) return;
    try {
      store.updateMessage(owner, conversationId, envelope.id, { status: "anchoring" });

      // Off-chain IPFS / Pinata encrypted storage -> outputs immutable CID
      let cid = "";
      try {
        const payloadBytes = new TextEncoder().encode(JSON.stringify(envelope));
        const res = await uploadEncryptedPayload(payloadBytes, `envelope-${envelope.id}.json`);
        cid = res.cid;
      } catch (ipfsErr) {
        console.warn("IPFS off-chain storage fallback skipped:", ipfsErr);
      }

      const contract = anchorContract(signer, config.messageAnchor);
      const tx = await contract.anchor(`0x${envelope.id}`, ZeroHash, `0x${envelope.digest}`, cid);
      await tx.wait();
      store.updateMessage(owner, conversationId, envelope.id, {
        status: "anchored",
        txHash: String(tx.hash),
        cid: cid || undefined,
      });
    } catch (e) {
      store.updateMessage(owner, conversationId, envelope.id, { status: "sent" });
      console.warn("On-chain message anchor skipped or unconfirmed:", e);
      // We intentionally do not set lastError here so optional anchoring doesn't show a false error banner when P2P delivery succeeded.
    }
  }, [signer, store, owner]);

  const sendText = useCallback(async (peer: Address, plaintext: string) => {
    if (!keys || !owner || !store) throw new Error("Chat is not ready yet");
    setLastError(null);
    try {
      const targetPeer = peer.toLowerCase() as Address;
      let peerKey = store.findContact(targetPeer)?.publicKeyB64 ?? null;
      if (!peerKey) peerKey = await resolvePeerPublicKey(targetPeer);
      if (!peerKey) {
        throw new Error("Peer public key unknown — add the contact with their P-256 public key, or register both wallets on-chain.");
      }
      peerKey = peerKey.replace(/\s+/g, "+").trim();
      const envelope = await encryptDirectMessage({
        plaintext, from: owner, to: targetPeer, self: keys, peerPublicKeyB64: peerKey,
      });
      const conversationId = targetPeer.toLowerCase();
      store.upsertConversation(owner, targetPeer);
      store.addMessage(owner, {
        id: envelope.id,
        conversationId,
        from: owner,
        envelope,
        status: "sending",
        createdAt: envelope.timestamp,
      });
      rememberPlaintext(envelope.id, plaintext);

      const peers = peersRef.current;
      const transport = transportRef.current;
      let delivered = false;
      if (peers && peers.state(targetPeer) === "connected") {
        delivered = await peers.sendEnvelope(targetPeer, envelope.id, envelope);
      }
      if (!delivered && transport?.connected) {
        transport.send({ type: "envelope", from: owner, to: targetPeer, room: conversationId, payload: envelope, ts: Date.now() });
        delivered = true;
      }
      store.updateMessage(owner, conversationId, envelope.id, { status: delivered ? "sent" : "failed" });
      if (delivered) void anchorMessage(conversationId, envelope);
      else setLastError("Recipient unreachable — message kept locally as failed.");
    } catch (err) {
      const msg = (err as Error).message || "Failed to send message";
      setLastError(msg);
      throw err;
    }
  }, [keys, owner, store, resolvePeerPublicKey, rememberPlaintext, anchorMessage]);

  const sendFile = useCallback(async (peer: Address, file: File) => {
    if (!keys || !owner || !store) throw new Error("Chat is not ready yet");
    setLastError(null);
    try {
      const targetPeer = peer.toLowerCase() as Address;
      let peerKey = store.findContact(targetPeer)?.publicKeyB64 ?? null;
      if (!peerKey) peerKey = await resolvePeerPublicKey(targetPeer);
      if (!peerKey) {
        throw new Error("Peer public key unknown — add the contact with their P-256 public key, or register both wallets on-chain.");
      }
      peerKey = peerKey.replace(/\s+/g, "+").trim();
      const buffer = await file.arrayBuffer();
      const fileBytes = new Uint8Array(buffer);
      const envelope = await encryptDirectFile({
        fileBytes,
        fileName: file.name,
        fileMime: file.type || "application/octet-stream",
        from: owner,
        to: targetPeer,
        self: keys,
        peerPublicKeyB64: peerKey,
      });
      const conversationId = targetPeer.toLowerCase();
      store.upsertConversation(owner, targetPeer);
      store.addMessage(owner, {
        id: envelope.id,
        conversationId,
        from: owner,
        envelope,
        status: "sending",
        createdAt: envelope.timestamp,
      });
      const url = URL.createObjectURL(file);
      rememberFile(envelope.id, { name: file.name, mime: file.type || "application/octet-stream", url });

      const peers = peersRef.current;
      const transport = transportRef.current;
      let delivered = false;
      if (peers && peers.state(targetPeer) === "connected") {
        delivered = await peers.sendEnvelope(targetPeer, envelope.id, envelope);
      }
      if (!delivered && transport?.connected) {
        transport.send({ type: "envelope", from: owner, to: targetPeer, room: conversationId, payload: envelope, ts: Date.now() });
        delivered = true;
      }
      store.updateMessage(owner, conversationId, envelope.id, { status: delivered ? "sent" : "failed" });
      if (delivered) void anchorMessage(conversationId, envelope);
      else setLastError("Recipient unreachable — message kept locally as failed.");
    } catch (err) {
      const msg = (err as Error).message || "Failed to send file";
      setLastError(msg);
      throw err;
    }
  }, [keys, owner, store, resolvePeerPublicKey, rememberFile, anchorMessage]);

  const messages = useMemo(
    () => (store && activePeer ? store.messagesFor(activePeer) : []),
    [store, activePeer, snapshot]
  );

  const value = useMemo<ChatContextValue>(() => ({
    ready,
    keys,
    signalingConnected,
    contacts: snapshot.contacts,
    conversations: snapshot.conversations,
    activePeer,
    setActivePeer,
    messages,
    lastError,
    plaintextOf: (id) => plaintext[id],
    fileDataOf: (id) => files[id],
    addContact,
    removeContact,
    deleteConversation,
    sendText,
    sendFile,
  }), [ready, keys, signalingConnected, snapshot, activePeer, messages, lastError, plaintext, files, addContact, removeContact, deleteConversation, sendText, sendFile]);

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used inside ChatProvider");
  return ctx;
}
