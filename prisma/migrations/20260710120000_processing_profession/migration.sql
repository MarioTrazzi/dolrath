-- ⚙️ Profissão de Processamento (beneficiamento de insumos) — espelha a
-- migração 20260707120000_crafting_professions. Aditiva: coluna nova com
-- default 0, zero impacto nas linhas existentes.
ALTER TABLE "Character" ADD COLUMN "processXp" INTEGER NOT NULL DEFAULT 0;
