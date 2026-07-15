import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { addExperienceToCharacter } from '@/lib/characterLevelSystem'
import { addHistoryEntry } from '@/lib/characterHistory'
import { regenAndPersist } from '@/lib/staminaServer'
import { calculatePvpStaminaRewards, PVP_RANK_LOSS_POINTS, PVP_RANK_WIN_POINTS } from '@/lib/pvpRewards'
import { dungeonDailyGoldCap } from '@/lib/dungeonRunServer'
import { ensureActivePvpSeason, applyPvpMatchRating } from '@/lib/pvpRanking'
import { ActivityType } from '@prisma/client'

interface BattleResult {
  winnerId: string
  loserId: string
  winnerLevel?: number
  loserLevel?: number
  battleType?: 'pvp' | 'pve'
  isFlawlessVictory?: boolean
  winnerTransformed?: boolean
  loserTransformed?: boolean
  winnerStaminaSpent?: number
  loserStaminaSpent?: number
  updateRanking?: boolean
}

function isServiceCall(request: NextRequest): boolean {
  const secret = process.env.BATTLE_REWARDS_SECRET
  if (!secret) return false
  return request.headers.get('x-battle-secret') === secret
}

async function pvpGoldEmittedToday(userId: string): Promise<number> {
  const gte = new Date()
  gte.setUTCHours(0, 0, 0, 0)
  const agg = await prisma.characterHistory.aggregate({
    _sum: { goldAmount: true },
    where: {
      createdAt: { gte },
      goldAmount: { gt: 0 },
      description: { startsWith: 'PvP' },
      character: { userId },
    },
  })
  return agg._sum.goldAmount ?? 0
}

async function dungeonGoldEmittedToday(userId: string): Promise<number> {
  const gte = new Date()
  gte.setUTCHours(0, 0, 0, 0)
  const [runs, sales] = await Promise.all([
    prisma.dungeonRun.aggregate({ _sum: { goldEarned: true }, where: { userId, createdAt: { gte } } }),
    prisma.goldSale.aggregate({ _sum: { amount: true }, where: { userId, createdAt: { gte } } }),
  ])
  return (runs._sum.goldEarned ?? 0) + (sales._sum.amount ?? 0)
}

async function dailyGoldRemaining(userId: string): Promise<number> {
  const used = (await dungeonGoldEmittedToday(userId)) + (await pvpGoldEmittedToday(userId))
  return Math.max(0, dungeonDailyGoldCap() - used)
}

