-- 🏆 Tiers de masmorra (estilo Diablo 4).
-- Coluna de tier na run + tabela de progresso (maior tier desbloqueado) por
-- personagem × masmorra. Vencer o boss no tier atual desbloqueia o próximo (até 5).
ALTER TABLE "DungeonRun" ADD COLUMN "tier" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "DungeonProgress" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "dungeonId" TEXT NOT NULL,
    "maxTier" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DungeonProgress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DungeonProgress_characterId_dungeonId_key" ON "DungeonProgress"("characterId", "dungeonId");
CREATE INDEX "DungeonProgress_characterId_idx" ON "DungeonProgress"("characterId");

ALTER TABLE "DungeonProgress" ADD CONSTRAINT "DungeonProgress_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;
