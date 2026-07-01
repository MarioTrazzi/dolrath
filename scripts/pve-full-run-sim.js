#!/usr/bin/env node
// ============================================================
// DOLRATH — Simulador de RUN COMPLETA da Floresta (PvE), não só o boss.
//
// scripts/pve-race-class-sim.js testa SÓ o boss (Anciã da Mata), assumindo o jogador
// chegando com vida cheia. Este script anda a TRILHA INTEIRA — 2 nós menores + 1 sala
// principal por "room" (×3 rooms) + boss — como uma run real, com o jogador
// NIVELANDO/EQUIPANDO ao longo do caminho (rastreia a MESMA rampa nível/gear que os
// monstros usam em scaleMonster: levelReq→clearLevel, GEAR_TIER_FLOOR→gear-alvo).
//
// CONSUMÍVEIS INFINITOS DE HP/MP: o jogador entra em CADA encontro com vida cheia
// (representa poções ilimitadas entre combates). Isso isola a pergunta do Mario:
// mesmo assumindo que dá pra chegar no boss com vida cheia, é FÁCIL ou tem alguma
// dificuldade real nos combates individuais (salas + pacotes de monstro) até lá?
//
// Nó MENOR pode não ter luta (evento de achado/fonte) — a chance de monstro depende
// do d20 (MINOR_MONSTER_CHANCE_BY_TIER, espelha dungeonRunServer.ts). Quando tem
// monstro, é um PACOTE de 1-3 (scaleMonsterGroup: PACK_SHARE/PACK_ATK_SHARE).
// Sala principal = guardião SOLO sempre. Boss = igual ao pve-race-class-sim.js.
//
// Uso:
//   node scripts/pve-full-run-sim.js
//   node scripts/pve-full-run-sim.js --runs=3000
// ============================================================

const CM = require('../server/combatModel')

const args = process.argv.slice(2)
const getArg = (name, def) => {
  const a = args.find((x) => x.startsWith(`--${name}`))
  if (!a) return def
  const v = a.split('=')[1]
  return v === undefined ? true : v
}
const RUNS = Number(getArg('runs', 3000))       // Monte Carlo da run completa (trilha + rolagens de d20)
const NODE_FIGHTS = Number(getArg('nodefights', 3000)) // amostra por nó isolado (curva de dificuldade)

// ============================================================
// DUNGEON: Floresta (src/lib/dungeonAdventures.ts) — rooms=3, minorNodes=2, lvlReq=1,
// clearLevel=10, difficultyStars=1. Monstros/boss com os stats REAIS do catálogo.
// ============================================================
const ROOMS = 3, MINOR_NODES = 2, LEVEL_REQ = 1, CLEAR_LEVEL = 10, DIFFICULTY_STARS = 1, DIFFICULTY = 1.0
const TIER_POWER_STEP = 0.6 // == dungeonAdventures.ts (recompensas por sala, não afeta combate)
const tierFactorOf = (tier) => 1 + (tier - 1) * TIER_POWER_STEP
const MONSTERS = [
  { name: 'Lobo',   baseHp: 42, baseAttack: 9,  baseDefense: 3, baseEvade: 0.16 },
  { name: 'Aranha', baseHp: 38, baseAttack: 11, baseDefense: 2, baseEvade: 0.12 },
  { name: 'Javali', baseHp: 55, baseAttack: 8,  baseDefense: 5, baseEvade: 0.05 },
  { name: 'Ent',    baseHp: 70, baseAttack: 10, baseDefense: 7, baseEvade: 0.02 },
]
const meanBy = (arr, f) => arr.reduce((s, x) => s + f(x), 0) / arr.length
const MEAN_HP = meanBy(MONSTERS, (m) => m.baseHp)
const MEAN_ATK = meanBy(MONSTERS, (m) => m.baseAttack)
const MEAN_DEF = meanBy(MONSTERS, (m) => m.baseDefense)
function pickMonster() { return MONSTERS[Math.floor(Math.random() * MONSTERS.length)] }

