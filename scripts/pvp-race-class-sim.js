#!/usr/bin/env node
// ============================================================
// DOLRATH — Simulador de balanceamento PvP por RAÇA × CLASSE
//
// Diferente de scripts/pvp-balance-sim.js (que usa 5 arquétipos
// fixos), este monta a MATRIZ COMPLETA: 4 raças × 4 classes = 16
// lutadores, faz todos lutarem contra todos e agrega win-rate
// POR RAÇA e POR CLASSE — para ajustar bônus em src/lib/gameData.ts.
//
// As regras de combate espelham EXATAMENTE o server/socket-server.js
// ao vivo (sem modo baseline; só o ruleset de produção atual).
//
// Uso:
//   node scripts/pvp-race-class-sim.js
//   node scripts/pvp-race-class-sim.js --fights=3000 --levels=1,20,50
//   node scripts/pvp-race-class-sim.js --matrix   # imprime a grade 16×16
// ============================================================

const args = process.argv.slice(2)
const getArg = (name, def) => {
  const a = args.find((x) => x.startsWith(`--${name}`))
  if (!a) return def
  const v = a.split('=')[1]
  return v === undefined ? true : v
}
const FIGHTS = Number(getArg('fights', 2000))
const LEVELS = String(getArg('levels', '1,20,50')).split(',').map(Number)
const SHOW_MATRIX = Boolean(getArg('matrix', false))

const rnd = (n) => 1 + Math.floor(Math.random() * n)

// 🔧 Multiplicadores de dano (default = produção atual). Override via env p/ tunar:
//   HEAVY=1.9 LIGHT=1.45 node scripts/pvp-race-class-sim.js
const MULT = {
  heavy: Number(process.env.HEAVY) || 1.8, // pesado: STR×
  light: Number(process.env.LIGHT) || 1.7, // leve:   AGI×
  spec: Number(process.env.SPEC) || 1.5,   // especial: INT×
}

// ============================================================
// DADOS DO JOGO (espelham src/lib/gameData.ts, escala 0-100 → /10)
// ⚠️ `wisdom` NÃO é lido pelo servidor — bônus de sabedoria são ignorados.
// ============================================================
// Produção: wisdom (ignorada pelo servidor) foi realocada p/ constitution em
// metamorfo/elfo, igualando o "orçamento efetivo" das raças (~+8).
// Defina RACES_OLD=1 p/ comparar com o baseline pré-balanceamento.
const RACES = process.env.RACES_OLD ? {
  humano:     { strength: 20, dexterity: 20, intelligence: 20, constitution: 20 },
  draconiano: { strength: 30, constitution: 50 },
  metamorfo:  { dexterity: 50 /* + wisdom 30 IGNORADO */ },
  elfo:       { intelligence: 40, dexterity: 30 /* + wisdom 20 IGNORADO */ },
} : {
  humano:     { strength: 20, dexterity: 20, intelligence: 20, constitution: 20 }, // +8
  draconiano: { strength: 30, constitution: 50 },                                  // +8
  metamorfo:  { dexterity: 50, constitution: 30 },  // era wisdom 30 → con  (+8)
  elfo:       { intelligence: 40, dexterity: 30, constitution: 20 }, // era wis 20 → con (+9)
}
// Monge: env MONK escolhe o bônus de classe p/ comparar.
//   hybrid = PRODUÇÃO: wisdom→dex+con (dex40+con40 → +8, bruiser ágil resiliente)
//   cur    = baseline pré-fix (dex30+con20, wisdom30 desperdiçado → só +5)
//   con    = wisdom→con (dex30+con50 → +8, tank-esquiva extremo)
const MONK_BONUS = {
  cur:    { dexterity: 30, constitution: 20 },
  hybrid: { dexterity: 40, constitution: 40 },
  con:    { dexterity: 30, constitution: 50 },
}[process.env.MONK || 'hybrid']
const CLASSES = {
  warrior: { strength: 40, constitution: 30 },
  rogue:   { dexterity: 40, intelligence: 20 },
  mage:    { intelligence: 50 /* + wisdom 30 IGNORADO */ },
  monk:    MONK_BONUS,
}

