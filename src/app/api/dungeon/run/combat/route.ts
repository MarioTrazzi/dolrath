import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { addExperienceToCharacter } from '@/lib/characterLevelSystem'
import {
  getDungeon,
  rollCombatLoot,
  rollKillLoot,
  applyLootTx,
  creditGoldTx,
  pendingMonsters,
  type RunPending,
} from '@/lib/dungeonRunServer'
import { wearFor } from '@/lib/durability'
import { firstBossBonusStones, FIRST_BOSS_BONUS } from '@/lib/dungeonAdventures'

export const dynamic = 'force-dynamic'

// Resolve o combate em PACOTE do nó atual. O encontro tem 1..3 monstros e cada
// ABATE é creditado por si (gold + XP) — então derrotar pelo menos um já vale XP,
// mesmo que o jogador recue ou caia depois (sem penalidade, como no design).
//
// O cliente reporta a AÇÃO, nunca o valor — o servidor é dono de QUANTO se ganha
// (teto = os monstros que ele mesmo rolou pro nó):
//   • outcome 'kill'  (+ monsterId) → credita aquele abate; quando TODOS caem, o nó
//                       "limpa": rola o espólio, credita e avança o cursor (boss → fim).
//   • outcome 'retreat'             → recua em segurança: encerra a run, mantém o que
//                       já foi creditado por abate. Sem espólio do nó, cursor não avança.
//   • outcome 'lose'                → derrota: encerra a run (abates anteriores já valeram).
//   • outcome 'win'  (legado)       → trata todos os vivos como abatidos e limpa o nó.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id

  try {
    const { runId, outcome, monsterId } = await req.json()
    const VALID = ['kill', 'retreat', 'lose', 'win']
    if (!runId || !VALID.includes(outcome)) {
      return NextResponse.json({ error: 'runId e outcome (kill|retreat|lose|win) são obrigatórios' }, { status: 400 })
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

    // RECUAR: sai em segurança. Os abates já foram creditados por kill; só fecha a run.
    if (outcome === 'retreat') {
      await prisma.dungeonRun.update({
        where: { id: run.id },
        data: { status: 'abandoned', pending: Prisma.DbNull },
      })
      return NextResponse.json({ finished: true, retreated: true })
    }

    // DERROTA: encerra a run, limpa o pendente. Sem recompensa do nó.
    if (outcome === 'lose') {
      await prisma.dungeonRun.update({
        where: { id: run.id },
        data: { status: 'defeated', pending: Prisma.DbNull },
      })
      return NextResponse.json({ finished: true, defeated: true })
    }

    // VITÓRIA/ABATE: o personagem precisa pertencer ao usuário (defesa extra).
    const character = await prisma.character.findFirst({ where: { id: run.characterId, userId } })
    if (!character) return NextResponse.json({ error: 'Personagem não encontrado' }, { status: 404 })

    const monsters = pendingMonsters(pending)
    const killed = new Set(pending.killedIds ?? [])

    // Quais monstros este request abate? 'kill' → o monsterId informado (1); 'win'
    // (legado) → todos os que ainda estão vivos.
    let newlyKilled = monsters.filter((m) => !killed.has(m.id))
    if (outcome === 'kill') {
      const target = newlyKilled.find((m) => m.id === monsterId)
      if (!target) {
        // Já abatido (reenvio) ou id inválido — idempotente: nada a creditar.
        return NextResponse.json({ error: 'Monstro inválido ou já abatido' }, { status: 409 })
      }
      newlyKilled = [target]
    }

    const killGoldTotal = newlyKilled.reduce((s, m) => s + m.goldReward, 0)
    const xpTotal = newlyKilled.reduce((s, m) => s + m.xpReward, 0)
    for (const m of newlyKilled) killed.add(m.id)
    const allDead = monsters.every((m) => killed.has(m.id))

    const charForRun = { id: character.id, level: character.level, race: character.race, class: character.class }
    // 💀 Drop POR ABATE: cada monstro morto rola material na hora (estilhaço; boss =
    // Pedra Negra garantida) — recuar depois de matar 1 de 3 ainda rende algo.
    const killDrops = newlyKilled.flatMap((m) => rollKillLoot(pending.kind, !!m.isBoss, dungeon.difficultyStars))
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
    // O espólio do NÓ segue saindo só quando o pacote inteiro cai (recompensa por limpar).
    const nodeLoot = allDead ? rollCombatLoot(dungeon, charForRun, pending) : null
    const loot = nodeLoot || killDrops.length
      ? { gold: nodeLoot?.gold ?? 0, drops: [...killDrops, ...(nodeLoot?.drops ?? [])] }
      : null

    // ⚔️ Desgaste por uso: cada abate consome durabilidade do gear equipado
    // (arma desgasta mais; chefe dobra). Servidor é dono do débito — o cliente
    // só fica sabendo pelo `equipmentWear` da resposta.
    const bossKill = newlyKilled.some((m) => !!m.isBoss)

    const credited = await prisma.$transaction(async (tx) => {
      const killGold = await creditGoldTx(tx, userId, character.id, killGoldTotal)
      const lootResult = loot ? await applyLootTx(tx, userId, character.id, loot) : { gold: 0, skippedDrops: [] }
      const lootGold = lootResult.gold
      await tx.dungeonRun.update({
        where: { id: run.id },
        data: {
          goldEarned: { increment: killGold + lootGold },
          xpEarned: { increment: xpTotal },
          ...(allDead
            ? { cursor: pending.nodeIdx, pending: Prisma.DbNull, status: isBoss ? 'finished' : 'active' }
            : { pending: { ...pending, killedIds: Array.from(killed) } as unknown as object }),
        },
      })

      const equipped = await tx.characterEquipment.findMany({
        where: { characterId: character.id },
        include: { item: { select: { name: true } } },
      })
      const equipmentWear = [] as {
        slot: string; name: string; durability: number; maxDurability: number; justBroke: boolean
      }[]
      for (const eq of equipped) {
        if (eq.durability <= 0) continue // já quebrada: não desgasta além de 0
        const wear = wearFor(eq.slot, newlyKilled.length, bossKill)
        const after = Math.max(0, eq.durability - wear)
        if (after === eq.durability) continue
        await tx.characterEquipment.update({ where: { id: eq.id }, data: { durability: after } })
        equipmentWear.push({
          slot: eq.slot,
          name: eq.item.name,
          durability: after,
          maxDurability: eq.maxDurability,
          justBroke: after === 0,
        })
      }

      return { killGold, lootGold, skippedDrops: lootResult.skippedDrops, equipmentWear }
    })

    // XP creditado pelos abates deste request (faz seu próprio update de personagem).
    const xpResult = await addExperienceToCharacter(character.id, xpTotal)

    return NextResponse.json({
      granted: {
        gold: credited.killGold + credited.lootGold,
        killGold: credited.killGold,
        lootGold: credited.lootGold,
        xp: xpTotal,
        loot: loot ?? { gold: 0, drops: [] },
        skippedDrops: credited.skippedDrops,
      },
      cleared: allDead,
      equipmentWear: credited.equipmentWear,
      cursor: allDead ? pending.nodeIdx : run.cursor,
      finished: allDead && isBoss,
      bossDefeated: allDead && isBoss,
      leveledUp: xpResult.leveledUp,
      newLevel: xpResult.leveledUp ? xpResult.newLevelInfo.level : character.level,
    })
  } catch (error) {
    console.error('Error resolving dungeon combat:', error)
    return NextResponse.json({ error: 'Failed to resolve combat' }, { status: 500 })
  }
}
