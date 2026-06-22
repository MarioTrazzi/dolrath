#!/usr/bin/env node
// ============================================================
// DOLRATH — Simulador do MODELO DE COMBATE ENXUTO (levers reais)
//
// 🔑 Diferente da versão antiga (que reimplementava os levers à mão), este
// REQUER o código de produção (server/combatModel.js) e exercita as MESMAS
// funções do jogo: computeLevers (PROFILE × S + tilt de atributos), resolveHit,
// transformLevers. Assim a validação fala do combate REAL, não de uma cópia.
//
//  • Dano = poder × SORTE_DO_DADO (banda multiplicativa, d12)   — resolveHit
//  • Mitigação UNIFICADA proporcional: DR = arm/(arm+K)          — resolveHit
//  • Defesa = Esquiva (evade, custa stamina) | Bloqueio (armadura ×2.5)
//  • Atributos da criação/nível → TILT simétrico nos levers      — applyAttrTilt
//
// 🎲 O DADO É DECISIVO: a sorte é uma banda multiplicativa larga, calibrada p/ que
// um lutador ~12% mais fraco ainda vença ~38%. Isso afrouxa o balanceamento: basta
// as classes ficarem dentro de ~10-15% uma da outra.
//
// Uso:
//   node scripts/lean-combat-sim.js                 # matriz 4 classes (com tilt de build)
//   LEVEL=50 GEAR=1 node scripts/lean-combat-sim.js # nível/gear da matriz
//   node scripts/lean-combat-sim.js --build         # calibra o tilt: builds puras (STR/AGI/INT/DEF)
//   node scripts/lean-combat-sim.js --transform     # valida TRANSFORM_SCALE (espelho + assimétrico)
//   node scripts/lean-combat-sim.js --luck          # calibra o dado: gap de poder → win%
// ============================================================

const CM = require('../server/combatModel')

const args = process.argv.slice(2)
const has = (n) => args.includes(`--${n}`)
const FIGHTS = Number((args.find((a) => a.startsWith('--fights=')) || '').split('=')[1]) || 4000
const LEVEL = Number(process.env.LEVEL) || 50
const GEAR = process.env.GEAR !== undefined ? Number(process.env.GEAR) : 1
const rnd01 = Math.random

// Esquiva custa stamina (não dá p/ esquivar todo golpe). Stamina simples por turno.
const STAM_MAX = Number(process.env.STAMMAX) || 6
const STAM_REGEN = Number(process.env.STAMREGEN) || 2
const DODGE_COST = CM.DODGE_STAMINA_COST

const NAMES = ['warrior', 'rogue', 'mage', 'monk']
const LABEL = { warrior: 'Guerreiro', rogue: 'Ladino', mage: 'Mago', monk: 'Monge' }

// ============================================================
// ATRIBUTOS por classe (criação 18 + 1/nível, capado em 10/stat na criação)
// Espelha as builds do pvp-race-class-sim: identidade de golpe da classe.
// + bônus de classe (gameData /10). Raça é ortogonal → omitida (foco em classe).
// ============================================================
const CLASS_BUILD = {
  warrior: { str: 0.7, def: 0.3 },
  rogue: { agi: 0.85, def: 0.15 },
  mage: { int: 0.85, def: 0.15 },
  monk: { agi: 0.55, def: 0.45 },
}
const CLASS_BONUS = {
  warrior: { str: 4, def: 3 },
  rogue: { agi: 4, int: 2 },
  mage: { int: 5 },
  monk: { agi: 4, def: 4 },
}
const CREATION_PTS = 18, CAP = 10
function classAttrs(klass, level) {
  const w = CLASS_BUILD[klass]
  const out = { str: 0, agi: 0, int: 0, def: 0 }
  const creation = Math.min(CREATION_PTS, CREATION_PTS) // criação cheia
  const levelPts = Math.max(0, level - 1)
  let spill = 0
  for (const k of Object.keys(w)) {
    const want = Math.round(creation * w[k])
    out[k] = Math.min(CAP, want)
    spill += want - out[k]
  }
  out.def = Math.min(CAP, out.def + spill)
  for (const k of Object.keys(w)) out[k] += Math.round(levelPts * w[k])
  const cb = CLASS_BONUS[klass] || {}
  for (const k of Object.keys(out)) out[k] += cb[k] || 0
  return out
}

