import { NextResponse } from 'next/server'
import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import {
  buildTrail,
  getDungeon,
  resolveExploreNode,
  resolveBossNode,
  applyLootTx,
  STEP_COST,
  type RunPending,
} from '@/lib/dungeonRunServer'

export const dynamic = 'force-dynamic'

// Avança UM nó na trilha. O servidor cobra a stamina, rola o d20 e decide
// monstro vs. achado. Achado: credita gold+itens e avança o cursor. Monstro/
// boss: grava `pending` e aguarda o desfecho em /combat (cursor só avança na
// vitória). Idempotente: com `pending` setado, reenvia o combate sem cobrar de novo.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id

  try {
    const { runId } = await req.json()
    if (!runId) return NextResponse.json({ error: 'runId é obrigatório' }, { status: 400 })

    const run = await prisma.dungeonRun.findFirst({ where: { id: runId, userId } })
    if (!run) return NextResponse.json({ error: 'Run não encontrada' }, { status: 404 })
    if (run.status !== 'active') {
      return NextResponse.json({ error: 'Run não está ativa', status: run.status }, { status: 409 })
    }

    const dungeon = getDungeon(run.dungeonId)
    if (!dungeon) return NextResponse.json({ error: 'Masmorra inválida' }, { status: 500 })

    // Combate pendente: reenvia o monstro sem cobrar stamina nem rolar de novo.
    if (run.pending) {
      const pending = run.pending as unknown as RunPending
      return NextResponse.json({
        type: pending.kind === 'boss' ? 'boss' : 'monster',
        roll: pending.lootRoll,
        monster: pending.monster,
        pendingCombat: true,
      })
    }

    const trail = buildTrail(dungeon)
    const nextIdx = run.cursor + 1
    if (nextIdx >= trail.length) {
      return NextResponse.json({ error: 'Run já concluída' }, { status: 409 })
    }
    const node = trail[nextIdx]

    const character = await prisma.character.findFirst({ where: { id: run.characterId, userId } })
    if (!character) return NextResponse.json({ error: 'Personagem não encontrado' }, { status: 404 })

    const cost = node.kind === 'main' ? STEP_COST.main : node.kind === 'boss' ? STEP_COST.boss : STEP_COST.minor
    if (character.stamina < cost) {
      return NextResponse.json(
        { error: 'Stamina insuficiente', current: character.stamina, required: cost },
        { status: 400 }
      )
    }

    const charForRun = { id: character.id, level: character.level, race: character.race, class: character.class }

    // BOSS: rola o boss, grava pending, cobra stamina (cursor só avança na vitória).
    if (node.kind === 'boss') {
      const pending = resolveBossNode(dungeon, charForRun, nextIdx)
      const updated = await prisma.$transaction(async (tx) => {
        const c = await tx.character.update({ where: { id: character.id }, data: { stamina: { decrement: cost } } })
        await tx.dungeonRun.update({ where: { id: run.id }, data: { pending: pending as unknown as object } })
        return c
      })
      return NextResponse.json({ type: 'boss', roll: 20, monster: pending.monster, stamina: updated.stamina })
    }

    // Nó de exploração: rola o d20 no servidor.
    const resolved = resolveExploreNode(dungeon, charForRun, node, nextIdx)

    if (resolved.type === 'monster') {
      const updated = await prisma.$transaction(async (tx) => {
        const c = await tx.character.update({ where: { id: character.id }, data: { stamina: { decrement: cost } } })
        await tx.dungeonRun.update({ where: { id: run.id }, data: { pending: resolved.pending as unknown as object } })
        return c
      })
      return NextResponse.json({ type: 'monster', roll: resolved.roll, monster: resolved.pending.monster, stamina: updated.stamina })
    }

    // ACHADO: credita gold+itens e avança o cursor numa transação.
    const out = await prisma.$transaction(async (tx) => {
      const c = await tx.character.update({ where: { id: character.id }, data: { stamina: { decrement: cost } } })
      const gold = await applyLootTx(tx, userId, character.id, resolved.loot)
      await tx.dungeonRun.update({
        where: { id: run.id },
        data: { cursor: nextIdx, goldEarned: { increment: gold } },
      })
      return { stamina: c.stamina, gold }
    })

    return NextResponse.json({
      type: 'find',
      roll: resolved.roll,
      loot: resolved.loot,
      gold: out.gold,
      cursor: nextIdx,
      stamina: out.stamina,
    })
  } catch (error) {
    console.error('Error stepping dungeon run:', error)
    return NextResponse.json({ error: 'Failed to step dungeon run' }, { status: 500 })
  }
}
