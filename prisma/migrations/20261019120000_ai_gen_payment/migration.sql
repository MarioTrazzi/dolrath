-- 🎨 AiGenPayment entra nas migrações.
--
-- O model nasceu no schema.prisma (pagamento de DOL que dá direito a regerar o
-- retrato/transformação por IA) mas nunca ganhou migração: um banco montado por
-- `prisma migrate deploy` não tem a tabela, e o consumeAiGenPayment estourava
-- (P2021) DEPOIS de o jogador já ter pago o DOL on-chain.
--
-- IF NOT EXISTS de propósito: se a tabela já foi criada à mão / por `db push`
-- em algum ambiente, a migração vira no-op em vez de travar o deploy.
CREATE TABLE IF NOT EXISTS "AiGenPayment" (
    "id" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "amountDol" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiGenPayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AiGenPayment_txHash_key" ON "AiGenPayment"("txHash");

CREATE INDEX IF NOT EXISTS "AiGenPayment_userId_idx" ON "AiGenPayment"("userId");
