import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { addHistoryEntry } from '@/lib/characterHistory'
import { getDisplayName } from '@/lib/enhancementSystem'

// Vende um item do inventário do personagem para o ferreiro por METADE do preço
// base, creditando o GOLD off-chain (User.goldBalance, mesmo pote das recompensas).
// Serve também como "burn" de itens que o jogador não quer armazenar.
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

    const qty = Math.max(1, Math.min(inventoryItem.quantity, requestedQty || 1))
    const unitPrice = Math.max(0, Math.floor((inventoryItem.item.goldPrice ?? 0) / 2))
    const goldEarned = unitPrice * qty
    const displayName = getDisplayName(inventoryItem.item.name, inventoryItem.enhancementLevel)

    const updatedUser = await prisma.$transaction(async (tx) => {
      if (inventoryItem.quantity > qty) {
        await tx.characterInventory.update({
          where: { id: inventoryItem.id },
          data: { quantity: { decrement: qty } },
        })
      } else {
        await tx.characterInventory.delete({ where: { id: inventoryItem.id } })
      }

      if (goldEarned > 0) {
        return tx.user.update({
          where: { id: session.user.id },
          data: { goldBalance: { increment: goldEarned } },
          select: { goldBalance: true },
        })
      }
      return tx.user.findUnique({ where: { id: session.user.id }, select: { goldBalance: true } })
    })

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
      goldBalance: updatedUser?.goldBalance ?? null,
      message: `💰 Vendeu ${qty}x ${displayName} por ${goldEarned} gold!`,
    })
  } catch (error) {
    console.error('Error selling item:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
