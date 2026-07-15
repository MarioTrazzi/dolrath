import { requireApiActor } from '@/lib/botFleetAuth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

// Dá baixa em 1 consumível do inventário do personagem (sem alterar HP/MP/stamina
// no banco — o efeito é aplicado localmente na run da masmorra). Devolve os stats
// do item para o cliente aplicar o efeito.
export async function POST(
  req: Request,
  context: { params: { characterId: string } }
) {
  const { characterId } = context.params
  const resolved = await requireApiActor(req, characterId)
  if ('error' in resolved) return resolved.error
  const userId = resolved.actor.userId

  try {
    const { itemId } = await req.json()
    if (!itemId) {
      return NextResponse.json({ error: 'itemId é obrigatório' }, { status: 400 })
    }

    // Garante que o personagem pertence ao usuário.
    const character = await prisma.character.findFirst({
      where: { id: characterId, userId },
      select: { id: true },
    })
    if (!character) {
      return NextResponse.json({ error: 'Personagem não encontrado' }, { status: 404 })
    }

    const inv = await prisma.characterInventory.findFirst({
      where: { characterId, itemId, quantity: { gt: 0 } },
      include: { item: true },
    })
    if (!inv) {
      return NextResponse.json({ error: 'Você não possui este item' }, { status: 404 })
    }
    if (inv.item.type !== 'CONSUMABLE') {
      return NextResponse.json({ error: 'Este item não é consumível' }, { status: 400 })
    }

    if (inv.quantity > 1) {
      await prisma.characterInventory.update({
        where: { id: inv.id },
        data: { quantity: { decrement: 1 } },
      })
    } else {
      await prisma.characterInventory.delete({ where: { id: inv.id } })
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
    return NextResponse.json({ error: 'Falha ao usar consumível' }, { status: 500 })
  }
}
