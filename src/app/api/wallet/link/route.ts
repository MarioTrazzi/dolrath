import { NextResponse } from 'next/server'
import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { buildWalletLinkMessage } from '@/lib/walletLink'
import { verifyMessage } from 'ethers'

export async function POST(req: Request) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await req.json().catch(() => null)) as null | {
    signature?: string
  }

  const signature = body?.signature
  if (!signature || typeof signature !== 'string') {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      walletLinkNonce: true,
      walletLinkNonceExpiresAt: true,
      walletAddress: true,
    },
  })

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  if (!user.walletLinkNonce || !user.walletLinkNonceExpiresAt) {
    return NextResponse.json({ error: 'No nonce found. Request a new nonce.' }, { status: 400 })
  }

  if (user.walletLinkNonceExpiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: 'Nonce expired. Request a new nonce.' }, { status: 400 })
  }

  const message = buildWalletLinkMessage({ userId: user.id, nonce: user.walletLinkNonce })

  let recoveredAddress: string
  try {
    recoveredAddress = verifyMessage(message, signature)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const walletAddress = recoveredAddress.toLowerCase()

  // Idempotent: if already linked to the same wallet, just clear nonce and return.
  if (user.walletAddress?.toLowerCase() === walletAddress) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        walletLinkNonce: null,
        walletLinkNonceExpiresAt: null,
      },
    })

    return NextResponse.json({ walletAddress })
  }

  try {
    // 🔒 Sem claim de GOLD pendente: a assinatura pendente é da carteira ATUAL,
    // e a checagem de "já resgatou?" (usedNonce) lê a carteira vinculada. Trocar
    // de carteira no meio fazia o claim já resgatado parecer não resgatado e o
    // valor voltava ao banco — GOLD em dobro.
    const linked = await prisma.user.updateMany({
      where: { id: user.id, goldClaimPendingAmount: 0 },
      data: {
        walletAddress,
        walletLinkedAt: new Date(),
        walletLinkNonce: null,
        walletLinkNonceExpiresAt: null,
      },
    })
    if (linked.count === 0) {
      return NextResponse.json(
        { error: 'A GOLD claim is still pending. Finish it (or wait for it to expire and reopen the claim) before changing wallets.' },
        { status: 409 }
      )
    }
  } catch (error: any) {
    // Unique violation (wallet already linked to someone else)
    if (error?.code === 'P2002') {
      return NextResponse.json(
        { error: 'Wallet already linked to another account' },
        { status: 409 }
      )
    }

    throw error
  }

  return NextResponse.json({ walletAddress })
}