const PRI = 16
const PLAYER_GEAR = { rarity: 'UNCOMMON', enh: PRI } // gear-ALVO da Floresta ("tudo PRI" no boss)
const GEAR_TIER_FLOOR = 0.25
const BOSS_POW_MULT = 0.9, BOSS_ARM_MULT = 0.8, MON_ARMOR = 96
const ROOM_HP_LO = 1.4, ROOM_HP_HI = 3.0, MINOR_HP_FAC = 0.7, MINOR_STR_FAC = 0.78
const BOSS_HP_MULT_FLORESTA = { warrior: 2.76, rogue: 2.74, mage: 2.62, monk: 2.90 } // == produção (pós-retune)
const BOSS_EVADE = 0.08 // Anciã da Mata

// ============================================================
// PERSONAGEM (jogador) — espelha src/lib/gameData.ts (== pve-race-class-sim.js, já
// com o rebalanceamento aplicado: draconiano constitution 50→30).
// ============================================================
const RACES = { humano: { str: 2, agi: 2, int: 2, def: 2 }, draconiano: { str: 3, agi: 0, int: 0, def: 3 }, metamorfo: { str: 0, agi: 5, int: 0, def: 3 }, elfo: { str: 0, agi: 3, int: 4, def: 2 } }
const CLASSES = { warrior: { str: 4, agi: 0, int: 0, def: 3 }, rogue: { str: 0, agi: 4, int: 2, def: 0 }, mage: { str: 0, agi: 0, int: 5, def: 0 }, monk: { str: 0, agi: 4, int: 0, def: 4 } }
const BUILD = { warrior: { str: .7, def: .3 }, rogue: { agi: .85, def: .15 }, mage: { int: .85, def: .15 }, monk: { agi: .55, def: .45 } }
const CREATION_PTS = 18, CAP = 10
function distribute(klass, level) {
  const w = BUILD[klass]; const out = { str: 0, agi: 0, int: 0, def: 0 }
  const levelPts = Math.max(0, level - 1)
  let spill = 0
  for (const k of Object.keys(w)) { const want = Math.round(CREATION_PTS * w[k]); out[k] = Math.min(CAP, want); spill += want - out[k] }
  out.def = Math.min(CAP, out.def + spill)
  for (const k of Object.keys(w)) out[k] += Math.round(levelPts * w[k])
  return out
}
function buildChar(race, klass, level) {
  const d = distribute(klass, level)
  const rb = RACES[race], cb = CLASSES[klass]
  const str = d.str + rb.str + cb.str, agi = d.agi + rb.agi + cb.agi
  const int = d.int + rb.int + cb.int, def = d.def + rb.def + cb.def
  return { str, agi, int, def, level, klass, gameMaxHp: 80 + str * 2 + def * 4 }
}

// ============================================================
// ÂNCORA NEUTRA (== produção, dungeonAdventures.ts anchorAt) — pro MONSTRO (boss e
// salas usam a build de referência neutra, raça-independente).
// ============================================================
const REF_RACE = { str: 2, agi: 2, int: 2, def: 2 }
const REF_CLASS_BONUS = { warrior: { str: 4, agi: 0, int: 0, def: 3 }, rogue: { str: 0, agi: 4, int: 2, def: 0 }, mage: { str: 0, agi: 0, int: 5, def: 0 }, monk: { str: 0, agi: 4, int: 0, def: 4 } }
const REF_BUILD = { warrior: { str: 0.7, def: 0.3 }, rogue: { agi: 0.85, def: 0.15 }, mage: { int: 0.85, def: 0.15 }, monk: { agi: 0.55, def: 0.45 } }
const REF_CLASSES = ['warrior', 'rogue', 'mage', 'monk']
const REF_CREATION_PTS = 18, REF_STAT_CAP = 10, REF_SET_HP = 42
function refAttrs(klass, level) {
  const w = REF_BUILD[klass]
  const out = { str: 0, agi: 0, int: 0, def: 0 }
  const levelPts = Math.max(0, level - 1)
  let spill = 0
  for (const k of Object.keys(w)) { const want = Math.round(REF_CREATION_PTS * w[k]); out[k] = Math.min(REF_STAT_CAP, want); spill += want - out[k] }
  out.def = Math.min(REF_STAT_CAP, out.def + spill)
  for (const k of Object.keys(w)) out[k] += Math.round(levelPts * w[k])
  const cb = REF_CLASS_BONUS[klass]
  return { str: out.str + REF_RACE.str + cb.str, agi: out.agi + REF_RACE.agi + cb.agi, int: out.int + REF_RACE.int + cb.int, def: out.def + REF_RACE.def + cb.def }
}
const refGearHp = (enh) => Math.floor(REF_SET_HP * (enh <= 0 ? 1 : enh <= 15 ? 1 + enh * 0.08 : 2.5))
function anchorAt(level, gearTier, gearHp) {
  let powerSum = 0, hpSum = 0
  for (const k of REF_CLASSES) {
    const a = refAttrs(k, level)
    powerSum += CM.computeLevers(k, level, gearTier, a).power
    hpSum += 80 + a.str * 2 + a.def * 4 + gearHp
  }
  return { power: powerSum / REF_CLASSES.length, hp: hpSum / REF_CLASSES.length }
}
const targetTier = CM.deriveGearTier(Array.from({ length: CM.NOMINAL_SLOTS }, () => ({ rarity: PLAYER_GEAR.rarity, enhancementLevel: PLAYER_GEAR.enh })))
const targetHp = refGearHp(PLAYER_GEAR.enh)

