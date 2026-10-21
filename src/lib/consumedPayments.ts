import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

/**
 * 🧾 Livro único de pagamentos on-chain consumidos (model ConsumedPayment).
 *
 * Toda rota que aceita uma transferência para a tesouraria registra o txHash
 * AQUI, na mesma transação do que o pagamento compra. Uma tx vale uma vez, em
 * uma rota só: antes cada rota deduplicava por conta própria (ou nem isso — as
 * expansões de inventário aceitavam a mesma tx para sempre) e um hash pago numa
 * rota era reapresentável nas outras.
 */
export class PaymentAlreadyUsedError extends Error {
  constructor() {
    super('Payment already used')
    this.name = 'PaymentAlreadyUsedError'
  }
}

type Db = Prisma.TransactionClient | typeof prisma

export function normalizeTxHash(txHash: string): string {
  return String(txHash || '').trim().toLowerCase()
}

/**
 * Consome o pagamento para `purpose`. Lança PaymentAlreadyUsedError se a tx já
 * foi usada — exceto quando `allowSamePurpose` e o registro existente é do
 * MESMO usuário e propósito (rotas idempotentes que reapresentam a própria tx).
 * Devolve `true` se consumiu agora, `false` se já era deste propósito.
 */
export async function consumePayment(
  db: Db,
  params: { txHash: string; purpose: string; userId: string; allowSamePurpose?: boolean },
): Promise<boolean> {
  const txHash = normalizeTxHash(params.txHash)
  const existing = await db.consumedPayment.findUnique({ where: { txHash } })
  if (existing) {
    if (params.allowSamePurpose && existing.purpose === params.purpose && existing.userId === params.userId) {
      return false
    }
    throw new PaymentAlreadyUsedError()
  }
  try {
    await db.consumedPayment.create({ data: { txHash, purpose: params.purpose, userId: params.userId } })
    return true
  } catch (e) {
    if ((e as { code?: string })?.code === 'P2002') throw new PaymentAlreadyUsedError()
    throw e
  }
}

/** Libera um pagamento cujo serviço falhou depois de consumido (ex.: geração por IA). */
export async function releasePayment(txHash: string): Promise<void> {
  await prisma.consumedPayment.deleteMany({ where: { txHash: normalizeTxHash(txHash) } })
}
