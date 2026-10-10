import { useEffect } from "react";
import { Composer } from "../components/Composer";
import { ConversationList } from "../components/ConversationList";
import { MessageThread } from "../components/MessageThread";
import { useChat } from "../providers/ChatProvider";
import { useWallet } from "../providers/WalletProvider";
import { navigate } from "../router";
import { isValidAddress } from "../lib/address";

export function ChatsPage({ peer }: { peer?: string }) {
  const { address } = useWallet();
  const {
    ready, conversations, activePeer, setActivePeer, messages, plaintextOf, sendText, lastError, keys,
  } = useChat();

  useEffect(() => {
    if (peer && isValidAddress(peer)) setActivePeer(peer.toLowerCase());
  }, [peer, setActivePeer]);

  const active = activePeer && isValidAddress(activePeer) ? activePeer : null;

  return (
    <div className="chats">
      <section className="pane pane-list">
        <header className="pane-header">
          <h2>Chats</h2>
          <button className="btn btn-ghost" onClick={() => navigate("/contacts")}>+ New</button>
        </header>
        <ConversationList conversations={conversations} activePeer={activePeer} />
      </section>
      <section className="pane pane-thread">
        {active && address ? (
          <>
            <header className="pane-header">
              <h2 className="mono">{active}</h2>
              {keys ? <span className="muted tiny">key v{keys.version} · {keys.fingerprint.slice(0, 12)}…</span> : null}
            </header>
            <MessageThread messages={messages} self={address} plaintextOf={plaintextOf} />
            {lastError ? <div className="error error-inline">{lastError}</div> : null}
            <Composer disabled={!ready} onSend={(text) => sendText(active, text)} />
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
