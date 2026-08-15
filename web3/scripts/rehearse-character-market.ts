/**
 * Ensaio ponta-a-ponta da VENDA DE PERSONAGEM (DOL) numa chain local.
 *
 * Diferente de web3/test/Markets.test.ts — que exercita só o contrato —, este
 * script roda as MESMAS bibliotecas que o servidor do jogo usa
 * (src/lib/characterMarketOnchain.ts e src/lib/characterMarketVerify.ts) contra
 * contratos de verdade, por HTTP JSON-RPC. É o teste que pega o desencontro
 * entre app e chain: ABI errada, evento que não decodifica, endereço em
 * checksum diferente, provider mal configurado.
 *
 * Pré-requisito: um nó local rodando (`npm run chain:node`).
 * Execução:      `npm run chain:rehearse:character-market`
 *
 * Cenários cobertos:
 *  1. listar   → ListingCreated decodificado pela lib do app
 *  2. comprar  → ListingPurchased decodificado + rateio (vendedor/burn/treasury)
 *  3. posse    → ownerOf on-chain acompanha a compra
 *  4. REPLAY   → o comprador revende ao vendedor original e tenta reapresentar a
 *                tx antiga: o evento AINDA valida (é história), mas o ownerOf
 *                nega — que é exatamente a autoridade do purchase-confirm
 *  5. cancelar → ListingCancelled decodificado + NFT de volta ao vendedor
 */
import { ethers } from "hardhat";
import assert from "node:assert/strict";

const MINT_TYPES = {
  MintRequest: [
    { name: "to", type: "address" },
    { name: "tokenURI", type: "string" },
    { name: "deadline", type: "uint256" },
  ],
};

const RPC_URL = "http://127.0.0.1:8545";

