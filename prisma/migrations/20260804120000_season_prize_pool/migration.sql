-- Pool de temporada lastreada: 1 DOL da criação + 1 DOL de inscrição por
-- temporada viram prêmio para o top 20. Ver docs/19-seasons.
--
-- IMPORTANTE — esta migration também FECHA UM DRIFT: PvpSeason, PvpRating,
-- PvpMatch e PvpSeasonPayout nunca entraram no histórico de migrations (foram
-- criadas por `prisma db push`), então um `migrate deploy` em banco limpo não
-- as criava. Tudo aqui é IF NOT EXISTS: em produção (tabelas já existentes) é
-- no-op; em banco novo, cria do zero.

-- ============================================================
-- Tabelas de temporada que faltavam no histórico
-- ============================================================

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

CREATE TABLE IF NOT EXISTS "PvpMatch" (
    "id" TEXT NOT NULL,
    "matchKey" TEXT,
    "seasonId" TEXT NOT NULL,
    "winnerId" TEXT NOT NULL,
    "loserId" TEXT NOT NULL,
    "winnerUserId" TEXT,
    "loserUserId" TEXT,
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

CREATE UNIQUE INDEX IF NOT EXISTS "PvpMatch_matchKey_key" ON "PvpMatch"("matchKey");
CREATE INDEX IF NOT EXISTS "PvpMatch_seasonId_createdAt_idx" ON "PvpMatch"("seasonId", "createdAt");
CREATE INDEX IF NOT EXISTS "PvpMatch_winnerId_createdAt_idx" ON "PvpMatch"("winnerId", "createdAt");
CREATE INDEX IF NOT EXISTS "PvpMatch_loserId_idx" ON "PvpMatch"("loserId");
CREATE INDEX IF NOT EXISTS "PvpMatch_winnerUserId_createdAt_idx" ON "PvpMatch"("winnerUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "PvpMatch_loserUserId_createdAt_idx" ON "PvpMatch"("loserUserId", "createdAt");

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

-- ============================================================
-- Pool: o prêmio deixa de ser um número de env
-- ============================================================

ALTER TABLE "PvpSeason" ADD COLUMN IF NOT EXISTS "fundedDol" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "PvpSeason" ALTER COLUMN "potDol" SET DEFAULT 0;

-- Inscrição do herói na temporada (1 DOL). Sem linha aqui a luta paga ouro/XP
-- mas não pontua.
CREATE TABLE IF NOT EXISTS "PvpSeasonEntry" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "txHash" TEXT,
    "paidDol" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PvpSeasonEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PvpSeasonEntry_txHash_key" ON "PvpSeasonEntry"("txHash");
CREATE UNIQUE INDEX IF NOT EXISTS "PvpSeasonEntry_seasonId_characterId_key" ON "PvpSeasonEntry"("seasonId", "characterId");
CREATE INDEX IF NOT EXISTS "PvpSeasonEntry_seasonId_userId_idx" ON "PvpSeasonEntry"("seasonId", "userId");
CREATE INDEX IF NOT EXISTS "PvpSeasonEntry_characterId_idx" ON "PvpSeasonEntry"("characterId");

-- Ledger auditável: congela o split no momento do pagamento.
CREATE TABLE IF NOT EXISTS "DolPrizeContribution" (
    "id" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "characterId" TEXT,
    "kind" TEXT NOT NULL,
    "paidUsdc" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidDol" DOUBLE PRECISION NOT NULL,
    "prizeDol" DOUBLE PRECISION NOT NULL,
    "opsDol" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DolPrizeContribution_pkey" PRIMARY KEY ("id")
);

-- Bancos que já rodaram uma versão anterior desta migration (dev) não passam
-- pelo CREATE TABLE acima: a coluna do dólar entra aqui.
ALTER TABLE "DolPrizeContribution" ADD COLUMN IF NOT EXISTS "paidUsdc" DOUBLE PRECISION NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS "DolPrizeContribution_txHash_key" ON "DolPrizeContribution"("txHash");
CREATE INDEX IF NOT EXISTS "DolPrizeContribution_seasonId_createdAt_idx" ON "DolPrizeContribution"("seasonId", "createdAt");
CREATE INDEX IF NOT EXISTS "DolPrizeContribution_userId_idx" ON "DolPrizeContribution"("userId");

-- Cofre de torneios: atravessa temporadas.
CREATE TABLE IF NOT EXISTS "PrizeVault" (
    "kind" TEXT NOT NULL,
    "balanceDol" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PrizeVault_pkey" PRIMARY KEY ("kind")
);

-- ============================================================
-- Chaves estrangeiras (idempotentes via DO/EXCEPTION: Postgres não tem
-- ADD CONSTRAINT IF NOT EXISTS)
-- ============================================================

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

DO $$ BEGIN
    ALTER TABLE "PvpSeasonEntry" ADD CONSTRAINT "PvpSeasonEntry_seasonId_fkey"
        FOREIGN KEY ("seasonId") REFERENCES "PvpSeason"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "PvpSeasonEntry" ADD CONSTRAINT "PvpSeasonEntry_characterId_fkey"
        FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "DolPrizeContribution" ADD CONSTRAINT "DolPrizeContribution_seasonId_fkey"
        FOREIGN KEY ("seasonId") REFERENCES "PvpSeason"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
