-- 💰 Espólio acumulado da run, creditado de uma vez só no /finish.
ALTER TABLE "DungeonRun" ADD COLUMN "accrued" JSONB;

-- Lock de run viva: findFirst({ userId, status: 'active' }, orderBy updatedAt).
CREATE INDEX "DungeonRun_userId_status_idx" ON "DungeonRun"("userId", "status");

-- Catálogo resolvido por NOME em todo crédito de drop (era seq scan por item).
CREATE INDEX "Item_name_idx" ON "Item"("name");
