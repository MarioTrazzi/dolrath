import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  const signer = process.env.ITEM_NFT_SIGNER_ADDRESS || process.env.GOLD_SIGNER_ADDRESS;
  if (!signer) {
    throw new Error("Missing ITEM_NFT_SIGNER_ADDRESS (or GOLD_SIGNER_ADDRESS) in web3/.env");
  }

  const baseURIRaw = (process.env.ITEM_NFT_BASE_URI || "").trim();
  const baseURI = baseURIRaw && !baseURIRaw.endsWith("/") ? `${baseURIRaw}/` : baseURIRaw;

  console.log("Deploying DolrathItems...");
  console.log("Deployer:", deployer.address);
  console.log("Signer:", signer);
  console.log("BaseURI:", baseURI);

  const Factory = await ethers.getContractFactory("DolrathItems");
  const contract = await Factory.deploy(signer, baseURI);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("DolrathItems deployed to:", address);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
