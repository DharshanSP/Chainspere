# ChainSphere 🔗

### Connect privately. Communicate securely. Verify on-chain.

**ChainSphere** is a decentralized, privacy-focused messaging platform designed to combine blockchain technology, end-to-end encryption, decentralized storage, and peer-to-peer communication.

The project aims to give users greater control over their digital conversations through wallet-based authentication, encrypted messaging, IPFS storage, and blockchain-based message integrity verification.

> 🚧 **Status:** Under active development. Features and architecture may change as development progresses.

## ✨ Features

- 🔐 **Wallet-Based Authentication** — Connect using MetaMask and authenticate through cryptographic signatures.
- 💬 **Private Messaging** — Send encrypted messages between authorized users.
- 🔗 **Blockchain Integration** — Use Solidity smart contracts for identity registration, group permissions, and message integrity commitments.
- 📦 **Decentralized Storage** — Store encrypted message payloads and attachments using IPFS.
- ⚡ **Peer-to-Peer Communication** — Use WebRTC for direct real-time communication between connected clients.
- 🛡️ **End-to-End Encryption** — Encrypt message content on the client before transmission.
- 👥 **Group Conversations** — Support group membership and permission management through smart contracts.
- 📎 **Encrypted File Sharing** — Share files after client-side encryption.
- ✅ **Message Integrity Verification** — Verify encrypted payloads against cryptographic digests or on-chain commitments.
- 🌐 **EVM Compatibility** — Develop locally with Hardhat and target compatible Ethereum-based networks.

*Features are planned or in development unless explicitly marked as implemented in the repository.*

## 🏗️ Technology Stack

| Technology | Purpose |
|---|---|
| React | User interface |
| TypeScript | Type-safe frontend development |
| Vite | Development server and build tooling |
| Tailwind CSS | Styling and responsive design |
| Solidity | Smart contract development |
| Hardhat | Contract compilation, testing, and deployment |
| Ethereum / Polygon Amoy | EVM blockchain integration |
| MetaMask | Wallet connection and authentication |
| IPFS | Decentralized storage of encrypted data |
| WebRTC | Peer-to-peer communication |
| AES-256-GCM | Authenticated message encryption |
| ECDH / HKDF | Key agreement and key derivation |

## 🧠 Architecture

ChainSphere follows a hybrid decentralized architecture.

```text
                   ChainSphere
                        |
             React + TypeScript
                        |
             +----------+----------+
             |          |          |
          Wallet     Crypto      Messaging
         MetaMask    Package      Layer
             |          |          |
             |      AES-GCM       WebRTC
             |      ECDH/HKDF    DataChannel
             |          |          |
             +----------+----------+
                        |
             +----------+----------+
             |                     |
        Smart Contracts           IPFS
          Solidity            Encrypted Data
             |
       EVM Blockchain
```

### How it works

1. **Connect:** Users connect their MetaMask wallet and authenticate by signing a domain-bound challenge.
2. **Establish identity:** Users initialize encryption keys and publish appropriate public-key information.
3. **Encrypt:** Message content is encrypted locally before it leaves the sender's device.
4. **Communicate:** Encrypted payloads are exchanged over WebRTC when peers can connect.
5. **Store:** Encrypted payloads and attachments can be uploaded to IPFS for retrieval.
6. **Verify:** Recipients validate message integrity using cryptographic digests and, where enabled, blockchain commitments.
7. **Manage groups:** Smart contracts enforce group membership and authorized administrative operations.

**Privacy note:** Blockchain transactions and events are public. IPFS does not automatically provide confidentiality or permanent availability. ChainSphere is designed to keep plaintext messages and private encryption keys off-chain.

## 📂 Project Structure

The intended project structure is organized into independent applications and reusable packages.

```text
ChainSphere/
├── apps/
│   ├── web/                 # React + TypeScript frontend
│   └── signaling/           # WebRTC signaling service
├── packages/
│   ├── shared/              # Shared types and validation
│   ├── blockchain/           # Contract integration
│   ├── crypto/               # Encryption and key management
│   ├── ipfs/                 # IPFS storage adapters
│   └── messaging/            # WebRTC and message delivery
├── contracts/
│   ├── contracts/            # Solidity smart contracts
│   ├── test/                 # Contract tests
│   ├── scripts/              # Deployment scripts
│   └── hardhat.config.ts
├── docs/
│   ├── architecture.md
│   ├── cryptography.md
│   ├── threat-model.md
│   ├── testing.md
│   └── deployment.md
├── .env.example
├── package.json
├── pnpm-workspace.yaml
└── README.md
```

