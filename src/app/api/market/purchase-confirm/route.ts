import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { getItemMarketChainId } from '@/lib/itemMarketOnchain'
import { verifyListingPurchasedTx } from '@/lib/itemMarketVerify'
import { NextResponse } from 'next/server'

function isHex32Bytes(txHash: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(txHash)
}

function jsonSafe<T>(value: T): any {
  return JSON.parse(JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v)))
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const txHash = (typeof body?.txHash === 'string' ? body.txHash : '').trim()
    const listingIdStr = (typeof body?.listingId === 'string' ? body.listingId : '').trim()

    if (!txHash || !isHex32Bytes(txHash)) {
      return NextResponse.json({ error: 'Invalid txHash' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { id: session.user.id } })
    const walletAddress = (user?.walletAddress || '').trim()
    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet not linked' }, { status: 400 })
    }

    const expectedListingId = listingIdStr ? BigInt(listingIdStr) : undefined

    const evt = await verifyListingPurchasedTx({
      txHash,
      expectedBuyer: walletAddress,
      expectedListingId,
    })

    const chainId = getItemMarketChainId()
    const itemNftContract = (process.env.ITEM_NFT_CONTRACT_ADDRESS || '').trim()
    if (!itemNftContract) {
      return NextResponse.json({ error: 'Missing ITEM_NFT_CONTRACT_ADDRESS' }, { status: 500 })
    }

    const existing = await prisma.itemNft.findUnique({
      where: {
        chainId_contract_tokenId: {
          chainId,
          contract: itemNftContract,
          tokenId: evt.tokenId,
        },
      },
      include: { user: { select: { walletAddress: true } }, item: true },
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Item NFT não encontrado no banco (tokenId/contract/chainId)' },
        { status: 404 }
      )
    }

    const dbSellerWallet = (existing.user.walletAddress || '').toLowerCase()
    const evtSellerWallet = evt.seller.toLowerCase()
    if (dbSellerWallet && dbSellerWallet !== evtSellerWallet) {
      return NextResponse.json(
        { error: 'Seller no evento não bate com owner atual no banco' },
        { status: 409 }
      )
    }

    if (existing.userId !== session.user.id) {
      await prisma.itemNft.update({
        where: { id: existing.id },
        data: { userId: session.user.id },
      })
    }

    return NextResponse.json(
      jsonSafe({
        ok: true,
        listing: {
          listingId: evt.listingId.toString(),
          tokenId: evt.tokenId.toString(),
          priceGold: evt.priceGold.toString(),
          seller: evt.seller,
          buyer: evt.buyer,
        },
        item: {
          id: existing.item.id,
          name: existing.item.name,
        },
      })
    )
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to confirm purchase'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
