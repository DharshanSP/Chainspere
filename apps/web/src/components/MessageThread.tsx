import type { Address } from "@chainsphere/shared";
import type { StoredMessage } from "../stores/chatStore";
import { Pill } from "../layouts/AppLayout";
import { shortAddress } from "../lib/address";

function statusOk(status: StoredMessage["status"]): boolean {
  return ["sent", "delivered", "anchored", "verified", "read"].includes(status);
}

export function MessageThread({
  messages,
  self,
  plaintextOf,
}: {
  messages: StoredMessage[];
  self: Address;
  plaintextOf: (id: string) => string | undefined;
}) {
  if (messages.length === 0) {
    return (
      <div className="empty thread-empty">
        No messages yet. Everything you send is encrypted in the browser before it leaves this device.
      </div>
    );
  }
  return (
    <div className="thread">
      {messages.map((m) => {
        const mine = m.from.toLowerCase() === self.toLowerCase();
        const plain = plaintextOf(m.id);
        return (
          <div key={m.id} className={`bubble-row ${mine ? "bubble-mine" : "bubble-theirs"}`}>
            <div className="bubble">
              <div className="bubble-text">
                {plain ?? (m.envelope.contentType === "file" ? "📎 encrypted attachment" : "🔒 unavailable — key missing")}
              </div>
              <div className="bubble-meta">
                <span className="muted tiny">{shortAddress(m.from)}</span>
                <span className="muted tiny">{new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                <Pill label={m.status} ok={statusOk(m.status)} />
              </div>
              {m.txHash ? <div className="muted tiny mono">tx {m.txHash.slice(0, 14)}…</div> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
