import { Link, type Route } from "../router";
import { useState } from "react";
import { useWallet } from "../providers/WalletProvider";
import { useChat } from "../providers/ChatProvider";
import { shortAddress } from "../lib/address";
import { SUPPORTED_NETWORKS } from "@chainsphere/shared";
import { config } from "../services/config";

function Pill({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span className={`pill ${ok ? "pill-ok" : "pill-warn"}`}>
      <span className="dot" />
      {label}
    </span>
  );
}

export function AppLayout({ route, children }: { route: Route; children: React.ReactNode }) {
  const { address, chainId, session, signOut } = useWallet();
  const { signalingConnected } = useChat();
  const [copied, setCopied] = useState(false);
  const network = chainId ? SUPPORTED_NETWORKS[chainId] ?? `Chain ${chainId}` : "—";

  const handleCopyAddress = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const navItem = (to: string, label: string, active: boolean) => (
    <Link key={to} to={to} className={`nav-item ${active ? "nav-active" : ""}`}>
      {label}
    </Link>
  );

  return (
    <div className="layout">
      <div className="particles" aria-hidden="true">
        <div className="particle" style={{ left: "10%", top: "20%", width: "8px", height: "8px", "--d": "6s", "--tx": "20px", "--ty": "-40px", animationDelay: "0s" } as any} />
        <div className="particle" style={{ left: "25%", top: "60%", width: "12px", height: "12px", "--d": "8s", "--tx": "-30px", "--ty": "-20px", animationDelay: "1.5s" } as any} />
        <div className="particle" style={{ left: "70%", top: "15%", width: "6px", height: "6px", "--d": "5s", "--tx": "15px", "--ty": "-35px", animationDelay: "3s" } as any} />
        <div className="particle" style={{ left: "85%", top: "70%", width: "10px", height: "10px", "--d": "7s", "--tx": "-25px", "--ty": "-30px", animationDelay: "4.5s" } as any} />
        <div className="particle" style={{ left: "40%", top: "85%", width: "9px", height: "9px", "--d": "9s", "--tx": "20px", "--ty": "-45px", animationDelay: "2s" } as any} />
        <div className="particle" style={{ left: "55%", top: "10%", width: "7px", height: "7px", "--d": "6s", "--tx": "-15px", "--ty": "-25px", animationDelay: "5s" } as any} />
        <div className="particle" style={{ left: "15%", top: "45%", width: "11px", height: "11px", "--d": "8s", "--tx": "25px", "--ty": "-20px", animationDelay: "0.5s" } as any} />
        <div className="particle" style={{ left: "60%", top: "75%", width: "8px", height: "8px", "--d": "7s", "--tx": "-20px", "--ty": "-35px", animationDelay: "3.5s" } as any} />
        <div className="particle" style={{ left: "90%", top: "30%", width: "6px", height: "6px", "--d": "5s", "--tx": "-30px", "--ty": "-25px", animationDelay: "6s" } as any} />
        <div className="particle" style={{ left: "35%", top: "5%", width: "10px", height: "10px", "--d": "9s", "--tx": "15px", "--ty": "-30px", animationDelay: "1s" } as any} />
        <div className="particle" style={{ left: "50%", top: "90%", width: "7px", height: "7px", "--d": "6s", "--tx": "-10px", "--ty": "-40px", animationDelay: "4s" } as any} />
        <div className="particle" style={{ left: "80%", top: "55%", width: "9px", height: "9px", "--d": "8s", "--tx": "20px", "--ty": "-15px", animationDelay: "2.5s" } as any} />
      </div>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">◉</span>
          <div>
            <div className="brand-name">ChainSphere</div>
            <div className="brand-sub">E2E encrypted · on-chain integrity</div>
          </div>
        </div>
        <nav className="nav">
          {navItem("/chats", "Chats", route.name === "chats" || route.name === "chat")}
          {navItem("/contacts", "Contacts", route.name === "contacts")}
          {navItem("/settings", "Settings", route.name === "settings")}
        </nav>
        <div className="sidebar-footer">
          <div
            className="muted small mono"
            style={{ cursor: address ? "pointer" : "default", userSelect: "none" }}
            title={address ? "Click to copy address" : undefined}
            onClick={() => void handleCopyAddress()}
          >
            {address ? (copied ? "✓ Copied address" : shortAddress(address)) : "not connected"}
          </div>
          <div className="muted small">{network}</div>
          <div className="row gap">
            <Pill label={signalingConnected ? "signaling" : "offline"} ok={signalingConnected} />
            {session ? (
              <button className="btn btn-ghost" onClick={signOut}>Sign out</button>
            ) : null}
          </div>
          <div className="muted tiny">chainId {chainId ?? config.chainId}</div>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}

export { Pill };
