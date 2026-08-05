/**
 * Ranking PvP — seasons, ratings, match history.
 */
import { prisma } from '@/lib/prisma'
import { PVP_PAYOUT_MIN_MATCHES, PVP_PAYOUT_SLOTS } from '@/lib/pvpRewards'

/**
 * Duração da temporada. A temporada é longa de propósito: o marco de
 * encerramento é "arma + armadura principais em TET, resto do set em +15",
 * ~90-100 dias de jogo dedicado (docs/balance-report-launch.md). A temporada 1
 * roda mais tempo porque todo mundo começa do zero — é criada explicitamente
 * pelo seed, não por este caminho.
 */
const DEFAULT_SEASON_DAYS = Number(process.env.PVP_SEASON_DAYS || 90)

/** Entressafra: janela sem pontuação entre temporadas. Nela roda o pagamento
 *  do top 20, o torneio de encerramento e a inscrição da próxima. */
export const OFFSEASON_DAYS = Number(process.env.PVP_OFFSEASON_DAYS || 7)

/** Aporte do estúdio. Zero por padrão: a pool é lastreada no que os jogadores
 *  pagaram (criação + inscrição), não num número de env. */
const DEFAULT_POT_DOL = Number(process.env.PVP_SEASON_POT_DOL || 0)

/**
 * Temporada corrente para efeito de pontuação e inscrição — `active` ou
 * `offseason`. Durante a entressafra o PvP roda e paga ouro/XP, mas nada
 * pontua (quem consulta deve checar `status`).
 */
export async function ensureActivePvpSeason() {
  const now = new Date()
  const current = await prisma.pvpSeason.findFirst({
    where: { status: { in: ['active', 'offseason'] }, startsAt: { lte: now }, endsAt: { gt: now } },
    orderBy: { startsAt: 'desc' },
  })
  if (current) return current

  // Temporada ativa que passou do fim entra em entressafra em vez de morrer
  // direto: é a janela em que o top 20 é pago sem corrida com partidas novas.
  // O cron (api/cron/season) é quem tira dela; este caminho é só a rede de
  // segurança para quando ninguém tiver jogado desde o vencimento.
  const expired = await prisma.pvpSeason.findFirst({
    where: { status: 'active', endsAt: { lte: now } },
    orderBy: { endsAt: 'desc' },
  })
  if (expired) {
    const offseasonEnd = new Date(expired.endsAt.getTime() + OFFSEASON_DAYS * 86_400_000)
    if (offseasonEnd > now) {
      return prisma.pvpSeason.update({
        where: { id: expired.id },
        data: { status: 'offseason', endsAt: offseasonEnd },
      })
    }
    await prisma.pvpSeason.update({ where: { id: expired.id }, data: { status: 'ended' } })
  }

  await prisma.pvpSeason.updateMany({
    where: { status: { in: ['active', 'offseason'] }, endsAt: { lte: now } },
    data: { status: 'ended' },
  })

  const startsAt = now
  const endsAt = new Date(now.getTime() + DEFAULT_SEASON_DAYS * 86_400_000)
  const n = (await prisma.pvpSeason.count()) + 1
  return prisma.pvpSeason.create({
    data: {
      name: `Temporada ${n}`,
      startsAt,
      endsAt,
      potDol: DEFAULT_POT_DOL,
      status: 'active',
    },
  })
}

/** A temporada está pontuando? Entressafra roda o mundo normal, mas sem placar. */
export function isScoringSeason(season: { status: string }): boolean {
  return season.status === 'active'
}

/**
 * Garante a próxima temporada AGENDADA (startsAt no futuro), criada no início
 * da entressafra. É ela que recebe as inscrições e o dinheiro de personagens
 * criados durante a janela — sem isso, quem entra no jogo na entressafra
 * pagaria para uma temporada que está sendo encerrada.
 *
 * Como `startsAt > now`, `ensureActivePvpSeason` não a escolhe antes da hora.
 */
