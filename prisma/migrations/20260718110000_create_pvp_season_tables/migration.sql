-- CONSERTA UM DRIFT: PvpSeason, PvpRating, PvpMatch e PvpSeasonPayout foram
-- criadas por `prisma db push`, sem nunca entrar no histórico de migrations.
-- Consequência: num banco LIMPO, a migration 20260718120000_add_pvp_match
-- (logo abaixo desta na ordem) fazia `ALTER TABLE "PvpMatch"` numa tabela que
-- não existia e o deploy morria com 42P01 — nenhuma migration posterior rodava.
--
-- Por isso o timestamp desta é ANTERIOR ao da add_pvp_match: em banco limpo ela
-- cria as tabelas primeiro; em produção (onde as tabelas já existem) é no-op
-- puro, porque tudo aqui é IF NOT EXISTS.
--
-- O bloco também aparece em 20260804120000_season_prize_pool: aquela migration
-- já foi aplicada em produção e alterar o arquivo quebraria o checksum. A
-- repetição é inofensiva (IF NOT EXISTS) e proposital.

CREATE TABLE IF NOT EXISTS "PvpSeason" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "potDol" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PvpSeason_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PvpSeason_status_endsAt_idx" ON "PvpSeason"("status", "endsAt");

CREATE TABLE IF NOT EXISTS "PvpRating" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PvpRating_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PvpRating_characterId_seasonId_key" ON "PvpRating"("characterId", "seasonId");
CREATE INDEX IF NOT EXISTS "PvpRating_seasonId_points_idx" ON "PvpRating"("seasonId", "points");

-- Estado HISTÓRICO do PvpMatch: sem matchKey/winnerUserId/loserUserId e sem os
-- índices deles — quem adiciona é a 20260718120000_add_pvp_match, logo a seguir.
-- Criar já com essas colunas fazia o ALTER dela morrer com 42701 (duplicada).
CREATE TABLE IF NOT EXISTS "PvpMatch" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "winnerId" TEXT NOT NULL,
    "loserId" TEXT NOT NULL,
    "winnerStaminaSpent" INTEGER NOT NULL DEFAULT 0,
    "loserStaminaSpent" INTEGER NOT NULL DEFAULT 0,
    "winnerGold" INTEGER NOT NULL DEFAULT 0,
    "loserGold" INTEGER NOT NULL DEFAULT 0,
    "winnerXp" INTEGER NOT NULL DEFAULT 0,
    "loserXp" INTEGER NOT NULL DEFAULT 0,
    "winnerPoints" INTEGER NOT NULL DEFAULT 0,
    "loserPoints" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PvpMatch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PvpMatch_seasonId_createdAt_idx" ON "PvpMatch"("seasonId", "createdAt");
CREATE INDEX IF NOT EXISTS "PvpMatch_winnerId_idx" ON "PvpMatch"("winnerId");
CREATE INDEX IF NOT EXISTS "PvpMatch_loserId_idx" ON "PvpMatch"("loserId");

CREATE TABLE IF NOT EXISTS "PvpSeasonPayout" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,
    "dolAmount" DOUBLE PRECISION NOT NULL,
    "walletAddress" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "txHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    CONSTRAINT "PvpSeasonPayout_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PvpSeasonPayout_seasonId_characterId_key" ON "PvpSeasonPayout"("seasonId", "characterId");
CREATE INDEX IF NOT EXISTS "PvpSeasonPayout_seasonId_rank_idx" ON "PvpSeasonPayout"("seasonId", "rank");

-- Chaves estrangeiras (idempotentes: Postgres não tem ADD CONSTRAINT IF NOT EXISTS)
DO $$ BEGIN
    ALTER TABLE "PvpRating" ADD CONSTRAINT "PvpRating_characterId_fkey"
        FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "PvpRating" ADD CONSTRAINT "PvpRating_seasonId_fkey"
        FOREIGN KEY ("seasonId") REFERENCES "PvpSeason"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "PvpMatch" ADD CONSTRAINT "PvpMatch_seasonId_fkey"
        FOREIGN KEY ("seasonId") REFERENCES "PvpSeason"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "PvpSeasonPayout" ADD CONSTRAINT "PvpSeasonPayout_seasonId_fkey"
        FOREIGN KEY ("seasonId") REFERENCES "PvpSeason"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
