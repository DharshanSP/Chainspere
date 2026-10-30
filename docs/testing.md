# Testing Guide

ChainSphere employs a multi-tiered testing strategy covering unit tests, cryptographic vector verification, peer-to-peer network simulations, and smart contract execution on a simulated EVM blockchain.

---

## 1. Overview of Test Suites

The monorepo uses **Vitest** for TypeScript packages and applications, and **Hardhat + Ethers.js** for Solidity smart contracts.

| Target | Framework | Key Scenarios Covered |
|---|---|---|
| **`@chainsphere/shared`** | Vitest | Zod schemas for envelopes, signaling frames, auth challenges, and protocol constants |
| **`@chainsphere/crypto`** | Vitest | AES-256-GCM encryption/decryption, P-256 ECDH key wrapping, SIWE signatures, digest verification, group key rotation |
| **`@chainsphere/ipfs`** | Vitest | Encrypted upload/download adapters, verification of SHA-256 digest on read, empty payload rejection |
| **`@chainsphere/messaging`** | Vitest | WebRTC `PeerManager` with fake data channels, exponential backoff retry in `DeliveryQueue`, duplicate message de-duplication |
| **`@chainsphere/signaling`** | Vitest | WebSocket connection lifecycle, frame validation, client room routing, address binding |
| **`@chainsphere/web`** | Vitest | Address truncation, checksum formatting, local-first storage helpers |
| **`chainsphere-contracts`** | Hardhat | Smart contract authorization, access control, registration, key version bumping, anchoring integrity |

---

## 2. Running Tests

### Run all workspace tests

To run the complete test suite across every package:

```bash
pnpm test
```

### Run tests for a specific package

You can filter execution by package name:

```bash
# Cryptographic primitives & envelope tests
pnpm --filter @chainsphere/crypto test

# Smart contracts
pnpm --filter chainsphere-contracts test

# Messaging & WebRTC queue tests
pnpm --filter @chainsphere/messaging test

# IPFS storage adapter tests
pnpm --filter @chainsphere/ipfs test

# Signaling server tests
pnpm --filter @chainsphere/signaling test

# Shared schema tests
pnpm --filter @chainsphere/shared test

# Web frontend unit tests
pnpm --filter @chainsphere/web test
```

### Interactive / Watch Mode

For active test-driven development:

```bash
pnpm --filter @chainsphere/crypto exec vitest
```

---

## 3. Smart Contract Testing

Smart contract tests run against Hardhat's in-memory EVM node (`hardhat-network`).

```bash
cd contracts
pnpm test
```

### Tested Invariants:
1. **IdentityRegistry:**
   - Registration assigns initial `keyVersion = 1` and marks identity active.
   - Rejects duplicate registration attempts from the same address.
   - Rejects zero-byte fingerprints.
   - Key rotation increments `keyVersion` and updates fingerprint.
   - Deactivation prevents unauthorized interactions.
2. **ConversationRegistry:**
   - Room creation assigns creator as owner, admin, and active member.
   - Rejects empty conversation names.
   - Adding or removing members increments `keyVersion` to mandate symmetric key rotation.
   - Ownership transfers and member demotions/promotions enforce strict role permissions.
   - Non-registered identities cannot perform mutations.
3. **MessageAnchor:**
   - Senders can anchor message digests with unique message IDs.
   - Rejects duplicate message IDs and empty digests.
   - Anchoring for group conversations verifies active group membership in `ConversationRegistry`.

---

## 4. Cryptographic Edge Case & Tamper Tests

The cryptographic test suite verifies defense against active tampering:

- **Tag Tampering:** Modifying any byte of AES-GCM ciphertext fails authentication tag checks.
- **Envelope Digest Tampering:** Tampering with the canonical serialization (`iv`, `ciphertext`, or `wrappedKeys`) is caught *before* decryption during `verifyDigest()`.
- **Associated Authenticated Data (AAD) Binding:** Modifying metadata fields (e.g. sender, recipient, timestamp, key version) causes decryption to abort.
- **Replay Protection:** SIWE signature verification enforces single-use nonces and rejects expired challenges.
- **Group Forward Secrecy:** When a member is removed from a group and the symmetric key rotates, tests verify that the former member cannot decrypt envelopes produced under subsequent key versions.

---

## 5. Type Checking and Linting

Before pushing changes or opening a pull request, ensure static analysis and type checks pass:

```bash
# Workspace-wide TypeScript type checking
pnpm typecheck

# ESLint check (zero warnings allowed)
pnpm lint

# Production build across all packages
pnpm build
```