export async function ensureUpcomingSeason(previous: { id: string; endsAt: Date }) {
  const existing = await prisma.pvpSeason.findFirst({
    where: { startsAt: { gte: previous.endsAt } },
    orderBy: { startsAt: 'asc' },
  })
  if (existing) return existing

  const startsAt = previous.endsAt
  const n = (await prisma.pvpSeason.count()) + 1
  return prisma.pvpSeason.create({
    data: {
      name: `Temporada ${n}`,
      startsAt,
      endsAt: new Date(startsAt.getTime() + DEFAULT_SEASON_DAYS * 86_400_000),
      potDol: DEFAULT_POT_DOL,
      status: 'active',
    },
  })
}

/**
 * A temporada que está VENDENDO inscrição agora. Fora da entressafra é a
 * corrente; dentro dela, a que vem — é para lá que vão a inscrição e o DOL.
 */
export async function resolveEnrollmentSeason() {
  const current = await ensureActivePvpSeason()
  if (current.status === 'active' && current.startsAt <= new Date()) return current
  return ensureUpcomingSeason(current)
}

export async function applyPvpMatchRating(opts: {
  /** Quando presente, a rota de recompensas JÁ criou a linha PvpMatch (lock de idempotência) — só atualizamos. */
  matchKey?: string
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
    // A linha já existe (lock criado antes do crédito) — completa as estatísticas.
    await prisma.pvpMatch.update({ where: { matchKey: opts.matchKey }, data: matchStats })
  } else {
    await prisma.pvpMatch.create({
      data: {
        seasonId: opts.seasonId,
        winnerId: opts.winnerId,
        loserId: opts.loserId,
        ...matchStats,
      },
    })
  }

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
          userId: true,
        },
      },
    },
  })
}

export type PayoutRow = {
  characterId: string
  userId: string
  name: string
  points: number
  wins: number
  losses: number
}

/**
 * Quem de fato recebe DOL no fim da temporada. Difere do leaderboard visual em
 * três regras, todas por causa do dinheiro real:
 *
 *  1. **Inscritos apenas** — quem não pagou a inscrição joga e ganha ouro/XP,
 *     mas não disputa a pool que não ajudou a formar.
 *  2. **Piso de partidas** (`PVP_PAYOUT_MIN_MATCHES`) — evita prêmio com uma
 *     vitória solitária numa temporada magra.
 *  3. **Um prêmio por CONTA** — colapsa por userId mantendo o herói de maior
 *     pontuação. A inscrição é por personagem, então inscrever cinco heróis
 *     custa cinco e ainda rende no máximo um prêmio: multi-boxing vira doação
 *     para a pool em vez de estratégia de varrer o top.
 *
 * Bots (`isBot`) pontuam e aparecem no board visual, mas nunca recebem.
 */
export async function getPayoutBoard(seasonId: string, slots = PVP_PAYOUT_SLOTS): Promise<PayoutRow[]> {
  const rows = await prisma.pvpRating.findMany({
    where: {
      seasonId,
      character: {
        user: { isBot: false },
        pvpSeasonEntries: { some: { seasonId } },
      },
    },
    orderBy: [{ points: 'desc' }, { wins: 'desc' }],
    include: { character: { select: { id: true, name: true, userId: true } } },
  })

  const bestPerUser = new Map<string, PayoutRow>()
  for (const row of rows) {
    if (row.wins + row.losses < PVP_PAYOUT_MIN_MATCHES) continue
    const userId = row.character.userId
    // rows já vem ordenado por pontos: o primeiro de cada conta é o melhor.
    if (bestPerUser.has(userId)) continue
    bestPerUser.set(userId, {
      characterId: row.characterId,
      userId,
      name: row.character.name,
      points: row.points,
      wins: row.wins,
      losses: row.losses,
    })
  }

  return Array.from(bestPerUser.values()).slice(0, slots)
}
