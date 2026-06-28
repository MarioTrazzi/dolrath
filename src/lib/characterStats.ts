// ============================================================
// Cálculo de atributos da CRIAÇÃO — espelho EXATO do servidor
// (src/app/api/character/route.ts). É a "fonte da verdade" para
// as prévias da criação, garantindo que o que o jogador vê é o
// que o personagem realmente recebe.
//
// ⚠️ Importante: o servidor calcula bônus a partir de gameData.ts
// (RACES/CLASSES, escala 0-100) convertendo para 0-10 via floor(/10).
// Atributos derivados (HP/MP/Stamina/etc.) usam as fórmulas abaixo.
// `wisdom` NÃO é lido pelo servidor — bônus de sabedoria são ignorados.
// ============================================================

import { getRaceById, getClassById } from '@/lib/gameData'

export interface StatFour {
  str: number
  agi: number
  int: number
  def: number
}

export interface DerivedStats {
  hp: number
  mp: number
  stamina: number
  attack: number
  defense: number
  critical: number
  magicPower: number
  dodgeChance: number
  magicResistance: number
  speed: number
}

export interface CreationStats {
  base: StatFour      // pontos distribuídos pelo jogador
  race: StatFour      // bônus racial aplicado (já convertido /10)
  class: StatFour     // bônus de classe aplicado (já convertido /10)
  final: StatFour     // soma final
  derived: DerivedStats
}

const ZERO: StatFour = { str: 0, agi: 0, int: 0, def: 0 }

// Converte bônus 0-100 do gameData para a escala 0-10 (igual ao servidor)
function toScaled(bonuses: { strength?: number; dexterity?: number; intelligence?: number; constitution?: number }): StatFour {
  return {
    str: Math.floor((bonuses.strength || 0) / 10),
    agi: Math.floor((bonuses.dexterity || 0) / 10),
    int: Math.floor((bonuses.intelligence || 0) / 10),
    def: Math.floor((bonuses.constitution || 0) / 10),
  }
}

/** Bônus de atributos REAIS aplicados por uma raça (escala 0-10). */
export function getRaceStatBonuses(raceId?: string | null): StatFour {
  if (!raceId) return { ...ZERO }
  const r = getRaceById(raceId)
  return r ? toScaled(r.bonuses as any) : { ...ZERO }
}

/** Bônus de atributos REAIS aplicados por uma classe (escala 0-10). */
export function getClassStatBonuses(classId?: string | null): StatFour {
  if (!classId) return { ...ZERO }
  const c = getClassById(classId)
  return c ? toScaled(c.bonuses as any) : { ...ZERO }
}

/**
 * Calcula os atributos finais do personagem na criação, exatamente como o
 * servidor faz ao persistir. `distributed` usa def (não res).
 */
export function computeCreationStats(
  raceId?: string | null,
  classId?: string | null,
  distributed: Partial<StatFour> = {}
): CreationStats {
  const base: StatFour = {
    str: Number(distributed.str || 0),
    agi: Number(distributed.agi || 0),
    int: Number(distributed.int || 0),
    def: Number(distributed.def || 0),
  }
  const race = getRaceStatBonuses(raceId)
  const klass = getClassStatBonuses(classId)

  // Piso de 8 nos atributos primários (str/agi/int): nenhum personagem fica com
  // atributo ZERO — assim a transformação sempre multiplica algo (ganho visível)
  // e o "poder unificado" (str+int) nunca fica morto. DEF NÃO tem piso (RES baixa
  // mantém o mago matável).
  const final: StatFour = {
    str: Math.max(8, base.str + race.str + klass.str),
    agi: Math.max(8, base.agi + race.agi + klass.agi),
    int: Math.max(8, base.int + race.int + klass.int),
    def: base.def + race.def + klass.def,
  }

  // Fórmulas idênticas ao servidor (route.ts)
  const derived: DerivedStats = {
    hp: 80 + final.str * 2 + final.def * 4,
    mp: 60 + final.int * 3 + final.agi * 1,
    stamina: 120 + final.agi * 3,
    attack: Math.floor(final.str * 1.2),
    defense: Math.floor(final.def * 0.8),
    critical: final.agi * 0.8 + 5,
    magicPower: Math.floor(final.int * 1.5),
    dodgeChance: final.agi * 0.3,
    magicResistance: Math.floor(final.int * 0.4),
    speed: final.agi * 0.5,
  }

  return { base, race, class: klass, final, derived }
}
