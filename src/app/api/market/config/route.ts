import { auth } from '@/app/api/auth/[...nextauth]/route'
import { NextResponse } from 'next/server'
import { getGoldContract } from '@/lib/goldOnchain'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const marketContractAddress = (process.env.ITEM_MARKET_CONTRACT_ADDRESS || '').trim()
  const marketChainIdRaw = (process.env.ITEM_MARKET_CHAIN_ID || process.env.GOLD_CHAIN_ID || '80002').trim()
  const marketChainId = Number(marketChainIdRaw)
  if (!Number.isFinite(marketChainId) || marketChainId <= 0) {
    return NextResponse.json({ error: 'Invalid ITEM_MARKET_CHAIN_ID' }, { status: 500 })
  }

  const goldContractAddress =
    (process.env.GOLD_CONTRACT_ADDRESS || '').trim() ||
    (process.env.NEXT_PUBLIC_GOLD_CONTRACT_ADDRESS || '').trim()

  const itemNftContractAddress = (process.env.ITEM_NFT_CONTRACT_ADDRESS || '').trim()

  if (!marketContractAddress) {
    return NextResponse.json({ error: 'Missing ITEM_MARKET_CONTRACT_ADDRESS' }, { status: 500 })
  }
  if (!goldContractAddress) {
    return NextResponse.json({ error: 'Missing GOLD_CONTRACT_ADDRESS' }, { status: 500 })
  }
  if (!itemNftContractAddress) {
    return NextResponse.json({ error: 'Missing ITEM_NFT_CONTRACT_ADDRESS' }, { status: 500 })
  }

  try {
    const gold = getGoldContract()
    const [decimals, symbol] = await Promise.all([gold.decimals(), gold.symbol()])

    return NextResponse.json({
      chainId: marketChainId,
      marketContractAddress,
      goldContractAddress,
      gold: { decimals: Number(decimals), symbol: String(symbol) },
      itemNftContractAddress,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to load market config'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
