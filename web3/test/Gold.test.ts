import { expect } from "chai";
import { ethers } from "hardhat";

const CLAIM_TYPES = {
  ClaimRequest: [
    { name: "to", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
};

async function deployFixture() {
  const [owner, signer, player, other] = await ethers.getSigners();

  const Gold = await ethers.getContractFactory("DolrathGold");
  const gold = await Gold.deploy(signer.address);
  await gold.waitForDeployment();

  const { chainId } = await ethers.provider.getNetwork();
  const domain = {
    name: "DolrathGold",
    version: "1",
    chainId,
    verifyingContract: await gold.getAddress(),
  };

  const deadline = BigInt(Math.floor(Date.now() / 1000)) + 3600n;

  return { owner, signer, player, other, gold, domain, deadline };
}

describe("DolrathGold", () => {
  it("claimWithSig mints with a valid server signature and emits Claimed", async () => {
    const { signer, player, gold, domain, deadline } = await deployFixture();
    const amount = ethers.parseUnits("100", 18);
    const req = { to: player.address, amount, nonce: 1n, deadline };
    const sig = await signer.signTypedData(domain, CLAIM_TYPES, req);

    await expect(gold.connect(player).claimWithSig(player.address, amount, 1n, deadline, sig))
      .to.emit(gold, "Claimed")
      .withArgs(player.address, amount, 1n);

    expect(await gold.balanceOf(player.address)).to.equal(amount);
    expect(await gold.usedNonce(player.address, 1n)).to.equal(true);
  });

  it("rejects nonce replay", async () => {
    const { signer, player, gold, domain, deadline } = await deployFixture();
    const amount = ethers.parseUnits("10", 18);
    const req = { to: player.address, amount, nonce: 7n, deadline };
    const sig = await signer.signTypedData(domain, CLAIM_TYPES, req);

    await gold.connect(player).claimWithSig(player.address, amount, 7n, deadline, sig);
    await expect(
      gold.connect(player).claimWithSig(player.address, amount, 7n, deadline, sig)
    ).to.be.revertedWithCustomError(gold, "NonceUsed");
  });

  it("rejects expired deadline", async () => {
    const { signer, player, gold, domain } = await deployFixture();
    const past = BigInt(Math.floor(Date.now() / 1000)) - 3600n;
    const req = { to: player.address, amount: 1n, nonce: 1n, deadline: past };
    const sig = await signer.signTypedData(domain, CLAIM_TYPES, req);

    await expect(
      gold.connect(player).claimWithSig(player.address, 1n, 1n, past, sig)
    ).to.be.revertedWithCustomError(gold, "Expired");
  });

  it("rejects a signature from a non-signer key", async () => {
    const { player, other, gold, domain, deadline } = await deployFixture();
    const req = { to: player.address, amount: 1n, nonce: 1n, deadline };
    const sig = await other.signTypedData(domain, CLAIM_TYPES, req);

    await expect(
      gold.connect(player).claimWithSig(player.address, 1n, 1n, deadline, sig)
    ).to.be.revertedWithCustomError(gold, "InvalidSignature");
  });

  it("rejects a claim relayed by someone other than the recipient", async () => {
    const { signer, player, other, gold, domain, deadline } = await deployFixture();
    const req = { to: player.address, amount: 1n, nonce: 1n, deadline };
    const sig = await signer.signTypedData(domain, CLAIM_TYPES, req);

    await expect(
      gold.connect(other).claimWithSig(player.address, 1n, 1n, deadline, sig)
    ).to.be.revertedWithCustomError(gold, "OnlyRecipient");
  });

  it("tampering with the amount invalidates the signature", async () => {
    const { signer, player, gold, domain, deadline } = await deployFixture();
    const req = { to: player.address, amount: ethers.parseUnits("1", 18), nonce: 1n, deadline };
    const sig = await signer.signTypedData(domain, CLAIM_TYPES, req);

    await expect(
      gold.connect(player).claimWithSig(player.address, ethers.parseUnits("1000000", 18), 1n, deadline, sig)
    ).to.be.revertedWithCustomError(gold, "InvalidSignature");
  });

  it("setSigner rotates the key: old signatures die, new ones work; only owner may rotate", async () => {
    const { owner, signer, player, other, gold, domain, deadline } = await deployFixture();

    await expect(gold.connect(player).setSigner(other.address)).to.be.reverted;
    await expect(gold.connect(owner).setSigner(other.address))
      .to.emit(gold, "SignerUpdated")
      .withArgs(signer.address, other.address);

    const req = { to: player.address, amount: 1n, nonce: 1n, deadline };
    const oldSig = await signer.signTypedData(domain, CLAIM_TYPES, req);
    await expect(
      gold.connect(player).claimWithSig(player.address, 1n, 1n, deadline, oldSig)
    ).to.be.revertedWithCustomError(gold, "InvalidSignature");

    const newSig = await other.signTypedData(domain, CLAIM_TYPES, req);
    await gold.connect(player).claimWithSig(player.address, 1n, 1n, deadline, newSig);
    expect(await gold.balanceOf(player.address)).to.equal(1n);
  });
});
