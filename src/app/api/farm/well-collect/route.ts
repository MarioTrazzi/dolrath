import { NextResponse } from 'next/server'
import { requireApiActor } from '@/lib/botFleetAuth'
import { prisma } from '@/lib/prisma'
import { regenAndPersist } from '@/lib/staminaServer'
import { spendFarmActionStaminaTx, getUserFarmXp } from '@/lib/farmServer'
import {
  wellPending,
  WELL,
  WELL_SLOT_INDEX,
  WELL_COLLECT_STAMINA,
  wellShardChance,
  wellStoneChance,
  rollFarmStoneShard,
  rollWellBlackStone,
  WELL_SHARD_BONUS_XP,
  WELL_STONE_BONUS_XP,
} from '@/lib/farming'
import { getProfessionLevel, getProfessionLevelInfo } from '@/lib/professionSystem'
import { addDropToInventoryTx } from '@/lib/dungeonRunServer'
import { addHistoryEntry } from '@/lib/characterHistory'

export const dynamic = 'force-dynamic'

export type WellBonusLoot = { name: string; kind: 'shard' | 'stone' }

/** Um balde puxado: a Água + os bônus que caíram NESTE pull. */
export type WellPullResult = { qty: number; bonuses: WellBonusLoot[] }

// 💧 Pull do poço: 1 Água (−1⚡). Com `all: true` esvazia o poço de uma vez —
// a transação continua ÚNICA (atômica), mas devolve o resultado BALDE A BALDE
// (`results[]`) para o dialog encenar um por vez, no molde da colheita em
// lote. Chance independente de Estilhaço e Pedra Negra por balde, conforme o
// nível de Fazenda da conta.
export async function POST(req: Request) {
  const resolved = await requireApiActor(req)
  if ('error' in resolved) return resolved.error
  const userId = resolved.actor.userId

  try {
    const { characterId, all } = await req.json()
    if (!characterId) {
      return NextResponse.json({ error: 'characterId é obrigatório' }, { status: 400 })
    }

    const rawCharacter = await prisma.character.findFirst({ where: { id: characterId, userId } })
    if (!rawCharacter) {
      return NextResponse.json({ error: 'Personagem não encontrado' }, { status: 404 })
    }
    const character = await regenAndPersist(rawCharacter)

    const farmXp = await getUserFarmXp(userId)
    const farmLevel = getProfessionLevel(farmXp)
    const shardChance = wellShardChance(farmLevel)
    const stoneChance = wellStoneChance(farmLevel)

    const result = await prisma.$transaction(async (tx) => {
      const well = await tx.farmPlot.findUnique({
        where: { userId_slotIndex: { userId, slotIndex: WELL_SLOT_INDEX } },
      })
      const now = new Date()
      const pending = wellPending(well?.plantedAt ?? null, now)
      if (!well || !well.plantedAt || pending <= 0) {
        throw new Error('O poço ainda não acumulou água.')
      }

      // Quantos baldes a stamina cobre (molde do `affordable` da colheita).
      // Sem `all`, o pull continua sendo exatamente 1.
      const wanted = all === true ? pending : 1
      const affordable = Math.floor(character.stamina / WELL_COLLECT_STAMINA)
      if (affordable <= 0) {
        throw new Error(`Stamina insuficiente (a ação custa ${WELL_COLLECT_STAMINA}).`)
      }
      const pulls = Math.min(wanted, affordable)

      const results: WellPullResult[] = []
      let xpGained = 0
      let skippedNoSpace = 0

      for (let i = 0; i < pulls; i++) {
        const ok = await addDropToInventoryTx(tx, characterId, { name: WELL.outputName, qty: 1 })
        if (!ok) {
          // Inventário lotou no meio: para aqui. A água NÃO se perde — fica no
          // poço (a âncora só recua pelo que foi realmente puxado).
          if (results.length === 0) {
            throw new Error('Inventário cheio — libere um slot e colete de novo.')
          }
          skippedNoSpace = pulls - results.length
          break
        }

        const bonuses: WellBonusLoot[] = []
        xpGained += WELL.farmXpPerCollect

        if (Math.random() * 100 < shardChance) {
          const shardName = rollFarmStoneShard()
          const shardOk = await addDropToInventoryTx(tx, characterId, { name: shardName, qty: 1 })
          if (shardOk) {
            bonuses.push({ name: shardName, kind: 'shard' })
            xpGained += WELL_SHARD_BONUS_XP
          }
        }

        if (Math.random() * 100 < stoneChance) {
          const stoneName = rollWellBlackStone()
          const stoneOk = await addDropToInventoryTx(tx, characterId, { name: stoneName, qty: 1 })
          if (stoneOk) {
            bonuses.push({ name: stoneName, kind: 'stone' })
            xpGained += WELL_STONE_BONUS_XP
          }
        }

        results.push({ qty: 1, bonuses })
      }

      const collected = results.length
      // Stamina e XP cobrados UMA vez pelo total (molde da colheita em lote).
      const staminaSpent = collected * WELL_COLLECT_STAMINA
      const stamina = await spendFarmActionStaminaTx(tx, characterId, staminaSpent)
      const updated = await tx.character.update({
        where: { id: characterId },
        data: { farmXp: { increment: xpGained } },
        select: { farmXp: true },
      })

      // Reancora para pending−collected a partir de `now`. Avançar N intervalos
      // falha quando o poço já transbordou (elapsed >> cap×interval): o floor
      // continuaria em 12. Com collected === pending isto vira exatamente
      // `now` — poço seco.
      const nextAnchor = new Date(
        now.getTime() - (pending - collected) * WELL.intervalSeconds * 1000,
      )
      await tx.farmPlot.update({ where: { id: well.id }, data: { plantedAt: nextAnchor } })

      const pendingLeft = Math.max(0, pending - collected)

      return {
        results,
        collected,
        skippedNoSpace,
        // A stamina cortou o lote antes da água acabar.
        skippedNoStamina: Math.max(0, wanted - pulls),
        xpGained,
        pendingLeft,
        staminaSpent,
        totalFarmXp: updated.farmXp,
        stamina,
      }
    })

    if (result.collected > 0) {
      const bonusNames = result.results.flatMap((r) => r.bonuses.map((b) => b.name))
      addHistoryEntry({
        characterId,
        activityType: 'ITEM_GAINED',
        description:
          bonusNames.length > 0
            ? `💧 Puxou ${result.collected}× ${WELL.outputName} do poço + 💎 ${bonusNames.join(', ')} (+${result.xpGained} XP de Fazenda).`
            : `💧 Puxou ${result.collected}× ${WELL.outputName} do poço (+${result.xpGained} XP de Fazenda).`,
      }).catch(() => {})
    }

    // `qty`/`bonuses` seguem no payload para o contrato de 1 balde (quem não
    // manda `all` continua lendo o mesmo formato de antes).
    return NextResponse.json({
      outputName: WELL.outputName,
      qty: result.collected,
      bonuses: result.results.flatMap((r) => r.bonuses),
      results: result.results,
      collected: result.collected,
      skippedNoSpace: result.skippedNoSpace,
      skippedNoStamina: result.skippedNoStamina,
      staminaSpent: result.staminaSpent,
      xpGained: result.xpGained,
      pendingLeft: result.pendingLeft,
      farm: getProfessionLevelInfo(await getUserFarmXp(userId)),
      stamina: result.stamina,
      wellShardChance: shardChance,
      wellStoneChance: stoneChance,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro interno do servidor'
    const isValidation = /insuficiente|não acumulou|cheio/i.test(message)
    if (!isValidation) console.error('Error collecting well:', error)
    return NextResponse.json({ error: message }, { status: isValidation ? 400 : 500 })
  }
}
