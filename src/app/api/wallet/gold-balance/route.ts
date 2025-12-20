import { NextResponse } from 'next/server'
import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { fetchGoldBalance } from '@/lib/goldOnchain'

const RPC_TIMEOUT_MS = Number(process.env.GOLD_BALANCE_TIMEOUT_MS || 12_000)

export async function GET() {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { walletAddress: true },
  })

  if (!user?.walletAddress) {
    return NextResponse.json({ error: 'Wallet not linked', walletLinked: false }, { status: 200 })
  }

  try {
    const balance = await Promise.race([
      fetchGoldBalance({ walletAddress: user.walletAddress }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('RPC timeout while fetching GOLD balance')), RPC_TIMEOUT_MS)
      ),
    ])

    return NextResponse.json({ walletLinked: true, walletAddress: user.walletAddress, ...balance })
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : 'Failed to fetch on-chain balance',
        walletLinked: true,
        walletAddress: user.walletAddress,
      },
      { status: 502 }
    )
  }
}
