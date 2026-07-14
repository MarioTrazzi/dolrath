import { NextResponse } from 'next/server'
import { auth } from '@/app/api/auth/[...nextauth]/route'
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

export const dynamic = 'force-dynamic'

export type WellBonusLoot = { name: string; kind: 'shard' | 'stone' }

// 💧 Pull do poço: 1 Água por vez (−1⚡). A âncora avança 1 intervalo (não zera
// o restante acumulado). Chance independente de Estilhaço e Pedra Negra
// conforme o nível de Fazenda da conta.
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
    await regenAndPersist(rawCharacter)

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

      const ok = await addDropToInventoryTx(tx, characterId, { name: WELL.outputName, qty: 1 })
      if (!ok) {
        throw new Error('Inventário cheio — libere um slot e colete de novo.')
      }

      const bonuses: WellBonusLoot[] = []
      let xpGained = WELL.farmXpPerCollect

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

      const stamina = await spendFarmActionStaminaTx(tx, characterId, WELL_COLLECT_STAMINA)
      const updated = await tx.character.update({
        where: { id: characterId },
        data: { farmXp: { increment: xpGained } },
        select: { farmXp: true },
      })

      // Reancora para pending-1 a partir de `now`. Avançar só +1 intervalo
      // falha quando o poço já transbordou (elapsed >> cap×interval): o floor
      // continuaria em 12. Snap em now − (pending−1)×interval garante −1 no contador.
      const nextAnchor = new Date(now.getTime() - (pending - 1) * WELL.intervalSeconds * 1000)
      await tx.farmPlot.update({ where: { id: well.id }, data: { plantedAt: nextAnchor } })

      const pendingLeft = Math.max(0, pending - 1)

      return {
        qty: 1,
        bonuses,
        xpGained,
        pendingLeft,
        totalFarmXp: updated.farmXp,
        stamina,
      }
    })

    return NextResponse.json({
      outputName: WELL.outputName,
      qty: result.qty,
      bonuses: result.bonuses,
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
