import { SUPPORTED_NETWORKS } from "@chainsphere/shared";
import { useState } from "react";
import { useChat } from "../providers/ChatProvider";
import { useWallet } from "../providers/WalletProvider";
import { config, identityRegistryConfigured, anchorConfigured } from "../services/config";
import { fetchIdentity, registerIdentity } from "../services/contracts";

export function SettingsPage() {
  const { address, chainId, session, provider, signer } = useWallet();
  const { keys } = useChat();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [identity, setIdentity] = useState<string | null>(null);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);

  const copyAddress = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopiedAddress(true);
    setTimeout(() => setCopiedAddress(false), 2000);
  };

  const copyInviteLink = async () => {
    if (!address) return;
    const pub = keys?.publicKeyB64 ? `&key=${encodeURIComponent(keys.publicKeyB64)}` : "";
    const link = `${window.location.origin}${window.location.pathname}#/contacts?add=${address}${pub}&label=Friend`;
    await navigator.clipboard.writeText(link);
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 2000);
  };

  const network = chainId ? SUPPORTED_NETWORKS[chainId] ?? `Chain ${chainId}` : "—";

  const refreshIdentity = async () => {
    if (!provider || !address || !identityRegistryConfigured) return;
    const id = await fetchIdentity(provider, config.identityRegistry, address);
    setIdentity(
      id && id.registered
        ? `registered=${id.registered} active=${id.active} keyVersion=${id.keyVersion} fingerprint=${id.keyFingerprint.slice(0, 18)}…`
        : "not registered"
    );
  };

  const register = async () => {
    if (!signer || !keys || !identityRegistryConfigured) return;
    setBusy(true);
    setStatus(null);
    try {
      const txHash = await registerIdentity(signer, config.identityRegistry, keys.fingerprint, keys.publicKeyB64);
      setStatus(`Registered on-chain. tx ${txHash.slice(0, 18)}…`);
      await refreshIdentity();
    } catch (e) {
      setStatus(`Registration failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <header className="pane-header">
        <h2>Settings</h2>
      </header>

      <div className="card">
        <h3>Wallet</h3>
        <dl className="kv">
          <dt>Address</dt>
          <dd className="row gap">
            <span className="mono break">{address ?? "—"}</span>
            {address ? (
              <>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={() => void copyAddress()}
                  title="Copy wallet address"
                >
                  {copiedAddress ? "✓ Copied Address!" : "📋 Copy Address"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={() => void copyInviteLink()}
                  title="Copy shareable invite link with your address and public key"
                >
                  {copiedInvite ? "✓ Copied Invite!" : "🔗 Copy Invite Link"}
                </button>
              </>
            ) : null}
          </dd>
          <dt>Network</dt><dd>{network} (chainId {chainId})</dd>
          <dt>Signed in</dt><dd>{session ? new Date(session.issuedAt).toLocaleString() : "no"}</dd>
        </dl>
      </div>

      <div className="card">
        <h3>Encryption identity</h3>
        <dl className="kv">
          <dt>Public key (P-256, base64)</dt><dd className="mono break">{keys?.publicKeyB64 ?? "—"}</dd>
          <dt>Fingerprint</dt><dd className="mono break">{keys?.fingerprint ?? "—"}</dd>
          <dt>Key version</dt><dd>{keys?.version ?? "—"}</dd>
        </dl>
        <p className="muted small">
          Keypair lives in sessionStorage for this tab only. Clearing the tab generates a new one —
          re-register on-chain so peers can find the new public key.
        </p>
      </div>

      <div className="card">
        <h3>On-chain registry</h3>
        <dl className="kv">
          <dt>IdentityRegistry</dt>
          <dd className="mono break">{identityRegistryConfigured ? config.identityRegistry : "not configured"}</dd>
          <dt>MessageAnchor</dt>
          <dd className="mono break">{anchorConfigured ? config.messageAnchor : "not configured"}</dd>
          <dt>Identity status</dt><dd className="mono break">{identity ?? "—"}</dd>
        </dl>
        <div className="row gap">
          <button
            className="btn btn-primary"
            disabled={busy || !identityRegistryConfigured || !keys}
            onClick={() => void register()}
          >
            {busy ? "Submitting…" : "Register identity on-chain"}
          </button>
          <button className="btn" disabled={!provider || !identityRegistryConfigured} onClick={() => void refreshIdentity()}>
            Refresh status
          </button>
        </div>
        {status ? <div className="muted small">{status}</div> : null}
      </div>

      <div className="card">
        <h3>Endpoints</h3>
        <dl className="kv">
          <dt>Signaling</dt><dd className="mono break">{config.signalingUrl}</dd>
          <dt>RPC</dt><dd className="mono break">{config.rpcUrl}</dd>
          <dt>IPFS API</dt><dd className="mono break">{config.ipfsApiUrl}</dd>
          <dt>IPFS gateway</dt><dd className="mono break">{config.ipfsGatewayUrl}</dd>
          <dt>STUN</dt><dd className="mono break">{config.stunServers.join(", ")}</dd>
        </dl>
      </div>
    </div>
  );
}
