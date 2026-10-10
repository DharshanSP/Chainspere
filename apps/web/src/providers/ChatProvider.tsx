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
import { decryptIncomingMessage, encryptDirectMessage, isForUs } from "../services/chat";
import { anchorConfigured, config, identityRegistryConfigured } from "../services/config";
import { anchorContract, fetchIdentity, publicKeyFromIdentity } from "../services/contracts";
import { ChatStore, type Contact, type Conversation, type StoredMessage } from "../stores/chatStore";
import { loadOrCreateKeyPair, type StoredKeyMaterial } from "../stores/keyStore";
import { useWallet } from "./WalletProvider";

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
  addContact: (address: Address, label?: string, publicKeyB64?: string) => Promise<void>;
  removeContact: (address: Address) => void;
  sendText: (peer: Address, plaintext: string) => Promise<void>;
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
      const plain = await decryptIncomingMessage(envelope, keys);
      store.upsertConversation(owner, envelope.from);
      store.addMessage(owner, { ...base, status: "delivered" });
      rememberPlaintext(envelope.id, plain);
    } catch {
      store.addMessage(owner, { ...base, status: "failed" });
    }
  }, [keys, owner, store, rememberPlaintext]);

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
    const resolved = publicKeyB64 ?? (await resolvePeerPublicKey(peer));
    store.upsertContact(owner, { address: peer, label, publicKeyB64: resolved ?? undefined, addedAt: Date.now() });
    store.upsertConversation(owner, peer, label);
  }, [owner, store, resolvePeerPublicKey]);

  const removeContact = useCallback((peer: Address) => {
    if (!owner || !store) return;
    store.removeContact(owner, peer);
  }, [owner, store]);

  const anchorMessage = useCallback(async (conversationId: string, envelope: MessageEnvelope) => {
    if (!signer || !anchorConfigured || !store || !owner) return;
    try {
      store.updateMessage(owner, conversationId, envelope.id, { status: "anchoring" });
      const contract = anchorContract(signer, config.messageAnchor);
      const tx = await contract.anchor(`0x${envelope.id}`, ZeroHash, `0x${envelope.digest}`, "");
      await tx.wait();
      store.updateMessage(owner, conversationId, envelope.id, { status: "anchored", txHash: String(tx.hash) });
    } catch (e) {
      store.updateMessage(owner, conversationId, envelope.id, { status: "sent" });
      setLastError(`On-chain anchor failed: ${(e as Error).message}`);
    }
  }, [signer, store, owner]);

  const sendText = useCallback(async (peer: Address, plaintext: string) => {
    if (!keys || !owner || !store) throw new Error("Chat is not ready yet");
    setLastError(null);
    let peerKey = store.findContact(peer)?.publicKeyB64 ?? null;
    if (!peerKey) peerKey = await resolvePeerPublicKey(peer);
    if (!peerKey) {
      throw new Error("Peer public key unknown — add the contact with their P-256 public key, or register both wallets on-chain.");
    }
    const envelope = await encryptDirectMessage({
      plaintext, from: owner, to: peer, self: keys, peerPublicKeyB64: peerKey,
    });
    const conversationId = peer.toLowerCase();
    store.upsertConversation(owner, peer);
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
    if (peers && peers.state(peer) === "connected") {
      delivered = await peers.sendEnvelope(peer, envelope.id, envelope);
    }
    if (!delivered && transport?.connected) {
      transport.send({ type: "envelope", from: owner, to: peer, room: conversationId, payload: envelope, ts: Date.now() });
      delivered = true;
    }
    store.updateMessage(owner, conversationId, envelope.id, { status: delivered ? "sent" : "failed" });
    if (delivered) void anchorMessage(conversationId, envelope);
    else setLastError("Recipient unreachable — message kept locally as failed.");
  }, [keys, owner, store, resolvePeerPublicKey, rememberPlaintext, anchorMessage]);

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
    addContact,
    removeContact,
    sendText,
  }), [ready, keys, signalingConnected, snapshot, activePeer, messages, lastError, plaintext, addContact, removeContact, sendText]);

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used inside ChatProvider");
  return ctx;
}
