#!/usr/bin/env node
// ============================================================
// DOLRATH — Simulador PvP no MODELO DE LEVERS (combatModel.ts)
//
// ⚠️ Os sims antigos (pvp-race-class-sim.js / pvp-fight-detailed-sim.js)
// modelam o engine de STAT cru — que o PvP ao vivo NÃO usa mais. O combate
// real (server/socket-server.js → CM.resolveHit) é:
//     dano = power × sorte(d12) × (1 − DR),  DR = armor/(armor+K)
// com power/armor/hp/evade vindos do PROFILE da CLASSE × nível × gear, e a
// transformação = ×1.25 uniforme (transformLevers). Raça/forma/stats NÃO
// entram no dano → a ÚNICA forma de dar identidade às formas no PvP são os
// ESPECIAIS. Este sim os modela em termos de levers + uma camada de STATUS
// (DoT/debuff/buff/imobilizar) — que hoje NÃO existe no servidor.
//
// Matriz relevante: CLASSE × FORMA. (Raça é só o "dono" da forma: dragon=
// draconiano, seventh_sense=humano, celestial=elfo, wolf/bear/eagle=metamorfo.)
//
// Uso:
//   node scripts/pvp-lever-sim.js                      # agregado classe×forma
//   node scripts/pvp-lever-sim.js --log --a=mage/celestial --b=warrior/bear
//   node scripts/pvp-lever-sim.js --fights=4000 --levels=50
//   SPECIALS=0 node scripts/pvp-lever-sim.js           # sem especiais (baseline =1.25 plano)
//   WELLS=1 node scripts/pvp-lever-sim.js              # poços HP/MP ilimitados (all-out)
// ============================================================

const args = process.argv.slice(2)
const getArg = (n, d) => { const a = args.find((x) => x === `--${n}` || x.startsWith(`--${n}=`)); if (!a) return d; return a.includes('=') ? a.split('=').slice(1).join('=') : true }
const FIGHTS = Number(getArg('fights', 3000))
const LEVELS = String(getArg('levels', '50')).split(',').map(Number)
const DO_LOG = Boolean(getArg('log', false))
const A_SPEC = String(getArg('a', 'mage/celestial'))
const B_SPEC = String(getArg('b', 'warrior/bear'))
const LOG_LEVEL = Number(getArg('level', 50))
const SEED = getArg('seed', null)
const SPECIALS_ON = process.env.SPECIALS === '0' ? false : true
const WELLS = Boolean(process.env.WELLS)
const GEAR_TIER = process.env.GEAR !== undefined ? Number(process.env.GEAR) : 0.5 // tier médio dos dois

