/**
 * ⚔️ MODELO DE COMBATE ENXUTO — espelho CommonJS de src/lib/combatModel.ts.
 * O socket é Node JS puro (require) e não importa TS; mantenha os dois em sincronia.
 * Documentação e princípios: src/lib/combatModel.ts + docs/combate-ataque-por-arma.md.
 */

const PROFILE = {
  warrior: { power: 105, armor: 160, hp: 438, evade: 0.05 },
  rogue: { power: 145, armor: 55, hp: 282, evade: 0.30 },
  mage: { power: 175, armor: 57, hp: 332, evade: 0.18 },
  monk: { power: 129, armor: 117, hp: 311, evade: 0.22 },
}

const DICE_SIDES = 12
const LUCK_LO = 0.55
const LUCK_HI = 1.75
const CRIT_MULT = 1.6
const K50 = 220
const WEIGHT_LEVEL = 0.4 // espelho de src/lib/combatModel.ts (gear = progressão sentida)
const WEIGHT_GEAR = 0.6
const GEAR_FLOOR = 0.10
const MAX_LEVEL_REF = 50
const DODGE_STAMINA_COST = 3
const BLOCK_ARMOR_MULT = 2.5

// 🐉 Transformação = buff temporário SIMÉTRICO: equivale a subir o poder de escala S
// por um fator único (poder/armadura/hp/K sobem juntos; evasão é invariante de escala).
// Por ser simétrico entre classes, o equilíbrio se preserva por construção.
const TRANSFORM_SCALE = 1.25

// Ataques gated por recurso de combate UNIFORME (ver src/lib/combatModel.ts).
const ATTACKS = {
  basic: { powerMult: 0.72, stamina: 1, mp: 0, requiresTransform: false, label: 'Golpe' },
  weapon: { powerMult: 1.0, stamina: 2, mp: 8, requiresTransform: false, label: 'Ataque de Classe' },
  special: { powerMult: 1.5, stamina: 3, mp: 18, requiresTransform: true, label: 'Especial' },
}
// 🗡️ Nome do ATAQUE DE CLASSE (o `weapon`, d8) por classe — identidade no botão do PvP.
const CLASS_ATTACK_NAME = {
  warrior: 'Investida Pesada', rogue: 'Ataque Furtivo', mage: 'Bola de Fogo', monk: 'Golpe Triplo',
}
function classAttackName(raw) {
  const c = normalizeCombatClass(raw)
  return (c && CLASS_ATTACK_NAME[c]) || 'Ataque de Classe'
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
  const TIER = { 16: 2.0, 17: 2.2, 18: 2.45, 19: 2.8, 20: 3.3 }
  const mult = lvl <= 15 ? 1 + lvl * 0.05 : (TIER[lvl] != null ? TIER[lvl] : 2.8)
  return mult / 2.8
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
const ATTR_TILT = { power: 0.55, powerAgi: 0.30, armor: 0.5, hp: 1.3, evade: 0.0020, evadeCap: 0.6, block: 0.0025, blockCap: 0.45 }
// Peso do atributo no PODER, por classe (identidade): cada classe rende cheio (1.0)
// no seu atributo-chave e menos no "errado". Guerreiro=força, Mago=mente (o off-stat
// rende 0.8); Monge híbrido equilibrado (1.0/1.0); Ladino não vive de força nem mente
// (0.8/0.8) e converte AGI em DANO de verdade (1.6 → ~0.48/pt vs 0.30), dando sentido
// a investir em AGI (que antes só virava evasão).
const ATTR_POWER_WEIGHT = {
  warrior: { str: 1.0, int: 0.8, agi: 1.0 },
  mage:    { str: 0.8, int: 1.0, agi: 1.0 },
  monk:    { str: 1.0, int: 1.0, agi: 1.0 },
  rogue:   { str: 0.8, int: 0.8, agi: 1.6 },
}
const NEUTRAL_WEIGHT = { str: 1.0, int: 1.0, agi: 1.0 }
function applyAttrTilt(levers, attrs, cls) {
  if (!attrs) return levers
  const str = Math.max(0, Number(attrs.str) || 0)
  const agi = Math.max(0, Number(attrs.agi) || 0)
  const int = Math.max(0, Number(attrs.int) || 0)
  const def = Math.max(0, Number(attrs.def) || 0)
  const t = ATTR_TILT
  const w = ATTR_POWER_WEIGHT[cls] || NEUTRAL_WEIGHT
  return {
    ...levers,
    power: levers.power + (str * w.str + int * w.int) * t.power + agi * w.agi * t.powerAgi,
    armor: levers.armor + def * t.armor,
    hp: levers.hp + def * t.hp,
    evade: Math.min(t.evadeCap, levers.evade + agi * t.evade),
    block: Math.min(t.blockCap, (levers.block || 0) + def * t.block),
  }
}

function computeLevers(cls, level, gearTier, attrs) {
  const p = PROFILE[cls] || PROFILE.warrior
  const S = powerScale(level, gearTier)
  const base = { power: p.power * S, armor: p.armor * S, hp: p.hp * S, evade: p.evade, block: 0, K: K50 * S, scale: S }
  return applyAttrTilt(base, attrs, cls)
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
    block: levers.block || 0,
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
    block: levers.block || 0,
    K: levers.K / f,
    scale: levers.scale / f,
  }
}

function luckOf(roll, sides) {
  const s = sides || DICE_SIDES
  const t = s > 1 ? (roll - 1) / (s - 1) : 1
  let mult = LUCK_LO + (LUCK_HI - LUCK_LO) * t
  if (roll >= s) mult *= CRIT_MULT
  return mult
}