// TILT tunável por env (default = constantes de produção em CM.ATTR_TILT). Permite
// calibrar SEM editar o modelo; quando o env está vazio, replica a produção exata.
const T = {
  power: process.env.TILT_POWER !== undefined ? Number(process.env.TILT_POWER) : CM.ATTR_TILT.power,
  powerAgi: process.env.TILT_POWERAGI !== undefined ? Number(process.env.TILT_POWERAGI) : CM.ATTR_TILT.powerAgi,
  armor: process.env.TILT_ARMOR !== undefined ? Number(process.env.TILT_ARMOR) : CM.ATTR_TILT.armor,
  hp: process.env.TILT_HP !== undefined ? Number(process.env.TILT_HP) : CM.ATTR_TILT.hp,
  evade: process.env.TILT_EVADE !== undefined ? Number(process.env.TILT_EVADE) : CM.ATTR_TILT.evade,
  evadeCap: CM.ATTR_TILT.evadeCap,
}
function tiltLevers(base, attrs) {
  if (!attrs) return base
  const str = Math.max(0, attrs.str || 0), agi = Math.max(0, attrs.agi || 0)
  const int = Math.max(0, attrs.int || 0), def = Math.max(0, attrs.def || 0)
  return {
    ...base,
    power: base.power + (str + int) * T.power + agi * T.powerAgi,
    armor: base.armor + def * T.armor,
    hp: base.hp + def * T.hp,
    evade: Math.min(T.evadeCap, base.evade + agi * T.evade),
  }
}

// ============================================================
// LUTA — usa resolveHit do modelo. Levers já vêm prontos (com tilt/transform).
// HP_MULT (default 1 = HP real do PROFILE): a luta fica curta o bastante p/ o dado
// importar (a propriedade "dado cobre ~12% de gap" só vale em lutas curtas).
// ============================================================
const HP_MULT = Number(process.env.HPMULT) || 1
function mkFighter(id, levers) {
  return { id, levers, curHp: levers.hp * HP_MULT, stam: STAM_MAX }
}
function fight(LA, LB) {
  const a = mkFighter('A', LA), b = mkFighter('B', LB)
  let att = Math.random() < 0.5 ? a : b
  let def = att === a ? b : a
  for (let turn = 0; turn < 600 && a.curHp > 0 && b.curHp > 0; turn++) {
    att.stam = Math.min(STAM_MAX, att.stam + STAM_REGEN)
    // Política de defesa do BASELINE (igual à validação do PROFILE): esquiva quando
    // tem stamina E a evasão é relevante; senão encaixa o golpe com armadura PASSIVA.
    // (bloqueio ativo a cada turno superinfla classes de muita armadura e não é a
    //  premissa do equilíbrio — bloqueio é tático/ocasional no jogo.)
    const canDodge = def.stam >= DODGE_COST
    const defense = canDodge && def.levers.evade > 0.12 ? 'dodge' : 'none'
    if (defense === 'dodge') def.stam -= DODGE_COST
    const r = CM.resolveHit(att.levers, def.levers, { defense, rng: rnd01 })
    def.curHp -= r.damage
    ;[att, def] = [def, att]
  }
  if (a.curHp <= 0 && b.curHp <= 0) return null
  if (a.curHp <= 0) return 'B'
  if (b.curHp <= 0) return 'A'
  return null
}
function winRate(LP, LQ, n = FIGHTS) {
  let pw = 0, dec = 0
  for (let i = 0; i < n; i++) {
    const w = fight(LP, LQ)
    if (w === 'A') { pw++; dec++ } else if (w === 'B') dec++
  }
  return dec ? (100 * pw) / dec : 50
}

function classLevers(klass, { transformed = false, withTilt = true } = {}) {
  const attrs = withTilt ? classAttrs(klass, LEVEL) : null
  let lv = tiltLevers(CM.computeLevers(klass, LEVEL, GEAR), attrs)
  if (transformed) lv = CM.transformLevers(lv)
  return lv
}

