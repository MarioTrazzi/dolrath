import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("No deployer signer available");

  // Fixed 1B supply is minted once to the treasury at deploy (no minter role).
  const treasury = process.env.DOL_TREASURY_ADDRESS || deployer.address;

  const DolToken = await ethers.getContractFactory("DolToken");
  const dol = await DolToken.deploy(treasury);
  await dol.waitForDeployment();

  console.log("DolToken deployed:", await dol.getAddress());
  console.log("Treasury (holds 1B DOL):", treasury);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
