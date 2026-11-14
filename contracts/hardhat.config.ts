import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

// Read from shell environment (set via PowerShell $env:VAR before running hardhat)
const TESTNET_RPC = process.env.HARDHAT_TESTNET_RPC_URL ?? "https://polygon-amoy.drpc.org";
const DEPLOYER_KEY = process.env.DEPLOYER_PRIVATE_KEY ?? "";
const POLYGONSCAN_API_KEY = process.env.BLOCK_EXPLORER_API_KEY ?? "";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    hardhat: { chainId: 31337 },
    localhost: { url: "http://127.0.0.1:8545", chainId: 31337 },
    polygonAmoy: {
      url: TESTNET_RPC,
      accounts: DEPLOYER_KEY ? [DEPLOYER_KEY] : [],
      chainId: 80002,
      gasPrice: "auto",
    },
  },
  etherscan: {
    apiKey: {
      polygonAmoy: POLYGONSCAN_API_KEY,
    },
    customChains: [
      {
        network: "polygonAmoy",
        chainId: 80002,
        urls: {
          apiURL: "https://api-amoy.polygonscan.com/api",
          browserURL: "https://amoy.polygonscan.com",
        },
      },
    ],
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    artifacts: "./src/artifacts",
    cache: "./cache",
  },
};

export default config;
