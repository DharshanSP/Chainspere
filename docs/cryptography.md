# Cryptography

ChainSphere separates authentication from encryption, and never reuses keys or nonces.

## Key hierarchy

```
wallet secp256k1 (MetaMask)   →  auth only (SIWE-style challenge signature)
P-256 ECDH keypair (browser)  →  message encryption
  per message  : random AES-256 message key + fresh 96-bit IV
  per recipient: ephemeral P-256 ECDH → HKDF-SHA256 → KEK → AES-256-GCM key wrap
  group        : 32-byte group key (GroupKeyStore), rotated on membership change
```

- The wallet signing key is **never** used to encrypt anything.
- Message keys are ephemeral: generated per message, wrapped per recipient, then dropped.
- Every wrap and every payload encryption uses a fresh random IV (WebCrypto `getRandomValues`).

## Envelope format (`v: 1`)

| Field | Meaning |
| --- | --- |
| `id` | Client-generated 16-byte id (hex) — also the on-chain anchor key |
| `from` / `to` / `groupId` | Sender, recipient (`null` for groups), group id |
| `keyVersion` | Key version the recipient should unwrap with |
| `iv`, `ciphertext` | AES-256-GCM payload (base64) |
| `wrappedKeys[]` | `{ recipient, ephemPub, wrappedKey, iv }` per authorized recipient |
| `digest` | SHA-256 over canonical encrypted bytes — the anchoring commitment |

**AAD** binds `v1|id|from|to|groupId|keyVersion|timestamp`, so metadata cannot be rewritten
without failing decryption. **Digest** is computed over the canonical serialization of
`iv · ciphertext · sorted(wrappedKeys)`, and is verified *before* decryption — tampered
envelopes are rejected without touching key material.

## Recipient key wrapping

1. Sender generates an ephemeral P-256 keypair.
2. `ECDH(ephemPriv, recipientPub)` → shared secret → `HKDF-SHA256(salt="", info="chainsphere-msg-v1")` → KEK.
3. Message key is encrypted under the KEK with AES-256-GCM (fresh IV, AAD as above).
4. `(ephemPub, wrappedKey, iv)` is placed in `wrappedKeys` for that recipient.

The sender also wraps the message key for itself, enabling "self-read" of own history.

## Authentication (SIWE subset)

`buildChallenge` → wallet signs the EIP-4361-style message → `verifyChallengeSignature`
checks recovery, expiry, issued-at skew, and nonce replay. The signature proves wallet
ownership; it never moves funds.

## On-chain commitments

`MessageAnchor.anchor(messageId, groupId, digest, cid)` stores the SHA-256 digest of the
encrypted payload (plus optional ciphertext CID). Anyone holding the envelope can recompute
the digest locally and compare — the chain provides tamper-evidence, not confidentiality.

## Group keys

`GroupKeyStore` keeps a 32-byte key per version. `ConversationRegistry` bumps `keyVersion`
on every membership change; clients rotate the group key and re-wrap it for the new member set.
Old keys can be pruned for forward hygiene (this does not revoke already-seen content).

## What never leaves the device

- P-256 private keys (kept in `sessionStorage` for the tab only; exportable JWK for backup)
- Plaintext (memory-only after decryption; local storage persists envelopes)
- Wallet private keys (handled entirely by the wallet)
