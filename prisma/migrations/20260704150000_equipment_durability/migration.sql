-- Desgaste por uso: durabilidade também na peça EQUIPADA (antes só no inventário).
-- Itens já equipados nascem com durabilidade cheia.
ALTER TABLE "CharacterEquipment" ADD COLUMN "durability" INTEGER NOT NULL DEFAULT 100;
ALTER TABLE "CharacterEquipment" ADD COLUMN "maxDurability" INTEGER NOT NULL DEFAULT 100;
