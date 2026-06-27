-- Âncora do regen passivo de stamina. Marca o instante do último gasto; o regen
-- (+2 a cada 15 min, após 15 min sem gastar) é calculado de forma lazy a partir daqui.
ALTER TABLE "Character" ADD COLUMN "staminaUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