// nodeProgress (== dungeonAdventures.ts) — progresso [0,1] no BAND (1ª sala perto de 0,
// última perto de 1; boss = 1). Nó MENOR fica um pouco ANTES da sala principal do tier.
function nodeProgress(tier, isMain, isBoss) {
  if (isBoss) return 1
  const base = tier / (ROOMS + 1)
  return isMain ? base : Math.max(0.04, base - 0.5 / (ROOMS + 1))
}
const lerp = (a, b, p) => a + (b - a) * Math.max(0, Math.min(1, p))

// Monstro escalado (main/minor) — porta 1:1 scaleMonster() não-boss.
function scaleRoomMonster(def, tier, isMain) {
  const p = nodeProgress(tier, isMain, false)
  const level = Math.round(lerp(LEVEL_REQ, CLEAR_LEVEL, p))
  const gearTier = lerp(GEAR_TIER_FLOOR, targetTier, p)
  const gearHp = Math.floor(lerp(0, targetHp, p))
  const hpMult = lerp(ROOM_HP_LO, ROOM_HP_HI, p) * (isMain ? 1 : MINOR_HP_FAC)
  const strFac = isMain ? 1 : MINOR_STR_FAC
  const anchor = anchorAt(level, gearTier, gearHp)
  const S = CM.powerScale(level, gearTier)
  const rHp = def.baseHp / MEAN_HP, rAtk = def.baseAttack / MEAN_ATK, rDef = def.baseDefense / MEAN_DEF
  const specialFromTier = ROOMS - (DIFFICULTY_STARS - 1)
  const hasSpecial = isMain && tier >= specialFromTier
  const goldReward = Math.floor((isMain ? 25 + Math.random() * 25 : 6 + Math.random() * 10) * DIFFICULTY * tierFactorOf(tier))
  return {
    power: Math.max(1, Math.floor(anchor.power * BOSS_POW_MULT * strFac * rAtk)),
    armor: Math.max(0, Math.floor(MON_ARMOR * S * BOSS_ARM_MULT * strFac * rDef)),
    hp: Math.max(1, Math.floor(anchor.hp * hpMult * rHp)),
    evade: def.baseEvade,
    K: CM.K50 * (Math.max(1, level) / CM.MAX_LEVEL_REF + 0.5),
    scale: S, hasSpecial, level, goldReward,
  }
}
function scaleBoss(klass) {
  const anchor = anchorAt(CLEAR_LEVEL, targetTier, targetHp)
  const S = CM.powerScale(CLEAR_LEVEL, targetTier)
  const bossLevel = CLEAR_LEVEL + 2
  const goldReward = Math.floor((150 + Math.random() * 150) * DIFFICULTY * tierFactorOf(ROOMS))
  return {
    power: Math.max(1, Math.floor(anchor.power * BOSS_POW_MULT)),
    armor: Math.max(0, Math.floor(MON_ARMOR * S * BOSS_ARM_MULT)),
    hp: Math.max(1, Math.floor(anchor.hp * BOSS_HP_MULT_FLORESTA[klass])),
    evade: BOSS_EVADE,
    K: CM.K50 * (bossLevel / CM.MAX_LEVEL_REF + 0.5),
    scale: S, hasSpecial: true, level: bossLevel, goldReward,
  }
}
// Pacote de nó MENOR (== scaleMonsterGroup): 1-3 monstros, HP/ataque "divididos".
const MINOR_PACK_WEIGHTS = [{ size: 1, weight: 0.40 }, { size: 2, weight: 0.35 }, { size: 3, weight: 0.25 }]
const PACK_SHARE = { 1: 1, 2: 0.6, 3: 0.45 }
const PACK_ATK_SHARE = { 1: 1, 2: 0.5, 3: 0.34 }
function rollPackSize() {
  const total = MINOR_PACK_WEIGHTS.reduce((s, w) => s + w.weight, 0)
  let r = Math.random() * total
  for (const w of MINOR_PACK_WEIGHTS) { if (r < w.weight) return w.size; r -= w.weight }
  return 1
}
function scaleMinorPack(tier) {
  const size = rollPackSize()
  const hpShare = PACK_SHARE[size], atkShare = PACK_ATK_SHARE[size]
  const pack = []
  for (let i = 0; i < size; i++) {
    const m = scaleRoomMonster(pickMonster(), tier, false)
    if (size > 1) { m.hp = Math.max(1, Math.floor(m.hp * hpShare)); m.power = Math.max(1, Math.floor(m.power * atkShare)); m.goldReward = Math.max(1, Math.floor(m.goldReward * hpShare)) }
    pack.push(m)
  }
  return pack
}
// Espólio do NÓ (== rollNodeLoot, só o campo GOLD — drops de item/ingrediente não entram
// nesta conta, só o gold em si).
const LUCK_CFG_GOLD = { low: { base: 4, var: 8 }, mid: { base: 10, var: 16 }, high: { base: 18, var: 30 } }
const NODE_LOOT_GOLD_MULT = { minor: 0.8, main: 1.3, boss: 2.0 }
function nodeLootGold(nodeKind, roll, level) {
  const cfg = LUCK_CFG_GOLD[luckTier(roll)]
  return Math.floor((cfg.base + Math.random() * cfg.var) * NODE_LOOT_GOLD_MULT[nodeKind] * DIFFICULTY * (1 + level * 0.04))
}