export async function POST(request: NextRequest) {
  const service = isServiceCall(request)
  const session = service ? null : await auth()
  if (!service && !session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const battleResult: BattleResult = await request.json()

    if (!battleResult.winnerId || !battleResult.loserId) {
      return NextResponse.json({ error: 'Missing battle result data' }, { status: 400 })
    }

    const [winner, loser] = await Promise.all([
      prisma.character.findUnique({ where: { id: battleResult.winnerId } }),
      prisma.character.findUnique({ where: { id: battleResult.loserId } }),
    ])

    if (!winner || !loser) {
      return NextResponse.json({ error: 'Characters not found' }, { status: 404 })
    }

    if (!service) {
      const userId = session!.user!.id
      if (winner.userId !== userId && loser.userId !== userId) {
        return NextResponse.json({ error: 'Unauthorized for these characters' }, { status: 403 })
      }
    }

    const dedupWindow = new Date(Date.now() - 120_000)
    const alreadyCredited = await prisma.characterHistory.findFirst({
      where: {
        characterId: battleResult.winnerId,
        description: { startsWith: `PvP Victory vs ${loser.name}` },
        createdAt: { gte: dedupWindow },
      },
      select: { id: true },
    })
    if (alreadyCredited) {
      return NextResponse.json({
        success: true,
        deduped: true,
        winner: { id: battleResult.winnerId, xpGained: 0, goldGained: 0, leveledUp: false, newLevel: winner.level },
        loser: { id: battleResult.loserId, xpGained: 0, goldGained: 0, leveledUp: false, newLevel: loser.level },
      })
    }

    const winnerLevel = winner.level
    const loserLevel = loser.level

    const startOfDay = new Date()
    startOfDay.setUTCHours(0, 0, 0, 0)
    const winsToday = await prisma.characterHistory.count({
      where: {
        characterId: battleResult.winnerId,
        createdAt: { gte: startOfDay },
        description: { startsWith: 'PvP Victory' },
      },
    })
    const isFirstWin = winsToday === 0

    const winnerStaWanted = Math.max(0, Math.floor(Number(battleResult.winnerStaminaSpent) || 0))
    const loserStaWanted = Math.max(0, Math.floor(Number(battleResult.loserStaminaSpent) || 0))

    const chargeStamina = async (char: typeof winner, amount: number): Promise<number> => {
      if (!char || amount <= 0) return 0
      const { stamina } = await regenAndPersist(char as Parameters<typeof regenAndPersist>[0])
      const charge = Math.min(stamina, amount)
      await prisma.character.update({
        where: { id: char.id },
        data: { stamina: Math.max(0, stamina - charge), staminaUpdatedAt: new Date() },
      })
      return charge
    }

    const [winnerCharged, loserCharged] = await Promise.all([
      chargeStamina(winner, winnerStaWanted),
      chargeStamina(loser, loserStaWanted),
    ])

    const calc = calculatePvpStaminaRewards({
      winnerStaminaSpent: winnerCharged,
      loserStaminaSpent: loserCharged,
      isFlawless: battleResult.isFlawlessVictory,
      killTransformed: battleResult.loserTransformed,
      isFirstWinOfDay: isFirstWin,
      winnerLevel,
      loserLevel,
    })

    // Cap diário compartilhado com masmorra
    const [wRemain, lRemain] = await Promise.all([
      dailyGoldRemaining(winner.userId),
      dailyGoldRemaining(loser.userId),
    ])
    const winnerGold = Math.min(calc.winner.gold, wRemain)
    const loserGold = Math.min(calc.loser.gold, lRemain)
    const winnerXp = calc.winner.xp
    const loserXp = calc.loser.xp

    const [winnerXpResult] = await Promise.all([
      addExperienceToCharacter(battleResult.winnerId, winnerXp),
      winnerGold > 0
        ? prisma.character.update({
            where: { id: battleResult.winnerId },
            data: { gold: { increment: winnerGold } },
          })
        : Promise.resolve(),
    ])

    const [loserXpResult] = await Promise.all([
      addExperienceToCharacter(battleResult.loserId, loserXp),
      loserGold > 0
        ? prisma.character.update({
            where: { id: battleResult.loserId },
            data: { gold: { increment: loserGold } },
          })
        : Promise.resolve(),
    ])

    try {
      await Promise.all([
        addHistoryEntry({
          characterId: battleResult.winnerId,
          activityType: winnerXpResult.leveledUp ? ActivityType.LEVEL_UP : ActivityType.XP_GAINED,
          description: `PvP Victory vs ${loser.name} (−${winnerCharged} STA)`,
          xpAmount: winnerXp,
          goldAmount: winnerGold,
          oldLevel: winnerXpResult.leveledUp ? winnerLevel : undefined,
          newLevel: winnerXpResult.leveledUp ? winnerXpResult.newLevelInfo.level : undefined,
          details: { action: 'pvp_victory', staminaCharged: winnerCharged },
        }),
        addHistoryEntry({
          characterId: battleResult.loserId,
          activityType: loserXpResult.leveledUp ? ActivityType.LEVEL_UP : ActivityType.XP_GAINED,
          description: `PvP Defeat vs ${winner.name} (−${loserCharged} STA)`,
          xpAmount: loserXp,
          goldAmount: loserGold,
          oldLevel: loserXpResult.leveledUp ? loserLevel : undefined,
          newLevel: loserXpResult.leveledUp ? loserXpResult.newLevelInfo.level : undefined,
          details: { action: 'pvp_defeat', staminaCharged: loserCharged },
        }),
      ])
    } catch (histErr) {
      console.error('PvP history write failed:', histErr)
    }

    // Ranking (Fase 2) — best-effort
    let ranking: { winnerPoints?: number; loserPoints?: number } = {}
    if (battleResult.updateRanking !== false) {
      try {
        const season = await ensureActivePvpSeason()
        ranking = await applyPvpMatchRating({
          seasonId: season.id,
          winnerId: battleResult.winnerId,
          loserId: battleResult.loserId,
          winPoints: PVP_RANK_WIN_POINTS,
          lossPoints: PVP_RANK_LOSS_POINTS,
          winnerStaminaSpent: winnerCharged,
          loserStaminaSpent: loserCharged,
          winnerGold,
          loserGold,
          winnerXp,
          loserXp,
        })
      } catch (rankErr) {
        console.error('PvP ranking update failed:', rankErr)
      }
    }

    return NextResponse.json({
      success: true,
      winner: {
        id: battleResult.winnerId,
        xpGained: winnerXp,
        goldGained: winnerGold,
        leveledUp: winnerXpResult.leveledUp,
        newLevel: winnerXpResult.newLevelInfo?.level ?? winnerLevel,
        staminaCharged: winnerCharged,
        rankPoints: ranking.winnerPoints,
      },
      loser: {
        id: battleResult.loserId,
        xpGained: loserXp,
        goldGained: loserGold,
        leveledUp: loserXpResult.leveledUp,
        newLevel: loserXpResult.newLevelInfo?.level ?? loserLevel,
        staminaCharged: loserCharged,
        rankPoints: ranking.loserPoints,
      },
    })
  } catch (error) {
    console.error('Battle rewards error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
