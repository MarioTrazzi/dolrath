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

// ============================================================
// Rolagem automática dos 18 pontos de criação (substitui a distribuição
// manual). Cada classe tem um perfil: `mins` garante o piso da identidade
// da classe (soma 12), os 6 pontos restantes são sorteados um a um por peso
// — assim a rolagem sempre tem a "cara" da classe, mas com aleatoriedade
// suficiente para nenhum mint sair igual. Pura e determinística: mesma seed
// => mesmo roll (a seed vem do hash da transação de pagamento/mint, ver
// characterCreationRoll.ts).
// ============================================================

export interface ClassRollProfile {
  mins: StatFour
  weights: StatFour
}

export const CLASS_ROLL_PROFILES: Record<string, ClassRollProfile> = {
  warrior: { mins: { str: 5, agi: 2, int: 1, def: 4 }, weights: { str: 40, agi: 15, int: 5, def: 40 } },
  rogue: { mins: { str: 2, agi: 5, int: 2, def: 3 }, weights: { str: 15, agi: 45, int: 15, def: 25 } },
  mage: { mins: { str: 1, agi: 2, int: 6, def: 3 }, weights: { str: 5, agi: 15, int: 50, def: 30 } },
  monk: { mins: { str: 3, agi: 4, int: 2, def: 4 }, weights: { str: 25, agi: 35, int: 10, def: 30 } },
}

const DEFAULT_ROLL_PROFILE: ClassRollProfile = {
  mins: { str: 4, agi: 4, int: 2, def: 2 },
  weights: { str: 25, agi: 25, int: 25, def: 25 },
}

const ROLL_STAT_KEYS: (keyof StatFour)[] = ['str', 'agi', 'int', 'def']
const CREATION_POOL_TOTAL = 18
const CREATION_STAT_CAP = 10

export function getClassRollProfile(classId?: string | null): ClassRollProfile {
  return (classId && CLASS_ROLL_PROFILES[classId]) || DEFAULT_ROLL_PROFILE
}

// PRNG determinístico leve (mulberry32) — não precisa de crypto, então este
// arquivo continua seguro para import em componentes client.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Rola os 18 pontos de criação para uma classe a partir de uma seed numérica.
 * Determinístico: mesma seed + classe => sempre o mesmo resultado.
 */
export function rollCreationStats(seed: number, classId?: string | null): StatFour {
  const profile = getClassRollProfile(classId)
  const rand = mulberry32(seed)

  const result: StatFour = { ...profile.mins }
  let remaining = CREATION_POOL_TOTAL - ROLL_STAT_KEYS.reduce((sum, k) => sum + result[k], 0)

  while (remaining > 0) {
    const eligible = ROLL_STAT_KEYS.filter((k) => result[k] < CREATION_STAT_CAP)
    if (eligible.length === 0) break

    const totalWeight = eligible.reduce((sum, k) => sum + (profile.weights[k] || 0), 0)
    let pick: keyof StatFour = eligible[eligible.length - 1]
    if (totalWeight > 0) {
      let roll = rand() * totalWeight
      for (const k of eligible) {
        roll -= profile.weights[k] || 0
        if (roll <= 0) {
          pick = k
          break
        }
      }
    } else {
      pick = eligible[Math.floor(rand() * eligible.length)]
    }

    result[pick] += 1
    remaining -= 1
  }

  return result
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
