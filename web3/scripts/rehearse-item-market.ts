/**
 * Ensaio ponta-a-ponta da VENDA DE ITEM (GOLD) numa chain local.
 *
 * Irmão do rehearse-character-market.ts: roda as MESMAS bibliotecas do servidor
 * (src/lib/itemMarketOnchain.ts e src/lib/itemMarketVerify.ts) contra contratos
 * de verdade, por HTTP JSON-RPC.
 *
 * Pré-requisito: um nó local rodando (`npm run chain:node`).
 * Execução:      `npm run chain:rehearse:item-market`
 */
import { ethers } from "hardhat";
import assert from "node:assert/strict";

const CLAIM_TYPES = {
  ClaimRequest: [
    { name: "to", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
};

const MINT_ITEM_TYPES = {
  MintItemRequest: [
    { name: "to", type: "address" },
    { name: "purchaseId", type: "bytes32" },
    { name: "itemKey", type: "bytes32" },
    { name: "paidGold", type: "uint256" },
    { name: "tokenURI", type: "string" },
    { name: "deadline", type: "uint256" },
  ],
};

const RPC_URL = "http://127.0.0.1:8545";
const BASE_URI = "https://dolrath.example/api/nft/item/";

let passed = 0;
function check(label: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✔ ${label}`);
}

async function main() {
  const net = await ethers.provider.getNetwork();
  console.log(`Ensaio do mercado de itens — chainId ${net.chainId}\n`);

  const [deployer, , feeTreasury, seller, buyer] = await ethers.getSigners();
  const sigSigner = deployer; // assinador EIP-712 do servidor

  const Gold = await ethers.getContractFactory("DolrathGold");
  const gold = await Gold.deploy(sigSigner.address);
  await gold.waitForDeployment();

  const Items = await ethers.getContractFactory("DolrathItems");
  const items = await Items.deploy(sigSigner.address, BASE_URI);
  await items.waitForDeployment();

  const Market = await ethers.getContractFactory("DolrathItemMarket");
  const market = await Market.deploy(
    await gold.getAddress(),
    await items.getAddress(),
    feeTreasury.address
  );
  await market.waitForDeployment();

  const goldAddress = await gold.getAddress();
  const itemsAddress = await items.getAddress();
  const marketAddress = await market.getAddress();

  console.log(`GOLD:   ${goldAddress}`);
  console.log(`Items:  ${itemsAddress}`);
  console.log(`Market: ${marketAddress}\n`);

  // Ambiente como o servidor lê (endereços em minúsculas de propósito).
  process.env.ITEM_MARKET_CONTRACT_ADDRESS = marketAddress.toLowerCase();
  process.env.ITEM_NFT_CONTRACT_ADDRESS = itemsAddress.toLowerCase();
  process.env.ITEM_MARKET_RPC_URL = RPC_URL;
  process.env.ITEM_MARKET_CHAIN_ID = String(net.chainId);
  process.env.ITEM_MARKET_RECEIPT_RETRIES = "3";
  process.env.ITEM_MARKET_RECEIPT_DELAY_MS = "200";

  const { getItemMarketFees, getItemMarketContract, getItemNftOwner } = await import(
    "../../src/lib/itemMarketOnchain"
  );
  const { verifyListingPurchasedTx } = await import("../../src/lib/itemMarketVerify");

  const deadline = BigInt(Math.floor(Date.now() / 1000)) + 3600n;
  const price = ethers.parseUnits("1000", 18);

  // GOLD para o comprador (e para o vendedor, que recompra no cenário 3).
  for (const [who, nonce] of [
    [buyer, 1n],
    [seller, 2n],
  ] as const) {
    const amount = ethers.parseUnits("10000", 18);
    const sig = await sigSigner.signTypedData(
      { name: "DolrathGold", version: "1", chainId: net.chainId, verifyingContract: goldAddress },
      CLAIM_TYPES,
      { to: who.address, amount, nonce, deadline }
    );
    await (await gold.connect(who).claimWithSig(who.address, amount, nonce, deadline, sig)).wait();
  }

  // Item NFT para o vendedor (lazy-mint: o item off-chain já foi queimado).
  const purchaseId = ethers.keccak256(ethers.toUtf8Bytes("lazymint:inv-ensaio-1"));
  const itemKey = ethers.keccak256(ethers.toUtf8Bytes("espada-de-ferro"));
  const paidGold = ethers.parseUnits("250", 18);
  const mintSig = await sigSigner.signTypedData(
    { name: "DolrathItems", version: "1", chainId: net.chainId, verifyingContract: itemsAddress },
    MINT_ITEM_TYPES,
    { to: seller.address, purchaseId, itemKey, paidGold, tokenURI: "", deadline }
  );
  await (
    await items.connect(seller).mintWithSig(seller.address, purchaseId, itemKey, paidGold, "", deadline, mintSig)
  ).wait();

  const tokenId = 1n;

  // ---- 0. Config lida pela lib do app ------------------------------------
  console.log("0) Config on-chain lida pelas libs do app");
  const fees = await getItemMarketFees();
  check(`taxa: ${fees.burnBps / 100}% burn + ${fees.treasuryBps / 100}% treasury`, () => {
    assert.equal(fees.burnBps, 200);
    assert.equal(fees.treasuryBps, 200);
  });

  const appMarket = getItemMarketContract();
  const wiredGold = String(await appMarket.gold()).toLowerCase();
  const wiredItems = String(await appMarket.items()).toLowerCase();
  check("gold() e items() batem com o deploy (env em minúsculas)", () => {
    assert.equal(wiredGold, goldAddress.toLowerCase());
    assert.equal(wiredItems, itemsAddress.toLowerCase());
  });

  // ---- 1. Listar ----------------------------------------------------------
  console.log("\n1) Vendedor lista o item (escrow)");
  await (await items.connect(seller).setApprovalForAll(marketAddress, true)).wait();
  await (await market.connect(seller).createListing(tokenId, price)).wait();

  const escrowOwner = await getItemNftOwner(tokenId);
  check("a NFT está em escrow no contrato do mercado", () => {
    assert.equal(escrowOwner.toLowerCase(), marketAddress.toLowerCase());
  });

  // ---- 2. Comprar ---------------------------------------------------------
  console.log("\n2) Comprador paga em GOLD");
  const supplyBefore = await gold.totalSupply();
  const sellerBefore = await gold.balanceOf(seller.address);
  const treasuryBefore = await gold.balanceOf(feeTreasury.address);

  await (await gold.connect(buyer).approve(marketAddress, price)).wait();
  const buyTx = await market.connect(buyer).buy(1n);
  await buyTx.wait();

  const purchased = await verifyListingPurchasedTx({
    txHash: buyTx.hash,
    expectedBuyer: buyer.address,
    expectedListingId: 1n,
  });
  check("ListingPurchased decodificado com comprador e listingId esperados", () => {
    assert.equal(purchased.tokenId, tokenId);
    assert.equal(purchased.priceGold, price);
    assert.equal(purchased.buyer.toLowerCase(), buyer.address.toLowerCase());
    assert.equal(purchased.seller.toLowerCase(), seller.address.toLowerCase());
  });

  const burnAmt = (price * 200n) / 10_000n;
  const treasAmt = (price * 200n) / 10_000n;
  const sellerAfter = await gold.balanceOf(seller.address);
  const treasuryAfter = await gold.balanceOf(feeTreasury.address);
  const supplyAfter = await gold.totalSupply();
  check("rateio: vendedor 96% + treasury 2% + burn real 2%", () => {
    assert.equal(sellerAfter, sellerBefore + (price - burnAmt - treasAmt));
    assert.equal(treasuryAfter, treasuryBefore + treasAmt);
    assert.equal(supplyAfter, supplyBefore - burnAmt, "o burn não destruiu supply");
  });

  const ownerAfterBuy = await getItemNftOwner(tokenId);
  check("ownerOf on-chain = comprador (a autoridade do purchase-confirm)", () => {
    assert.equal(ownerAfterBuy.toLowerCase(), buyer.address.toLowerCase());
  });

  // ---- 3. Replay da tx de compra -----------------------------------------
  console.log("\n3) Replay: comprador revende ao vendedor ORIGINAL e reapresenta a tx antiga");
  await (await items.connect(buyer).setApprovalForAll(marketAddress, true)).wait();
  await (await market.connect(buyer).createListing(tokenId, price)).wait();
  await (await gold.connect(seller).approve(marketAddress, price)).wait();
  await (await market.connect(seller).buy(2n)).wait();

  const replayEvt = await verifyListingPurchasedTx({ txHash: buyTx.hash, expectedBuyer: buyer.address });
  check("a tx antiga AINDA valida como evento (por isso o evento não basta)", () => {
    assert.equal(replayEvt.tokenId, tokenId);
  });

  const ownerNow = await getItemNftOwner(tokenId);
  check("mas ownerOf já é o vendedor original → o replay é recusado", () => {
    assert.equal(ownerNow.toLowerCase(), seller.address.toLowerCase());
    assert.notEqual(ownerNow.toLowerCase(), buyer.address.toLowerCase());
  });

  // ---- 4. Rejeições esperadas --------------------------------------------
  console.log("\n4) Rejeições esperadas");
  await assert.rejects(
    () => verifyListingPurchasedTx({ txHash: buyTx.hash, expectedBuyer: seller.address }),
    /Nenhum evento ListingPurchased compatível/
  );
  check("tx de compra com carteira errada é recusada", () => {});

  await assert.rejects(() => getItemNftOwner(999_999n), /.*/);
  check("tokenId inexistente não devolve dono", () => {});

  console.log(`\n✅ Ensaio completo — ${passed} verificações passaram.`);
}

main().catch((err) => {
  console.error("\n❌ Ensaio FALHOU:\n", err);
  process.exitCode = 1;
});