// RNG seedável
let _s = SEED != null ? (Number(SEED) >>> 0) : (Math.random() * 2 ** 32) >>> 0
function rng() { _s |= 0; _s = (_s + 0x6D2B79F5) | 0; let t = Math.imul(_s ^ (_s >>> 15), 1 | _s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
const dInt = (n) => 1 + Math.floor(rng() * n)

// ============================================================
// MODELO DE COMBATE — espelha src/lib/combatModel.ts
// ============================================================
const DICE_SIDES = 12, LUCK_LO = 0.55, LUCK_HI = 1.75, CRIT_MULT = 1.6
const K50 = 220, WL = 0.5, WG = 0.5, GEAR_FLOOR = 0.25, MAXLVL = 50
const BLOCK_ARMOR_MULT = 2.5, TRANSFORM_SCALE = 1.25
const DODGE_STAM = 3, BLOCK_STAM = 3
const PROFILE = {
  warrior: { power: 0.917, armor: 160, hp: 438, evade: 0.05 },
  rogue:   { power: 1.055, armor: 55,  hp: 282, evade: 0.30 },
  mage:    { power: 1.007, armor: 57,  hp: 332, evade: 0.18 },
  monk:    { power: 1.011, armor: 117, hp: 311, evade: 0.22 },
}
const ATTACKS = { basic: { mult: 0.72, stam: 1 }, weapon: { mult: 1.0, stam: 2 }, special: { mult: 1.5, stam: 3, reqTf: true } }
const clampGear = (t) => Number.isNaN(t) ? GEAR_FLOOR : Math.max(GEAR_FLOOR, Math.min(1, t))
const powerScale = (lvl, gear) => WL * (Math.max(0, lvl) / MAXLVL) + WG * clampGear(gear)
const luckOf = (roll) => { const t = (roll - 1) / (DICE_SIDES - 1); let m = LUCK_LO + (LUCK_HI - LUCK_LO) * t; if (roll >= DICE_SIDES) m *= CRIT_MULT; return m }
// 🩹 Especiais CRITAM com bônus REDUZIDO (SPECIAL_CRIT_MULT, ex.: 1.3 vs 1.6 do normal):
// o jogador ainda vê o crítico ao rolar o máximo (12), mas o bônus não vira nuke/one-shot.
const SPECIAL_CRIT_MULT = Number(process.env.SP_CRIT || 1.3)
const luckSpecial = (roll) => { const m = LUCK_LO + (LUCK_HI - LUCK_LO) * ((roll - 1) / (DICE_SIDES - 1)); return roll >= DICE_SIDES ? m * SPECIAL_CRIT_MULT : m }
const DR = (armor, K) => Math.max(0, armor) / (Math.max(0, armor) + K)
// 🔧 ATTR TILT — espelha applyAttrTilt do combatModel.ts. TILT=0 desliga (= PvP de
// HOJE, sem tilt → guerreiro domina). Default ON = a CORREÇÃO (passar attrs como no PvE).
const TILT_ON = process.env.TILT === '1' // default OFF (= PvP de hoje; o tilt não conserta classe)
const ATTR_TILT = { power: 0.55, powerAgi: 0.30, armor: 0.5, hp: 1.3, evade: 0.0020, evadeCap: 0.6 }
const ATTR_POWER_WEIGHT = { warrior: { str: 1.0, int: 0.8, agi: 1.0 }, mage: { str: 0.8, int: 1.0, agi: 1.0 }, monk: { str: 1.0, int: 1.0, agi: 1.0 }, rogue: { str: 0.8, int: 0.8, agi: 1.6 } }
function applyAttrTilt(lev, attrs, cls) {
  if (!attrs || !TILT_ON) return lev
  const str = Math.max(0, attrs.str || 0), agi = Math.max(0, attrs.agi || 0), int = Math.max(0, attrs.int || 0), def = Math.max(0, attrs.def || 0)
  const t = ATTR_TILT, w = ATTR_POWER_WEIGHT[cls] || { str: 1, int: 1, agi: 1 }
  return { ...lev, power: lev.power + (str * w.str + int * w.int) * t.power + agi * w.agi * t.powerAgi, armor: lev.armor + def * t.armor, hp: lev.hp + def * t.hp, evade: Math.min(t.evadeCap, lev.evade + agi * t.evade) }
}
function computeLevers(cls, level, gear, attrs) {
  const p = PROFILE[cls], S = powerScale(level, gear)
  const base = { power: p.power * S, armor: p.armor * S, hp: p.hp * S, evade: p.evade, K: K50 * S }
  return applyAttrTilt(base, attrs, cls)
}
const transformLevers = (l) => ({ power: l.power * TRANSFORM_SCALE, armor: l.armor * TRANSFORM_SCALE, hp: l.hp * TRANSFORM_SCALE, evade: l.evade, K: l.K * TRANSFORM_SCALE })

// 🎯 AJUSTE DE CLASSE SÓ-PvP (aplicado em derivePlayerLevers no servidor; o PvE chama
// computeLevers direto → fica INTOCADO). Conserta o domínio do tank (Guerreiro) sem
// mexer no PROFILE base nem no balance do dungeon. ADJ=0 desliga (= PvP de hoje).
const ADJ_ON = process.env.ADJ === '0' ? false : true
const PVP_CLASS_ADJ = {
  warrior: { power: 0.917, armor: 0.90, hp: 0.97 },
  rogue:   { power: 1.055, armor: 1.00, hp: 1.17 },
  mage:    { power: 1.007, armor: 1.00, hp: 1.02 },
  monk:    { power: 1.011, armor: 1.00, hp: 1.10 },
}
for (const c in PVP_CLASS_ADJ) { // overrides do auto-tuner (CADJ_<classe>_pw / _hp)
  const pw = process.env['CADJ_' + c + '_pw']; if (pw !== undefined) PVP_CLASS_ADJ[c].power = Number(pw)
  const hp = process.env['CADJ_' + c + '_hp']; if (hp !== undefined) PVP_CLASS_ADJ[c].hp = Number(hp)
}
function pvpAdjust(lev, cls) {
  if (!ADJ_ON) return lev
  const a = PVP_CLASS_ADJ[cls]; if (!a) return lev
  return { ...lev, power: lev.power * a.power, armor: lev.armor * a.armor, hp: lev.hp * a.hp }
}

// ============================================================
// POOLS (stamina/MP gatam os especiais) — dos stats da CLASSE+RAÇA-da-forma.
// (O dano não usa stats; só os pools, p/ casters sustentarem especiais de MP.)
// ============================================================
const RACES = { draconiano: { strength: 30, constitution: 50 }, humano: { strength: 20, dexterity: 20, intelligence: 20, constitution: 20 }, metamorfo: { dexterity: 50, constitution: 30 }, elfo: { intelligence: 40, dexterity: 30, constitution: 20 } }
const CLASS_BONUS = { warrior: { strength: 40, constitution: 30 }, rogue: { dexterity: 40, intelligence: 20 }, mage: { intelligence: 50 }, monk: { dexterity: 40, constitution: 40 } }
const CLASS_BUILD = { warrior: { str: 0.7, def: 0.3 }, rogue: { agi: 0.85, def: 0.15 }, mage: { int: 0.85, def: 0.15 }, monk: { agi: 0.55, def: 0.45 } }
const FORM_RACE = { dragon: 'draconiano', seventh_sense: 'humano', celestial: 'elfo', wolf: 'metamorfo', bear: 'metamorfo', eagle: 'metamorfo' }
// Atributos TOTAIS do personagem (distribuídos + raça + classe + piso 8), como o
// character.str/agi/int/def que o PvE passa a computeLevers.
function attrsOf(cls, form, level) {
  const race = FORM_RACE[form]
  const pts = 18 + Math.max(0, level - 1)
  const w = CLASS_BUILD[cls]; const d = { str: 0, agi: 0, int: 0, def: 0 }
  const keys = Object.keys(w); let used = 0
  keys.forEach((k, i) => { const v = i === keys.length - 1 ? pts - used : Math.round(pts * w[k]); d[k] = v; used += v })
  const rb = RACES[race] || {}, cb = CLASS_BONUS[cls] || {}
  const bon = (k) => Math.floor((rb[k] || 0) / 10) + Math.floor((cb[k] || 0) / 10)
  return {
    str: Math.max(8, d.str + bon('strength')), agi: Math.max(8, d.agi + bon('dexterity')),
    int: Math.max(8, d.int + bon('intelligence')), def: d.def + bon('constitution'),
  }
}
function pools(cls, form, level) {
  const a = attrsOf(cls, form, level)
  return { maxMp: 60 + a.int * 4 + a.agi, maxStamina: 120 + a.agi * 2 + a.def * 2 }
}

// ============================================================
// ESPECIAIS POR FORMA (modelo de levers). dano = powerEff × sorte × (1−DR).
//   dmgMult: multiplicador sobre o power transformado
//   pierce: fração da armadura ignorada (1 = ignora tudo)
//   gcrit: sorte = máxima (crítico garantido)
//   hits: nº de golpes
//   undodge: dano direto (especiais não passam pela esquiva) — TRUE p/ todos de dano
//   util(self,enemy): aplica status
// Custos em {stamina, mp}, cooldown cd. ▼ NÚMEROS A TUNAR ▼
// ============================================================
// ⚖️ DESIGN C — SUSTENTADO (não-burst): mults de dano BAIXOS (hit típico ~30-40% do
// HP do alvo) + DoT pra repor o output ao longo do tempo. Com o no-crit + o teto
// SPECIAL_HP_CAP, NENHUM especial tira mais que o teto do HP máx → sem one-shot no
// mesmo nível. Lutas mais longas; status/DoT/utilidade decidem.
const SPECIALS = {
  dragon: [
    { id: 'dragon_breath', name: '🔥 Sopro de Fogo', dmgMult: 1.749, pierce: 0.6, dot: (s) => ({ frac: 0.05, turns: 3, label: 'queimadura' }), cost: { stamina: 14 }, cd: 2 },
    { id: 'dragon_scales', name: '🛡️ Escamas', util: (s) => st(s, 'dmgTaken', 0.68, 3), cost: { mp: 14 }, cd: 4, desc: '-32% dano recebido 3t' },
    { id: 'dragon_roar', name: '🦅 Rugido Dracônico', util: (s, e) => st(e, 'dmgDealt', 0.74, 2), cost: { stamina: 10 }, cd: 3, desc: '-26% dano inimigo 2t' },
  ],
  wolf: [
    { id: 'pack_hunt', name: '🏃 Caçada (3x)', dmgMult: 0.619, hits: 3, cost: { stamina: 18 }, cd: 3 },
    { id: 'bite_bleeding', name: '🩸 Mordida Sangrenta', dmgMult: 0.937, pierce: 1, dot: (s) => ({ frac: 0.05, turns: 3, label: 'sangramento' }), cost: { stamina: 12 }, cd: 3 },
    { id: 'howl', name: '🌙 Uivo', util: (s) => { st(s, 'dmgDealt', 1.25, 3); s.evadeBuff = 0.08; s.evadeBuffTurns = 3 }, cost: { stamina: 14 }, cd: 4, desc: '+25% dano e +8% evasão 3t' },
  ],
  bear: [
    { id: 'unstoppable_charge', name: '💥 Investida Imparável', dmgMult: 1.257, pierce: 1, cost: { stamina: 26 }, cd: 4 },
    { id: 'bear_hug', name: '🤗 Abraço do Urso', dmgMult: 0.818, dot: (s) => ({ frac: 0.06, turns: 2, label: 'esmagamento' }), immobilizeRoll: 11, cost: { stamina: 22 }, cd: 4, desc: 'dano + DoT (imobiliza só com rolagem ≥11)' },
    { id: 'intimidating_roar', name: '😤 Rugido Intimidador', util: (s, e) => st(e, 'dmgDealt', 0.70, 3), cost: { stamina: 14 }, cd: 4, desc: '-30% dano inimigo 3t' },
  ],
  eagle: [
    { id: 'dive_attack', name: '💨 Mergulho', dmgMult: 0.931, pierce: 0.3, cost: { stamina: 18 }, cd: 3 },
    { id: 'keen_sight', name: '👁️ Visão Aguçada', util: (s) => st(s, 'dmgDealt', 1.20, 2), cost: { stamina: 10 }, cd: 3, desc: '+20% dano 2t' },
    { id: 'aerial_superiority', name: '☁️ Superioridade Aérea', util: (s) => { s.evadeBuff = 0.22; s.evadeBuffTurns = 1 }, cost: { mp: 14 }, cd: 4, desc: '+22% evasão 1t' },
  ],
  seventh_sense: [
    { id: 'cosmo_burst', name: '🌌 Explosão de Cosmo', dmgMult: 1.768, cost: { mp: 6, stamina: 8 }, cd: 2 },
    { id: 'cosmo_focus', name: '🧘 Foco do Cosmo', util: (s) => st(s, 'dmgDealt', 1.35, 3), cost: { mp: 12 }, cd: 4, desc: '+35% dano 3t' },
    { id: 'precognitive_counter', name: '👁️ Contra-ataque', util: (s) => { s.evadeBuff = 0.6; s.evadeBuffTurns = 1; s.counterNext = true }, cost: { stamina: 12 }, cd: 3, desc: 'esquiva + contra-ataque' },
  ],
  celestial: [
    { id: 'holy_nova', name: '💥 Nova Sagrada', dmgMult: 4.732, pierce: 0.5, cost: { mp: 8 }, cd: 2 },
    { id: 'restoring_blessing', name: '🕊️ Bênção', util: (s) => { s.healPct = 0.23 }, cost: { mp: 18 }, cd: 3, desc: 'cura 23% HP máx' },
    { id: 'arcane_torrent', name: '🔷 Torrente Arcana', util: (s) => { s.amplifyNext = 1.6 }, cost: { stamina: 10 }, cd: 3, desc: 'próx. especial de dano ×1.6' },
  ],
}
// helper de status temporário (multiplicador): kind 'dmgTaken' | 'dmgDealt'
function st(c, kind, mult, turns) { c.status = c.status || {}; c.status[kind] = { mult, turns } }
function formSpecials(form) { return SPECIALS_ON ? (SPECIALS[form] || []) : [] }
// EV (dano médio estimado) de cada especial de dano, p/ a IA — puro, não rola dado.
const AVG_LUCK = (() => { let s = 0; for (let r = 1; r <= DICE_SIDES; r++) s += luckOf(r); return s / DICE_SIDES })()
const AVG_LUCK_NOCRIT = (() => { let s = 0; for (let r = 1; r <= DICE_SIDES; r++) s += luckSpecial(r); return s / DICE_SIDES })()

// ============================================================
// LUTADOR
// ============================================================
const FORM_LABEL = { dragon: '🐉Dragão', wolf: '🐺Lobo', bear: '🐻Urso', eagle: '🦅Águia', seventh_sense: '✨7ºSent', celestial: '🌟Celest' }
function mk(cls, form, level, gear) {
  const baseL = pvpAdjust(computeLevers(cls, level, gear, attrsOf(cls, form, level)), cls)
  const p = pools(cls, form, level)
  return { cls, form, id: `${cls}/${form}`, level, baseL, ...p, mp: p.maxMp, stamina: p.maxStamina }
}

// dano de um golpe normal (com defesa do oponente)
function attackDamage(att, def, type, roll, defense, dodgeOK) {
  const power = att.L.power * ATTACKS[type].mult
  if (defense === 'dodge' && dodgeOK) return { dmg: 0, dodged: true }
  const effArmor = defense === 'block' ? def.L.armor * BLOCK_ARMOR_MULT : def.L.armor
  let dmg = power * luckOf(roll) * (1 - DR(effArmor, def.L.K))
  dmg = dmg * (att.status?.dmgDealt?.mult || 1) * (def.status?.dmgTaken?.mult || 1)
  dmg = Math.min(dmg, (def.maxHp || 0) * SPECIAL_HP_CAP) // teto universal: sem one-shot
  return { dmg: Math.max(1, Math.round(dmg)), dodged: false, crit: roll >= DICE_SIDES }
}
// dano de um especial (direto, sem esquiva)
function specialDamage(att, def, sp) {
  const hits = sp.hits || 1
  let total = 0, crit = false, maxRoll = 0
  for (let h = 0; h < hits; h++) {
    const roll = sp.gcrit || att.gcritNext ? DICE_SIDES : dInt(DICE_SIDES)
    if (roll > maxRoll) maxRoll = roll
    if (roll >= DICE_SIDES) crit = true
    const power = att.L.power * sp.dmgMult * FM(att.form) * (att.amplifyNext || 1)
    const armor = def.L.armor * (1 - (sp.pierce || 0))
    let dmg = power * luckSpecial(roll) * (1 - DR(armor, def.L.K))
    dmg = dmg * (att.status?.dmgDealt?.mult || 1) * (def.status?.dmgTaken?.mult || 1)
    total += Math.max(1, Math.round(dmg))
  }
  att.gcritNext = false; att.amplifyNext = 0
  // 🛡️ TETO ANTI-ONE-SHOT: um especial nunca tira mais que SPECIAL_HP_CAP do HP MÁX
  // do alvo (de full, sobra ≥1−cap). Combos/alvos feridos/níveis abaixo ainda matam.
  total = Math.min(total, Math.round((def.maxHp || 0) * SPECIAL_HP_CAP))
  return { dmg: Math.max(1, total), crit, maxRoll }
}
const SPECIAL_HP_CAP = Number(process.env.SPECIAL_CAP || 0.6)
// Multiplicador de dano POR FORMA (knob do auto-tuner; default 1). Escala todas as
// mults de dano daquela forma — usado p/ balancear cada forma a ~50% sem flailing manual.
const FORM_MULT = { dragon: 1, wolf: 1, bear: 1, eagle: 1, seventh_sense: 1, celestial: 1 }
for (const k in FORM_MULT) { const v = process.env['FM_' + k]; if (v !== undefined) FORM_MULT[k] = Number(v) }
const FM = (form) => FORM_MULT[form] || 1
function specialEV(att, def, sp) {
  const hits = sp.hits || 1
  const power = att.L.power * sp.dmgMult * FM(att.form)
  const armor = def.L.armor * (1 - (sp.pierce || 0))
  const luck = sp.gcrit ? LUCK_HI : AVG_LUCK_NOCRIT
  return hits * power * luck * (1 - DR(armor, def.L.K)) * (att.status?.dmgDealt?.mult || 1)
}

// EV de um ataque normal contra o defensor (considera evasão média)
function normalEV(att, def, type) {
  const power = att.L.power * ATTACKS[type].mult
  const full = power * AVG_LUCK * (1 - DR(def.L.armor, def.L.K))
  return full * (att.status?.dmgDealt?.mult || 1)
}

// ============================================================
// IA — escolha de ação e de defesa
// ============================================================
function chooseAction(att, def) {
  if (WELLS && att.hp < att.maxHp * 0.3) return { type: 'well_hp' }
  const sps = formSpecials(att.form)
  // utilitários de abertura (1x enquanto não ativos)
  for (const sp of sps) {
    if (!sp.util || !offCd(att, sp) || !afford(att, sp.cost)) continue
    if (sp.id === 'restoring_blessing' && att.hp > att.maxHp * 0.55) continue
    if (sp.id === 'dragon_scales' && att.status?.dmgTaken) continue
    if ((sp.id === 'intimidating_roar' || sp.id === 'dragon_roar') && def.status?.dmgDealt) continue
    if ((sp.id === 'cosmo_focus' || sp.id === 'howl') && att.status?.dmgDealt) continue
    if (sp.id === 'arcane_torrent' && att.amplifyNext) continue
    if (sp.id === 'keen_sight' || sp.id === 'aerial_superiority' || sp.id === 'precognitive_counter') continue // reativos
    // arcane_torrent só vale se há holy_nova pagável em seguida
    if (sp.id === 'arcane_torrent') { const nova = sps.find((x) => x.id === 'holy_nova'); if (!nova || !afford(att, { mp: nova.cost.mp })) continue }
    return { type: 'special', sp }
  }
  // melhor ataque (especiais de dano vs normais)
  let best = null
  for (const sp of sps) { if (!sp.dmgMult || !offCd(att, sp) || !afford(att, sp.cost)) continue; const ev = specialEV(att, def, sp); if (!best || ev > best.ev) best = { type: 'special', sp, ev } }
  for (const t of ['special', 'weapon', 'basic']) {
    if (ATTACKS[t].reqTf && !att.transformed) continue
    if (att.stamina < ATTACKS[t].stam) continue
    const ev = normalEV(att, def, t)
    if (!best || ev > best.ev) best = { type: 'attack', action: t, ev }
  }
  if (best) return best
  if (WELLS && att.mp < 16) return { type: 'well_mp' }
  return { type: 'attack', action: 'basic' }
}
const offCd = (c, sp) => !c.cd[sp.id] || c.cd[sp.id] <= 0
const afford = (c, cost) => (c.mp >= (cost.mp || 0)) && (c.stamina >= (cost.stamina || 0))

function chooseDefense(def, att, type) {
  const canDodge = def.stamina >= DODGE_STAM, canBlock = def.stamina >= BLOCK_STAM
  if (!canDodge && !canBlock) return 'none'
  const power = att.L.power * ATTACKS[type].mult
  const full = power * AVG_LUCK * (1 - DR(def.L.armor, def.L.K))
  const evade = Math.min(0.95, def.L.evade + (def.evadeBuffTurns > 0 ? def.evadeBuff : 0))
  const evDodge = (1 - evade) * full
  const evBlock = power * AVG_LUCK * (1 - DR(def.L.armor * BLOCK_ARMOR_MULT, def.L.K))
  if (canDodge && (!canBlock || evDodge <= evBlock)) return 'dodge'
  return 'block'
}

// ============================================================
// TRANSFORMAÇÃO + STATUS
// ============================================================
function applyTransform(c) { c.L = transformLevers(c.baseL); c.transformed = true }
function startTurn(c, log) {
  c.stamina = Math.min(c.maxStamina, c.stamina + 2)
  if (!WELLS) c.mp = Math.min(c.maxMp, c.mp + 3) // leve regen (sem poços); com poços, MP via well
  // DoT
  if (c.dots) { for (const d of c.dots) { const dmg = Math.max(1, Math.round(c.maxHp * d.frac)); c.hp -= dmg; if (log) log(`     ☠️ ${c.id} sofre ${dmg} (${d.label})  HP ${Math.max(0, c.hp)}`); d.turns-- } c.dots = c.dots.filter((d) => d.turns > 0) }
  // expira status
  for (const k of ['dmgDealt', 'dmgTaken']) if (c.status?.[k]) { c.status[k].turns--; if (c.status[k].turns <= 0) delete c.status[k] }
  if (c.evadeBuffTurns > 0) { c.evadeBuffTurns--; if (c.evadeBuffTurns <= 0) c.evadeBuff = 0 }
}

// ============================================================
// LUTA
// ============================================================
function fight(c1, c2, log) {
  const a = freshFighter(c1), b = freshFighter(c2)
  let att, def
  const i1 = dInt(20), i2 = dInt(20)
  if (i1 > i2 || (i1 === i2 && rng() < 0.5)) { att = a; def = b } else { att = b; def = a }
  if (log) { log(`\n⚔️ ${c1.id} (A) vs ${c2.id} (B) — nv${c1.level}`); log(`🎲 Iniciativa A=${i1} B=${i2} → começa ${att.id}`) }
  let turns = 0, actionCount = 0
  const MAX = 300
  while (a.hp > 0 && b.hp > 0 && turns < MAX) {
    turns++
    startTurn(att, log)
    if (att.hp <= 0) break
    for (const k in att.cd) if (att.cd[k] > 0) att.cd[k]--

    // transforma no 1º turno
    if (!att.transformed) { applyTransform(att); att.hp = att.maxHp = att.L.hp; if (log) log(`  ⚡ ${att.id} transforma (power ${Math.round(att.L.power)}, armor ${Math.round(att.L.armor)}, HP ${Math.round(att.L.hp)})`); [att, def] = [def, att]; continue }

    if (att.immobilizeTurns > 0) { att.immobilizeTurns--; if (log) log(`  🚫 ${att.id} imobilizado`); [att, def] = [def, att]; continue }

    const dec = chooseAction(att, def)
    actionCount = applyAction(att, def, dec, log, actionCount)
    if (att.healPct) { const h = Math.round(att.maxHp * att.healPct); att.hp = Math.min(att.maxHp, att.hp + h); if (log) log(`     🕊️ ${att.id} cura ${h}  HP ${att.hp}`); att.healPct = 0 }
    ;[att, def] = [def, att]
  }
  const winner = a.hp > 0 && b.hp <= 0 ? c1.id : b.hp > 0 && a.hp <= 0 ? c2.id : (a.hp >= b.hp ? c1.id : c2.id)
  if (log) log(`\n🏆 ${winner} (${turns} turnos)  | A HP ${Math.max(0, Math.round(a.hp))} · B HP ${Math.max(0, Math.round(b.hp))}`)
  return winner
}
function freshFighter(c) { return { ...c, L: c.baseL, hp: c.baseL.hp, maxHp: c.baseL.hp, mp: c.maxMp, stamina: c.maxStamina, cd: {}, dots: [], status: {}, transformed: false, immobilizeTurns: 0, evadeBuff: 0, evadeBuffTurns: 0 } }

function applyAction(att, def, dec, log, actionCount) {
  if (dec.type === 'well_hp') { const h = Math.round(att.maxHp * 0.4); att.hp = Math.min(att.maxHp, att.hp + h); if (log) log(`  🧪 ${att.id} POÇO VIDA +${h}`); return actionCount }
  if (dec.type === 'well_mp') { att.mp = Math.min(att.maxMp, att.mp + 60); if (log) log(`  🔵 ${att.id} POÇO MANA`); return actionCount }
  if (dec.type === 'special') {
    const sp = dec.sp; att.mp -= (sp.cost.mp || 0); att.stamina -= (sp.cost.stamina || 0); att.cd[sp.id] = sp.cd
    if (sp.util) { sp.util(att, def); if (log) log(`  ${sp.name}: ${att.id} — ${sp.desc}`); return actionCount }
    // dano direto
    actionCount++
    if (sp.dot) { def.dots = def.dots || []; def.dots.push(sp.dot(att)) }
    let { dmg, crit, maxRoll } = specialDamage(att, def, sp)
    // imobilização agora é PROC de sorte alta (rolagem ≥ immobilizeRoll), não garantida
    if (sp.immobilizeRoll && maxRoll >= sp.immobilizeRoll) { def.immobilizeTurns = 1; if (log) log(`  🌟 ${att.id} rolou ${maxRoll} — IMOBILIZA!`) }
    dmg = escalate(dmg, actionCount)
    def.hp -= dmg
    if (log) log(`  ${sp.name}: ${dmg} dano DIRETO${crit ? ' CRÍTICO' : ''}  ${def.id} HP ${Math.max(0, Math.round(def.hp))}`)
    return actionCount
  }
  // ataque normal (com reação do defensor)
  const type = dec.action; att.stamina -= ATTACKS[type].stam
  const roll = dInt(DICE_SIDES)
  const reaction = att.ignoreEvadeNext ? 'none' : chooseDefense(def, att, type)
  att.ignoreEvadeNext = false
  let dodgeOK = false
  if (reaction === 'dodge') { def.stamina -= DODGE_STAM; const evade = Math.min(0.95, def.L.evade + (def.evadeBuffTurns > 0 ? def.evadeBuff : 0)); dodgeOK = rng() < evade }
  else if (reaction === 'block') def.stamina -= BLOCK_STAM
  actionCount++
  let { dmg, dodged, crit } = attackDamage(att, def, type, roll, reaction, dodgeOK)
  if (dodged) {
    if (log) log(`  🗡️${type}: 🌀 ${def.id} ESQUIVOU`)
    if (def.counterNext) { def.counterNext = false; const c = Math.round((att.L.power * 0.6) * AVG_LUCK * (1 - DR(att.L.armor, att.L.K))); att.hp -= c; if (log) log(`     ↩️ contra-ataque ${c} em ${att.id}`) }
    return actionCount
  }
  dmg = escalate(dmg, actionCount)
  def.hp -= dmg
  if (log) log(`  🗡️${type}: ${dmg} dano${crit ? ' CRÍTICO' : ''} (${reaction})  ${def.id} HP ${Math.max(0, Math.round(def.hp))}`)
  return actionCount
}
function escalate(dmg, n) { if (n > 60) return Math.floor(dmg * 2); if (n > 40) return Math.floor(dmg * 1.5); return dmg }

// ============================================================
// EXECUÇÃO
// ============================================================
const CLASSES = ['warrior', 'rogue', 'mage', 'monk']
const FORMS = ['dragon', 'seventh_sense', 'celestial', 'wolf', 'bear', 'eagle']
const CLASS_LABEL = { warrior: 'Guer', rogue: 'Lad', mage: 'Mago', monk: 'Monge' }

console.log(`\n${'█'.repeat(76)}`)
console.log(`  DOLRATH — SIM PvP MODELO DE LEVERS  |  especiais: ${SPECIALS_ON ? 'ON' : 'OFF (baseline ×1.25 plano)'}  |  poços: ${WELLS ? 'ILIMITADOS' : 'não'}  |  gear ${GEAR_TIER}`)
console.log('█'.repeat(76))

if (DO_LOG) {
  const [ca, fa] = A_SPEC.split('/'), [cb, fb] = B_SPEC.split('/')
  fight(mk(ca, fa, LOG_LEVEL, GEAR_TIER), mk(cb, fb, LOG_LEVEL, GEAR_TIER), (s) => console.log(s))
  console.log('')
}

for (const level of LEVELS) {
  const fighters = []
  for (const c of CLASSES) for (const f of FORMS) fighters.push(mk(c, f, level, GEAR_TIER))
  const wins = {}, games = {}
  fighters.forEach((f) => { wins[f.id] = 0; games[f.id] = 0 })
  for (let i = 0; i < fighters.length; i++) for (let j = i + 1; j < fighters.length; j++) {
    const A = fighters[i], B = fighters[j]; let aw = 0
    for (let k = 0; k < FIGHTS; k++) if (fight(A, B, null) === A.id) aw++
    wins[A.id] += aw; games[A.id] += FIGHTS; wins[B.id] += FIGHTS - aw; games[B.id] += FIGHTS
  }
  console.log(`\n${'━'.repeat(76)}\n  NÍVEL ${level}  (${fighters.length} lutadores, ${FIGHTS} lutas/par)\n${'━'.repeat(76)}`)
  console.log(`\n  ── POR FORMA (média das 4 classes) ──`)
  FORMS.map((f) => { const fs = fighters.filter((x) => x.form === f); const w = fs.reduce((s, x) => s + wins[x.id], 0), g = fs.reduce((s, x) => s + games[x.id], 0); return { f, wr: 100 * w / g } })
    .sort((a, b) => b.wr - a.wr).forEach((x) => console.log(`     ${FORM_LABEL[x.f].padEnd(9)} ${x.wr.toFixed(1).padStart(5)}%`))
  console.log(`\n  ── POR CLASSE (média das 6 formas) ──`)
  CLASSES.map((c) => { const fs = fighters.filter((x) => x.cls === c); const w = fs.reduce((s, x) => s + wins[x.id], 0), g = fs.reduce((s, x) => s + games[x.id], 0); return { c, wr: 100 * w / g } })
    .sort((a, b) => b.wr - a.wr).forEach((x) => console.log(`     ${CLASS_LABEL[x.c].padEnd(9)} ${x.wr.toFixed(1).padStart(5)}%`))
  console.log(`\n  ── TOP/BOTTOM LUTADORES (classe/forma) ──`)
  const ranked = fighters.map((f) => ({ id: f.id, wr: 100 * wins[f.id] / games[f.id] })).sort((a, b) => b.wr - a.wr)
  ranked.slice(0, 5).forEach((r, i) => console.log(`     ${String(i + 1).padStart(2)}. ${r.id.padEnd(22)} ${r.wr.toFixed(1)}%`))
  console.log('        ...')
  ranked.slice(-5).forEach((r, i) => console.log(`     ${String(ranked.length - 4 + i).padStart(2)}. ${r.id.padEnd(22)} ${r.wr.toFixed(1)}%`))
}
console.log(`\n${'█'.repeat(76)}\n`)
