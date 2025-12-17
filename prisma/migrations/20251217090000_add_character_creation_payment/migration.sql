-- AlterTable
ALTER TABLE "Character" ADD COLUMN     "creationTxHash" TEXT,
ADD COLUMN     "creationPaidAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Character_creationTxHash_key" ON "Character"("creationTxHash");
