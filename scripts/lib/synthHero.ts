// ============================================================
// DOLRATH — HERÓI SINTÉTICO compartilhado pelos simuladores
//
// Antes deste módulo, o par buildChar()/gearFor() estava COPIADO em 7 scripts
// (dungeon-full-run-test, pve-race-class-sim, dungeon-difficulty-sim,
// pve-full-run-sim, late-game-gear-sim, pvp-fight-detailed-sim,
// pvp-race-class-sim) — e as cópias já divergiram: várias carregam um
// `enhHpFactor` travado em 2.5 para +16..+20, enquanto a fonte real
// (getStatMultiplier) usa {16:2.0, 17:2.2, 18:2.45, 19:2.8, 20:3.3}.
//
// ⚠️ AS DUAS FÓRMULAS DE HP
// O jogo tem HOJE dois caminhos de HP, e a diferença entre eles é grande:
//
//   hpCalib(attrs)        = 80 + str*2 + def*4
//     → é a fórmula de dungeonAdventures.anchorAt, que dimensiona TODO monstro
//       e TODO boss (e é também o HP gravado na CRIAÇÃO, api/character/route.ts).
//
//   hpProd(attrs, level)  = 100 + level*6 + floor(str/2) + def*4
//     → é computeDerivedStats (src/lib/combatFormulas.ts), que characterLevelSystem
//       e attributeRecalc GRAVAM no banco a partir do primeiro level-up, e que o
//       combate lê em DungeonRun.tsx (`character.maxHp + gear.hp`).
//
// Ou seja: do nível 2 em diante o jogador anda com hpProd, mas o boss foi
// calibrado contra hpCalib. As duas ficam expostas aqui de propósito — um
// simulador honesto mede com hpProd e reporta hpCalib ao lado, em vez de
// herdar o desvio em silêncio.
//
// ⚠️ es5: o tsconfig do projeto compila em es5 sem downlevelIteration, então
// `[...map]` vira array VAZIO em silêncio. Nada de Map/Set aqui.
// ============================================================

import { computeDerivedStats } from '@/lib/combatFormulas'
import { getRaceStatBonuses, getClassStatBonuses } from '@/lib/characterStats'
import { deriveGearTier, NOMINAL_SLOTS, type CombatClass } from '@/lib/combatModel'
import { getStatMultiplier } from '@/lib/enhancementSystem'

export interface Attrs { str: number; agi: number; int: number; def: number }
export type Rarity = 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY'

export const ALL_CLASSES: CombatClass[] = ['warrior', 'rogue', 'mage', 'monk']
export const ALL_RACES = ['humano', 'draconiano', 'metamorfo', 'elfo']

/** Piso de 8 em str/agi/int (api/character/route.ts:213). DEF não tem piso. */
export const STAT_FLOOR = 8
const CREATION_PTS = 18
const STAT_CAP = 10

/**
 * Como o jogador gasta os 18 pontos de criação e o +1/nível. É a build de
 * REFERÊNCIA ("jogador típico"), a mesma de dungeonAdventures.REF_BUILD — o
 * boss foi calibrado contra ela, então mudar estes pesos desloca todo o balance.
 */
export const BUILD: Record<CombatClass, Partial<Record<keyof Attrs, number>>> = {
  warrior: { str: 0.7, def: 0.3 },
  rogue:   { agi: 0.85, def: 0.15 },
  mage:    { int: 0.85, def: 0.15 },
  monk:    { agi: 0.55, def: 0.45 },
}

/**
 * Atributos finais no nível `level`.
 *
 * Raça e classe saem de gameData (via characterStats) em vez de tabelas
 * hardcoded — as cópias antigas repetiam os números à mão e ficavam para trás
 * quando gameData mudava.
 *
 * `withFloor` liga o piso 8 de produção. Os sims antigos NÃO o aplicam, o que
 * deixa o mago com str 2 em vez de 10 e infla artificialmente qualquer
 * comparação de HP — passe false só para reproduzir o comportamento legado.
 */
