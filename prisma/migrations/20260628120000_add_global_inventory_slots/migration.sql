-- Baú Geral expansível: slots por conta (espelha Character.inventorySlots).
-- Aditivo e retrocompatível: contas existentes começam com 50 slots.
ALTER TABLE "User" ADD COLUMN "globalInventorySlots" INTEGER NOT NULL DEFAULT 50;
