# ChainSphere

Decentralized, privacy-preserving messaging. Messages are end-to-end encrypted in the browser
(P-256 ECDH + AES-256-GCM), delivered over WebRTC data channels with a WebSocket signaling
fallback, stored optionally on IPFS as ciphertext, and committed on-chain for tamper-evident
integrity — no server ever sees plaintext, keys, or attachments.

## Monorepo layout

| Path | Package | Purpose |
| --- | --- | --- |
| `packages/shared` | `@chainsphere/shared` | Domain types, zod schemas, protocol constants |
| `packages/crypto` | `@chainsphere/crypto` | Envelope encryption, key wrapping, SIWE-style auth, group keys |
| `packages/ipfs` | `@chainsphere/ipfs` | Kubo HTTP adapter + in-memory adapter, verified upload/retrieval |
| `packages/messaging` | `@chainsphere/messaging` | WebRTC `PeerManager`, signaling transports, delivery retry queue |
| `apps/signaling` | `@chainsphere/signaling` | Minimal WebSocket signaling server (routes setup frames only) |
| `apps/web` | `@chainsphere/web` | React + Vite wallet app (chat, contacts, on-chain registration) |
| `contracts` | `chainsphere-contracts` | `IdentityRegistry`, `ConversationRegistry`, `MessageAnchor` (Hardhat) |

## Quickstart

```bash
pnpm install

# 1. local chain + contracts
pnpm dev:chain                 # terminal A: hardhat node (chainId 31337)
pnpm deploy:local              # terminal B: deploys the three contracts

# 2. signaling server
pnpm dev:signaling             # terminal C: ws://localhost:8081

# 3. web app
cp .env.example .env           # paste the deployed contract addresses into VITE_* vars
pnpm dev                       # http://localhost:5173
```

Open the app in two browsers (or one normal + one incognito) with two different wallets,
sign in, add each other's address as a contact, and chat. With both wallets registered in the
`IdentityRegistry`, peer public keys are resolved on-chain automatically.

## Scripts

| Command | Effect |
| --- | --- |
| `pnpm test` | All unit/integration tests (shared, crypto, ipfs, messaging, web, signaling, contracts) |
| `pnpm typecheck` | Project-wide `tsc --noEmit` across every workspace package |
| `pnpm build` | Build every package, the web bundle, and compile contracts |
| `pnpm lint` | ESLint (flat config) with zero warnings allowed |
| `pnpm dev` / `dev:signaling` / `dev:chain` | Run web / signaling / local chain |
| `pnpm deploy:local` | Deploy contracts to the local node and write `contracts/src/deployments/` |

## Environment

Copy `.env.example` to `.env`. Only `VITE_`-prefixed variables reach the browser:

- `VITE_IDENTITY_REGISTRY_ADDRESS`, `VITE_CONVERSATION_REGISTRY_ADDRESS`, `VITE_MESSAGE_ANCHOR_ADDRESS` — deployed contract addresses
- `VITE_SIGNALING_URL` — WebSocket signaling endpoint (default `ws://localhost:8081`)
- `VITE_STUN_SERVERS` — comma-separated STUN list for WebRTC
- `VITE_IPFS_API_URL` / `VITE_IPFS_GATEWAY_URL` — Kubo node + gateway for ciphertext fallback

Server-side vars (`SIGNALING_PORT`, `IPFS_PINNING_*`, `DEPLOYER_PRIVATE_KEY`, …) must never be
prefixed with `VITE_`.

## Security model (summary)

- The wallet key (secp256k1) is used **only** for SIWE-style authentication. Encryption always uses
  a separate P-256 keypair generated in the browser (`docs/cryptography.md`).
- Envelopes carry ciphertext + per-recipient wrapped keys only. Signaling and IPFS route/store
  ciphertext; they hold no plaintext and no keys.
- `MessageAnchor` stores SHA-256 digests of encrypted payloads — integrity commitments, never content.
- Plaintext exists only in memory after decryption; local storage keeps envelopes only.

See `docs/cryptography.md` and `docs/architecture.md` for details.
