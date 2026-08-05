import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { ensureActivePvpSeason, getLeaderboard, isScoringSeason } from '@/lib/pvpRanking'
import { PVP_PAYOUT_MIN_MATCHES, PVP_SEASON_DOL_SPLIT } from '@/lib/pvpRewards'
import {
  SEASON_ENTRY_DOL,
  getDistributablePot,
  getSeasonEntryStats,
  getSeasonPot,
} from '@/lib/seasonPool'

// Lê searchParams (temporada consultada) e a sessão do jogador — nunca estático.
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const seasonId = request.nextUrl.searchParams.get('season')

    // Temporadas passadas ficam consultáveis: o ciclo agora dura meses e tem
    // entressafra, então "a ativa" não é mais a única coisa que interessa ver.
    const season = seasonId
      ? await prisma.pvpSeason.findUnique({ where: { id: seasonId } })
      : await ensureActivePvpSeason()

    if (!season) {
      return NextResponse.json({ error: 'Season not found' }, { status: 404 })
    }

    const [board, entryStats, seasons] = await Promise.all([
      getLeaderboard(season.id, 50),
      getSeasonEntryStats(season.id),
      prisma.pvpSeason.findMany({
        orderBy: { startsAt: 'desc' },
        take: 12,
        select: { id: true, name: true, status: true, startsAt: true, endsAt: true },
      }),
    ])

    const session = await auth()
    let me: {
      characterId: string
      name: string
      points: number
      wins: number
      losses: number
      rank: number | null
      enrolled: boolean
      matchesToEligible: number
    } | null = null
    let myEnrolledCharacterIds: string[] = []

    if (session?.user?.id) {
      const chars = await prisma.character.findMany({
        where: { userId: session.user.id },
        select: { id: true, name: true },
      })
      const ids = chars.map((c) => c.id)

      if (ids.length) {
        const entries = await prisma.pvpSeasonEntry.findMany({
          where: { seasonId: season.id, characterId: { in: ids } },
          select: { characterId: true },
        })
        myEnrolledCharacterIds = entries.map((e) => e.characterId)

        const ratings = await prisma.pvpRating.findMany({
          where: { seasonId: season.id, characterId: { in: ids } },
          orderBy: { points: 'desc' },
        })
        if (ratings[0]) {
          const above = await prisma.pvpRating.count({
            where: {
              seasonId: season.id,
              OR: [
                { points: { gt: ratings[0].points } },
                { points: ratings[0].points, wins: { gt: ratings[0].wins } },
              ],
            },
          })
          const char = chars.find((c) => c.id === ratings[0].characterId)
          const played = ratings[0].wins + ratings[0].losses
          me = {
            characterId: ratings[0].characterId,
            name: char?.name ?? '—',
            points: ratings[0].points,
            wins: ratings[0].wins,
            losses: ratings[0].losses,
            rank: above + 1,
            enrolled: myEnrolledCharacterIds.includes(ratings[0].characterId),
            matchesToEligible: Math.max(0, PVP_PAYOUT_MIN_MATCHES - played),
          }
        }
      }
    }

    const pot = getSeasonPot(season)
    const distributable = getDistributablePot(season)
    const payoutPreview = PVP_SEASON_DOL_SPLIT.map((pct, i) => ({
      rank: i + 1,
      dol: Math.round(distributable * pct * 100) / 100,
      pct,
    }))

    return NextResponse.json({
      season: {
        id: season.id,
        name: season.name,
        startsAt: season.startsAt,
        endsAt: season.endsAt,
        status: season.status,
        scoring: isScoringSeason(season),
        // A pool é lastreada em DOL: potDol é o aporte extra do estúdio,
        // fundedDol é a soma das inscrições (criação + avulsas).
        potDol: pot,
        seededDol: season.potDol,
        fundedDol: season.fundedDol,
        entries: entryStats.entries,
        competingAccounts: entryStats.users,
      },
      entryCostDol: SEASON_ENTRY_DOL,
      minMatchesForPayout: PVP_PAYOUT_MIN_MATCHES,
      leaderboard: board.map((r, i) => ({
        rank: i + 1,
        characterId: r.characterId,
        name: r.character.name,
        level: r.character.level,
        class: r.character.class,
        race: r.character.race,
        avatar: r.character.avatar,
        points: r.points,
        wins: r.wins,
        losses: r.losses,
      })),
      me,
      myEnrolledCharacterIds,
      payoutPreview,
      seasons,
    })
  } catch (e) {
    console.error('ranking GET', e)
    return NextResponse.json({ error: 'Failed to load ranking' }, { status: 500 })
  }
}
