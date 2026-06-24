import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { getCharacterNftContractAddress } from '@/lib/characterNftOnchain'
import { verifyCharacterPurchasedTx } from '@/lib/characterMarketVerify'
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

    const evt = await verifyCharacterPurchasedTx({
      txHash,
      expectedBuyer: walletAddress,
      expectedListingId,
    })

    const characterNftContract = getCharacterNftContractAddress()
    if (!characterNftContract) {
      return NextResponse.json({ error: 'Missing CHARACTER_NFT_CONTRACT_ADDRESS' }, { status: 500 })
    }

    const character = await prisma.character.findFirst({
      where: { nftContract: characterNftContract, nftTokenId: evt.tokenId },
      include: { user: { select: { id: true, walletAddress: true } } },
    })

    if (!character) {
      return NextResponse.json(
        { error: 'Personagem (NFT) não encontrado no banco (tokenId/contract)' },
        { status: 404 }
      )
    }

    // O vendedor no evento precisa bater com o dono atual no banco.
    const dbSellerWallet = (character.user.walletAddress || '').toLowerCase()
    const evtSellerWallet = evt.seller.toLowerCase()
    if (dbSellerWallet && dbSellerWallet !== evtSellerWallet) {
      return NextResponse.json(
        { error: 'Vendedor no evento não bate com o dono atual no banco' },
        { status: 409 }
      )
    }

    // Já transferido (ex.: retry do confirm) — nada a fazer.
    if (character.userId === session.user.id) {
      return NextResponse.json(
        jsonSafe({
          ok: true,
          alreadyOwned: true,
          listing: { listingId: evt.listingId.toString(), tokenId: evt.tokenId.toString() },
          character: { id: character.id, name: character.name },
        })
      )
    }

    const sellerUserId = character.userId

    await prisma.$transaction(async (tx) => {
      // Rede de segurança: o personagem deve ser vendido VAZIO. Se sobrou
      // qualquer item (equipado ou no inventário), devolve ao inventário global
      // DO VENDEDOR antes de transferir a posse — o comprador recebe a NFT pura.
      const leftoverInv = await tx.characterInventory.findMany({ where: { characterId: character.id } })
      const leftoverEquip = await tx.characterEquipment.findMany({ where: { characterId: character.id } })

      const returns = new Map<string, number>()
      for (const row of leftoverInv) returns.set(row.itemId, (returns.get(row.itemId) || 0) + row.quantity)
      for (const row of leftoverEquip) returns.set(row.itemId, (returns.get(row.itemId) || 0) + 1)

      for (const [itemId, qty] of Array.from(returns.entries())) {
        await tx.userInventory.upsert({
          where: { userId_itemId: { userId: sellerUserId, itemId } },
          update: { quantity: { increment: qty } },
          create: { userId: sellerUserId, itemId, quantity: qty },
        })
      }

      if (leftoverInv.length > 0) {
        await tx.characterInventory.deleteMany({ where: { characterId: character.id } })
      }
      if (leftoverEquip.length > 0) {
        await tx.characterEquipment.deleteMany({ where: { characterId: character.id } })
      }

      // Transfere a posse do personagem para o comprador.
      await tx.character.update({
        where: { id: character.id },
        data: { userId: session.user!.id },
      })
    })

    return NextResponse.json(
      jsonSafe({
        ok: true,
        listing: {
          listingId: evt.listingId.toString(),
          tokenId: evt.tokenId.toString(),
          priceDol: evt.priceDol.toString(),
          seller: evt.seller,
          buyer: evt.buyer,
        },
        character: { id: character.id, name: character.name },
      })
    )
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to confirm character purchase'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
