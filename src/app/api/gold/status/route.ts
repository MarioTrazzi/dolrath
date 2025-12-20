import { NextResponse } from 'next/server'
import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export async function GET() {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } })

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const walletAddress = String((user as any).walletAddress || '').trim()
  const offchainBalance = Number((user as any).goldBalance ?? 0)

  const pendingAmount = Number((user as any).goldClaimPendingAmount ?? 0)
  const pendingNonce = (user as any).goldClaimPendingNonce as number | null | undefined
  const pendingDeadline = (user as any).goldClaimPendingDeadline as Date | null | undefined
  const pendingTxHash = String((user as any).goldClaimPendingTxHash || '').trim() || null

  const hasPending = pendingAmount > 0 && pendingNonce != null && pendingDeadline != null
  const pendingExpired = hasPending ? pendingDeadline!.getTime() <= Date.now() : false

  const claimable = hasPending && !pendingExpired ? 0 : offchainBalance

  return NextResponse.json({
    walletLinked: Boolean(walletAddress),
    walletAddress: walletAddress || null,
    offchainBalance,
    claimable,
    pending: hasPending
      ? {
          amount: pendingAmount,
          nonce: pendingNonce,
          deadline: pendingDeadline!.toISOString(),
          expired: pendingExpired,
          txHash: pendingTxHash,
        }
      : null,
  })
}
