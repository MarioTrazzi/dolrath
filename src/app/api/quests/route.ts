import { NextResponse } from 'next/server'
import { requireApiActor } from '@/lib/botFleetAuth'
import { prisma } from '@/lib/prisma'
import { DAILY_QUESTS, TUTORIAL_QUESTS, dailyLoginGold, type QuestDef } from '@/lib/questCatalog'
import { periodKeyFor, utcDayKey } from '@/lib/questServer'

export const dynamic = 'force-dynamic'

// 🗺️ Estado das missões do personagem + login diário da conta, numa chamada só.
// Tutorial: devolve apenas a PRÓXIMA missão não resgatada da cadeia (a UI guia
// um passo por vez); diárias: todas, com progresso do dia UTC corrente.
export async function GET(req: Request) {
  const resolved = await requireApiActor(req)
  if ('error' in resolved) return resolved.error
  const userId = resolved.actor.userId

  try {
    const url = new URL(req.url)
    const characterId = url.searchParams.get('characterId')
    if (!characterId) {
      return NextResponse.json({ error: 'characterId é obrigatório' }, { status: 400 })
    }
    const character = await prisma.character.findFirst({ where: { id: characterId, userId }, select: { id: true } })
    if (!character) {
      return NextResponse.json({ error: 'Personagem não encontrado' }, { status: 404 })
    }

    const now = new Date()
    const dayKey = utcDayKey(now)
    const yesterdayKey = utcDayKey(new Date(now.getTime() - 86400000))

    const [rows, todayClaim, yesterdayClaim] = await Promise.all([
      prisma.questProgress.findMany({
        where: { characterId, periodKey: { in: ['', dayKey] } },
      }),
      prisma.dailyLoginClaim.findUnique({ where: { userId_dayKey: { userId, dayKey } } }),
      prisma.dailyLoginClaim.findUnique({ where: { userId_dayKey: { userId, dayKey: yesterdayKey } } }),
    ])

    const byKey = new Map(rows.map((r) => [`${r.questId}|${r.periodKey}`, r]))
    const view = (def: QuestDef) => {
      const row = byKey.get(`${def.id}|${periodKeyFor(def.kind, now)}`)
      const progress = Math.min(row?.progress ?? 0, def.objective.count)
      const claimed = !!row?.claimedAt
      return {
        id: def.id,
        kind: def.kind,
        title: def.title,
        description: def.description,
        icon: def.icon,
        objective: { count: def.objective.count },
        rewards: def.rewards,
        href: def.href ?? null,
        progress,
        claimed,
        claimable: !claimed && progress >= def.objective.count,
      }
    }

    const tutorialViews = TUTORIAL_QUESTS.map(view)
    const current = tutorialViews.find((q) => !q.claimed) ?? null
    const dailies = DAILY_QUESTS.map(view)

    // Streak exibida: se hoje já resgatou, a de hoje; senão, a que o resgate criaria.
    const nextStreak = todayClaim ? todayClaim.streak : (yesterdayClaim?.streak ?? 0) + 1
    const dailyLogin = {
      claimedToday: !!todayClaim,
      streak: nextStreak,
      nextGold: todayClaim ? dailyLoginGold(todayClaim.streak + 1) : dailyLoginGold(nextStreak),
    }

    const claimableCount =
      tutorialViews.filter((q) => q.claimable).length +
      dailies.filter((q) => q.claimable).length +
      (todayClaim ? 0 : 1)

    return NextResponse.json({
      tutorial: {
        current,
        completedCount: tutorialViews.filter((q) => q.claimed).length,
        total: tutorialViews.length,
        done: current === null,
      },
      dailies,
      dailyLogin,
      claimableCount,
    })
  } catch (error) {
    console.error('Error loading quests:', error)
    return NextResponse.json({ error: 'Failed to load quests' }, { status: 500 })
  }
}
