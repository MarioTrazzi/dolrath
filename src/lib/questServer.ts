// 🗺️ Progresso de missões — lado servidor. As rotas de jogo emitem eventos
// PÓS-COMMIT e fire-and-forget: advanceQuestProgress(...).catch(() => {}).
// Nunca dentro da transação da rota — em Postgres um statement que falha aborta
// a transação INTEIRA, então o único fail-soft de verdade é depois do commit
// (mesmo padrão de addHistoryEntry). Pior caso: perde 1 incremento re-ganhável.
import { prisma } from '@/lib/prisma'
import { QUESTS_BY_EVENT, type QuestEventType, type QuestKind } from '@/lib/questCatalog'

export function utcDayKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10) // 'YYYY-MM-DD'
}

// Semana ISO 8601 (segunda-feira início): '2026-W29'.
export function utcWeekKey(d: Date = new Date()): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

export function periodKeyFor(kind: QuestKind, now: Date = new Date()): string {
  if (kind === 'DAILY') return utcDayKey(now)
  if (kind === 'WEEKLY') return utcWeekKey(now)
  return '' // TUTORIAL: linha única e permanente
}

export interface QuestEvent {
  type: QuestEventType
  amount?: number // modo increment (default 1)
  value?: number // modo 'max' (ex.: nível alcançado)
}

// Fail-soft: nunca lança. Evento sem missão ouvindo → retorna sem tocar o banco.
export async function advanceQuestProgress(characterId: string, event: QuestEvent): Promise<void> {
  try {
    const defs = QUESTS_BY_EVENT.get(event.type)
    if (!defs || defs.length === 0 || !characterId) return

    const now = new Date()
    for (const def of defs) {
      const periodKey = periodKeyFor(def.kind, now)
      const where = { characterId_questId_periodKey: { characterId, questId: def.id, periodKey } }

      if (def.objective.mode === 'max') {
        const value = Math.max(0, Math.floor(Number(event.value) || 0))
        if (value <= 0) continue
        await prisma.questProgress.upsert({
          where,
          create: { characterId, questId: def.id, periodKey, progress: value },
          update: {},
        })
        await prisma.questProgress.updateMany({
          where: { characterId, questId: def.id, periodKey, progress: { lt: value } },
          data: { progress: value },
        })
      } else {
        const amount = Math.max(0, Math.floor(Number(event.amount ?? 1)))
        if (amount <= 0) continue
        await prisma.questProgress.upsert({
          where,
          create: { characterId, questId: def.id, periodKey, progress: amount },
          update: { progress: { increment: amount } },
        })
      }

      // Marca conclusão (idempotente; o resgate revalida progress >= count de novo).
      await prisma.questProgress.updateMany({
        where: { characterId, questId: def.id, periodKey, completedAt: null, progress: { gte: def.objective.count } },
        data: { completedAt: now },
      })
    }
  } catch (err) {
    console.error('[quests] falha ao avançar progresso (ignorada):', err)
  }
}
