#!/usr/bin/env node
// ============================================================
// DOLRATH — Simulador de balanceamento PvE por RAÇA × CLASSE (Floresta, nv10, gear PRI)
//
// Irmão do scripts/pvp-race-class-sim.js, mas contra o BOSS real da masmorra em vez de
// jogador×jogador. Monta os 16 lutadores (4 raças × 4 classes), no clearLevel da Floresta
// (nv10) com o gear-ALVO da masmorra (incomum PRI, enh=16 — TODAS as 9 peças), e cada um
// enfrenta o boss REAL da Floresta (Anciã da Mata), construído com os MESMOS valores de
// produção:
//   • anchor/BOSS_POW_MULT/BOSS_ARM_MULT/MON_ARMOR — src/lib/dungeonAdventures.ts
//   • BOSS_HP_MULT.floresta — tabela hardcoded em produção (por CLASSE, não por raça)
//   • combate (resolveHit/resolveMonsterHit, dado-como-plus) — server/combatModel.js
//
// Diferente de scripts/dungeon-difficulty-sim.js (que resolve/recalibra o hpMult por
// classe com UMA raça fixa), este roda a MATRIZ COMPLETA com o hpMult JÁ EM PRODUÇÃO
// (sem resolver de novo) — o objetivo é auditar se o balanceamento atual entrega win%
// uniforme entre raças (o boss não varia por raça; só a classe muda o HP-alvo).
//
// Uso:
//   node scripts/pve-race-class-sim.js
//   node scripts/pve-race-class-sim.js --fights=5000
// ============================================================

const CM = require('../server/combatModel')

const args = process.argv.slice(2)
const getArg = (name, def) => {
  const a = args.find((x) => x.startsWith(`--${name}`))
  if (!a) return def
  const v = a.split('=')[1]
  return v === undefined ? true : v
}
const FIGHTS = Number(getArg('fights', 4000))
const TARGET_WIN = Number(process.env.TARGET_WIN) || 0.75 // alvo pedido: ~75% em TODAS as combinações

// ============================================================
// PERSONAGEM (jogador) — espelha src/lib/gameData.ts (escala 0-100 → /10), igual ao
// dungeon-difficulty-sim.js e pvp-race-class-sim.js.
// ============================================================
// DRACOSTR/DRACODEF: knobs de experimento (default = produção pós-rebalanceamento,
// gameData.ts: draconiano constitution 50→30 — caía inteiro em STR/DEF, os ÚNICOS
// atributos que alimentam a fórmula de HP `80+str*2+def*4`, sobrando HP no PvE sem
// mais poder real).
const DRACOSTR = process.env.DRACOSTR !== undefined ? Number(process.env.DRACOSTR) : 3
const DRACODEF = process.env.DRACODEF !== undefined ? Number(process.env.DRACODEF) : 3
const RACES = { humano: { str: 2, agi: 2, int: 2, def: 2 }, draconiano: { str: DRACOSTR, agi: 0, int: 0, def: DRACODEF }, metamorfo: { str: 0, agi: 5, int: 0, def: 3 }, elfo: { str: 0, agi: 3, int: 4, def: 2 } }
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

// Gear do JOGADOR: raridade × aprimoramento → gearTier + HP das peças (== dungeon-sim).
const SET_HP = [8, 18, 8, 0, 8, 0]
const ENH_MULT = (enh) => (enh <= 0 ? 1 : enh <= 15 ? 1 + enh * 0.08 : 2.5)
function gearFor(rarity, enh) {
  const pieces = Array.from({ length: CM.NOMINAL_SLOTS }, () => ({ rarity, enhancementLevel: enh }))
  const gearTier = CM.deriveGearTier(pieces)
  const gearHp = Math.floor(SET_HP.reduce((s, h) => s + h, 0) * ENH_MULT(enh))
  return { gearTier, gearHp }
}
const PRI = 16
const PLAYER_GEAR = { rarity: 'UNCOMMON', enh: PRI } // gear-ALVO da Floresta ("tudo PRI")

// ============================================================
// BOSS (Anciã da Mata, Floresta, clearLevel 10) — PORT 1:1 de scaleMonster() em
// src/lib/dungeonAdventures.ts. A âncora usa a build de REFERÊNCIA (raça NEUTRA,
// == humano) — o boss NÃO varia por raça do jogador, só por CLASSE (hpMult).
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

