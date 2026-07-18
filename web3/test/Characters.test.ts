import { expect } from "chai";
import { ethers } from "hardhat";

const MINT_TYPES = {
  MintRequest: [
    { name: "to", type: "address" },
    { name: "tokenURI", type: "string" },
    { name: "deadline", type: "uint256" },
  ],
};

async function deployFixture() {
  const [owner, signer, player, other] = await ethers.getSigners();

  const Characters = await ethers.getContractFactory("DolrathCharacters");
  const characters = await Characters.deploy(signer.address);
  await characters.waitForDeployment();

  const { chainId } = await ethers.provider.getNetwork();
  const domain = {
    name: "DolrathCharacters",
    version: "1",
    chainId,
    verifyingContract: await characters.getAddress(),
  };

  const deadline = BigInt(Math.floor(Date.now() / 1000)) + 3600n;

  return { owner, signer, player, other, characters, domain, deadline };
}

describe("DolrathCharacters", () => {
  it("mintWithSig mints with a valid server signature and stores the tokenURI", async () => {
    const { signer, player, characters, domain, deadline } = await deployFixture();
    const uri = "https://dolrath.example/api/nft/character/abc-123";
    const sig = await signer.signTypedData(domain, MINT_TYPES, { to: player.address, tokenURI: uri, deadline });

    await characters.connect(player).mintWithSig(player.address, uri, deadline, sig);

    expect(await characters.ownerOf(1n)).to.equal(player.address);
    expect(await characters.tokenURI(1n)).to.equal(uri);
    expect(await characters.nextTokenId()).to.equal(2n);
  });

  it("rejects reusing the same tokenURI (replay)", async () => {
    const { signer, player, characters, domain, deadline } = await deployFixture();
    const uri = "https://dolrath.example/api/nft/character/dupe";
    const sig = await signer.signTypedData(domain, MINT_TYPES, { to: player.address, tokenURI: uri, deadline });

    await characters.connect(player).mintWithSig(player.address, uri, deadline, sig);
    await expect(
      characters.connect(player).mintWithSig(player.address, uri, deadline, sig)
    ).to.be.revertedWithCustomError(characters, "AlreadyMinted");
  });

  it("rejects expired deadline", async () => {
    const { signer, player, characters, domain } = await deployFixture();
    const past = BigInt(Math.floor(Date.now() / 1000)) - 3600n;
    const uri = "https://dolrath.example/x";
    const sig = await signer.signTypedData(domain, MINT_TYPES, { to: player.address, tokenURI: uri, deadline: past });

    await expect(
      characters.connect(player).mintWithSig(player.address, uri, past, sig)
    ).to.be.revertedWithCustomError(characters, "Expired");
  });

  it("rejects mint relayed by someone other than the recipient", async () => {
    const { signer, player, other, characters, domain, deadline } = await deployFixture();
    const uri = "https://dolrath.example/y";
    const sig = await signer.signTypedData(domain, MINT_TYPES, { to: player.address, tokenURI: uri, deadline });

    await expect(
      characters.connect(other).mintWithSig(player.address, uri, deadline, sig)
    ).to.be.revertedWithCustomError(characters, "OnlyRecipient");
  });

  it("rejects a signature from a non-signer key", async () => {
    const { player, other, characters, domain, deadline } = await deployFixture();
    const uri = "https://dolrath.example/z";
    const sig = await other.signTypedData(domain, MINT_TYPES, { to: player.address, tokenURI: uri, deadline });

    await expect(
      characters.connect(player).mintWithSig(player.address, uri, deadline, sig)
    ).to.be.revertedWithCustomError(characters, "InvalidSignature");
  });

  it("setSigner rotates the key: old signatures die, new ones work; only owner may rotate", async () => {
    const { owner, signer, player, other, characters, domain, deadline } = await deployFixture();

    await expect(characters.connect(player).setSigner(other.address)).to.be.reverted;
    await expect(characters.connect(owner).setSigner(other.address))
      .to.emit(characters, "SignerUpdated")
      .withArgs(signer.address, other.address);

    const uri = "https://dolrath.example/rotated";
    const oldSig = await signer.signTypedData(domain, MINT_TYPES, { to: player.address, tokenURI: uri, deadline });
    await expect(
      characters.connect(player).mintWithSig(player.address, uri, deadline, oldSig)
    ).to.be.revertedWithCustomError(characters, "InvalidSignature");

    const newSig = await other.signTypedData(domain, MINT_TYPES, { to: player.address, tokenURI: uri, deadline });
    await characters.connect(player).mintWithSig(player.address, uri, deadline, newSig);
    expect(await characters.ownerOf(1n)).to.equal(player.address);
  });
});
