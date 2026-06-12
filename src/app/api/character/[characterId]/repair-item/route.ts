import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { addHistoryEntry } from '@/lib/characterHistory'
import { REPAIR_PER_DUPLICATE, getDisplayName } from '@/lib/enhancementSystem'

// Repara a durabilidade de um item consumindo uma cópia base dele (estilo BDO)
export async function POST(
  request: NextRequest,
  { params }: { params: { characterId: string } }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { inventoryId } = await request.json()
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

    if (inventoryItem.durability >= inventoryItem.maxDurability) {
      return NextResponse.json({ error: 'O item já está com durabilidade máxima' }, { status: 400 })
    }

    // Procurar uma cópia base (nível 0) do mesmo item para consumir
    const duplicate = await prisma.characterInventory.findFirst({
      where: {
        characterId: params.characterId,
        itemId: inventoryItem.itemId,
        enhancementLevel: 0,
        quantity: { gte: 1 },
        id: { not: inventoryItem.id },
      },
    })
    if (!duplicate) {
      return NextResponse.json(
        { error: `É necessária uma cópia de ${inventoryItem.item.name} para reparar.` },
        { status: 400 }
      )
    }

    const newDurability = Math.min(
      inventoryItem.maxDurability,
      inventoryItem.durability + REPAIR_PER_DUPLICATE
    )

    await prisma.$transaction(async (tx) => {
      if (duplicate.quantity > 1) {
        await tx.characterInventory.update({
          where: { id: duplicate.id },
          data: { quantity: { decrement: 1 } },
        })
      } else {
        await tx.characterInventory.delete({ where: { id: duplicate.id } })
      }
      await tx.characterInventory.update({
        where: { id: inventoryItem.id },
        data: { durability: newDurability },
      })
    })

    try {
      await addHistoryEntry({
        characterId: params.characterId,
        activityType: 'ITEM_REPAIRED',
        description: `🔧 ${getDisplayName(inventoryItem.item.name, inventoryItem.enhancementLevel)} reparado (+${newDurability - inventoryItem.durability} durabilidade).`,
        itemId: inventoryItem.itemId,
      })
    } catch (historyError) {
      console.error('Erro ao registrar histórico de reparo:', historyError)
    }

    return NextResponse.json({
      success: true,
      durability: newDurability,
      maxDurability: inventoryItem.maxDurability,
      message: `🔧 Item reparado! Durabilidade: ${newDurability}/${inventoryItem.maxDurability}`,
    })
  } catch (error) {
    console.error('Error repairing item:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
