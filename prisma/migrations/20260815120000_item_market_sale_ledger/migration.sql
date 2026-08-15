-- Mercado de itens (GOLD): livro-razão das vendas.
-- Dedup por txHash (impede reprocessar a mesma compra) + auditoria.

CREATE TABLE IF NOT EXISTS "ItemSale" (
    "id" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "itemNftId" TEXT NOT NULL,
    "sellerUserId" TEXT NOT NULL,
    "buyerUserId" TEXT NOT NULL,
    "priceGold" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemSale_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ItemSale_txHash_key" ON "ItemSale"("txHash");
CREATE INDEX IF NOT EXISTS "ItemSale_itemNftId_idx" ON "ItemSale"("itemNftId");
CREATE INDEX IF NOT EXISTS "ItemSale_sellerUserId_idx" ON "ItemSale"("sellerUserId");
CREATE INDEX IF NOT EXISTS "ItemSale_buyerUserId_idx" ON "ItemSale"("buyerUserId");
