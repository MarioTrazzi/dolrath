import { auth } from '@/app/api/auth/[...nextauth]/route'
import { NextResponse } from 'next/server'
import { getDolContract, getDolTokenAddress } from '@/lib/dolOnchain'
import { getCharacterMarketChainId, getCharacterMarketContractAddress, getCharacterMarketFees } from '@/lib/characterMarketOnchain'
import { getCharacterNftContractAddress } from '@/lib/characterNftOnchain'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const marketContractAddress = getCharacterMarketContractAddress()
  const dolTokenAddress = getDolTokenAddress()
  const characterNftContractAddress = getCharacterNftContractAddress()

  if (!marketContractAddress) {
    return NextResponse.json({ error: 'Missing CHARACTER_MARKET_CONTRACT_ADDRESS' }, { status: 500 })
  }
  if (!dolTokenAddress) {
    return NextResponse.json({ error: 'Missing DOL_TOKEN_ADDRESS' }, { status: 500 })
  }
  if (!characterNftContractAddress) {
    return NextResponse.json({ error: 'Missing CHARACTER_NFT_CONTRACT_ADDRESS' }, { status: 500 })
  }

  let chainId: number
  try {
    chainId = getCharacterMarketChainId()
  } catch {
    return NextResponse.json({ error: 'Invalid CHARACTER_MARKET_CHAIN_ID' }, { status: 500 })
  }

  try {
    const dol = getDolContract()
    const [decimals, symbol, marketFee] = await Promise.all([dol.decimals(), dol.symbol(), getCharacterMarketFees()])

    return NextResponse.json({
      chainId,
      marketContractAddress,
      dolTokenAddress,
      characterNftContractAddress,
      dol: { decimals: Number(decimals), symbol: String(symbol) },
      marketFee,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to load character market config'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
