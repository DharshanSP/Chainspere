# Architecture

```
┌─────────────┐   SIWE challenge    ┌──────────────┐
│  Browser    │◄───────────────────►│ Wallet (EIP- │
│  apps/web   │   signature only    │ 1193 provider)│
└──────┬──────┘                     └──────────────┘
       │ encrypt (P-256/AES-GCM, local)
       │
       ├─► WebRTC DataChannel ──────────────► peer browser (preferred path)
       │        ▲  offer/answer/ice
       │        │
       ├─► WebSocket signaling ── routes setup frames + envelope fallback
       │        (apps/signaling — never sees plaintext)
       │
       ├─► IPFS (ciphertext only, CID delivery for offline peers)
       │
       └─► Ethereum: IdentityRegistry · ConversationRegistry · MessageAnchor
```

## Packages

- **@chainsphere/shared** — single source of truth for envelope/signal/auth schemas (zod) and
  protocol constants (`MAX_MESSAGE_CHARS`, `ACK_TIMEOUT_MS`, `HKDF_INFO`, supported networks).
- **@chainsphere/crypto** — WebCrypto primitives, envelope encrypt/decrypt, key wrapping,
  `GroupKeyStore`, SIWE helpers. Pure, environment-agnostic (Node tests + browser).
- **@chainsphere/messaging** — `PeerManager` (offer/answer/ICE, ack + bounded retry + duplicate
  detection + exponential backoff reconnect), `WebSocketTransport`, `InMemoryTransport` for tests,
  and `DeliveryQueue` (retry with backoff; caller decides IPFS fallback).
- **@chainsphere/ipfs** — `KuboHttpAdapter` for real Kubo nodes, `InMemoryIpfsAdapter` for tests
  and daemon-less demos. `uploadWithRetry` / `retrieveAndVerify` refuse empty payloads and verify
  digests on read — IPFS content is never trusted blindly.
- **@chainsphere/signaling** — one TCP port, address registration on first frame, per-peer rate
  limiting, frame-size caps. Routes `offer/answer/ice/envelope/receipt` by address; stores nothing.
- **@chainsphere/web** — React app: wallet connect + SIWE session, local keypair management,
  contacts, chat threads, on-chain identity registration and message anchoring.

## Message flow (1:1)

1. Sender resolves the peer's P-256 public key (contact cache → `IdentityRegistry.keyRef`).
2. `encryptText` produces a `MessageEnvelope` (ciphertext + wrapped keys + digest).
3. `PeerManager.sendEnvelope` tries the open data channel with ack + retry.
4. On failure, the envelope is sent as a `envelope` frame over signaling (routed by address).
   If the peer is offline entirely, the message stays queued (`DeliveryQueue`); the caller may
   upload the ciphertext to IPFS and deliver the CID later.
5. Receiver validates the envelope schema, checks the digest, unwraps its key, decrypts, and acks.
6. Optionally the sender anchors `sha256(ciphertext)` on `MessageAnchor` for tamper-evidence.

## Storage model

| Data | Where | Notes |
| --- | --- | --- |
| Plaintext | Memory only | Never persisted, never sent |
| Envelopes | `localStorage` (per wallet) | Ciphertext; safe to persist |
| P-256 private key | `sessionStorage` (per wallet) | Cleared when the tab closes |
| Wallet key | Wallet | Never exported |
| Public key ref | `IdentityRegistry.keyRef` | Public material only |
| Digest | `MessageAnchor` | Commitment, not content |

## Contracts

- **IdentityRegistry** — wallet → active flag, key fingerprint (SHA-256), version, key ref.
  Registration is required before any other on-chain mutation.
- **ConversationRegistry** — group lifecycle with contract-enforced membership: create/add/remove/
  leave/promote/demote/transfer. Every membership change bumps `keyVersion` so clients rotate
  group keys. Frontend checks are advisory; the contract is the authority.
- **MessageAnchor** — `anchor(messageId, groupId, digest, cid)`; only the sender may anchor their
  id, and group anchoring requires active membership. `verify`/`getAnchor` are read-only.

## Trust & threat model

| Party | Sees | Cannot |
| --- | --- | --- |
| Signaling server | Addresses, SDP/ICE, ciphertext envelopes | Read plaintext or keys |
| IPFS network | Ciphertext blobs | Read plaintext; alter content undetected (digest checked) |
| Chain observers | Digests, key fingerprints, membership | Recover message content |
| A malicious peer | Their own unwrapped keys | Read messages they are not a recipient of |

Replay is bounded by envelope ids, acks, and nonce-checked SIWE challenges. Tampering is caught
by AES-GCM tags plus the pre-decryption digest check; re-anchoring a forged digest is impossible
without the sender's wallet.
