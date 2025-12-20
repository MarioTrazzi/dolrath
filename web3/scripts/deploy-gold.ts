import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  const signer = process.env.GOLD_SIGNER_ADDRESS;
  if (!signer) {
    throw new Error("Missing GOLD_SIGNER_ADDRESS in web3/.env");
  }

  console.log("Deploying DolrathGold...");
  console.log("Deployer:", deployer.address);
  console.log("Signer:", signer);

  const Factory = await ethers.getContractFactory("DolrathGold");
  const contract = await Factory.deploy(signer);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("DolrathGold deployed to:", address);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
