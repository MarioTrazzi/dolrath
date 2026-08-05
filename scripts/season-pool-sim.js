#!/usr/bin/env node
// ============================================================
// DOLRATH — POOL DE TEMPORADA (criação + inscrição)
//
// DUAS MOEDAS SEM CONTATO: o jogador paga 2 USDC pelo herói (receita do
// estúdio) e a pool é 100% em DOL — SEASON_ENTRY_DOL por herói, aportado pelo
// estúdio na criação e pago pelo jogador nas inscrições avulsas.
//
// Prova três coisas sobre a premiação:
//   1. a aritmética do enunciado: 100 inscritos → 10.000 DOL, o 20º recupera
//      exatamente os 100 DOL da inscrição e o campeão leva 1.900;
//   2. a soma dos prêmios NUNCA excede a pool, e o não distribuído bate com o
//      cofre de torneios;
//   3. a pool se renova SEM crescimento: uma temporada sem nenhum personagem
//      novo, só com inscrições da base, continua premiando.
//
// Uso: node scripts/season-pool-sim.js
// ============================================================

// Espelho de PVP_SEASON_DOL_SPLIT (src/lib/pvpRewards.ts). Se mudar lá, mude aqui.
const SPLIT = [
  0.190, 0.135, 0.100, 0.080, 0.067,
  0.060, 0.052, 0.045, 0.040, 0.035,
  0.031, 0.028, 0.025, 0.022, 0.020,
  0.018, 0.016, 0.014, 0.012, 0.010,
]

const CREATION_COST_USDC = 2  // receita do estúdio: NFT, imagem por IA, infra
const ENTRY_DOL = 100         // inscrição do herói na temporada (espelho de SEASON_ENTRY_DOL)
const TOURNAMENT_CUT_PCT = 0  // zero no lançamento

const round2 = (n) => Math.round(n * 100) / 100

let failures = 0
function assert(cond, label, detail = '') {
  if (cond) {
    console.log(`   ✅ ${label}`)
  } else {
    failures++
    console.log(`   ❌ ${label} ${detail}`)
  }
}

/** Uma temporada: quem criou personagem + quem se inscreveu avulso. */
function simulateSeason({ creations, purchases, eligible, seeded = 0 }) {
  // Os dois caminhos valem a MESMA inscrição em DOL — quem paga é que muda.
  const fromCreation = creations * ENTRY_DOL
  const fromEntries = purchases * ENTRY_DOL
  const pot = round2(seeded + fromCreation + fromEntries)
  const distributable = round2(pot * (1 - TOURNAMENT_CUT_PCT))

  const payouts = []
  let distributed = 0
  for (let i = 0; i < Math.min(eligible, SPLIT.length); i++) {
    const dol = round2(distributable * SPLIT[i])
    distributed += dol
    payouts.push({ rank: i + 1, dol })
  }
  distributed = round2(distributed)

  return {
    pot,
    // Receita do estúdio, em DÓLAR — nunca entra na pool.
    revenueUsdc: round2(creations * CREATION_COST_USDC),
    payouts,
    distributed,
    toVault: round2(pot - distributed),
  }
}

console.log('🏆 DOLRATH — pool de temporada\n')

console.log(`   Split: ${SPLIT.length} posições, soma ${SPLIT.reduce((a, b) => a + b, 0).toFixed(6)}`)
assert(Math.abs(SPLIT.reduce((a, b) => a + b, 0) - 1) < 1e-9, 'o split soma exatamente 100% da pool')
assert(
  SPLIT.every((p, i) => i === 0 || p <= SPLIT[i - 1]),
  'a curva é monotônica (nenhuma posição paga mais que a de cima)'
)

// ---------- Cenário 1: o enunciado ----------
console.log('\n── Cenário 1: 100 personagens criados, todos disputando ──')
const s1 = simulateSeason({ creations: 100, purchases: 0, eligible: 20 })
console.log(`   Pool: ${s1.pot} DOL   ·   receita do estúdio: ${s1.revenueUsdc} USDC`)
console.log(
  '   ' +
    s1.payouts
      .map((p) => `#${p.rank} ${p.dol}`)
      .join('  ')
      .replace(/(.{78}\s)/g, '$1\n   ')
)
assert(s1.pot === 10000, 'pool = 10.000 DOL com 100 personagens', `(deu ${s1.pot})`)
assert(s1.revenueUsdc === 200, 'estúdio arrecada 200 USDC, e nenhum entra na pool', `(deu ${s1.revenueUsdc})`)
assert(s1.payouts[0].dol === 1900, 'o campeão leva 1.900 DOL', `(deu ${s1.payouts[0].dol})`)
assert(s1.payouts[19].dol === ENTRY_DOL, 'o 20º recupera exatamente a inscrição', `(deu ${s1.payouts[19].dol})`)
assert(s1.distributed <= s1.pot + 0.01, 'a soma dos prêmios não excede a pool')
assert(s1.toVault === 0, 'com 20 elegíveis nada sobra para o cofre', `(sobrou ${s1.toVault})`)

// ---------- Cenário 2: base pequena, sobra vai ao cofre ----------
console.log('\n── Cenário 2: 100 criados, só 8 elegíveis ──')
const s2 = simulateSeason({ creations: 100, purchases: 0, eligible: 8 })
console.log(`   Pool ${s2.pot} · distribuído ${s2.distributed} · cofre de torneios ${s2.toVault}`)
assert(s2.distributed < s2.pot, 'posições vazias não são redistribuídas entre os presentes')
assert(round2(s2.distributed + s2.toVault) === s2.pot, 'distribuído + cofre = pool (nada evapora)')
assert(s2.payouts[0].dol === 1900, 'o campeão continua levando 1.900 (a curva não incha com a sobra)')

// ---------- Cenário 3: temporada 2 SEM crescimento ----------
console.log('\n── Cenário 3: temporada 2, ZERO personagens novos, 80 renovam ──')
const s3 = simulateSeason({ creations: 0, purchases: 80, eligible: 20 })
console.log(`   Pool ${s3.pot} DOL vinda só de inscrições`)
assert(s3.pot === 8000, 'a pool se renova sem nenhum personagem novo', `(deu ${s3.pot})`)
assert(
  s3.payouts[19].dol >= ENTRY_DOL * 0.8,
  'o 20º ainda recupera perto da inscrição',
  `(deu ${s3.payouts[19].dol})`
)
assert(s3.revenueUsdc === 0, 'temporada sem criação não gera receita — a pool gira sozinha')

// ---------- Cenário 4: escala ----------
console.log('\n── Cenário 4: escala (a curva é percentual) ──')
for (const n of [50, 100, 500, 2000]) {
  const s = simulateSeason({ creations: 0, purchases: n, eligible: 20 })
  console.log(`   ${String(n).padStart(4)} inscritos → pool ${String(s.pot).padStart(6)} DOL · #1 ${s.payouts[0].dol} · #20 ${s.payouts[19].dol}`)
}
const big = simulateSeason({ creations: 0, purchases: 2000, eligible: 20 })
assert(
  big.payouts[19].dol === ENTRY_DOL * 20,
  'com 2000 inscritos o 20º leva 20× a inscrição',
  `(deu ${big.payouts[19].dol})`
)

console.log(`\n${failures === 0 ? '✅ Todas as asserções passaram.' : `❌ ${failures} asserção(ões) falharam.`}`)
process.exit(failures === 0 ? 0 : 1)
