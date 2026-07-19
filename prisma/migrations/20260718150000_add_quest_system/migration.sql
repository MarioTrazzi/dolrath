-- Sistema de Missões: QuestProgress (por personagem, periodKey separa tutorial/diária)
-- e DailyLoginClaim (login diário por usuário, unique userId+dayKey impede resgate duplo).
-- Apenas CREATE TABLE/INDEX/FK — nenhum ALTER TYPE (enums travados em prod).

-- CreateTable
CREATE TABLE "QuestProgress" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "questId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL DEFAULT '',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "goldGranted" INTEGER NOT NULL DEFAULT 0,
    "xpGranted" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyLoginClaim" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "streak" INTEGER NOT NULL DEFAULT 1,
    "gold" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyLoginClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuestProgress_characterId_claimedAt_idx" ON "QuestProgress"("characterId", "claimedAt");

-- CreateIndex
CREATE UNIQUE INDEX "QuestProgress_characterId_questId_periodKey_key" ON "QuestProgress"("characterId", "questId", "periodKey");

-- CreateIndex
CREATE INDEX "DailyLoginClaim_userId_createdAt_idx" ON "DailyLoginClaim"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DailyLoginClaim_userId_dayKey_key" ON "DailyLoginClaim"("userId", "dayKey");

-- AddForeignKey
ALTER TABLE "QuestProgress" ADD CONSTRAINT "QuestProgress_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyLoginClaim" ADD CONSTRAINT "DailyLoginClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

