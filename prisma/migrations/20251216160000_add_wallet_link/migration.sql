-- AlterTable
ALTER TABLE "User" ADD COLUMN     "walletAddress" TEXT,
ADD COLUMN     "walletLinkedAt" TIMESTAMP(3),
ADD COLUMN     "walletLinkNonce" TEXT,
ADD COLUMN     "walletLinkNonceExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "User_walletAddress_key" ON "User"("walletAddress");
