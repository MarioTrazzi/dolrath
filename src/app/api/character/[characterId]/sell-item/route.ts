import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { addHistoryEntry } from '@/lib/characterHistory'
import { getDisplayName } from '@/lib/enhancementSystem'
import { sellUnitPrice } from '@/lib/sellPricing'
import { creditCappedSaleGoldTx } from '@/lib/dungeonRunServer'

// Vende um item do inventário do personagem para o ferreiro. Preço por TIPO
// (sellPricing: consumível 25%, insumo/equipamento 50%) e o gold creditado entra
// no MESMO teto diário da masmorra (balance de lançamento, P0 — antes a venda
// era um faucet sem teto). Serve também como "burn" de itens indesejados.
export async function POST(
  request: NextRequest,
  { params }: { params: { characterId: string } }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const inventoryId: string | undefined = body?.inventoryId
    const requestedQty = Math.floor(Number(body?.quantity ?? 1))
    if (!inventoryId) {
      return NextResponse.json({ error: 'inventoryId é obrigatório' }, { status: 400 })
    }

    const character = await prisma.character.findFirst({
      where: { id: params.characterId, userId: session.user.id },
    })
    if (!character) {
      return NextResponse.json({ error: 'Personagem não encontrado' }, { status: 404 })
    }

    const inventoryItem = await prisma.characterInventory.findFirst({
      where: { id: inventoryId, characterId: params.characterId },
      include: { item: true },
    })
    if (!inventoryItem) {
      return NextResponse.json({ error: 'Item não encontrado no inventário' }, { status: 404 })
    }

    // Anti-duplicação: peça travada por um lazy-mint em andamento não pode ser
    // vendida ao ferreiro (senão o jogador ganharia gold E a NFT). A trava expira só.
    const lockedAt = (inventoryItem as any).listingLockedAt as Date | null
    if (lockedAt && Date.now() - new Date(lockedAt).getTime() < 20 * 60_000) {
      return NextResponse.json({ error: 'Esta peça está sendo listada no mercado. Aguarde alguns minutos.' }, { status: 409 })
    }

    const qty = Math.max(1, Math.min(inventoryItem.quantity, requestedQty || 1))
    const unitPrice = sellUnitPrice(inventoryItem.item, inventoryItem.durability, inventoryItem.maxDurability)
    const saleValue = unitPrice * qty
    const displayName = getDisplayName(inventoryItem.item.name, inventoryItem.enhancementLevel)

    // O gold da venda vai pra CARTEIRA DO PERSONAGEM (Character.gold) e entra no
    // teto diário compartilhado com a masmorra. Se o teto não cobre a venda
    // INTEIRA, a transação é abortada e o item FICA com o jogador (nada de
    // queimar item por gold parcial). [[bank — Opção B]]
    const CAP_ERROR = 'DAILY_GOLD_CAP'
    let goldEarned = 0
    let updatedChar: { gold: number } | null = null
    try {
      const result = await prisma.$transaction(async (tx) => {
        const credited = await creditCappedSaleGoldTx(
          tx,
          session.user!.id,
          { characterId: params.characterId },
          saleValue,
        )
        if (saleValue > 0 && credited < saleValue) throw new Error(CAP_ERROR)

        if (inventoryItem.quantity > qty) {
          await tx.characterInventory.update({
            where: { id: inventoryItem.id },
            data: { quantity: { decrement: qty } },
          })
        } else {
          await tx.characterInventory.delete({ where: { id: inventoryItem.id } })
        }
        const c = await tx.character.findUnique({ where: { id: params.characterId }, select: { gold: true } })
        return { credited, c }
      })
      goldEarned = result.credited
      updatedChar = result.c
    } catch (err) {
      if (err instanceof Error && err.message === CAP_ERROR) {
        return NextResponse.json(
          { error: 'Teto diário de gold atingido — o ferreiro não compra mais hoje. Volte amanhã.' },
          { status: 429 },
        )
      }
      throw err
    }

    try {
      await addHistoryEntry({
        characterId: params.characterId,
        activityType: 'ITEM_SOLD',
        description: `💰 Vendeu ${qty}x ${displayName} ao ferreiro por ${goldEarned} gold.`,
        itemId: inventoryItem.itemId,
        goldAmount: goldEarned,
      })
    } catch (historyError) {
      console.error('Erro ao registrar histórico de venda:', historyError)
    }

    return NextResponse.json({
      success: true,
      sold: qty,
      goldEarned,
      characterGold: updatedChar?.gold ?? null,
      message: `💰 Vendeu ${qty}x ${displayName} por ${goldEarned} gold!`,
    })
  } catch (error) {
    console.error('Error selling item:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
