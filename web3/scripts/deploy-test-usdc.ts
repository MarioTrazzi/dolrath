import { ethers, network } from "hardhat";

/**
 * Deploy do dublê de USDC (6 decimais) para o ensaio na Amoy.
 * Recusa rodar na mainnet — na Polygon 137 o token de pagamento é a USDC real
 * da Circle, que já existe e não se deploya.
 */
async function main() {
  if (network.name === "polygon") {
    throw new Error(
      "TestUSDC é só para ensaio. Na mainnet use a USDC nativa da Circle " +
        "(0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359, confira no Polygonscan)."
    );
  }

  const [deployer] = await ethers.getSigners();

  console.log("Deploying TestUSDC (6 decimals)...");
  console.log("Network:", network.name);
  console.log("Deployer:", deployer.address);

  const Factory = await ethers.getContractFactory("TestUSDC");
  const contract = await Factory.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("TestUSDC deployed to:", address);
  console.log("");
  console.log("Ponha nas envs do app (Preview/Development):");
  console.log(`  DOL_TOKEN_ADDRESS="${address}"`);
  console.log(`  NEXT_PUBLIC_DOL_TOKEN_ADDRESS="${address}"`);
  console.log("");
  console.log("Testadores se servem chamando faucet() (50 tUSDC / 12h).");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
