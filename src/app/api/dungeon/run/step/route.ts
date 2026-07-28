import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import {
  buildTrail,
  getDungeon,
  resolveExploreNode,
  resolveBossNode,
  resolveNodeOutcome,
  rollCombatLoot,
  rollKillLoot,
  readAccrued,
  mergeAccrued,
  pendingMonsters,
  STEP_COST,
  type CharacterForRun,
  type RunPending,
} from '@/lib/dungeonRunServer'
import { regenAndPersist } from '@/lib/staminaServer'
import type { DungeonDef, LootDrop } from '@/lib/dungeonAdventures'

export const dynamic = 'force-dynamic'

// Avança UM nó na trilha. O servidor cobra a stamina, rola o d20, decide monstro
// vs. achado e JÁ ROLA o espólio — assim o cliente monta os cards da run inteira
// sem uma única ida à rede durante as lutas.
//
// 🎒 Nada disto é escrito no personagem aqui: o que o nó rendeu vai para
// `DungeonRun.accrued` (JSONB) e o /finish credita tudo de uma vez. O que o
// jogador vê durante a run é INFORMAÇÃO; o banco só é tocado ao sair.
//
// O corpo aceita o DESFECHO do nó anterior de carona (`resolve`), que é como o
// fim de luta deixou de ter chamada própria: ele viaja escondido atrás da
// animação de caminhada até o próximo nó.
//
// Idempotente: com `pending` setado e sem `resolve`, reenvia o combate sem cobrar
// stamina nem rolar de novo.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id

  try {
    const { runId, resolve } = await req.json()
    if (!runId) return NextResponse.json({ error: 'runId é obrigatório' }, { status: 400 })

    const run = await prisma.dungeonRun.findFirst({ where: { id: runId, userId } })
    if (!run) return NextResponse.json({ error: 'Run não encontrada' }, { status: 404 })
    if (run.status !== 'active') {
      return NextResponse.json({ error: 'Run não está ativa', status: run.status }, { status: 409 })
    }

    const dungeon = getDungeon(run.dungeonId)
    if (!dungeon) return NextResponse.json({ error: 'Masmorra inválida' }, { status: 500 })

    const character = await prisma.character.findFirst({ where: { id: run.characterId, userId } })
    if (!character) return NextResponse.json({ error: 'Personagem não encontrado' }, { status: 404 })
    const charForRun: CharacterForRun = {
      id: character.id,
      level: character.level,
      race: character.race,
      class: character.class,
    }

    // ---------- Desfecho do nó anterior (de carona) ----------
    // Absorvido em memória e gravado na MESMA transação do passo seguinte.
    let accrued = readAccrued(run.accrued)
    let cursor = run.cursor
    let pendingCleared = false
    if (resolve && run.pending) {
      const pending = run.pending as unknown as RunPending
      // O cliente reporta a AÇÃO; o nó que ele diz ter resolvido tem que ser o
      // que o servidor rolou — senão é resposta atrasada de outra aba. E só
      // 'clear' viaja por aqui: recuo e derrota ENCERRAM a run, então vão pelo
      // /finish (que é quem sabe fechar a sessão).
      if (resolve.outcome === 'clear' && Number(resolve.nodeIdx) === pending.nodeIdx) {
        const { delta, allDead } = resolveNodeOutcome(pending, 'clear', resolve.killedIds, {
          dungeon,
          character: charForRun,
          tier: run.tier,
        })
        if (allDead) {
          accrued = mergeAccrued(accrued, delta)
          cursor = pending.nodeIdx
          pendingCleared = true
        }
      }
    }
    if (!pendingCleared && run.pending) {
      // Combate ainda pendente: reenvia o monstro sem cobrar stamina nem rolar de novo.
      const pending = run.pending as unknown as RunPending
      const monsters = pendingMonsters(pending)
      const killed = new Set(pending.killedIds ?? [])
      const alive = monsters.filter((m) => !killed.has(m.id))
      return NextResponse.json({
        type: pending.kind === 'boss' ? 'boss' : 'monster',
        roll: pending.lootRoll,
        monster: alive[0] ?? monsters[0],
        monsters: alive.length ? alive : monsters,
        killDrops: pending.killDrops ?? {},
        nodeLoot: pending.nodeLoot ?? null,
        pendingCombat: true,
        // O desfecho enviado (se houve) NÃO foi absorvido — o cliente precisa
        // segurá-lo para a próxima tentativa em vez de descartá-lo.
        resolved: false,
      })
    }

    const trail = buildTrail(dungeon)
    const nextIdx = cursor + 1
    if (nextIdx >= trail.length) {
      return NextResponse.json({ error: 'Run já concluída' }, { status: 409 })
    }
    const node = trail[nextIdx]

    const cost = node.kind === 'main' ? STEP_COST.main : node.kind === 'boss' ? STEP_COST.boss : STEP_COST.minor
    // Stamina viva sincronizada (regen passivo ou tiques de coleta debitados).
    // Avançar zera o cronômetro de 15 min: cada nó grava stamina = liveStamina
    // - cost e âncora = agora.
    const { stamina: liveStamina } = await regenAndPersist(character)
    if (liveStamina < cost) {
      // O desfecho já absorvido não pode se perder porque faltou stamina para o
      // passo seguinte — grava o acumulado e devolve o erro.
      if (pendingCleared) {
        await prisma.dungeonRun.update({
          where: { id: run.id },
          data: { cursor, pending: Prisma.DbNull, accrued: accrued as unknown as object },
        })
      }
      return NextResponse.json(
        { error: 'Stamina insuficiente', current: liveStamina, required: cost, resolved: pendingCleared },
        { status: 400 }
      )
    }
    const staminaSpend = { stamina: liveStamina - cost, staminaUpdatedAt: new Date() }

    // Pré-rola o espólio do encontro: drops por abate (id → drops) e o espólio do
    // nó (só pago se o pacote inteiro cair). É isto que deixa o card de vitória
    // sair instantâneo no cliente.
    const withLoot = (pending: RunPending): RunPending => ({
      ...pending,
      killDrops: rollKillDrops(dungeon, pending, run.tier),
      nodeLoot: rollCombatLoot(dungeon, charForRun, pending, run.tier),
    })

    // BOSS: rola o boss, grava pending, cobra stamina (cursor só avança na vitória).
    if (node.kind === 'boss') {
      const pending = withLoot(resolveBossNode(dungeon, charForRun, nextIdx, run.tier))
      const updated = await prisma.$transaction(async (tx) => {
        const c = await tx.character.update({ where: { id: character.id }, data: staminaSpend })
        await tx.dungeonRun.update({
          where: { id: run.id },
          data: { cursor, pending: pending as unknown as object, accrued: accrued as unknown as object },
        })
        return c
      })
      return NextResponse.json({
        resolved: pendingCleared,
        type: 'boss',
        roll: 20,
        monster: pending.monsters[0],
        monsters: pending.monsters,
        killDrops: pending.killDrops,
        nodeLoot: pending.nodeLoot,
        stamina: updated.stamina,
      })
    }

    // Nó de exploração: rola o d20 no servidor.
    const resolved = resolveExploreNode(dungeon, charForRun, node, nextIdx, run.tier)

    if (resolved.type === 'monster') {
      const pending = withLoot(resolved.pending)
      const updated = await prisma.$transaction(async (tx) => {
        const c = await tx.character.update({ where: { id: character.id }, data: staminaSpend })
        await tx.dungeonRun.update({
          where: { id: run.id },
          data: { cursor, pending: pending as unknown as object, accrued: accrued as unknown as object },
        })
        return c
      })
      return NextResponse.json({
        resolved: pendingCleared,
        type: 'monster',
        roll: resolved.roll,
        monster: pending.monsters[0],
        monsters: pending.monsters,
        killDrops: pending.killDrops,
        nodeLoot: pending.nodeLoot,
        stamina: updated.stamina,
      })
    }

    // ACHADO: NÃO credita mais aqui (era o caminho de ~25 round-trips por causa do
    // catálogo por nome + contagem de slots por drop). Vai pro acumulado e avança
    // o cursor; o crédito real acontece no /finish.
    const found = mergeAccrued(accrued, {
      gold: resolved.loot.gold,
      xp: 0,
      drops: resolved.loot.drops,
      kills: 0,
      bossKills: 0,
    })
    const out = await prisma.$transaction(async (tx) => {
      const c = await tx.character.update({ where: { id: character.id }, data: staminaSpend })
      await tx.dungeonRun.update({
        where: { id: run.id },
        data: { cursor: nextIdx, pending: Prisma.DbNull, accrued: found as unknown as object },
      })
      return { stamina: c.stamina }
    })

    return NextResponse.json({
      resolved: pendingCleared,
      type: 'find',
      roll: resolved.roll,
      loot: resolved.loot,
      gold: resolved.loot.gold,
      cursor: nextIdx,
      stamina: out.stamina,
    })
  } catch (error) {
    console.error('Error stepping dungeon run:', error)
    return NextResponse.json({ error: 'Failed to step dungeon run' }, { status: 500 })
  }
}

// Drop por ABATE de cada monstro do pacote. O d20 do nó (pending.lootRoll) define
// a CLASSE do drop, então recuar depois de 1 abate num nó de sorte 20 ainda rende
// drop "classe 20". Boss é sempre sorte máxima (lootRoll 20 no resolveBossNode).
function rollKillDrops(dungeon: DungeonDef, pending: RunPending, tier: number): Record<string, LootDrop[]> {
  const out: Record<string, LootDrop[]> = {}
  for (const m of pendingMonsters(pending)) {
    out[m.id] = rollKillLoot(pending.kind, !!m.isBoss, dungeon.difficultyStars, tier, pending.lootRoll, dungeon)
  }
  return out
}
