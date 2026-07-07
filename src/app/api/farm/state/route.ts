import { NextResponse } from 'next/server'
import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { regenAndPersist } from '@/lib/staminaServer'
import { getFarmState, getUserFarmXp } from '@/lib/farmServer'
import { freeInventorySlots } from '@/lib/inventoryMutations'

export const dynamic = 'force-dynamic'

// 🌾 Estado derivado da fazenda da CONTA (canteiros + poço + cercado, globais
// para todos os personagens). O characterId é o personagem ATIVO na página:
// dele vêm a stamina exibida, as sementes/ração e o aviso de inventário cheio.
// Tudo computado lazy dos timestamps — esta rota não muda nada além de criar
// o poço na primeira visita e aplicar o regen passivo de stamina.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id

  try {
    const { searchParams } = new URL(req.url)
    const characterId = searchParams.get('characterId')
    if (!characterId) {
      return NextResponse.json({ error: 'characterId é obrigatório' }, { status: 400 })
    }

    const rawCharacter = await prisma.character.findFirst({ where: { id: characterId, userId } })
    if (!rawCharacter) {
      return NextResponse.json({ error: 'Personagem não encontrado' }, { status: 404 })
    }
    const character = await regenAndPersist(rawCharacter)

    const farm = await getFarmState(userId, await getUserFarmXp(userId))

    // Sementes e Ração disponíveis (do personagem ativo), para a UI habilitar
    // plantio/alimentação.
    const inputs = await prisma.characterInventory.findMany({
      where: { characterId, item: { type: 'CONSUMABLE' } },
      include: { item: { select: { name: true, stats: true } } },
    })
    const counts: Record<string, number> = {}
    for (const row of inputs) {
      const kind = (row.item.stats as any)?.kind
      const isFeed = !!(row.item.stats as any)?.farmFeed
      if (kind === 'seed' || isFeed) {
        counts[row.item.name] = (counts[row.item.name] ?? 0) + row.quantity
      }
    }

    // Mesma mecânica da masmorra/coleta: bag cheia avisa que a próxima colheita
    // vai falhar (colher não gasta stamina sozinho — é ação manual — mas o aviso
    // evita o jogador plantar/tentar colher achando que vai perder o item).
    const { free } = await freeInventorySlots(prisma, characterId)

    return NextResponse.json({
      ...farm,
      inputCounts: counts,
      stamina: character.stamina,
      maxStamina: character.maxStamina,
      inventoryFull: free <= 0,
    })
  } catch (error) {
    console.error('Error loading farm state:', error)
    return NextResponse.json({ error: 'Failed to load farm state' }, { status: 500 })
  }
}
