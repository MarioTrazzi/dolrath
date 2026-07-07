-- 🌾 Fazenda GLOBAL da conta: FarmPlot passa de characterId → userId.
-- Merge das fazendas existentes: por (userId, slotIndex) sobrevive a linha
-- PLANTADA; empate → a do personagem com mais farmXp; depois a mais antiga.

ALTER TABLE "FarmPlot" ADD COLUMN "userId" TEXT;

UPDATE "FarmPlot"
SET "userId" = c."userId"
FROM "Character" c
WHERE "FarmPlot"."characterId" = c."id";

DELETE FROM "FarmPlot" WHERE "id" IN (
  SELECT "id" FROM (
    SELECT fp."id",
           ROW_NUMBER() OVER (
             PARTITION BY fp."userId", fp."slotIndex"
             ORDER BY (fp."plantedAt" IS NOT NULL) DESC, c."farmXp" DESC, fp."createdAt" ASC
           ) AS rn
    FROM "FarmPlot" fp
    JOIN "Character" c ON c."id" = fp."characterId"
  ) ranked
  WHERE rn > 1
);

-- Órfãos sem dono resolvível (não deveria existir; garante o NOT NULL abaixo).
DELETE FROM "FarmPlot" WHERE "userId" IS NULL;

ALTER TABLE "FarmPlot" ALTER COLUMN "userId" SET NOT NULL;

ALTER TABLE "FarmPlot" DROP CONSTRAINT "FarmPlot_characterId_fkey";
DROP INDEX "FarmPlot_characterId_slotIndex_key";
DROP INDEX "FarmPlot_characterId_idx";
ALTER TABLE "FarmPlot" DROP COLUMN "characterId";

CREATE UNIQUE INDEX "FarmPlot_userId_slotIndex_key" ON "FarmPlot"("userId", "slotIndex");
CREATE INDEX "FarmPlot_userId_idx" ON "FarmPlot"("userId");
ALTER TABLE "FarmPlot" ADD CONSTRAINT "FarmPlot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
