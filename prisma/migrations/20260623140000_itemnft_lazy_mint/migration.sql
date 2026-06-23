-- Lazy-mint: itens GANHOS (CharacterInventory, sem NFT) viram NFT ao listar no
-- marketplace. Guardamos o aprimoramento congelado no mint e a origem do mint.
ALTER TABLE "ItemNft" ADD COLUMN "enhancementLevel" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ItemNft" ADD COLUMN "mintSource" TEXT NOT NULL DEFAULT 'store';

-- Trava temporária da peça durante o lazy-mint (evita venda/consumo no meio).
ALTER TABLE "CharacterInventory" ADD COLUMN "listingLockedAt" TIMESTAMP(3);
