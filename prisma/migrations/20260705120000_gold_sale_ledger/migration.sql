-- Ledger de gold ganho vendendo itens (entra no teto diário de emissão)
CREATE TABLE "GoldSale" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoldSale_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GoldSale_userId_createdAt_idx" ON "GoldSale"("userId", "createdAt");
