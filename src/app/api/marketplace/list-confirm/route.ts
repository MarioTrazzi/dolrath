import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { Contract, parseUnits } from 'ethers'
import { Prisma } from '@prisma/client'
import { computeItemKey, computePurchaseId } from '@/lib/itemNftSigning'
import { verifyItemMintTx } from '@/lib/itemNftVerify'
import { getGoldContractAddress, getGoldProvider } from '@/lib/goldOnchain'
import { getItemMarketChainId } from '@/lib/itemMarketOnchain'

export const dynamic = 'force-dynamic'

const ERC20_DECIMALS_ABI = ['function decimals() view returns (uint8)'] as const

function isHex32Bytes(txHash: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(txHash)
}
function lazyMintPaymentMarker(inventoryId: string): string {
  return `lazymint:${inventoryId}`
}

// 🪙 LAZY-MINT (passo 2/2): verifica o mint on-chain, QUEIMA a linha de
// CharacterInventory (o item deixa de existir off-chain) e registra o ItemNft.
// Garante o invariante: um item é DB OU NFT, nunca os dois (sem duplicação).
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id
  let mintTxHash = ''

  try {
    const body = await req.json()
    const inventoryId = String(body?.inventoryId || '').trim()
    mintTxHash = String(body?.mintTxHash || '').trim()
    if (!inventoryId) return NextResponse.json({ error: 'inventoryId é obrigatório' }, { status: 400 })
    if (!mintTxHash || !isHex32Bytes(mintTxHash)) {
      return NextResponse.json({ error: 'Invalid mintTxHash' }, { status: 400 })
    }

    const contract = (process.env.ITEM_NFT_CONTRACT_ADDRESS || '').trim()
    if (!contract) return NextResponse.json({ error: 'Missing ITEM_NFT_CONTRACT_ADDRESS' }, { status: 500 })
    const chainId = getItemMarketChainId()

    // Idempotência: se já registramos este mint, devolve sem reprocessar.
    const already = await prisma.itemNft.findUnique({ where: { mintTxHash } })
    if (already) {
      return NextResponse.json({ tokenId: already.tokenId.toString(), alreadySynced: true })
    }

    const user = await prisma.user.findUnique({ where: { id: userId } })
    const walletAddress = String((user as any)?.walletAddress || '').trim()
    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet required', requiresWallet: true }, { status: 403 })
    }

    const inv = await prisma.characterInventory.findFirst({
      where: { id: inventoryId, character: { userId } },
      include: { item: true },
    })
    if (!inv) {
      return NextResponse.json({ error: 'Item de inventário não encontrado (ou já cunhado)' }, { status: 404 })
    }

    const provider = getGoldProvider()
    const gold = new Contract(getGoldContractAddress(), ERC20_DECIMALS_ABI, provider)
    const decimals = Number(await gold.decimals())
    const expectedMinPaidGold = parseUnits(String(inv.item.goldPrice ?? 0), decimals)

    const purchaseId = computePurchaseId({
      paymentTxHash: lazyMintPaymentMarker(inv.id),
      itemId: inv.itemId,
      to: walletAddress,
    })
    const itemKey = computeItemKey(inv.itemId)

    const verified = await verifyItemMintTx({
      txHash: mintTxHash,
      expectedTo: walletAddress,
      expectedPurchaseId: purchaseId,
      expectedItemKey: itemKey,
      expectedMinPaidGold,
    })

    const result = await prisma.$transaction(async (tx) => {
      // Queima a linha off-chain (ou decrementa se empilhada).
      if (inv.quantity > 1) {
        await tx.characterInventory.update({ where: { id: inv.id }, data: { quantity: { decrement: 1 } } })
      } else {
        await tx.characterInventory.delete({ where: { id: inv.id } })
      }

      const nft = await tx.itemNft.create({
        data: {
          userId,
          itemId: inv.itemId,
          chainId,
          contract,
          tokenId: verified.tokenId,
          paidGoldWei: verified.paidGold.toString(),
          enhancementLevel: inv.enhancementLevel,
          mintSource: 'lazy',
          purchaseTxHash: lazyMintPaymentMarker(inv.id),
          mintTxHash,
        },
      })
      return nft
    })

    return NextResponse.json({
      tokenId: result.tokenId.toString(),
      enhancementLevel: result.enhancementLevel,
      paidGoldWei: result.paidGoldWei,
    })
  } catch (e) {
    // Retry concorrente: outro confirm já gravou o NFT (unique) — reconcilia.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const existing = mintTxHash ? await prisma.itemNft.findUnique({ where: { mintTxHash } }) : null
      if (existing) return NextResponse.json({ tokenId: existing.tokenId.toString(), alreadySynced: true })
    }
    const message = e instanceof Error ? e.message : 'Failed to confirm listing mint'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
