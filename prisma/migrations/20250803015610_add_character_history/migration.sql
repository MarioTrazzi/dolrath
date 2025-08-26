-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('ITEM_PURCHASE', 'ITEM_GAINED', 'ITEM_SOLD', 'ITEM_CONSUMED', 'ITEM_EQUIPPED', 'ITEM_UNEQUIPPED', 'XP_GAINED', 'LEVEL_UP', 'GOLD_GAINED', 'GOLD_SPENT', 'DUNGEON_COMPLETED', 'CHARACTER_CREATED', 'ATTRIBUTE_DISTRIBUTED', 'INVENTORY_EXPANDED');

-- CreateTable
CREATE TABLE "CharacterHistory" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "activityType" "ActivityType" NOT NULL,
    "description" TEXT NOT NULL,
    "details" JSONB,
    "itemId" TEXT,
    "goldAmount" INTEGER,
    "xpAmount" INTEGER,
    "oldLevel" INTEGER,
    "newLevel" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CharacterHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CharacterHistory_characterId_idx" ON "CharacterHistory"("characterId");

-- CreateIndex
CREATE INDEX "CharacterHistory_createdAt_idx" ON "CharacterHistory"("createdAt");

-- CreateIndex
CREATE INDEX "CharacterHistory_activityType_idx" ON "CharacterHistory"("activityType");

-- AddForeignKey
ALTER TABLE "CharacterHistory" ADD CONSTRAINT "CharacterHistory_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterHistory" ADD CONSTRAINT "CharacterHistory_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