// ============================================================
// MODO --luck: calibra o dado. Dois lutadores IDÊNTICOS, um com +X% de PODER.
// ============================================================
if (has('luck')) {
  console.log(`\n🎲 CALIBRAÇÃO DO DADO  |  d${CM.DICE_SIDES} banda [${CM.LUCK_LO}, ${CM.LUCK_HI}] crit×${CM.CRIT_MULT}  |  ${FIGHTS} lutas`)
  console.log(`   (alvo: +12% de poder ≈ 62% win, p/ o mais fraco ter ~38% de chance)\n`)
  const base = { power: 140, armor: 120, hp: Number(process.env.BASEHP) || 1400, evade: 0.18, K: CM.K50, scale: 1 }
  for (const gap of [0, 5, 10, 12, 15, 20, 30]) {
    const strong = { ...base, power: base.power * (1 + gap / 100) }
    const wr = winRate(strong, base)
    console.log(`   +${String(gap).padStart(2)}% poder →  ${wr.toFixed(1)}% win  ${'▇'.repeat(Math.round(wr / 2))}`)
  }
  console.log('')
  process.exit(0)
}

// ============================================================
// MODO --build: calibra o TILT. Mesma classe-base (mage neutro), 4 builds PURAS
// (todos os pontos num stat) num espelho. Queremos as 4 ~equilibradas (~50%):
// é isso que torna o tilt "simétrico" (cada ponto vale ~o mesmo em combate).
// ============================================================
if (has('build')) {
  console.log(`\n${'='.repeat(64)}`)
  console.log(`  CALIBRAÇÃO DO TILT  |  nv${LEVEL} gear ${GEAR}  |  ${FIGHTS} lutas/par`)
  console.log(`  tilt: power=${T.power} powerAgi=${T.powerAgi} armor=${T.armor} hp=${T.hp} evade=${T.evade}`)
  console.log('='.repeat(64))
  const P = CREATION_PTS + Math.max(0, LEVEL - 1)
  const builds = {
    'STR puro': { str: P, agi: 0, int: 0, def: 0 },
    'AGI puro': { str: 0, agi: P, int: 0, def: 0 },
    'INT puro': { str: 0, agi: 0, int: P, def: 0 },
    'DEF puro': { str: 0, agi: 0, int: 0, def: P },
  }
  // base de classe NEUTRA p/ isolar o efeito do stat: usa PROFILE do guerreiro
  // como casca e deixa o TILT mandar (mesma casca p/ todos → diferença = só o tilt).
  const shell = (attrs) => tiltLevers(CM.computeLevers('monk', LEVEL, GEAR), attrs)
  const keys = Object.keys(builds)
  const lev = {}; keys.forEach((k) => (lev[k] = shell(builds[k])))
  console.log('\n  ── LEVERS RESULTANTES ──')
  keys.forEach((k) => {
    const l = lev[k]
    console.log(`   ${k.padEnd(9)} power ${l.power.toFixed(0).padStart(4)}  armor ${l.armor.toFixed(0).padStart(4)}  hp ${(l.hp).toFixed(0).padStart(4)}  evade ${l.evade.toFixed(3)}`)
  })
  console.log('\n  ── WIN% MÉDIO (cada build vs as outras 3) ──')
  const wins = {}, games = {}
  keys.forEach((k) => { wins[k] = 0; games[k] = 0 })
  for (let i = 0; i < keys.length; i++)
    for (let j = i + 1; j < keys.length; j++) {
      const wr = winRate(lev[keys[i]], lev[keys[j]])
      wins[keys[i]] += wr; games[keys[i]] += 100
      wins[keys[j]] += 100 - wr; games[keys[j]] += 100
    }
  const ranked = keys.map((k) => ({ k, wr: wins[k] / (games[k] / 100) })).sort((a, b) => b.wr - a.wr)
  ranked.forEach((r) => {
    const flag = r.wr >= 60 || r.wr <= 40 ? '  ⚠️' : ''
    console.log(`   ${r.k.padEnd(9)} ${r.wr.toFixed(1).padStart(5)}%  ${'▇'.repeat(Math.round(r.wr / 2))}${flag}`)
  })
  const spread = ranked[0].wr - ranked[ranked.length - 1].wr
  console.log(`\n  ➤ SPREAD ENTRE BUILDS: ${spread.toFixed(1)} pts   ${spread <= 15 ? '✅ tilt simétrico (dado cobre)' : '⚠️ tunar coeficientes'}`)
  console.log(`\n${'='.repeat(64)}\n`)
  process.exit(0)
}

