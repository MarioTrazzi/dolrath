/**
 * 🎯 FÓRMULAS DE PROGRESSÃO E COMBATE — fonte única da verdade
 *
 * Validadas por simulação massiva (scripts/pvp-balance-sim.js, 4000 lutas/par,
 * níveis 1–50): mago full-INT ≈ guerreiro full-STR em todos os níveis (~50/50),
 * nenhum confronto 0%/100%, lutas de 15–40 turnos, zero soft-locks.
 *
 * Identidade de cada atributo:
 *   STR → dano do Ataque Pesado (×1.8) e um pouco de HP
 *   AGI → dano do Ataque Leve (×1.7), crítico, esquiva e stamina
 *   INT → dano do Especial (×1.5, fura armadura) e pool de MP
 *   DEF → HP (×4), mitigação física, resistência mágica (×0.8) e stamina
 *
 * Usada por: distribute-points (distribuição), characterLevelSystem (level up)
 * e espelhada em server/socket-server.js (combate em tempo real).
 */

export interface CoreAttributes {
  str: number
  agi: number
  int: number
  def: number
  level: number
}

export interface DerivedStats {
  maxHp: number
  maxMp: number
  maxStamina: number
  res: number
}

export function computeDerivedStats({ str, agi, int, def, level }: CoreAttributes): DerivedStats {
  return {
    // Base por nível garante que TODO arquétipo escala de HP (mago incluso)
    maxHp: 100 + level * 6 + Math.floor(str * 0.5) + def * 4,
    maxMp: 60 + int * 4 + agi,
    maxStamina: 120 + agi * 2 + def * 2,
    // Resistência mágica vem da constituição
    res: Math.floor(def * 0.8),
  }
}

/** Chance de crítico (%): base 5, +1.2 por AGI, teto 40 */
export function criticalChancePct(agi: number): number {
  return Math.min(40, 5 + agi * 1.2)
}

/** Bônus líquido de esquiva no conteste de dados (positivo = defensor mais ágil) */
export function dodgeNetBonus(defenderAgi: number, attackerAgi: number, diceSides: number): number {
  const cap = Math.min(3, Math.floor(diceSides / 5)) // d6→±1, d10→±2, d20→±3
  const raw = Math.floor((defenderAgi - attackerAgi) / 5)
  return Math.max(-cap, Math.min(cap, raw))
}
