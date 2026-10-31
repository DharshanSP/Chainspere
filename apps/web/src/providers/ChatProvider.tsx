import { WebSocketTransport } from "@chainsphere/messaging";
import { envelopeSchema } from "@chainsphere/shared";
import type { Address, MessageEnvelope } from "@chainsphere/shared";
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
import { config } from "../services/config";
import { ChatStore, type Contact, type Conversation, type StoredMessage } from "../stores/chatStore";
import { loadOrCreateKeyPair, type StoredKeyMaterial } from "../stores/keyStore";
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
  clearError: () => void;
  plaintextOf: (messageId: string) => string | undefined;
  fileDataOf: (messageId: string) => DecryptedFile | undefined;
  addContact: (address: Address, label?: string, publicKeyB64?: string) => void;
  removeContact: (address: Address) => void;
  deleteConversation: (conversationId: string) => void;
  sendText: (peer: Address, plaintext: string) => Promise<void>;
  sendFile: (peer: Address, file: File) => Promise<void>;
}

const ChatContext = createContext<ChatContextValue | null>(null);
const emptySnapshot = { contacts: [] as Contact[], conversations: [] as Conversation[], messages: {} };

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { address, session } = useWallet();
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
  // In-memory cache of peer public keys received via key-exchange frames
  const peerKeyCache = useRef<Record<string, string>>({});
  const keysRef = useRef<StoredKeyMaterial | null>(null);
  keysRef.current = keys;

  // ── Load/create keypair on sign-in ────────────────────────────────────────
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

  // ── Helpers ───────────────────────────────────────────────────────────────
  const rememberPlaintext = useCallback((id: string, text: string) => {
    setPlaintext((prev) => ({ ...prev, [id]: text }));
  }, []);

  const rememberFile = useCallback((id: string, file: DecryptedFile) => {
    setFiles((prev) => ({ ...prev, [id]: file }));
  }, []);

  const getPeerKey = useCallback((peer: string): string | null => {
    const lc = peer.toLowerCase();
    if (peerKeyCache.current[lc]) return peerKeyCache.current[lc];
    return store?.findContact(lc as Address)?.publicKeyB64 ?? null;
  }, [store]);

  // ── Handle incoming signaling frames ──────────────────────────────────────
  const handlePresence = useCallback((m: { from: string; payload: unknown }) => {
    const k = keysRef.current;
    if (!k || !owner || !store) return;
    const p = m.payload as { action?: string; publicKeyB64?: string; from?: string } | null;
    if (!p || typeof p !== "object") return;
    const sender = m.from.toLowerCase() as Address;

    if (p.publicKeyB64) {
      const cleanKey = p.publicKeyB64.replace(/\s+/g, "+").trim();
      peerKeyCache.current[sender] = cleanKey;
      const existing = store.findContact(sender);
      if (existing) {
        store.upsertContact(owner, { ...existing, publicKeyB64: cleanKey });
      }
    }

    // If peer is requesting our public key, send it back immediately
    if (p.action === "key-request" && k.publicKeyB64 && transportRef.current?.connected) {
      transportRef.current.send({
        type: "presence",
        from: owner,
        to: sender,
        room: sender,
        payload: { action: "key-exchange", from: owner, publicKeyB64: k.publicKeyB64 },
        ts: Date.now(),
      });
    }
  }, [owner, store]);

  const handleIncoming = useCallback(async (payload: unknown) => {
    const k = keysRef.current;
    if (!k || !owner || !store) return;

    // Encrypted message envelope
    const parsed = envelopeSchema.safeParse(payload);
    if (!parsed.success) return;
    const envelope = parsed.data as MessageEnvelope;
    if (!isForUs(envelope, owner)) return;

    const fromLc = envelope.from.toLowerCase() as Address;
    const conversationId = fromLc;

    // Automatically pull and cache the sender's public key if included
    if (envelope.senderPublicKey) {
      const cleanKey = envelope.senderPublicKey.replace(/\s+/g, "+").trim();
      peerKeyCache.current[fromLc] = cleanKey;
      const existing = store.findContact(fromLc);
      if (existing && !existing.publicKeyB64) {
        store.upsertContact(owner, { ...existing, publicKeyB64: cleanKey });
      }
    }

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
        const fileBytes = await decryptIncomingFile(envelope, k);
        const mime = envelope.fileMime || "application/octet-stream";
        const blob = new Blob([fileBytes as unknown as BlobPart], { type: mime });
        rememberFile(envelope.id, { name: envelope.fileName || "attachment", mime, url: URL.createObjectURL(blob) });
      } else {
        rememberPlaintext(envelope.id, await decryptIncomingMessage(envelope, k));
      }
      store.upsertConversation(owner, envelope.from);
      store.addMessage(owner, { ...base, status: "delivered" });

      // Automatically reply with our public key so sender can reach us back
      if (transportRef.current?.connected && k.publicKeyB64) {
        transportRef.current.send({
          type: "presence",
          from: owner,
          to: envelope.from,
          room: conversationId,
          payload: { action: "key-exchange", from: owner, publicKeyB64: k.publicKeyB64 },
          ts: Date.now(),
        });
      }
    } catch (e) {
      store.addMessage(owner, { ...base, status: "failed" });
      console.warn("[chat] decrypt error:", e);
    }
  }, [owner, store, rememberPlaintext, rememberFile]);

  // ── WebSocket signaling connection ────────────────────────────────────────
  useEffect(() => {
    if (!ready || !owner || !keys) return;

    const transport = new WebSocketTransport(config.signalingUrl, owner);
    transportRef.current = transport;

    const offStatus = transport.onStatus(setSignalingConnected);
    const offMsg = transport.onMessage((m) => {
      if (m.type === "envelope") void handleIncoming(m.payload);
      if (m.type === "presence") handlePresence(m);
    });

    void transport.connect().catch((e) => setLastError((e as Error).message));

    return () => {
      offStatus();
      offMsg();
      transport.disconnect();
      transportRef.current = null;
    };
  }, [ready, owner, keys, handleIncoming, handlePresence]);

  // ── Contact management ────────────────────────────────────────────────────
  const addContact = useCallback((peer: Address, label?: string, publicKeyB64?: string) => {
    if (!owner || !store) return;
    const peerLc = peer.toLowerCase() as Address;
    const cleanKey = publicKeyB64 ? publicKeyB64.replace(/\s+/g, "+").trim() : undefined;

    // Cache key in memory
    if (cleanKey) peerKeyCache.current[peerLc] = cleanKey;

    store.upsertContact(owner, {
      address: peerLc,
      label,
      publicKeyB64: cleanKey ?? peerKeyCache.current[peerLc] ?? undefined,
      addedAt: Date.now(),
    });
    store.upsertConversation(owner, peerLc, label);

    // Send them our public key over signaling so they can message us back
    const transport = transportRef.current;
    if (transport?.connected && keys?.publicKeyB64) {
      transport.send({
        type: "presence",
        from: owner,
        to: peerLc,
        room: peerLc,
        payload: { action: "key-exchange", from: owner, publicKeyB64: keys.publicKeyB64 },
        ts: Date.now(),
      });
    }
  }, [owner, store, keys]);

  const removeContact = useCallback((peer: Address) => {
    if (!owner || !store) return;
    store.removeContact(owner, peer.toLowerCase() as Address);
  }, [owner, store]);

  const deleteConversation = useCallback((conversationId: string) => {
    if (!owner || !store) return;
    store.deleteConversation(owner, conversationId);
    if (activePeer?.toLowerCase() === conversationId.toLowerCase()) setActivePeer(null);
  }, [owner, store, activePeer]);

  // ── Send text ─────────────────────────────────────────────────────────────
  const sendText = useCallback(async (peer: Address, text: string) => {
    if (!keys || !owner || !store) { setLastError("Chat not ready yet."); return; }
    setLastError(null);
    const peerLc = peer.toLowerCase() as Address;
    let peerKey = getPeerKey(peerLc);

    // If key not yet cached, attempt instant key negotiation over signaling
    if (!peerKey) {
      if (transportRef.current?.connected && keys.publicKeyB64) {
        transportRef.current.send({
          type: "presence",
          from: owner,
          to: peerLc,
          room: peerLc,
          payload: { action: "key-request", from: owner, publicKeyB64: keys.publicKeyB64 },
          ts: Date.now(),
        });
      }
      for (let i = 0; i < 5; i++) {
        await new Promise((r) => setTimeout(r, 150));
        peerKey = getPeerKey(peerLc);
        if (peerKey) break;
      }
    }

    if (!peerKey) {
      setLastError("Peer encryption key is not known yet. Ask your friend to open ChainSphere, or use an invite link.");
      return;
    }
    const conversationId = peerLc;
    let envelope: MessageEnvelope;
    try {
      envelope = await encryptDirectMessage({
        plaintext: text,
        from: owner,
        to: peerLc,
        self: keys,
        peerPublicKeyB64: peerKey.replace(/\s+/g, "+").trim(),
      });
    } catch (e) {
      setLastError(`Encryption failed: ${(e as Error).message}`);
      return;
    }
    store.upsertConversation(owner, peerLc);
    store.addMessage(owner, { id: envelope.id, conversationId, from: owner, envelope, status: "sending", createdAt: envelope.timestamp });
    rememberPlaintext(envelope.id, text);

    const transport = transportRef.current;
    if (transport?.connected) {
      transport.send({ type: "envelope", from: owner, to: peerLc, room: conversationId, payload: envelope, ts: Date.now() });
      store.updateMessage(owner, conversationId, envelope.id, { status: "sent" });
    } else {
      store.updateMessage(owner, conversationId, envelope.id, { status: "failed" });
      setLastError("Not connected to signaling server — check your network and ensure the server is running.");
    }
  }, [keys, owner, store, getPeerKey, rememberPlaintext]);

  // ── Send file ─────────────────────────────────────────────────────────────
  const sendFile = useCallback(async (peer: Address, file: File) => {
    if (!keys || !owner || !store) { setLastError("Chat not ready yet."); return; }
    setLastError(null);
    const peerLc = peer.toLowerCase() as Address;
    let peerKey = getPeerKey(peerLc);

    if (!peerKey) {
      if (transportRef.current?.connected && keys.publicKeyB64) {
        transportRef.current.send({
          type: "presence",
          from: owner,
          to: peerLc,
          room: peerLc,
          payload: { action: "key-request", from: owner, publicKeyB64: keys.publicKeyB64 },
          ts: Date.now(),
        });
      }
      for (let i = 0; i < 5; i++) {
        await new Promise((r) => setTimeout(r, 150));
        peerKey = getPeerKey(peerLc);
        if (peerKey) break;
      }
    }

    if (!peerKey) {
      setLastError("Peer encryption key is not known yet. Ask them to open the app first.");
      return;
    }
    const conversationId = peerLc;
    const buffer = await file.arrayBuffer();
    let envelope: MessageEnvelope;
    try {
      envelope = await encryptDirectFile({
        fileBytes: new Uint8Array(buffer),
        fileName: file.name,
        fileMime: file.type || "application/octet-stream",
        from: owner,
        to: peerLc,
        self: keys,
        peerPublicKeyB64: peerKey.replace(/\s+/g, "+").trim(),
      });
    } catch (e) {
      setLastError(`Encryption failed: ${(e as Error).message}`);
      return;
    }
    store.upsertConversation(owner, peerLc);
    store.addMessage(owner, { id: envelope.id, conversationId, from: owner, envelope, status: "sending", createdAt: envelope.timestamp });
    rememberFile(envelope.id, { name: file.name, mime: file.type || "application/octet-stream", url: URL.createObjectURL(file) });

    const transport = transportRef.current;
    if (transport?.connected) {
      transport.send({ type: "envelope", from: owner, to: peerLc, room: conversationId, payload: envelope, ts: Date.now() });
      store.updateMessage(owner, conversationId, envelope.id, { status: "sent" });
    } else {
      store.updateMessage(owner, conversationId, envelope.id, { status: "failed" });
      setLastError("Not connected to signaling server.");
    }
  }, [keys, owner, store, getPeerKey, rememberFile]);

  // ── Derived ───────────────────────────────────────────────────────────────
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
    clearError: () => setLastError(null),
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
