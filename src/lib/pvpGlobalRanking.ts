/**
 * Ranking GLOBAL da arena — permanente, sem ciclo, sem prêmio.
 *
 * A pontuação não pertence a temporada nenhuma: cada vitória entra no placar e
 * fica. Não há entressafra que pare de pontuar, nem inscrição que decida quem
 * pontua — quem luta, pontua.
 *
 * O modelo de TEMPORADA (src/lib/pvpRanking.ts, seasonPool.ts, seasonPayout.ts)
 * continua no repositório com os dados congelados, mas nada aqui o chama: o
 * sistema de recompensa será redesenhado do zero.
 */
import { prisma } from '@/lib/prisma'

/**
 * Credita UMA luta no placar global e fecha o ledger dela.
 *
 * `matchKey` presente = a rota de recompensas JÁ criou a linha PvpMatch (lock de
 * idempotência) e aqui só completamos as estatísticas.
 */
export async function applyGlobalMatchRating(opts: {
  matchKey?: string
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
    prisma.pvpGlobalRating.upsert({
      where: { characterId: opts.winnerId },
      create: {
        characterId: opts.winnerId,
        points: opts.winPoints,
        wins: 1,
        losses: 0,
      },
      update: {
        points: { increment: opts.winPoints },
        wins: { increment: 1 },
      },
    }),
    prisma.pvpGlobalRating.upsert({
      where: { characterId: opts.loserId },
      create: {
        characterId: opts.loserId,
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

  const matchStats = {
    winnerStaminaSpent: opts.winnerStaminaSpent,
    loserStaminaSpent: opts.loserStaminaSpent,
    winnerGold: opts.winnerGold,
    loserGold: opts.loserGold,
    winnerXp: opts.winnerXp,
    loserXp: opts.loserXp,
    winnerPoints: opts.winPoints,
    loserPoints: opts.lossPoints,
  }
  if (opts.matchKey) {
    await prisma.pvpMatch.update({ where: { matchKey: opts.matchKey }, data: matchStats })
  } else {
    // A luta global não tem seasonId (coluna opcional desde a migração
    // 20260816120000_pvp_global_rating).
    await prisma.pvpMatch.create({
      data: {
        winnerId: opts.winnerId,
        loserId: opts.loserId,
        ...matchStats,
      },
    })
  }

  return { winnerPoints: winnerRating.points, loserPoints: loserRating.points }
}

export async function getGlobalLeaderboard(
  limit = 50,
  opts: { includeBots?: boolean } = {}
) {
  const includeBots = opts.includeBots !== false
  return prisma.pvpGlobalRating.findMany({
    where: includeBots ? {} : { character: { user: { isBot: false } } },
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
          userId: true,
        },
      },
    },
  })
}