const BOSS_POW_MULT = 0.9, BOSS_ARM_MULT = 0.8, MON_ARMOR = 96
// Tabela hardcoded EM PRODUÇÃO (src/lib/dungeonAdventures.ts BOSS_HP_MULT.floresta) —
// NÃO resolvida de novo aqui: o objetivo é auditar o balanceamento que já está no ar.
const HPSCALE = process.env.HPSCALE !== undefined ? Number(process.env.HPSCALE) : 1 // knob p/ tunar o HP do boss
// Valores JÁ em produção (dungeonAdventures.ts BOSS_HP_MULT.floresta, pós-retune p/ ~75%).
const BOSS_HP_MULT_FLORESTA_BASE = { warrior: 2.76, rogue: 2.74, mage: 2.62, monk: 2.90 }
const BOSS_HP_MULT_FLORESTA = Object.fromEntries(Object.entries(BOSS_HP_MULT_FLORESTA_BASE).map(([k, v]) => [k, v * HPSCALE]))
const BOSS_EVADE = 0.08 // Anciã da Mata: baseEvade real (dungeonAdventures.ts)
const CLEAR_LEVEL = 10
const BOSS_LEVEL = CLEAR_LEVEL + 2 // = 12, como em produção (monLevel do boss)

function buildBoss(klass) {
  const targetTier = CM.deriveGearTier(Array.from({ length: CM.NOMINAL_SLOTS }, () => ({ rarity: PLAYER_GEAR.rarity, enhancementLevel: PLAYER_GEAR.enh })))
  const targetHp = refGearHp(PLAYER_GEAR.enh)
  const anchor = anchorAt(CLEAR_LEVEL, targetTier, targetHp)
  const S = CM.powerScale(CLEAR_LEVEL, targetTier)
  const hpMult = BOSS_HP_MULT_FLORESTA[klass]
  return {
    power: Math.max(1, Math.floor(anchor.power * BOSS_POW_MULT)),
    armor: Math.max(0, Math.floor(MON_ARMOR * S * BOSS_ARM_MULT)),
    hp: Math.max(1, Math.floor(anchor.hp * hpMult)),
    evade: BOSS_EVADE,
    K: CM.K50 * (BOSS_LEVEL / CM.MAX_LEVEL_REF + 0.5),
    scale: S,
  }
}

// ============================================================
// COMBATE — dado-como-plus (== dungeon-difficulty-sim.js / DungeonRun.tsx)
// ============================================================
const DIE = CM.PVE_DIE // {basic:6, weapon:8, special:20}
const TR_ON = 4, TR_OFF = 6 // duty-cycle da transformação (~40% uptime)

function fight(base, pHP, boss) {
  const tr = { power: base.power * CM.TRANSFORM_SCALE, armor: base.armor * CM.TRANSFORM_SCALE, hp: base.hp, evade: base.evade, K: base.K * CM.TRANSFORM_SCALE, scale: base.scale * CM.TRANSFORM_SCALE }
  let php = pHP, mhp = boss.hp
  let playerTurn = Math.random() < 0.5
  let phase = 0
  const isTransformed = () => phase < TR_ON
  for (let t = 0; t < 600 && php > 0 && mhp > 0; t++) {
    if (playerTurn) {
      const pl = isTransformed() ? tr : base
      const kind = isTransformed() ? 'special' : 'weapon'
      mhp -= CM.resolveHit({ power: pl.power * CM.ATTACKS[kind].powerMult }, boss, { defense: 'dodge', sides: DIE[kind] }).damage
      phase = (phase + 1) % (TR_ON + TR_OFF)
    } else {
      const x = Math.random()
      const kind = x < 0.35 ? 'basic' : x < 0.7 ? 'weapon' : 'special'
      const pl = isTransformed() ? tr : base
      php -= CM.resolveMonsterHit({ power: boss.power * CM.ATTACKS[kind].powerMult, sides: DIE[kind], defender: { armor: pl.armor, K: pl.K, evade: pl.evade } }).damage
    }
    playerTurn = !playerTurn
  }
  return mhp <= 0 && php > 0 ? 'win' : php <= 0 && mhp > 0 ? 'loss' : 'timeout'
}

function winRate(race, klass, boss, n = FIGHTS) {
  const char = buildChar(race, klass, CLEAR_LEVEL)
  const { gearTier, gearHp } = gearFor(PLAYER_GEAR.rarity, PLAYER_GEAR.enh)
  const levers = CM.computeLevers(klass, CLEAR_LEVEL, gearTier, { str: char.str, agi: char.agi, int: char.int, def: char.def })
  const pHP = char.gameMaxHp + gearHp
  let win = 0, loss = 0, timeout = 0
  for (let i = 0; i < n; i++) {
    const r = fight(levers, pHP, boss)
    if (r === 'win') win++; else if (r === 'loss') loss++; else timeout++
  }
  return { wr: win / n, char, levers, pHP }
}

