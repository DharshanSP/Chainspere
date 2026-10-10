import type { Conversation } from "../stores/chatStore";
import { shortAddress } from "../lib/address";
import { navigate } from "../router";

export function ConversationList({
  conversations,
  activePeer,
}: {
  conversations: Conversation[];
  activePeer: string | null;
}) {
  if (conversations.length === 0) {
    return (
      <div className="empty">
        No conversations yet. Add a contact to start chatting.
      </div>
    );
  }
  return (
    <ul className="conversation-list">
      {conversations.map((c) => (
        <li key={c.id}>
          <button
            className={`conversation ${activePeer === c.id ? "conversation-active" : ""}`}
            onClick={() => navigate(`/chats/${c.id}`)}
          >
            <span className="avatar">{c.name.slice(0, 2).toUpperCase()}</span>
            <span className="conversation-meta">
              <span className="conversation-name">{c.name}</span>
              <span className="muted small">{shortAddress(c.peer)}</span>
            </span>
            {c.lastMessageAt ? (
              <span className="muted tiny">{new Date(c.lastMessageAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  );
}