// ============================================================
// JOGADOR: nivela/equipa na MESMA rampa (assume-se "no ritmo" — leva o nível/gear que
// a sala espera, exatamente como se estivesse fazendo a run pela 1ª vez).
// ============================================================
function playerAt(race, klass, tier, isMain, isBoss) {
  const p = nodeProgress(tier, isMain, isBoss)
  const level = isBoss ? CLEAR_LEVEL : Math.max(1, Math.round(lerp(LEVEL_REQ, CLEAR_LEVEL, p)))
  const gearTier = isBoss ? targetTier : lerp(GEAR_TIER_FLOOR, targetTier, p)
  const gearHp = isBoss ? targetHp : Math.floor(lerp(0, targetHp, p))
  const char = buildChar(race, klass, level)
  const levers = CM.computeLevers(klass, level, gearTier, { str: char.str, agi: char.agi, int: char.int, def: char.def })
  const pHP = char.gameMaxHp + gearHp
  return { levers, pHP, level }
}

// ============================================================
// COMBATE — dado-como-plus (== pve-race-class-sim.js)
// ============================================================
const DIE = CM.PVE_DIE
const TR_ON = 4, TR_OFF = 6
// Custo de MP do jogador — ATTACKS.weapon/special (combatModel.js) + ativar a
// transformação em si (root cost unificado, src/lib/transformationSystem.ts:74/122/...).
const WEAPON_MP = CM.ATTACKS.weapon.mp, SPECIAL_MP = CM.ATTACKS.special.mp
const TRANSFORM_ACTIVATE_MP = 20

