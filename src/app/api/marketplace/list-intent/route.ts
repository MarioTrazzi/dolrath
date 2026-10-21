import { auth } from '@/app/api/auth/[...nextauth]/route'
import { rateLimitAllow, rateLimited429 } from '@/lib/rateLimit'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { Contract, parseUnits } from 'ethers'
import { computeItemKey, computePurchaseId, signItemMintRequest } from '@/lib/itemNftSigning'
import { getGoldContractAddress, getGoldProvider } from '@/lib/goldOnchain'
import { getItemMarketChainId, getItemMarketContractAddress } from '@/lib/itemMarketOnchain'
import { getT } from '@/lib/i18n/server'
import { randomUUID } from 'node:crypto'
import { isListingLocked, listingUnlockedWhere } from '@/lib/inventoryMutations'
import { LAZY_MINT_VOUCHER_MS, resolveListingLock } from '@/lib/listingLock'

export const dynamic = 'force-dynamic'

const ERC20_DECIMALS_ABI = ['function decimals() view returns (uint8)'] as const

// 🪙 LAZY-MINT (passo 1/2): assina o voucher para cunhar como NFT um item GANHO
// (CharacterInventory, sem NFT). O cliente usa o voucher em itemNft.mintWithSig,
// depois aprova e cria a listagem no marketplace, e por fim chama list-confirm.
// A taxa do jogador é o GAS (mint + approve + createListing) — sem pagamento de
// GOLD ao tesouro. O item só "vira NFT" quando há motivo (vender).
export async function POST(req: Request) {
  const t = getT()
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id

  // A resposta carrega uma assinatura EIP-712 do servidor — throttle por usuário.
  if (!rateLimitAllow(`marketplace-list-intent:${userId}`, { windowMs: 60_000, max: 10 })) {
    return rateLimited429()
  }

  try {
    const { inventoryId } = await req.json()
    if (!inventoryId) {
      return NextResponse.json({ error: t('inventoryId is required') }, { status: 400 })
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
      return NextResponse.json({ error: t('Inventory item not found') }, { status: 404 })
    }
    if (inv.item.type === 'CONSUMABLE') {
      return NextResponse.json({ error: t('Consumables cannot be listed as NFTs.') }, { status: 400 })
    }

    // Já travada por um voucher anterior? Pergunta ao contrato antes de decidir
    // (pode ter sido mintada e nunca confirmada, ou o voucher venceu sem uso).
    if (isListingLocked(inv)) {
      const state = await resolveListingLock(inv.id)
      if (state === 'pending') {
        return NextResponse.json({ error: t('This piece is already being listed. Wait a few minutes.') }, { status: 409 })
      }
      if (state === 'minted') {
        return NextResponse.json({ error: t('This piece was already minted as an NFT.') }, { status: 409 })
      }
    }

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

    // purchaseId ÚNICO POR VOUCHER (anti-replay no contrato). Era por linha +
    // carteira: a 2ª unidade de uma pilha nunca conseguia ser mintada (o
    // contrato recusava o id repetido) e trocar de carteira gerava um id novo
    // para a MESMA peça.
    const purchaseId = computePurchaseId({
      paymentTxHash: `lazymint:${inv.id}:${randomUUID()}`,
      itemId: inv.itemId,
      to: walletAddress,
    })
    const itemKey = computeItemKey(inv.itemId)

    // tokenURI VAZIO de propósito: o contrato cai em baseURI + tokenId e a
    // metadata é servida AO VIVO por /api/nft/item/metadata/<tokenId>, refletindo
    // imagem e aprimoramento atuais. Requer ITEM_NFT_BASE_URI setado no contrato.
    const tokenURI = ''

    // 🔒 Trava + voucher gravados de forma ATÔMICA (antes eram leitura e escrita
    // separadas: dois intents simultâneos saíam com dois vouchers). Enquanto o
    // purchaseId estiver na linha, ela não sai da mochila por nenhum caminho —
    // e a trava só cai quando o contrato disser o desfecho (listingLock.ts).
    const lockedAtMs = Date.now()
    const locked = await prisma.characterInventory.updateMany({
      where: { id: inv.id, ...listingUnlockedWhere(lockedAtMs) },
      data: { listingLockedAt: new Date(lockedAtMs), listingPurchaseId: purchaseId },
    })
    if (locked.count !== 1) {
      return NextResponse.json({ error: t('This piece is already being listed. Wait a few minutes.') }, { status: 409 })
    }

    const deadline = BigInt(Math.floor(lockedAtMs / 1000) + Math.floor(LAZY_MINT_VOUCHER_MS / 1000))
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
