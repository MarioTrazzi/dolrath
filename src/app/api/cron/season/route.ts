import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ensureUpcomingSeason, OFFSEASON_DAYS } from '@/lib/pvpRanking'
import { grantGraceEntries } from '@/lib/seasonPool'
import { snapshotSeasonPayouts } from '@/lib/seasonPayout'

/**
 * Virada de temporada — roda diariamente (crons no vercel.json).
 *
 * Antes disso a temporada só virava quando alguém abria /ranking ou terminava
 * uma luta: podia ficar vencida por dias, e o fechamento era um curl manual.
 * Com DOL real premiado, o ciclo precisa andar sozinho.
 *
 * Duas transições:
 *   1. `active` vencida → `offseason` (7 dias) + snapshot do top 20 + sobra
 *      para o cofre de torneios + agenda a próxima temporada (que já abre
 *      inscrições).
 *   2. `offseason` vencida → `ended`. A próxima já existe e assume sozinha
 *      quando o relógio passa do `startsAt` dela.
 */
function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  // A Vercel manda `Authorization: Bearer $CRON_SECRET` nos cron jobs.
  const auth = request.headers.get('authorization')
  if (auth === `Bearer ${secret}`) return true
  return request.headers.get('x-cron-secret') === secret
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const actions: string[] = []

  try {
    // 1. Temporada ativa que venceu → entressafra, com o placar congelado.
    const expired = await prisma.pvpSeason.findMany({
      where: { status: 'active', endsAt: { lte: now } },
    })

    for (const season of expired) {
      const snapshot = await snapshotSeasonPayouts(season)
      const offseasonEnd = new Date(season.endsAt.getTime() + OFFSEASON_DAYS * 86_400_000)

      await prisma.pvpSeason.update({
        where: { id: season.id },
        data: { status: 'offseason', endsAt: offseasonEnd },
      })

      const upcoming = await ensureUpcomingSeason({ id: season.id, endsAt: offseasonEnd })
      const granted = await grantGraceEntries({
        seasonId: upcoming.id,
        previousSeasonEndsAt: season.endsAt,
      })

      actions.push(
        `${season.name}: entressafra até ${offseasonEnd.toISOString()} · ` +
          `${snapshot.payouts.length} prêmios (${snapshot.distributedDol} DOL) · ` +
          `${snapshot.toVaultDol} DOL ao cofre · ` +
          `${upcoming.name} agendada com ${granted} cortesias`
      )
    }

    // 2. Entressafra que venceu → encerrada de vez.
    const closing = await prisma.pvpSeason.findMany({
      where: { status: 'offseason', endsAt: { lte: now } },
    })

    for (const season of closing) {
      await prisma.pvpSeason.update({ where: { id: season.id }, data: { status: 'ended' } })
      actions.push(`${season.name}: encerrada`)
    }

    return NextResponse.json({ success: true, ranAt: now.toISOString(), actions })
  } catch (e) {
    console.error('cron season', e)
    return NextResponse.json({ error: 'Season cron failed' }, { status: 500 })
  }
}
