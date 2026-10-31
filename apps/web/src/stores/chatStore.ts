import type { Address, MessageEnvelope, MessageStatus } from "@chainsphere/shared";
import { readJson, writeJson } from "../lib/storage";

export interface Contact {
  address: Address;
  label?: string;
  /** P-256 public key (base64). Cached from IdentityRegistry or imported locally. */
  publicKeyB64?: string;
  addedAt: number;
}

export interface Conversation {
  id: string;
  peer: Address;
  name: string;
  lastMessageAt?: number;
}

/** Only ciphertext envelopes are persisted — never plaintext. */
export interface StoredMessage {
  id: string;
  conversationId: string;
  from: Address;
  envelope: MessageEnvelope;
  status: MessageStatus;
  txHash?: string;
  cid?: string;
  createdAt: number;
}

export interface ChatSnapshot {
  contacts: Contact[];
  conversations: Conversation[];
  messages: Record<string, StoredMessage[]>;
}

export function emptySnapshot(): ChatSnapshot {
  return { contacts: [], conversations: [], messages: {} };
}

const storageKeyFor = (owner: Address) => `chainsphere.chat.v1.${owner.toLowerCase()}`;

/** Local-first chat state: envelopes only, persisted per wallet. */
export class ChatStore {
  private snapshot: ChatSnapshot;
  private listeners = new Set<() => void>();

  constructor(owner: Address) {
    this.snapshot = normalize(readJson<ChatSnapshot>(localStorage, storageKeyFor(owner), emptySnapshot()));
  }

  getSnapshot = (): ChatSnapshot => this.snapshot;

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  };

  private commit(): void {
    this.listeners.forEach((l) => l());
  }

  private persist(owner: Address): void {
    writeJson(localStorage, storageKeyFor(owner), this.snapshot);
  }

  upsertContact(owner: Address, contact: Contact): void {
    const target = contact.address.toLowerCase();
    const normalized: Contact = { ...contact, address: target as Address };
    const filtered = this.snapshot.contacts.filter((c) => c.address.toLowerCase() !== target);
    this.snapshot.contacts = [normalized, ...filtered];
    this.persist(owner);
    this.commit();
  }

  removeContact(owner: Address, address: Address): void {
    const target = address.toLowerCase();
    this.snapshot.contacts = this.snapshot.contacts.filter((c) => c.address.toLowerCase() !== target);
    this.persist(owner);
    this.commit();
  }

  findContact(address: Address): Contact | undefined {
    const target = address.toLowerCase();
    return this.snapshot.contacts.find((c) => c.address.toLowerCase() === target);
  }

  upsertConversation(owner: Address, peer: Address, name?: string): Conversation {
    const id = peer.toLowerCase();
    const existing = this.snapshot.conversations.find((c) => c.id.toLowerCase() === id || c.peer.toLowerCase() === id);
    if (existing) {
      if (name && name !== existing.name) existing.name = name;
      // Filter any duplicate conversation records
      const other = this.snapshot.conversations.filter((c) => c.id.toLowerCase() !== id && c.peer.toLowerCase() !== id);
      this.snapshot.conversations = [existing, ...other].sort(sortConversations);
      this.persist(owner);
      this.commit();
      return existing;
    }
    const created: Conversation = { id, peer: id as Address, name: name ?? shortName(peer), lastMessageAt: Date.now() };
    const other = this.snapshot.conversations.filter((c) => c.id.toLowerCase() !== id && c.peer.toLowerCase() !== id);
    this.snapshot.conversations = [created, ...other].sort(sortConversations);
    this.persist(owner);
    this.commit();
    return created;
  }

  deleteConversation(owner: Address, conversationId: string): void {
    const id = conversationId.toLowerCase();
    this.snapshot.conversations = this.snapshot.conversations.filter((c) => c.id.toLowerCase() !== id && c.peer.toLowerCase() !== id);
    const nextMessages = { ...this.snapshot.messages };
    delete nextMessages[id];
    delete nextMessages[conversationId];
    this.snapshot.messages = nextMessages;
    this.persist(owner);
    this.commit();
  }

  touchConversation(owner: Address, conversationId: string, at: number): void {
    const id = conversationId.toLowerCase();
    this.snapshot.conversations = this.snapshot.conversations
      .map((c) => (c.id === id ? { ...c, lastMessageAt: at } : c))
      .sort(sortConversations);
    this.persist(owner);
    this.commit();
  }

  addMessage(owner: Address, message: StoredMessage): void {
    const cid = message.conversationId.toLowerCase();
    const list = this.snapshot.messages[cid] ?? [];
    if (list.some((m) => m.id === message.id)) return;
    this.snapshot.messages = { ...this.snapshot.messages, [cid]: [...list, { ...message, conversationId: cid }] };
    this.touchConversation(owner, cid, message.createdAt);
    this.persist(owner);
    this.commit();
  }

  updateMessage(owner: Address, conversationId: string, id: string, patch: Partial<StoredMessage>): void {
    const cid = conversationId.toLowerCase();
    const list = this.snapshot.messages[cid] ?? [];
    this.snapshot.messages = {
      ...this.snapshot.messages,
      [cid]: list.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    };
    this.persist(owner);
    this.commit();
  }

  messagesFor(conversationId: string): StoredMessage[] {
    return [...(this.snapshot.messages[conversationId.toLowerCase()] ?? [])].sort((a, b) => a.createdAt - b.createdAt);
  }
}

function sortConversations(a: Conversation, b: Conversation): number {
  return (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0);
}

function shortName(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function normalize(snap: ChatSnapshot): ChatSnapshot {
  const rawContacts = Array.isArray(snap.contacts) ? snap.contacts : [];
  const rawConvs = Array.isArray(snap.conversations) ? snap.conversations : [];
  const rawMsgs = snap.messages && typeof snap.messages === "object" ? snap.messages : {};

  // De-duplicate contacts by address.toLowerCase()
  const contacts: Contact[] = [];
  const seenContacts = new Set<string>();
  for (const c of rawContacts) {
    if (!c?.address) continue;
    const addr = c.address.toLowerCase();
    if (!seenContacts.has(addr)) {
      seenContacts.add(addr);
      contacts.push({ ...c, address: addr as Address });
    }
  }

  // De-duplicate conversations by id.toLowerCase()
  const conversations: Conversation[] = [];
  const seenConvs = new Set<string>();
  for (const conv of rawConvs) {
    if (!conv?.id && !conv?.peer) continue;
    const id = (conv.id || conv.peer).toLowerCase();
    if (!seenConvs.has(id)) {
      seenConvs.add(id);
      conversations.push({ ...conv, id, peer: (conv.peer || id).toLowerCase() as Address });
    }
  }

  // Normalize and de-duplicate messages by conversationId and message ID
  const messages: Record<string, StoredMessage[]> = {};
  for (const [key, msgList] of Object.entries(rawMsgs)) {
    const lowerKey = key.toLowerCase();
    const existing = messages[lowerKey] ?? [];
    if (Array.isArray(msgList)) {
      const combined = [...existing];
      const seenMsgIds = new Set(existing.map((m) => m.id));
      for (const m of msgList) {
        if (m?.id && !seenMsgIds.has(m.id)) {
          seenMsgIds.add(m.id);
          combined.push({ ...m, conversationId: lowerKey });
        }
      }
      messages[lowerKey] = combined;
    }
  }

  return { contacts, conversations, messages };
}
