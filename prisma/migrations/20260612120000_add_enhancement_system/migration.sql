-- ⚒️ Sistema de Aprimoramento (estilo Black Desert)

-- Failstacks por personagem
ALTER TABLE "Character" ADD COLUMN "failstacks" INTEGER NOT NULL DEFAULT 0;

-- Estado de aprimoramento por instância de item no inventário
ALTER TABLE "CharacterInventory" ADD COLUMN "enhancementLevel" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CharacterInventory" ADD COLUMN "durability" INTEGER NOT NULL DEFAULT 100;
ALTER TABLE "CharacterInventory" ADD COLUMN "maxDurability" INTEGER NOT NULL DEFAULT 100;

-- Nível de aprimoramento do item equipado
ALTER TABLE "CharacterEquipment" ADD COLUMN "enhancementLevel" INTEGER NOT NULL DEFAULT 0;

-- Novos tipos de atividade no histórico
ALTER TYPE "ActivityType" ADD VALUE 'ITEM_ENHANCED';
ALTER TYPE "ActivityType" ADD VALUE 'ENHANCEMENT_FAILED';
ALTER TYPE "ActivityType" ADD VALUE 'ITEM_DESTROYED';
ALTER TYPE "ActivityType" ADD VALUE 'ITEM_REPAIRED';
