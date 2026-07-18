import { expect } from "chai";
import { ethers } from "hardhat";

// Both markets share the same escrow + fee logic; DolToken (burnable ERC-20)
// stands in for the payment token so tests don't need EIP-712 GOLD claims.
async function deployFixture(marketName: "DolrathItemMarket" | "DolrathCharacterMarket") {
  const [deployer, treasuryWallet, feeTreasury, seller, buyer] = await ethers.getSigners();

  const DolToken = await ethers.getContractFactory("DolToken");
  const token = await DolToken.deploy(treasuryWallet.address);
  await token.waitForDeployment();

  const MockERC721 = await ethers.getContractFactory("MockERC721");
  const nft = await MockERC721.deploy();
  await nft.waitForDeployment();

  const Market = await ethers.getContractFactory(marketName);
  const market = await Market.deploy(await token.getAddress(), await nft.getAddress(), feeTreasury.address);
  await market.waitForDeployment();

  // Fund the buyer and mint an NFT for the seller.
  await token.connect(treasuryWallet).transfer(buyer.address, ethers.parseUnits("10000", 18));
  await nft.mint(seller.address);

  return { deployer, feeTreasury, seller, buyer, token, nft, market };
}

for (const marketName of ["DolrathItemMarket", "DolrathCharacterMarket"] as const) {
  const expectedBps = marketName === "DolrathItemMarket" ? 200n : 250n;

  describe(marketName, () => {
    it(`defaults to ${expectedBps} bps burn + ${expectedBps} bps treasury`, async () => {
      const { market } = await deployFixture(marketName);
      expect(await market.burnFeeBps()).to.equal(expectedBps);
      expect(await market.treasuryFeeBps()).to.equal(expectedBps);
    });

    it("splits the price: seller proceeds + treasury fee + real burn", async () => {
      const { feeTreasury, seller, buyer, token, nft, market } = await deployFixture(marketName);

      const price = ethers.parseUnits("1000", 18);
      const burnAmt = (price * expectedBps) / 10_000n;
      const treasAmt = (price * expectedBps) / 10_000n;
      const sellerAmt = price - burnAmt - treasAmt;

      const [qSeller, qBurn, qTreas] = await market.quoteProceeds(price);
      expect(qSeller).to.equal(sellerAmt);
      expect(qBurn).to.equal(burnAmt);
      expect(qTreas).to.equal(treasAmt);

      await nft.connect(seller).approve(await market.getAddress(), 1n);
      await market.connect(seller).createListing(1n, price);

      const supplyBefore = await token.totalSupply();

      await token.connect(buyer).approve(await market.getAddress(), price);
      await expect(market.connect(buyer).buy(1n))
        .to.emit(market, "ListingPurchased")
        .and.to.emit(market, "MarketFeePaid").withArgs(1n, burnAmt, treasAmt);

      expect(await token.balanceOf(seller.address)).to.equal(sellerAmt);
      expect(await token.balanceOf(feeTreasury.address)).to.equal(treasAmt);
      expect(await token.totalSupply()).to.equal(supplyBefore - burnAmt); // burn destroys supply
      expect(await nft.ownerOf(1n)).to.equal(buyer.address);
    });

    it("caps total fee at 10% and restricts setters to the owner", async () => {
      const { market, seller } = await deployFixture(marketName);

      await expect(market.setFees(600, 500)).to.be.revertedWithCustomError(market, "FeeTooHigh");
      await expect(market.connect(seller).setFees(100, 100)).to.be.reverted;

      await market.setFees(0, 0);
      expect(await market.burnFeeBps()).to.equal(0n);
      expect(await market.treasuryFeeBps()).to.equal(0n);
    });

    it("with fee at zero the seller receives 100%", async () => {
      const { seller, buyer, token, nft, market } = await deployFixture(marketName);
      await market.setFees(0, 0);

      const price = ethers.parseUnits("500", 18);
      await nft.connect(seller).approve(await market.getAddress(), 1n);
      await market.connect(seller).createListing(1n, price);

      await token.connect(buyer).approve(await market.getAddress(), price);
      await market.connect(buyer).buy(1n);

      expect(await token.balanceOf(seller.address)).to.equal(price);
    });

    it("cancel returns the NFT to the seller", async () => {
      const { seller, nft, market } = await deployFixture(marketName);

      await nft.connect(seller).approve(await market.getAddress(), 1n);
      await market.connect(seller).createListing(1n, ethers.parseUnits("10", 18));
      await market.connect(seller).cancelListing(1n);

      expect(await nft.ownerOf(1n)).to.equal(seller.address);
    });

    it(`pays in ${marketName === "DolrathItemMarket" ? "GOLD" : "DOL"} (currency invariant)`, async () => {
      const { token, market } = await deployFixture(marketName);
      // Items trade only in GOLD; characters trade only in DOL. The payment
      // token is immutable, wired at deploy — assert the getter matches.
      const paymentToken =
        marketName === "DolrathItemMarket" ? await (market as any).gold() : await (market as any).dol();
      expect(paymentToken).to.equal(await token.getAddress());
    });

    it("pause blocks createListing and buy, cancel stays open, unpause restores", async () => {
      const { deployer, seller, buyer, token, nft, market } = await deployFixture(marketName);
      const price = ethers.parseUnits("10", 18);

      await nft.connect(seller).approve(await market.getAddress(), 1n);
      await market.connect(seller).createListing(1n, price);

      await expect(market.connect(seller).pause()).to.be.reverted; // owner-only
      await market.connect(deployer).pause();

      await token.connect(buyer).approve(await market.getAddress(), price);
      await expect(market.connect(buyer).buy(1n)).to.be.revertedWithCustomError(market, "EnforcedPause");

      await nft.mint(seller.address); // tokenId 2
      await nft.connect(seller).approve(await market.getAddress(), 2n);
      await expect(market.connect(seller).createListing(2n, price)).to.be.revertedWithCustomError(
        market,
        "EnforcedPause"
      );

      // Sellers can always exit even while paused.
      await market.connect(seller).cancelListing(1n);
      expect(await nft.ownerOf(1n)).to.equal(seller.address);

      await market.connect(deployer).unpause();
      await nft.connect(seller).approve(await market.getAddress(), 1n);
      await market.connect(seller).createListing(1n, price);
      await market.connect(buyer).buy(2n);
      expect(await nft.ownerOf(1n)).to.equal(buyer.address);
    });

    it("rescueERC721 recovers a directly-sent NFT but never an escrowed one", async () => {
      const { deployer, seller, buyer, nft, market } = await deployFixture(marketName);
      const marketAddr = await market.getAddress();

      // NFT sent directly without a listing gets stuck — owner can rescue it.
      await nft.connect(seller)["safeTransferFrom(address,address,uint256)"](seller.address, marketAddr, 1n);
      expect(await nft.ownerOf(1n)).to.equal(marketAddr);

      await expect(market.connect(buyer).rescueERC721(await nft.getAddress(), 1n, seller.address)).to.be.reverted;
      await expect(market.connect(deployer).rescueERC721(await nft.getAddress(), 1n, seller.address))
        .to.emit(market, "ERC721Rescued")
        .withArgs(await nft.getAddress(), 1n, seller.address);
      expect(await nft.ownerOf(1n)).to.equal(seller.address);

      // Escrowed by an active listing → rescue must revert.
      await nft.connect(seller).approve(marketAddr, 1n);
      await market.connect(seller).createListing(1n, ethers.parseUnits("10", 18));
      await expect(
        market.connect(deployer).rescueERC721(await nft.getAddress(), 1n, deployer.address)
      ).to.be.revertedWithCustomError(market, "TokenEscrowed");

      // After cancel the escrow flag clears; a stray re-send is rescuable again.
      await market.connect(seller).cancelListing(1n);
      await nft.connect(seller)["safeTransferFrom(address,address,uint256)"](seller.address, marketAddr, 1n);
      await market.connect(deployer).rescueERC721(await nft.getAddress(), 1n, seller.address);
      expect(await nft.ownerOf(1n)).to.equal(seller.address);
    });
  });
}
