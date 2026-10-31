import { MAX_MESSAGE_CHARS } from "@chainsphere/shared";
import { useRef, useState } from "react";

export function Composer({
  disabled,
  onSend,
  onSendFile,
}: {
  disabled: boolean;
  onSend: (text: string) => Promise<void> | void;
  onSendFile?: (file: File) => Promise<void> | void;
}) {
  const [text, setText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const submit = async () => {
    if (busy || disabled) return;
    if (selectedFile && onSendFile) {
      setBusy(true);
      try {
        await onSendFile(selectedFile);
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      } finally {
        setBusy(false);
      }
      return;
    }

    const value = text.trim();
    if (!value) return;
    setBusy(true);
    try {
      await onSend(value);
      setText("");
    } finally {
      setBusy(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 16 * 1024 * 1024) {
        alert("File size exceeds 16 MB limit.");
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      setSelectedFile(file);
    }
  };

  const clearFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const canSubmit = !disabled && !busy && (Boolean(selectedFile) || text.trim().length > 0);

  return (
    <div className="composer-container">
      {selectedFile ? (
        <div className="composer-attachment-preview">
          <span className="file-badge">📎 {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)</span>
          <button type="button" className="btn btn-ghost btn-xs" onClick={clearFile} disabled={busy}>✕</button>
        </div>
      ) : null}
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          id="file-attachment-input"
          style={{ display: "none" }}
          onChange={handleFileChange}
          disabled={disabled || busy}
        />
        <button
          type="button"
          className="btn btn-ghost composer-attach-btn"
          title="Attach encrypted file"
          disabled={disabled || busy}
          onClick={() => fileInputRef.current?.click()}
        >
          📎
        </button>
        <textarea
          className="composer-input"
          placeholder={selectedFile ? "File selected. Click send to encrypt & deliver…" : "Write an encrypted message…"}
          value={text}
          maxLength={MAX_MESSAGE_CHARS}
          rows={2}
          disabled={disabled || busy || Boolean(selectedFile)}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <button className="btn btn-primary" type="submit" disabled={!canSubmit}>
          {busy ? "Encrypting…" : selectedFile ? "Send file" : "Send"}
        </button>
      </form>
    </div>
  );
}
