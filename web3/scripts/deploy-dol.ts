import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("No deployer signer available");

  const admin = process.env.DOL_ADMIN || deployer.address;
  const minter = process.env.DOL_MINTER || deployer.address;

  const DolToken = await ethers.getContractFactory("DolToken");
  const dol = await DolToken.deploy(admin, minter);
  await dol.waitForDeployment();

  console.log("DolToken deployed:", await dol.getAddress());
  console.log("Admin:", admin);
  console.log("Minter:", minter);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
