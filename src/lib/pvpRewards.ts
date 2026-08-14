/**
 * ⚔️ Recompensas da ARENA — TAXA FIXA DE ENTRADA, 10 lutas por dia.
 *
 * 🎟️ DESIGN (2026-08-14) — a luta custa `PVP_FIGHT_STAMINA` da carteira, sempre o
 * mesmo, independente de quantos turnos durou, de quantos golpes foram dados ou de ter
 * transformado. O orçamento diário de stamina (o regen de 192⚡/dia) dividido por essa
 * taxa é EXATAMENTE `PVP_FIGHTS_PER_DAY`.
 *
 * Por que trocar o modelo antigo (cobrar a stamina gasta golpe a golpe): o número de
 * lutas/dia era um efeito colateral do tamanho das lutas, e ele variava com o nível —
 * `scripts/pvp-band-balance-sim.js` media 14.0 lutas/dia no iniciante contra 8.1 no
 * nv50 (11.3⚡ vs 23.1⚡ por lado), e o ouro por vitória ia de 491 a 1003 pela mesma
 * razão. Pior: a barra da luta ERA a carteira, então quem chegava com o saldo raspando
 * lutava com meia barra de stamina — punição dupla e invisível.
 *
 * O que muda em consequência:
 *   • a barra de stamina DENTRO da luta é da LUTA (nasce cheia, `maxStamina`) e não
 *     debita mais nada no banco — continua sendo o recurso tático dos golpes;
 *   • o pool que paga os dois lados é `2 × PVP_FIGHT_STAMINA`, então ouro e XP por luta
 *     são determinísticos em qualquer nível;
 *   • abandonar/desistir/dar F5 custa a taxa cheia, igual a uma luta completa;
 *   • o piso antigo (PVP_MIN_ENTRY_STAMINA = 5, anti-farm de luta de 1 turno) morreu:
 *     uma luta de 1 turno custa os mesmos 19⚡, então farmá-la não emite ouro extra.
 *
 * ⚠️ O faucet DIÁRIO não mudou: 192⚡ × PVP_GOLD_PER_STA continua sendo o teto, só que
 * agora distribuído em 10 parcelas iguais.
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
import { STAMINA_REGEN } from '@/lib/staminaSystem'

/** Lutas de arena que um dia inteiro de stamina compra. É ESTE o número fixado. */
export const PVP_FIGHTS_PER_DAY = 10

/**
 * Stamina que o regen passivo devolve em 24h (+2 a cada 15 min = 192). Derivado das
 * constantes reais para não virar um número solto: mexeu no regen, a taxa acompanha.
 */
export const DAILY_STAMINA_BUDGET =
  STAMINA_REGEN.amountPerTick * Math.floor(86_400 / STAMINA_REGEN.tickSeconds)

/**
 * 🎟️ Taxa FIXA de uma luta de arena (19⚡). `floor` de propósito: as 10 lutas têm que
 * caber no orçamento do dia, não estourá-lo por arredondamento.
 */
export const PVP_FIGHT_STAMINA = Math.floor(DAILY_STAMINA_BUDGET / PVP_FIGHTS_PER_DAY)

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
 * Calcula gold/XP a partir da stamina COBRADA dos dois lados.
 * Pool = (staWinner + staLoser) × taxa; split win/loss; bônus leves com cap.
 *
 * Desde a taxa fixa (2026-08-14) os dois lados entram com `PVP_FIGHT_STAMINA`, então o
 * pool é sempre `2 × PVP_FIGHT_STAMINA` e o valor da luta é o mesmo em qualquer nível.
 * A assinatura continua parametrizada pela stamina porque é ela que os simuladores
 * varrem — e porque um lado que não conseguiu pagar entra com 0 e não recebe faucet.
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

/**
 * Split do pot DOL — percentuais da pool distribuível, top 20, soma exata 1.0.
 *
 * A curva é calibrada para o ponto de equilíbrio de 100 inscritos: com a
 * inscrição de SEASON_ENTRY_DOL (100), a pool é 10.000 DOL, o 20º recebe 1% —
 * exatamente os 100 que entraram por ele — e o campeão leva 19×. O equilíbrio
 * é sempre 100 inscritos, qualquer que seja o valor da inscrição, porque a pool
 * e o prêmio usam a mesma constante. Sendo percentual, escala sozinha: 500
 * inscritos → 20º leva 500 DOL, campeão 9.500.
 *
 * Posições vazias (menos de 20 elegíveis) NÃO são redistribuídas entre os
 * presentes: a sobra vai para o cofre de torneios. É o que preserva a promessa
 * "o 20º recupera a inscrição" independente do tamanho da base.
 */
export const PVP_SEASON_DOL_SPLIT = [
  0.190, 0.135, 0.100, 0.080, 0.067,
  0.060, 0.052, 0.045, 0.040, 0.035,
  0.031, 0.028, 0.025, 0.022, 0.020,
  0.018, 0.016, 0.014, 0.012, 0.010,
] as const

/** Quantas posições a temporada paga. */
export const PVP_PAYOUT_SLOTS = PVP_SEASON_DOL_SPLIT.length

/**
 * Piso de partidas na temporada para entrar na premiação. Sem ele, numa
 * temporada magra alguém leva DOL com uma vitória solitária.
 */
export const PVP_PAYOUT_MIN_MATCHES = Number(process.env.PVP_PAYOUT_MIN_MATCHES || 10)

/**
 * Lutas por dia (UTC) contra o MESMO oponente que ainda pontuam. Acima disso a
 * luta segue pagando ouro e XP, mas concede 0 pontos: com DOL real na mesa,
 * duas contas trocando vitórias em série viram vetor de farm. O bloqueio de
 * mesma conta (`same_user`) não cobre esse caso.
 */
export const PVP_PAIR_DAILY_POINT_CAP = Number(process.env.PVP_PAIR_DAILY_POINT_CAP || 3)