// 🔧 Teto suave de AGI: retornos decrescentes no DANO leve acima de AGICAP
// (não toca crítico/esquiva). Tame o Ladino no late sem nerfar o early.
// Produção: CAP=32, SLOPE=0.75. Use AGICAP=999 p/ comparar com o baseline sem teto.
const AGICAP = Number(process.env.AGICAP) || 32
const AGISLOPE = process.env.AGISLOPE !== undefined ? Number(process.env.AGISLOPE) : 0.75
function effAgi(agi) {
  return agi <= AGICAP ? agi : AGICAP + (agi - AGICAP) * AGISLOPE
}

// ============================================================
// TRANSFORMAÇÕES (TRANSFORM=1) — espelham src/lib/transformationSystem.ts (v11).
// Todas as 4 raças transformam (humano=seventh_sense, elfo=celestial). O combate
// só lê str/agi/int/def/hp/mp; abilities/resistances NÃO são modeladas aqui.
// Forma do metamorfo: env FORM=wolf|bear|eagle|auto (default auto por classe).
//
// Princípios do balanceamento (validados no teste simétrico):
//  (1) magnitude MODESTA — transformação não deve warpar o meta;
//  (2) str sub-pesado (pesado ×1.8 já fura DEF) + int/mpPool reforçados (mago
//      sustenta a luta longa transformado);
//  (3) def≈1.0 — inflar DEF subiria a RES e mataria o mago (só RES mitiga magia);
//  (4) COMPENSAÇÃO INVERSA: draconiano (base forte) → forma mais fraca; elfo
//      (base fraca) → forma mais forte;
//  (5) metamorfo = 3 formas especializadas (sua identidade), ~iguais no total.
// ============================================================
const TF_CONFIG = {
  dragon:    { strength: 1.15, agility: 1.22, intelligence: 1.25, defense: 1.03, hp: 1.19, mpPool: 1.26, duration: 4, cooldown: 3, mp: 15 }, // draconiano
  seventh_sense: { strength: 1.17, agility: 1.23, intelligence: 1.27, defense: 1.02, hp: 1.21, mpPool: 1.28, duration: 4, cooldown: 3, mp: 12 }, // humano: 7º Sentido (universal)
  celestial: { strength: 1.16, agility: 1.24, intelligence: 1.34, defense: 1.02, hp: 1.22, mpPool: 1.40, duration: 4, cooldown: 3, mp: 12 }, // elfo: Forma Celestial (base fraca → forma forte arcana)
  wolf:      { strength: 1.15, agility: 1.32, intelligence: 1.22, defense: 1.03, hp: 1.17, mpPool: 1.22, duration: 4, cooldown: 3, mp: 10 }, // metamorfo: striker
  bear:      { strength: 1.20, agility: 1.14, intelligence: 1.20, defense: 1.07, hp: 1.28, mpPool: 1.22, duration: 4, cooldown: 3, mp: 10 }, // metamorfo: tank
  eagle:     { strength: 1.12, agility: 1.28, intelligence: 1.33, defense: 1.00, hp: 1.16, mpPool: 1.32, duration: 4, cooldown: 3, mp: 10 }, // metamorfo: caster
}
const TRANSFORM = Boolean(process.env.TRANSFORM)
const FORM = process.env.FORM || 'auto'
// TFSCALE comprime os multiplicadores em direção a 1.0 p/ achar a magnitude sã:
// mult_efetivo = 1 + (mult-1)*TFSCALE. 1.0=atual, 0.5=metade do bônus.
const TFSCALE = process.env.TFSCALE !== undefined ? Number(process.env.TFSCALE) : 1
const sc = (x) => 1 + (x - 1) * TFSCALE
function pickForm(klass) {
  if (FORM !== 'auto') return FORM
  if (klass === 'warrior') return 'bear'   // pesado→STR/DEF
  if (klass === 'mage') return 'eagle'     // especial→INT (+agi)
  return 'wolf'                            // leve→AGI, durável
}
function getTF(race, klass) {
  if (!TRANSFORM) return null
  if (race === 'draconiano') return TF_CONFIG.dragon
  if (race === 'humano') return TF_CONFIG.seventh_sense
  if (race === 'elfo') return TF_CONFIG.celestial
  if (race === 'metamorfo') return TF_CONFIG[pickForm(klass)]
  return null
}
function applyTransform(me) {
  if (!me._base) me._base = { str: me.strength, agi: me.agility, int: me.intelligence, def: me.defense, maxHp: me.maxHp, maxMp: me.maxMp }
  const b = me._base, m = me.tf
  me.strength = Math.floor(b.str * sc(m.strength))
  me.agility = Math.floor(b.agi * sc(m.agility))
  me.intelligence = Math.floor(b.int * sc(m.intelligence))
  me.defense = Math.floor(b.def * sc(m.defense))
  me.resistance = Math.floor(me.defense * 0.8)
  const newMaxHp = Math.floor(b.maxHp * sc(m.hp))
  me.hp = Math.min(me.hp + (newMaxHp - b.maxHp), newMaxHp)
  me.maxHp = newMaxHp
  if (m.mpPool) { // reserva de mana ampliada (caster sustenta a luta longa)
    const nm = Math.floor(b.maxMp * sc(m.mpPool))
    me.mp = Math.min(me.mp + (nm - b.maxMp), nm)
    me.maxMp = nm
  }
  me.transformed = true
}
function revertTransform(me) {
  const b = me._base
  me.strength = b.str; me.agility = b.agi; me.intelligence = b.int; me.defense = b.def
  me.resistance = Math.floor(b.def * 0.8)
  me.hp = Math.min(me.hp, b.maxHp); me.maxHp = b.maxHp
  me.mp = Math.min(me.mp, b.maxMp); me.maxMp = b.maxMp
  me.transformed = false
}

