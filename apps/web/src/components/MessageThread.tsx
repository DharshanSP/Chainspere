import type { Address } from "@chainsphere/shared";
import type { StoredMessage } from "../stores/chatStore";
import type { DecryptedFile } from "../providers/ChatProvider";
import { Pill } from "../layouts/AppLayout";
import { shortAddress } from "../lib/address";

function statusOk(status: StoredMessage["status"]): boolean {
  return ["sent", "delivered", "anchored", "verified", "read"].includes(status);
}

export function MessageThread({
  messages,
  self,
  plaintextOf,
  fileDataOf,
}: {
  messages: StoredMessage[];
  self: Address;
  plaintextOf: (id: string) => string | undefined;
  fileDataOf?: (id: string) => DecryptedFile | undefined;
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
        const file = fileDataOf ? fileDataOf(m.id) : undefined;
        const isFile = m.envelope.contentType === "file";

        return (
          <div key={m.id} className={`bubble-row ${mine ? "bubble-mine" : "bubble-theirs"}`}>
            <div className="bubble">
              {isFile ? (
                <div className="bubble-file">
                  <div className="file-header">
                    <span className="file-icon">📎</span>
                    <span className="file-title">{m.envelope.fileName ?? file?.name ?? "Encrypted Attachment"}</span>
                  </div>
                  {file?.url ? (
                    <a
                      href={file.url}
                      download={file.name}
                      className="btn btn-ghost btn-download"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Download {file.name}
                    </a>
                  ) : (
                    <span className="muted tiny">🔒 Decrypting attachment…</span>
                  )}
                </div>
              ) : (
                <div className="bubble-text">
                  {plain ?? "🔒 unavailable — key missing"}
                </div>
              )}
              <div className="bubble-meta">
                <span className="muted tiny">{shortAddress(m.from)}</span>
                <span className="muted tiny">{new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                <Pill label={m.status} ok={statusOk(m.status)} />
              </div>
              <div className="bubble-proofs row gap">
                {m.txHash ? <span className="muted tiny mono">tx {m.txHash.slice(0, 14)}…</span> : null}
                {m.cid ? <span className="muted tiny mono" title={m.cid}>ipfs {m.cid.slice(0, 14)}…</span> : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
