import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import {
  getItemMarketChainId,
  getItemNftContractAddressForMarket,
  getItemNftOwner,
} from '@/lib/itemMarketOnchain'
import { verifyListingPurchasedTx } from '@/lib/itemMarketVerify'
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
 * Registra off-chain a posse de um item NFT que já é do usuário na chain.
 *
 * A AUTORIDADE é o `ownerOf` on-chain, não a transação — mesmo modelo do
 * mercado de personagens. O evento `ListingPurchased` só prova que uma compra
 * aconteceu um dia; quem já revendeu o item continua conseguindo apresentar a
 * tx antiga, e o cheque "vendedor do evento == dono no banco" volta a passar se
 * o item tiver voltado para o vendedor original. Agora a tx é proveniência.
 *
 * `txHash` é OPCIONAL: com apenas `tokenId` a rota vira resgate — comprador
 * cuja confirmação falhou (ou que recebeu a NFT por fora) reivindica a posse.
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

    const chainId = getItemMarketChainId()
    const itemNftContract = getItemNftContractAddressForMarket()
    if (!itemNftContract) {
      return NextResponse.json({ error: 'Missing ITEM_NFT_CONTRACT_ADDRESS' }, { status: 500 })
    }

    // Já processada: a mesma tx nunca transfere posse duas vezes.
    if (txHash) {
      const already = await prisma.itemSale.findUnique({ where: { txHash } })
      if (already) {
        const nft = await prisma.itemNft.findUnique({
          where: { id: already.itemNftId },
          include: { item: true },
        })
        return NextResponse.json(
          jsonSafe({
            ok: true,
            alreadyProcessed: true,
            listing: { listingId: already.listingId, tokenId: already.tokenId },
            item: nft ? { id: nft.item.id, name: nft.item.name } : null,
          })
        )
      }
    }

    // Evento da compra (proveniência + preço). Opcional no modo resgate.
    let evt: Awaited<ReturnType<typeof verifyListingPurchasedTx>> | null = null
    if (txHash) {
      evt = await verifyListingPurchasedTx({
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

    // 🔒 Autoridade: quem detém a NFT AGORA é o dono.
    let onchainOwner: string
    try {
      onchainOwner = await getItemNftOwner(tokenId)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Falha ao ler o dono on-chain'
      return NextResponse.json({ error: `Não foi possível confirmar a posse on-chain: ${message}` }, { status: 502 })
    }

    if (onchainOwner.toLowerCase() !== walletAddress.toLowerCase()) {
      return NextResponse.json(
        {
          error:
            'Sua carteira não detém esta NFT de item na chain. Se a compra acabou de ser feita, aguarde a confirmação e tente de novo.',
          onchainOwner,
        },
        { status: 409 }
      )
    }

    // insensitive: o endereço gravado no mint vem do env verbatim — se o env for
    // reescrito em checksum, a busca exata deixaria de casar e a compra ficaria
    // presa em "não encontrado no banco".
    const existing = await prisma.itemNft.findFirst({
      where: {
        chainId,
        contract: { equals: itemNftContract, mode: 'insensitive' },
        tokenId,
      },
      include: { user: { select: { id: true, walletAddress: true } }, item: true },
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Item NFT não encontrado no banco (tokenId/contract/chainId)' },
        { status: 404 }
      )
    }

    // Já é meu (retry do confirm) — nada a fazer.
    if (existing.userId === buyerUserId) {
      return NextResponse.json(
        jsonSafe({
          ok: true,
          alreadyOwned: true,
          listing: evt
            ? { listingId: evt.listingId.toString(), tokenId: tokenId.toString() }
            : { tokenId: tokenId.toString() },
          item: { id: existing.item.id, name: existing.item.name },
        })
      )
    }

    const sellerUserId = existing.userId

    await prisma.$transaction(async (tx) => {
      await tx.itemNft.update({
        where: { id: existing.id },
        data: { userId: buyerUserId },
      })

      // Dedup + auditoria. `txHash` é único: uma corrida entre duas confirmações
      // da mesma compra derruba a segunda aqui, dentro da transação.
      if (txHash && evt) {
        await tx.itemSale.create({
          data: {
            txHash,
            listingId: evt.listingId.toString(),
            tokenId: tokenId.toString(),
            itemNftId: existing.id,
            sellerUserId,
            buyerUserId,
            priceGold: evt.priceGold.toString(),
          },
        })
      }
    })

    return NextResponse.json(
      jsonSafe({
        ok: true,
        listing: evt
          ? {
              listingId: evt.listingId.toString(),
              tokenId: tokenId.toString(),
              priceGold: evt.priceGold.toString(),
              seller: evt.seller,
              buyer: evt.buyer,
            }
          : { tokenId: tokenId.toString(), claimedFromChain: true },
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
