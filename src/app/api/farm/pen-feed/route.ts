import { NextResponse } from 'next/server'
import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { regenAndPersist } from '@/lib/staminaServer'
import { spendFarmActionStaminaTx } from '@/lib/farmServer'
import { PEN, PEN_SLOT_INDEX } from '@/lib/farming'
import { getUserFarmXp } from '@/lib/farmServer'
import { getProfessionLevel, FARM_PEN_MIN_LEVEL } from '@/lib/professionSystem'

export const dynamic = 'force-dynamic'

// 🐄 Alimenta o cercado com 1 Ração e inicia o ciclo de produção de Couro
// (colhe em /api/farm/harvest com slotIndex 101 quando o ciclo terminar).
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id

  try {
    const { characterId } = await req.json()
    if (!characterId) {
      return NextResponse.json({ error: 'characterId é obrigatório' }, { status: 400 })
    }

    const rawCharacter = await prisma.character.findFirst({ where: { id: characterId, userId } })
    if (!rawCharacter) {
      return NextResponse.json({ error: 'Personagem não encontrado' }, { status: 404 })
    }
    const character = await regenAndPersist(rawCharacter)

    // O cercado destrava pelo nível da fazenda da CONTA (soma do farmXp).
    if (getProfessionLevel(await getUserFarmXp(userId)) < FARM_PEN_MIN_LEVEL) {
      return NextResponse.json(
        { error: `O cercado destrava no nível ${FARM_PEN_MIN_LEVEL} de Fazenda.` },
        { status: 403 }
      )
    }

    const result = await prisma.$transaction(async (tx) => {
      const pen = await tx.farmPlot.findUnique({
        where: { userId_slotIndex: { userId, slotIndex: PEN_SLOT_INDEX } },
      })
      if (pen?.plantedAt) {
        throw new Error('O cercado já está num ciclo. Colha o couro quando terminar.')
      }

      // Consome 1 Ração (item de craft com stats.farmFeed).
      const rows = await tx.characterInventory.findMany({
        where: { characterId, item: { name: PEN.feedName, type: 'CONSUMABLE' } },
        include: { item: true },
        orderBy: { quantity: 'desc' },
      })
      const feedRow = rows.find((r) => !!(r.item.stats as any)?.farmFeed && r.quantity > 0)
      if (!feedRow) {
        throw new Error(`Você não tem ${PEN.feedName}. Crafte na Bancada de Alquimia (2 Trigo + 1 Água Pura).`)
      }
      if (feedRow.quantity > 1) {
        await tx.characterInventory.update({ where: { id: feedRow.id }, data: { quantity: { decrement: 1 } } })
      } else {
        await tx.characterInventory.delete({ where: { id: feedRow.id } })
      }

      const stamina = await spendFarmActionStaminaTx(tx, characterId)

      const now = new Date()
      const plot = pen
        ? await tx.farmPlot.update({ where: { id: pen.id }, data: { plantedAt: now, state: 'growing' } })
        : await tx.farmPlot.create({
            data: { userId, slotIndex: PEN_SLOT_INDEX, kind: 'pen', plantedAt: now, state: 'growing' },
          })
      return { plot, stamina }
    })

    return NextResponse.json({
      fedAt: result.plot.plantedAt,
      cycleSeconds: PEN.cycleSeconds,
      outputName: PEN.outputName,
      yield: PEN.yield,
      stamina: result.stamina,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro interno do servidor'
    const isValidation = /insuficiente|não tem|já está/i.test(message)
    if (!isValidation) console.error('Error feeding pen:', error)
    return NextResponse.json({ error: message }, { status: isValidation ? 400 : 500 })
  }
}
