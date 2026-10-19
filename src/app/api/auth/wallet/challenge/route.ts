import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { isAddress } from 'ethers'
import { buildWalletLoginMessage, signChallenge } from '@/lib/walletLogin'
import { getT } from '@/lib/i18n/server'

// Unauthenticated: issues a wallet-login challenge for any address.
// No DB write happens here — the challenge is self-contained and HMAC-signed,
// so we never create a user before ownership is proven (see /lib/walletLogin).
export async function POST(req: Request) {
  const t = getT()
  const body = (await req.json().catch(() => null)) as null | { address?: string }
  const address = body?.address

  if (!address || typeof address !== 'string' || !isAddress(address)) {
    return NextResponse.json({ error: t('Invalid wallet address') }, { status: 400 })
  }

  const normalized = address.toLowerCase()
  const nonce = randomBytes(16).toString('hex')
  const issuedAt = Date.now()
  const message = buildWalletLoginMessage({ address: normalized, nonce, issuedAt })
  const hmac = signChallenge({ address: normalized, nonce, issuedAt })

  return NextResponse.json({ message, nonce, issuedAt, hmac })
}
