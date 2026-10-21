-- 🧾 Livro único de pagamentos on-chain consumidos (ver ConsumedPayment no schema).
CREATE TABLE IF NOT EXISTS "ConsumedPayment" (
    "txHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConsumedPayment_pkey" PRIMARY KEY ("txHash")
);
CREATE INDEX IF NOT EXISTS "ConsumedPayment_userId_idx" ON "ConsumedPayment"("userId");

-- Backfill: todo hash que alguma rota JÁ consumiu passa a valer para todas.
-- (As expansões de inventário nunca gravaram o hash — não há o que importar.)
INSERT INTO "ConsumedPayment" ("txHash", "purpose", "userId", "createdAt")
SELECT lower("creationTxHash"), 'character_create', "userId", "createdAt"
FROM "Character" WHERE "creationTxHash" IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO "ConsumedPayment" ("txHash", "purpose", "userId", "createdAt")
SELECT lower("txHash"), 'gold_topup', "userId", "createdAt" FROM "GoldTopup"
ON CONFLICT DO NOTHING;

INSERT INTO "ConsumedPayment" ("txHash", "purpose", "userId", "createdAt")
SELECT lower("txHash"), 'ai_gen', "userId", "createdAt" FROM "AiGenPayment"
ON CONFLICT DO NOTHING;

INSERT INTO "ConsumedPayment" ("txHash", "purpose", "userId", "createdAt")
SELECT lower("txHash"), 'season_enroll', "userId", "createdAt" FROM "DolPrizeContribution"
ON CONFLICT DO NOTHING;

INSERT INTO "ConsumedPayment" ("txHash", "purpose", "userId", "createdAt")
SELECT lower("txHash"), 'season_enroll', "userId", "createdAt" FROM "PvpSeasonEntry"
WHERE "txHash" IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO "ConsumedPayment" ("txHash", "purpose", "userId", "createdAt")
SELECT lower("purchaseTxHash"), 'store:' || "itemId", "userId", "mintedAt" FROM "ItemNft"
WHERE "purchaseTxHash" IS NOT NULL
ON CONFLICT DO NOTHING;
