-- Novos tipos de arma secundária/offhand: PARRY_DAGGER (adaga de parada do Ladino)
-- e TALISMAN (talismã/foco do Monge). Ambos ocupam o slot secundário (SHIELD).
-- Postgres: ADD VALUE é não-bloqueante e idempotente.
ALTER TYPE "ItemType" ADD VALUE IF NOT EXISTS 'PARRY_DAGGER';
ALTER TYPE "ItemType" ADD VALUE IF NOT EXISTS 'TALISMAN';
