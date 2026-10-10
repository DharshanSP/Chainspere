import { useWallet } from "../providers/WalletProvider";
import { config } from "../services/config";
import { SUPPORTED_NETWORKS } from "@chainsphere/shared";

export function SignInPage() {
  const { status, address, chainId, error, connect, signIn } = useWallet();
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
          <button className="btn btn-primary btn-wide" onClick={() => void connect()} disabled={status === "connecting"}>
            {status === "connecting" ? "Connecting wallet…" : "Connect wallet"}
          </button>
        ) : (
          <>
            <div className="signin-address mono">{address}</div>
            <div className="muted small">Network: {networkName} (chainId {chainId})</div>
            <button className="btn btn-primary btn-wide" onClick={() => void signIn()}>
              Sign in with message
            </button>
            <p className="muted tiny">
              You will sign a SIWE-style challenge proving wallet ownership. It moves no funds.
            </p>
          </>
        )}
        {error ? <div className="error">{error}</div> : null}
        <div className="muted tiny">
          signaling {config.signalingUrl} · rpc {config.rpcUrl}
        </div>
      </div>
    </div>
  );
}