// Como cada CLASSE gasta os pontos distribuídos (10 + nível-1).
// Reflete a identidade de golpe: warrior→pesado(STR), rogue/monk→leve(AGI),
// mage→especial(INT). DEF dá sobrevida ao bruiser/tank.
const CLASS_BUILD = {
  warrior: (p) => split(p, { str: 0.7, def: 0.3 }),
  rogue:   (p) => split(p, { agi: 0.85, def: 0.15 }),
  mage:    (p) => split(p, { int: 0.85, def: 0.15 }),
  monk:    (p) => split(p, { agi: 0.55, def: 0.45 }),
}
function split(points, weights) {
  const out = { str: 0, agi: 0, int: 0, def: 0 }
  const keys = Object.keys(weights)
  let used = 0
  keys.forEach((k, i) => {
    const v = i === keys.length - 1 ? points - used : Math.round(points * weights[k])
    out[k] = v
    used += v
  })
  return out
}

function buildCharacter(race, klass, level) {
  const points = 10 + Math.max(0, level - 1)
  const d = CLASS_BUILD[klass](points)

  const rb = RACES[race] || {}
  const cb = CLASSES[klass] || {}
  const bonus = (k) => Math.floor((rb[k] || 0) / 10) + Math.floor((cb[k] || 0) / 10)

  const str = d.str + bonus('strength')
  const agi = d.agi + bonus('dexterity')
  const int = d.int + bonus('intelligence')
  const def = d.def + bonus('constitution')

  // Derivados — idênticos ao combate ao vivo (computeDerivedStats / combat page)
  const maxHp = 100 + level * 6 + Math.floor(str * 0.5) + def * 4
  const maxMp = process.env.BIGMP ? 99999 : 60 + int * 4 + agi // BIGMP: diagnóstico de mana
  const maxStamina = 120 + agi * 2 + def * 2
  const resistance = Math.floor(def * 0.8)

  return {
    race, klass, level,
    str, agi, int, def,
    // o servidor usa estes nomes; attack/defense = str/def crus
    strength: str, agility: agi, intelligence: int, defense: def,
    resistance,
    maxHp, hp: maxHp,
    maxMp, mp: maxMp,
    maxStamina, stamina: maxStamina,
  }
}

