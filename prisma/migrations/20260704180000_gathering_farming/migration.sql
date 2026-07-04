-- 🌾 Profissões idle: Coleta e Fazenda.
-- XP por profissão no personagem + sessão de coleta (espelha DungeonRun) +
-- lotes da fazenda. Tudo lazy por timestamp, sem cron.
ALTER TABLE "Character" ADD COLUMN "gatherXp" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Character" ADD COLUMN "farmXp" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "GatheringSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastTickAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pendingYield" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GatheringSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GatheringSession_userId_status_idx" ON "GatheringSession"("userId", "status");
CREATE INDEX "GatheringSession_characterId_status_idx" ON "GatheringSession"("characterId", "status");

ALTER TABLE "GatheringSession" ADD CONSTRAINT "GatheringSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GatheringSession" ADD CONSTRAINT "GatheringSession_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "FarmPlot" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "slotIndex" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "cropId" TEXT,
    "plantedAt" TIMESTAMP(3),
    "state" TEXT NOT NULL DEFAULT 'empty',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FarmPlot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FarmPlot_characterId_slotIndex_key" ON "FarmPlot"("characterId", "slotIndex");
CREATE INDEX "FarmPlot_characterId_idx" ON "FarmPlot"("characterId");

ALTER TABLE "FarmPlot" ADD CONSTRAINT "FarmPlot_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;
