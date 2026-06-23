-- Sessão de masmorra servidor-autoritativa. O servidor é dono do RNG e da
-- progressão; gold/xp creditados só aqui. Substitui o faucet client-authoritative.
CREATE TABLE "DungeonRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "dungeonId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "cursor" INTEGER NOT NULL DEFAULT 0,
    "nodeCount" INTEGER NOT NULL,
    "goldEarned" INTEGER NOT NULL DEFAULT 0,
    "xpEarned" INTEGER NOT NULL DEFAULT 0,
    "pending" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DungeonRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DungeonRun_userId_idx" ON "DungeonRun"("userId");
CREATE INDEX "DungeonRun_characterId_idx" ON "DungeonRun"("characterId");
CREATE INDEX "DungeonRun_characterId_status_idx" ON "DungeonRun"("characterId", "status");

ALTER TABLE "DungeonRun" ADD CONSTRAINT "DungeonRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DungeonRun" ADD CONSTRAINT "DungeonRun_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;
