import { buildChallenge, formatChallengeMessage, verifyChallengeSignature } from "@chainsphere/crypto";
import type { Address, Session } from "@chainsphere/shared";
import { BrowserProvider, JsonRpcProvider, Wallet, BaseWallet, type JsonRpcSigner, type Signer } from "ethers";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { readJson, removeKey, writeJson } from "../lib/storage";
import { config } from "../services/config";

const SESSION_KEY = "chainsphere.session.v1";
const GUEST_KEY = "chainsphere.guest.v1";

type WalletStatus = "disconnected" | "connecting" | "connected" | "signed-in";

interface WalletContextValue {
  status: WalletStatus;
  address: Address | null;
  chainId: number | null;
  session: Session | null;
  provider: BrowserProvider | JsonRpcProvider | null;
  signer: Signer | null;
  error: string | null;
  clearError: () => void;
  connect: () => Promise<void>;
  signIn: () => Promise<void>;
  connectAndSignIn: () => Promise<void>;
  signInAsGuest: () => Promise<void>;
  signOut: () => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<WalletStatus>("disconnected");
  const [address, setAddress] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [signer, setSigner] = useState<Signer | null>(null);
  const [provider, setProvider] = useState<BrowserProvider | JsonRpcProvider | null>(null);
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

  // Silent restore: resume existing session if available
  useEffect(() => {
    const stored = readJson<Session | null>(localStorage, SESSION_KEY, null);
    if (!stored) return;
    if (stored.expiresAt <= Date.now()) {
      removeKey(localStorage, SESSION_KEY);
      return;
    }

    // Check if it's a guest wallet
    const guestPriv = localStorage.getItem(GUEST_KEY);
    if (guestPriv) {
      try {
        const wallet = new Wallet(guestPriv);
        if (wallet.address.toLowerCase() === stored.address.toLowerCase()) {
          const jsonRpc = new JsonRpcProvider(config.rpcUrl);
          setProvider(jsonRpc);
          setSigner(wallet.connect(jsonRpc));
          setAddress(stored.address.toLowerCase() as Address);
          setChainId(stored.chainId);
          setSession(stored);
          setStatus("signed-in");
          return;
        }
      } catch {
        /* fallback to ethereum */
      }
    }

    // Check ethereum (MetaMask)
    const ethereum = window.ethereum;
    if (!ethereum) return;
    void (async () => {
      try {
        const accounts = (await ethereum.request({ method: "eth_accounts" })) as string[];
        if (!accounts.some((a) => a.toLowerCase() === stored.address.toLowerCase())) return;
        const next = new BrowserProvider(ethereum);
        const nextSigner = await next.getSigner();
        const addr = await applyProvider(next, nextSigner);
        if (addr !== stored.address.toLowerCase()) return;
        setSession(stored);
        setStatus("signed-in");
      } catch {
        /* wallet not ready */
      }
    })();
  }, [applyProvider]);

  const connect = useCallback(async () => {
    setError(null);
    const ethereum = window.ethereum;
    if (!ethereum) {
      setError("No MetaMask or browser wallet found. Use Instant Demo Sign-In to continue.");
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
      const activeChainId = chainId ?? config.chainId;
      const challenge = buildChallenge({
        domain: window.location.hostname,
        uri: window.location.origin,
        address,
        chainId: activeChainId,
      });
      const message = formatChallengeMessage(challenge);
      const signature = await signer.signMessage(message);
      verifyChallengeSignature(challenge, signature);
      const next: Session = {
        address,
        chainId: activeChainId,
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

  const connectAndSignIn = useCallback(async () => {
    setError(null);
    const ethereum = window.ethereum;
    if (!ethereum) {
      setError("No MetaMask or browser wallet found. Use Instant Demo Sign-In below.");
      return;
    }
    setStatus("connecting");
    try {
      await ethereum.request({ method: "eth_requestAccounts" });
      const next = new BrowserProvider(ethereum);
      const nextSigner = await next.getSigner();
      const addr = await applyProvider(next, nextSigner);
      setStatus("connected");

      const net = await next.getNetwork();
      const activeChainId = Number(net.chainId) || config.chainId;
      const challenge = buildChallenge({
        domain: window.location.hostname,
        uri: window.location.origin,
        address: addr,
        chainId: activeChainId,
      });
      const message = formatChallengeMessage(challenge);
      const signature = await nextSigner.signMessage(message);
      verifyChallengeSignature(challenge, signature);

      const nextSession: Session = {
        address: addr,
        chainId: activeChainId,
        issuedAt: Date.now(),
        expiresAt: Date.parse(challenge.expiration),
        signature,
      };
      writeJson(localStorage, SESSION_KEY, nextSession);
      setSession(nextSession);
      setStatus("signed-in");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [applyProvider]);

  const signInAsGuest = useCallback(async () => {
    setError(null);
    try {
      const privKey = localStorage.getItem(GUEST_KEY);
      let wallet: BaseWallet;
      if (privKey) {
        wallet = new Wallet(privKey);
      } else {
        wallet = Wallet.createRandom();
        localStorage.setItem(GUEST_KEY, (wallet as Wallet).privateKey);
      }
      const addr = wallet.address.toLowerCase() as Address;
      const jsonRpc = new JsonRpcProvider(config.rpcUrl);
      setProvider(jsonRpc);
      setSigner(wallet.connect(jsonRpc));
      setAddress(addr);
      setChainId(config.chainId);

      const challenge = buildChallenge({
        domain: window.location.hostname,
        uri: window.location.origin,
        address: addr,
        chainId: config.chainId,
      });
      const message = formatChallengeMessage(challenge);
      const signature = await wallet.signMessage(message);
      verifyChallengeSignature(challenge, signature);

      const next: Session = {
        address: addr,
        chainId: config.chainId,
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
  }, []);

  const signOut = useCallback(() => {
    removeKey(localStorage, SESSION_KEY);
    setSession(null);
    setStatus("disconnected");
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value = useMemo<WalletContextValue>(
    () => ({
      status,
      address,
      chainId,
      session,
      provider,
      signer,
      error,
      clearError,
      connect,
      signIn,
      connectAndSignIn,
      signInAsGuest,
      signOut,
    }),
    [status, address, chainId, session, provider, signer, error, clearError, connect, signIn, connectAndSignIn, signInAsGuest, signOut]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside WalletProvider");
  return ctx;
}
