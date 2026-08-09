-- 20 slots ainda apertava o começo: uma run de masmorra sozinha traz pedra,
-- gear e consumível, e o herói novo voltava com a mochila estourada antes de
-- conhecer a forja. Sobe o inicial pra 25 — de novo SÓ pra personagens novos;
-- quem já existe continua como está e expande via /expand-inventory (GOLD).
ALTER TABLE "Character" ALTER COLUMN "inventorySlots" SET DEFAULT 25;
