import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { buildXpUpdate } from '@/lib/characterLevelSystem'
import {
  getDungeon,
  rollCombatLoot,
  rollKillLoot,
  addDropToInventoryTx,
  dailyGoldRemainingTx,
  applyGearWearTx,
  pendingMonsters,
  type RunPending,
} from '@/lib/dungeonRunServer'
import { wearFor } from '@/lib/durability'
import { firstBossBonusStones, FIRST_BOSS_BONUS, MAX_DUNGEON_TIER, clampDungeonTier, type LootDrop } from '@/lib/dungeonAdventures'

export const dynamic = 'force-dynamic'

// Resolve o combate em PACOTE do nó atual — em UMA chamada por nó. Abates no
// meio do pacote NÃO tocam a rede (o cliente mostra os valores otimistas que o
// próprio servidor rolou pro nó); quem credita tudo é a chamada de desfecho:
//
//   • outcome 'clear'            → todos os monstros do nó caíram: credita os abates
//                       (gold+XP+drops por abate), rola o espólio do nó e avança o
//                       cursor (boss → fim da run).
//   • outcome 'retreat' (+ killedIds) → recua: credita os abates REPORTADOS (subset
//                       dos monstros que o servidor rolou) e encerra a run. Sem
//                       espólio de nó, cursor não avança.
//   • outcome 'lose'    (+ killedIds) → derrota: idem retreat, status 'defeated'.
//   • outcome 'kill'/'win' (legado)   → compat com abas abertas no deploy: 'kill'
//                       credita 1 abate incremental; 'win' = 'clear'.
//
// O cliente reporta a AÇÃO, nunca o valor — o servidor é dono de QUANTO se ganha
// (teto = os monstros que ele mesmo rolou pro nó, menos os já creditados).
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id

  try {
    const { runId, outcome, monsterId, killedIds } = await req.json()
    const VALID = ['clear', 'retreat', 'lose', 'kill', 'win']
    if (!runId || !VALID.includes(outcome)) {
      return NextResponse.json({ error: 'runId e outcome (clear|retreat|lose) são obrigatórios' }, { status: 400 })
    }

    const run = await prisma.dungeonRun.findFirst({ where: { id: runId, userId } })
    if (!run) return NextResponse.json({ error: 'Run não encontrada' }, { status: 404 })
    if (run.status !== 'active') {
      return NextResponse.json({ error: 'Run não está ativa', status: run.status }, { status: 409 })
    }
    if (!run.pending) {
      return NextResponse.json({ error: 'Nenhum combate pendente' }, { status: 409 })
    }

    const dungeon = getDungeon(run.dungeonId)
    if (!dungeon) return NextResponse.json({ error: 'Masmorra inválida' }, { status: 500 })

    const pending = run.pending as unknown as RunPending
    const isBoss = pending.kind === 'boss'
    const isRunEnd = outcome === 'retreat' || outcome === 'lose'

    const monsters = pendingMonsters(pending)
    const killed = new Set(pending.killedIds ?? [])
    const alive = monsters.filter((m) => !killed.has(m.id))

    // Quais monstros este request abate?
    //   clear/win → todos os ainda vivos; retreat/lose → os REPORTADOS (ids
    //   desconhecidos/repetidos são ignorados); kill (legado) → o monsterId.
    let newlyKilled = alive
    if (outcome === 'kill') {
      const target = alive.find((m) => m.id === monsterId)
      if (!target) {
        // Já abatido (reenvio) ou id inválido — idempotente: nada a creditar.
        return NextResponse.json({ error: 'Monstro inválido ou já abatido' }, { status: 409 })
      }
      newlyKilled = [target]
    } else if (isRunEnd) {
      const reported = new Set(Array.isArray(killedIds) ? killedIds : [])
      newlyKilled = alive.filter((m) => reported.has(m.id))
    }

    // RECUAR/DERROTA sem abate novo: só fecha a run (caminho barato).
    if (isRunEnd && newlyKilled.length === 0) {
      await prisma.dungeonRun.update({
        where: { id: run.id },
        data: { status: outcome === 'retreat' ? 'abandoned' : 'defeated', pending: Prisma.DbNull },
      })
      return NextResponse.json({ finished: true, retreated: outcome === 'retreat', defeated: outcome === 'lose' })
    }

    // O personagem precisa pertencer ao usuário (defesa extra).
    const character = await prisma.character.findFirst({ where: { id: run.characterId, userId } })
    if (!character) return NextResponse.json({ error: 'Personagem não encontrado' }, { status: 404 })

    const killGoldTotal = newlyKilled.reduce((s, m) => s + m.goldReward, 0)
    const xpTotal = newlyKilled.reduce((s, m) => s + m.xpReward, 0)
    for (const m of newlyKilled) killed.add(m.id)
    const allDead = !isRunEnd && monsters.every((m) => killed.has(m.id))

    const charForRun = { id: character.id, level: character.level, race: character.race, class: character.class }
    // 💀 Drop POR ABATE: cada monstro morto rola material (estilhaço; boss = Pedra
    // Negra garantida). O d20 pré-combate (pending.lootRoll) define a CLASSE do
    // drop de cada abate — recuar depois de 1 abate num nó de sorte 20 ainda rende
    // drop "classe 20". Boss é sempre sorte máxima (lootRoll: 20 no resolveBossNode).
    const killDrops = newlyKilled.flatMap((m) =>
      rollKillLoot(pending.kind, !!m.isBoss, dungeon.difficultyStars, run.tier, pending.lootRoll, dungeon)
    )
    // 🌅 Bônus solo: os primeiros bosses do DIA da CONTA rendem pedras extras
    // (conta runs 'finished' de hoje — a run só finaliza matando o boss).
    if (newlyKilled.some((m) => !!m.isBoss)) {
      const startOfDay = new Date()
      startOfDay.setUTCHours(0, 0, 0, 0)
      const bossesToday = await prisma.dungeonRun.count({
        where: { userId, status: 'finished', updatedAt: { gte: startOfDay } },
      })
      if (bossesToday < FIRST_BOSS_BONUS.bossesPerDay) killDrops.push(...firstBossBonusStones())
    }
    // O espólio do NÓ só sai quando o pacote inteiro cai (recompensa por limpar).
    const nodeLoot = allDead ? rollCombatLoot(dungeon, charForRun, pending, run.tier) : null
    // Pedras PRIMEIRO: no nat 20 a pedra é o jackpot — se o inventário estiver
    // quase cheio, materiais/estilhaços não podem "roubar" o último slot e
    // descartar a pedra (skippedDrops). Gear em seguida; o resto depois.
    const allDrops: LootDrop[] = [...killDrops, ...(nodeLoot?.drops ?? [])].sort((a, b) => {
      const rank = (d: LootDrop) => (d.kind === 'stone' ? 0 : d.kind === 'item' ? 1 : 2)
      return rank(a) - rank(b)
    })

    // ⚔️ Desgaste por uso: os abates do nó consomem durabilidade do gear equipado
    // (arma desgasta mais; chefe dobra). Linear em nº de abates — o total em lote
    // é idêntico ao antigo débito por abate.
    const bossKill = newlyKilled.some((m) => !!m.isBoss)
    const weaponWear = wearFor('WEAPON', newlyKilled.length, bossKill)
    const gearWear = wearFor('ARMOR', newlyKilled.length, bossKill)

    // XP + level-up calculados sobre o personagem já carregado, aplicados no MESMO
    // update do gold (antes rodavam fora da transação, em find+update próprios).
    const xp = buildXpUpdate(character, xpTotal)

    const credited = await prisma.$transaction(async (tx) => {
      // Teto diário consultado UMA vez; abates têm prioridade sobre o gold do nó.
      const remaining = await dailyGoldRemainingTx(tx, userId)
      const killGold = Math.min(Math.max(0, Math.floor(killGoldTotal)), remaining)
      const lootGold = Math.min(Math.max(0, Math.floor(nodeLoot?.gold ?? 0)), remaining - killGold)

      const skippedDrops: LootDrop[] = []
      for (const d of allDrops) {
        const added = await addDropToInventoryTx(tx, character.id, { name: d.name, rarity: d.rarity, enhancement: d.enhancement })
        if (!added) skippedDrops.push(d)
      }

      await tx.character.update({
        where: { id: character.id },
        data: {
          ...xp.updateData,
          ...(killGold + lootGold > 0 ? { gold: { increment: killGold + lootGold } } : {}),
        },
      })

      await tx.dungeonRun.update({
        where: { id: run.id },
        data: {
          goldEarned: { increment: killGold + lootGold },
          xpEarned: { increment: xpTotal },
          ...(isRunEnd
            ? { status: outcome === 'retreat' ? 'abandoned' : 'defeated', pending: Prisma.DbNull }
            : allDead
            ? { cursor: pending.nodeIdx, pending: Prisma.DbNull, status: isBoss ? 'finished' : 'active' }
            : { pending: { ...pending, killedIds: Array.from(killed) } as unknown as object }),
        },
      })

      // 🏆 Desbloqueio de TIER: vencer o boss no tier == maxTier atual sobe o maxTier
      // (até MAX_DUNGEON_TIER). Garante a linha do progresso e faz o bump idempotente.
      if (isBoss && allDead) {
        const key = { characterId_dungeonId: { characterId: character.id, dungeonId: dungeon.id } }
        const prog = await tx.dungeonProgress.upsert({
          where: key,
          create: { characterId: character.id, dungeonId: dungeon.id, maxTier: 1 },
          update: {},
        })
        const beat = clampDungeonTier(run.tier)
        if (beat >= prog.maxTier && prog.maxTier < MAX_DUNGEON_TIER) {
          await tx.dungeonProgress.update({ where: key, data: { maxTier: prog.maxTier + 1 } })
        }
      }

      // Desgaste em LOTE: 2 updateMany por família de slot (decrementa quem sobrevive
      // ao débito; zera quem quebraria) em vez de um update por peça. O findMany
      // continua — a resposta precisa de nome/valores pro aviso no cliente.
      const equipped = await tx.characterEquipment.findMany({
        where: { characterId: character.id },
        include: { item: { select: { name: true } } },
      })
      const equipmentWear = [] as {
        slot: string; name: string; durability: number; maxDurability: number; justBroke: boolean
      }[]
      for (const eq of equipped) {
        if (eq.durability <= 0) continue // já quebrada: não desgasta além de 0
        const wear = eq.slot === 'WEAPON' ? weaponWear : gearWear
        const after = Math.max(0, eq.durability - wear)
        if (after === eq.durability) continue
        equipmentWear.push({
          slot: eq.slot,
          name: eq.item.name,
          durability: after,
          maxDurability: eq.maxDurability,
          justBroke: after === 0,
        })
      }
      if (equipmentWear.length > 0 && weaponWear > 0) {
        await applyGearWearTx(tx, character.id, weaponWear, gearWear)
      }

      return { killGold, lootGold, skippedDrops, equipmentWear }
    })

    return NextResponse.json({
      granted: {
        gold: credited.killGold + credited.lootGold,
        killGold: credited.killGold,
        lootGold: credited.lootGold,
        xp: xpTotal,
        loot: { gold: nodeLoot?.gold ?? 0, drops: allDrops },
        skippedDrops: credited.skippedDrops,
        // d20 do nó (dono da classe do loot) — autoritativo pro badge 🎲 da UI.
        roll: pending.lootRoll,
      },
      cleared: allDead,
      equipmentWear: credited.equipmentWear,
      cursor: allDead ? pending.nodeIdx : run.cursor,
      finished: isRunEnd || (allDead && isBoss),
      bossDefeated: allDead && isBoss,
      retreated: outcome === 'retreat',
      defeated: outcome === 'lose',
      leveledUp: xp.leveledUp,
      newLevel: xp.leveledUp ? xp.newLevelInfo.level : character.level,
    })
  } catch (error) {
    console.error('Error resolving dungeon combat:', error)
    return NextResponse.json({ error: 'Failed to resolve combat' }, { status: 500 })
  }
}
