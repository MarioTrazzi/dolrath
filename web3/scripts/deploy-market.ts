import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  const gold = process.env.GOLD_CONTRACT_ADDRESS;
  if (!gold) {
    throw new Error("Missing GOLD_CONTRACT_ADDRESS in web3/.env");
  }

  const items = process.env.ITEM_NFT_CONTRACT_ADDRESS;
  if (!items) {
    throw new Error("Missing ITEM_NFT_CONTRACT_ADDRESS in web3/.env");
  }

  const feeTreasury = process.env.GOLD_TREASURY_ADDRESS || deployer.address;

  console.log("Deploying DolrathItemMarket...");
  console.log("Deployer:", deployer.address);
  console.log("GOLD:", gold);
  console.log("Items NFT:", items);
  console.log("Fee treasury:", feeTreasury, "(fee: 2% burn + 2% treasury)");

  const Factory = await ethers.getContractFactory("DolrathItemMarket");
  const contract = await Factory.deploy(gold, items, feeTreasury);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("DolrathItemMarket deployed to:", address);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
