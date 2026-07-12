import { createHmac } from 'crypto'
import { rollCreationStats, type StatFour } from './characterStats'

// A rolagem dos 18 pontos de criação é derivada do hash da transação de
// pagamento (e do mint, quando há NFT) via HMAC — assim o resultado só passa
// a existir DEPOIS que o jogador pagou a taxa de criação (verificada
// on-chain em route.ts), sem precisar de nenhuma tabela/estado novo no banco.
// Re-rolar exigiria pagar a taxa de novo. Mesmo tx hash => mesmo roll
// (idempotente em retries).
function getSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET
  if (!secret) throw new Error('NEXTAUTH_SECRET is not set')
  return secret
}

export function rollCreationStatsFromPaymentProof(params: {
  creationTxHash: string
  nftMintTxHash?: string | null
  classId?: string | null
}): StatFour {
  const material = `${params.creationTxHash}:${params.nftMintTxHash || ''}:creation-roll`
  const digest = createHmac('sha256', getSecret()).update(material).digest()
  const seed = digest.readUInt32BE(0)
  return rollCreationStats(seed, params.classId)
}
