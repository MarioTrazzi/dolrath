import { NextResponse } from 'next/server'
import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { regenAndPersist } from '@/lib/staminaServer'
import { getFarmState } from '@/lib/farmServer'

export const dynamic = 'force-dynamic'

// 🌾 Estado derivado da fazenda do personagem (canteiros + poço + cercado).
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

    const farm = await getFarmState(characterId, character.farmXp)

    // Sementes e Ração disponíveis, para a UI habilitar plantio/alimentação.
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

    return NextResponse.json({
      ...farm,
      inputCounts: counts,
      stamina: character.stamina,
      maxStamina: character.maxStamina,
    })
  } catch (error) {
    console.error('Error loading farm state:', error)
    return NextResponse.json({ error: 'Failed to load farm state' }, { status: 500 })
  }
}