// ============================================================
// COMBATE — espelho do server/socket-server.js (ruleset de produção)
// ============================================================
const STAMINA_COST = { light_attack: 1, heavy_attack: 2, special_attack: 4, dodge: 1, defend: 3 }
const DICE = { light_attack: 6, heavy_attack: 10, special_attack: 20 }
const MP_COST = { light_attack: 0, heavy_attack: 0, special_attack: 15 }

function calculateDamage(att, roll, action, isCrit) {
  let base
  if (action === 'special_attack') base = roll * 2 + Math.floor(att.intelligence * MULT.spec)
  else if (action === 'light_attack') base = roll * 2 + Math.floor(effAgi(att.agility) * MULT.light) + Math.floor(att.strength * 0.3)
  else base = roll * 2 + Math.floor(att.strength * MULT.heavy)
  if (isCrit) base = Math.floor(base * 1.5)
  return Math.max(1, base)
}
function criticalChance(att) { return Math.min(40, 5 + att.agility * 1.2) }
function dodgeNetBonus(defAgi, attAgi, sides) {
  const cap = Math.min(3, Math.floor(sides / 5))
  return Math.max(-cap, Math.min(cap, Math.floor(((defAgi || 0) - (attAgi || 0)) / 5)))
}
function effectiveResistance(def) {
  return Math.max(Number(def.resistance) || 0, Math.floor((Number(def.defense) || 0) * 0.8))
}
function calculateDefense(def, damage, action) {
  let mitigation
  if (action === 'special_attack') mitigation = effectiveResistance(def)
  else if (action === 'heavy_attack') mitigation = Math.floor((def.defense || 0) * 0.7)
  else mitigation = def.defense || 0
  return Math.max(Math.ceil(damage * 0.15), damage - mitigation)
}
// P(defRoll + net > attRoll) com dados iguais de n lados (empate favorece o atacante)
function probDodge(n, net) {
  let wins = 0
  for (let d = 1; d <= n; d++) wins += Math.min(n, Math.max(0, d + net - 1))
  return wins / (n * n)
}

// ============================================================
// POLÍTICA DA IA (racional: maior dano esperado / menor dano recebido)
// ============================================================
function chooseAttack(me) {
  const opts = []
  if (me.mp >= MP_COST.special_attack && me.stamina >= STAMINA_COST.special_attack)
    opts.push(['special_attack', 21 + me.intelligence * MULT.spec])
  if (me.stamina >= STAMINA_COST.heavy_attack)
    opts.push(['heavy_attack', 11 + me.strength * MULT.heavy])
  if (me.stamina >= STAMINA_COST.light_attack)
    opts.push(['light_attack', 7 + effAgi(me.agility) * MULT.light + me.strength * 0.3])
  if (!opts.length) return null
  opts.sort((a, b) => b[1] - a[1])
  return opts[0][0]
}
function chooseDefense(me, att, action, baseDamage) {
  const canDodge = me.stamina >= STAMINA_COST.dodge
  const canDefend = me.stamina >= STAMINA_COST.defend
  if (!canDodge && !canDefend) return 'exhausted'
  const mitigated = calculateDefense(me, baseDamage, action)
  const p = probDodge(DICE[action], dodgeNetBonus(me.agility, att.agility, DICE[action]))
  const evDodge = (1 - p) * mitigated
  const evDefend = mitigated * 0.45
  if (canDodge && (!canDefend || evDodge <= evDefend * 1.3)) return 'dodge'
  return 'defend'
}

