-- Ranking GLOBAL e permanente: a pontuação do PvP deixa de morar dentro de uma
-- temporada. PvpSeason/PvpRating continuam existindo, congelados, como histórico.

-- 1. Placar global: uma linha por personagem, sem ciclo e sem reset.
CREATE TABLE IF NOT EXISTS "PvpGlobalRating" (
    "characterId" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PvpGlobalRating_pkey" PRIMARY KEY ("characterId")
);

CREATE INDEX IF NOT EXISTS "PvpGlobalRating_points_idx" ON "PvpGlobalRating"("points");

DO $$
BEGIN
    ALTER TABLE "PvpGlobalRating"
        ADD CONSTRAINT "PvpGlobalRating_characterId_fkey"
        FOREIGN KEY ("characterId") REFERENCES "Character"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 2. A luta global não pertence a temporada nenhuma. O ledger continua sendo uma
-- tabela só: o teto diário de ouro e o cap de pontos por par somam PvpMatch sem
-- filtrar temporada.
ALTER TABLE "PvpMatch" ALTER COLUMN "seasonId" DROP NOT NULL;

-- 3. Backfill: o placar global nasce com o que já foi jogado em TODAS as
-- temporadas, somado por personagem. Sem isto o ranking estrearia vazio.
INSERT INTO "PvpGlobalRating" ("characterId", "points", "wins", "losses", "createdAt", "updatedAt")
SELECT "characterId", SUM("points"), SUM("wins"), SUM("losses"), MIN("createdAt"), CURRENT_TIMESTAMP
FROM "PvpRating"
GROUP BY "characterId"
ON CONFLICT ("characterId") DO NOTHING;
