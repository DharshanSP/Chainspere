# Deployment Guide

This guide covers deploying ChainSphere across local, testnet, and production environments.

---

## 1. Architecture & Components

A production ChainSphere deployment consists of three main components:

1. **Smart Contracts (EVM):** `IdentityRegistry`, `ConversationRegistry`, `MessageAnchor` deployed to an EVM network (e.g. Polygon Amoy, Arbitrum Sepolia, or Ethereum mainnet).
2. **Signaling Service (`apps/signaling`):** A lightweight WebSocket server facilitating WebRTC SDP offer/answer exchanges and message routing fallback.
3. **Web Application (`apps/web`):** A client-side React + TypeScript application hosted via static web hosting or decentralized storage (IPFS/Arweave).

---

## 2. Environment Configuration

Copy the sample environment file:

```bash
cp .env.example .env
```

### Environment Variables Reference

| Variable | Description | Scope |
|---|---|---|
| `VITE_IDENTITY_REGISTRY_ADDRESS` | Address of deployed `IdentityRegistry.sol` | Client |
| `VITE_CONVERSATION_REGISTRY_ADDRESS` | Address of deployed `ConversationRegistry.sol` | Client |
| `VITE_MESSAGE_ANCHOR_ADDRESS` | Address of deployed `MessageAnchor.sol` | Client |
| `VITE_SIGNALING_URL` | WebSocket signaling endpoint (e.g., `wss://signaling.chainsphere.io`) | Client |
| `VITE_DEFAULT_CHAIN_ID` | Default EVM chain ID (e.g., `31337` local, `80002` Polygon Amoy) | Client |
| `VITE_DEFAULT_RPC_URL` | JSON-RPC provider URL | Client |
| `VITE_STUN_SERVERS` | Comma-separated list of STUN servers for WebRTC ICE traversal | Client |
| `VITE_IPFS_API_URL` | Kubo IPFS API endpoint (e.g. `http://127.0.0.1:5001`) | Client |
| `VITE_IPFS_GATEWAY_URL` | IPFS HTTP Gateway URL (e.g. `https://ipfs.io`) | Client |
| `SIGNALING_PORT` | Port for the signaling service (default `8081`) | Server |
| `DEPLOYER_PRIVATE_KEY` | Private key for smart contract deployment (keep secure) | Server / CI |
| `HARDHAT_TESTNET_RPC_URL` | Custom RPC endpoint for contract deployment | Server / CI |

---

## 3. Deploying Smart Contracts

### Local Development (Hardhat Node)

1. Start the local node:
   ```bash
   pnpm dev:chain
   ```
2. In a separate terminal, deploy contracts:
   ```bash
   pnpm deploy:local
   ```
   This automatically deploys all three contracts and writes deployment artifacts and addresses to `contracts/src/deployments/31337.json` and `contracts/src/deployments/latest.json`.

3. Copy the output contract addresses into your `.env` file under `VITE_IDENTITY_REGISTRY_ADDRESS`, `VITE_CONVERSATION_REGISTRY_ADDRESS`, and `VITE_MESSAGE_ANCHOR_ADDRESS`.

### Deploying to Polygon Amoy Testnet

1. Ensure `DEPLOYER_PRIVATE_KEY` has testnet MATIC/POL on Polygon Amoy (`chainId: 80002`).
2. Run Hardhat deployment:
   ```bash
   cd contracts
   npx hardhat run scripts/deploy.ts --network polygonAmoy
   ```
3. Record the deployed contract addresses and update your `.env` file.

---

## 4. Deploying the Signaling Server

The signaling service is stateless and lightweight, handling WebRTC SDP exchange and fallback routing.

### Running with Node.js / PM2

```bash
cd apps/signaling
pnpm build
node dist/index.js
```

Or with PM2:
```bash
pm2 start dist/index.js --name "chainsphere-signaling"
```

### Reverse Proxy & SSL (Nginx)

For browser WebRTC connections in production, signaling connections **must** use `wss://` (secure WebSocket over TLS).

Sample Nginx configuration block:

```nginx
server {
    server_name signaling.chainsphere.io;

    location / {
        proxy_pass http://127.0.0.1:8081;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    listen 443 ssl;
    ssl_certificate /etc/letsencrypt/live/signaling.chainsphere.io/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/signaling.chainsphere.io/privkey.pem;
}
```

---

## 5. Deploying the Web Frontend

### Production Build

```bash
pnpm --filter @chainsphere/web build
```

This generates optimized static production assets in `apps/web/dist/`.

### Hosting Options

1. **Static Cloud Hosting (Vercel, Cloudflare Pages, Netlify):**
   - Build command: `pnpm --filter @chainsphere/web build`
   - Output directory: `apps/web/dist`
   - Configure environment variables in the host dashboard.

2. **Decentralized Hosting (IPFS):**
   - Add the `apps/web/dist` folder to IPFS:
     ```bash
     ipfs add -r apps/web/dist
     ```
   - Bind the resulting CID to an ENS domain (e.g., `chainsphere.eth`) or IPNS record for decentralized access.

---

## 6. Pre-Flight Checklist

Before public release:
- [ ] Contract addresses in `.env` are verified on the target blockchain explorer.
- [ ] Signaling URL is using `wss://` with a valid TLS certificate.
- [ ] STUN servers are reachable and responsive.
- [ ] IPFS gateway URLs are responsive for ciphertext retrieval.
- [ ] All unit, integration, and contract tests pass (`pnpm test`).
- [ ] Linting and typechecks succeed with zero warnings (`pnpm lint`, `pnpm typecheck`).