function fightSolo(base, pHP, mon) {
  const tr = { power: base.power * CM.TRANSFORM_SCALE, armor: base.armor * CM.TRANSFORM_SCALE, hp: base.hp, evade: base.evade, K: base.K * CM.TRANSFORM_SCALE, scale: base.scale * CM.TRANSFORM_SCALE }
  let php = pHP, mhp = mon.hp
  let phase = 0
  let hpLost = 0, mpSpent = 0
  const isTransformed = () => phase < TR_ON
  for (let t = 0; t < 400 && php > 0 && mhp > 0; t++) {
    // jogador ataca (conta MP: ativar transformação no início do ciclo + custo do golpe)
    if (phase === 0) mpSpent += TRANSFORM_ACTIVATE_MP
    const pl = isTransformed() ? tr : base
    const kind = isTransformed() ? 'special' : 'weapon'
    mpSpent += kind === 'special' ? SPECIAL_MP : WEAPON_MP
    mhp -= CM.resolveHit({ power: pl.power * CM.ATTACKS[kind].powerMult }, mon, { defense: 'dodge', sides: DIE[kind] }).damage
    phase = (phase + 1) % (TR_ON + TR_OFF)
    if (mhp <= 0) break
    // monstro ataca (mix só se hasSpecial; senão sempre 'weapon')
    const pl2 = isTransformed() ? tr : base
    const x = Math.random()
    const kind2 = !mon.hasSpecial ? 'weapon' : (x < 0.35 ? 'basic' : x < 0.7 ? 'weapon' : 'special')
    const dmg = CM.resolveMonsterHit({ power: mon.power * CM.ATTACKS[kind2].powerMult, sides: DIE[kind2], defender: { armor: pl2.armor, K: pl2.K, evade: pl2.evade } }).damage
    php -= dmg; hpLost += dmg
  }
  const result = php > 0 && mhp <= 0 ? 'win' : mhp > 0 && php <= 0 ? 'loss' : 'timeout'
  return { result, hpLost: Math.min(hpLost, pHP), mpSpent }
}
// Pacote: jogador foca o 1º vivo; TODOS os vivos batem de volta a cada rodada.
function fightPack(base, pHP, packIn) {
  const tr = { power: base.power * CM.TRANSFORM_SCALE, armor: base.armor * CM.TRANSFORM_SCALE, hp: base.hp, evade: base.evade, K: base.K * CM.TRANSFORM_SCALE, scale: base.scale * CM.TRANSFORM_SCALE }
  const pack = packIn.map((m) => ({ ...m, curHp: m.hp }))
  let php = pHP
  let phase = 0
  let hpLost = 0, mpSpent = 0
  const isTransformed = () => phase < TR_ON
  for (let t = 0; t < 400 && php > 0; t++) {
    const alive = pack.filter((m) => m.curHp > 0)
    if (!alive.length) return { result: 'win', hpLost: Math.min(hpLost, pHP), mpSpent }
    const target = alive[0]
    if (phase === 0) mpSpent += TRANSFORM_ACTIVATE_MP
    const pl = isTransformed() ? tr : base
    const kind = isTransformed() ? 'special' : 'weapon'
    mpSpent += kind === 'special' ? SPECIAL_MP : WEAPON_MP
    target.curHp -= CM.resolveHit({ power: pl.power * CM.ATTACKS[kind].powerMult }, target, { defense: 'dodge', sides: DIE[kind] }).damage
    phase = (phase + 1) % (TR_ON + TR_OFF)
    const stillAlive = pack.filter((m) => m.curHp > 0)
    if (!stillAlive.length) return { result: 'win', hpLost: Math.min(hpLost, pHP), mpSpent }
    const pl2 = isTransformed() ? tr : base
    for (const m of stillAlive) {
      const dmg = CM.resolveMonsterHit({ power: m.power * CM.ATTACKS.weapon.powerMult, sides: DIE.weapon, defender: { armor: pl2.armor, K: pl2.K, evade: pl2.evade } }).damage
      php -= dmg; hpLost += dmg
      if (php <= 0) break
    }
  }
  return { result: php > 0 ? 'win' : 'loss', hpLost: Math.min(hpLost, pHP), mpSpent }
}

// Chance de monstro num nó MENOR (== dungeonRunServer.ts MINOR_MONSTER_CHANCE_BY_TIER)
function luckTier(roll) { return roll <= 5 ? 'low' : roll <= 13 ? 'mid' : 'high' }
const MINOR_MONSTER_CHANCE = { low: 0.9, mid: 0.5, high: 0.1 }