export function buildAttrs(race: string, klass: CombatClass, level: number, withFloor = true): Attrs {
  const w = BUILD[klass]
  const keys = Object.keys(w) as (keyof Attrs)[]
  const out: Attrs = { str: 0, agi: 0, int: 0, def: 0 }

  // Criação: 18 pontos pelos pesos, cap 10/stat, sobra escorre para DEF.
  let spill = 0
  for (const k of keys) {
    const want = Math.round(CREATION_PTS * (w[k] || 0))
    out[k] = Math.min(STAT_CAP, want)
    spill += want - out[k]
  }
  out.def = Math.min(STAT_CAP, out.def + spill)

  // +1 ponto por nível, gasto nos mesmos pesos (sem cap — o cap é só da criação).
  const levelPts = Math.max(0, level - 1)
  for (const k of keys) out[k] += Math.round(levelPts * (w[k] || 0))

  const r = getRaceStatBonuses(race)
  const c = getClassStatBonuses(klass)
  const final: Attrs = {
    str: out.str + r.str + c.str,
    agi: out.agi + r.agi + c.agi,
    int: out.int + r.int + c.int,
    def: out.def + r.def + c.def,
  }
  if (withFloor) {
    final.str = Math.max(STAT_FLOOR, final.str)
    final.agi = Math.max(STAT_FLOOR, final.agi)
    final.int = Math.max(STAT_FLOOR, final.int)
  }
  return final
}

/** HP que o jogador REALMENTE tem do nível 2 em diante (combatFormulas). */
export function hpProd(attrs: Attrs, level: number): number {
  return computeDerivedStats({ ...attrs, level }).maxHp
}

/** HP contra o qual o boss foi dimensionado (dungeonAdventures.anchorAt). */
export function hpCalib(attrs: Attrs): number {
  return 80 + attrs.str * 2 + attrs.def * 4
}

/** HP sintético do set de 9 peças. Espelha refGearHp de dungeonAdventures. */
export const REF_SET_HP = 42
export function gearHpFor(enh: number): number {
  return Math.floor(REF_SET_HP * getStatMultiplier(enh))
}

/** gearTier de um set homogêneo de 9 peças (raridade × +N). */
export function gearTierFor(rarity: Rarity, enh: number): number {
  const pieces = []
  for (let i = 0; i < NOMINAL_SLOTS; i++) pieces.push({ rarity, enhancementLevel: enh })
  return deriveGearTier(pieces)
}

export interface GearRef { rarity: Rarity; enh: number; gearTier: number; gearHp: number }

export function gearFor(rarity: Rarity, enh: number): GearRef {
  return { rarity, enh, gearTier: gearTierFor(rarity, enh), gearHp: gearHpFor(enh) }
}

/**
 * Gear-ALVO por masmorra (a raridade que o boss daquela banda libera, no
 * aprimoramento de topo). Espelha o TARGET_GEAR privado de dungeonAdventures.
 */
export const TARGET_GEAR: Record<string, { rarity: Rarity; enh: number; tag: string }> = {
  floresta: { rarity: 'UNCOMMON',  enh: 16, tag: 'PRI' },
  caverna:  { rarity: 'RARE',      enh: 17, tag: 'DUO' },
  pantano:  { rarity: 'EPIC',      enh: 18, tag: 'TRI' },
  ruinas:   { rarity: 'LEGENDARY', enh: 19, tag: 'TET' },
}

/** Gear com que o jogador CHEGA em cada masmorra (= o alvo da anterior). */
export const ENTRY_GEAR: Record<string, { rarity: Rarity; enh: number } | null> = {
  floresta: null,
  caverna:  { rarity: 'UNCOMMON', enh: 16 },
  pantano:  { rarity: 'RARE',     enh: 17 },
  ruinas:   { rarity: 'EPIC',     enh: 18 },
}

export const ENH_TAG: Record<number, string> = { 16: 'PRI', 17: 'DUO', 18: 'TRI', 19: 'TET', 20: 'PEN' }
export const enhLabel = (enh: number) => (ENH_TAG[enh] ? `${ENH_TAG[enh]}` : `+${enh}`)
export const gearLabel = (rarity: Rarity, enh: number) => `${RARITY_PT[rarity]} ${enhLabel(enh)}`

export const RARITY_PT: Record<Rarity, string> = {
  COMMON: 'comum', UNCOMMON: 'incomum', RARE: 'raro', EPIC: 'épico', LEGENDARY: 'lendário',
}

export interface Hero {
  race: string
  klass: CombatClass
  level: number
  attrs: Attrs
  gear: GearRef
  /** HP efetivo com a fórmula de produção (o que o jogador leva para a luta). */
  maxHp: number
  /** HP efetivo com a fórmula que dimensionou o boss — para medir o desvio. */
  maxHpCalib: number
}

export function buildHero(
  race: string, klass: CombatClass, level: number, rarity: Rarity, enh: number,
  opts: { withFloor?: boolean } = {},
): Hero {
  const attrs = buildAttrs(race, klass, level, opts.withFloor !== false)
  const gear = gearFor(rarity, enh)
  return {
    race, klass, level, attrs, gear,
    maxHp: hpProd(attrs, level) + gear.gearHp,
    maxHpCalib: hpCalib(attrs) + gear.gearHp,
  }
}

/** mulberry32 — PRNG determinístico, o mesmo padrão dos outros sims. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
