// Server-only. Verifica e CONSOME um pagamento on-chain de DOL que dá direito a
// uma regeração de imagem por IA (retrato base ou transformação).
//
// Fluxo: o client transfere IMAGE_REGEN_COST_DOL para a tesouraria (mesmo padrão
// da taxa de criação) e envia o txHash; aqui validamos o Transfer on-chain
// (carteira do usuário → tesouraria, valor mínimo) e gravamos o hash em
// AiGenPayment — o índice único garante que cada transação paga UMA geração.

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { verifyDolTransferTx } from '@/lib/dolPayments';

export class AiGenPaymentError extends Error {}

export const DEFAULT_IMAGE_REGEN_COST_DOL = '1';

export function getImageRegenCostDol(): string {
  return (process.env.IMAGE_REGEN_COST_DOL || DEFAULT_IMAGE_REGEN_COST_DOL).trim();
}

export async function consumeAiGenPayment(params: {
  userId: string;
  walletAddress: string;
  txHash: string;
  purpose: 'character-image-edit' | 'transformation-regen';
}): Promise<void> {
  const txHash = String(params.txHash || '').trim();
  if (!txHash) {
    throw new AiGenPaymentError('Pagamento obrigatório: envie o txHash da transferência de DOL.');
  }

  const treasuryAddress = (process.env.DOL_TREASURY_ADDRESS || '').trim();
  if (!treasuryAddress) {
    throw new AiGenPaymentError('Servidor sem DOL_TREASURY_ADDRESS configurado.');
  }

  const amountDol = getImageRegenCostDol();

  await verifyDolTransferTx({
    txHash,
    expectedFrom: params.walletAddress,
    expectedTo: treasuryAddress,
    minAmountHuman: amountDol,
  });

  try {
    await prisma.aiGenPayment.create({
      data: { txHash, userId: params.userId, purpose: params.purpose, amountDol },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AiGenPaymentError('Esta transação já foi usada para pagar outra geração.');
    }
    throw err;
  }
}

// Se a geração falhar DEPOIS do pagamento consumido, libera o txHash para o
// jogador tentar de novo sem pagar outra vez (o DOL já está na tesouraria).
export async function releaseAiGenPayment(txHash: string): Promise<void> {
  try {
    await prisma.aiGenPayment.delete({ where: { txHash: String(txHash || '').trim() } });
  } catch {
    // Já liberado ou nunca registrado — nada a fazer.
  }
}
