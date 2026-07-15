/**
 * ⚔️ Recompensas da ARENA, proporcionais à stamina gasta.
 *
 * 🎲 DESIGN (2026-07-15) — ESPECIALIZAÇÃO DE MOEDA, não paridade de espólio:
 *   • ARENA    = ouro + XP, e NADA MAIS. Lore: os jogadores apostam e o governo paga;
 *                dropar item numa arena não faz sentido.
 *   • MASMORRA = itens (pedra/estilhaço/material/gear) + ouro REDUZIDO à metade.
 * As duas disputam o MESMO orçamento diário de stamina, então o jogador escolhe a
 * COMPOSIÇÃO (ouro líquido ou itens), nunca o valor — o VALOR/dia é o mesmo nas duas.
 * Quem só faz arena progride comprando pedra no marketplace de quem só masmorra.
 *
 * ⚠️ A âncora antiga (6.6 = 355 gold ÷ 54 STA da run de Floresta) estava ERRADA: os
 * 355 eram só o ouro de CHÃO e esqueciam o ouro de ABATE (o boss sozinho dava 150-300).
 * Resultado: a arena pagava ~1/3 do ouro/stamina da masmorra E não dava item — não
 * havia razão para lutar (o economy-unified-sim media 7.3 vs 22.2 gold/STA).
 *
 * Calibração atual (economy-unified-sim, PVP_STA_SHARE 0/0.5/1): a masmorra entrega
 * ~41.8 de VALOR/stamina (22.2 ouro + 19.6 em pedras a 200g). Cortado o ouro dela à
 * metade, a arena precisa pagar ~24/STA em ouro puro p/ o VALOR TOTAL/dia ficar plano.
 * ⚠️ Mexeu aqui ou no ouro da masmorra? Rode `npm run sim:economy` nos três perfis.
 *
 * Share: vencedor leva a maior fatia do que AMBOS gastaram; perdedor recebe consolação.
 */

/** Stamina mínima gasta p/ a luta valer recompensa (mata o farm de luta de 1 turno). */
export const PVP_MIN_ENTRY_STAMINA = 5

/** Gold médio por ponto de stamina (ver a calibração no cabeçalho). */
export const PVP_GOLD_PER_STA = 31

/** XP médio por ponto de stamina — casa com os 11.8/STA que a masmorra paga (sim). */
export const PVP_XP_PER_STA = 11

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
