import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { getLeaderboard } from '@/lib/pvpRanking'
import { PVP_TOP10_DOL_SPLIT } from '@/lib/pvpRewards'

/**
 * Snapshot top 10 payouts for an ended season.
 * Auth: session admin (ADMIN_WALLETS / ADMIN_USER_IDS) OR x-battle-secret.
 */
function isAuthorized(request: NextRequest, userId?: string | null): boolean {
  const secret = process.env.BATTLE_REWARDS_SECRET
  if (secret && request.headers.get('x-battle-secret') === secret) return true
  const admins = (process.env.ADMIN_USER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean)
  return !!(userId && admins.includes(userId))
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!isAuthorized(request, session?.user?.id)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const seasonId = body.seasonId as string | undefined

    const season = seasonId
      ? await prisma.pvpSeason.findUnique({ where: { id: seasonId } })
      : await prisma.pvpSeason.findFirst({
          where: { status: { in: ['active', 'ended'] } },
          orderBy: { endsAt: 'desc' },
        })

    if (!season) {
      return NextResponse.json({ error: 'Season not found' }, { status: 404 })
    }

    if (season.status === 'paid') {
      const existing = await prisma.pvpSeasonPayout.findMany({
        where: { seasonId: season.id },
        orderBy: { rank: 'asc' },
      })
      return NextResponse.json({ success: true, alreadyPaid: true, payouts: existing })
    }

    // Close season if still active past end
    if (season.status === 'active' && season.endsAt <= new Date()) {
      await prisma.pvpSeason.update({ where: { id: season.id }, data: { status: 'ended' } })
    }

    // Top 10 humanos apenas — bots pontuam no leaderboard visual, mas não recebem DOL.
    const board = await getLeaderboard(season.id, 10, { includeBots: false })
    const pot = season.potDol

    const payouts = []
    for (let i = 0; i < board.length && i < 10; i++) {
      const row = board[i]
      const dolAmount = Math.round(pot * PVP_TOP10_DOL_SPLIT[i] * 100) / 100
      const char = await prisma.character.findUnique({
        where: { id: row.characterId },
        select: { userId: true },
      })
      const user = char
        ? await prisma.user.findUnique({ where: { id: char.userId }, select: { walletAddress: true } })
        : null

      const payout = await prisma.pvpSeasonPayout.upsert({
        where: { seasonId_characterId: { seasonId: season.id, characterId: row.characterId } },
        create: {
          seasonId: season.id,
          characterId: row.characterId,
          rank: i + 1,
          points: row.points,
          dolAmount,
          walletAddress: user?.walletAddress ?? null,
          status: 'pending',
        },
        update: {
          rank: i + 1,
          points: row.points,
          dolAmount,
          walletAddress: user?.walletAddress ?? null,
        },
      })
      payouts.push(payout)
    }

    await prisma.pvpSeason.update({
      where: { id: season.id },
      data: { status: 'ended' },
    })

    return NextResponse.json({
      success: true,
      season: { id: season.id, name: season.name, potDol: pot },
      payouts,
      note: 'Payouts are pending. Mark paid via PATCH with txHash after on-chain transfer from treasury.',
    })
  } catch (e) {
    console.error('season payout', e)
    return NextResponse.json({ error: 'Payout failed' }, { status: 500 })
  }
}

/** Mark a payout row as paid (after treasury transfer). */
export async function PATCH(request: NextRequest) {
  const session = await auth()
  if (!isAuthorized(request, session?.user?.id)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { payoutId, txHash, markSeasonPaid } = body as {
      payoutId?: string
      txHash?: string
      markSeasonPaid?: string
    }

    if (payoutId) {
      const payout = await prisma.pvpSeasonPayout.update({
        where: { id: payoutId },
        data: {
          status: 'paid',
          txHash: txHash || null,
          paidAt: new Date(),
        },
      })
      return NextResponse.json({ success: true, payout })
    }

    if (markSeasonPaid) {
      await prisma.pvpSeason.update({
        where: { id: markSeasonPaid },
        data: { status: 'paid', paidAt: new Date() },
      })
      await prisma.pvpSeasonPayout.updateMany({
        where: { seasonId: markSeasonPaid, status: 'pending' },
        data: { status: 'skipped' },
      })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'payoutId or markSeasonPaid required' }, { status: 400 })
  } catch (e) {
    console.error('season payout PATCH', e)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }
}
