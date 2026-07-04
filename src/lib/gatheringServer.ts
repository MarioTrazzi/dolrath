// ============================================================
// COLETA SERVIDOR-AUTORITATIVA — núcleo compartilhado pelas rotas
// /api/gather/{start,status,collect,stop}.
//
// Mesma regra de ouro da masmorra (dungeonRunServer.ts): o SERVIDOR é dono do
// relógio (tiques), do sorteio de itens e do crédito de XP/stamina. O cliente
// só pergunta ("sincroniza") e age ("coletar", "encerrar") — nunca envia o
// valor do rendimento.
//
// O tempo é resolvido LAZY (sem cron): cada sync computa os tiques decorridos
// desde session.lastTickAt, debita a stamina, sorteia o rendimento e acumula
// em pendingYield. Enquanto a sessão está ATIVA, o regen passivo do personagem
// fica suspenso (guard em staminaServer.regenAndPersist) — o relógio daqui é a
// única autoridade da stamina do coletor.
// ============================================================

import type { Prisma, GatheringSession } from '@prisma/client'
import { prisma } from './prisma'
import {
  computeGatherTicks,
  getGatherField,
  mergePendingYield,
  rollGatherYield,
  GATHER_TICK_SECONDS,
  GATHER_TICK_STAMINA,
  type GatherFieldId,
  type PendingYield,
} from './gathering'
import { getProfessionLevel } from './professionSystem'
import { addDropToInventoryTx } from './dungeonRunServer'

export type { PendingYield }

export interface SyncedGathering {
  session: GatheringSession
  pending: PendingYield
  /** Stamina do personagem após debitar os tiques computados agora. */
  stamina: number
  /** Segundos até o próximo tique render (0 se esgotada). */
  secondsToNextTick: number
}

function readPending(session: GatheringSession): PendingYield {
  const p = session.pendingYield as PendingYield | null
  return p && Array.isArray(p.drops)
    ? p
    : { drops: [], xp: 0, ticks: 0 }
}

/**
 * Sincroniza uma sessão ATIVA: computa os tiques decorridos, debita stamina,
 * sorteia o rendimento e acumula em pendingYield. Idempotente — sem tique
 * completo decorrido, nada muda. Retorna a sessão e a stamina atualizadas.
 */
export async function syncGatheringSession(
  session: GatheringSession,
  now: Date = new Date(),
): Promise<SyncedGathering> {
  const character = await prisma.character.findUnique({
    where: { id: session.characterId },
    select: { stamina: true, gatherXp: true },
  })
  if (!character || session.status !== 'active') {
    return {
      session,
      pending: readPending(session),
      stamina: character?.stamina ?? 0,
      secondsToNextTick: 0,
    }
  }

  const tick = computeGatherTicks({ lastTickAt: session.lastTickAt, stamina: character.stamina, now })

  if (tick.ticks <= 0) {
    // Sem tique novo; ainda assim marca esgotamento se a stamina não paga o próximo.
    if (tick.exhausted) {
      const updated = await prisma.gatheringSession.update({
        where: { id: session.id },
        data: { status: 'exhausted' },
      })
      return { session: updated, pending: readPending(updated), stamina: character.stamina, secondsToNextTick: 0 }
    }
    const elapsed = (now.getTime() - session.lastTickAt.getTime()) / 1000
    return {
      session,
      pending: readPending(session),
      stamina: character.stamina,
      secondsToNextTick: Math.max(0, Math.ceil(GATHER_TICK_SECONDS - elapsed)),
    }
  }

  const gatherLevel = getProfessionLevel(character.gatherXp)
  const yielded = rollGatherYield(session.fieldId as GatherFieldId, gatherLevel, tick.ticks)
  const pending = mergePendingYield(readPending(session), yielded, tick.ticks)

  const [updated] = await prisma.$transaction([
    prisma.gatheringSession.update({
      where: { id: session.id },
      data: {
        lastTickAt: tick.anchor,
        pendingYield: pending as unknown as Prisma.InputJsonValue,
        ...(tick.exhausted ? { status: 'exhausted' } : {}),
      },
    }),
    prisma.character.update({
      where: { id: session.characterId },
      data: {
        stamina: { decrement: tick.staminaSpent },
        // Âncora no último tique: quando a sessão esgota/encerra, o regen
        // passivo volta a contar a partir do fim do trabalho.
        staminaUpdatedAt: tick.anchor,
      },
    }),
  ])

  const stamina = character.stamina - tick.staminaSpent
  return {
    session: updated,
    pending,
    stamina,
    secondsToNextTick: tick.exhausted || stamina < GATHER_TICK_STAMINA
      ? 0
      : Math.max(0, Math.ceil(GATHER_TICK_SECONDS - (now.getTime() - tick.anchor.getTime()) / 1000)),
  }
}

/** Sessão em aberto (ativa ou esgotada aguardando coleta) do personagem. */
export async function findOpenGatheringSession(characterId: string): Promise<GatheringSession | null> {
  return prisma.gatheringSession.findFirst({
    where: { characterId, status: { in: ['active', 'exhausted'] } },
    orderBy: { createdAt: 'desc' },
  })
}

export interface CollectResult {
  /** Itens efetivamente depositados no inventário. */
  deposited: { name: string; qty: number }[]
  /** Itens que NÃO couberam (inventário cheio) e continuam pendentes/descartados. */
  skipped: { name: string; qty: number }[]
  xpGained: number
  gatherXp: number
}

/**
 * Deposita o pendente no inventário (o que couber) e credita o gatherXp.
 * - `mode: 'collect'`: a sessão segue rodando (ativa) ou aguardando (esgotada
 *   com sobras); o que não coube permanece em pendingYield. Sessão esgotada
 *   SEM sobras fecha sozinha ('collected') — nada mais a fazer nela.
 * - `mode: 'stop'`: encerra sempre; o que não coube é DESCARTADO e reportado
 *   em `skipped` para a UI avisar.
 */
export async function collectGatheringSession(
  session: GatheringSession,
  mode: 'collect' | 'stop',
): Promise<CollectResult & { closed: boolean }> {
  const pending = readPending(session)

  return prisma.$transaction(async (tx) => {
    const deposited: { name: string; qty: number }[] = []
    const skipped: { name: string; qty: number }[] = []

    for (const drop of pending.drops) {
      // Tenta a pilha inteira; addDropToInventoryTx empilha consumível numa
      // linha só, então ou entra tudo (1 slot no máximo) ou não entra nada.
      const ok = await addDropToInventoryTx(tx, session.characterId, { name: drop.name, qty: drop.qty })
      if (ok) deposited.push(drop)
      else skipped.push(drop)
    }

    const xpGained = pending.xp
    const character = await tx.character.update({
      where: { id: session.characterId },
      data: { gatherXp: { increment: xpGained } },
      select: { gatherXp: true },
    })

    const closed = mode === 'stop' || (session.status === 'exhausted' && skipped.length === 0)
    const leftover: PendingYield = mode === 'stop'
      ? { drops: [], xp: 0, ticks: 0 }
      : { drops: skipped, xp: 0, ticks: 0 }

    await tx.gatheringSession.update({
      where: { id: session.id },
      data: {
        pendingYield: leftover as unknown as Prisma.InputJsonValue,
        ...(closed ? { status: 'collected' } : {}),
      },
    })

    return { deposited, skipped, xpGained, gatherXp: character.gatherXp, closed }
  })
}
