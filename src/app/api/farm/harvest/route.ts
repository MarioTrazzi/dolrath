import { NextResponse } from 'next/server'
import { requireApiActor } from '@/lib/botFleetAuth'
import { prisma } from '@/lib/prisma'
import { regenAndPersist } from '@/lib/staminaServer'
import { spendFarmActionStaminaTx, getUserFarmXp } from '@/lib/farmServer'
import {
  getCropById, isCropReady, isPenReady, rollCropYield, PEN, PEN_SLOT_INDEX,
  farmStoneChance, rollFarmStoneShard, FARM_STONE_BONUS_XP, FARM_ACTION_STAMINA, FARM_HARVEST_STAMINA,
} from '@/lib/farming'
import { getProfessionLevel, getProfessionLevelInfo } from '@/lib/professionSystem'
import { addDropToInventoryTx } from '@/lib/dungeonRunServer'
import { addHistoryEntry } from '@/lib/characterHistory'
import { advanceQuestProgress } from '@/lib/questServer'

export const dynamic = 'force-dynamic'

/** Um canteiro colhido: nome/qtd do cultivo + estilhaço raro se caiu. */
interface HarvestItemResult {
  outputName: string
  qty: number
  stoneName?: string
}

// 🌾 Colheita da fazenda da CONTA. Sem slotIndex (ou com slot de canteiro):
// colhe TODOS os canteiros prontos de uma vez — 1⚡ por canteiro, XP e itens
// para o personagem que clicou. Com slotIndex 101, colhe o ciclo do cercado.
// Se a stamina não cobre todos, colhe o que der (o resto fica plantado); se o
// inventário lotar no meio, para ali (nada é perdido — libere espaço e colha
// de novo).
export async function POST(req: Request) {
  const resolved = await requireApiActor(req)
  if ('error' in resolved) return resolved.error
  const userId = resolved.actor.userId

  try {
    const { characterId, slotIndex } = await req.json()
    if (!characterId) {
      return NextResponse.json({ error: 'characterId é obrigatório' }, { status: 400 })
    }
    const isPen = Number(slotIndex) === PEN_SLOT_INDEX

    const rawCharacter = await prisma.character.findFirst({ where: { id: characterId, userId } })
    if (!rawCharacter) {
      return NextResponse.json({ error: 'Personagem não encontrado' }, { status: 404 })
    }
    const character = await regenAndPersist(rawCharacter)
    const farmLevel = getProfessionLevel(await getUserFarmXp(userId))

    const result = await prisma.$transaction(async (tx) => {
      // ── Cercado (ciclo único, custo de AÇÃO normal) ─────────────────────
      if (isPen) {
        const pen = await tx.farmPlot.findUnique({
          where: { userId_slotIndex: { userId, slotIndex: PEN_SLOT_INDEX } },
        })
        if (!pen?.plantedAt) {
          throw new Error('Nada plantado aqui.')
        }
        if (!isPenReady(pen.plantedAt)) {
          throw new Error('Os animais ainda estão no ciclo. Volte mais tarde.')
        }
        const ok = await addDropToInventoryTx(tx, characterId, { name: PEN.outputName, qty: PEN.yield })
        if (!ok) {
          throw new Error('Inventário cheio — libere um slot e colha de novo (nada foi perdido).')
        }
        const stamina = await spendFarmActionStaminaTx(tx, characterId, FARM_ACTION_STAMINA)
        const updated = await tx.character.update({
          where: { id: characterId },
          data: { farmXp: { increment: PEN.farmXp } },
          select: { farmXp: true },
        })
        await tx.farmPlot.update({ where: { id: pen.id }, data: { cropId: null, plantedAt: null, state: 'empty' } })
        return {
          results: [{ outputName: PEN.outputName, qty: PEN.yield }] as HarvestItemResult[],
          xpGained: PEN.farmXp,
          harvested: 1,
          skippedNoStamina: 0,
          skippedNoSpace: 0,
          totalFarmXp: updated.farmXp,
          stamina,
          staminaSpent: FARM_ACTION_STAMINA,
        }
      }

      // ── Canteiros: colhe todos os prontos, 1⚡ cada ─────────────────────
      const rows = await tx.farmPlot.findMany({
        where: { userId, kind: 'crop', plantedAt: { not: null } },
        orderBy: { slotIndex: 'asc' },
      })
      const ready = rows.filter((r) => {
        const crop = r.cropId ? getCropById(r.cropId) : undefined
        return !!crop && !!r.plantedAt && isCropReady(r.plantedAt, crop, farmLevel)
      })
      if (ready.length === 0) {
        throw new Error('Nenhum canteiro pronto para colher.')
      }

      const affordable = Math.floor(character.stamina / FARM_HARVEST_STAMINA)
      if (affordable <= 0) {
        throw new Error(`Stamina insuficiente (colher custa ${FARM_HARVEST_STAMINA}⚡ por canteiro).`)
      }

      // Resultado POR CANTEIRO (não agregado) — o cliente anima a colheita
      // canteiro a canteiro, então precisa da sequência, não só o total.
      const results: HarvestItemResult[] = []
      let xpGained = 0
      let harvested = 0
      let skippedNoSpace = 0
      const stoneChance = farmStoneChance(farmLevel)

      for (const plot of ready.slice(0, affordable)) {
        const crop = getCropById(plot.cropId!)!
        const qty = rollCropYield(crop, farmLevel)
        const ok = await addDropToInventoryTx(tx, characterId, { name: crop.outputName, qty })
        if (!ok) {
          // Inventário lotou: o que já foi colhido fica; este canteiro (e os
          // seguintes) continuam plantados e prontos.
          skippedNoSpace = ready.length - harvested
          break
        }
        xpGained += crop.farmXp

        // 💎 Chance rara de Estilhaço de Pedra Negra por canteiro colhido —
        // silenciosamente ignorado se o inventário estiver cheio.
        let stoneName: string | undefined
        if (Math.random() * 100 < stoneChance) {
          const candidate = rollFarmStoneShard()
          const stoneOk = await addDropToInventoryTx(tx, characterId, { name: candidate, qty: 1 })
          if (stoneOk) {
            stoneName = candidate
            xpGained += FARM_STONE_BONUS_XP
          }
        }

        results.push({ outputName: crop.outputName, qty, stoneName })

        await tx.farmPlot.update({
          where: { id: plot.id },
          data: { cropId: null, plantedAt: null, state: 'empty' },
        })
        harvested++
      }

      if (harvested === 0) {
        throw new Error('Inventário cheio — libere um slot e colha de novo (nada foi perdido).')
      }

      const staminaSpent = harvested * FARM_HARVEST_STAMINA
      const stamina = await spendFarmActionStaminaTx(tx, characterId, staminaSpent)
      const updated = await tx.character.update({
        where: { id: characterId },
        data: { farmXp: { increment: xpGained } },
        select: { farmXp: true },
      })

      return {
        results,
        xpGained,
        harvested,
        skippedNoStamina: Math.max(0, ready.length - harvested - skippedNoSpace),
        skippedNoSpace,
        totalFarmXp: updated.farmXp,
        stamina,
        staminaSpent,
      }
    })

    const itemsDesc = result.results.map((i) => `${i.qty}× ${i.outputName}`).join(', ')
    const stoneNames = result.results.filter((r) => r.stoneName).map((r) => r.stoneName!)
    addHistoryEntry({
      characterId,
      activityType: 'ITEM_GAINED',
      description: stoneNames.length > 0
        ? `🌾 Colheu ${itemsDesc} + 💎 ${stoneNames.join(', ')} (+${result.xpGained} XP de Fazenda).`
        : `🌾 Colheu ${itemsDesc} (+${result.xpGained} XP de Fazenda).`,
    }).catch(() => {})
    // 🗺️ Missões: pós-commit e fire-and-forget (amount = canteiros/ciclos colhidos).
    advanceQuestProgress(characterId, { type: 'farm_harvest', amount: result.harvested }).catch(() => {})

    return NextResponse.json({
      results: result.results,
      xpGained: result.xpGained,
      harvested: result.harvested,
      skippedNoStamina: result.skippedNoStamina,
      skippedNoSpace: result.skippedNoSpace,
      staminaSpent: result.staminaSpent,
      farm: getProfessionLevelInfo(await getUserFarmXp(userId)),
      stamina: result.stamina,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro interno do servidor'
    const isValidation = /insuficiente|Nada plantado|Nenhum canteiro|crescendo|ciclo|cheio|inválido/i.test(message)
    if (!isValidation) console.error('Error harvesting:', error)
    return NextResponse.json({ error: message }, { status: isValidation ? 400 : 500 })
  }
}
