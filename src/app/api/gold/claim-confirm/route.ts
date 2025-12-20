import { NextResponse } from 'next/server'
import { Contract, Interface, ethers } from 'ethers'
import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { getGoldContractAddress, getGoldProvider } from '@/lib/goldOnchain'
import { DOLRATH_GOLD_ABI } from '@/lib/goldSigning'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

function toGoldWei(amount: number): bigint {
  if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount < 0) {
    throw new Error('Invalid GOLD amount')
  }

  let scale = BigInt(1)
  for (let i = 0; i < 18; i++) scale = scale * BigInt(10)
  return BigInt(amount) * scale
}

function isHex32Bytes(txHash: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(txHash)
}

export async function POST(req: Request) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

    const body = (await req.json().catch(() => null)) as any
    const txHash = String(body?.txHash || '').trim()

    if (!txHash || !isHex32Bytes(txHash)) {
      return NextResponse.json({ error: 'Invalid txHash' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { id: session.user.id } })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const pendingAmount = Number((user as any).goldClaimPendingAmount ?? 0)
    const pendingNonceRaw = (user as any).goldClaimPendingNonce as number | null | undefined
    const pendingDeadlineRaw = (user as any).goldClaimPendingDeadline as Date | null | undefined

    const hasPending = pendingAmount > 0 && pendingNonceRaw != null && pendingDeadlineRaw != null

    if (!hasPending) {
      return NextResponse.json({ error: 'No pending claim to confirm' }, { status: 400 })
    }

    const contractAddress = getGoldContractAddress()
    if (!contractAddress) {
      return NextResponse.json(
        { error: 'Server missing GOLD_CONTRACT_ADDRESS (or NEXT_PUBLIC_GOLD_CONTRACT_ADDRESS)' },
        { status: 500 }
      )
    }

    const provider = getGoldProvider()
    const receipt = await provider.getTransactionReceipt(txHash)

    if (!receipt) {
      return NextResponse.json({ error: 'Transaction not found yet' }, { status: 404 })
    }

    if (receipt.status !== 1) {
      // Tx reverted; unlock the pending amount so user can retry.
      await prisma.user.update({
        where: { id: session.user.id },
        data: {
          goldBalance: { increment: pendingAmount },
          goldClaimPendingAmount: 0,
          goldClaimPendingNonce: null,
          goldClaimPendingDeadline: null,
          goldClaimPendingCreatedAt: null,
          goldClaimPendingTxHash: txHash,
        } as any,
      })

      return NextResponse.json({ error: 'Claim transaction reverted', txHash }, { status: 400 })
    }

    if (!receipt.to || receipt.to.toLowerCase() !== contractAddress.toLowerCase()) {
      return NextResponse.json(
        { error: 'Transaction not sent to GOLD contract', txHash, to: receipt.to },
        { status: 400 }
      )
    }

    if (receipt.from.toLowerCase() !== walletAddress.toLowerCase()) {
      return NextResponse.json(
        { error: 'Transaction sender does not match linked wallet', txHash },
        { status: 400 }
      )
    }

    const pendingAmountWei = toGoldWei(pendingAmount)
    const pendingNonce = BigInt(pendingNonceRaw!)

    const iface = new Interface(DOLRATH_GOLD_ABI)
    let matched = false

    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== contractAddress.toLowerCase()) continue
      try {
        const parsed = iface.parseLog(log)
        if (parsed?.name !== 'Claimed') continue

        const to = String(parsed.args.to)
        const amount = BigInt(parsed.args.amount)
        const nonce = BigInt(parsed.args.nonce)

        if (
          to.toLowerCase() === walletAddress.toLowerCase() &&
          amount === pendingAmountWei &&
          nonce === pendingNonce
        ) {
          matched = true
          break
        }
      } catch {
        // ignore non-matching logs
      }
    }

    if (!matched) {
      // Fallback: if nonce is already used on-chain, accept and clear pending.
      // This covers cases where logs are pruned/filtered or provider behaves oddly.
      const contract = new Contract(contractAddress, DOLRATH_GOLD_ABI, provider)
      const used = (await contract.usedNonce(walletAddress, pendingNonce)) as boolean
      if (!used) {
        return NextResponse.json(
          { error: 'Claimed event not found for this pending claim', txHash },
          { status: 400 }
        )
      }
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        goldClaimPendingAmount: 0,
        goldClaimPendingNonce: null,
        goldClaimPendingDeadline: null,
        goldClaimPendingCreatedAt: null,
        goldClaimPendingTxHash: txHash,
      } as any,
    })

    return NextResponse.json({
      ok: true,
      txHash,
      to: walletAddress,
      amount: pendingAmount,
      amountWei: pendingAmountWei.toString(),
      nonce: pendingNonce.toString(),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
