#!/usr/bin/env ts-node
// ============================================================
// DOLRATH — CUSTO ESPERADO DO APRIMORAMENTO (+8..+15 e PRI..PEN)
//
// Monte Carlo com as tabelas REAIS (getEnhanceChance/getFailstackGainOnFail):
// quantas pedras (básicas até +15, concentradas em PRI..PEN) custa cada nível,
// com a política "failstack acumula até passar". Compara com o drop real:
//   • boss da Floresta: 1-3 Pedras básicas/kill (≈2/kill, ~4-20 kills/dia)
//   • concentrada: 10 básicas + 200g (refino) ou drop pStone das masmorras 3★+
//
// Uso:
//   TS_NODE_TRANSPILE_ONLY=1 npx ts-node --compiler-options \
//     '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' \
//     -r tsconfig-paths/register scripts/enhancement-cost-sim.ts
//   TRIALS=20000 SEED=1 ... idem
// ============================================================

const SEED = Number(process.env.SEED ?? 42)
function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
Math.random = mulberry32(SEED)

import { getEnhanceChance, getFailstackGainOnFail, getLevelLabel, PRI, PEN } from '@/lib/enhancementSystem'

const TRIALS = Number(process.env.TRIALS ?? 10000)

// Sobe UM nível a partir de `level` com failstacks herdados; devolve pedras gastas
// e failstacks restantes. Regra real: falha em DUO+ regride 1 nível (PRI é piso) —
// aqui medimos o CUSTO ATÉ FICAR no nível alvo (regressão refeita conta pedras).
function costToReach(target: number, category: 'WEAPON' | 'ACCESSORY'): { stones: number; fails: number } {
  // começa do nível anterior estável
  let stones = 0, fails = 0, fs = 0
  let level = target - 1
  if (category === 'ACCESSORY' && target === PRI) level = 0
  for (let guard = 0; guard < 100000; guard++) {
    stones++
    const p = getEnhanceChance(category as any, target, fs)
    if (Math.random() < p) return { stones, fails }
    fails++
    fs += getFailstackGainOnFail(target)
    // regressão (DUO+): o nível caiu; precisamos re-subir o nível anterior antes
    // de tentar de novo. Aproximação conservadora: re-subir custa o custo médio
    // do nível anterior — modelado aqui recursivamente de forma amortizada só
    // p/ PRI+1..PEN (abaixo de PRI não há downgrade).
    if (target > PRI) {
      const redo = costToReach(target - 1, category)
      stones += redo.stones
      fails += redo.fails
    }
    if (category === 'ACCESSORY') return { stones: stones + costToReach(target, category).stones, fails } // acessório destrói: recomeça
  }
  return { stones, fails }
}

console.log('⚒️ DOLRATH — custo esperado do aprimoramento (tabelas reais, %s trials/nível)', TRIALS)
console.log('')
console.log('  ARMA/ARMADURA (pedra básica até +15; concentrada em PRI..PEN):')
let cumulative = 0
for (let target = 8; target <= PEN; target++) {
  let sum = 0
  const t = target > PRI ? Math.min(TRIALS, 400) : TRIALS // recursão pesada nos tiers altos
  for (let i = 0; i < t; i++) sum += costToReach(target, 'WEAPON').stones
  const avg = sum / t
  cumulative += avg
  const label = getLevelLabel(target)
  const kind = target >= PRI ? 'concentrada(s)' : 'básica(s)'
  const asBasic = target >= PRI ? ` (≈${Math.round(avg * 10)} básicas via refino 10:1)` : ''
  console.log(`   ${label.padEnd(4)} ~${avg.toFixed(1)} ${kind}${asBasic}`)
}
console.log('')
console.log('  Leitura: +8→+15 acumulado por PEÇA ≈ soma dos níveis; set de 6 peças ≈ 6×.')
console.log('  Boss Floresta ≈ 2 Pedras básicas/abate (1-3); concentrada = 10 básicas + 200g.')
