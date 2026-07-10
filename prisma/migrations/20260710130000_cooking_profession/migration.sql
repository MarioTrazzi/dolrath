-- 🍳 Profissão de Culinária (pratos com buff por tempo real) — espelha a
-- migração 20260710120000_processing_profession. Aditiva: colunas novas com
-- default/null, zero impacto nas linhas existentes.
ALTER TABLE "Character" ADD COLUMN "cookXp" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Character" ADD COLUMN "activeFood" JSONB;
