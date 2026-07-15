#!/usr/bin/env node
// ============================================================
// 🏟️ DOLRATH — SIM DO PEER DE TREINO (winrate por oponente × classe × progressão)
//
// O treino promete uma dificuldade no rótulo ("Fácil", "Médio"…). Este sim é quem
// verifica se a promessa é verdade — e é a ferramenta que calibra o `difficultyMult`
// de cada oponente em src/lib/trainingOpponents.ts.
//
// MODELO (idêntico ao servidor, importado — zero constante duplicada):
//   • o peer ESPELHA o jogador: mesmo nível, mesmos atributos, mesmo gearTier;
//   • a classe do peer dá a identidade (PROFILE: o Lobo esquiva, o Golem tanka);
//   • `difficultyMult` escala power/armor/hp/K juntos (CM.transformLevers), igual ao join.
//
// ⚠️ Por que o mult é POR OPONENTE e não um número só: o mesmo multiplicador NÃO
// significa a mesma dificuldade em classes diferentes. O PROFILE do guerreiro
// (armor 160 / hp 438) a ×1.0 dá ~33% ao jogador; o ladino a ×1.0 dá ~46%.
//
// Uso:
//   node scripts/training-peer-sim.js              (matriz + veredito vs os alvos)
//   node scripts/training-peer-sim.js --solve      (resolve o mult ideal p/ cada alvo)
//   FIGHTS=4000 node scripts/training-peer-sim.js
// ============================================================

/* eslint-disable no-console */
const CM = require('../server/combatModel')
const { TRAINING_OPPONENTS } = require('../server/trainingOpponents')

const FIGHTS = Number(process.env.FIGHTS ?? 2000)
const SOLVE = process.argv.includes('--solve')

// Alvo de winrate por rótulo — é o CONTRATO que o jogador lê no card do lobby.
const TARGETS = {
  'Fácil': 70,
  'Médio': 50,
  'Difícil': 30,
  'Muito difícil': 15,
  'Imbatível': 1,
}
const TOLERANCE = 6 // pontos percentuais

// Pontos da progressão que importam: o começo cru (onde o peer antigo matava em 1 hit),
// o meio e o teto. O espelho tem que entregar o MESMO winrate nos três.
const STAGES = [
  { label: 'nv4 cru', level: 4, gearTier: 0.0, attrs: { str: 12, agi: 10, int: 8, def: 10 } },
  { label: 'nv20 médio', level: 20, gearTier: 0.35, attrs: { str: 18, agi: 16, int: 16, def: 16 } },
  { label: 'nv50 BiS', level: 50, gearTier: 1.0, attrs: { str: 30, agi: 20, int: 20, def: 24 } },
]
const PLAYER_CLASSES = ['warrior', 'rogue', 'mage', 'monk']

// Um duelo com o kit real: alterna Golpe (d6) e Ataque de Classe (d8), defesa passiva.
// O peer não transforma nem usa especiais (decisão de design: o treino é p/ teste).
function duel(pLev, mLev) {
  let pHp = pLev.hp
  let mHp = mLev.hp
  let turn = 0
  let actions = 0
  const hit = (atk, def, kind) => {
    const r = CM.resolveHit(
      { power: atk.power * CM.ATTACKS[kind].powerMult },
      { armor: def.armor, K: def.K, evade: def.evade, block: def.block },
      { defense: 'passive', sides: CM.PVE_DIE[kind] },
    )
    return r.dodged ? 0 : r.damage
  }
  while (pHp > 0 && mHp > 0 && actions < 300) {
    const kind = actions % 2 === 0 ? 'basic' : 'weapon'
    if (turn === 0) mHp -= hit(pLev, mLev, kind)
    else pHp -= hit(mLev, pLev, kind)
    turn ^= 1
    actions++
  }
  return pHp > 0
}

function winrate(playerCls, peerCls, mult, stage, n = FIGHTS) {
  const p = CM.computeLevers(playerCls, stage.level, stage.gearTier, stage.attrs)
  const peerBase = CM.computeLevers(peerCls, stage.level, stage.gearTier, stage.attrs)
  const m = CM.transformLevers(peerBase, mult)
  let wins = 0
  for (let i = 0; i < n; i++) if (duel(p, m)) wins++
  return (100 * wins) / n
}

