-- 10 slots iniciais era pouco (craft/alquimia enchem rápido). Sobe o default
-- pra 20 SÓ pra personagens novos daqui pra frente — quem já existe continua
-- como está e expande normalmente via /expand-inventory (pago em GOLD).
ALTER TABLE "Character" ALTER COLUMN "inventorySlots" SET DEFAULT 20;
