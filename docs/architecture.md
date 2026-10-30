# System Architecture: 5 Core System Blocks

ChainSphere is structured into **5 Core System Blocks** that seamlessly separate concerns between user presentation, identity management, decentralized consensus, immutable off-chain storage, and secure peer-to-peer transport.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        1. FRONTEND LAYER                               │
│              React.js + TypeScript UI (apps/web)                       │
│      Modern UI · Client State Management · Web3 Provider Connection    │
└──────────────────┬───────────────────────────────┬─────────────────────┘
                   │                               │
       ┌───────────▼────────────┐     ┌────────────▼────────────┐
       │   2. IDENTITY LAYER    │     │ 5. P2P & SECURITY LAYER │
       │ MetaMask Wallet Provider│    │   WebRTC + E2E Crypto   │
       │ Asymmetric Key Deriv.  │     │ Direct P2P DataChannels │
       │ Signature Auth (SIWE)  │     │ AES-256 + P-256 ECDH    │
       │ Address Identity       │     │ Envelope Encryption     │
       └───────────┬────────────┘     └────────────┬────────────┘
                   │                               │
       ┌───────────▼────────────┐     ┌────────────▼────────────┐
       │3. SMART CONTRACT LAYER │     │    4. STORAGE LAYER     │
       │Solidity Contracts (EVM)│     │   IPFS Node / Pinata    │
       │ IdentityRegistry       │     │ Encrypted Payload Store │
       │ ConversationRegistry   │     │ Off-chain Media Files   │
       │ MessageAnchor Proofs   │     │ Outputs Immutable CIDs  │
       └────────────────────────┘     └─────────────────────────┘
```

---

## The 5 Core System Blocks

### 1. Frontend Layer
- **Technology:** React.js + TypeScript UI (`apps/web`)
- **Key Responsibilities:**
  - **Modern User Interface:** Responsive, privacy-first messaging interface with dark-mode aesthetic, conversation list, message thread, contact management, and cryptographic status indicators.
  - **Client State Management:** Local-first reactive state management via `ChatStore` (envelopes only) and `keyStore` (in-memory/session cryptographic material).
  - **Web3 Provider Connection:** Connects to `window.ethereum` (EIP-1193 standard) using `ethers.BrowserProvider`, tracks network chain IDs, and handles account lifecycle events.

### 2. Identity Layer
- **Technology:** MetaMask Wallet Provider (`apps/web/src/providers/WalletProvider.tsx`, `packages/crypto/src/signatures/siwe.ts`)
- **Key Responsibilities:**
  - **Asymmetric Key-Pair Derivation & Management:** Generates and manages P-256 ECDH encryption keypairs scoped to the authenticated wallet session. The high-value Ethereum signing key (secp256k1) is strictly segregated from message encryption.
  - **Signature Authentication:** Implements domain-bound challenge-response authentication (EIP-4361 SIWE). Rejects replayed nonces and expired challenges without requiring token grants or server-side cookies.
  - **Address Identity:** Uses the authenticated checksummed Ethereum address as the global peer identifier across contracts, signaling rooms, and recipient envelopes.

### 3. Smart Contract Layer
- **Technology:** Solidity Contracts (EVM) (`contracts/contracts/`, `contracts/test/`)
- **Key Responsibilities:**
  - **User Identity Registry (`IdentityRegistry.sol`):** Maps wallet addresses to active status, public key fingerprints (SHA-256), and P-256 public key material with automatic key versioning.
  - **Group Contract Rules (`ConversationRegistry.sol`):** Authorizes multi-user group chat membership, ownership, and role transitions (owner, admin, member). Enforces key version bumps on membership mutations to trigger symmetric key rotation.
  - **Message Proof Event Logs (`MessageAnchor.sol`):** Records immutable on-chain proof commitments via `anchor(messageId, groupId, digest, cid)`. Emits `MessageAnchored` event logs with sender, cryptographic digest, and IPFS CID proofs without storing plaintext.

### 4. Storage Layer
- **Technology:** IPFS Node / Pinata (`packages/ipfs`, `apps/web/src/services/ipfs.ts`)
- **Key Responsibilities:**
  - **Off-Chain Encrypted Storage:** Stores encrypted message payloads and attached media files off-chain. Neither Kubo nodes nor Pinata pinning services ever receive plaintext or encryption keys.
  - **Immutable CIDs:** Automatically produces content-addressed CIDs (`Qm...` / `bafy...`) for uploaded ciphertexts.
  - **Digest Verification on Retrieval:** Every downloaded block is re-hashed against expected SHA-256 commitments using `retrieveAndVerify()`. Content from external IPFS gateways is never blindly trusted.

### 5. P2P & Security Layer
- **Technology:** WebRTC + E2E Crypto (`packages/messaging`, `packages/crypto`)
- **Key Responsibilities:**
  - **Direct Client P2P Data Channels:** Establishes low-latency, peer-to-peer `RTCDataChannel` connections via WebRTC `PeerManager` with automatic STUN NAT traversal.
  - **Signaling Fallback:** Lightweight WebSocket signaling service routes SDP offers, answers, ICE candidates, and fallback encrypted frames by wallet address without persistent storage.
  - **AES-256 Client Encryption:** Client-side encryption using AES-256-GCM with fresh 96-bit random IVs per message. Recipient message keys are wrapped using ephemeral P-256 ECDH + HKDF-SHA256.
  - **Associated Authenticated Data (AAD):** Cryptographically binds envelope metadata (sender, recipient, group, timestamp, key version) to the ciphertext tag, thwarting forgery and replay.

---

## Monorepo Mapping

| Core System Block | Implementation Location | Packages |
|---|---|---|
| **1. Frontend Layer** | `apps/web` | `@chainsphere/web` |
| **2. Identity Layer** | `apps/web/src/providers/WalletProvider.tsx`, `packages/crypto/src/signatures` | `@chainsphere/crypto`, `@chainsphere/shared` |
| **3. Smart Contract Layer** | `contracts/contracts/` | `chainsphere-contracts` |
| **4. Storage Layer** | `packages/ipfs`, `apps/web/src/services/ipfs.ts` | `@chainsphere/ipfs` |
| **5. P2P & Security Layer** | `packages/messaging`, `packages/crypto`, `apps/signaling` | `@chainsphere/messaging`, `@chainsphere/crypto`, `@chainsphere/signaling` |

---

## Data & Storage Model

| Data Element | Storage Location | Security Properties |
|---|---|---|
| **Plaintext Message** | Browser RAM only | Never persisted to disk; never transmitted across network |
| **P-256 Private Key** | `sessionStorage` (per wallet) | Ephemeral to browser tab session; never exported |
| **Wallet Private Key** | MetaMask / Hardware Wallet | Handled by provider; never touches application code |
| **Ciphertext Envelopes** | Local Storage / IPFS / Wire | Encrypted under AES-256-GCM with verified SHA-256 digest |
| **Media Attachments** | IPFS (Kubo / Pinata) | Encrypted before upload; referenced by immutable CID |
| **Integrity Proofs** | EVM Blockchain (`MessageAnchor`) | On-chain commitment of digest and CID in event logs |
