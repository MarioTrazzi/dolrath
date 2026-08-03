/**
 * ⚗️ Preço da restauração de HP/MP na Alquimista.
 *
 * HP e MP passaram a sobreviver à run (o /finish persiste a fração com que o
 * herói saiu). A Alquimista é o único serviço de restauração COMPLETA, e cobra
 * por isso — poções continuam sendo a alternativa (mais cara por ponto, mas
 * usável no meio do combate).
 *
 * Faixa gratuita até o nível 6: no early game a run tem poucos combates e rende
 * pouco ouro, então cobrar já no nível 1 criaria o beco sem saída de estar
 * machucado, sem ouro e sem como voltar a farmar. Do 7 em diante o jogador já
 * tem ouro acumulado, drops e ingredientes para fabricar poções — administrar o
 * recurso vira decisão, não bloqueio.
 *
 * Este arquivo é a fonte ÚNICA do preço: a rota o usa para cobrar e a UI para
 * exibir. O cliente nunca manda o valor; o servidor recalcula sempre.
 */

/** Até este nível (inclusive) a restauração é gratuita. */
export const FREE_RESTORE_MAX_LEVEL = 6

/** Peso do HP faltando no preço (o resto vai para o MP). */
const HP_WEIGHT = 0.6
const MP_WEIGHT = 0.4

/** Teto do preço de uma restauração COMPLETA: BASE + PER_LEVEL × nível. */
const BASE = 20
const PER_LEVEL = 8

export interface RestoreCostInput {
  hp: number
  maxHp: number
  mp: number
  maxMp: number
  level: number
}

export interface RestoreCostResult {
  /** Ouro a cobrar (0 na faixa gratuita ou com os dois pools cheios). */
  cost: number
  /** true = nível dentro da faixa gratuita. */
  free: boolean
  /** true = não há nada a restaurar. */
  alreadyFull: boolean
}

const missingPct = (current: number, max: number) => {
  if (!Number.isFinite(max) || max <= 0) return 0
  const missing = Math.max(0, max - Math.max(0, current))
  return Math.min(1, missing / max)
}

export function restoreCost({ hp, maxHp, mp, maxMp, level }: RestoreCostInput): RestoreCostResult {
  const hpMissing = missingPct(hp, maxHp)
  const mpMissing = missingPct(mp, maxMp)
  const alreadyFull = hpMissing === 0 && mpMissing === 0
  const free = level <= FREE_RESTORE_MAX_LEVEL

  if (alreadyFull || free) return { cost: 0, free, alreadyFull }

  const ceiling = BASE + PER_LEVEL * Math.max(1, level)
  const cost = Math.ceil((HP_WEIGHT * hpMissing + MP_WEIGHT * mpMissing) * ceiling)
  return { cost: Math.max(1, cost), free, alreadyFull }
}
