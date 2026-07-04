#!/usr/bin/env node
// ============================================================
// DOLRATH — Simulador de RENDIMENTO da COLETA e FAZENDA (idle)
//
// Valida a ordem de grandeza do faucet de gold/dia da Coleta contra o teto
// DUNGEON_DAILY_GOLD_CAP (5k-11k/dia via masmorra) e projeta o tempo até
// destravar os perks de Coleta/Fazenda (nível 10/20 de coleta, cercado nv5).
//
// Modela o loop de coleta (tique de 15 min, 3 stamina/tique, budget diário de
// stamina igual ao de farm-progression-sim.js) e a colheita da fazenda
// (canteiros + poço + cercado, crescimento reduzido pelo nível).
//
// Uso:
//   node scripts/gathering-yield-sim.js
//   DAYS=60 node scripts/gathering-yield-sim.js
// ============================================================

const DAYS = Number(process.env.DAYS) || 30

// ---- Stamina (staminaSystem.ts) — mesmo budget diário do farm-progression-sim ----
const STAMINA_CAP = 100
const STAMINA_REGEN_PER_DAY = 192
const DAILY_BUDGET = Number(process.env.BUDGET) || (STAMINA_CAP + STAMINA_REGEN_PER_DAY) * 0.75

// ---- Coleta (gathering.ts) ----
const TICK_STAMINA = 3
const XP_PER_TICK = 5

// professionSystem.ts (duplicado aqui em JS puro — os arquivos-fonte são TS)
function professionXpForLevel(level) {
  const lv = Math.max(1, Math.min(50, Math.floor(level)))
  return Math.round(60 * Math.pow(lv - 1, 1.5))
}
function getProfessionLevel(xp) {
  const total = Math.max(0, Math.floor(xp))
  let level = 1
  while (level < 50 && total >= professionXpForLevel(level + 1)) level++
  return level
}
function gatherYieldPerTick(level) { return 1 + 0.04 * Math.max(1, level) }
function farmPlotCount(level) { return Math.min(6, 2 + Math.floor(Math.max(1, level) / 5)) }
function farmGrowthMult(level) { return Math.max(0.75, 1 - 0.01 * Math.max(1, level)) }

// Valor médio de gold por item (INGREDIENT_CATALOG/FORGE_MATERIAL_CATALOG comuns/incomuns).
const AVG_ITEM_GOLD = 9 // média ponderada dos comuns de chão (Água Pura 6 ... Ferro 12)
const SELL_FRACTION = 0.6 // sellPrice = 60% do goldValue (padrão do catálogo)

function simulateGathering(days) {
  let xp = 0
  let ticksPerDay = 0
  const rows = []
  for (let day = 1; day <= days; day++) {
    const level = getProfessionLevel(xp)
    const budget = DAILY_BUDGET
    const ticks = Math.floor(budget / TICK_STAMINA)
    ticksPerDay = ticks
    const itemsToday = ticks * gatherYieldPerTick(level)
    const xpToday = ticks * XP_PER_TICK
    xp += xpToday
    const goldToday = itemsToday * AVG_ITEM_GOLD * SELL_FRACTION
    rows.push({ day, level, ticks, itemsToday: Math.round(itemsToday), goldToday: Math.round(goldToday) })
  }
  return rows
}

function daysToGatherLevel(targetLevel) {
  let xp = 0
  for (let day = 1; day <= 365; day++) {
    const level = getProfessionLevel(xp)
    if (level >= targetLevel) return day - 1
    const ticks = Math.floor(DAILY_BUDGET / TICK_STAMINA)
    xp += ticks * XP_PER_TICK
  }
  return Infinity
}

// Trigo (2h) é o cultivo mais rápido — o jogador dedicado replanta assim que
// colhe. Cada ciclo (plantar+colher) custa 2×FARM_ACTION_STAMINA=4 e rende
// farmXp=8; o nº de ciclos/dia por canteiro é limitado pelo TEMPO de
// crescimento (24h / growHours) E pela STAMINA disponível (rateada entre
// canteiros), o que era ignorado na 1ª versão deste sim (subestimava ~10×).
function daysToFarmLevel(targetLevel) {
  let xp = 0
  const CYCLE_STAMINA = 4 // plantar (2) + colher (2)
  const TRIGO_XP = 8
  const TRIGO_GROW_HOURS_BASE = 2
  for (let day = 1; day <= 730; day++) {
    const level = getProfessionLevel(xp)
    if (level >= targetLevel) return day - 1
    const plots = farmPlotCount(level)
    const growHours = TRIGO_GROW_HOURS_BASE * farmGrowthMult(level)
    const cyclesPerPlotByTime = Math.floor(24 / growHours)
    const staminaCycles = Math.floor(DAILY_BUDGET / CYCLE_STAMINA)
    const cyclesToday = Math.min(plots * cyclesPerPlotByTime, staminaCycles)
    xp += cyclesToday * TRIGO_XP
  }
  return Infinity
}

console.log('=== ⛏️ COLETA — rendimento e faucet de gold ===')
console.log(`Budget diário de stamina: ${DAILY_BUDGET.toFixed(0)} (tique custa ${TICK_STAMINA})`)
const rows = simulateGathering(DAYS)
;[1, 7, 14, 30].filter((d) => d <= DAYS).forEach((d) => {
  const r = rows[d - 1]
  console.log(
    `Dia ${String(d).padStart(2)}: Nv.${String(r.level).padStart(2)} coleta · ${r.ticks} tiques/dia · ~${r.itemsToday} itens/dia · ~${r.goldToday} gold/dia (se vendido)`
  )
})
const capLow = 5000, capHigh = 11000
const lastGold = rows[rows.length - 1].goldToday
console.log(
  `\nFaucet de coleta no dia ${DAYS}: ~${lastGold} gold/dia — ${
    lastGold < capLow * 0.1 ? 'BEM abaixo' : lastGold < capLow ? 'abaixo' : 'ATENÇÃO: próximo/acima'
  } do teto de masmorra (${capLow}-${capHigh}/dia). ${lastGold < capLow * 0.1 ? '✅ Coleta não compete com o faucet principal.' : ''}`
)

console.log('\n=== ⛏️ Marcos de nível de Coleta ===')
;[10, 20, 25].forEach((lv) => console.log(`Nv. ${lv} (destrava recursos da faixa): ~dia ${daysToGatherLevel(lv)}`))

console.log('\n=== 🌾 Marcos de nível de Fazenda (replantio ativo de Trigo) ===')
;[5, 10, 20].forEach((lv) => {
  const plots = farmPlotCount(lv - 1)
  console.log(`Nv. ${lv}${lv === 5 ? ' (destrava Cercado)' : ''}: ~dia ${daysToFarmLevel(lv)} (com ${plots} canteiros antes de upar)`)
})

console.log('\n=== 🌾 Crescimento de cultivo por nível de Fazenda ===')
;[1, 10, 25, 50].forEach((lv) => {
  const mult = farmGrowthMult(lv)
  console.log(`Nv. ${lv}: ${(mult * 100).toFixed(0)}% do tempo base (Trigo 2h → ${(2 * mult).toFixed(2)}h)`)
})
