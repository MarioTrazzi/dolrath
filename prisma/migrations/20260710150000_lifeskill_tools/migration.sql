-- ⛏️🎣 Ferramentas e Trajes de lifeskill — 6 valores novos no enum ItemType.
-- Aditiva: só acrescenta valores ao enum, zero impacto nas linhas existentes.
-- ⚠️ Aplicar no Neon ANTES do push (o deploy da Vercel espera o enum pronto).
ALTER TYPE "ItemType" ADD VALUE 'PICKAXE';
ALTER TYPE "ItemType" ADD VALUE 'HERB_SICKLE';
ALTER TYPE "ItemType" ADD VALUE 'LOGGING_AXE';
ALTER TYPE "ItemType" ADD VALUE 'FISHING_ROD';
ALTER TYPE "ItemType" ADD VALUE 'HUNTING_KNIFE';
ALTER TYPE "ItemType" ADD VALUE 'GATHER_GARB';
