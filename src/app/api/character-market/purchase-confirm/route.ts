import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { getCharacterNftContractAddress } from '@/lib/characterNftOnchain'
import { getCharacterNftOwner } from '@/lib/characterMarketOnchain'
import { verifyCharacterPurchasedTx } from '@/lib/characterMarketVerify'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function isHex32Bytes(txHash: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(txHash)
}

function jsonSafe<T>(value: T): any {
  return JSON.parse(JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v)))
}

function readString(body: any, key: string): string {
  return (typeof body?.[key] === 'string' ? body[key] : '').trim()
}

/**
 * Registra off-chain a posse de um personagem cuja NFT já é do usuário na chain.
 *
 * A AUTORIDADE é o `ownerOf` on-chain, não a transação. O evento
 * `ListingPurchased` prova apenas que uma compra aconteceu um dia — quem já
 * revendeu o personagem continua conseguindo apresentar aquela tx antiga. Antes
 * deste cheque, um comprador que revendesse o personagem de volta ao vendedor
 * ORIGINAL podia reenviar a tx da própria compra e retomar a posse de graça
 * (o cheque vendedor-do-evento == dono-no-banco passava). Agora a tx é só
 * proveniência/auditoria; quem manda é quem detém a NFT.
 *
 * Por isso `txHash` é OPCIONAL: com apenas `tokenId` a rota funciona como
 * resgate — comprador cuja confirmação falhou (ou que recebeu a NFT por fora,
 * numa OpenSea da vida) reivindica a posse a qualquer momento.
 */
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const buyerUserId = session.user.id

  try {
    const body = await req.json().catch(() => ({}))
    const txHash = readString(body, 'txHash')
    const listingIdStr = readString(body, 'listingId')
    const tokenIdStr = readString(body, 'tokenId')

    if (txHash && !isHex32Bytes(txHash)) {
      return NextResponse.json({ error: 'Invalid txHash' }, { status: 400 })
    }
    if (!txHash && !tokenIdStr) {
      return NextResponse.json({ error: 'Informe txHash ou tokenId' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { id: buyerUserId } })
    const walletAddress = (user?.walletAddress || '').trim()
    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet not linked' }, { status: 400 })
    }

    const characterNftContract = getCharacterNftContractAddress()
    if (!characterNftContract) {
      return NextResponse.json({ error: 'Missing CHARACTER_NFT_CONTRACT_ADDRESS' }, { status: 500 })
    }

    // Já processada: a mesma tx nunca transfere posse duas vezes.
    if (txHash) {
      const already = await prisma.characterSale.findUnique({ where: { txHash } })
      if (already) {
        const c = await prisma.character.findUnique({ where: { id: already.characterId } })
        return NextResponse.json(
          jsonSafe({
            ok: true,
            alreadyProcessed: true,
            listing: { listingId: already.listingId, tokenId: already.tokenId },
            character: c ? { id: c.id, name: c.name } : null,
          })
        )
      }
    }

    // Evento da compra (proveniência + preço). Opcional no modo resgate.
    let evt: Awaited<ReturnType<typeof verifyCharacterPurchasedTx>> | null = null
    if (txHash) {
      evt = await verifyCharacterPurchasedTx({
        txHash,
        expectedBuyer: walletAddress,
        expectedListingId: listingIdStr ? BigInt(listingIdStr) : undefined,
      })
    }

    let tokenId: bigint
    try {
      tokenId = evt ? evt.tokenId : BigInt(tokenIdStr)
    } catch {
      return NextResponse.json({ error: 'tokenId inválido' }, { status: 400 })
    }

    // 🔒 Autoridade: quem detém a NFT AGORA é o dono. Bloqueia replay de tx
    // antiga (o requisitante já não é o dono) e compra por fora do mercado.
    let onchainOwner: string
    try {
      onchainOwner = await getCharacterNftOwner(tokenId)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Falha ao ler o dono on-chain'
      return NextResponse.json({ error: `Não foi possível confirmar a posse on-chain: ${message}` }, { status: 502 })
    }

    if (onchainOwner.toLowerCase() !== walletAddress.toLowerCase()) {
      return NextResponse.json(
        {
          error:
            'Sua carteira não detém esta NFT de personagem na chain. Se a compra acabou de ser feita, aguarde a confirmação e tente de novo.',
          onchainOwner,
        },
        { status: 409 }
      )
    }

    const character = await prisma.character.findFirst({
      where: {
        nftContract: { equals: characterNftContract, mode: 'insensitive' },
        nftTokenId: tokenId,
      },
      include: { user: { select: { id: true, walletAddress: true } } },
    })

    if (!character) {
      return NextResponse.json(
        { error: 'Personagem (NFT) não encontrado no banco (tokenId/contract)' },
        { status: 404 }
      )
    }

    // Já é meu — só garante que a marca de listagem saiu (o escrow acabou).
    if (character.userId === buyerUserId) {
      if (character.marketListingId != null) {
        await prisma.character.update({
          where: { id: character.id },
          data: { marketListingId: null, marketListedAt: null },
        })
      }
      return NextResponse.json(
        jsonSafe({
          ok: true,
          alreadyOwned: true,
          listing: evt ? { listingId: evt.listingId.toString(), tokenId: tokenId.toString() } : { tokenId: tokenId.toString() },
          character: { id: character.id, name: character.name },
        })
      )
    }

    const sellerUserId = character.userId
    const goldReturned = Math.max(0, character.gold)

    const result = await prisma.$transaction(async (tx) => {
      // Rede de segurança: o personagem é vendido VAZIO. Qualquer item que
      // tenha sobrado (equipado ou no inventário) volta ao inventário global DO
      // VENDEDOR — o comprador recebe a NFT pura.
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

      // Mesma regra para o OURO do bolso: a NFT é só nível/atributos. Sem isto o
      // gold do personagem viajava junto e virava lavagem de ouro entre contas.
      // Vai para o banco do vendedor (User.goldBalance), o mesmo destino da
      // venda de itens.
      if (goldReturned > 0) {
        await tx.user.update({
          where: { id: sellerUserId },
          data: { goldBalance: { increment: goldReturned } },
        })
      }

      // Atividade em andamento pertence ao VENDEDOR — não pode seguir viva sob
      // o novo dono. (list-check já barra listar com run/coleta aberta; isto é
      // a rede de segurança para quem abriu depois de listar.)
      await tx.dungeonRun.updateMany({
        where: { characterId: character.id, status: 'active' },
        data: { status: 'abandoned' },
      })
      await tx.gatheringSession.updateMany({
        where: { characterId: character.id, status: 'active' },
        data: { status: 'collected' },
      })

      const updated = await tx.character.update({
        where: { id: character.id },
        data: {
          userId: buyerUserId,
          gold: 0,
          marketListingId: null,
          marketListedAt: null,
        },
      })

      // Dedup + auditoria. O `txHash` é único: uma corrida entre duas
      // confirmações da mesma compra derruba a segunda aqui, dentro da tx.
      if (txHash && evt) {
        await tx.characterSale.create({
          data: {
            txHash,
            listingId: evt.listingId.toString(),
            tokenId: tokenId.toString(),
            characterId: character.id,
            sellerUserId,
            buyerUserId,
            priceDol: evt.priceDol.toString(),
            goldReturned,
          },
        })
      }

      return updated
    })

    return NextResponse.json(
      jsonSafe({
        ok: true,
        listing: evt
          ? {
              listingId: evt.listingId.toString(),
              tokenId: tokenId.toString(),
              priceDol: evt.priceDol.toString(),
              seller: evt.seller,
              buyer: evt.buyer,
            }
          : { tokenId: tokenId.toString(), claimedFromChain: true },
        goldReturnedToSeller: goldReturned,
        character: { id: result.id, name: result.name },
      })
    )
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to confirm character purchase'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
