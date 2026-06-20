-- Novos tipos de item: GAUNTLET (arma do Monge), ORB (offhand do Mago), BELT (cinto)
-- e novo slot de equipamento BELT. Postgres: ADD VALUE é não-bloqueante e idempotente.
ALTER TYPE "ItemType" ADD VALUE IF NOT EXISTS 'GAUNTLET';
ALTER TYPE "ItemType" ADD VALUE IF NOT EXISTS 'ORB';
ALTER TYPE "ItemType" ADD VALUE IF NOT EXISTS 'BELT';

ALTER TYPE "EquipmentSlotType" ADD VALUE IF NOT EXISTS 'BELT';
