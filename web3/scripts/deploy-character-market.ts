import { ethers } from "hardhat";

/**
 * Deploy do DolrathCharacterMarket.
 *
 * ⚠️ A moeda vem de CHARACTER_MARKET_PAY_TOKEN_ADDRESS, não de
 * DOL_TOKEN_ADDRESS. No ensaio da Amoy, DOL_TOKEN_ADDRESS guarda o TestUSDC (o
 * token de PAGAMENTO da criação de personagem) — deployar contra ele criaria um
 * mercado cobrando dólar de teste. E `dol` é immutable no contrato: erro aqui
 * só se conserta com redeploy, resgatando à mão qualquer NFT em escrow.
 *
 * O script se recusa a rodar se o token não suportar `burnFrom`: o `buy()`
 * queima 2,5% do preço, então um token não-queimável faz TODA compra reverter.
 */
async function main() {
  const [deployer] = await ethers.getSigners();

  const payToken = (
    process.env.CHARACTER_MARKET_PAY_TOKEN_ADDRESS ||
    process.env.DOL_TOKEN_ADDRESS ||
    ""
  ).trim();
  if (!payToken) {
    throw new Error("Missing CHARACTER_MARKET_PAY_TOKEN_ADDRESS (ou DOL_TOKEN_ADDRESS) in web3/.env");
  }

  const characters = process.env.CHARACTER_NFT_CONTRACT_ADDRESS;
  if (!characters) {
    throw new Error("Missing CHARACTER_NFT_CONTRACT_ADDRESS in web3/.env");
  }

  const feeTreasury = process.env.DOL_FEE_TREASURY_ADDRESS || process.env.GOLD_TREASURY_ADDRESS || deployer.address;

  // ---- Guardas: a moeda precisa ser o DOL de verdade -----------------------
  const token = new ethers.Contract(
    payToken,
    [
      "function symbol() view returns (string)",
      "function decimals() view returns (uint8)",
      "function burnFrom(address,uint256)",
    ],
    ethers.provider
  );

  const [symbol, decimals] = await Promise.all([token.symbol(), token.decimals()]);

  const usdcAddress = (process.env.USDC_TOKEN_ADDRESS || "").trim();
  if (usdcAddress && usdcAddress.toLowerCase() === payToken.toLowerCase()) {
    throw new Error(
      `RECUSADO: a moeda do mercado (${payToken}) é o mesmo endereço de USDC_TOKEN_ADDRESS. ` +
        `Aponte CHARACTER_MARKET_PAY_TOKEN_ADDRESS para o DolToken.`
    );
  }

  // `burnFrom` inexistente devolve revert SEM dados; um token queimável de
  // verdade reverte com motivo (saldo/allowance zerados nesta sonda).
  try {
    await token.burnFrom.staticCall("0x0000000000000000000000000000000000000001", 1n);
  } catch (err: any) {
    const hasRevertData = Boolean(err?.data && err.data !== "0x") || Boolean(err?.reason);
    if (!hasRevertData) {
      throw new Error(
        `RECUSADO: o token ${symbol} (${payToken}) não implementa burnFrom. ` +
          `O buy() queima ${'2,5%'} do preço — toda compra reverteria.`
      );
    }
  }

  console.log("Deploying DolrathCharacterMarket...");
  console.log("Deployer:", deployer.address);
  console.log(`Moeda:    ${payToken} (${symbol}, ${decimals} casas)`);
  console.log("Characters NFT:", characters);
  console.log("Fee treasury:", feeTreasury, "(fee: 2.5% burn + 2.5% treasury)");

  const Factory = await ethers.getContractFactory("DolrathCharacterMarket");
  const contract = await Factory.deploy(payToken, characters, feeTreasury);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("DolrathCharacterMarket deployed to:", address);
  console.log("Set CHARACTER_MARKET_CONTRACT_ADDRESS=" + address);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