// ============================================================
// (A) CURVA DE DIFICULDADE POR NÓ — cada tipo/tier isolado, vida cheia, amostra própria.
// ============================================================
const RACE_NAMES = Object.keys(RACES)
const CLASS_NAMES = Object.keys(CLASSES)
const CLASS_LABEL = { warrior: 'Guer', rogue: 'Lad', mage: 'Mago', monk: 'Monge' }
const RACE_LABEL = { humano: 'Humano', draconiano: 'Dracon', metamorfo: 'Metam', elfo: 'Elfo' }

console.log(`\n${'='.repeat(92)}`)
console.log(`  DOLRATH PvE — RUN COMPLETA DA FLORESTA (2 nós menores + 1 sala × 3 rooms + boss)`)
console.log(`  jogador NIVELA/EQUIPA na rampa (levelReq 1 → clearLevel 10, gear pelado → PRI) — "run real"`)
console.log(`  consumíveis INFINITOS: vida cheia a cada combate  |  ${RUNS} runs completas · ${NODE_FIGHTS} lutas/nó isolado`)
console.log('='.repeat(92))

console.log(`\n  ── (A) WIN% POR NÓ ISOLADO, MÉDIA DAS 16 COMBINAÇÕES (vida cheia) ──`)
const nodeLabels = []
for (let tier = 1; tier <= ROOMS; tier++) {
  // sala principal
  {
    let winSum = 0, n = 0
    for (const race of RACE_NAMES) for (const klass of CLASS_NAMES) {
      let w = 0
      for (let i = 0; i < NODE_FIGHTS; i++) {
        const { levers, pHP } = playerAt(race, klass, tier, true, false)
        const mon = scaleRoomMonster(pickMonster(), tier, true)
        if (fightSolo(levers, pHP, mon).result === 'win') w++
      }
      winSum += w / NODE_FIGHTS; n++
    }
    const wr = 100 * winSum / n
    console.log(`   Sala principal tier ${tier} (nv~${Math.round(lerp(LEVEL_REQ, CLEAR_LEVEL, nodeProgress(tier, true, false)))})  ${wr.toFixed(1).padStart(5)}%`)
  }
  // nó menor (pacote, quando ocorre)
  {
    let winSum = 0, n = 0
    for (const race of RACE_NAMES) for (const klass of CLASS_NAMES) {
      let w = 0
      for (let i = 0; i < NODE_FIGHTS; i++) {
        const { levers, pHP } = playerAt(race, klass, tier, false, false)
        const pack = scaleMinorPack(tier)
        if (fightPack(levers, pHP, pack).result === 'win') w++
      }
      winSum += w / NODE_FIGHTS; n++
    }
    const wr = 100 * winSum / n
    console.log(`   Nó menor (pacote) tier ${tier} (nv~${Math.round(lerp(LEVEL_REQ, CLEAR_LEVEL, nodeProgress(tier, false, false)))})  ${wr.toFixed(1).padStart(5)}%`)
  }
}
// boss por classe (média das raças)
{
  let winSum = 0, n = 0
  for (const race of RACE_NAMES) for (const klass of CLASS_NAMES) {
    const boss = scaleBoss(klass)
    let w = 0
    for (let i = 0; i < NODE_FIGHTS; i++) {
      const { levers, pHP } = playerAt(race, klass, ROOMS, true, true)
      if (fightSolo(levers, pHP, boss).result === 'win') w++
    }
    winSum += w / NODE_FIGHTS; n++
  }
  console.log(`   BOSS (Anciã da Mata, nv12)                    ${(100 * winSum / n).toFixed(1).padStart(5)}%`)
}

// ============================================================
// (B) RUN COMPLETA — Monte Carlo da trilha real (com rolagens de d20 nos nós menores).
// ============================================================
console.log(`\n  ── (B) PROBABILIDADE DE RUN LIMPA (ganhar TODOS os combates que rolarem + boss) ──`)
const bosses = {}
for (const k of CLASS_NAMES) bosses[k] = scaleBoss(k)

