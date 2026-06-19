import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { addHistoryEntry } from '@/lib/characterHistory'
import { REPAIR_PER_DUPLICATE, getDisplayName } from '@/lib/enhancementSystem'

// Repara a durabilidade de um item consumindo cópias base dele (estilo BDO).
// mode 'single' (padrão): consome 1 cópia (+REPAIR_PER_DUPLICATE de durabilidade).
// mode 'full': consome o máximo de cópias necessárias/disponíveis para reparar 100%.
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
    const mode: 'single' | 'full' = body?.mode === 'full' ? 'full' : 'single'
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

    // Procurar cópias base (nível 0) do mesmo item para consumir.
    const duplicates = await prisma.characterInventory.findMany({
      where: {
        characterId: params.characterId,
        itemId: inventoryItem.itemId,
        enhancementLevel: 0,
        quantity: { gte: 1 },
        id: { not: inventoryItem.id },
      },
      orderBy: { quantity: 'asc' },
    })

    const totalCopies = duplicates.reduce((sum, d) => sum + d.quantity, 0)
    if (totalCopies < 1) {
      return NextResponse.json(
        { error: `É necessária uma cópia de ${inventoryItem.item.name} para reparar.` },
        { status: 400 }
      )
    }

    // Quantas cópias gastar.
    const missing = inventoryItem.maxDurability - inventoryItem.durability
    const copiesNeeded = Math.ceil(missing / REPAIR_PER_DUPLICATE)
    const copiesToUse =
      mode === 'full' ? Math.min(copiesNeeded, totalCopies) : 1

    const newDurability = Math.min(
      inventoryItem.maxDurability,
      inventoryItem.durability + copiesToUse * REPAIR_PER_DUPLICATE
    )
    const gained = newDurability - inventoryItem.durability

    await prisma.$transaction(async (tx) => {
      // Consome `copiesToUse` cópias percorrendo os stacks disponíveis.
      let remaining = copiesToUse
      for (const dup of duplicates) {
        if (remaining <= 0) break
        const take = Math.min(dup.quantity, remaining)
        if (dup.quantity > take) {
          await tx.characterInventory.update({
            where: { id: dup.id },
            data: { quantity: { decrement: take } },
          })
        } else {
          await tx.characterInventory.delete({ where: { id: dup.id } })
        }
        remaining -= take
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
        description: `🔧 ${getDisplayName(inventoryItem.item.name, inventoryItem.enhancementLevel)} reparado (+${gained} durabilidade, ${copiesToUse} cópia${copiesToUse > 1 ? 's' : ''}).`,
        itemId: inventoryItem.itemId,
      })
    } catch (historyError) {
      console.error('Erro ao registrar histórico de reparo:', historyError)
    }

    return NextResponse.json({
      success: true,
      durability: newDurability,
      maxDurability: inventoryItem.maxDurability,
      copiesUsed: copiesToUse,
      copiesRemaining: totalCopies - copiesToUse,
      fullyRepaired: newDurability >= inventoryItem.maxDurability,
      message: `🔧 Item reparado! Durabilidade: ${newDurability}/${inventoryItem.maxDurability} (${copiesToUse} cópia${copiesToUse > 1 ? 's' : ''} usada${copiesToUse > 1 ? 's' : ''})`,
    })
  } catch (error) {
    console.error('Error repairing item:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
