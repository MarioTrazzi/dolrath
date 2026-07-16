/**
 * Ranking PvP — seasons, ratings, match history.
 */
import { prisma } from '@/lib/prisma'

const DEFAULT_SEASON_DAYS = 30
const DEFAULT_POT_DOL = Number(process.env.PVP_SEASON_POT_DOL || 1000)

export async function ensureActivePvpSeason() {
  const now = new Date()
  const active = await prisma.pvpSeason.findFirst({
    where: { status: 'active', startsAt: { lte: now }, endsAt: { gt: now } },
    orderBy: { startsAt: 'desc' },
  })
  if (active) return active

  // Close expired actives
  await prisma.pvpSeason.updateMany({
    where: { status: 'active', endsAt: { lte: now } },
    data: { status: 'ended' },
  })

  const startsAt = now
  const endsAt = new Date(now.getTime() + DEFAULT_SEASON_DAYS * 24 * 60 * 60 * 1000)
  const n = (await prisma.pvpSeason.count()) + 1
  return prisma.pvpSeason.create({
    data: {
      name: `Season ${n}`,
      startsAt,
      endsAt,
      potDol: DEFAULT_POT_DOL,
      status: 'active',
    },
  })
}

export async function applyPvpMatchRating(opts: {
  seasonId: string
  winnerId: string
  loserId: string
  winPoints: number
  lossPoints: number
  winnerStaminaSpent: number
  loserStaminaSpent: number
  winnerGold: number
  loserGold: number
  winnerXp: number
  loserXp: number
}): Promise<{ winnerPoints: number; loserPoints: number }> {
  const [winnerRating, loserRating] = await Promise.all([
    prisma.pvpRating.upsert({
      where: { characterId_seasonId: { characterId: opts.winnerId, seasonId: opts.seasonId } },
      create: {
        characterId: opts.winnerId,
        seasonId: opts.seasonId,
        points: opts.winPoints,
        wins: 1,
        losses: 0,
      },
      update: {
        points: { increment: opts.winPoints },
        wins: { increment: 1 },
      },
    }),
    prisma.pvpRating.upsert({
      where: { characterId_seasonId: { characterId: opts.loserId, seasonId: opts.seasonId } },
      create: {
        characterId: opts.loserId,
        seasonId: opts.seasonId,
        points: opts.lossPoints,
        wins: 0,
        losses: 1,
      },
      update: {
        points: { increment: opts.lossPoints },
        losses: { increment: 1 },
      },
    }),
  ])

  await prisma.pvpMatch.create({
    data: {
      seasonId: opts.seasonId,
      winnerId: opts.winnerId,
      loserId: opts.loserId,
      winnerStaminaSpent: opts.winnerStaminaSpent,
      loserStaminaSpent: opts.loserStaminaSpent,
      winnerGold: opts.winnerGold,
      loserGold: opts.loserGold,
      winnerXp: opts.winnerXp,
      loserXp: opts.loserXp,
      winnerPoints: opts.winPoints,
      loserPoints: opts.lossPoints,
    },
  })

  return { winnerPoints: winnerRating.points, loserPoints: loserRating.points }
}

export async function getLeaderboard(
  seasonId: string,
  limit = 50,
  opts: { includeBots?: boolean } = {}
) {
  const includeBots = opts.includeBots !== false
  return prisma.pvpRating.findMany({
    where: {
      seasonId,
      ...(includeBots ? {} : { character: { user: { isBot: false } } }),
    },
    orderBy: [{ points: 'desc' }, { wins: 'desc' }],
    take: limit,
    include: {
      character: {
        select: {
          id: true,
          name: true,
          level: true,
          class: true,
          race: true,
          avatar: true,
        },
      },
    },
  })
}
