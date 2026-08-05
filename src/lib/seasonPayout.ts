/**
 * Fechamento da temporada: congela o top 20 em PvpSeasonPayout com a carteira
 * de cada ganhador, e manda o não distribuído para o cofre de torneios.
 *
 * O pagamento on-chain em si continua MANUAL — esta função só produz a lista
 * do que pagar. A confirmação volta pelo PATCH de /api/ranking/payout com o
 * txHash da transferência.
 *
 * Compartilhado pelo cron (api/cron/season) e pela rota admin.
 */
import { prisma } from '@/lib/prisma'
import { getPayoutBoard } from '@/lib/pvpRanking'
import { PVP_SEASON_DOL_SPLIT } from '@/lib/pvpRewards'
import { creditTournamentVault, getDistributablePot, TOURNAMENT_CUT_PCT } from '@/lib/seasonPool'
import type { PvpSeason } from '@prisma/client'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export type SeasonSnapshot = {
  seasonId: string
  seasonName: string
  potDol: number
  distributedDol: number
  toVaultDol: number
  payouts: Awaited<ReturnType<typeof prisma.pvpSeasonPayout.findMany>>
}

export async function snapshotSeasonPayouts(season: PvpSeason): Promise<SeasonSnapshot> {
  const board = await getPayoutBoard(season.id)
  const distributable = getDistributablePot(season)

  const payouts = []
  let distributed = 0

  for (let i = 0; i < board.length && i < PVP_SEASON_DOL_SPLIT.length; i++) {
    const row = board[i]
    const dolAmount = round2(distributable * PVP_SEASON_DOL_SPLIT[i])
    distributed += dolAmount

    const user = await prisma.user.findUnique({
      where: { id: row.userId },
      select: { walletAddress: true },
    })

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

  // Posições vazias NÃO são redistribuídas entre os presentes: a sobra vai para
  // o cofre. É o que preserva a promessa "o 20º recupera a inscrição"
  // independente do tamanho da base — e numa base pequena (quando mais sobra)
  // converte o excedente em torneios menores e mais frequentes.
  const potTotal = round2(season.potDol + season.fundedDol)
  const toVault = round2(potTotal - distributed)
  await creditTournamentVault(toVault)

  return {
    seasonId: season.id,
    seasonName: season.name,
    potDol: potTotal,
    distributedDol: round2(distributed),
    toVaultDol: toVault,
    payouts,
  }
}

/** Quanto da pool o corte de torneio está desviando (0 no lançamento). */
export function getTournamentCutPct(): number {
  return TOURNAMENT_CUT_PCT
}
