#!/usr/bin/env node
// ============================================================
// DOLRATH — Simulador de LUTA DETALHADA (turno a turno)
//
// Diferente de scripts/pvp-race-class-sim.js (que só modela os
// MULTIPLICADORES de stat + ataques básicos), este motor simula uma
// luta REAL com:
//   • iniciativa rolada (quem começa);
//   • TRANSFORMAÇÃO no 1º turno (persiste a luta toda por padrão,
//     p/ que os especiais fiquem disponíveis o tempo todo);
//   • HABILIDADES ESPECIAIS de cada forma (dano + DoT + buffs +
//     debuffs + cura + controle), espelhando transformationSystem.ts;
//   • disputa de dado em CADA ataque (ataque vs esquiva/defesa);
//   • POÇOS de HP/MP ILIMITADOS — luta all-out, ninguém "fica sem".
//
// Termina sempre: dano escala com a duração (fadiga/pressão), então
// mesmo com cura ilimitada uma hora o golpe supera o poço.
//
// Uso:
//   node scripts/pvp-fight-detailed-sim.js                       # log de 1 luta + agregado
//   node scripts/pvp-fight-detailed-sim.js --a=metamorfo/monk --b=draconiano/warrior --level=50
//   node scripts/pvp-fight-detailed-sim.js --form-a=wolf --form-b=bear
//   node scripts/pvp-fight-detailed-sim.js --no-aggregate        # só o log
//   node scripts/pvp-fight-detailed-sim.js --no-log              # só o agregado
//   node scripts/pvp-fight-detailed-sim.js --fights=2000 --levels=20,50
//   node scripts/pvp-fight-detailed-sim.js --seed=42             # log reprodutível
//   TF_DURATION=4 ... # transformação dura 4 turnos (recast no cd) em vez de persistir
// ============================================================

const args = process.argv.slice(2)
const getArg = (name, def) => {
  const a = args.find((x) => x === `--${name}` || x.startsWith(`--${name}=`))
  if (!a) return def
  const v = a.includes('=') ? a.split('=').slice(1).join('=') : true
  return v
}
const FIGHTS = Number(getArg('fights', 2000))
const LEVELS = String(getArg('levels', '20,50')).split(',').map(Number)
const DO_LOG = getArg('no-log', false) ? false : true
const DO_AGG = getArg('no-aggregate', false) ? false : true
const A_SPEC = String(getArg('a', 'metamorfo/monk'))
const B_SPEC = String(getArg('b', 'draconiano/warrior'))
const LOG_LEVEL = Number(getArg('level', 50))
const FORM_A = getArg('form-a', null)
const FORM_B = getArg('form-b', null)
const SEED = getArg('seed', null)
// TF_DURATION='full' (default): transformação dura a luta toda. Número: dura N turnos
// e re-transforma quando sai do cooldown (como no jogo).
const TF_DURATION = process.env.TF_DURATION || 'full'

