import { NextResponse } from 'next/server'
import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { ensureActivePvpSeason, getLeaderboard } from '@/lib/pvpRanking'
import { PVP_TOP10_DOL_SPLIT } from '@/lib/pvpRewards'

export async function GET() {
  try {
    const season = await ensureActivePvpSeason()
    const board = await getLeaderboard(season.id, 50)

    const session = await auth()
    let me: {
      characterId: string
      name: string
      points: number
      wins: number
      losses: number
      rank: number | null
    } | null = null

    if (session?.user?.id) {
      const chars = await prisma.character.findMany({
        where: { userId: session.user.id },
        select: { id: true, name: true },
      })
      const ids = chars.map((c) => c.id)
      if (ids.length) {
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
          me = {
            characterId: ratings[0].characterId,
            name: char?.name ?? '—',
            points: ratings[0].points,
            wins: ratings[0].wins,
            losses: ratings[0].losses,
            rank: above + 1,
          }
        }
      }
    }

    const pot = season.potDol
    const top10Preview = PVP_TOP10_DOL_SPLIT.map((pct, i) => ({
      rank: i + 1,
      dol: Math.round(pot * pct * 100) / 100,
      pct,
    }))

    return NextResponse.json({
      season: {
        id: season.id,
        name: season.name,
        startsAt: season.startsAt,
        endsAt: season.endsAt,
        potDol: season.potDol,
        status: season.status,
      },
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
      top10Preview,
    })
  } catch (e) {
    console.error('ranking GET', e)
    return NextResponse.json({ error: 'Failed to load ranking' }, { status: 500 })
  }
}