// ============================================================
// MATRIZ das 4 classes — com a build de cada classe (tilt aplicado).
// --transform: roda 3 cenários (base, ambos transformados, e 1×1 assimétrico)
// p/ validar que TRANSFORM_SCALE preserva o equilíbrio e dá vantagem sã.
// ============================================================
function matrix(opts) {
  const lev = {}; NAMES.forEach((n) => (lev[n] = classLevers(n, opts)))
  const wins = {}, games = {}; NAMES.forEach((n) => { wins[n] = 0; games[n] = 0 })
  const cell = {}
  for (let i = 0; i < NAMES.length; i++)
    for (let j = i + 1; j < NAMES.length; j++) {
      const A = NAMES[i], B = NAMES[j]
      const wr = winRate(lev[A], lev[B])
      cell[`${A}|${B}`] = wr
      wins[A] += wr; games[A] += 100
      wins[B] += 100 - wr; games[B] += 100
    }
  const ranked = NAMES.map((n) => ({ n, wr: wins[n] / (games[n] / 100) })).sort((a, b) => b.wr - a.wr)
  const spread = ranked[0].wr - ranked[ranked.length - 1].wr
  return { lev, cell, ranked, spread }
}
function printMatrix(title, m) {
  console.log(`\n  ── ${title} ──`)
  console.log(`     LEVERS (com build da classe):`)
  NAMES.forEach((n) => {
    const l = m.lev[n]
    console.log(`       ${LABEL[n].padEnd(10)} power ${l.power.toFixed(0).padStart(4)}  armor ${l.armor.toFixed(0).padStart(4)}  hp ${l.hp.toFixed(0).padStart(4)}  evade ${l.evade.toFixed(3)}`)
  })
  m.ranked.forEach((r) => {
    const flag = r.wr >= 58 || r.wr <= 42 ? '  ⚠️' : ''
    console.log(`     ${LABEL[r.n].padEnd(10)} ${r.wr.toFixed(1).padStart(5)}%  ${'▇'.repeat(Math.round(r.wr / 2))}${flag}`)
  })
  console.log(`     ➤ SPREAD: ${m.spread.toFixed(1)} pts   ${m.spread <= 15 ? '✅' : '⚠️ acima de 15'}`)
}

console.log(`\n${'='.repeat(64)}`)
console.log(`  MODELO ENXUTO (código real) — nv${LEVEL} gear ${GEAR}  |  d${CM.DICE_SIDES} [${CM.LUCK_LO},${CM.LUCK_HI}]  |  ${FIGHTS} lutas/par`)
console.log('='.repeat(64))

const baseM = matrix({ transformed: false })
printMatrix('BASE (sem transformação)', baseM)

if (has('transform')) {
  const tfM = matrix({ transformed: true })
  printMatrix(`AMBOS TRANSFORMADOS (×${CM.TRANSFORM_SCALE})`, tfM)
  console.log(`\n  ── VANTAGEM DA TRANSFORMAÇÃO (transformado vs base, mesma classe) ──`)
  NAMES.forEach((n) => {
    const wr = winRate(classLevers(n, { transformed: true }), classLevers(n, { transformed: false }))
    console.log(`     ${LABEL[n].padEnd(10)} transformado ${wr.toFixed(1).padStart(5)}%  ${'▇'.repeat(Math.round(wr / 2))}`)
  })
  const avgAdv = NAMES.reduce((s, n) => s + winRate(classLevers(n, { transformed: true }), classLevers(n, { transformed: false })), 0) / NAMES.length
  console.log(`\n  ➤ vantagem média do TRANSFORM: ${avgAdv.toFixed(1)}% (sã: ~58-72%; <55 fraco, >80 warpa o meta)`)
  console.log(`  ➤ spread base ${baseM.spread.toFixed(1)} vs transformado ${tfM.spread.toFixed(1)} — o equilíbrio se preserva se ~iguais`)
}

console.log(`\n${'='.repeat(64)}\n`)
