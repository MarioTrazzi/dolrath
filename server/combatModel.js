/**
 * ⚔️ MODELO DE COMBATE ENXUTO — espelho CommonJS de src/lib/combatModel.ts.
 * O socket é Node JS puro (require) e não importa TS; mantenha os dois em sincronia.
 * Documentação e princípios: src/lib/combatModel.ts + docs/combate-ataque-por-arma.md.
 */

const PROFILE = {
  warrior: { power: 102, armor: 160, hp: 438, evade: 0.05 },
  rogue: { power: 160, armor: 55, hp: 282, evade: 0.30 },
  mage: { power: 175, armor: 50, hp: 312, evade: 0.18 },
  monk: { power: 132, armor: 120, hp: 316, evade: 0.22 },
}

const DICE_SIDES = 12
const LUCK_LO = 0.55
const LUCK_HI = 1.75
const CRIT_MULT = 1.6
const K50 = 220
const WEIGHT_LEVEL = 0.5
const WEIGHT_GEAR = 0.5
const GEAR_FLOOR = 0.25
const MAX_LEVEL_REF = 50
const DODGE_STAMINA_COST = 3
const BLOCK_ARMOR_MULT = 2.5

// 🐉 Transformação = buff temporário SIMÉTRICO: equivale a subir o poder de escala S
// por um fator único (poder/armadura/hp/K sobem juntos; evasão é invariante de escala).
// Por ser simétrico entre classes, o equilíbrio se preserva por construção.
const TRANSFORM_SCALE = 1.25

// Ataques gated por recurso de combate UNIFORME (ver src/lib/combatModel.ts).
const ATTACKS = {
  basic: { powerMult: 0.72, stamina: 1, requiresTransform: false, label: 'Ataque Básico' },
  weapon: { powerMult: 1.0, stamina: 2, requiresTransform: false, label: 'Ataque da Arma' },
  special: { powerMult: 1.5, stamina: 3, requiresTransform: true, label: 'Especial' },
}
function attackPower(basePower, type) { return basePower * ((ATTACKS[type] && ATTACKS[type].powerMult) || 1) }
function chooseAttack(opts) {
  opts = opts || {}
  const stam = opts.stamina != null ? opts.stamina : 99
  if (opts.transformed && stam >= ATTACKS.special.stamina) return 'special'
  if (stam >= ATTACKS.weapon.stamina) return 'weapon'
  return 'basic'
}

function clampGearTier(tier) {
  if (Number.isNaN(tier)) return GEAR_FLOOR
  return Math.max(GEAR_FLOOR, Math.min(1, tier))
}

// === tier do gear (equipamento → [0,1], BiS lendário IV = 1) ===
const RARITY_WEIGHT = { COMMON: 0.25, UNCOMMON: 0.4, RARE: 0.58, EPIC: 0.78, LEGENDARY: 1.0 }
const NOMINAL_SLOTS = 9

function enhanceTierFactor(enhancementLevel) {
  const lvl = Math.max(0, Math.min(20, Math.floor(enhancementLevel || 0)))
  const TIER = { 16: 1.9, 17: 2.0, 18: 2.1, 19: 2.2, 20: 2.5 }
  const mult = lvl <= 15 ? 1 + lvl * 0.05 : (TIER[lvl] != null ? TIER[lvl] : 2.2)
  return mult / 2.2
}

function deriveGearTier(equipped) {
  if (!equipped || equipped.length === 0) return 0
  let sum = 0
  for (const eq of equipped) {
    const w = RARITY_WEIGHT[(eq.rarity || '').toUpperCase()] != null ? RARITY_WEIGHT[(eq.rarity || '').toUpperCase()] : 0.25
    sum += w * enhanceTierFactor(eq.enhancementLevel || 0)
  }
  return Math.min(1, sum / NOMINAL_SLOTS)
}

function powerScale(level, gearTier) {
  const lvl = Math.max(0, level) / MAX_LEVEL_REF
  return WEIGHT_LEVEL * lvl + WEIGHT_GEAR * clampGearTier(gearTier)
}

