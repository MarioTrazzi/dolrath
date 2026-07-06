-- ⏳ "Aguardar último ciclo": encerramento agendado da coleta.
ALTER TABLE "GatheringSession" ADD COLUMN "stopRequested" BOOLEAN NOT NULL DEFAULT false;