function fight(c1, c2) {
  const a = { ...c1 }, b = { ...c2 }
  let att, defn
  const i1 = rnd(20), i2 = rnd(20)
  if (i1 > i2 || (i1 === i2 && Math.random() < 0.5)) { att = a; defn = b } else { att = b; defn = a }

  let actionCount = 0
  const MAX = 200
  let turns = 0
  while (a.hp > 0 && b.hp > 0 && turns < MAX) {
    turns++
    att.stamina = Math.min(att.maxStamina, att.stamina + 2) // regen no início do turno

    // 🐉 Transformação: gasta o turno inteiro; aplicada cedo p/ maximizar uptime.
    if (att.tfCd > 0) att.tfCd--
    if (att.tf && !att.transformed && att.tfCd <= 0 && att.mp >= att.tf.mp && att.stamina >= 3) {
      applyTransform(att)
      att.mp -= att.tf.mp
      att.stamina -= 3
      att.tfTurns = att.tf.duration
      ;[att, defn] = [defn, att]
      continue
    }

    const action = chooseAttack(att)
    if (!action) {
      if (att.transformed && --att.tfTurns <= 0) { revertTransform(att); att.tfCd = att.tf.cooldown }
      ;[att, defn] = [defn, att]
      continue
    }
    att.stamina -= STAMINA_COST[action]
    att.mp -= MP_COST[action]

    const roll = rnd(DICE[action])
    const isCrit = Math.random() * 100 < criticalChance(att)
    const baseDamage = calculateDamage(att, roll, action, isCrit)
    const reaction = chooseDefense(defn, att, action, baseDamage)

    let damage = 0
    if (reaction === 'dodge') {
      defn.stamina -= STAMINA_COST.dodge
      const defRoll = rnd(DICE[action]) + dodgeNetBonus(defn.agility, att.agility, DICE[action])
      damage = defRoll > roll ? 0 : calculateDefense(defn, baseDamage, action)
    } else if (reaction === 'defend') {
      defn.stamina -= STAMINA_COST.defend
      damage = Math.max(1, Math.floor(calculateDefense(defn, baseDamage, action) * 0.45))
    } else {
      damage = calculateDefense(defn, baseDamage, action) // exausto
    }

    actionCount++
    if (damage > 0) {
      if (actionCount > 60) damage = Math.floor(damage * 2)
      else if (actionCount > 40) damage = Math.floor(damage * 1.5)
      defn.hp -= damage
    }
    // 🐉 fim do turno: consome 1 turno de transformação; reverte ao acabar
    if (att.transformed && --att.tfTurns <= 0) { revertTransform(att); att.tfCd = att.tf.cooldown }
    ;[att, defn] = [defn, att]
  }
  if (turns >= MAX) return null // empate por timeout
  return a.hp > 0 ? c1.id : c2.id
}

// ============================================================
// BATERIA — matriz 4×4
// ============================================================
const RACE_NAMES = Object.keys(RACES)
const CLASS_NAMES = Object.keys(CLASSES)
const CLASS_LABEL = { warrior: 'Guer', rogue: 'Lad', mage: 'Mago', monk: 'Monge' }
const RACE_LABEL = { humano: 'Humano', draconiano: 'Dracon', metamorfo: 'Metam', elfo: 'Elfo' }

function pct(x, n) { return n ? ((100 * x) / n).toFixed(1) : '  —' }

console.log(`\n${'='.repeat(80)}`)
console.log(`  DOLRATH PvP — BALANCEAMENTO RAÇA × CLASSE  |  ${FIGHTS} lutas/par  |  regras de produção`)
console.log('='.repeat(80))
console.log('  Builds por classe: Guer=70%STR/30%DEF  Lad=85%AGI/15%DEF  Mago=85%INT/15%DEF  Monge=55%AGI/45%DEF')
if (TRANSFORM) console.log(`  🐉 TRANSFORM ON — draconiano=dragon, metamorfo=${FORM} (humano/elfo NÃO transformam)`)