// Poção usada p/ o consumo: Elixir Supremo (60 HP + 50 MP, itemCatalog.ts) — a que mais
// restaura HP e MP JUNTOS. "Consumíveis infinitos" = cura total a cada combate; aqui
// contamos quantas doses ISSO exigiria na prática.
const ELIXIR_HP = 60, ELIXIR_MP = 50

const runResults = []
for (const race of RACE_NAMES) {
  for (const klass of CLASS_NAMES) {
    let cleared = 0, fights = 0, fightWins = 0
    // consumo/gold só das runs que FECHARAM (o cenário real avaliado: "vida cheia até o boss")
    const clearedHp = [], clearedMp = [], clearedGold = []
    for (let r = 0; r < RUNS; r++) {
      let ok = true, runHp = 0, runMp = 0, runGold = 0
      for (let tier = 1; tier <= ROOMS && ok; tier++) {
        for (let m = 0; m < MINOR_NODES && ok; m++) {
          const roll = 1 + Math.floor(Math.random() * 20)
          const { level: nodeLevel } = playerAt(race, klass, tier, false, false)
          if (Math.random() < MINOR_MONSTER_CHANCE[luckTier(roll)]) {
            const { levers, pHP } = playerAt(race, klass, tier, false, false)
            const pack = scaleMinorPack(tier)
            fights++
            const f = fightPack(levers, pHP, pack)
            runHp += f.hpLost; runMp += f.mpSpent
            if (f.result === 'win') {
              fightWins++
              runGold += pack.reduce((s, m2) => s + m2.goldReward, 0) + nodeLootGold('minor', roll, nodeLevel)
            } else ok = false
          } else {
            runGold += nodeLootGold('minor', roll, nodeLevel) // achado sem monstro (fonte não conta gold, ignorada — efeito pequeno)
          }
        }
        if (!ok) break
        const roll = 1 + Math.floor(Math.random() * 20) // qualidade do espólio da sala (encontro é garantido)
        const { levers, pHP, level: nodeLevel } = playerAt(race, klass, tier, true, false)
        const mon = scaleRoomMonster(pickMonster(), tier, true)
        fights++
        const f = fightSolo(levers, pHP, mon)
        runHp += f.hpLost; runMp += f.mpSpent
        if (f.result === 'win') { fightWins++; runGold += mon.goldReward + nodeLootGold('main', roll, nodeLevel) } else ok = false
      }
      if (ok) {
        const { levers, pHP, level: nodeLevel } = playerAt(race, klass, ROOMS, true, true)
        fights++
        const f = fightSolo(levers, pHP, bosses[klass])
        runHp += f.hpLost; runMp += f.mpSpent
        if (f.result === 'win') {
          fightWins++; cleared++
          runGold += bosses[klass].goldReward + nodeLootGold('boss', 20, nodeLevel)
          clearedHp.push(runHp); clearedMp.push(runMp); clearedGold.push(runGold)
        }
      }
    }
    const avgHp = clearedHp.reduce((s, x) => s + x, 0) / Math.max(1, clearedHp.length)
    const avgMp = clearedMp.reduce((s, x) => s + x, 0) / Math.max(1, clearedMp.length)
    const avgGold = clearedGold.reduce((s, x) => s + x, 0) / Math.max(1, clearedGold.length)
    const elixirs = Math.max(Math.ceil(avgHp / ELIXIR_HP), Math.ceil(avgMp / ELIXIR_MP))
    runResults.push({ race, klass, clearPct: 100 * cleared / RUNS, avgFightWin: 100 * fightWins / fights, avgHp, avgMp, avgGold, elixirs })
  }
}
const ranked = [...runResults].sort((a, b) => b.clearPct - a.clearPct)
ranked.forEach((r, i) => {
  console.log(`   ${String(i + 1).padStart(2)}. ${RACE_LABEL[r.race].padEnd(8)}${CLASS_LABEL[r.klass].padEnd(7)} run-limpa: ${r.clearPct.toFixed(1).padStart(5)}%   HP: ${r.avgHp.toFixed(0).padStart(4)}  MP: ${r.avgMp.toFixed(0).padStart(4)}  → ${r.elixirs} Elixir Supremo   |  gold ganho: ${r.avgGold.toFixed(0)}`)
})
const meanClear = ranked.reduce((s, x) => s + x.clearPct, 0) / ranked.length
const meanElixirs = ranked.reduce((s, x) => s + x.elixirs, 0) / ranked.length
const meanHp = ranked.reduce((s, x) => s + x.avgHp, 0) / ranked.length
const meanMp = ranked.reduce((s, x) => s + x.avgMp, 0) / ranked.length
const meanGold = ranked.reduce((s, x) => s + x.avgGold, 0) / ranked.length
console.log(`\n  ➤ MÉDIA de run-limpa (todas as 16 combinações): ${meanClear.toFixed(1)}%`)
console.log(`  ➤ MÉDIA de consumo numa run limpa: ${meanHp.toFixed(0)} HP perdido · ${meanMp.toFixed(0)} MP gasto → ~${meanElixirs.toFixed(1)} Elixir Supremo (60 HP + 50 MP cada)`)
console.log(`  ➤ MÉDIA de GOLD ganho numa run limpa (kills + espólio de nó): ${meanGold.toFixed(0)}`)

