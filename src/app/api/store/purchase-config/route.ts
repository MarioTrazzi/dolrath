import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const url = new URL(req.url)
    const itemId = (url.searchParams.get('itemId') || '').trim()

    if (!itemId) {
      return NextResponse.json({ error: 'itemId is required' }, { status: 400 })
    }

    const item = await prisma.item.findUnique({ where: { id: itemId } })
    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

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

    const goldContractAddress =
      (process.env.GOLD_CONTRACT_ADDRESS || '').trim() ||
      (process.env.NEXT_PUBLIC_GOLD_CONTRACT_ADDRESS || '').trim()

    const chainIdRaw =
      (process.env.GOLD_CHAIN_ID || '').trim() ||
      (process.env.NEXT_PUBLIC_GOLD_CHAIN_ID || '').trim() ||
      '80002'

    const chainId = Number(chainIdRaw)
    if (!Number.isFinite(chainId) || chainId <= 0) {
      return NextResponse.json({ error: 'Invalid GOLD_CHAIN_ID' }, { status: 500 })
    }

    const itemNftContractAddress = (process.env.ITEM_NFT_CONTRACT_ADDRESS || '').trim()

    if (!goldContractAddress) {
      return NextResponse.json({ error: 'Missing GOLD_CONTRACT_ADDRESS' }, { status: 500 })
    }

    if (!itemNftContractAddress) {
      return NextResponse.json({ error: 'Missing ITEM_NFT_CONTRACT_ADDRESS' }, { status: 500 })
    }

    return NextResponse.json({
      chainId,
      goldContractAddress,
      treasuryAddress,
      itemNftContractAddress,
      // Useful for setting ITEM_NFT_BASE_URI in production.
      // tokenURI becomes `${itemNftBaseUri}${tokenId}`.
      itemNftBaseUri: `${new URL(req.url).origin}/api/nft/item/metadata/`,
      item: {
        id: item.id,
        name: item.name,
        goldPrice: item.goldPrice,
      },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to load purchase config'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
