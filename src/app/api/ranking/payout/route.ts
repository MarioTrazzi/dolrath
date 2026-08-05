import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { snapshotSeasonPayouts } from '@/lib/seasonPayout'
import { getTournamentVaultBalance } from '@/lib/seasonPool'

/**
 * Congela o top 20 de uma temporada encerrada. Normalmente quem dispara é o
 * cron (api/cron/season) — esta rota é a operação manual, para reconciliar ou
 * antecipar.
 *
 * Auth: session admin (ADMIN_USER_IDS) OU x-battle-secret.
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

    // O snapshot filtra bots, exige inscrição e o piso de partidas, e colapsa
    // por conta (um prêmio por usuário) — ver getPayoutBoard.
    const snapshot = await snapshotSeasonPayouts(season)

    await prisma.pvpSeason.update({
      where: { id: season.id },
      data: { status: 'ended' },
    })

    return NextResponse.json({
      success: true,
      season: {
        id: season.id,
        name: season.name,
        potDol: snapshot.potDol,
        distributedDol: snapshot.distributedDol,
        toVaultDol: snapshot.toVaultDol,
      },
      tournamentVaultDol: await getTournamentVaultBalance(),
      payouts: snapshot.payouts,
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
