import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-chai-matchers";
import dotenv from "dotenv";
import path from "path";
import type { HardhatUserConfig } from "hardhat/config";

dotenv.config({ path: path.resolve(__dirname, ".env") });

const normalizeRpcUrl = (url: string) => {
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return `https://${trimmed}`;
};

const POLYGON_AMOY_RPC_URL = normalizeRpcUrl(process.env.POLYGON_AMOY_RPC_URL || "");
const POLYGON_MAINNET_RPC_URL = normalizeRpcUrl(process.env.POLYGON_MAINNET_RPC_URL || "");
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "";

const accounts = DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [];

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  networks: {
    hardhat: {},
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    polygonAmoy: {
      url: POLYGON_AMOY_RPC_URL,
      accounts,
    },
    polygon: {
      url: POLYGON_MAINNET_RPC_URL,
      accounts,
    },
  },
};

export default config;
