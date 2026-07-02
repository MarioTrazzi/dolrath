import { expect } from "chai";
import { ethers } from "hardhat";

describe("DolToken (v2 — fixed supply)", () => {
  const MAX_SUPPLY = ethers.parseUnits("1000000000", 18);

  it("mints the full 1B supply to the treasury at deploy", async () => {
    const [, treasury] = await ethers.getSigners();

    const DolToken = await ethers.getContractFactory("DolToken");
    const dol = await DolToken.deploy(treasury.address);
    await dol.waitForDeployment();

    expect(await dol.name()).to.equal("Dolrath");
    expect(await dol.symbol()).to.equal("DOL");
    expect(await dol.totalSupply()).to.equal(MAX_SUPPLY);
    expect(await dol.balanceOf(treasury.address)).to.equal(MAX_SUPPLY);
    expect(await dol.MAX_SUPPLY()).to.equal(MAX_SUPPLY);
  });

  it("has no mint function (supply can only shrink)", async () => {
    const [, treasury] = await ethers.getSigners();

    const DolToken = await ethers.getContractFactory("DolToken");
    const dol = await DolToken.deploy(treasury.address);
    await dol.waitForDeployment();

    expect((dol as any).mint).to.equal(undefined);
  });

  it("rejects zero treasury", async () => {
    const DolToken = await ethers.getContractFactory("DolToken");
    await expect(DolToken.deploy(ethers.ZeroAddress)).to.be.revertedWith("treasury=0");
  });

  it("supports burning (reduces total supply)", async () => {
    const [, treasury, player] = await ethers.getSigners();

    const DolToken = await ethers.getContractFactory("DolToken");
    const dol = await DolToken.deploy(treasury.address);
    await dol.waitForDeployment();

    const amount = ethers.parseUnits("5", 18);
    await dol.connect(treasury).transfer(player.address, amount);

    await expect(dol.connect(player).burn(ethers.parseUnits("2", 18)))
      .to.emit(dol, "Transfer");

    expect(await dol.balanceOf(player.address)).to.equal(ethers.parseUnits("3", 18));
    expect(await dol.totalSupply()).to.equal(MAX_SUPPLY - ethers.parseUnits("2", 18));
  });
});
