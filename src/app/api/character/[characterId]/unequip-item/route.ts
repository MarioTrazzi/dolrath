import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { recordEquipmentChange } from '@/lib/characterHistory'
import { restoreItemToInventory } from '@/lib/inventoryMutations'

export async function POST(
  request: NextRequest,
  { params }: { params: { characterId: string } }
) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { itemId, slot } = await request.json()

    if (!itemId && !slot) {
      return NextResponse.json({ error: 'Item ID or slot is required' }, { status: 400 })
    }

    // Garante que o personagem pertence ao usuário.
    const character = await prisma.character.findFirst({
      where: { id: params.characterId, userId: session.user.id },
    })

    if (!character) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 })
    }

    // Localiza o item equipado (por slot, se informado, senão por itemId).
    const equipment = await prisma.characterEquipment.findFirst({
      where: {
        characterId: params.characterId,
        ...(slot ? { slot } : {}),
        ...(itemId ? { itemId } : {}),
      },
      include: { item: true },
    })

    if (!equipment) {
      return NextResponse.json({ error: 'Item is not equipped' }, { status: 404 })
    }

    // Remove do equipamento e devolve ao inventário (mantendo o aprimoramento).
    await prisma.$transaction(async (tx) => {
      await tx.characterEquipment.delete({ where: { id: equipment.id } })
      await restoreItemToInventory(
        tx,
        params.characterId,
        equipment.itemId,
        equipment.enhancementLevel,
      )
    })

    try {
      await recordEquipmentChange(
        params.characterId,
        equipment.itemId,
        equipment.item.name,
        'unequipped',
      )
    } catch (historyError) {
      console.error('Erro ao registrar histórico:', historyError)
    }

    return NextResponse.json({ success: true, message: 'Item unequipped successfully' })
  } catch (error) {
    console.error('Error unequipping item:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
