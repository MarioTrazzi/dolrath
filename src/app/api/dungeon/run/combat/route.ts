import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { addExperienceToCharacter } from '@/lib/characterLevelSystem'
import {
  getDungeon,
  rollCombatLoot,
  applyLootTx,
  creditGoldTx,
  type RunPending,
} from '@/lib/dungeonRunServer'

export const dynamic = 'force-dynamic'

// Resolve o combate pendente do nó atual. VITÓRIA: credita gold do abate +
// espólio (rolado no servidor) + XP, e avança o cursor (boss → run concluída).
// DERROTA: encerra a run sem recompensa do nó (XP dos abates anteriores já foi
// creditado por kill — sem penalidade, como no design). O cliente só diz o
// DESFECHO; o servidor é dono de QUANTO se ganha — o teto é o monstro que ele
// mesmo rolou para aquele nó (mint arbitrário impossível).
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id

  try {
    const { runId, outcome } = await req.json()
    if (!runId || (outcome !== 'win' && outcome !== 'lose')) {
      return NextResponse.json({ error: 'runId e outcome (win|lose) são obrigatórios' }, { status: 400 })
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

    // DERROTA: encerra a run, limpa o pendente. Sem recompensa do nó.
    if (outcome === 'lose') {
      await prisma.dungeonRun.update({
        where: { id: run.id },
        data: { status: 'defeated', pending: Prisma.DbNull },
      })
      return NextResponse.json({ finished: true, defeated: true })
    }

    // VITÓRIA: o personagem precisa pertencer ao usuário (defesa extra).
    const character = await prisma.character.findFirst({ where: { id: run.characterId, userId } })
    if (!character) return NextResponse.json({ error: 'Personagem não encontrado' }, { status: 404 })

    const charForRun = { id: character.id, level: character.level, race: character.race, class: character.class }
    const monster = pending.monster
    const loot = rollCombatLoot(dungeon, charForRun, pending)

    const credited = await prisma.$transaction(async (tx) => {
      const killGold = await creditGoldTx(tx, userId, character.id, monster.goldReward)
      const lootGold = await applyLootTx(tx, userId, character.id, loot)
      await tx.dungeonRun.update({
        where: { id: run.id },
        data: {
          cursor: pending.nodeIdx,
          goldEarned: { increment: killGold + lootGold },
          xpEarned: { increment: monster.xpReward },
          pending: Prisma.DbNull,
          status: isBoss ? 'finished' : 'active',
        },
      })
      return { killGold, lootGold }
    })

    // XP creditado por abate (faz seu próprio update de personagem).
    const xpResult = await addExperienceToCharacter(character.id, monster.xpReward)

    return NextResponse.json({
      granted: {
        gold: credited.killGold + credited.lootGold,
        killGold: credited.killGold,
        lootGold: credited.lootGold,
        xp: monster.xpReward,
        loot,
      },
      cursor: pending.nodeIdx,
      finished: isBoss,
      bossDefeated: isBoss,
      leveledUp: xpResult.leveledUp,
      newLevel: xpResult.leveledUp ? xpResult.newLevelInfo.level : character.level,
    })
  } catch (error) {
    console.error('Error resolving dungeon combat:', error)
    return NextResponse.json({ error: 'Failed to resolve combat' }, { status: 500 })
  }
}