// === TILT DE ATRIBUTOS (criação + nível) → ajuste simétrico nos levers ===
// Espelho de src/lib/combatModel.ts. STR/INT→poder; DEF→armadura+HP; AGI→evasão.
const ATTR_TILT = { power: 0.55, powerAgi: 0.30, armor: 0.5, hp: 1.3, evade: 0.0020, evadeCap: 0.6 }
function applyAttrTilt(levers, attrs) {
  if (!attrs) return levers
  const str = Math.max(0, Number(attrs.str) || 0)
  const agi = Math.max(0, Number(attrs.agi) || 0)
  const int = Math.max(0, Number(attrs.int) || 0)
  const def = Math.max(0, Number(attrs.def) || 0)
  const t = ATTR_TILT
  return {
    ...levers,
    power: levers.power + (str + int) * t.power + agi * t.powerAgi,
    armor: levers.armor + def * t.armor,
    hp: levers.hp + def * t.hp,
    evade: Math.min(t.evadeCap, levers.evade + agi * t.evade),
  }
}

function computeLevers(cls, level, gearTier, attrs) {
  const p = PROFILE[cls] || PROFILE.warrior
  const S = powerScale(level, gearTier)
  const base = { power: p.power * S, armor: p.armor * S, hp: p.hp * S, evade: p.evade, K: K50 * S, scale: S }
  return applyAttrTilt(base, attrs)
}

/** Normaliza um nome de classe (PT/EN) para a CombatClass. null = desconhecida (monstro). */
function normalizeCombatClass(raw) {
  const c = String(raw || '').toLowerCase().trim()
  if (!c) return null
  if (c === 'warrior' || c.includes('guerr') || c.includes('warri')) return 'warrior'
  if (c === 'rogue' || c.includes('ladin') || c.includes('assass') || c.includes('arqueir') || c.includes('rogue')) return 'rogue'
  if (c === 'mage' || c.includes('mag') || c.includes('feiti')) return 'mage'
  if (c === 'monk' || c.includes('monge') || c.includes('monk')) return 'monk'
  return null
}

// Aplica o buff de transformação aos levers (escala simétrica). Retorna NOVOS levers;
// o caller deve guardar os levers-base para reverter (revertTransformLevers).
function transformLevers(levers, scale) {
  const f = scale || TRANSFORM_SCALE
  return {
    power: levers.power * f,
    armor: levers.armor * f,
    hp: levers.hp * f,
    evade: levers.evade, // % é invariante de escala
    K: levers.K * f,
    scale: levers.scale * f,
  }
}
// Reverte o buff (divide pelo fator). Use com o MESMO scale aplicado.
function revertTransformLevers(levers, scale) {
  const f = scale || TRANSFORM_SCALE
  return {
    power: levers.power / f,
    armor: levers.armor / f,
    hp: levers.hp / f,
    evade: levers.evade,
    K: levers.K / f,
    scale: levers.scale / f,
  }
}

function luckOf(roll) {
  const t = DICE_SIDES > 1 ? (roll - 1) / (DICE_SIDES - 1) : 1
  let mult = LUCK_LO + (LUCK_HI - LUCK_LO) * t
  if (roll >= DICE_SIDES) mult *= CRIT_MULT
  return mult
}

function rollDie(rng) {
  return 1 + Math.floor((rng || Math.random)() * DICE_SIDES)
}

function damageReduction(armor, K) {
  const a = Math.max(0, armor)
  return a / (a + K)
}

function resolveHit(attacker, defender, opts) {
  opts = opts || {}
  const rng = opts.rng || Math.random
  const roll = opts.forcedRoll != null ? opts.forcedRoll : rollDie(rng)
  const crit = roll >= DICE_SIDES
  if (opts.defense === 'dodge') {
    const dodged = opts.dodgeSucceeded != null ? opts.dodgeSucceeded : rng() < defender.evade
    if (dodged) return { damage: 0, roll, crit, dodged: true, blocked: false }
  }
  const block = opts.defense === 'block'
  const effArmor = block ? defender.armor * BLOCK_ARMOR_MULT : defender.armor
  const raw = attacker.power * luckOf(roll)
  const damage = Math.max(1, Math.round(raw * (1 - damageReduction(effArmor, defender.K))))
  return { damage, roll, crit, dodged: false, blocked: block }
}

module.exports = {
  PROFILE, DICE_SIDES, LUCK_LO, LUCK_HI, CRIT_MULT, K50,
  WEIGHT_LEVEL, WEIGHT_GEAR, GEAR_FLOOR, MAX_LEVEL_REF, DODGE_STAMINA_COST, BLOCK_ARMOR_MULT,
  TRANSFORM_SCALE, transformLevers, revertTransformLevers,
  clampGearTier, powerScale, computeLevers, luckOf, rollDie, damageReduction, resolveHit,
  RARITY_WEIGHT, NOMINAL_SLOTS, enhanceTierFactor, deriveGearTier,
  ATTACKS, attackPower, chooseAttack,
  ATTR_TILT, applyAttrTilt, normalizeCombatClass,
}