for (const level of LEVELS) {
  const fighters = []
  for (const r of RACE_NAMES)
    for (const k of CLASS_NAMES)
      fighters.push({ id: `${r}/${k}`, race: r, klass: k, ...buildCharacter(r, k, level), tf: getTF(r, k), tfTurns: 0, tfCd: 0, transformed: false })

  console.log(`\n\n${'█'.repeat(80)}`)
  console.log(`  NÍVEL ${level}`)
  console.log('█'.repeat(80))

  // win[id] = vitórias totais; games[id] = lutas totais
  const wins = {}, games = {}
  fighters.forEach((f) => { wins[f.id] = 0; games[f.id] = 0 })
  const cell = {} // cell[`${a}|${b}`] = win% de a vs b

  for (let i = 0; i < fighters.length; i++) {
    for (let j = i + 1; j < fighters.length; j++) {
      const A = fighters[i], B = fighters[j]
      let aw = 0, draws = 0
      for (let f = 0; f < FIGHTS; f++) {
        const w = fight(A, B)
        if (w === A.id) aw++
        else if (w === null) draws++
      }
      const decided = FIGHTS - draws
      wins[A.id] += aw; games[A.id] += decided
      wins[B.id] += decided - aw; games[B.id] += decided
      cell[`${A.id}|${B.id}`] = decided ? (100 * aw) / decided : 50
      cell[`${B.id}|${A.id}`] = decided ? (100 * (decided - aw)) / decided : 50
    }
  }

  // ---- Win-rate geral por lutador (raça×classe) ----
  console.log(`\n  ── WIN% GERAL POR LUTADOR (média contra os outros 15) ──`)
  const ranked = fighters
    .map((f) => ({ id: f.id, wr: 100 * wins[f.id] / Math.max(1, games[f.id]) }))
    .sort((a, b) => b.wr - a.wr)
  ranked.forEach((r, i) => {
    const bar = '▇'.repeat(Math.round(r.wr / 3))
    console.log(`   ${String(i + 1).padStart(2)}. ${r.id.padEnd(20)} ${r.wr.toFixed(1).padStart(5)}%  ${bar}`)
  })

  // ---- Agregado por RAÇA ----
  console.log(`\n  ── AGREGADO POR RAÇA (média das 4 classes) ──`)
  RACE_NAMES
    .map((r) => {
      const fs = fighters.filter((f) => f.race === r)
      const w = fs.reduce((s, f) => s + wins[f.id], 0)
      const g = fs.reduce((s, f) => s + games[f.id], 0)
      return { r, wr: 100 * w / Math.max(1, g) }
    })
    .sort((a, b) => b.wr - a.wr)
    .forEach((x) => console.log(`   ${RACE_LABEL[x.r].padEnd(10)} ${x.wr.toFixed(1).padStart(5)}%`))

  // ---- Agregado por CLASSE ----
  console.log(`\n  ── AGREGADO POR CLASSE (média das 4 raças) ──`)
  CLASS_NAMES
    .map((k) => {
      const fs = fighters.filter((f) => f.klass === k)
      const w = fs.reduce((s, f) => s + wins[f.id], 0)
      const g = fs.reduce((s, f) => s + games[f.id], 0)
      return { k, wr: 100 * w / Math.max(1, g) }
    })
    .sort((a, b) => b.wr - a.wr)
    .forEach((x) => console.log(`   ${CLASS_LABEL[x.k].padEnd(10)} ${x.wr.toFixed(1).padStart(5)}%`))

  // ---- Stats dos lutadores ----
  console.log(`\n  ── FICHA DOS LUTADORES ──`)
  fighters.forEach((f) => {
    console.log(`   ${f.id.padEnd(20)} STR:${String(f.str).padStart(3)} AGI:${String(f.agi).padStart(3)} INT:${String(f.int).padStart(3)} DEF:${String(f.def).padStart(3)} | HP:${String(f.maxHp).padStart(4)} MP:${String(f.maxMp).padStart(3)} RES:${f.resistance}`)
  })

  // ---- Matriz completa 16×16 (opcional) ----
  if (SHOW_MATRIX) {
    console.log(`\n  ── MATRIZ COMPLETA win% (linha vs coluna) ──`)
    const hdr = fighters.map((f) => f.id.split('/').map((s) => s.slice(0, 3)).join('/').padStart(8)).join('')
    console.log(`   ${''.padEnd(20)}${hdr}`)
    fighters.forEach((A) => {
      const row = fighters.map((B) => A.id === B.id ? '   —  '.padStart(8) : `${cell[`${A.id}|${B.id}`].toFixed(0).padStart(7)}%`).join('')
      console.log(`   ${A.id.padEnd(20)}${row}`)
    })
  }
}

console.log(`\n${'='.repeat(80)}\n`)
