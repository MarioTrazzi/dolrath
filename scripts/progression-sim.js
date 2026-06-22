#!/usr/bin/env node
// ============================================================
// DOLRATH — Simulador de PROGRESSÃO (classe × equip × nível → combate enxuto)
//
// Conecta o modelo enxuto validado (scripts/lean-combat-sim.js, perfis abstratos)
// ao mundo real: constrói um personagem de CLASSE/NÍVEL/GEAR e DERIVA os 4 levers
// (poder, armadura, HP, evasão) via fórmulas de mapeamento. Objetivo: que nv50+BiS
// lendário IV reproduza os perfis equilibrados, e que a relação escale bem.
//
// 🎛️ MAPEAMENTO (o que estamos refinando):
//   poder    = atk_arma×aprimoramento + statPrincipal×KPOW
//   armadura = Σ armadura_gear×aprimoramento + DEF×KDA
//   HP       = (HPBASE + nível×HPLVL + DEF×KDH + Σ hp_gear×aprimoramento) × PUNCH
//   evasão   = evBase_classe + AGI×KEV   (teto EVCAP)
//
// Combate = motor enxuto (poder×sorte, mitigação proporcional, esquiva c/ stamina).
//
// Uso:
//   node scripts/progression-sim.js                 # matriz nv50 BiS + levers
//   node scripts/progression-sim.js --levels=1,20,50
//   node scripts/progression-sim.js --gap           # azarão com -1 tier de gear
// ============================================================

