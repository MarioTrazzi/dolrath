import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { buildItemNftMetadata } from '@/lib/itemNftMetadata'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function toBigIntTokenId(raw: string): bigint | null {
  const s = String(raw || '').trim()
  if (!s) return null
  if (!/^\d+$/.test(s)) return null
  try {
    return BigInt(s)
  } catch {
    return null
  }
}

export async function GET(
  _req: Request,
  { params }: { params: { tokenId: string } }
) {
  const tokenId = toBigIntTokenId(params.tokenId)
  if (tokenId == null) {
    return NextResponse.json({ error: 'Invalid tokenId' }, { status: 400 })
  }

  const chainIdRaw = (process.env.ITEM_NFT_CHAIN_ID || '80002').trim()
  const chainId = Number(chainIdRaw)
  if (!Number.isFinite(chainId) || chainId <= 0) {
    return NextResponse.json({ error: 'Invalid ITEM_NFT_CHAIN_ID' }, { status: 500 })
  }

  const contract = (process.env.ITEM_NFT_CONTRACT_ADDRESS || '').trim()
  if (!contract) {
    return NextResponse.json({ error: 'Missing ITEM_NFT_CONTRACT_ADDRESS' }, { status: 500 })
  }

  const nft = await (prisma as any).itemNft.findFirst({
    where: {
      chainId,
      tokenId,
      contract: { equals: contract, mode: 'insensitive' },
    },
    select: {
      tokenId: true,
      paidGoldWei: true,
      item: {
        select: {
          id: true,
          name: true,
          description: true,
          image: true,
          type: true,
          subtype: true,
          level: true,
          stats: true,
        },
      },
    },
  })

  if (!nft || !nft.item) {
    return NextResponse.json({ error: 'Item NFT not found' }, { status: 404 })
  }

  const { metadata } = buildItemNftMetadata({
    tokenId: nft.tokenId as bigint,
    item: nft.item,
    paidGoldWei: typeof nft.paidGoldWei === 'string' ? nft.paidGoldWei : null,
  })

  return NextResponse.json(metadata, {
    headers: {
      // Avoid CORS surprises with wallets/marketplaces.
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store, max-age=0',
    },
  })
}
