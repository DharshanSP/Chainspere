import type { Address } from "@chainsphere/shared";
import { useState } from "react";
import { shortAddress, isValidAddress } from "../lib/address";
import { useChat } from "../providers/ChatProvider";
import { navigate } from "../router";

export function ContactsPage() {
  const { contacts, addContact, removeContact, keys } = useChat();
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    const value = address.trim();
    if (!isValidAddress(value)) {
      setError("Enter a valid 0x wallet address.");
      return;
    }
    setBusy(true);
    try {
      await addContact(value as Address, label.trim() || undefined, publicKey.trim() || undefined);
      setAddress("");
      setLabel("");
      setPublicKey("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <header className="pane-header">
        <h2>Contacts</h2>
      </header>
      <div className="card">
        <h3>Add contact</h3>
        <p className="muted small">
          A contact needs the peer&apos;s P-256 public key to encrypt. If both wallets are registered in the
          IdentityRegistry, the key is fetched on-chain automatically — otherwise paste it here.
        </p>
        <div className="form-grid">
          <label>
            Wallet address
            <input
              className="input mono"
              placeholder="0x…"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </label>
          <label>
            Label (optional)
            <input className="input" placeholder="Alice" value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
          <label className="span-2">
            P-256 public key, base64 (optional)
            <input
              className="input mono"
              placeholder="BH3… (65-byte uncompressed, base64)"
              value={publicKey}
              onChange={(e) => setPublicKey(e.target.value)}
            />
          </label>
        </div>
        {error ? <div className="error">{error}</div> : null}
        <button className="btn btn-primary" disabled={busy} onClick={() => void submit()}>
          {busy ? "Resolving…" : "Add contact"}
        </button>
      </div>

      <div className="card">
        <h3>Your public key</h3>
        <p className="muted small">Share this with peers who add you manually (never share private material).</p>
        <div className="mono break key-box">{keys?.publicKeyB64 ?? "…"}</div>
        <div className="muted tiny">fingerprint {keys?.fingerprint ?? "…"}</div>
      </div>

      <div className="card">
        <h3>All contacts ({contacts.length})</h3>
        {contacts.length === 0 ? (
          <div className="muted">No contacts yet.</div>
        ) : (
          <ul className="contact-list">
            {contacts.map((c) => (
              <li key={c.address} className="contact-row">
                <div>
                  <div>{c.label ?? shortAddress(c.address)}</div>
                  <div className="muted small mono">{c.address}</div>
                  <div className="muted tiny">
                    {c.publicKeyB64 ? "public key cached" : "no public key — will try on-chain lookup"}
                  </div>
                </div>
                <div className="row gap">
                  <button className="btn" onClick={() => navigate(`/chats/${c.address}`)}>Message</button>
                  <button className="btn btn-ghost" onClick={() => removeContact(c.address)}>Remove</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