*This is the target structure; adjust it to match the files actually present in the repository.*

## ⚙️ Getting Started

### Prerequisites

Install the following tools:

- [Node.js](https://nodejs.org/) — use a supported LTS release.
- [Git](https://git-scm.com/)
- [Visual Studio Code](https://code.visualstudio.com/) or another compatible editor.
- [MetaMask](https://metamask.io/) for wallet integration.

You will also need a package manager compatible with the project's workspace configuration, an IPFS provider for storage integration, and blockchain RPC configuration when using a public testnet.

### 1. Clone the repository

```bash
git clone https://github.com/DharshanSP/ChainSphere.git
cd ChainSphere
```

### 2. Install dependencies

If the repository uses pnpm:

```bash
corepack enable
pnpm install
```

### 3. Configure environment variables

Copy the example configuration:

```bash
cp .env.example .env
```

On Windows PowerShell, you can use:

```powershell
Copy-Item .env.example .env
```

Configure the required RPC endpoints, network IDs, contract addresses, IPFS settings, and signaling URL.

Never commit real credentials or private keys. Keep server-only secrets out of frontend environment variables.

### 4. Start a local blockchain

Once the Hardhat project is configured:

```bash
pnpm exec hardhat node
```

Keep this terminal running.

### 5. Compile and test smart contracts

```bash
pnpm exec hardhat compile
pnpm exec hardhat test
```

### 6. Start the application

Use the scripts defined in the root `package.json`. For example, if the workspace defines these scripts:

```bash
pnpm dev
```

For individual applications, use their documented development scripts.

> **Note:** These commands assume the corresponding workspace configuration and scripts have been implemented. Check the current repository before running them.

## 🧪 Testing

ChainSphere's testing strategy is intended to cover:

- Smart contract authorization and access control.
- Wallet signature validation and replay protection.
- Encryption and decryption.
- Tampered ciphertext detection.
- Key rotation and group membership changes.
- IPFS upload and retrieval.
- WebRTC connection establishment and message delivery.
- Unauthorized access attempts.
- Frontend behavior and integration workflows.

Run the relevant test commands after configuring the project. Test results should be reported only after the tests have actually executed.

## 🔒 Security Principles

ChainSphere is being developed around the following principles:

- Encrypt sensitive content before uploading or transmitting it.
- Never store plaintext messages or private encryption keys on-chain.
- Never request a user's seed phrase or private key.
- Authenticate wallet signatures and validate message payloads.
- Enforce authorization in smart contracts, not only in the frontend.
- Verify retrieved content before decrypting or displaying it.
- Minimize publicly visible blockchain metadata.
- Rotate group encryption keys when membership changes.
- Treat external gateways, signaling services, and dependencies as potentially untrusted.

**Security disclaimer:** This project is experimental and is not yet a substitute for a professionally audited messaging or cryptographic system. Do not use it for highly sensitive communications until it has undergone appropriate security review.

## 🗺️ Roadmap

- [ ] Establish monorepo and development tooling.
- [ ] Implement and test Solidity smart contracts.
- [ ] Integrate MetaMask wallet authentication.
- [ ] Implement decentralized identity and public-key management.
- [ ] Build the cryptographic messaging protocol.
- [ ] Integrate encrypted IPFS storage.
- [ ] Implement WebRTC peer-to-peer communication.
- [ ] Build one-to-one conversations.
- [ ] Implement group conversations and key rotation.
- [ ] Add encrypted file sharing.
- [ ] Implement message integrity anchoring.
- [ ] Add end-to-end integration tests.
- [ ] Deploy to a supported EVM testnet.
- [ ] Complete security review and deployment documentation.

## 🤝 Contributing

Contributions, suggestions, bug reports, and architectural feedback are welcome.

1. Fork the repository.
2. Create a feature branch.
3. Make your changes and add appropriate tests.
4. Run the project's checks.
5. Submit a pull request describing the changes.

Please avoid submitting real credentials, private keys, or sensitive conversation data.

## 📄 License

Choose and add an appropriate open-source license before distributing the project. Until a license is added, the repository should not be assumed to grant general permission to reuse, modify, or redistribute its code.

## 👨‍💻 Author

**Dharshan S P**

GitHub: [@DharshanSP](https://github.com/DharshanSP)

---

*ChainSphere — Building a more private and verifiable way to communicate.*
