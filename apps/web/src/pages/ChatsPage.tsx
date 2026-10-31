import { useEffect, useState } from "react";
import type { Address } from "@chainsphere/shared";
import { Composer } from "../components/Composer";
import { ConversationList } from "../components/ConversationList";
import { MessageThread } from "../components/MessageThread";
import { useChat } from "../providers/ChatProvider";
import { useWallet } from "../providers/WalletProvider";
import { navigate } from "../router";
import { isValidAddress, shortAddress } from "../lib/address";

export function ChatsPage({ peer }: { peer?: string }) {
  const { address } = useWallet();
  const {
    ready,
    conversations,
    contacts,
    addContact,
    deleteConversation,
    activePeer,
    setActivePeer,
    messages,
    plaintextOf,
    fileDataOf,
    sendText,
    sendFile,
    lastError,
    clearError,
    keys,
  } = useChat();

  const [savedBanner, setSavedBanner] = useState<string | null>(null);

  useEffect(() => {
    if (peer && isValidAddress(peer)) setActivePeer(peer.toLowerCase());
  }, [peer, setActivePeer]);

  // Clear "saved" banner when switching conversations
  useEffect(() => { setSavedBanner(null); }, [activePeer]);

  const active = activePeer && isValidAddress(activePeer) ? activePeer : null;
  const isSavedContact = active
    ? contacts.some((c) => c.address.toLowerCase() === active.toLowerCase())
    : false;

  // Check if we received messages from this peer (they initiated)
  const hasIncomingMessages = active
    ? messages.some((m) => m.from.toLowerCase() === active.toLowerCase())
    : false;

  const handleSaveContact = () => {
    if (!active) return;
    addContact(active as Address);
    setSavedBanner(active);
  };

  const handleDeleteActive = () => {
    if (!active || !window.confirm("Delete this conversation and all its messages?")) return;
    deleteConversation(active);
    navigate("/chats");
  };

  return (
    <div className="chats">
      {/* ── Left pane: conversation list ── */}
      <section className="pane pane-list">
        <header className="pane-header">
          <h2>Chats</h2>
          <button type="button" className="btn btn-ghost" onClick={() => navigate("/contacts")}>
            + New
          </button>
        </header>
        <ConversationList
          conversations={conversations}
          activePeer={activePeer}
          onDelete={(id) => {
            deleteConversation(id);
            if (active?.toLowerCase() === id.toLowerCase()) navigate("/chats");
          }}
        />
      </section>

      {/* ── Right pane: message thread ── */}
      <section className="pane pane-thread">
        {active && address ? (
          <>
            <header className="pane-header">
              <div className="row gap" style={{ alignItems: "center", flexWrap: "wrap" }}>
                <h2 className="mono" title={active}>{shortAddress(active, 8)}</h2>

                {isSavedContact ? (
                  <span className="pill pill-ok"><span className="dot" />Saved</span>
                ) : (
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    onClick={handleSaveContact}
                    title="Save this address to contacts"
                  >
                    + Save Contact
                  </button>
                )}

                <button
                  type="button"
                  className="btn btn-ghost btn-xs text-danger"
                  onClick={handleDeleteActive}
                  title="Delete this conversation"
                >
                  🗑️ Delete
                </button>
              </div>
              {keys ? (
                <span className="muted tiny">
                  key v{keys.version} · {keys.fingerprint.slice(0, 12)}…
                </span>
              ) : null}
            </header>

            {/* Banner: unsaved contact who has messaged you */}
            {!isSavedContact && hasIncomingMessages && savedBanner !== active ? (
              <div className="new-contact-banner">
                <div>
                  <strong>New message from {shortAddress(active)}</strong>
                  <span className="muted small"> — their encryption key has been received automatically.</span>
                </div>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={handleSaveContact}
                >
                  ✓ Save Contact &amp; Reply
                </button>
              </div>
            ) : null}

            {/* Banner: just saved */}
            {savedBanner === active ? (
              <div className="saved-contact-banner">
                ✓ Contact saved! Encryption key pulled automatically — you can now reply.
              </div>
            ) : null}

            <MessageThread
              messages={messages}
              self={address}
              plaintextOf={plaintextOf}
              fileDataOf={fileDataOf}
            />

            {lastError ? (
              <div className="error error-inline" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>{lastError}</span>
                <button type="button" className="btn btn-ghost btn-xs" onClick={clearError}>✕</button>
              </div>
            ) : null}

            <Composer
              disabled={!ready}
              onSend={(text) => sendText(active as Address, text)}
              onSendFile={(file) => sendFile(active as Address, file)}
            />
          </>
        ) : (
          <div className="empty pane-empty">
            Select a conversation — or add a contact to start one.
          </div>
        )}
      </section>
    </div>
  );
}
