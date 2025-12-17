import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { buildWalletLinkMessage } from '@/lib/walletLink'

const NONCE_TTL_MS = 10 * 60 * 1000

export async function POST() {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const nonce = randomBytes(16).toString('hex')
  const expiresAt = new Date(Date.now() + NONCE_TTL_MS)

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      walletLinkNonce: nonce,
      walletLinkNonceExpiresAt: expiresAt,
    },
  })

  const message = buildWalletLinkMessage({ userId: session.user.id, nonce })

  return NextResponse.json({ message, expiresAt })
}