// ============================================================
// BATERIA — matriz 4×4 vs. boss real da Floresta
// ============================================================
const RACE_NAMES = Object.keys(RACES)
const CLASS_NAMES = Object.keys(CLASSES)
const CLASS_LABEL = { warrior: 'Guer', rogue: 'Lad', mage: 'Mago', monk: 'Monge' }
const RACE_LABEL = { humano: 'Humano', draconiano: 'Dracon', metamorfo: 'Metam', elfo: 'Elfo' }

console.log(`\n${'='.repeat(88)}`)
console.log(`  DOLRATH PvE — FLORESTA (Anciã da Mata) — RAÇA × CLASSE  |  nv${CLEAR_LEVEL}  |  gear incomum PRI (todas as 9 peças)  |  ${FIGHTS} lutas/combo`)
console.log(`  boss: hpMult de PRODUÇÃO (dungeonAdventures.ts, não resolvido de novo)  |  alvo pedido: ~${(TARGET_WIN * 100) | 0}% em TODAS as combinações`)
console.log('='.repeat(88))

const bosses = {}
for (const k of CLASS_NAMES) bosses[k] = buildBoss(k)

console.log(`\n  ── FICHA DO BOSS por classe (mesmo poder/armadura; só HP muda) ──`)
for (const k of CLASS_NAMES) {
  const b = bosses[k]
  console.log(`   vs ${CLASS_LABEL[k].padEnd(6)} power:${b.power.toFixed(0).padStart(4)} armor:${b.armor.toFixed(0).padStart(4)} hp:${String(b.hp).padStart(5)} evade:${b.evade} K:${b.K.toFixed(0)}`)
}

const results = []
for (const r of RACE_NAMES) {
  for (const k of CLASS_NAMES) {
    const { wr, char, levers, pHP } = winRate(r, k, bosses[k])
    results.push({ race: r, klass: k, wr: wr * 100, char, levers, pHP })
  }
}

console.log(`\n  ── WIN% POR COMBINAÇÃO (raça × classe vs. boss real) ──`)
const ranked = [...results].sort((a, b) => b.wr - a.wr)
ranked.forEach((r, i) => {
  const bar = '▇'.repeat(Math.round(r.wr / 3))
  const flag = Math.abs(r.wr - TARGET_WIN * 100) > 10 ? '  ⚠️' : ''
  console.log(`   ${String(i + 1).padStart(2)}. ${RACE_LABEL[r.race].padEnd(8)}${CLASS_LABEL[r.klass].padEnd(7)} ${r.wr.toFixed(1).padStart(5)}%  ${bar}${flag}`)
})

console.log(`\n  ── AGREGADO POR RAÇA (média das 4 classes) ──`)
RACE_NAMES.map((r) => ({ r, wr: results.filter((x) => x.race === r).reduce((s, x) => s + x.wr, 0) / CLASS_NAMES.length }))
  .sort((a, b) => b.wr - a.wr)
  .forEach((x) => console.log(`   ${RACE_LABEL[x.r].padEnd(10)} ${x.wr.toFixed(1).padStart(5)}%`))

console.log(`\n  ── AGREGADO POR CLASSE (média das 4 raças) ──`)
CLASS_NAMES.map((k) => ({ k, wr: results.filter((x) => x.klass === k).reduce((s, x) => s + x.wr, 0) / RACE_NAMES.length }))
  .sort((a, b) => b.wr - a.wr)
  .forEach((x) => console.log(`   ${CLASS_LABEL[x.k].padEnd(10)} ${x.wr.toFixed(1).padStart(5)}%`))

console.log(`\n  ── FICHA DOS LUTADORES (nv${CLEAR_LEVEL}, gear PRI) ──`)
results.forEach((r) => {
  const c = r.char, lv = r.levers
  console.log(`   ${RACE_LABEL[r.race].padEnd(8)}${CLASS_LABEL[r.klass].padEnd(7)} STR:${String(c.str).padStart(2)} AGI:${String(c.agi).padStart(2)} INT:${String(c.int).padStart(2)} DEF:${String(c.def).padStart(2)} | power:${lv.power.toFixed(0).padStart(4)} armor:${lv.armor.toFixed(0).padStart(4)} HP:${String(r.pHP).padStart(4)} evade:${lv.evade.toFixed(2)}`)
})

const spread = ranked[0].wr - ranked[ranked.length - 1].wr
const meanWr = ranked.reduce((s, x) => s + x.wr, 0) / ranked.length
console.log(`\n  ➤ MÉDIA GERAL: ${meanWr.toFixed(1)}%  |  SPREAD (melhor − pior): ${spread.toFixed(1)} pts   ${spread <= 16 ? '✅ aceitável' : '⚠️ desequilibrado'}`)
console.log(`${'='.repeat(88)}\n`)
