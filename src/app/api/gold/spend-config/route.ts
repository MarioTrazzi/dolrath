import { NextResponse } from 'next/server'
import { auth } from '@/app/api/auth/[...nextauth]/route'
import { getGoldChainId, getGoldContractAddress } from '@/lib/goldOnchain'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export async function GET() {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const contractAddress = getGoldContractAddress()
  if (!contractAddress) {
    return NextResponse.json(
      { error: 'Server missing GOLD_CONTRACT_ADDRESS (or NEXT_PUBLIC_GOLD_CONTRACT_ADDRESS)' },
      { status: 500 }
    )
  }

  const chainId = getGoldChainId()

  const treasuryAddress =
    (process.env.GOLD_TREASURY_ADDRESS || '').trim() ||
    (process.env.DOL_TREASURY_ADDRESS || '').trim() ||
    (process.env.NEXT_PUBLIC_DOL_TREASURY_ADDRESS || '').trim()

  if (!treasuryAddress) {
    return NextResponse.json(
      { error: 'Server missing GOLD_TREASURY_ADDRESS (or DOL_TREASURY_ADDRESS)' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    contractAddress,
    chainId,
    treasuryAddress,
    inventoryExpansionCostGold: 1000,
    inventoryExpansionSlots: 5,
  })
}
