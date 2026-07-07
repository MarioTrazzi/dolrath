-- ⚒️⚗️ Profissões de Forja e Alquimia: XP por personagem (nível é derivado da
-- SOMA da conta, como a Fazenda — ver src/lib/craftingServer.ts). Aditiva e
-- retrocompatível: aplicar no Neon ANTES do deploy do código.

ALTER TABLE "Character" ADD COLUMN "forgeXp" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Character" ADD COLUMN "alchemyXp" INTEGER NOT NULL DEFAULT 0;