const avgWinrate = (peerCls, mult, n = FIGHTS) => {
  let sum = 0
  let count = 0
  for (const pc of PLAYER_CLASSES) {
    for (const st of STAGES) {
      sum += winrate(pc, peerCls, mult, st, n)
      count++
    }
  }
  return sum / count
}

if (SOLVE) {
  console.log('🎯 MULT IDEAL por oponente e alvo (bisseção sobre o winrate médio)\n')
  const alvos = Object.entries(TARGETS)
  console.log('oponente'.padEnd(26) + alvos.map(([l]) => l.padStart(16)).join(''))
  for (const o of TRAINING_OPPONENTS) {
    const row = alvos.map(([, target]) => {
      let lo = 0.3
      let hi = 3.0
      for (let i = 0; i < 13; i++) {
        const mid = (lo + hi) / 2
        if (avgWinrate(o.combatClass, mid, 800) > target) lo = mid
        else hi = mid
      }
      const m = (lo + hi) / 2
      return `x${m.toFixed(2)}`.padStart(16)
    })
    console.log(`${o.emoji} ${o.name} (${o.combatClass})`.padEnd(26) + row.join(''))
  }
  process.exit(0)
}

console.log('🏟️ DOLRATH — PEER DE TREINO: o rótulo bate com a realidade?')
console.log(`   ${FIGHTS} lutas/célula · peer espelha nível+atributos+gearTier do jogador\n`)
console.log('oponente'.padEnd(24) + 'mult'.padStart(6) + STAGES.map((s) => s.label.padStart(11)).join('') + 'média'.padStart(8) + '  alvo   veredito')

let failures = 0
for (const o of TRAINING_OPPONENTS) {
  const target = TARGETS[o.difficultyLabel]
  // média por estágio (sobre as 4 classes do jogador) — mostra se o espelho segura a
  // dificuldade constante ao longo da progressão, que é o ponto do redesenho.
  const byStage = STAGES.map((st) => {
    const rs = PLAYER_CLASSES.map((pc) => winrate(pc, o.combatClass, o.difficultyMult, st))
    return rs.reduce((a, b) => a + b, 0) / rs.length
  })
  const avg = byStage.reduce((a, b) => a + b, 0) / byStage.length
  const off = Math.abs(avg - target)
  const ok = off <= TOLERANCE
  if (!ok) failures++
  console.log(
    `${o.emoji} ${o.name}`.padEnd(24) +
      `x${o.difficultyMult}`.padStart(6) +
      byStage.map((w) => `${w.toFixed(0)}%`.padStart(11)).join('') +
      `${avg.toFixed(0)}%`.padStart(8) +
      `  ~${target}%`.padStart(7) +
      (ok ? '   ✅' : `   ❌ ${off.toFixed(0)}pts fora`),
  )
}

// Espelho funcionando = winrate ~constante entre os estágios. Se variar muito, algum
// inflador voltou (gear fixo, attrs sintéticos) ou o attrTilt desbalanceou a escala.
console.log('\n📐 spread entre estágios (o espelho deve manter a dificuldade constante):')
for (const o of TRAINING_OPPONENTS) {
  const byStage = STAGES.map((st) => {
    const rs = PLAYER_CLASSES.map((pc) => winrate(pc, o.combatClass, o.difficultyMult, st))
    return rs.reduce((a, b) => a + b, 0) / rs.length
  })
  const spread = Math.max(...byStage) - Math.min(...byStage)
  console.log(`   ${o.emoji} ${o.name.padEnd(22)} spread ${spread.toFixed(0)}pts ${spread <= 10 ? '✅' : '⚠️'}`)
}

console.log(
  failures === 0
    ? '\n✅ Todos os rótulos dentro de ±' + TOLERANCE + 'pts do alvo.'
    : `\n❌ ${failures} oponente(s) fora do alvo — recalibre com --solve.`,
)
process.exit(failures === 0 ? 0 : 1)
