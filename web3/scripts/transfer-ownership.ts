import { ethers } from "hardhat";

// Transfere o ownership dos contratos Ownable (Gold, Items, ambos os markets)
// para o Safe multisig. O deployer deve ser o owner atual de cada um.
//
// Requer em web3/.env:
//   OWNER_SAFE_ADDRESS            (destino — Safe multisig)
//   GOLD_CONTRACT_ADDRESS
//   ITEM_NFT_CONTRACT_ADDRESS
//   ITEM_MARKET_CONTRACT_ADDRESS
//   CHARACTER_MARKET_CONTRACT_ADDRESS
//
// DolToken (sem owner) e DolrathCharacters (só signer rotacionável, sem Ownable
// na v1 do fluxo) não entram aqui — Characters passou a ser Ownable, então TAMBÉM
// é transferido se CHARACTER_NFT_CONTRACT_ADDRESS estiver setado.
async function main() {
  const [deployer] = await ethers.getSigners();
  const safe = (process.env.OWNER_SAFE_ADDRESS || "").trim();
  if (!ethers.isAddress(safe)) {
    throw new Error("Missing/invalid OWNER_SAFE_ADDRESS in web3/.env");
  }

  const targets: { label: string; env: string }[] = [
    { label: "DolrathGold", env: "GOLD_CONTRACT_ADDRESS" },
    { label: "DolrathCharacters", env: "CHARACTER_NFT_CONTRACT_ADDRESS" },
    { label: "DolrathItems", env: "ITEM_NFT_CONTRACT_ADDRESS" },
    { label: "DolrathItemMarket", env: "ITEM_MARKET_CONTRACT_ADDRESS" },
    { label: "DolrathCharacterMarket", env: "CHARACTER_MARKET_CONTRACT_ADDRESS" },
  ];

  console.log("Deployer (current owner):", deployer.address);
  console.log("New owner (Safe):", safe);
  console.log("");

  const ownableAbi = [
    "function owner() view returns (address)",
    "function transferOwnership(address newOwner)",
  ];

  for (const t of targets) {
    const addr = (process.env[t.env] || "").trim();
    if (!addr) {
      console.log(`- ${t.label}: SKIP (${t.env} não definido)`);
      continue;
    }
    const c = new ethers.Contract(addr, ownableAbi, deployer);
    try {
      const current = await c.owner();
      if (current.toLowerCase() === safe.toLowerCase()) {
        console.log(`- ${t.label} (${addr}): já pertence ao Safe, SKIP`);
        continue;
      }
      if (current.toLowerCase() !== deployer.address.toLowerCase()) {
        console.log(`- ${t.label} (${addr}): owner atual é ${current}, NÃO é o deployer — SKIP`);
        continue;
      }
      const tx = await c.transferOwnership(safe);
      console.log(`- ${t.label} (${addr}): transferOwnership tx ${tx.hash} ...`);
      const rc = await tx.wait();
      if (!rc || rc.status !== 1) throw new Error("tx falhou");
      console.log(`  ✓ ${t.label} agora pertence ao Safe`);
    } catch (err) {
      console.error(`  ✗ ${t.label} (${addr}): ${(err as Error).message}`);
    }
  }

  console.log("\nPronto. Confirme cada owner no Polygonscan.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
