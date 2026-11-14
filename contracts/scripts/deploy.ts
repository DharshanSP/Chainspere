import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer:       ", deployer.address);
  console.log("Balance (POL):  ", ethers.formatEther(balance));

  if (balance === 0n) {
    throw new Error("Deployer wallet has 0 POL — get testnet tokens from https://faucet.polygon.technology first.");
  }

  console.log("\n[1/3] Deploying IdentityRegistry…");
  const IdF = await ethers.getContractFactory("IdentityRegistry");
  const id = await IdF.deploy();
  await id.waitForDeployment();
  const identityAddr = await id.getAddress();
  console.log("  ✓ IdentityRegistry:", identityAddr);

  console.log("[2/3] Deploying ConversationRegistry…");
  const ConvF = await ethers.getContractFactory("ConversationRegistry");
  const conv = await ConvF.deploy(identityAddr);
  await conv.waitForDeployment();
  const convAddr = await conv.getAddress();
  console.log("  ✓ ConversationRegistry:", convAddr);

  console.log("[3/3] Deploying MessageAnchor…");
  const AnchF = await ethers.getContractFactory("MessageAnchor");
  const anch = await AnchF.deploy(identityAddr, convAddr);
  await anch.waitForDeployment();
  const anchAddr = await anch.getAddress();
  console.log("  ✓ MessageAnchor:", anchAddr);

  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);

  // Write deployment JSON
  const outDir = path.join(__dirname, "..", "src", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const out = { chainId, identityRegistry: identityAddr, conversationRegistry: convAddr, messageAnchor: anchAddr };
  fs.writeFileSync(path.join(outDir, `${chainId}.json`), JSON.stringify(out, null, 2));
  fs.writeFileSync(path.join(outDir, `latest.json`), JSON.stringify(out, null, 2));

  // Print .env snippet for the frontend
  const explorerBase = chainId === 80002
    ? "https://amoy.polygonscan.com/address"
    : "https://etherscan.io/address";

  console.log("\n════════════════════════════════════════════════════════");
  console.log("  Deployment complete! Copy these into your .env:");
  console.log("════════════════════════════════════════════════════════");
  console.log(`VITE_CHAIN_ID=${chainId}`);
  console.log(`VITE_LOCAL_RPC_URL=https://polygon-amoy.drpc.org`);
  console.log(`VITE_IDENTITY_REGISTRY_ADDRESS=${identityAddr}`);
  console.log(`VITE_CONVERSATION_REGISTRY_ADDRESS=${convAddr}`);
  console.log(`VITE_MESSAGE_ANCHOR_ADDRESS=${anchAddr}`);
  console.log("════════════════════════════════════════════════════════");
  console.log("\nBlock explorer links:");
  console.log(`  IdentityRegistry:     ${explorerBase}/${identityAddr}`);
  console.log(`  ConversationRegistry: ${explorerBase}/${convAddr}`);
  console.log(`  MessageAnchor:        ${explorerBase}/${anchAddr}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