let passed = 0;
function check(label: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✔ ${label}`);
}

async function main() {
  const net = await ethers.provider.getNetwork();
  console.log(`Ensaio do mercado de personagens — chainId ${net.chainId}\n`);

  const [deployer, treasuryWallet, feeTreasury, seller, buyer] = await ethers.getSigners();
  const nftSigner = deployer; // faz o papel do assinador EIP-712 do servidor

  // ---- Deploy da pilha completa ------------------------------------------
  const DolToken = await ethers.getContractFactory("DolToken");
  const dol = await DolToken.deploy(treasuryWallet.address);
  await dol.waitForDeployment();

  const Characters = await ethers.getContractFactory("DolrathCharacters");
  const characters = await Characters.deploy(nftSigner.address);
  await characters.waitForDeployment();

  const Market = await ethers.getContractFactory("DolrathCharacterMarket");
  const market = await Market.deploy(
    await dol.getAddress(),
    await characters.getAddress(),
    feeTreasury.address
  );
  await market.waitForDeployment();

  const marketAddress = await market.getAddress();
  const charactersAddress = await characters.getAddress();
  const dolAddress = await dol.getAddress();

  console.log(`DOL:        ${dolAddress}`);
  console.log(`Characters: ${charactersAddress}`);
  console.log(`Market:     ${marketAddress}\n`);

  // ---- Ambiente exatamente como o servidor do jogo o lê -------------------
  // O endereço vai em minúsculas de propósito: o app precisa funcionar com o
  // env em qualquer capitalização.
  process.env.CHARACTER_MARKET_CONTRACT_ADDRESS = marketAddress.toLowerCase();
  process.env.CHARACTER_NFT_CONTRACT_ADDRESS = charactersAddress.toLowerCase();
  // A moeda do mercado é PRÓPRIA. DOL_TOKEN_ADDRESS recebe de propósito um
  // token errado (o dublê de USDC do ensaio da Amoy) para provar que o mercado
  // não cai no fallback quando a var específica está setada.
  process.env.CHARACTER_MARKET_PAY_TOKEN_ADDRESS = dolAddress.toLowerCase();
  process.env.DOL_TOKEN_ADDRESS = "0x000000000000000000000000000000000000dEaD";
  process.env.CHARACTER_MARKET_RPC_URL = RPC_URL;
  process.env.CHARACTER_MARKET_CHAIN_ID = String(net.chainId);
  process.env.CHARACTER_MARKET_RECEIPT_RETRIES = "3";
  process.env.CHARACTER_MARKET_RECEIPT_DELAY_MS = "200";

  // Import DEPOIS do env: as libs leem process.env na chamada, mas manter a
  // ordem deixa o ensaio honesto quanto ao que o servidor faz.
  const {
    getCharacterMarketFees,
    getCharacterMarketContract,
    getCharacterNftOwner,
    getCharacterMarketPayTokenAddress,
    getCharacterMarketPayTokenContract,
  } = await import("../../src/lib/characterMarketOnchain");
  const { verifyCharacterListedTx, verifyCharacterPurchasedTx, verifyCharacterListingCancelledTx } =
    await import("../../src/lib/characterMarketVerify");

  // ---- Preparação: DOL para o comprador, NFT para o vendedor -------------
  const price = ethers.parseUnits("1000", 18);
  await (await dol.connect(treasuryWallet).transfer(buyer.address, ethers.parseUnits("10000", 18))).wait();
  // O vendedor também precisa de DOL: no cenário 3 ele RECOMPRA o personagem.
  await (await dol.connect(treasuryWallet).transfer(seller.address, ethers.parseUnits("10000", 18))).wait();

  const domain = {
    name: "DolrathCharacters",
    version: "1",
    chainId: net.chainId,
    verifyingContract: charactersAddress,
  };
  const deadline = BigInt(Math.floor(Date.now() / 1000)) + 3600n;
  const tokenURI = "https://dolrath.example/api/nft/character/ensaio-1";
  const mintSig = await nftSigner.signTypedData(domain, MINT_TYPES, {
    to: seller.address,
    tokenURI,
    deadline,
  });
  await (await characters.connect(seller).mintWithSig(seller.address, tokenURI, deadline, mintSig)).wait();

  const tokenId = 1n;
  assert.equal(await characters.ownerOf(tokenId), seller.address, "mint do personagem falhou");

  // ---- 0. Config lida pela lib do app ------------------------------------
  console.log("0) Config on-chain lida pelas libs do app");
  const fees = await getCharacterMarketFees();
  check(`taxa: ${fees.burnBps / 100}% burn + ${fees.treasuryBps / 100}% treasury`, () => {
    assert.equal(fees.burnBps, 250);
    assert.equal(fees.treasuryBps, 250);
    assert.equal(fees.totalBps, 500);
  });

  // A moeda do mercado NÃO pode vir de DOL_TOKEN_ADDRESS quando a var própria
  // existe — esse fallback errado é o que criaria um mercado cobrando USDC.
  const payTokenAddress = getCharacterMarketPayTokenAddress();
  const payToken = getCharacterMarketPayTokenContract();
  const paySymbol = String(await payToken.symbol());
  const payDecimals = Number(await payToken.decimals());
  check(`moeda do mercado = ${paySymbol} (${payDecimals} casas), ignorando DOL_TOKEN_ADDRESS`, () => {
    assert.equal(payTokenAddress.toLowerCase(), dolAddress.toLowerCase());
    assert.equal(paySymbol, "DOL");
    assert.equal(payDecimals, 18);
  });

  const appMarket = getCharacterMarketContract();
  const wiredDol = String(await appMarket.dol()).toLowerCase();
  const wiredNft = String(await appMarket.characters()).toLowerCase();
  check("dol() e characters() batem com o deploy (env em minúsculas)", () => {
    assert.equal(wiredDol, (dolAddress).toLowerCase());
    assert.equal(wiredNft, charactersAddress.toLowerCase());
  });

  // ---- 1. Listar ----------------------------------------------------------
  console.log("\n1) Vendedor lista o personagem (escrow)");
  await (await characters.connect(seller).setApprovalForAll(marketAddress, true)).wait();
  const listTx = await market.connect(seller).createListing(tokenId, price);
  await listTx.wait();

  const listed = await verifyCharacterListedTx({
    txHash: listTx.hash,
    expectedSeller: seller.address,
    expectedTokenId: tokenId,
  });
  check(`ListingCreated decodificado (listing #${listed.listingId}, ${ethers.formatUnits(listed.priceDol, 18)} DOL)`, () => {
    assert.equal(listed.tokenId, tokenId);
    assert.equal(listed.priceDol, price);
    assert.equal(listed.seller.toLowerCase(), seller.address.toLowerCase());
  });

  const escrowOwner = await getCharacterNftOwner(tokenId);
  check("a NFT está em escrow no contrato do mercado", () => {
    assert.equal(escrowOwner.toLowerCase(), marketAddress.toLowerCase());
  });

  const activeIds = (await appMarket.getActiveListingIds()) as bigint[];
  check(`getActiveListingIds() devolve a listagem (${activeIds.length} ativa)`, () => {
    assert.ok(activeIds.map(String).includes(String(listed.listingId)));
  });

  // ---- 2. Comprar ---------------------------------------------------------
  console.log("\n2) Comprador paga em DOL");
  const supplyBefore = await dol.totalSupply();
  const sellerBefore = await dol.balanceOf(seller.address);
  const treasuryBefore = await dol.balanceOf(feeTreasury.address);

  await (await dol.connect(buyer).approve(marketAddress, price)).wait();
  const buyTx = await market.connect(buyer).buy(listed.listingId);
  await buyTx.wait();

  const purchased = await verifyCharacterPurchasedTx({
    txHash: buyTx.hash,
    expectedBuyer: buyer.address,
    expectedListingId: listed.listingId,
  });
  check("ListingPurchased decodificado com comprador e listingId esperados", () => {
    assert.equal(purchased.tokenId, tokenId);
    assert.equal(purchased.priceDol, price);
    assert.equal(purchased.buyer.toLowerCase(), buyer.address.toLowerCase());
    assert.equal(purchased.seller.toLowerCase(), seller.address.toLowerCase());
  });

  const burnAmt = (price * 250n) / 10_000n;
  const treasAmt = (price * 250n) / 10_000n;
  const sellerAfter = await dol.balanceOf(seller.address);
  const treasuryAfter = await dol.balanceOf(feeTreasury.address);
  const supplyAfter = await dol.totalSupply();
  check("rateio: vendedor 95% + treasury 2,5% + burn real 2,5%", () => {
    assert.equal(sellerAfter, sellerBefore + (price - burnAmt - treasAmt), "vendedor recebeu errado");
    assert.equal(treasuryAfter, treasuryBefore + treasAmt, "treasury recebeu errado");
    assert.equal(supplyAfter, supplyBefore - burnAmt, "o burn não destruiu supply");
  });

  const ownerAfterBuy = await getCharacterNftOwner(tokenId);
  check("ownerOf on-chain = comprador (a autoridade do purchase-confirm)", () => {
    assert.equal(ownerAfterBuy.toLowerCase(), buyer.address.toLowerCase());
  });

  // ---- 3. Replay da tx de compra -----------------------------------------
  console.log("\n3) Replay: comprador revende ao vendedor ORIGINAL e reapresenta a tx antiga");
  await (await characters.connect(buyer).setApprovalForAll(marketAddress, true)).wait();
  const relistTx = await market.connect(buyer).createListing(tokenId, price);
  await relistTx.wait();
  const relisted = await verifyCharacterListedTx({ txHash: relistTx.hash, expectedSeller: buyer.address });

  await (await dol.connect(seller).approve(marketAddress, price)).wait();
  await (await market.connect(seller).buy(relisted.listingId)).wait();

  const replayEvt = await verifyCharacterPurchasedTx({
    txHash: buyTx.hash,
    expectedBuyer: buyer.address,
  });
  check("a tx antiga AINDA valida como evento (por isso o evento não basta)", () => {
    assert.equal(replayEvt.tokenId, tokenId);
    assert.equal(replayEvt.buyer.toLowerCase(), buyer.address.toLowerCase());
  });

  const ownerNow = await getCharacterNftOwner(tokenId);
  check("mas ownerOf já é o vendedor original → o replay é recusado", () => {
    assert.equal(ownerNow.toLowerCase(), seller.address.toLowerCase());
    assert.notEqual(ownerNow.toLowerCase(), buyer.address.toLowerCase());
  });

  // ---- 4. Cancelar --------------------------------------------------------
  console.log("\n4) Vendedor lista e cancela");
  const listTx2 = await market.connect(seller).createListing(tokenId, price);
  await listTx2.wait();
  const listed2 = await verifyCharacterListedTx({ txHash: listTx2.hash, expectedSeller: seller.address });

  const cancelTx = await market.connect(seller).cancelListing(listed2.listingId);
  await cancelTx.wait();

  const cancelled = await verifyCharacterListingCancelledTx({
    txHash: cancelTx.hash,
    expectedSeller: seller.address,
    expectedListingId: listed2.listingId,
  });
  check("ListingCancelled decodificado com o listingId esperado", () => {
    assert.equal(cancelled.listingId, listed2.listingId);
  });

  const ownerAfterCancel = await getCharacterNftOwner(tokenId);
  check("a NFT voltou do escrow para o vendedor", () => {
    assert.equal(ownerAfterCancel.toLowerCase(), seller.address.toLowerCase());
  });

  // ---- 5. Rejeições esperadas --------------------------------------------
  console.log("\n5) Rejeições esperadas");
  await assert.rejects(
    () => verifyCharacterPurchasedTx({ txHash: buyTx.hash, expectedBuyer: seller.address }),
    /Nenhum evento ListingPurchased compatível/,
    "compra de outra carteira deveria ser recusada"
  );
  check("tx de compra com carteira errada é recusada", () => {});

  await assert.rejects(
    () => verifyCharacterPurchasedTx({ txHash: listTx.hash }),
    /Nenhum evento ListingPurchased compatível/,
    "tx de listagem não pode passar por compra"
  );
  check("tx de LISTAGEM não passa por compra", () => {});

  await assert.rejects(
    () => getCharacterNftOwner(999_999n),
    /.*/,
    "tokenId inexistente deveria falhar"
  );
  check("tokenId inexistente não devolve dono", () => {});

  console.log(`\n✅ Ensaio completo — ${passed} verificações passaram.`);
}

main().catch((err) => {
  console.error("\n❌ Ensaio FALHOU:\n", err);
  process.exitCode = 1;
});
