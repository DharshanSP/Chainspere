import { MAX_MESSAGE_CHARS } from "@chainsphere/shared";
import { useState } from "react";

export function Composer({ disabled, onSend }: { disabled: boolean; onSend: (text: string) => Promise<void> }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const value = text.trim();
    if (!value || busy || disabled) return;
    setBusy(true);
    try {
      await onSend(value);
      setText("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <textarea
        className="composer-input"
        placeholder="Write an encrypted message…"
        value={text}
        maxLength={MAX_MESSAGE_CHARS}
        rows={2}
        disabled={disabled || busy}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void submit();
          }
        }}
      />
      <button className="btn btn-primary" type="submit" disabled={disabled || busy || text.trim().length === 0}>
        {busy ? "Encrypting…" : "Send"}
      </button>
    </form>
  );
}
