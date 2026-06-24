import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  const dol = process.env.DOL_TOKEN_ADDRESS;
  if (!dol) {
    throw new Error("Missing DOL_TOKEN_ADDRESS in web3/.env");
  }

  const characters = process.env.CHARACTER_NFT_CONTRACT_ADDRESS;
  if (!characters) {
    throw new Error("Missing CHARACTER_NFT_CONTRACT_ADDRESS in web3/.env");
  }

  console.log("Deploying DolrathCharacterMarket...");
  console.log("Deployer:", deployer.address);
  console.log("DOL:", dol);
  console.log("Characters NFT:", characters);

  const Factory = await ethers.getContractFactory("DolrathCharacterMarket");
  const contract = await Factory.deploy(dol, characters);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("DolrathCharacterMarket deployed to:", address);
  console.log("Set CHARACTER_MARKET_CONTRACT_ADDRESS=" + address);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
