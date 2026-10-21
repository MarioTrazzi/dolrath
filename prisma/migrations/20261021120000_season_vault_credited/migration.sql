-- Marca de idempotência do crédito da sobra da temporada no cofre de torneios.
ALTER TABLE "PvpSeason" ADD COLUMN IF NOT EXISTS "vaultCreditedAt" TIMESTAMP(3);

-- Temporadas que já passaram pelo snapshot (entressafra, encerradas, pagas) já
-- creditaram o cofre: marcá-las impede um segundo crédito numa reexecução.
UPDATE "PvpSeason"
SET "vaultCreditedAt" = "updatedAt"
WHERE "vaultCreditedAt" IS NULL AND status IN ('offseason', 'ended', 'paid');
