-- Add NFT-related fields to Character
ALTER TABLE "Character"
  ADD COLUMN IF NOT EXISTS "nftChainId" INTEGER,
  ADD COLUMN IF NOT EXISTS "nftContract" TEXT,
  ADD COLUMN IF NOT EXISTS "nftTokenId" BIGINT,
  ADD COLUMN IF NOT EXISTS "nftTokenUri" TEXT,
  ADD COLUMN IF NOT EXISTS "nftMintTxHash" TEXT,
  ADD COLUMN IF NOT EXISTS "nftMintedAt" TIMESTAMP(3);

-- Unique mint tx hash (prevents reuse)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'Character_nftMintTxHash_key'
  ) THEN
    CREATE UNIQUE INDEX "Character_nftMintTxHash_key" ON "Character"("nftMintTxHash");
  END IF;
END $$;
