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

/**
 * A Polygon (Amoy e mainnet) recusa transação com priority fee abaixo de 25
 * gwei, e a estimativa automática do Hardhat resvala nesse piso: um mint chegou
 * a ser rejeitado por 63 wei ("gas tip cap 24999999937, minimum needed
 * 25000000000"). Fixar 50 gwei legado deixa a margem confortável — em testnet o
 * custo é irrelevante, e uma transação de deploy que falha no meio da sequência
 * custa muito mais caro em confusão do que em gas.
 *
 * É o mesmo piso que src/lib/gasFees.ts aplica no runtime do servidor; aqui vale
 * para todo script do Hardhat, que não passava por aquele caminho.
 */
const POLYGON_MIN_GAS_PRICE = 50_000_000_000;

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
      gasPrice: POLYGON_MIN_GAS_PRICE,
    },
    polygon: {
      url: POLYGON_MAINNET_RPC_URL,
      accounts,
      gasPrice: POLYGON_MIN_GAS_PRICE,
    },
  },
};

export default config;
