import { useEffect } from "react";
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
    keys,
  } = useChat();

  useEffect(() => {
    if (peer && isValidAddress(peer)) setActivePeer(peer.toLowerCase());
  }, [peer, setActivePeer]);

  const active = activePeer && isValidAddress(activePeer) ? activePeer : null;
  const isSavedContact = active ? contacts.some((c) => c.address.toLowerCase() === active.toLowerCase()) : false;

  const handleDeleteActiveChat = () => {
    if (!active) return;
    if (window.confirm("Delete this conversation and all its local messages?")) {
      deleteConversation(active);
      navigate("/chats");
    }
  };

  return (
    <div className="chats">
      <section className="pane pane-list">
        <header className="pane-header">
          <h2>Chats</h2>
          <button className="btn btn-ghost" onClick={() => navigate("/contacts")}>+ New</button>
        </header>
        <ConversationList
          conversations={conversations}
          activePeer={activePeer}
          onDelete={(id) => {
            deleteConversation(id);
            if (active && active.toLowerCase() === id.toLowerCase()) {
              navigate("/chats");
            }
          }}
        />
      </section>
      <section className="pane pane-thread">
        {active && address ? (
          <>
            <header className="pane-header">
              <div className="row gap" style={{ alignItems: "center" }}>
                <h2 className="mono" title={active}>{shortAddress(active, 8)}</h2>
                {!isSavedContact ? (
                  <button
                    className="btn btn-ghost btn-xs"
                    onClick={() => void addContact(active as Address)}
                    title="Save this address to your contacts"
                  >
                    + Save Contact
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn btn-ghost btn-xs text-danger"
                  onClick={handleDeleteActiveChat}
                  title="Delete this conversation"
                >
                  🗑️ Delete Chat
                </button>
              </div>
              {keys ? <span className="muted tiny">key v{keys.version} · {keys.fingerprint.slice(0, 12)}…</span> : null}
            </header>
            <MessageThread messages={messages} self={address} plaintextOf={plaintextOf} fileDataOf={fileDataOf} />
            {lastError ? <div className="error error-inline">{lastError}</div> : null}
            <Composer
              disabled={!ready}
              onSend={(text) => sendText(active, text)}
              onSendFile={(file) => sendFile(active, file)}
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
