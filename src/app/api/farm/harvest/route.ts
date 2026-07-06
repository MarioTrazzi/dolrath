import { NextResponse } from 'next/server'
import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { regenAndPersist } from '@/lib/staminaServer'
import { spendFarmActionStaminaTx } from '@/lib/farmServer'
import {
  getCropById, isCropReady, isPenReady, rollCropYield, PEN, PEN_SLOT_INDEX,
  farmStoneChance, rollFarmStoneShard, FARM_STONE_BONUS_XP, FARM_ACTION_STAMINA, FARM_HARVEST_STAMINA,
} from '@/lib/farming'
import { getProfessionLevel, getProfessionLevelInfo } from '@/lib/professionSystem'
import { addDropToInventoryTx } from '@/lib/dungeonRunServer'
import { addHistoryEntry } from '@/lib/characterHistory'

export const dynamic = 'force-dynamic'

// 🌾 Colhe um canteiro pronto (ou o ciclo do cercado, slotIndex 101).
// O servidor decide a quantidade e credita o farmXp; se o inventário não tem
// espaço para a pilha, a colheita FALHA inteira (nada é perdido — libere
// espaço e colha de novo).
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id

  try {
    const { characterId, slotIndex } = await req.json()
    const slot = Number(slotIndex)
    if (!characterId || !Number.isInteger(slot)) {
      return NextResponse.json({ error: 'characterId e slotIndex são obrigatórios' }, { status: 400 })
    }

    const rawCharacter = await prisma.character.findFirst({ where: { id: characterId, userId } })
    if (!rawCharacter) {
      return NextResponse.json({ error: 'Personagem não encontrado' }, { status: 404 })
    }
    const character = await regenAndPersist(rawCharacter)
    const farmLevel = getProfessionLevel(character.farmXp)

    const result = await prisma.$transaction(async (tx) => {
      const plot = await tx.farmPlot.findUnique({
        where: { characterId_slotIndex: { characterId, slotIndex: slot } },
      })
      if (!plot?.plantedAt) {
        throw new Error('Nada plantado aqui.')
      }

      let outputName: string
      let qty: number
      let farmXp: number

      if (slot === PEN_SLOT_INDEX) {
        if (!isPenReady(plot.plantedAt)) {
          throw new Error('Os animais ainda estão no ciclo. Volte mais tarde.')
        }
        outputName = PEN.outputName
        qty = PEN.yield
        farmXp = PEN.farmXp
      } else {
        const crop = plot.cropId ? getCropById(plot.cropId) : undefined
        if (!crop) {
          throw new Error('Cultivo inválido neste canteiro.')
        }
        if (!isCropReady(plot.plantedAt, crop, farmLevel)) {
          throw new Error('Este cultivo ainda está crescendo.')
        }
        outputName = crop.outputName
        qty = rollCropYield(crop)
        farmXp = crop.farmXp
      }

      const ok = await addDropToInventoryTx(tx, characterId, { name: outputName, qty })
      if (!ok) {
        throw new Error('Inventário cheio — libere um slot e colha de novo (nada foi perdido).')
      }

      // 💎 Canteiro v2: colheita de cultivo (não o cercado) tem chance rara de
      // render um Estilhaço de Pedra Negra junto — silenciosamente ignorado se
      // o inventário estiver cheio (o cultivo em si já foi entregue acima).
      let gotStone = false
      let stoneName: string | undefined
      if (slot !== PEN_SLOT_INDEX) {
        const chance = farmStoneChance(farmLevel)
        if (Math.random() * 100 < chance) {
          const candidate = rollFarmStoneShard()
          const stoneOk = await addDropToInventoryTx(tx, characterId, { name: candidate, qty: 1 })
          if (stoneOk) {
            gotStone = true
            stoneName = candidate
            farmXp += FARM_STONE_BONUS_XP
          }
        }
      }

      const staminaCost = slot === PEN_SLOT_INDEX ? FARM_ACTION_STAMINA : FARM_HARVEST_STAMINA
      const stamina = await spendFarmActionStaminaTx(tx, characterId, staminaCost)

      const updated = await tx.character.update({
        where: { id: characterId },
        data: { farmXp: { increment: farmXp } },
        select: { farmXp: true },
      })
      await tx.farmPlot.update({
        where: { id: plot.id },
        data: { cropId: null, plantedAt: null, state: 'empty' },
      })

      return { outputName, qty, farmXp, totalFarmXp: updated.farmXp, stamina, gotStone, stoneName }
    })

    addHistoryEntry({
      characterId,
      activityType: 'ITEM_GAINED',
      description: result.gotStone
        ? `🌾 Colheu ${result.qty}× ${result.outputName} + 💎 ${result.stoneName} (+${result.farmXp} XP de Fazenda).`
        : `🌾 Colheu ${result.qty}× ${result.outputName} (+${result.farmXp} XP de Fazenda).`,
    }).catch(() => {})

    return NextResponse.json({
      slotIndex: slot,
      outputName: result.outputName,
      qty: result.qty,
      xpGained: result.farmXp,
      farm: getProfessionLevelInfo(result.totalFarmXp),
      stamina: result.stamina,
      gotStone: result.gotStone,
      stoneName: result.stoneName,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro interno do servidor'
    const isValidation = /insuficiente|Nada plantado|crescendo|ciclo|cheio|inválido/i.test(message)
    if (!isValidation) console.error('Error harvesting:', error)
    return NextResponse.json({ error: message }, { status: isValidation ? 400 : 500 })
  }
}
