import { expect } from "chai";
import { ethers } from "hardhat";

describe("DolToken", () => {
  it("deploys with admin and minter roles", async () => {
    const [admin, minter] = await ethers.getSigners();

    const DolToken = await ethers.getContractFactory("DolToken");
    const dol = await DolToken.deploy(admin.address, minter.address);
    await dol.waitForDeployment();

    const DEFAULT_ADMIN_ROLE = await dol.DEFAULT_ADMIN_ROLE();
    const MINTER_ROLE = await dol.MINTER_ROLE();

    expect(await dol.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.equal(true);
    expect(await dol.hasRole(MINTER_ROLE, minter.address)).to.equal(true);
  });

  it("allows minter to mint", async () => {
    const [admin, minter, player] = await ethers.getSigners();

    const DolToken = await ethers.getContractFactory("DolToken");
    const dol = await DolToken.deploy(admin.address, minter.address);
    await dol.waitForDeployment();

    const amount = ethers.parseUnits("10", 18);
    await expect(dol.connect(minter).mint(player.address, amount))
      .to.emit(dol, "Transfer")
      .withArgs(ethers.ZeroAddress, player.address, amount);

    expect(await dol.balanceOf(player.address)).to.equal(amount);
  });

  it("blocks non-minter mint", async () => {
    const [admin, minter, attacker, player] = await ethers.getSigners();

    const DolToken = await ethers.getContractFactory("DolToken");
    const dol = await DolToken.deploy(admin.address, minter.address);
    await dol.waitForDeployment();

    const amount = ethers.parseUnits("1", 18);
    await expect(dol.connect(attacker).mint(player.address, amount)).to.be.reverted;
  });

  it("supports burning", async () => {
    const [admin, minter, player] = await ethers.getSigners();

    const DolToken = await ethers.getContractFactory("DolToken");
    const dol = await DolToken.deploy(admin.address, minter.address);
    await dol.waitForDeployment();

    const amount = ethers.parseUnits("5", 18);
    await dol.connect(minter).mint(player.address, amount);

    await expect(dol.connect(player).burn(ethers.parseUnits("2", 18)))
      .to.emit(dol, "Transfer");

    expect(await dol.balanceOf(player.address)).to.equal(ethers.parseUnits("3", 18));
  });
});
