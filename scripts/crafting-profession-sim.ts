#!/usr/bin/env ts-node
// ============================================================
// DOLRATH — SIM das profissões de CRAFT (Forja/Alquimia)
//
// Valida os números de src/lib/craftingProfession.ts antes do deploy:
//   1. Chance de sucesso por raridade × nível (com minLevel e cap)
//   2. XP por craft e quantos crafts levam a cada marco de nível
//   3. Custo ESPERADO por item produzido (materiais/gold perdidos nas falhas)
//      usando as receitas REAIS (FORGE_RECIPES / POTION_RECIPES)
//   4. Rolagem Monte-Carlo de lote (sanidade do rollCraftBatch)
//
// Uso: npm run sim:crafting
// ============================================================

import {
  CRAFT_BASE_CHANCE,
  CRAFT_MIN_LEVEL,
  CRAFT_XP,
  CRAFT_FAIL_XP_RATIO,
  getCraftChance,
  getCraftMinLevel,
  getCraftXp,
  rollCraftBatch,
} from '@/lib/craftingProfession'
import { professionXpForLevel, PROFESSION_MAX_LEVEL } from '@/lib/professionSystem'
import { POTION_RECIPES } from '@/lib/alchemy'
import { FORGE_RECIPES } from '@/lib/forge'
import type { Rarity } from '@/lib/itemCatalog'

const RARITIES: Rarity[] = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC']
const pct = (x: number) => `${(x * 100).toFixed(0)}%`

// ---------- 1. Chance por raridade × nível ----------
console.log('\n=== CHANCE DE SUCESSO por raridade × nível (cap 95%) ===')
const levels = [1, 5, 10, 12, 15, 20, 25, 30, 40, 50]
console.log(['nível', ...RARITIES.map((r) => r.padStart(9))].join(' | '))
for (const lv of levels) {
  const row = RARITIES.map((r) =>
    lv < getCraftMinLevel(r) ? '🔒'.padStart(8) : pct(getCraftChance(r, lv)).padStart(9),
  )
  console.log([String(lv).padStart(5), ...row].join(' | '))
}

// ---------- 2. Crafts até cada marco de nível ----------
console.log('\n=== PROGRESSÃO: crafts p/ chegar a cada marco (craftando a melhor receita liberada) ===')
console.log('(XP esperado/craft pondera sucesso e falha pela chance do nível corrente)')
const marks = [5, 10, 12, 15, 20, 25, 30, PROFESSION_MAX_LEVEL]
{
  // Simula determinicamente: em cada nível, crafta a raridade mais alta liberada.
  let xp = 0
  let crafts = 0
  let mi = 0
  const bestRarity = (lv: number): Rarity =>
    [...RARITIES].reverse().find((r) => lv >= getCraftMinLevel(r)) ?? 'COMMON'
  while (mi < marks.length && crafts < 1_000_000) {
    let lv = 1
    while (lv < PROFESSION_MAX_LEVEL && xp >= professionXpForLevel(lv + 1)) lv++
    if (lv >= marks[mi]) {
      console.log(`  nv${String(marks[mi]).padStart(2)} → ~${crafts} crafts (${xp} XP)`)
      mi++
      continue
    }
    const r = bestRarity(lv)
    const c = getCraftChance(r, lv)
    xp += Math.round(c * getCraftXp(r, true) + (1 - c) * getCraftXp(r, false))
    crafts++
  }
}

// ---------- 3. Custo esperado por item produzido (receitas reais) ----------
console.log('\n=== CUSTO ESPERADO por item PRODUZIDO (gold da taxa; falhas incluídas) ===')
console.log('custo esperado = taxa / chance  (materiais idem: ×1/chance)')
for (const { label, recipes } of [
  { label: '⚗️ Alquimia', recipes: POTION_RECIPES.map((r) => ({ name: r.outputName, rarity: r.rarity, gold: r.goldCost })) },
  {
    label: '⚒️ Forja (gear)',
    recipes: FORGE_RECIPES.filter((r) => r.kind === 'gear').map((r) => ({ name: r.outputName, rarity: r.rarity, gold: r.goldCost })),
  },
]) {
  console.log(`\n${label}:`)
  for (const rec of recipes) {
    const min = getCraftMinLevel(rec.rarity)
    const cMin = getCraftChance(rec.rarity, min)
    const cMax = getCraftChance(rec.rarity, PROFESSION_MAX_LEVEL)
    console.log(
      `  ${rec.name.padEnd(28)} ${rec.rarity.padEnd(9)} nv${String(min).padStart(2)}+  taxa ${String(rec.gold).padStart(4)}g` +
        `  esperado ${Math.round(rec.gold / cMin)}g (nv${min}) → ${Math.round(rec.gold / cMax)}g (nv50)` +
        `  [${pct(cMin)} → ${pct(cMax)}]`,
    )
  }
}

// ---------- 4. Monte-Carlo do lote ----------
console.log('\n=== MONTE-CARLO rollCraftBatch (10.000 lotes de 10, UNCOMMON nv5 → 75%) ===')
{
  let tot = 0
  const N = 10_000
  for (let i = 0; i < N; i++) tot += rollCraftBatch('UNCOMMON', 5, 10).succeeded
  console.log(`  média de sucessos por lote de 10: ${(tot / N).toFixed(2)} (esperado 7.50)`)
}

console.log('\nTabelas-fonte:', { CRAFT_BASE_CHANCE, CRAFT_MIN_LEVEL, CRAFT_XP, CRAFT_FAIL_XP_RATIO })
