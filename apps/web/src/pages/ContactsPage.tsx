import type { Address } from "@chainsphere/shared";
import { useEffect, useState } from "react";
import { shortAddress, isValidAddress } from "../lib/address";
import { useChat } from "../providers/ChatProvider";
import { useWallet } from "../providers/WalletProvider";
import { navigate } from "../router";

function parseInviteParam(text: string): { address?: string; key?: string; label?: string } {
  try {
    const raw = text.trim();
    const query = raw.includes("?") ? raw.slice(raw.indexOf("?") + 1) : raw;
    const params = new URLSearchParams(query);
    const add = params.get("add");
    const key = params.get("key");
    const label = params.get("label");
    if (add && isValidAddress(add)) {
      return { address: add, key: key ?? undefined, label: label ?? undefined };
    }
  } catch {
    // fallback
  }
  return {};
}

export function ContactsPage() {
  const { contacts, addContact, removeContact, keys } = useChat();
  const { address: myAddress } = useWallet();
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [incomingInvite, setIncomingInvite] = useState<{ address: string; key?: string; label?: string } | null>(null);

  // Check URL on mount for invite link parameters: ?add=0x...&key=...&label=...
  useEffect(() => {
    const hash = window.location.hash;
    const search = window.location.search;
    const parsed = parseInviteParam(hash) || parseInviteParam(search);
    if (parsed.address && parsed.address.toLowerCase() !== myAddress?.toLowerCase()) {
      setIncomingInvite({ address: parsed.address, key: parsed.key, label: parsed.label });
      setAddress(parsed.address);
      if (parsed.key) setPublicKey(parsed.key);
      if (parsed.label) setLabel(parsed.label);
    }
  }, [myAddress]);

  // If user pastes an invite link into the address field, auto-extract address, key, and label
  const handleAddressChange = (val: string) => {
    const parsed = parseInviteParam(val);
    if (parsed.address) {
      setAddress(parsed.address);
      if (parsed.key) setPublicKey(parsed.key);
      if (parsed.label) setLabel(parsed.label);
      return;
    }
    setAddress(val);
  };

  const copyMyInviteLink = async () => {
    if (!myAddress) return;
    const pub = keys?.publicKeyB64 ? `&key=${encodeURIComponent(keys.publicKeyB64)}` : "";
    const link = `${window.location.origin}${window.location.pathname}#/contacts?add=${myAddress}${pub}&label=Friend`;
    await navigator.clipboard.writeText(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const submitWith = (targetAddr: string, targetLabel?: string, targetKey?: string) => {
    setError(null);
    const value = targetAddr.trim();
    if (!isValidAddress(value)) {
      setError("Enter a valid 0x wallet address.");
      return;
    }
    setBusy(true);
    addContact(value as Address, targetLabel?.trim() || undefined, targetKey?.trim() || undefined);
    setAddress("");
    setLabel("");
    setPublicKey("");
    setIncomingInvite(null);
    setBusy(false);
    navigate(`/chats/${value.toLowerCase()}`);
  };

  const submit = () => submitWith(address, label, publicKey);

  return (
    <div className="page">
      <header className="pane-header">
        <h2>Contacts</h2>
        {myAddress ? (
          <button className="btn btn-ghost" onClick={() => void copyMyInviteLink()}>
            {copiedLink ? "✓ Invite Link Copied!" : "🔗 Share My Contact Link"}
          </button>
        ) : null}
      </header>

      {incomingInvite ? (
        <div className="card" style={{ border: "1px solid var(--accent)", background: "rgba(91, 140, 255, 0.1)" }}>
          <h3>👋 Incoming Contact Invite</h3>
          <p className="muted small">
            You opened an invite to connect with <strong>{incomingInvite.label ?? shortAddress(incomingInvite.address)}</strong> ({incomingInvite.address}).
          </p>
          <div className="row gap">
            <button
              className="btn btn-primary"
              disabled={busy}
          onClick={() => submitWith(incomingInvite.address, incomingInvite.label, incomingInvite.key)}
            >
              {busy ? "Connecting…" : "✓ Add & Start Chatting"}
            </button>
            <button className="btn btn-ghost" onClick={() => setIncomingInvite(null)}>Dismiss</button>
          </div>
        </div>
      ) : null}

      <div className="card">
        <h3>Add contact</h3>
        <p className="muted small">
          Paste a peer&apos;s wallet address or their <strong>Invite Link</strong>. If both wallets are registered on-chain,
          the encryption key is resolved automatically.
        </p>
        <div className="form-grid">
          <label className="span-2">
            Wallet address or Invite Link
            <input
              className="input mono"
              placeholder="0x… or paste full invite link"
              value={address}
              onChange={(e) => handleAddressChange(e.target.value)}
            />
          </label>
          <label>
            Label (optional)
            <input className="input" placeholder="Alice" value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
          <label>
            P-256 public key (optional / auto-filled)
            <input
              className="input mono"
              placeholder="BH3… (optional)"
              value={publicKey}
              onChange={(e) => setPublicKey(e.target.value)}
            />
          </label>
        </div>
        {error ? <div className="error">{error}</div> : null}
        <button className="btn btn-primary" disabled={busy || !address.trim()} onClick={() => void submit()}>
          {busy ? "Resolving…" : "Add contact & Message"}
        </button>
      </div>

      <div className="card">
        <div className="row gap" style={{ justifyContent: "space-between" }}>
          <h3>Your public key</h3>
          <button className="btn btn-ghost btn-xs" onClick={() => void copyMyInviteLink()}>
            {copiedLink ? "✓ Copied!" : "🔗 Copy Full Invite Link"}
          </button>
        </div>
        <p className="muted small">Share this link or your public key with peers so they can encrypt messages to you.</p>
        <div className="mono break key-box">{keys?.publicKeyB64 ?? "…"}</div>
        <div className="muted tiny">fingerprint {keys?.fingerprint ?? "…"}</div>
      </div>

      <div className="card">
        <h3>All contacts ({contacts.length})</h3>
        {contacts.length === 0 ? (
          <div className="muted">No contacts yet. Share your invite link or paste a friend&apos;s address above.</div>
        ) : (
          <ul className="contact-list">
            {contacts.map((c) => (
              <li key={c.address} className="contact-row">
                <div>
                  <div style={{ fontWeight: 600 }}>{c.label ?? shortAddress(c.address)}</div>
                  <div className="muted small mono">{c.address}</div>
                  <div className="muted tiny">
                    {c.publicKeyB64 ? "✓ encryption key ready" : "no public key — will try on-chain lookup"}
                  </div>
                </div>
                <div className="row gap">
                  <button className="btn btn-primary" onClick={() => navigate(`/chats/${c.address}`)}>Message</button>
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
