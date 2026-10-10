import { useEffect, useState } from "react";

export type Route =
  | { name: "signin" }
  | { name: "chats" }
  | { name: "chat"; peer: string }
  | { name: "contacts" }
  | { name: "settings" };

export function parseHash(hash: string): Route {
  const path = (hash.replace(/^#/, "") || "/chats").toLowerCase();
  const parts = path.split("/").filter(Boolean);
  switch (parts[0]) {
    case "signin":
      return { name: "signin" };
    case "contacts":
      return { name: "contacts" };
    case "settings":
      return { name: "settings" };
    case "chats":
      return parts[1] ? { name: "chat", peer: parts[1] } : { name: "chats" };
    default:
      return { name: "chats" };
  }
}

export function navigate(path: string): void {
  const next = path.startsWith("#") ? path : `#${path}`;
  if (window.location.hash === next) window.dispatchEvent(new HashChangeEvent("hashchange"));
  else window.location.hash = next;
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onHash = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return route;
}

export function Link({ to, className, children }: { to: string; className?: string; children: React.ReactNode }) {
  return (
    <a
      href={`#${to}`}
      className={className}
      onClick={(e) => {
        e.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}
