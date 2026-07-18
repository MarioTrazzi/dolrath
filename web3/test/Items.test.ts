import { expect } from "chai";
import { ethers } from "hardhat";

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

const BASE_URI = "https://dolrath.example/api/nft/item/";

async function deployFixture() {
  const [owner, signer, player, other] = await ethers.getSigners();

  const Items = await ethers.getContractFactory("DolrathItems");
  const items = await Items.deploy(signer.address, BASE_URI);
  await items.waitForDeployment();

  const { chainId } = await ethers.provider.getNetwork();
  const domain = {
    name: "DolrathItems",
    version: "1",
    chainId,
    verifyingContract: await items.getAddress(),
  };

  const deadline = BigInt(Math.floor(Date.now() / 1000)) + 3600n;
  const purchaseId = ethers.keccak256(ethers.toUtf8Bytes("tx1:item1:buyer"));
  const itemKey = ethers.keccak256(ethers.toUtf8Bytes("iron-sword"));

  return { owner, signer, player, other, items, domain, deadline, purchaseId, itemKey };
}

describe("DolrathItems", () => {
  it("mintWithSig mints, stores paidGold/itemKey and emits ItemMinted", async () => {
    const { signer, player, items, domain, deadline, purchaseId, itemKey } = await deployFixture();
    const paidGold = ethers.parseUnits("250", 18);
    const req = { to: player.address, purchaseId, itemKey, paidGold, tokenURI: "", deadline };
    const sig = await signer.signTypedData(domain, MINT_ITEM_TYPES, req);

    await expect(
      items.connect(player).mintWithSig(player.address, purchaseId, itemKey, paidGold, "", deadline, sig)
    )
      .to.emit(items, "ItemMinted")
      .withArgs(player.address, 1n, purchaseId, itemKey, paidGold);

    expect(await items.ownerOf(1n)).to.equal(player.address);
    expect(await items.paidGoldByTokenId(1n)).to.equal(paidGold);
    expect(await items.itemKeyByTokenId(1n)).to.equal(itemKey);
    expect(await items.usedPurchaseId(purchaseId)).to.equal(true);
  });

  it("empty per-token URI falls back to baseURI + tokenId", async () => {
    const { signer, player, items, domain, deadline, purchaseId, itemKey } = await deployFixture();
    const req = { to: player.address, purchaseId, itemKey, paidGold: 1n, tokenURI: "", deadline };
    const sig = await signer.signTypedData(domain, MINT_ITEM_TYPES, req);
    await items.connect(player).mintWithSig(player.address, purchaseId, itemKey, 1n, "", deadline, sig);

    expect(await items.tokenURI(1n)).to.equal(`${BASE_URI}1`);
  });

  it("rejects purchaseId replay", async () => {
    const { signer, player, items, domain, deadline, purchaseId, itemKey } = await deployFixture();
    const req = { to: player.address, purchaseId, itemKey, paidGold: 1n, tokenURI: "", deadline };
    const sig = await signer.signTypedData(domain, MINT_ITEM_TYPES, req);

    await items.connect(player).mintWithSig(player.address, purchaseId, itemKey, 1n, "", deadline, sig);
    await expect(
      items.connect(player).mintWithSig(player.address, purchaseId, itemKey, 1n, "", deadline, sig)
    ).to.be.revertedWithCustomError(items, "AlreadyMinted");
  });

  it("rejects expired deadline", async () => {
    const { signer, player, items, domain, purchaseId, itemKey } = await deployFixture();
    const past = BigInt(Math.floor(Date.now() / 1000)) - 3600n;
    const req = { to: player.address, purchaseId, itemKey, paidGold: 1n, tokenURI: "", deadline: past };
    const sig = await signer.signTypedData(domain, MINT_ITEM_TYPES, req);

    await expect(
      items.connect(player).mintWithSig(player.address, purchaseId, itemKey, 1n, "", past, sig)
    ).to.be.revertedWithCustomError(items, "Expired");
  });

  it("rejects mint relayed by someone other than the recipient", async () => {
    const { signer, player, other, items, domain, deadline, purchaseId, itemKey } = await deployFixture();
    const req = { to: player.address, purchaseId, itemKey, paidGold: 1n, tokenURI: "", deadline };
    const sig = await signer.signTypedData(domain, MINT_ITEM_TYPES, req);

    await expect(
      items.connect(other).mintWithSig(player.address, purchaseId, itemKey, 1n, "", deadline, sig)
    ).to.be.revertedWithCustomError(items, "OnlyRecipient");
  });

  it("rejects a signature from a non-signer key and tampered paidGold", async () => {
    const { signer, player, other, items, domain, deadline, purchaseId, itemKey } = await deployFixture();
    const req = { to: player.address, purchaseId, itemKey, paidGold: 1n, tokenURI: "", deadline };

    const wrongKey = await other.signTypedData(domain, MINT_ITEM_TYPES, req);
    await expect(
      items.connect(player).mintWithSig(player.address, purchaseId, itemKey, 1n, "", deadline, wrongKey)
    ).to.be.revertedWithCustomError(items, "InvalidSignature");

    const goodSig = await signer.signTypedData(domain, MINT_ITEM_TYPES, req);
    await expect(
      items.connect(player).mintWithSig(player.address, purchaseId, itemKey, 999n, "", deadline, goodSig)
    ).to.be.revertedWithCustomError(items, "InvalidSignature");
  });

  it("setSigner rotates the key and is owner-only; setBaseURI is owner-only", async () => {
    const { owner, signer, player, other, items, domain, deadline, purchaseId, itemKey } = await deployFixture();

    await expect(items.connect(player).setSigner(other.address)).to.be.reverted;
    await expect(items.connect(player).setBaseURI("https://evil/")).to.be.reverted;

    await expect(items.connect(owner).setSigner(other.address))
      .to.emit(items, "SignerUpdated")
      .withArgs(signer.address, other.address);

    const req = { to: player.address, purchaseId, itemKey, paidGold: 1n, tokenURI: "", deadline };
    const oldSig = await signer.signTypedData(domain, MINT_ITEM_TYPES, req);
    await expect(
      items.connect(player).mintWithSig(player.address, purchaseId, itemKey, 1n, "", deadline, oldSig)
    ).to.be.revertedWithCustomError(items, "InvalidSignature");

    const newSig = await other.signTypedData(domain, MINT_ITEM_TYPES, req);
    await items.connect(player).mintWithSig(player.address, purchaseId, itemKey, 1n, "", deadline, newSig);
    expect(await items.ownerOf(1n)).to.equal(player.address);
  });
});