function rollDie(rng, sides) {
  return 1 + Math.floor((rng || Math.random)() * (sides || DICE_SIDES))
}

function damageReduction(armor, K) {
  const a = Math.max(0, armor)
  return a / (a + K)
}

// `opts.sides` = lados do dado do ATAQUE (PvP: Golpe d6 / Ataque de Classe d8 / Especial d20).
// Sorte e crítico (rolagem máxima) usam esse dado; default d12 preserva o comportamento antigo.
// Defesa passiva (padrão): esquiva% → bloqueio% (DEF) → hit. Modos dodge/block legados mantidos.
function resolveHit(attacker, defender, opts) {
  opts = opts || {}
  const rng = opts.rng || Math.random
  const sides = opts.sides || DICE_SIDES
  const roll = opts.forcedRoll != null ? opts.forcedRoll : rollDie(rng, sides)
  const crit = roll >= sides
  const mode = opts.defense || 'passive'

  if (mode === 'dodge') {
    const dodged = opts.ignoreEvade ? false : (opts.dodgeSucceeded != null ? opts.dodgeSucceeded : rng() < defender.evade)
    if (dodged) return { damage: 0, roll, crit, dodged: true, blocked: false }
    const raw = attacker.power * luckOf(roll, sides)
    const damage = Math.max(1, Math.round(raw * (1 - damageReduction(defender.armor, defender.K))))
    return { damage, roll, crit, dodged: false, blocked: false }
  }

  if (mode === 'block') {
    const effArmor = defender.armor * BLOCK_ARMOR_MULT
    const raw = attacker.power * luckOf(roll, sides)
    const damage = Math.max(1, Math.round(raw * (1 - damageReduction(effArmor, defender.K))))
    return { damage, roll, crit, dodged: false, blocked: true }
  }

  const dodged = opts.ignoreEvade
    ? false
    : (opts.dodgeSucceeded != null ? opts.dodgeSucceeded : rng() < (defender.evade || 0))
  if (dodged) return { damage: 0, roll, crit, dodged: true, blocked: false }

  const blockChance = Math.max(0, defender.block || 0)
  const blocked = blockChance > 0 && rng() < blockChance
  const effArmor = blocked ? defender.armor * BLOCK_ARMOR_MULT : defender.armor
  const raw = attacker.power * luckOf(roll, sides)
  const damage = Math.max(1, Math.round(raw * (1 - damageReduction(effArmor, defender.K))))
  return { damage, roll, crit, dodged: false, blocked }
}

// ============================================================
// O dado é só um PLUS no dano (sorte), nunca decide sozinho hit/miss. Esquiva é 100%
// uma %-de-stat — EXCETO que rolar o número MÁXIMO do dado garante o evento especial
// (crítico pro atacante, esquiva total pro defensor), independente de stat.
//   • jogador ataca o monstro → resolveHit/luckOf (igual ao PvP): monstro esquiva por
//     % pura, nunca rola.
//   • monstro ataca o jogador → resolveMonsterHit: o monstro NÃO rola (dano dos stats,
//     com variação pequena sem dado); o jogador, defendendo, ainda rola — número
//     máximo = esquiva total garantida, senão esquiva por %.
// ============================================================
const PVE_DIE = { basic: 6, weapon: 8, special: 20 }
// Variação do dano do monstro (±12%, SEM dado): mantém o golpe "vivo" mesmo sem luck/crit.
const MONSTER_DMG_VARIANCE = 0.12
function resolveMonsterHit(opts) {
  const rng = opts.rng || Math.random
  const sides = opts.sides || DICE_SIDES
  const defRoll = opts.forcedDefRoll != null ? opts.forcedDefRoll : rollDie(rng, sides)
  const natMax = defRoll >= sides
  const def = opts.defender || {}
  const avoided = natMax || rng() < (def.evade || 0)
  if (avoided) return { damage: 0, avoided: true, blocked: false, crit: false, defRoll, natMax }
  const blockChance = Math.max(0, def.block || 0)
  const blocked = blockChance > 0 && rng() < blockChance
  const variance = 1 + (rng() * 2 - 1) * MONSTER_DMG_VARIANCE
  const raw = opts.power * variance
  const effArmor = blocked ? (def.armor || 0) * BLOCK_ARMOR_MULT : (def.armor || 0)
  const damage = Math.max(1, Math.round(raw * (1 - damageReduction(effArmor, def.K))))
  return { damage, avoided: false, blocked, crit: false, defRoll, natMax }
}

module.exports = {
  PROFILE, DICE_SIDES, LUCK_LO, LUCK_HI, CRIT_MULT, K50,
  WEIGHT_LEVEL, WEIGHT_GEAR, GEAR_FLOOR, MAX_LEVEL_REF, DODGE_STAMINA_COST, BLOCK_ARMOR_MULT,
  TRANSFORM_SCALE, transformLevers, revertTransformLevers,
  clampGearTier, powerScale, computeLevers, luckOf, rollDie, damageReduction, resolveHit,
  RARITY_WEIGHT, NOMINAL_SLOTS, enhanceTierFactor, deriveGearTier,
  ATTACKS, attackPower, chooseAttack, CLASS_ATTACK_NAME, classAttackName,
  ATTR_TILT, ATTR_POWER_WEIGHT, applyAttrTilt, normalizeCombatClass,
  PVE_DIE, MONSTER_DMG_VARIANCE, resolveMonsterHit,
}
