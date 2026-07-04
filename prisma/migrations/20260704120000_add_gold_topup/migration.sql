-- Recarga de GOLD on-chain → saldo off-chain. txHash único previne replay (crédito duplo).
-- CreateTable
CREATE TABLE "GoldTopup" (
    "id" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "characterId" TEXT,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoldTopup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GoldTopup_txHash_key" ON "GoldTopup"("txHash");

-- CreateIndex
CREATE INDEX "GoldTopup_userId_idx" ON "GoldTopup"("userId");

-- CreateIndex
CREATE INDEX "GoldTopup_characterId_idx" ON "GoldTopup"("characterId");
