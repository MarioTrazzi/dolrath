import { NextResponse } from 'next/server'
import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { getSeasonEntryStats, getSeasonPot, getTournamentVaultBalance } from '@/lib/seasonPool'

/**
 * Painel de operação da temporada: o que precisa ser pago, para qual carteira,
 * e como está o cofre de torneios. Até aqui isso só era visível por curl.
 */
function isAdmin(userId?: string | null): boolean {
  const admins = (process.env.ADMIN_USER_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return !!(userId && admins.includes(userId))
}

export async function GET() {
  const session = await auth()
  if (!isAdmin(session?.user?.id)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const seasons = await prisma.pvpSeason.findMany({
    orderBy: { startsAt: 'desc' },
    take: 8,
  })

  const detailed = await Promise.all(
    seasons.map(async (season) => {
      const [payouts, stats] = await Promise.all([
        prisma.pvpSeasonPayout.findMany({
          where: { seasonId: season.id },
          orderBy: { rank: 'asc' },
        }),
        getSeasonEntryStats(season.id),
      ])

      const characterIds = payouts.map((p) => p.characterId)
      const characters = characterIds.length
        ? await prisma.character.findMany({
            where: { id: { in: characterIds } },
            select: { id: true, name: true },
          })
        : []
      const nameById = new Map(characters.map((c) => [c.id, c.name]))

      return {
        id: season.id,
        name: season.name,
        status: season.status,
        startsAt: season.startsAt,
        endsAt: season.endsAt,
        potDol: getSeasonPot(season),
        seededDol: season.potDol,
        fundedDol: season.fundedDol,
        entries: stats.entries,
        competingAccounts: stats.users,
        payouts: payouts.map((p) => ({
          id: p.id,
          rank: p.rank,
          characterId: p.characterId,
          characterName: nameById.get(p.characterId) ?? p.characterId,
          points: p.points,
          dolAmount: p.dolAmount,
          walletAddress: p.walletAddress,
          status: p.status,
          txHash: p.txHash,
        })),
      }
    })
  )

  return NextResponse.json({
    seasons: detailed,
    tournamentVaultDol: await getTournamentVaultBalance(),
  })
}