const args = process.argv.slice(2)
const getArg = (n, d) => { const a = args.find((x) => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : (args.includes(`--${n}`) ? true : d) }
const FIGHTS = Number(getArg('fights', 16000))
const LEVELS = String(getArg('levels', '50')).split(',').map(Number)
const SHOW_GAP = Boolean(getArg('gap', false))
const rnd = (n) => 1 + Math.floor(Math.random() * n)

// ---------- knobs do mapeamento ----------
const PPL = Number(process.env.PPL) || 2          // pontos de atributo por nível
const BASEPTS = Number(process.env.BASEPTS) || 18
const IV = Number(process.env.IV) || 2.2          // multiplicador de aprimoramento (lendário IV)
const KPOW = Number(process.env.KPOW) || 0.6      // peso do stat no PODER (forte, escolha do Mario)
const KDA = Number(process.env.KDA) || 1.0        // peso da DEF na ARMADURA
const KDH = Number(process.env.KDH) || 4.0        // peso da DEF no HP
const HPBASE = Number(process.env.HPBASE) || 100
const HPLVL = Number(process.env.HPLVL) || 4
const PUNCH = Number(process.env.PUNCH) || 0.6     // dial de "punch" (HP global)
const KEV = Number(process.env.KEV) || 0.0026      // AGI → evasão
const EVCAP = Number(process.env.EVCAP) || 0.42

// ---------- MODELO DE ESCALA UNIFORME ----------
// Identidade de classe = MULTIPLICADOR FIXO (a FORMA: glass cannon vs tanque), sobre uma
// BASE que cresce com nível+gear (o seu PODER). levers = perfil × S. Como TUDO escala por
// S (e K também), o combate em qualquer nível é só uma versão escalada do nv50 → o
// equilíbrio do nv50 (spread ~2%) vale em TODOS os níveis.
//
// PROFILE = os perfis equilibrados validados no nv50 BiS (lean-combat-sim). São a FORMA.
const PROFILE = {
  warrior: { power: 102, armor: 160, hp: 438, evade: 0.05 },
  rogue:   { power: 160, armor: 55,  hp: 282, evade: 0.30 },
  mage:    { power: 175, armor: 50,  hp: 312, evade: 0.18 },
  monk:    { power: 132, armor: 120, hp: 316, evade: 0.22 },
}
const CLASSES = PROFILE
// Split do PODER (S) entre NÍVEL e GEAR. wG = quanto do seu poder vem do gear (loop de
// progressão); wL = do nível. Soma 1. Mario quis o gear não-dominante → wL=0.5 wG=0.5.
const wL = process.env.WL !== undefined ? Number(process.env.WL) : 0.5
const wG = 1 - wL

// S(nível, gearScale) ∈ ~[piso, 1]. No nv50 BiS: nível/50=1, gearScale=1 → S=1.
// gearScale: 1 = BiS lendário IV; por padrão acompanha o nível (piso GEARFLOOR).
const GEARFLOOR = process.env.GEARFLOOR !== undefined ? Number(process.env.GEARFLOOR) : 0.25
function scaleOf(level, gearScale) {
  const lvlPart = level / 50
  return wL * lvlPart + wG * gearScale
}
function buildFighter(klass, level, gearScale = GEARFLOOR + (1 - GEARFLOOR) * (level / 50)) {
  const p = PROFILE[klass]
  const S = scaleOf(level, gearScale)
  return {
    klass, level, S,
    power: p.power * S,
    armor: p.armor * S,
    hp: p.hp * S,
    evade: p.evade, // % é invariante de escala
  }
}

// ---------- motor enxuto (== lean-combat-sim, validado) ----------
// K (constante de mitigação) ACOMPANHA o nível: o poder típico cresce com o nível,
// então a referência da armadura também — senão a armadura do tanque vale ~0 cedo.
const LO = 0.55, HI = 1.75, CRIT = 1.6, DIE = 12, K50 = 220
let MITKK = K50
const luck = (r) => { const t = (r - 1) / (DIE - 1); let m = LO + (HI - LO) * t; if (r === DIE) m *= CRIT; return m }
const mit = (d, a) => d * (1 - a / (a + MITKK))
function fight(A, B) {
  let a = { ...A, curHp: A.hp, stam: 6 }, b = { ...B, curHp: B.hp, stam: 6 }
  let att = Math.random() < 0.5 ? a : b, def = att === a ? b : a
  for (let t = 0; t < 400 && a.curHp > 0 && b.curHp > 0; t++) {
    att.stam = Math.min(6, att.stam + 2)
    const dmg = att.power * luck(rnd(DIE))
    let dodged = false
    if (def.stam >= 3 && Math.random() < def.evade) { def.stam -= 3; dodged = true }
    if (!dodged) def.curHp -= Math.max(1, mit(dmg, def.armor))
    ;[att, def] = [def, att]
  }
  return a.curHp <= 0 ? 'B' : b.curHp <= 0 ? 'A' : null
}
function wr(P, Q, n = FIGHTS) { let p = 0, dec = 0; for (let i = 0; i < n; i++) { const w = fight(P, Q); if (w === 'A') { p++; dec++ } else if (w === 'B') dec++ } return dec ? 100 * p / dec : 50 }

const NAMES = Object.keys(CLASSES)
const LBL = { warrior: 'Guer', rogue: 'Ladino', mage: 'Mago', monk: 'Monge' }

for (const level of LEVELS) {
  const F = {}; NAMES.forEach((n) => F[n] = buildFighter(n, level))
  // K escala com S (mesmo S p/ todas as classes no nível) → DR invariante entre níveis.
  MITKK = K50 * F[NAMES[0]].S
  console.log(`\n${'='.repeat(66)}`)
  console.log(`  NÍVEL ${level}  (BiS lendário IV)  |  PPL=${PPL} IV=${IV} KPOW=${KPOW} PUNCH=${PUNCH}`)
  console.log('='.repeat(66))
  console.log(`  ── LEVERS DERIVADOS (S=${F[NAMES[0]].S.toFixed(2)}) ──`)
  NAMES.forEach((n) => { const f = F[n]; console.log(`   ${LBL[n].padEnd(7)} poder ${f.power.toFixed(0).padStart(4)}  armadura ${f.armor.toFixed(0).padStart(4)}  HP ${f.hp.toFixed(0).padStart(4)}  evasão ${(f.evade * 100).toFixed(0).padStart(3)}%`) })

  const tot = {}; NAMES.forEach((n) => tot[n] = [])
  for (let i = 0; i < NAMES.length; i++) for (let j = i + 1; j < NAMES.length; j++) {
    const w = wr(F[NAMES[i]], F[NAMES[j]]); tot[NAMES[i]].push(w); tot[NAMES[j]].push(100 - w)
  }
  const av = NAMES.map((n) => ({ n, v: tot[n].reduce((a, b) => a + b, 0) / 3 })).sort((a, b) => b.v - a.v)
  console.log('\n  ── WIN% POR CLASSE (gear igual) ──')
  av.forEach((x) => console.log(`   ${LBL[x.n].padEnd(7)} ${x.v.toFixed(1).padStart(5)}%  ${'▇'.repeat(Math.round(x.v / 2))}`))
  const sp = av[0].v - av[av.length - 1].v
  console.log(`\n  ➤ SPREAD: ${sp.toFixed(1)} pts   ${sp <= 5 ? '✅ ≤5%' : sp <= 8 ? '~ ok' : '⚠️'}`)
}

if (SHOW_GAP) {
  console.log(`\n${'='.repeat(66)}`)
  console.log('  AZARÃO — gear -25% (≈ um tier abaixo) vs BiS, nv50. Espera-se ~33-38%.')
  console.log('='.repeat(66))
  NAMES.forEach((n) => {
    const strong = buildFighter(n, 50, 1), weak = buildFighter(n, 50, 0.75)
    const sW = wr(strong, weak)
    console.log(`   ${LBL[n].padEnd(7)} forte ${sW.toFixed(0)}%  | FRACO ${(100 - sW).toFixed(0)}%`)
  })
}
console.log()
