-- PvpMatch vira ledger transacional do PvP: matchKey (lock de idempotência do
-- crédito de recompensas) + donos das contas (soma do teto diário de ouro).

-- AlterTable
ALTER TABLE "PvpMatch" ADD COLUMN "matchKey" TEXT;
ALTER TABLE "PvpMatch" ADD COLUMN "winnerUserId" TEXT;
ALTER TABLE "PvpMatch" ADD COLUMN "loserUserId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "PvpMatch_matchKey_key" ON "PvpMatch"("matchKey");

-- CreateIndex
CREATE INDEX "PvpMatch_winnerId_createdAt_idx" ON "PvpMatch"("winnerId", "createdAt");

-- CreateIndex
CREATE INDEX "PvpMatch_winnerUserId_createdAt_idx" ON "PvpMatch"("winnerUserId", "createdAt");

-- CreateIndex
CREATE INDEX "PvpMatch_loserUserId_createdAt_idx" ON "PvpMatch"("loserUserId", "createdAt");

-- DropIndex (winnerId simples substituído pelo composto acima)
DROP INDEX IF EXISTS "PvpMatch_winnerId_idx";
