import { NextResponse } from 'next/server'
import { ethers } from 'ethers'
import { auth } from '@/app/api/auth/[...nextauth]/route'
import { rateLimitAllow, rateLimited429 } from '@/lib/rateLimit'
import { prisma } from '@/lib/prisma'
import { getGoldChainId, getGoldContractAddress } from '@/lib/goldOnchain'
import { signGoldClaim } from '@/lib/goldSigning'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

function getClaimDeadlineSeconds(): number {
  const raw = process.env.GOLD_CLAIM_DEADLINE_SECONDS
  const n = raw ? Number(raw) : 15 * 60
  if (!Number.isFinite(n) || n <= 0) return 15 * 60
  return Math.floor(n)
}

function toGoldWei(amount: number): bigint {
  if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount < 0) {
    throw new Error('Invalid GOLD amount')
  }

  // Contract defaults to 18 decimals (ERC20). We treat DB gold as whole units.
  let scale = BigInt(1)
  for (let i = 0; i < 18; i++) scale = scale * BigInt(10)
  return BigInt(amount) * scale
}

export async function POST() {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // A resposta carrega uma assinatura EIP-712 do servidor — throttle por usuário.
    if (!rateLimitAllow(`gold-claim-intent:${session.user.id}`, { windowMs: 60_000, max: 6 })) {
      return rateLimited429()
    }

    const rawWallet = String((session.user as any)?.walletAddress || '').trim()
    if (!rawWallet) {
      return NextResponse.json({ error: 'Wallet required', requiresWallet: true }, { status: 403 })
    }

    let walletAddress: string
    try {
      walletAddress = ethers.getAddress(rawWallet)
    } catch {
      return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 })
    }

    const contractAddress = getGoldContractAddress()
    if (!contractAddress) {
      return NextResponse.json(
        { error: 'Server missing GOLD_CONTRACT_ADDRESS (or NEXT_PUBLIC_GOLD_CONTRACT_ADDRESS)' },
        { status: 500 }
      )
    }

    const chainId = getGoldChainId()

    const now = new Date()
    let user = await prisma.user.findUnique({ where: { id: session.user.id } })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if ((user as { isBot?: boolean }).isBot) {
      return NextResponse.json({ error: 'Bot accounts cannot claim GOLD' }, { status: 403 })
    }

    // If there is an expired pending claim, unlock it.
    const goldClaimPendingAmount = Number((user as any).goldClaimPendingAmount ?? 0)
    const goldClaimPendingNonce = (user as any).goldClaimPendingNonce as number | null | undefined
    const goldClaimPendingDeadline = (user as any).goldClaimPendingDeadline as Date | null | undefined

    const hasPending =
      goldClaimPendingAmount > 0 &&
      goldClaimPendingNonce != null &&
      goldClaimPendingDeadline != null

    if (hasPending && goldClaimPendingDeadline!.getTime() <= Date.now()) {
      await prisma.user.update({
        where: { id: session.user.id },
        data: {
          goldBalance: { increment: goldClaimPendingAmount },
          goldClaimPendingAmount: 0,
          goldClaimPendingNonce: null,
          goldClaimPendingDeadline: null,
          goldClaimPendingCreatedAt: null,
          goldClaimPendingTxHash: null,
        } as any,
      })

      // Re-fetch minimal fields for a clean flow.
      const refreshed = await prisma.user.findUnique({ where: { id: session.user.id } })

      if (!refreshed) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 })
      }

      user = refreshed
    }

    // If there is a valid pending claim, just re-sign and return it.
    const stillPending =
      Number((user as any).goldClaimPendingAmount ?? 0) > 0 &&
      (user as any).goldClaimPendingNonce != null &&
      (user as any).goldClaimPendingDeadline != null &&
      new Date((user as any).goldClaimPendingDeadline).getTime() > Date.now()

    if (stillPending) {
      const pendingAmount = Number((user as any).goldClaimPendingAmount ?? 0)
      const pendingNonce = BigInt((user as any).goldClaimPendingNonce)
      const pendingDeadlineDate = new Date((user as any).goldClaimPendingDeadline)

      const deadline = BigInt(Math.floor(pendingDeadlineDate.getTime() / 1000))
      const amountWei = toGoldWei(pendingAmount)

      const signed = await signGoldClaim({
        to: walletAddress,
        amountWei,
        nonce: pendingNonce,
        deadline,
      })

      return NextResponse.json({
        contractAddress,
        chainId,
        to: walletAddress,
        amount: pendingAmount,
        amountWei: amountWei.toString(),
        nonce: pendingNonce.toString(),
        deadline: deadline.toString(),
        signature: signed.signature,
        reusedPending: true,
      })
    }

    const claimAmount = Number(user.goldBalance)
    if (!Number.isFinite(claimAmount) || !Number.isInteger(claimAmount) || claimAmount <= 0) {
      return NextResponse.json({ error: 'No GOLD available to claim' }, { status: 400 })
    }

    const deadlineSeconds = getClaimDeadlineSeconds()
    const deadlineDate = new Date(Date.now() + deadlineSeconds * 1000)
    const deadline = BigInt(Math.floor(deadlineDate.getTime() / 1000))

    const currentNonce = Number((user as any).goldClaimNonce ?? 0)
    const nextNonce = currentNonce + 1
    const nonce = BigInt(nextNonce)

    // Lock the amount off-chain by moving it from goldBalance -> pending.
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        goldBalance: { decrement: claimAmount },
        goldClaimNonce: { increment: 1 },
        goldClaimPendingAmount: claimAmount,
        goldClaimPendingNonce: nextNonce,
        goldClaimPendingDeadline: deadlineDate,
        goldClaimPendingCreatedAt: now,
        goldClaimPendingTxHash: null,
      } as any,
    })

    const amountWei = toGoldWei(claimAmount)
    const signed = await signGoldClaim({ to: walletAddress, amountWei, nonce, deadline })

    return NextResponse.json({
      contractAddress,
      chainId,
      to: walletAddress,
      amount: claimAmount,
      amountWei: amountWei.toString(),
      nonce: nonce.toString(),
      deadline: deadline.toString(),
      signature: signed.signature,
      reusedPending: false,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
