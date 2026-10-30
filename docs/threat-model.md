# Threat Model

This document outlines the security boundaries, assets, threat actors, attack vectors, and defensive mitigations for **ChainSphere**.

---

## 1. Security Objectives & Assets

ChainSphere is designed with five primary security objectives:

1. **Confidentiality:** Plaintext messages, attachments, and private encryption keys must remain private to authorized participants. No server, intermediary, relay, or storage network ever sees plaintext.
2. **Integrity & Tamper-Evidence:** Envelopes cannot be modified in transit or at rest without detection. Recipients verify integrity before decrypting.
3. **Authenticity:** Senders and recipients are cryptographically authenticated via wallet-derived signatures (SIWE) and registered P-256 public keys.
4. **Non-Replayability:** Envelopes, signaling messages, and authentication challenges cannot be replayed by an adversary.
5. **Separation of Concerns:** High-value cryptocurrency signing keys (secp256k1) are never exposed to encryption routines; distinct P-256 ECDH keys handle message encryption.

### Protected Assets

| Asset | Location | Protection Mechanism |
|---|---|---|
| **Plaintext Content** | Browser RAM only | Never written to disk or network; dropped after rendering |
| **P-256 Private Keys** | `sessionStorage` (per tab) | Generated client-side via Web Crypto; never transmitted |
| **Wallet Private Key** | MetaMask / Hardware Wallet | Kept inside the wallet; accessed only via EIP-1193 sign requests |
| **Message Keys (AES)** | Ephemeral / RAM | Fresh 256-bit random key per message, wrapped per recipient |
| **Group Keys** | `GroupKeyStore` / RAM | Rotated on every membership change; previous versions retained for historical read |
| **Ciphertext Envelopes** | Local storage / IPFS / Wire | Encrypted with AES-256-GCM; authenticated with AAD and digests |

---

## 2. Threat Actors & Capabilities

ChainSphere operates under a zero-trust model regarding network infrastructure:

### 1. Untrusted Signaling Server
- **Capabilities:** Can inspect all traffic passing through WebSocket connections; can drop, delay, modify, or inject signaling frames; can attempt to spoof peer addresses.
- **Mitigation:**
  - Signaling routes ciphertext envelopes and WebRTC SDP/ICE candidates only.
  - Payloads are signed or authenticated using AES-256-GCM with recipient-specific key wrapping.
  - Senders and receivers identify peers by wallet addresses verified via SIWE and on-chain registrations.
  - Server modification of frames fails GCM tag verification or digest checks.

### 2. Public IPFS Nodes & Gateways
- **Capabilities:** Can store and inspect all uploaded blocks; can withhold blocks (censorship); can return corrupt or substituted data.
- **Mitigation:**
  - All data uploaded to IPFS is encrypted ciphertext (`payload.enc`).
  - IPFS CIDs and content are validated against SHA-256 digests (`retrieveAndVerify`) before any decryption is attempted.
  - Empty or corrupt uploads are rejected upfront.

### 3. Passive Blockchain Observers
- **Capabilities:** Can read all transactions, events, and state on EVM contracts (`IdentityRegistry`, `ConversationRegistry`, `MessageAnchor`).
- **Mitigation:**
  - Contracts store only public cryptographic metadata: public key fingerprints, public key strings, key versions, and SHA-256 message digests.
  - No plaintext, message ciphertext, or private keys are ever submitted in transactions.

### 4. Malicious or Ejected Peers
- **Capabilities:** An ejected group member attempts to read subsequent conversation messages; an unauthorized user attempts to join a private room.
- **Mitigation:**
  - Smart contracts (`ConversationRegistry`) enforce group membership rules on-chain.
  - Whenever group membership changes (add/remove), `keyVersion` increments and clients rotate the group symmetric key.
  - Envelopes are re-wrapped exclusively for active members. Ejected members lack the wrapped key for subsequent key versions.

### 5. Network Eavesdroppers (Man-in-the-Middle)
- **Capabilities:** Can intercept network packets between client and signaling server or between WebRTC peers.
- **Mitigation:**
  - Signaling requires WSS (TLS). WebRTC requires DTLS-SRTP for peer-to-peer data channels.
  - End-to-end encryption (P-256 ECDH + AES-256-GCM) ensures confidentiality even if TLS/DTLS were terminated prematurely.

---

## 3. Cryptographic Invariants

ChainSphere enforces strict cryptographic invariants:

1. **Zero Key / Nonce Reuse:** Every message envelope utilizes a freshly generated 256-bit AES key and a fresh 96-bit random IV generated via `crypto.getRandomValues`.
2. **Associated Authenticated Data (AAD):** Envelope metadata (`v1|id|from|to|groupId|keyVersion|timestamp`) is injected into AES-GCM as AAD, preventing attackers from modifying sender, recipient, group, or timestamp fields without breaking ciphertext authentication.
3. **Pre-Decryption Digest Verification:** A canonical SHA-256 digest over `iv · ciphertext · sorted(wrappedKeys)` is computed upon encryption and verified *prior* to decryption. Any bit flip causes immediate rejection before exposing cryptographic keys to decrypt operations.
4. **SIWE Nonce Single-Use:** Challenge messages include a timestamp, expiration time (5 minutes), and a unique cryptographically random nonce that is marked spent immediately upon verification.

---

## 4. Attack Scenarios & Mitigations

### A. Envelope Tampering
- **Attack:** An adversary flips bits in the ciphertext or swaps wrapped keys in transit.
- **Result:** Failed digest verification or AES-GCM authentication tag mismatch (`OperationError`). The payload is discarded without reaching the UI or application state.

### B. Message Replay
- **Attack:** An adversary captures a valid encrypted envelope and resends it repeatedly to flood the recipient.
- **Result:** Senders and recipients track message IDs in `ChatStore`. Duplicate IDs are ignored and de-duplicated.

### C. Identity Spoofing / Sybil
- **Attack:** An adversary claims to own address `0xAlice` and registers their own public key for Alice.
- **Result:** `IdentityRegistry.register()` records `msg.sender` as the identity owner. Only the holder of Alice's private key can execute transactions or sign SIWE challenges from Alice's address.

### D. Group Key Poisoning
- **Attack:** A non-admin user attempts to add a compromised member or rotate group keys.
- **Result:** `ConversationRegistry` enforces role-based access control (`onlyAdmin`, `onlyOwner`). Unauthorized transactions revert.

---

## 5. Residual Risks & Operational Considerations

- **Endpoint Security:** If a user's machine is infected with keyloggers or memory scrapers, plaintext in memory or unencrypted keys in `sessionStorage` could be extracted.
- **Traffic Analysis:** While message contents are encrypted, packet sizes and WebRTC connection metadata (IP addresses exchanged during ICE candidate gathering) may reveal communication patterns unless users utilize a VPN or TURN proxy.
- **IPFS Persistence:** Public IPFS nodes do not guarantee permanent pinning. For critical offline persistence, dedicated pinning services or local Kubo nodes should be maintained.
