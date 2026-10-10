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
    const i = this.snapshot.contacts.findIndex((c) => c.address === contact.address);
    if (i === -1) this.snapshot.contacts = [contact, ...this.snapshot.contacts];
    else this.snapshot.contacts = this.snapshot.contacts.map((c, idx) => (idx === i ? { ...c, ...contact } : c));
    this.persist(owner);
    this.commit();
  }

  removeContact(owner: Address, address: Address): void {
    this.snapshot.contacts = this.snapshot.contacts.filter((c) => c.address !== address);
    this.persist(owner);
    this.commit();
  }

  findContact(address: Address): Contact | undefined {
    return this.snapshot.contacts.find((c) => c.address === address);
  }

  upsertConversation(owner: Address, peer: Address, name?: string): Conversation {
    const id = peer.toLowerCase();
    const existing = this.snapshot.conversations.find((c) => c.id === id);
    if (existing) {
      if (name && name !== existing.name) existing.name = name;
      this.snapshot.conversations = [...this.snapshot.conversations].sort(sortConversations);
      this.persist(owner);
      this.commit();
      return existing;
    }
    const created: Conversation = { id, peer, name: name ?? shortName(peer), lastMessageAt: Date.now() };
    this.snapshot.conversations = [created, ...this.snapshot.conversations].sort(sortConversations);
    this.persist(owner);
    this.commit();
    return created;
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
    const list = this.snapshot.messages[message.conversationId] ?? [];
    if (list.some((m) => m.id === message.id)) return;
    this.snapshot.messages = { ...this.snapshot.messages, [message.conversationId]: [...list, message] };
    this.touchConversation(owner, message.conversationId, message.createdAt);
    this.persist(owner);
    this.commit();
  }

  updateMessage(owner: Address, conversationId: string, id: string, patch: Partial<StoredMessage>): void {
    const list = this.snapshot.messages[conversationId] ?? [];
    this.snapshot.messages = {
      ...this.snapshot.messages,
      [conversationId]: list.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    };
    this.persist(owner);
    this.commit();
  }

  messagesFor(conversationId: string): StoredMessage[] {
    return [...(this.snapshot.messages[conversationId] ?? [])].sort((a, b) => a.createdAt - b.createdAt);
  }
}

function sortConversations(a: Conversation, b: Conversation): number {
  return (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0);
}

function shortName(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function normalize(snap: ChatSnapshot): ChatSnapshot {
  return {
    contacts: Array.isArray(snap.contacts) ? snap.contacts : [],
    conversations: Array.isArray(snap.conversations) ? snap.conversations : [],
    messages: snap.messages && typeof snap.messages === "object" ? snap.messages : {},
  };
}
