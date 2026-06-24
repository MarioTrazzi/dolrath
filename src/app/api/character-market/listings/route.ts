import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { getDolContract } from '@/lib/dolOnchain'
import { getCharacterMarketChainId, getCharacterMarketContract } from '@/lib/characterMarketOnchain'
import { getCharacterNftContractAddress } from '@/lib/characterNftOnchain'
import { getLevelInfo } from '@/lib/experienceSystem'
import { resolveImageUrl } from '@/lib/imageUrl'
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
    const market = getCharacterMarketContract()
    const dol = getDolContract()
    const chainId = getCharacterMarketChainId()
    const characterNftContract = getCharacterNftContractAddress()

    const [activeIds, dolDecimals] = await Promise.all([
      market.getActiveListingIds() as Promise<bigint[]>,
      dol.decimals() as Promise<bigint>,
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
        const priceDol = (l.priceDol ?? l[2]) as bigint
        const active = Boolean(l.active ?? l[3])
        return { listingId, seller, tokenId, priceDol, active }
      })
    )

    const activeListings = listingsRaw.filter((l) => l.active)
    const tokenIds = Array.from(new Set(activeListings.map((l) => l.tokenId)))

    const dbCharacters = await prisma.character.findMany({
      where: {
        nftContract: characterNftContract,
        nftTokenId: { in: tokenIds },
      },
      include: { user: { select: { id: true, walletAddress: true } } },
    })

    const byTokenId = new Map<string, (typeof dbCharacters)[number]>()
    for (const c of dbCharacters) {
      if (c.nftTokenId != null) byTokenId.set(c.nftTokenId.toString(), c)
    }

    const decimalsNum = Number(dolDecimals)

    const listings = activeListings.map((l) => {
      const c = byTokenId.get(l.tokenId.toString())
      const levelInfo = c ? getLevelInfo(c.experience) : null
      return {
        listingId: l.listingId.toString(),
        seller: l.seller,
        tokenId: l.tokenId.toString(),
        priceDol: {
          raw: l.priceDol.toString(),
          formatted: formatUnits(l.priceDol, decimalsNum),
        },
        character: c
          ? {
              id: c.id,
              name: c.name,
              race: c.race,
              class: c.class,
              level: levelInfo ? levelInfo.level : c.level,
              avatar: resolveImageUrl(c.avatar) ?? c.avatar ?? null,
            }
          : null,
        dbOwner: c
          ? { userId: c.user.id, walletAddress: c.user.walletAddress }
          : null,
      }
    })

    return NextResponse.json(jsonSafe({ listings }))
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to load character listings'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
