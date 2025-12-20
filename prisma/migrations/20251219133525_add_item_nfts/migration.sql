-- CreateTable
CREATE TABLE "ItemNft" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "contract" TEXT NOT NULL,
    "tokenId" BIGINT NOT NULL,
    "paidGoldWei" TEXT NOT NULL,
    "purchaseTxHash" TEXT,
    "mintTxHash" TEXT,
    "mintedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemNft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ItemNft_purchaseTxHash_key" ON "ItemNft"("purchaseTxHash");

-- CreateIndex
CREATE UNIQUE INDEX "ItemNft_mintTxHash_key" ON "ItemNft"("mintTxHash");

-- CreateIndex
CREATE INDEX "ItemNft_userId_idx" ON "ItemNft"("userId");

-- CreateIndex
CREATE INDEX "ItemNft_itemId_idx" ON "ItemNft"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemNft_chainId_contract_tokenId_key" ON "ItemNft"("chainId", "contract", "tokenId");

-- AddForeignKey
ALTER TABLE "ItemNft" ADD CONSTRAINT "ItemNft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemNft" ADD CONSTRAINT "ItemNft_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
