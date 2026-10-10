import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const TESTNET_RPC = process.env.HARDHAT_TESTNET_RPC_URL ?? "";
const DEPLOYER_KEY = process.env.DEPLOYER_PRIVATE_KEY ?? "";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    hardhat: { chainId: 31337 },
    localhost: { url: "http://127.0.0.1:8545", chainId: 31337 },
    polygonAmoy: {
      url: TESTNET_RPC || "https://rpc-amoy.polygon.technology",
      accounts: DEPLOYER_KEY ? [DEPLOYER_KEY] : [],
      chainId: 80002,
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    artifacts: "./src/artifacts",
    cache: "./cache",
  },
};

export default config;
