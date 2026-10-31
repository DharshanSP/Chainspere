import { useWallet } from "../providers/WalletProvider";
import { config } from "../services/config";
import { SUPPORTED_NETWORKS } from "@chainsphere/shared";

export function SignInPage() {
  const { status, address, chainId, error, clearError, connectAndSignIn, signIn, signInAsGuest } = useWallet();
  const networkName = chainId ? SUPPORTED_NETWORKS[chainId] ?? `Chain ${chainId}` : "—";

  return (
    <div className="signin">
      <div className="signin-card">
        <div className="brand">
          <span className="brand-mark">◉</span>
          <div>
            <div className="brand-name">ChainSphere</div>
            <div className="brand-sub">Decentralized, privacy-preserving messaging</div>
          </div>
        </div>
        <p className="muted">
          Messages are end-to-end encrypted in your browser with P-256 ECDH + AES-256-GCM.
          Your wallet key only signs in — it is never used to encrypt, and never leaves the device.
        </p>
        <ul className="feature-list">
          <li>No plaintext on servers: signaling and IPFS only ever see ciphertext</li>
          <li>On-chain integrity commitments via <span className="mono">MessageAnchor</span></li>
          <li>Contract-enforced group membership via <span className="mono">ConversationRegistry</span></li>
        </ul>

        {status === "disconnected" || status === "connecting" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem", width: "100%" }}>
            <button
              type="button"
              className="btn btn-primary btn-wide"
              onClick={() => void connectAndSignIn()}
              disabled={status === "connecting"}
            >
              {status === "connecting" ? "Connecting wallet…" : "🦊 Connect with MetaMask"}
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", margin: "0.25rem 0", color: "var(--muted)", fontSize: "0.82rem" }}>
              <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
              <span>OR</span>
              <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
            </div>

            <button
              type="button"
              className="btn btn-ghost btn-wide"
              onClick={() => void signInAsGuest()}
              style={{ border: "1px solid var(--border)", background: "rgba(255,255,255,0.04)" }}
            >
              ⚡ Instant Demo Sign-In (No MetaMask needed)
            </button>
            <p className="muted tiny" style={{ textAlign: "center" }}>
              Perfect for testing across two laptops or browsers without installing MetaMask.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", width: "100%" }}>
            <div className="signin-address mono">{address}</div>
            <div className="muted small">Network: {networkName} (chainId {chainId})</div>
            <button type="button" className="btn btn-primary btn-wide" onClick={() => void signIn()}>
              Sign in with message
            </button>
            <p className="muted tiny">
              You will sign a SIWE-style challenge proving wallet ownership. It moves no funds.
            </p>
          </div>
        )}
        {error ? (
          <div className="error" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
            <span>{error}</span>
            <button type="button" className="btn btn-ghost btn-xs" onClick={clearError}>✕</button>
          </div>
        ) : null}
        <div className="muted tiny">
          signaling {config.signalingUrl} · rpc {config.rpcUrl}
        </div>
      </div>
    </div>
  );
}
