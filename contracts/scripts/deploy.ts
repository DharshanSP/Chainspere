import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const IdF = await ethers.getContractFactory("IdentityRegistry");
  const id = await IdF.deploy();
  await id.waitForDeployment();
  const identityAddr = await id.getAddress();
  console.log("IdentityRegistry:", identityAddr);

  const ConvF = await ethers.getContractFactory("ConversationRegistry");
  const conv = await ConvF.deploy(identityAddr);
  await conv.waitForDeployment();
  const convAddr = await conv.getAddress();
  console.log("ConversationRegistry:", convAddr);

  const AnchF = await ethers.getContractFactory("MessageAnchor");
  const anch = await AnchF.deploy(identityAddr, convAddr);
  await anch.waitForDeployment();
  const anchAddr = await anch.getAddress();
  console.log("MessageAnchor:", anchAddr);

  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  const outDir = path.join(__dirname, "..", "src", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const out = { chainId, identityRegistry: identityAddr, conversationRegistry: convAddr, messageAnchor: anchAddr };
  fs.writeFileSync(path.join(outDir, `${chainId}.json`), JSON.stringify(out, null, 2));
  fs.writeFileSync(path.join(outDir, `latest.json`), JSON.stringify(out, null, 2));
  console.log("Wrote deployment:", out);
}

main().catch((e) => { console.error(e); process.exit(1); });
