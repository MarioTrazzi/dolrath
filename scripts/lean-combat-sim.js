#!/usr/bin/env node
// ============================================================
// DOLRATH — Simulador do MODELO DE COMBATE ENXUTO (3 levers)
//
// Reinício limpo (o late-game-gear-sim acumulou mecânicas demais e ficou caótico
// de calibrar). Aqui só o essencial decidido com o Mario:
//
//  • Dano = poder_da_arma × (1 + stat×k) × SORTE_DO_DADO    (uma fórmula só)
//  • Mitigação UNIFICADA proporcional: DR = arm/(arm+K)     (físico/mágico = flavor da IA)
//  • Defesa = Esquiva (AGI, custa stamina) — bloqueio é a armadura passiva
//  • Cada classe = 3 levers: PODER (dano), ARMADURA (mitigação), VIDA + EVASÃO
//
// 🎲 O DADO É DECISIVO: a sorte é uma banda MULTIPLICATIVA larga, calibrada p/ que
// um lutador ~12% mais fraco ainda vença ~38% das vezes. Isso afrouxa o
// balanceamento: basta as classes ficarem dentro de ~10-15% uma da outra.
//
// Uso:
//   node scripts/lean-combat-sim.js              # matriz das 4 classes
//   node scripts/lean-combat-sim.js --luck       # calibra dado: gap de poder → win%
//   LUCKLO=0.55 LUCKHI=1.75 node scripts/lean-combat-sim.js
// ============================================================

const args = process.argv.slice(2)
const has = (n) => args.includes(`--${n}`)
const FIGHTS = Number((args.find((a) => a.startsWith('--fights=')) || '').split('=')[1]) || 4000
const rnd = (n) => 1 + Math.floor(Math.random() * n)

// ---------- 🎲 O DADO (banda de sorte multiplicativa) ----------
// Uma rolagem mapeia linearmente para [LO, HI] e MULTIPLICA o dano. Banda larga =
// sorte decide mais. Crítico (rolar o máximo) dá um teto extra.
const LUCK_LO = process.env.LUCKLO !== undefined ? Number(process.env.LUCKLO) : 0.55
const LUCK_HI = process.env.LUCKHI !== undefined ? Number(process.env.LUCKHI) : 1.75
const CRIT_MULT = process.env.CRITMULT !== undefined ? Number(process.env.CRITMULT) : 1.6
const DIE = Number(process.env.DIE) || 12
function luckOf(roll) {
  const t = (roll - 1) / (DIE - 1)        // 0..1
  let mult = LUCK_LO + (LUCK_HI - LUCK_LO) * t
  if (roll === DIE) mult *= CRIT_MULT      // crítico: rolagem máxima
  return mult
}

// ---------- Mitigação unificada ----------
const MITK = Number(process.env.MITK) || 220
const mitigate = (dmg, armor) => dmg * (1 - armor / (armor + MITK))

// ============================================================
// PERFIL DAS CLASSES — os 3 LEVERS (já no end-game, nv50 lendário IV).
// PODER = dano da arma+stat;  ARMADURA = mitigação;  HP;  EVASÃO = chance-base de esquiva.
// Estes números REPRESENTAM o resultado de gear+stats e são O que se balanceia.
// Ajustáveis por env (P_/A_/H_/E_<classe>) p/ tunar.
// ============================================================
const N = (v, d) => (v !== undefined ? Number(v) : d)
const CLASSES = {
  // tanque: dano baixo, muita armadura/HP, pouca evasão
  warrior: { power: N(process.env.P_WAR, 100), armor: N(process.env.A_WAR, 260), hp: N(process.env.H_WAR, 2100), evade: N(process.env.E_WAR, 0.05) },
  // glass cannon físico: dano alto, frágil, evasão alta
  rogue:   { power: N(process.env.P_ROG, 168), armor: N(process.env.A_ROG, 60),  hp: N(process.env.H_ROG, 1050), evade: N(process.env.E_ROG, 0.30) },
  // glass cannon: dano alto, frágil, evasão média
  mage:    { power: N(process.env.P_MAG, 175), armor: N(process.env.A_MAG, 55),  hp: N(process.env.H_MAG, 1100), evade: N(process.env.E_MAG, 0.18) },
  // bruiser sustentado: dano médio, durável-médio, evasão média
  monk:    { power: N(process.env.P_MNK, 132), armor: N(process.env.A_MNK, 130), hp: N(process.env.H_MNK, 1450), evade: N(process.env.E_MNK, 0.22) },
}

// Esquiva custa stamina (não dá p/ esquivar todo golpe). Stamina simples por turno.
const STAM_MAX = Number(process.env.STAMMAX) || 6
const STAM_REGEN = Number(process.env.STAMREGEN) || 2
const DODGE_COST = Number(process.env.DODGECOST) || 3

function mkFighter(id, p) {
  return { id, ...p, curHp: p.hp, stam: STAM_MAX }
}

