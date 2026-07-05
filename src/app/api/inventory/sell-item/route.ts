import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { getDisplayName } from '@/lib/enhancementSystem'
import { sellUnitPrice } from '@/lib/sellPricing'
import { creditCappedSaleGoldTx } from '@/lib/dungeonRunServer'

// Vende um item do BAÚ GERAL (UserInventory) para o ferreiro. Espelha
// /api/character/[id]/sell-item: preço por TIPO (sellPricing) e o gold entra no
// MESMO teto diário da masmorra (balance de lançamento, P0). O crédito vai
// direto pro BANCO (User.goldBalance, claimável). Se o teto não cobre a venda
// inteira, aborta e o item fica com o jogador.
export async function POST(request: NextRequest) {
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

    const inventoryItem = await prisma.userInventory.findFirst({
      where: { id: inventoryId, userId: session.user.id },
      include: { item: true },
    })
    if (!inventoryItem) {
      return NextResponse.json({ error: 'Item não encontrado no Baú Geral' }, { status: 404 })
    }

    const qty = Math.max(1, Math.min(inventoryItem.quantity, requestedQty || 1))
    const unitPrice = sellUnitPrice(inventoryItem.item)
    const saleValue = unitPrice * qty
    const displayName = getDisplayName(inventoryItem.item.name, 0)

    const CAP_ERROR = 'DAILY_GOLD_CAP'
    let goldEarned = 0
    let bankGold = 0
    try {
      const updatedUser = await prisma.$transaction(async (tx) => {
        const credited = await creditCappedSaleGoldTx(tx, session.user!.id, { bank: true }, saleValue)
        if (saleValue > 0 && credited < saleValue) throw new Error(CAP_ERROR)
        goldEarned = credited

        if (inventoryItem.quantity > qty) {
          await tx.userInventory.update({
            where: { id: inventoryItem.id },
            data: { quantity: { decrement: qty } },
          })
        } else {
          await tx.userInventory.delete({ where: { id: inventoryItem.id } })
        }
        return tx.user.findUnique({ where: { id: session.user!.id }, select: { goldBalance: true } })
      })
      bankGold = Number(updatedUser?.goldBalance ?? 0)
    } catch (err) {
      if (err instanceof Error && err.message === CAP_ERROR) {
        return NextResponse.json(
          { error: 'Teto diário de gold atingido — o ferreiro não compra mais hoje. Volte amanhã.' },
          { status: 429 },
        )
      }
      throw err
    }

    return NextResponse.json({
      success: true,
      sold: qty,
      goldEarned,
      bankGold,
      message: `💰 Vendeu ${qty}x ${displayName} por ${goldEarned} gold!`,
    })
  } catch (error) {
    console.error('Error selling global item:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
