import { expect } from "chai";
import { ethers } from "hardhat";

/**
 * O dublê de USDC não é produto — é o instrumento do ensaio. O que estes testes
 * garantem é que ele mente o mínimo possível sobre a USDC real: 6 decimais e um
 * evento Transfer idêntico, que é tudo que `verifyDolTransferTx` consome.
 */
async function deployFixture() {
  const [owner, player, other] = await ethers.getSigners();

  const Factory = await ethers.getContractFactory("TestUSDC");
  const usdc = await Factory.deploy();
  await usdc.waitForDeployment();

  return { owner, player, other, usdc };
}

describe("TestUSDC (dublê do ensaio na Amoy)", () => {
  it("reporta 6 decimais, não 18", async () => {
    const { usdc } = await deployFixture();
    expect(await usdc.decimals()).to.equal(6);
  });

  it("2 USDC são 2_000_000 unidades base — o valor que a criação de personagem verifica", async () => {
    const { usdc, owner, player } = await deployFixture();

    // Exatamente o que o cliente faz em payDol.ts: parseUnits com os decimals
    // lidos do contrato.
    const decimals = await usdc.decimals();
    const amount = ethers.parseUnits("2", decimals);
    expect(amount).to.equal(2_000_000n);

    await usdc.connect(owner).mint(player.address, amount);
    expect(await usdc.balanceOf(player.address)).to.equal(2_000_000n);

    // E o servidor reformata para "2.0" — se der 2000000.0 ou 0.000002, o
    // caminho decimal-agnóstico quebrou.
    expect(ethers.formatUnits(await usdc.balanceOf(player.address), decimals)).to.equal("2.0");
  });

  it("emite Transfer com o valor em unidades base (o que verifyDolTransferTx parseia)", async () => {
    const { usdc, owner, player, other } = await deployFixture();
    const amount = ethers.parseUnits("2", 6);

    await usdc.connect(owner).mint(player.address, ethers.parseUnits("10", 6));

    await expect(usdc.connect(player).transfer(other.address, amount))
      .to.emit(usdc, "Transfer")
      .withArgs(player.address, other.address, 2_000_000n);
  });

  it("faucet entrega 50 tUSDC e respeita o cooldown", async () => {
    const { usdc, player } = await deployFixture();

    await usdc.connect(player).faucet();
    expect(await usdc.balanceOf(player.address)).to.equal(50_000_000n);

    await expect(usdc.connect(player).faucet()).to.be.revertedWithCustomError(
      usdc,
      "FaucetCooldown"
    );

    // Passado o cooldown, serve de novo.
    await ethers.provider.send("evm_increaseTime", [12 * 60 * 60]);
    await ethers.provider.send("evm_mine", []);
    await usdc.connect(player).faucet();
    expect(await usdc.balanceOf(player.address)).to.equal(100_000_000n);
  });

  it("mint manual é só do owner", async () => {
    const { usdc, player } = await deployFixture();
    await expect(
      usdc.connect(player).mint(player.address, 1_000_000n)
    ).to.be.revertedWithCustomError(usdc, "OwnableUnauthorizedAccount");
  });
});
