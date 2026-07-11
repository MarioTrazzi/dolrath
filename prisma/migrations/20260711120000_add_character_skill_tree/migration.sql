-- 🌳 Árvore de habilidades (estilo Child of Light): { version, purchased: string[], respecAt? }
-- Aditiva e nullable: personagens existentes ficam null (= legado, tudo liberado no combate).
ALTER TABLE "Character" ADD COLUMN "skillTree" JSONB;
