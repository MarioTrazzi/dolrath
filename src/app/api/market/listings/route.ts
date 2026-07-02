import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { getGoldContract } from '@/lib/goldOnchain'
import { getItemMarketChainId, getItemMarketContract } from '@/lib/itemMarketOnchain'
import { resolveImageUrl } from '@/lib/imageUrl'
import { itemImagePath } from '@/lib/itemCatalog'
import { formatUnits } from 'ethers'
import { NextResponse } from 'next/server'

function jsonSafe<T>(value: T): any {
  return JSON.parse(JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v)))
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const market = getItemMarketContract()
    const gold = getGoldContract()
    const chainId = getItemMarketChainId()

    const [activeIds, goldDecimals, itemsAddress] = await Promise.all([
      market.getActiveListingIds() as Promise<bigint[]>,
      gold.decimals() as Promise<bigint>,
      market.items() as Promise<string>,
    ])

    const listingIds = (activeIds || []).slice(0, 200)
    if (listingIds.length === 0) {
      return NextResponse.json({ listings: [] })
    }

    const listingsRaw = await Promise.all(
      listingIds.map(async (listingId) => {
        const l: any = await market.listings(listingId)
        const seller = String(l.seller ?? l[0])
        const tokenId = (l.tokenId ?? l[1]) as bigint
        const priceGold = (l.priceGold ?? l[2]) as bigint
        const active = Boolean(l.active ?? l[3])
        return { listingId, seller, tokenId, priceGold, active }
      })
    )

    const activeListings = listingsRaw.filter((l) => l.active)
    const tokenIds = Array.from(new Set(activeListings.map((l) => l.tokenId)))

    const dbNfts = await prisma.itemNft.findMany({
      where: {
        chainId,
        contract: itemsAddress,
        tokenId: { in: tokenIds },
      },
      include: {
        item: true,
        user: { select: { id: true, walletAddress: true } },
      },
    })

    const byTokenId = new Map<string, (typeof dbNfts)[number]>()
    for (const row of dbNfts) byTokenId.set(row.tokenId.toString(), row)

    const decimalsNum = Number(goldDecimals)

    const listings = activeListings.map((l) => {
      const db = byTokenId.get(l.tokenId.toString())
      return {
        listingId: l.listingId.toString(),
        seller: l.seller,
        tokenId: l.tokenId.toString(),
        priceGold: {
          raw: l.priceGold.toString(),
          formatted: formatUnits(l.priceGold, decimalsNum),
        },
        item: db
          ? {
              id: db.item.id,
              name: db.item.name,
              type: db.item.type,
              level: db.item.level,
              goldPrice: db.item.goldPrice,
              image: resolveImageUrl(db.item.image) ?? (db.item.name ? itemImagePath(db.item.name) : null),
              enhancementLevel: db.enhancementLevel,
              mintSource: db.mintSource,
            }
          : null,
        dbOwner: db
          ? {
              userId: db.userId,
              walletAddress: db.user.walletAddress,
            }
          : null,
      }
    })

    return NextResponse.json(jsonSafe({ listings }))
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to load listings'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
