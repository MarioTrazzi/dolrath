import { requireApiActor } from '@/lib/botFleetAuth'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { takeFromCharacterInventory, InventoryQuantityError } from '@/lib/inventoryMutations'
import { getTFromRequest } from '@/lib/i18n/server'

// Dá baixa em 1 consumível do inventário do personagem (sem alterar HP/MP/stamina
// no banco — o efeito é aplicado localmente na run da masmorra). Devolve os stats
// do item para o cliente aplicar o efeito.
export async function POST(
  req: NextRequest,
  context: { params: { characterId: string } }
) {
  const t = getTFromRequest(req)
  const { characterId } = context.params
  const resolved = await requireApiActor(req, characterId)
  if ('error' in resolved) return resolved.error
  const userId = resolved.actor.userId

  try {
    const { itemId } = await req.json()
    if (!itemId) {
      return NextResponse.json({ error: t('itemId is required') }, { status: 400 })
    }

    // Garante que o personagem pertence ao usuário.
    const character = await prisma.character.findFirst({
      where: { id: characterId, userId },
      select: { id: true },
    })
    if (!character) {
      return NextResponse.json({ error: t('Character not found') }, { status: 404 })
    }

    const inv = await prisma.characterInventory.findFirst({
      where: { characterId, itemId, quantity: { gt: 0 } },
      include: { item: true },
    })
    if (!inv) {
      return NextResponse.json({ error: t('You do not have this item') }, { status: 404 })
    }
    if (inv.item.type !== 'CONSUMABLE') {
      return NextResponse.json({ error: t('This item is not a consumable') }, { status: 400 })
    }

    // Atômico: dois toques rápidos na mesma poção não podem aplicar o efeito
    // duas vezes pagando uma unidade só.
    try {
      await prisma.$transaction((tx) => takeFromCharacterInventory(tx, inv.id, 1))
    } catch (err) {
      if (err instanceof InventoryQuantityError) {
        return NextResponse.json({ error: t('You do not have this item') }, { status: 409 })
      }
      throw err
    }

    return NextResponse.json({
      success: true,
      item: {
        id: inv.item.id,
        name: inv.item.name,
        subtype: inv.item.subtype,
        stats: inv.item.stats,
      },
      remaining: Math.max(0, inv.quantity - 1),
    })
  } catch (error) {
    console.error('Error using consumable:', error)
    return NextResponse.json({ error: t('Failed to use consumable') }, { status: 500 })
  }
}
