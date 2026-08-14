-- Mercado de personagens (DOL): espelho off-chain do escrow + livro-razão das vendas.

-- Listagem ativa do personagem (NFT em escrow no contrato do mercado).
ALTER TABLE "Character" ADD COLUMN IF NOT EXISTS "marketListingId" BIGINT;
ALTER TABLE "Character" ADD COLUMN IF NOT EXISTS "marketListedAt" TIMESTAMP(3);

-- Livro-razão das vendas: dedup por txHash (impede reprocessar a mesma compra)
-- + auditoria de preço/partes/gold devolvido.
CREATE TABLE IF NOT EXISTS "CharacterSale" (
    "id" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "sellerUserId" TEXT NOT NULL,
    "buyerUserId" TEXT NOT NULL,
    "priceDol" TEXT NOT NULL,
    "goldReturned" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CharacterSale_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CharacterSale_txHash_key" ON "CharacterSale"("txHash");
CREATE INDEX IF NOT EXISTS "CharacterSale_characterId_idx" ON "CharacterSale"("characterId");
CREATE INDEX IF NOT EXISTS "CharacterSale_sellerUserId_idx" ON "CharacterSale"("sellerUserId");
CREATE INDEX IF NOT EXISTS "CharacterSale_buyerUserId_idx" ON "CharacterSale"("buyerUserId");