// ============================================================
// (C) ECONOMIA — gold ganho vs. gold "queimado" em poção pra sustentar a run.
// Elixir Supremo NÃO é comprável na loja (source: 'dungeon' no itemCatalog.ts) — só
// craft (alquimia) ou drop. Preço de MERCADO real e garantido = poções de LOJA:
// Poção de Vida (50 HP / 100 gold) + Poção de Mana (30 MP / 75 gold), separadas.
// Craft do Elixir Supremo (alchemy.ts): taxa 120 gold + 1 Lótus Negra (RARO, só de
// BOSS) + Seiva Ancestral + Cristal de Mana — mais barato, mas exige já ter caçado a
// Lótus Negra (farm prévio de boss), então não é "gold puro" no primeiro clear.
// ============================================================
console.log(`\n  ── (C) ECONOMIA DE GOLD DA RUN LIMPA ──`)
const SHOP_HP_POTION = { heal: 50, price: 100 }  // Poção de Vida
const SHOP_MP_POTION = { heal: 30, price: 75 }   // Poção de Mana
const ELIXIR_CRAFT_FEE = 120 // taxa de mão de obra (30% do goldPrice 400); ingredientes à parte
ranked.forEach((r) => {
  const hpPotions = Math.ceil(r.avgHp / SHOP_HP_POTION.heal)
  const mpPotions = Math.ceil(r.avgMp / SHOP_MP_POTION.heal)
  const shopCost = hpPotions * SHOP_HP_POTION.price + mpPotions * SHOP_MP_POTION.price
  const craftCost = r.elixirs * ELIXIR_CRAFT_FEE // só a taxa; ingredientes viriam de drop, não de gold
  console.log(`   ${RACE_LABEL[r.race].padEnd(8)}${CLASS_LABEL[r.klass].padEnd(7)} ganho: ${r.avgGold.toFixed(0).padStart(4)}  |  loja (Vida+Mana): ${shopCost.toString().padStart(5)} (líquido ${(r.avgGold - shopCost).toFixed(0)})  |  craft (só taxa): ${craftCost.toString().padStart(4)} (líquido ${(r.avgGold - craftCost).toFixed(0)})`)
})
const meanShopCost = ranked.reduce((s, r) => s + Math.ceil(r.avgHp / SHOP_HP_POTION.heal) * SHOP_HP_POTION.price + Math.ceil(r.avgMp / SHOP_MP_POTION.heal) * SHOP_MP_POTION.price, 0) / ranked.length
const meanCraftCost = meanElixirs * ELIXIR_CRAFT_FEE
console.log(`\n  ➤ MÉDIA: ganho ${meanGold.toFixed(0)} gold  vs.  custo em poção de loja ${meanShopCost.toFixed(0)} gold (líquido ${(meanGold - meanShopCost).toFixed(0)})  vs.  custo de craft (só taxa, ingrediente à parte) ${meanCraftCost.toFixed(0)} gold (líquido ${(meanGold - meanCraftCost).toFixed(0)})`)
console.log(`${'='.repeat(92)}\n`)