// ---------- RNG (seedável p/ log reprodutível) ----------
let _seed = SEED != null ? (Number(SEED) >>> 0) : (Math.random() * 2 ** 32) >>> 0
function rng() {
  _seed |= 0; _seed = (_seed + 0x6D2B79F5) | 0
  let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const die = (n) => 1 + Math.floor(rng() * n)
const chance = (pct) => rng() * 100 < pct

// ============================================================
// REGRAS DE COMBATE (espelham scripts/pvp-race-class-sim.js / produção)
// ============================================================
const MULT = { heavy: 1.8, light: 1.7, spec: 1.5 }
const DICEMULT = 2
const DICE = { light_attack: 6, heavy_attack: 10, special_attack: 20 }
const STAMINA_COST = { light_attack: 1, heavy_attack: 2, special_attack: 4, dodge: 1, defend: 3 }
const MP_COST = { special_attack: 15 }
const AGICAP = 32, AGISLOPE = 0.75
const effAgi = (a) => (a <= AGICAP ? a : AGICAP + (a - AGICAP) * AGISLOPE)
const critChance = (att) => Math.min(40, 5 + att.agility * 1.2)
function dodgeNetBonus(defAgi, attAgi, sides) {
  const cap = Math.min(3, Math.floor(sides / 5))
  return Math.max(-cap, Math.min(cap, Math.floor(((defAgi || 0) - (attAgi || 0)) / 5)))
}
const effectiveResistance = (d) => Math.max(d.resistance || 0, Math.floor((d.defense || 0) * 0.8))

// ============================================================
// CONSTRUÇÃO DE PERSONAGEM (idêntica ao pvp-race-class-sim.js)
// ============================================================
const RACES = {
  humano: { strength: 20, dexterity: 20, intelligence: 20, constitution: 20 },
  draconiano: { strength: 30, constitution: 50 },
  metamorfo: { dexterity: 50, constitution: 30 },
  elfo: { intelligence: 40, dexterity: 30, constitution: 20 },
}
const CLASSES = {
  warrior: { strength: 40, constitution: 30 },
  rogue: { dexterity: 40, intelligence: 20 },
  mage: { intelligence: 50 },
  monk: { dexterity: 40, constitution: 40 },
}
const CLASS_BUILD = {
  warrior: (p) => split(p, { str: 0.7, def: 0.3 }),
  rogue: (p) => split(p, { agi: 0.85, def: 0.15 }),
  mage: (p) => split(p, { int: 0.85, def: 0.15 }),
  monk: (p) => split(p, { agi: 0.55, def: 0.45 }),
}
function split(points, weights) {
  const out = { str: 0, agi: 0, int: 0, def: 0 }
  const keys = Object.keys(weights)
  let used = 0
  keys.forEach((k, i) => {
    const v = i === keys.length - 1 ? points - used : Math.round(points * weights[k])
    out[k] = v; used += v
  })
  return out
}
const BASEPTS = 18
function buildCharacter(race, klass, level) {
  const points = BASEPTS + Math.max(0, level - 1)
  const d = CLASS_BUILD[klass](points)
  const rb = RACES[race] || {}, cb = CLASSES[klass] || {}
  const bonus = (k) => Math.floor((rb[k] || 0) / 10) + Math.floor((cb[k] || 0) / 10)
  const str = Math.max(8, d.str + bonus('strength'))
  const agi = Math.max(8, d.agi + bonus('dexterity'))
  const int = Math.max(8, d.int + bonus('intelligence'))
  const def = d.def + bonus('constitution')
  const maxHp = 100 + level * 6 + Math.floor(str * 0.5) + def * 4
  const maxMp = 60 + int * 4 + agi
  const maxStamina = 120 + agi * 2 + def * 2
  return {
    id: `${race}/${klass}`, race, klass, level,
    strength: str, agility: agi, intelligence: int, defense: def,
    resistance: Math.floor(def * 0.8),
    maxHp, hp: maxHp, maxMp, mp: maxMp, maxStamina, stamina: maxStamina,
  }
}

// ============================================================
// TRANSFORMAÇÃO — multiplicadores (espelham transformationSystem.ts, rodada 5)
// ============================================================
const TF_CONFIG = {
  dragon: { strength: 1.20, agility: 1.22, intelligence: 1.25, defense: 1.03, hp: 1.20, mpPool: 1.26, duration: 4, cooldown: 5 },
  seventh_sense: { strength: 1.21, agility: 1.25, intelligence: 1.28, defense: 1.03, hp: 1.22, mpPool: 1.28, duration: 4, cooldown: 5 },
  celestial: { strength: 1.20, agility: 1.24, intelligence: 1.34, defense: 1.02, hp: 1.22, mpPool: 1.40, duration: 4, cooldown: 5 },
  wolf: { strength: 1.20, agility: 1.24, intelligence: 1.22, defense: 1.03, hp: 1.20, mpPool: 1.22, duration: 4, cooldown: 5 },
  bear: { strength: 1.19, agility: 1.20, intelligence: 1.20, defense: 1.05, hp: 1.23, mpPool: 1.22, duration: 4, cooldown: 5 },
  eagle: { strength: 1.20, agility: 1.28, intelligence: 1.33, defense: 1.00, hp: 1.20, mpPool: 1.32, duration: 4, cooldown: 5 },
}
const FORM_LABEL = { dragon: '🐉 Dragão', wolf: '🐺 Lobo', bear: '🐻 Urso', eagle: '🦅 Águia', seventh_sense: '✨ 7º Sentido', celestial: '🌟 Celestial' }
function pickForm(klass) {
  if (klass === 'warrior') return 'bear'
  if (klass === 'mage') return 'eagle'
  return 'wolf'
}
function getForm(race, klass, override) {
  if (override) return override
  if (race === 'draconiano') return 'dragon'
  if (race === 'humano') return 'seventh_sense'
  if (race === 'elfo') return 'celestial'
  if (race === 'metamorfo') return pickForm(klass)
  return null
}
function applyTransform(me, log) {
  const m = TF_CONFIG[me.form]
  me._base = { str: me.strength, agi: me.agility, int: me.intelligence, def: me.defense, maxHp: me.maxHp, maxMp: me.maxMp }
  me.strength = Math.floor(me._base.str * m.strength)
  me.agility = Math.floor(me._base.agi * m.agility)
  me.intelligence = Math.floor(me._base.int * m.intelligence)
  me.defense = Math.floor(me._base.def * m.defense)
  me.resistance = Math.floor(me.defense * 0.8)
  const newMaxHp = Math.floor(me._base.maxHp * m.hp)
  me.hp = Math.min(me.hp + (newMaxHp - me._base.maxHp), newMaxHp)
  me.maxHp = newMaxHp
  const nm = Math.floor(me._base.maxMp * m.mpPool)
  me.mp = Math.min(me.mp + (nm - me._base.maxMp), nm)
  me.maxMp = nm
  me.transformed = true
  if (log) log(`   ⚡ ${me.tag} assume a forma ${FORM_LABEL[me.form]}  →  STR ${me._base.str}→${me.strength}  AGI ${me._base.agi}→${me.agility}  INT ${me._base.int}→${me.intelligence}  DEF ${me._base.def}→${me.defense}  HP→${me.maxHp}  MP→${me.maxMp}`)
}

// ============================================================
// HABILIDADES ESPECIAIS — fórmulas REAIS do servidor (processSpecialAbility,
// server/socket-server.js ~L1806). ⚠️ Dano DIRETO (sem disputa de esquiva).
// Só existem p/ dragon/wolf/bear/eagle; seventh_sense (humano) e celestial
// (elfo) retornam "Habilidade não reconhecida" → NÃO têm especiais.
//
// ⚠️⚠️ ESTAS HABILIDADES SÃO CÓDIGO MORTO NO PVP AO VIVO: o cliente nunca emite
// 'use_special_ability'. Default SPECIALS=off (reflete o jogo real). SPECIALS=1
// liga p/ ver QUAL SERIA o balance se um dia forem conectadas. dmg(s,e) já rola
// o dado interno (honra "rolando dado") e pode aplicar dot/controle no inimigo.
// ============================================================
const SPECIALS_ON = process.env.SPECIALS ? true : false
const SPECIALS = {
  dragon: [
    { id: 'dragon_breath', name: '🔥 Sopro de Fogo', cost: { stamina: 15 }, cd: 2, dmg: (s) => Math.max(1, Math.floor((die(20) + s.strength * 2) * 0.5)) },
    { id: 'dragon_roar', name: '🦅 Rugido Dracônico', cost: { stamina: 10 }, cd: 4, util: (s, e) => { e.outMult = (e.outMult || 1) * 0.8; e.outMultTurns = Math.max(e.outMultTurns || 0, 2) }, desc: '-20% ataque inimigo (2t)' },
    { id: 'dragon_scales', name: '🛡️ Escamas Dracônicas', cost: { mp: 15 }, cd: 4, util: (s) => { s.dmgReduceFlat = 5; s.dmgReduceFlatTurns = 3 }, desc: '-5 dano recebido (3t)' },
  ],
  wolf: [
    { id: 'pack_hunt', name: '🏃 Caçada em Matilha (3x)', cost: { stamina: 20 }, cd: 3, dmg: (s, e) => { let t = 0; for (let i = 0; i < 3; i++) t += Math.max(1, (die(12) + s.agility) - Math.floor(e.defense * 0.5)); return t } },
    { id: 'bite_bleeding', name: '🩸 Mordida Sangrenta', cost: { stamina: 12 }, cd: 3, dmg: (s, e) => Math.max(1, (die(16) + Math.floor(s.strength * 1.5)) - Math.floor(e.defense * 0.5)), dot: () => ({ dmg: 8, turns: 3, ignoreDef: true, label: 'sangramento' }) },
    { id: 'howl', name: '🌙 Uivo Selvagem', cost: { stamina: 15 }, cd: 99, util: (s) => { s.agility += 2 }, desc: '+2 AGI permanente' },
  ],
  bear: [
    { id: 'unstoppable_charge', name: '💥 Investida Imparável', cost: { stamina: 30 }, cd: 4, dmg: (s) => die(20) + Math.floor(s.strength * 2.5) },
    { id: 'bear_hug', name: '🤗 Abraço do Urso', cost: { stamina: 25 }, cd: 4, dmg: (s, e) => { const h = die(16) + Math.floor(s.strength * 1.2); e.immobilizeTurns = 2; e.dots = e.dots || []; e.dots.push({ dmg: h, turns: 2, ignoreDef: true, label: 'esmagamento' }); return h } },
    { id: 'intimidating_roar', name: '😤 Rugido Intimidador', cost: { stamina: 15 }, cd: 5, util: (s, e) => { e.outMult = (e.outMult || 1) * 0.7; e.outMultTurns = Math.max(e.outMultTurns || 0, 4) }, desc: '-30% dano inimigo (4t)' },
  ],
  eagle: [
    { id: 'dive_attack', name: '💨 Ataque em Mergulho', cost: { stamina: 20 }, cd: 3, dmg: (s, e) => Math.max(1, Math.floor((die(20) + s.agility * 2) * 2) - Math.floor(e.defense * 0.5)) },
    { id: 'keen_sight', name: '👁️ Visão Aguçada', cost: { stamina: 10 }, cd: 3, util: (s) => { s.ignoreDodgeNext = true }, desc: 'próximo ataque ignora esquiva' },
    { id: 'aerial_superiority', name: '☁️ Superioridade Aérea', cost: { mp: 15 }, cd: 4, util: (s) => { s.guaranteedDodgeTurns = 1 }, desc: 'esquiva garantida 1t' },
  ],
}
function formSpecials(form) { return SPECIALS_ON ? (SPECIALS[form] || []) : [] }
// EV (dano médio estimado, PURO — não rola dado nem aplica efeitos) p/ a IA escolher.
const EV = {
  dragon_breath: (s) => 5 + s.strength,
  pack_hunt: (s, e) => 3 * Math.max(1, 6.5 + s.agility - Math.floor(e.defense * 0.5)),
  bite_bleeding: (s, e) => Math.max(1, 8.5 + s.strength * 1.5 - Math.floor(e.defense * 0.5)) + 24,
  unstoppable_charge: (s) => 10.5 + s.strength * 2.5,
  bear_hug: (s) => (10.5 + s.strength * 1.2) * 3,
  dive_attack: (s, e) => Math.max(1, (10.5 + s.agility * 2) * 2 - Math.floor(e.defense * 0.5)),
}
for (const f in SPECIALS) for (const sp of SPECIALS[f]) if (EV[sp.id]) sp.ev = EV[sp.id]

// ============================================================
// POÇOS (ilimitados, all-out): drenar = AÇÃO do turno
// ============================================================
const HP_WELL_PCT = 0.40   // cura 40% do HP máx
const MP_WELL_AMT = 60     // restaura 60 MP
const HP_WELL_THRESHOLD = 0.32

// ============================================================
// MOTOR DE COMBATE
// ============================================================
function affordable(c, cost) {
  return (c.mp >= (cost.mp || 0)) && (c.stamina >= (cost.stamina || 0))
}
function payCost(c, cost) {
  c.mp -= (cost.mp || 0); c.stamina -= (cost.stamina || 0)
}

// EV grosseiro de um ataque básico p/ a IA
function basicEV(c) {
  const opts = []
  if (c.mp >= MP_COST.special_attack && c.stamina >= STAMINA_COST.special_attack)
    opts.push(['special_attack', 21 + c.intelligence * MULT.spec])
  if (c.stamina >= STAMINA_COST.heavy_attack)
    opts.push(['heavy_attack', 11 + c.strength * MULT.heavy])
  if (c.stamina >= STAMINA_COST.light_attack)
    opts.push(['light_attack', 7 + effAgi(c.agility) * MULT.light + c.strength * 0.3])
  if (!opts.length) return null
  opts.sort((a, b) => b[1] - a[1])
  return { action: opts[0][0], ev: opts[0][1] }
}

// IA: escolhe AÇÃO do turno (poço, especial-util, especial-dano ou básico)
function chooseAction(att, defn) {
  // 1) sobrevivência: HP baixo → poço de HP
  if (att.hp < att.maxHp * HP_WELL_THRESHOLD) return { type: 'hp_well' }
  const sps = formSpecials(att.form)
  // 2) buffs/debuffs de abertura (uma vez, cedo) se ainda não ativos
  for (const sp of sps) {
    if (!sp.util || !offCd(att, sp) || !affordable(att, sp.cost)) continue
    if (sp.id === 'dragon_scales' && att.dmgReduceFlatTurns > 0) continue
    if ((sp.id === 'intimidating_roar' || sp.id === 'dragon_roar') && defn.outMultTurns > 0) continue
    if (sp.id === 'howl' && att.howled) continue
    if (sp.id === 'keen_sight' || sp.id === 'aerial_superiority') continue // situacionais, pula
    return { type: 'special', sp }
  }
  // 3) melhor ATAQUE: maior EV (dano médio) entre especiais de dano e básicos
  let best = null
  for (const sp of sps) {
    if (!sp.dmg || !offCd(att, sp) || !affordable(att, sp.cost)) continue
    const ev = sp.ev(att, defn)
    if (!best || ev > best.ev) best = { type: 'special', sp, ev }
  }
  const b = basicEV(att)
  if (b && (!best || b.ev > best.ev)) return { type: 'basic', action: b.action }
  if (best) return best
  // 4) sem stamina/mp p/ nada → bebe MP ou ataque barato
  if (att.mp < 20) return { type: 'mp_well' }
  return { type: 'basic', action: 'light_attack' }
}
const offCd = (c, sp) => !c.cd[sp.id] || c.cd[sp.id] <= 0

// reação do defensor a um ataque
function chooseDefense(me, attAgi, dieN, baseDamage, kind) {
  const canDodge = me.stamina >= STAMINA_COST.dodge
  const canDefend = me.stamina >= STAMINA_COST.defend
  if (!canDodge && !canDefend) return 'exhausted'
  const mitigated = mitigate(me, baseDamage, kind, 0)
  const net = dodgeNetBonus(me.agility, attAgi, dieN)
  let wins = 0
  for (let d = 1; d <= dieN; d++) wins += Math.min(dieN, Math.max(0, d + net - 1))
  const p = wins / (dieN * dieN)
  const evDodge = (1 - p) * mitigated
  const evDefend = mitigated * 0.45
  if (canDodge && (!canDefend || evDodge <= evDefend * 1.3)) return 'dodge'
  return 'defend'
}
function mitigate(defn, dmg, kind, ignoreDef) {
  let mit
  if (kind === 'magic') mit = effectiveResistance(defn)
  else if (kind === 'phys') mit = Math.floor((defn.defense || 0) * 0.7)
  else mit = defn.defense || 0
  if (ignoreDef) mit = Math.floor(mit * (1 - ignoreDef))
  return Math.max(Math.ceil(dmg * 0.15), dmg - mit)
}

// resolve um golpe (básico ou especial) já com disputa de dado
function resolveHit(att, defn, hit, log, actionCount) {
  // hit: { kind, dieN, base (sem dado), ignoreDef, ignoreRes, gCrit, label, magic }
  const roll = die(hit.dieN)
  let dmg = roll * DICEMULT + hit.base
  let isCrit = hit.gCrit || chance(critChance(att))
  if (att.guaranteedCritNext) { isCrit = true; att.guaranteedCritNext = false }
  if (isCrit) dmg = Math.floor(dmg * 1.5)
  if (hit.magic && att.doubleMagicNext) { dmg *= 2; att.doubleMagicNext = false; if (log) log(`        🔷 Torrente Arcana DOBRA o dano mágico!`) }
  if (att.outMult) dmg = Math.floor(dmg * att.outMult) // debuff de dano no atacante

  // reação do defensor
  let reaction, dodged = false
  if (defn.guaranteedDodgeTurns > 0) { reaction = 'auto-dodge'; dodged = true }
  else {
    reaction = chooseDefense(defn, att.agility, hit.dieN, dmg, hit.ignoreRes ? 'magic' : hit.kind)
    if (reaction === 'dodge') {
      defn.stamina -= STAMINA_COST.dodge
      if (att.ignoreDodgeNext) { att.ignoreDodgeNext = false; dodged = false; reaction = 'dodge(furada)' }
      else {
        const net = dodgeNetBonus(defn.agility, att.agility, hit.dieN)
        const defRoll = die(hit.dieN) + net
        dodged = defRoll > roll
      }
    } else if (reaction === 'defend') defn.stamina -= STAMINA_COST.defend
  }

  let applied = 0
  if (dodged) {
    if (log) log(`        🌀 ${defn.tag} ESQUIVA (rolagem) — 0 dano`)
    if (defn.counterNext) { defn.counterNext = false; const c = Math.floor(dmg * 0.5); att.hp -= c; if (log) log(`        ↩️  Contra-ataque precognitivo devolve ${c} a ${att.tag}`) }
    return
  }
  applied = mitigate(defn, dmg, hit.ignoreRes ? 'magic' : hit.kind, hit.ignoreDef || 0)
  if (reaction === 'defend') applied = Math.max(1, Math.floor(applied * 0.45))
  if (defn.dmgReduceFlatTurns > 0) applied = Math.max(1, applied - defn.dmgReduceFlat)
  // escalada de pressão (garante término mesmo com cura ilimitada)
  if (actionCount.n > 60) applied = Math.floor(applied * 2)
  else if (actionCount.n > 40) applied = Math.floor(applied * 1.5)
  defn.hp -= applied
  if (log) log(`        💥 ${hit.label}: rolou ${roll}/d${hit.dieN}${isCrit ? ' CRÍTICO' : ''} → ${applied} dano (${reaction})  |  ${defn.tag} HP ${Math.max(0, defn.hp)}/${defn.maxHp}`)
}

// processa início do turno do atacante (DoT, expiração de buffs, imobilização)
function startOfTurn(c, log) {
  c.stamina = Math.min(c.maxStamina, c.stamina + 3)
  c.mp = Math.min(c.maxMp, c.mp + 4)
  // DoTs
  if (c.dots && c.dots.length) {
    for (const dot of c.dots) {
      const d = dot.ignoreDef ? dot.dmg : Math.max(1, dot.dmg - Math.floor((c.defense || 0) * 0.3))
      c.hp -= d
      if (log) log(`     ☠️  ${c.tag} sofre ${d} de ${dot.label} (DoT)  |  HP ${Math.max(0, c.hp)}/${c.maxHp}`)
      dot.turns--
    }
    c.dots = c.dots.filter((x) => x.turns > 0)
  }
  // expiração de buffs/debuffs
  for (const key of ['outMultTurns', 'dmgReduceFlatTurns', 'guaranteedDodgeTurns']) {
    if (c[key] > 0) { c[key]--; if (c[key] === 0) { if (key === 'outMult'.concat('Turns')) c.outMult = 1 } }
  }
  if (c.outMultTurns <= 0) c.outMult = 1
  if (c.statBuffTurns > 0) { c.statBuffTurns--; if (c.statBuffTurns === 0) { c.strength -= 2; c.agility -= 2; c.intelligence -= 2 } }
}

function performAction(att, defn, decision, log, actionCount) {
  if (decision.type === 'hp_well') {
    const heal = Math.floor(att.maxHp * HP_WELL_PCT)
    att.hp = Math.min(att.maxHp, att.hp + heal)
    if (log) log(`     🧪 ${att.tag} bebe do POÇO DE VIDA (+${heal})  |  HP ${att.hp}/${att.maxHp}`)
    return
  }
  if (decision.type === 'mp_well') {
    att.mp = Math.min(att.maxMp, att.mp + MP_WELL_AMT)
    if (log) log(`     🔵 ${att.tag} bebe do POÇO DE MANA (+${MP_WELL_AMT})  |  MP ${att.mp}/${att.maxMp}`)
    return
  }
  if (decision.type === 'special') {
    const sp = decision.sp
    payCost(att, sp.cost); att.cd[sp.id] = sp.cd
    if (sp.id === 'howl') att.howled = true
    if (sp.util) { sp.util(att, defn); if (log) log(`     ${sp.name}: ${att.tag} — ${sp.desc}`); return }
    // dano DIRETO (server: especiais não passam pela disputa de esquiva)
    actionCount.n++
    let dmg = sp.dmg(att, defn) // rola o dado interno e aplica dot/controle (bear_hug)
    if (sp.dot) { defn.dots = defn.dots || []; defn.dots.push(sp.dot()) }
    if (defn.dmgReduceFlatTurns > 0) dmg = Math.max(1, dmg - defn.dmgReduceFlat)
    if (actionCount.n > 60) dmg = Math.floor(dmg * 2)
    else if (actionCount.n > 40) dmg = Math.floor(dmg * 1.5)
    defn.hp -= dmg
    if (log) log(`     ${sp.name}: ${dmg} de dano DIRETO  |  ${defn.tag} HP ${Math.max(0, defn.hp)}/${defn.maxHp}`)
    return
  }
  // ataque básico
  const action = decision.action
  payCost(att, { stamina: STAMINA_COST[action], mp: MP_COST[action] || 0 })
  const kind = action === 'special_attack' ? 'magic' : action === 'heavy_attack' ? 'phys' : 'norm'
  let base
  if (action === 'special_attack') base = Math.floor(att.intelligence * MULT.spec)
  else if (action === 'heavy_attack') base = Math.floor(att.strength * MULT.heavy)
  else base = Math.floor(effAgi(att.agility) * MULT.light) + Math.floor(att.strength * 0.3)
  actionCount.n++
  const labels = { light_attack: '🗡️ Ataque leve', heavy_attack: '⚔️ Ataque pesado', special_attack: '✨ Especial' }
  resolveHit(att, defn, { kind: kind === 'norm' ? 'norm' : kind, dieN: DICE[action], base, magic: action === 'special_attack', label: labels[action] }, log, actionCount)
}

function decCooldowns(c) { for (const k in c.cd) if (c.cd[k] > 0) c.cd[k]-- }

function fight(c1, c2, log) {
  const a = JSON.parse(JSON.stringify(c1)), b = JSON.parse(JSON.stringify(c2))
  a.tag = 'A'; b.tag = 'B'
  for (const c of [a, b]) { c.cd = {}; c.dots = []; c.outMult = 1; c.transformed = false; c.actedFirst = false }

  const i1 = die(20), i2 = die(20)
  let att, defn
  if (i1 > i2 || (i1 === i2 && rng() < 0.5)) { att = a; defn = b } else { att = b; defn = a }
  if (log) {
    log(`\n${'─'.repeat(78)}`)
    log(`  ⚔️  ${c1.id}  (A)   VS   ${c2.id}  (B)   — nível ${c1.level}`)
    log(`  Formas: A=${FORM_LABEL[a.form] || '—'}  B=${FORM_LABEL[b.form] || '—'}`)
    log(`  🎲 Iniciativa: A rolou ${i1}, B rolou ${i2}  →  começa ${att.tag} (${att.id})`)
    log(`${'─'.repeat(78)}`)
  }

  const actionCount = { n: 0 }
  let turns = 0
  const MAX = 400
  while (a.hp > 0 && b.hp > 0 && turns < MAX) {
    turns++
    startOfTurn(att, log)
    if (att.hp <= 0) break
    decCooldowns(att)

    // transformação no 1º turno de cada lutador (e re-transforma se TF_DURATION numérico)
    if (att.form && !att.transformed && (!att.actedFirst || (TF_DURATION !== 'full' && att.tfCd <= 0))) {
      applyTransform(att, log)
      att.tfTurns = TF_DURATION === 'full' ? Infinity : Number(TF_DURATION)
      att.actedFirst = true
      ;[att, defn] = [defn, att]
      continue
    }
    att.actedFirst = true

    // imobilizado: perde a ação
    if (att.immobilizeTurns > 0) {
      att.immobilizeTurns--
      if (log) log(`     🚫 ${att.tag} está imobilizado — perde o turno`)
      ;[att, defn] = [defn, att]
      continue
    }

    if (log) log(`\n  ▸ Turno ${turns} — ${att.tag} (${att.id})  [HP ${Math.max(0, att.hp)}/${att.maxHp}  MP ${att.mp}/${att.maxMp}  ST ${att.stamina}]`)
    const decision = chooseAction(att, defn)
    performAction(att, defn, decision, log, actionCount)

    // expira forma (modo numérico)
    if (TF_DURATION !== 'full' && att.transformed) {
      att.tfTurns--
      if (att.tfTurns <= 0) { revert(att, log); att.tfCd = TF_CONFIG[att.form].cooldown }
    }
    if (att.tfCd > 0) att.tfCd--
    ;[att, defn] = [defn, att]
  }
  const winner = a.hp > 0 && b.hp <= 0 ? c1.id : b.hp > 0 && a.hp <= 0 ? c2.id : (a.hp >= b.hp ? c1.id : c2.id)
  if (log) {
    log(`\n${'═'.repeat(78)}`)
    log(`  🏆 VENCEDOR: ${winner}   (em ${turns} turnos, ${actionCount.n} ações)`)
    log(`     A (${c1.id}): HP ${Math.max(0, a.hp)}/${a.maxHp}   |   B (${c2.id}): HP ${Math.max(0, b.hp)}/${b.maxHp}`)
    log(`${'═'.repeat(78)}\n`)
  }
  return winner
}
function revert(me, log) {
  const b = me._base
  me.strength = b.str; me.agility = b.agi; me.intelligence = b.int; me.defense = b.def
  me.resistance = Math.floor(b.def * 0.8)
  me.hp = Math.min(me.hp, b.maxHp); me.maxHp = b.maxHp
  me.mp = Math.min(me.mp, b.maxMp); me.maxMp = b.maxMp
  me.transformed = false
  if (log) log(`   🔻 ${me.tag} volta à forma normal`)
}

// ============================================================
// EXECUÇÃO
// ============================================================
function mk(spec, level, formOverride) {
  const [race, klass] = spec.split('/')
  const c = buildCharacter(race, klass, level)
  c.form = getForm(race, klass, formOverride)
  return c
}

console.log(`\n${'█'.repeat(78)}`)
console.log(`  DOLRATH — SIMULADOR DE LUTA DETALHADA (transformação + especiais + poços)`)
console.log(`  Poços HP/MP: ILIMITADOS (all-out)  |  Transformação: ${TF_DURATION === 'full' ? 'persiste a luta toda' : TF_DURATION + ' turnos (recast no cd)'}`)
console.log(`  Especiais: ${SPECIALS_ON ? 'LIGADOS (fórmulas reais do server — só dragon/wolf/bear/eagle têm)' : 'DESLIGADOS = PvP AO VIVO (código morto: cliente não emite use_special_ability)'}`)
console.log('█'.repeat(78))

if (DO_LOG) {
  const cA = mk(A_SPEC, LOG_LEVEL, FORM_A), cB = mk(B_SPEC, LOG_LEVEL, FORM_B)
  console.log(`\n📜 LOG DE UMA LUTA (seed=${_seed})\n`)
  fight(cA, cB, (s) => console.log(s))
}

if (DO_AGG) {
  const RACE_NAMES = Object.keys(RACES), CLASS_NAMES = Object.keys(CLASSES)
  const CLASS_LABEL = { warrior: 'Guer', rogue: 'Lad', mage: 'Mago', monk: 'Monge' }
  const RACE_LABEL = { humano: 'Humano', draconiano: 'Dracon', metamorfo: 'Metam', elfo: 'Elfo' }
  console.log(`\n\n${'█'.repeat(78)}`)
  console.log(`  AGREGADO 16×16 COM MOTOR COMPLETO (${FIGHTS} lutas/par)`)
  console.log('█'.repeat(78))
  for (const level of LEVELS) {
    const fighters = []
    for (const r of RACE_NAMES) for (const k of CLASS_NAMES) { const c = mk(`${r}/${k}`, level); fighters.push(c) }
    const wins = {}, games = {}
    fighters.forEach((f) => { wins[f.id] = 0; games[f.id] = 0 })
    for (let i = 0; i < fighters.length; i++) for (let j = i + 1; j < fighters.length; j++) {
      const A = fighters[i], B = fighters[j]
      let aw = 0
      for (let f = 0; f < FIGHTS; f++) if (fight(A, B, null) === A.id) aw++
      wins[A.id] += aw; games[A.id] += FIGHTS
      wins[B.id] += FIGHTS - aw; games[B.id] += FIGHTS
    }
    console.log(`\n  ── NÍVEL ${level} — AGREGADO POR RAÇA ──`)
    RACE_NAMES.map((r) => {
      const fs = fighters.filter((f) => f.race === r)
      const w = fs.reduce((s, f) => s + wins[f.id], 0), g = fs.reduce((s, f) => s + games[f.id], 0)
      return { r, wr: 100 * w / g }
    }).sort((a, b) => b.wr - a.wr).forEach((x) => console.log(`     ${RACE_LABEL[x.r].padEnd(8)} ${x.wr.toFixed(1).padStart(5)}%`))
    console.log(`\n  ── NÍVEL ${level} — AGREGADO POR CLASSE ──`)
    CLASS_NAMES.map((k) => {
      const fs = fighters.filter((f) => f.klass === k)
      const w = fs.reduce((s, f) => s + wins[f.id], 0), g = fs.reduce((s, f) => s + games[f.id], 0)
      return { k, wr: 100 * w / g }
    }).sort((a, b) => b.wr - a.wr).forEach((x) => console.log(`     ${CLASS_LABEL[x.k].padEnd(8)} ${x.wr.toFixed(1).padStart(5)}%`))
    console.log(`\n  ── NÍVEL ${level} — TOP/BOTTOM LUTADORES ──`)
    const ranked = fighters.map((f) => ({ id: f.id, wr: 100 * wins[f.id] / games[f.id] })).sort((a, b) => b.wr - a.wr)
    ranked.slice(0, 4).forEach((r, i) => console.log(`     ${String(i + 1).padStart(2)}. ${r.id.padEnd(20)} ${r.wr.toFixed(1)}%`))
    console.log(`     ...`)
    ranked.slice(-3).forEach((r, i) => console.log(`     ${String(ranked.length - 2 + i).padStart(2)}. ${r.id.padEnd(20)} ${r.wr.toFixed(1)}%`))
  }
}
console.log(`\n${'█'.repeat(78)}\n`)
