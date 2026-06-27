import { createHmac, timingSafeEqual } from 'crypto'

// Stateless wallet-login challenge.
//
// We avoid writing anything to the DB before the user proves wallet ownership
// (no phantom users). Instead the server issues a challenge whose authenticity
// it can later verify via HMAC keyed by NEXTAUTH_SECRET. The signed message
// embeds the address, a random nonce and an issuedAt timestamp; the HMAC binds
// those three together so the client can't tamper with them.

export const WALLET_CHALLENGE_TTL_MS = 10 * 60 * 1000

function getSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET
  if (!secret) {
    throw new Error('NEXTAUTH_SECRET is not set')
  }
  return secret
}

export function buildWalletLoginMessage(params: {
  address: string
  nonce: string
  issuedAt: number
}): string {
  // Keep this message stable: the server re-builds it during verification.
  return [
    'Dolrath — Entrar com carteira',
    '',
    `Carteira: ${params.address.toLowerCase()}`,
    `Nonce: ${params.nonce}`,
    `Emitido em: ${new Date(params.issuedAt).toISOString()}`,
    '',
    'Ao assinar, você prova que controla esta carteira e entra na sua conta Dolrath. Esta assinatura é gratuita e não envia nenhuma transação.',
  ].join('\n')
}

export function signChallenge(params: {
  address: string
  nonce: string
  issuedAt: number
}): string {
  const payload = `${params.address.toLowerCase()}|${params.nonce}|${params.issuedAt}`
  return createHmac('sha256', getSecret()).update(payload).digest('hex')
}

export function verifyChallengeHmac(params: {
  address: string
  nonce: string
  issuedAt: number
  hmac: string
}): boolean {
  const expected = signChallenge({
    address: params.address,
    nonce: params.nonce,
    issuedAt: params.issuedAt,
  })
  const a = Buffer.from(expected, 'hex')
  const b = Buffer.from(params.hmac, 'hex')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
