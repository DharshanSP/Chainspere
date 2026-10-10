import { Link, type Route } from "../router";
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
  const network = chainId ? SUPPORTED_NETWORKS[chainId] ?? `Chain ${chainId}` : "—";

  const navItem = (to: string, label: string, active: boolean) => (
    <Link key={to} to={to} className={`nav-item ${active ? "nav-active" : ""}`}>
      {label}
    </Link>
  );

  return (
    <div className="layout">
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
          <div className="muted small">{address ? shortAddress(address) : "not connected"}</div>
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