// Uma luta entre dois perfis. Retorna o id do vencedor (ou null = timeout).
function fight(A, B) {
  const a = mkFighter('A', A), b = mkFighter('B', B)
  let att = Math.random() < 0.5 ? a : b
  let def = att === a ? b : a
  for (let turn = 0; turn < 300 && a.curHp > 0 && b.curHp > 0; turn++) {
    att.stam = Math.min(STAM_MAX, att.stam + STAM_REGEN)
    // ataque: poder × sorte
    const roll = rnd(DIE)
    let dmg = att.power * luckOf(roll)
    // defesa: esquiva (se tiver stamina e a chance bater) zera; senão mitiga
    let dodged = false
    if (def.stam >= DODGE_COST && Math.random() < def.evade) { def.stam -= DODGE_COST; dodged = true }
    if (!dodged) def.curHp -= Math.max(1, mitigate(dmg, def.armor))
    ;[att, def] = [def, att]
  }
  if (a.curHp <= 0 && b.curHp <= 0) return null
  if (a.curHp <= 0) return B.id
  if (b.curHp <= 0) return A.id
  return null
}

function winRate(P, Q, n = FIGHTS) {
  let pw = 0, dec = 0
  for (let i = 0; i < n; i++) { const w = fight({ ...P, id: 'P' }, { ...Q, id: 'Q' }); if (w === 'P') { pw++; dec++ } else if (w === 'Q') dec++ }
  return dec ? (100 * pw) / dec : 50
}

// ============================================================
// MODO --luck: calibra o dado. Dois lutadores IDÊNTICOS, um com +X% de PODER.
// Queremos: +12% de poder → ~62% win (azarão ~38%).
// ============================================================
if (has('luck')) {
  console.log(`\n🎲 CALIBRAÇÃO DO DADO  |  banda [${LUCK_LO}, ${LUCK_HI}] crit×${CRIT_MULT} d${DIE}  |  ${FIGHTS} lutas`)
  console.log(`   (alvo: +12% de poder ≈ 62% win, p/ o mais fraco ter ~38% de chance)\n`)
  // BASEHP menor = luta mais CURTA (menos golpes) = sorte importa mais p/ o resultado.
  const base = { power: 140, armor: 120, hp: Number(process.env.BASEHP) || 1400, evade: 0.18 }
  for (const gap of [0, 5, 10, 12, 15, 20, 30]) {
    const strong = { ...base, power: base.power * (1 + gap / 100) }
    const wr = winRate(strong, base)
    const bar = '▇'.repeat(Math.round(wr / 2))
    console.log(`   +${String(gap).padStart(2)}% poder →  ${wr.toFixed(1)}% win  ${bar}`)
  }
  console.log('')
  process.exit(0)
}

// ============================================================
// MATRIZ das 4 classes
// ============================================================
const NAMES = Object.keys(CLASSES)
const LABEL = { warrior: 'Guerreiro', rogue: 'Ladino', mage: 'Mago', monk: 'Monge' }
console.log(`\n${'='.repeat(64)}`)
console.log(`  MODELO ENXUTO — 4 classes  |  dado [${LUCK_LO},${LUCK_HI}] crit×${CRIT_MULT}  |  ${FIGHTS} lutas/par`)
console.log('='.repeat(64))

const wins = {}, games = {}
NAMES.forEach((n) => { wins[n] = 0; games[n] = 0 })
const cell = {}
for (let i = 0; i < NAMES.length; i++) {
  for (let j = i + 1; j < NAMES.length; j++) {
    const A = NAMES[i], B = NAMES[j]
    const wr = winRate({ ...CLASSES[A], id: A }, { ...CLASSES[B], id: B })
    cell[`${A}|${B}`] = wr
    wins[A] += wr; games[A] += 100
    wins[B] += 100 - wr; games[B] += 100
  }
}
console.log(`\n  ── WIN% MÉDIO POR CLASSE ──`)
const ranked = NAMES.map((n) => ({ n, wr: wins[n] / (games[n] / 100) })).sort((a, b) => b.wr - a.wr)
ranked.forEach((r) => {
  const flag = r.wr >= 58 || r.wr <= 42 ? '  ⚠️' : ''
  console.log(`   ${LABEL[r.n].padEnd(10)} ${r.wr.toFixed(1).padStart(5)}%  ${'▇'.repeat(Math.round(r.wr / 2))}${flag}`)
})
const spread = ranked[0].wr - ranked[ranked.length - 1].wr
console.log(`\n  ➤ SPREAD: ${spread.toFixed(1)} pts   ${spread <= 15 ? '✅ dentro da faixa que o dado cobre' : '⚠️ acima de 15'}`)

console.log(`\n  ── CONFRONTOS (linha vs coluna) ──`)
console.log(`   ${''.padEnd(10)}${NAMES.map((n) => LABEL[n].slice(0, 6).padStart(8)).join('')}`)
NAMES.forEach((A) => {
  const row = NAMES.map((B) => A === B ? '   —  '.padStart(8) : `${(cell[`${A}|${B}`] ?? 100 - cell[`${B}|${A}`]).toFixed(0).padStart(7)}%`).join('')
  console.log(`   ${LABEL[A].padEnd(10)}${row}`)
})
console.log(`\n${'='.repeat(64)}\n`)
