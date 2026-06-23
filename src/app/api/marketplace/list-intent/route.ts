import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { Contract, parseUnits } from 'ethers'
import { computeItemKey, computePurchaseId, signItemMintRequest } from '@/lib/itemNftSigning'
import { buildItemNftTokenUri } from '@/lib/itemNftMetadata'
import { getGoldContractAddress, getGoldProvider } from '@/lib/goldOnchain'
import { getItemMarketChainId, getItemMarketContractAddress } from '@/lib/itemMarketOnchain'

export const dynamic = 'force-dynamic'

const ERC20_DECIMALS_ABI = ['function decimals() view returns (uint8)'] as const

// Identificador único de mint por LINHA de inventário (evita replay/duplo mint).
function lazyMintPaymentMarker(inventoryId: string): string {
  return `lazymint:${inventoryId}`
}

// 🪙 LAZY-MINT (passo 1/2): assina o voucher para cunhar como NFT um item GANHO
// (CharacterInventory, sem NFT). O cliente usa o voucher em itemNft.mintWithSig,
// depois aprova e cria a listagem no marketplace, e por fim chama list-confirm.
// A taxa do jogador é o GAS (mint + approve + createListing) — sem pagamento de
// GOLD ao tesouro. O item só "vira NFT" quando há motivo (vender).
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id

  try {
    const { inventoryId } = await req.json()
    if (!inventoryId) {
      return NextResponse.json({ error: 'inventoryId é obrigatório' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    const walletAddress = String((user as any).walletAddress || '').trim()
    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet required', requiresWallet: true }, { status: 403 })
    }

    // A linha precisa pertencer a um personagem do usuário.
    const inv = await prisma.characterInventory.findFirst({
      where: { id: inventoryId, character: { userId } },
      include: { item: true },
    })
    if (!inv) {
      return NextResponse.json({ error: 'Item de inventário não encontrado' }, { status: 404 })
    }
    if (inv.item.type === 'CONSUMABLE') {
      return NextResponse.json({ error: 'Consumíveis não podem ser listados como NFT.' }, { status: 400 })
    }

    // Trava temporária: impede vender/relistar a mesma peça enquanto um mint
    // está em andamento (anti-duplicação). Expira sozinha após LOCK_MINUTES.
    const LOCK_MINUTES = 20
    const lockedAt = (inv as any).listingLockedAt as Date | null
    if (lockedAt && Date.now() - new Date(lockedAt).getTime() < LOCK_MINUTES * 60_000) {
      return NextResponse.json({ error: 'Esta peça já está em processo de listagem. Aguarde alguns minutos.' }, { status: 409 })
    }
    await prisma.characterInventory.update({ where: { id: inv.id }, data: { listingLockedAt: new Date() } })

    const goldContractAddress = getGoldContractAddress()
    if (!goldContractAddress) {
      return NextResponse.json({ error: 'Missing GOLD_CONTRACT_ADDRESS' }, { status: 500 })
    }
    const itemNftContractAddress = (process.env.ITEM_NFT_CONTRACT_ADDRESS || '').trim()
    if (!itemNftContractAddress) {
      return NextResponse.json({ error: 'Missing ITEM_NFT_CONTRACT_ADDRESS' }, { status: 500 })
    }
    const marketContractAddress = getItemMarketContractAddress()
    if (!marketContractAddress) {
      return NextResponse.json({ error: 'Missing ITEM_MARKET_CONTRACT_ADDRESS' }, { status: 500 })
    }

    // paidGold = valor de catálogo (provenance). É assinado pelo servidor.
    const provider = getGoldProvider()
    const gold = new Contract(goldContractAddress, ERC20_DECIMALS_ABI, provider)
    const decimals = Number(await gold.decimals())
    const paidGold = parseUnits(String(inv.item.goldPrice ?? 0), decimals)

    // purchaseId único por linha de inventário (anti-replay no contrato).
    const purchaseId = computePurchaseId({
      paymentTxHash: lazyMintPaymentMarker(inv.id),
      itemId: inv.itemId,
      to: walletAddress,
    })
    const itemKey = computeItemKey(inv.itemId)

    // tokenURI com o aprimoramento congelado nos atributos (+N fica visível).
    const { tokenURI } = buildItemNftTokenUri({
      item: {
        id: inv.item.id,
        name: inv.item.name,
        description: inv.item.description,
        image: (inv.item as any).image,
        type: inv.item.type,
        subtype: inv.item.subtype,
        level: inv.item.level,
        stats: { ...((inv.item.stats as any) || {}), enhancementLevel: inv.enhancementLevel },
      },
      paidGoldWei: paidGold.toString(),
    })

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 15 * 60)
    const signed = await signItemMintRequest({ to: walletAddress, purchaseId, itemKey, paidGold, tokenURI, deadline })

    return NextResponse.json({
      chainId: getItemMarketChainId(),
      itemNftContractAddress,
      marketContractAddress,
      goldContractAddress,
      inventoryId: inv.id,
      enhancementLevel: inv.enhancementLevel,
      item: { id: inv.item.id, name: inv.item.name, type: inv.item.type, goldPrice: inv.item.goldPrice },
      mint: {
        to: walletAddress,
        purchaseId,
        itemKey,
        paidGold: paidGold.toString(),
        tokenURI,
        deadline: deadline.toString(),
        signature: signed.signature,
      },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to create list intent'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
