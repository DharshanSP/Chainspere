import { buildChallenge, formatChallengeMessage, verifyChallengeSignature } from "@chainsphere/crypto";
import type { Address, Session } from "@chainsphere/shared";
import { BrowserProvider, type JsonRpcSigner } from "ethers";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { readJson, removeKey, writeJson } from "../lib/storage";
import { config } from "../services/config";

const SESSION_KEY = "chainsphere.session.v1";

type WalletStatus = "disconnected" | "connecting" | "connected" | "signed-in";

interface WalletContextValue {
  status: WalletStatus;
  address: Address | null;
  chainId: number | null;
  session: Session | null;
  provider: BrowserProvider | null;
  signer: JsonRpcSigner | null;
  error: string | null;
  connect: () => Promise<void>;
  signIn: () => Promise<void>;
  signOut: () => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<WalletStatus>("disconnected");
  const [address, setAddress] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [signer, setSigner] = useState<JsonRpcSigner | null>(null);
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applyProvider = useCallback(async (next: BrowserProvider, nextSigner: JsonRpcSigner) => {
    const addr = (await nextSigner.getAddress()).toLowerCase() as Address;
    const network = await next.getNetwork();
    setProvider(next);
    setSigner(nextSigner);
    setAddress(addr);
    setChainId(Number(network.chainId));
    return addr;
  }, []);

  // Silent restore: if the wallet already authorized us and a fresh session exists, resume it.
  useEffect(() => {
    const ethereum = window.ethereum;
    if (!ethereum) return;
    const stored = readJson<Session | null>(localStorage, SESSION_KEY, null);
    if (!stored) return;
    void (async () => {
      try {
        const accounts = (await ethereum.request({ method: "eth_accounts" })) as string[];
        if (!accounts.some((a) => a.toLowerCase() === stored.address.toLowerCase())) return;
        if (stored.expiresAt <= Date.now()) {
          removeKey(localStorage, SESSION_KEY);
          return;
        }
        const next = new BrowserProvider(ethereum);
        const nextSigner = await next.getSigner();
        const addr = await applyProvider(next, nextSigner);
        if (addr !== stored.address.toLowerCase()) return;
        setSession(stored);
        setStatus("signed-in");
      } catch {
        /* wallet not ready — user can connect manually */
      }
    })();
  }, [applyProvider]);

  const connect = useCallback(async () => {
    setError(null);
    const ethereum = window.ethereum;
    if (!ethereum) {
      setError("No EIP-1193 wallet found. Install MetaMask or another browser wallet.");
      return;
    }
    setStatus("connecting");
    try {
      await ethereum.request({ method: "eth_requestAccounts" });
      const next = new BrowserProvider(ethereum);
      const nextSigner = await next.getSigner();
      await applyProvider(next, nextSigner);
      setStatus("connected");
    } catch (e) {
      setStatus("disconnected");
      setError((e as Error).message);
    }
  }, [applyProvider]);

  const signIn = useCallback(async () => {
    setError(null);
    if (!signer || !address) {
      setError("Connect your wallet first.");
      return;
    }
    try {
      const challenge = buildChallenge({
        domain: window.location.hostname,
        uri: config.appUrl,
        address,
        chainId: chainId ?? config.chainId,
      });
      const message = formatChallengeMessage(challenge);
      const signature = await signer.signMessage(message);
      // Self-check: reject anything that does not recover to our own address.
      verifyChallengeSignature(challenge, signature);
      const next: Session = {
        address,
        chainId: chainId ?? config.chainId,
        issuedAt: Date.now(),
        expiresAt: Date.parse(challenge.expiration),
        signature,
      };
      writeJson(localStorage, SESSION_KEY, next);
      setSession(next);
      setStatus("signed-in");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [address, chainId, signer]);

  const signOut = useCallback(() => {
    removeKey(localStorage, SESSION_KEY);
    setSession(null);
    setStatus(address ? "connected" : "disconnected");
  }, [address]);

  const value = useMemo<WalletContextValue>(
    () => ({ status, address, chainId, session, provider, signer, error, connect, signIn, signOut }),
    [status, address, chainId, session, provider, signer, error, connect, signIn, signOut]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside WalletProvider");
  return ctx;
}
