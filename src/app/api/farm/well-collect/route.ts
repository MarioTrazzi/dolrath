import { NextResponse } from 'next/server'
import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { regenAndPersist } from '@/lib/staminaServer'
import { spendFarmActionStaminaTx } from '@/lib/farmServer'
import { wellPending, WELL, WELL_SLOT_INDEX } from '@/lib/farming'
import { getProfessionLevelInfo } from '@/lib/professionSystem'
import { addDropToInventoryTx } from '@/lib/dungeonRunServer'

export const dynamic = 'force-dynamic'

// 💧 Coleta a Água Pura acumulada no poço (goteja 1 a cada 30 min, teto 12).
// Coletar reancora o relógio do poço em agora — o excedente acima do teto
// simplesmente não existe (o poço "transborda").
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

    const result = await prisma.$transaction(async (tx) => {
      const well = await tx.farmPlot.findUnique({
        where: { characterId_slotIndex: { characterId, slotIndex: WELL_SLOT_INDEX } },
      })
      const now = new Date()
      const pending = wellPending(well?.plantedAt ?? null, now)
      if (!well || pending <= 0) {
        throw new Error('O poço ainda não acumulou água.')
      }

      const ok = await addDropToInventoryTx(tx, characterId, { name: WELL.outputName, qty: pending })
      if (!ok) {
        throw new Error('Inventário cheio — libere um slot e colete de novo.')
      }

      const stamina = await spendFarmActionStaminaTx(tx, characterId)
      const updated = await tx.character.update({
        where: { id: characterId },
        data: { farmXp: { increment: WELL.farmXpPerCollect } },
        select: { farmXp: true },
      })
      await tx.farmPlot.update({ where: { id: well.id }, data: { plantedAt: now } })

      return { qty: pending, totalFarmXp: updated.farmXp, stamina }
    })

    return NextResponse.json({
      outputName: WELL.outputName,
      qty: result.qty,
      xpGained: WELL.farmXpPerCollect,
      farm: getProfessionLevelInfo(result.totalFarmXp),
      stamina: result.stamina,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro interno do servidor'
    const isValidation = /insuficiente|não acumulou|cheio/i.test(message)
    if (!isValidation) console.error('Error collecting well:', error)
    return NextResponse.json({ error: message }, { status: isValidation ? 400 : 500 })
  }
}
