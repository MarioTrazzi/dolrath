/**
 * Recompensas PvP proporcionais à stamina gasta — paridade com EV da masmorra.
 *
 * Âncora Floresta t1: ~54 STA / run → ~355 gold + ~XP médio.
 * GOLD_PER_STA ≈ 355/54 ≈ 6.6; XP_PER_STA ≈ 8 (ordem de grandeza similar).
 *
 * Share: vencedor leva a maior fatia do que AMBOS gastaram; perdedor recebe consolação.
 * Sem drops de item — só gold/XP.
 */

export const PVP_MIN_ENTRY_STAMINA = 5

/** Gold médio por ponto de stamina (âncora Floresta). */
export const PVP_GOLD_PER_STA = 6.6

/** XP médio por ponto de stamina. */
export const PVP_XP_PER_STA = 8

/** Fatia do pool total da luta que vai ao vencedor (resto ao perdedor). */
export const PVP_WIN_SHARE = 0.70
export const PVP_LOSS_SHARE = 0.30

/** Pontos de ranking por resultado (Fase 2). */
export const PVP_RANK_WIN_POINTS = 25
export const PVP_RANK_LOSS_POINTS = 5

export interface PvpStaminaRewardsInput {
  winnerStaminaSpent: number
  loserStaminaSpent: number
  isFlawless?: boolean
  killTransformed?: boolean
  isFirstWinOfDay?: boolean
  winnerLevel?: number
  loserLevel?: number
}

export interface PvpSideReward {
  xp: number
  gold: number
  staminaCharged: number
}

function clampSta(n: number): number {
  return Math.max(0, Math.floor(Number(n) || 0))
}

/**
 * Calcula gold/XP a partir da stamina gasta na luta.
 * Pool = (staWinner + staLoser) × taxa; split win/loss; bônus leves com cap.
 */
export function calculatePvpStaminaRewards(input: PvpStaminaRewardsInput): {
  winner: PvpSideReward
  loser: PvpSideReward
} {
  const wSta = clampSta(input.winnerStaminaSpent)
  const lSta = clampSta(input.loserStaminaSpent)
  const poolSta = wSta + lSta

  let winGold = Math.round(poolSta * PVP_GOLD_PER_STA * PVP_WIN_SHARE)
  let winXp = Math.round(poolSta * PVP_XP_PER_STA * PVP_WIN_SHARE)
  let lossGold = Math.round(poolSta * PVP_GOLD_PER_STA * PVP_LOSS_SHARE)
  let lossXp = Math.round(poolSta * PVP_XP_PER_STA * PVP_LOSS_SHARE)

  // Se alguém não gastou nada, não recebe faucet (treino / soft-lock).
  if (wSta <= 0) { winGold = 0; winXp = 0 }
  if (lSta <= 0) { lossGold = 0; lossXp = 0 }

  // Bônus leves (não devem estourar a paridade)
  if (input.isFlawless && wSta > 0) {
    winGold = Math.round(winGold * 1.15)
    winXp = Math.round(winXp * 1.1)
  }
  if (input.killTransformed && wSta > 0) {
    winGold = Math.round(winGold * 1.1)
    winXp = Math.round(winXp * 1.1)
  }
  if (input.isFirstWinOfDay && wSta > 0) {
    winGold = Math.round(winGold * 1.25)
    winXp = Math.round(winXp * 1.5)
  }

  // Underdog / bully por diferença de nível
  const wLv = Math.max(1, Number(input.winnerLevel) || 1)
  const lLv = Math.max(1, Number(input.loserLevel) || 1)
  const diff = lLv - wLv
  if (diff >= 5 && wSta > 0) {
    winGold = Math.round(winGold * 1.25)
    winXp = Math.round(winXp * 1.25)
  } else if (diff <= -5 && wSta > 0) {
    winGold = Math.round(winGold * 0.75)
    winXp = Math.round(winXp * 0.75)
  }

  return {
    winner: { xp: Math.max(0, winXp), gold: Math.max(0, winGold), staminaCharged: wSta },
    loser: { xp: Math.max(0, lossXp), gold: Math.max(0, lossGold), staminaCharged: lSta },
  }
}

/** Split do pot DOL top 10 (Fase 3) — percentuais do pot da season. */
export const PVP_TOP10_DOL_SPLIT = [0.30, 0.18, 0.12, 0.09, 0.07, 0.06, 0.05, 0.05, 0.04, 0.04] as const
