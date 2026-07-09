// ============================================================
// AUDITORIA DE BUDGET DE STATS — roda: npx tsx scripts/gear-budget-audit.ts
// Compara os pontos de cada item do catálogo com o budget da fórmula
// (ver comentário no topo de itemCatalog.ts) e aponta outliers.
//   pts: 1 = str/agi/int/def/res/con · 0.5 = hp/mp
//   budget arma principal: B = round(11 × F(rarity) × (1 + 0.05×(level−1)))
//   fator por slot (SLOT_FACTOR) × prêmio de fonte (boss +15%)
// ============================================================
import { ITEM_CATALOG } from '../src/lib/itemCatalog'

const PT_WEIGHT: Record<string, number> = { str: 1, agi: 1, int: 1, def: 1, res: 1, con: 1, hp: 0.5, mp: 0.5 }
const F_RARITY: Record<string, number> = { COMMON: 1.0, UNCOMMON: 1.3, RARE: 1.7, EPIC: 2.2, LEGENDARY: 2.9 }

// Fator por tipo de slot, relativo à arma principal (1.0). Ajustar aqui = decisão de design.
const SLOT_FACTOR: Record<string, number> = {
  SWORD: 1.0, AXE: 1.0, DAGGER: 1.0, BOW: 1.0, STAFF: 1.0, GAUNTLET: 1.0,
  PARRY_DAGGER: 0.75, ORB: 0.75, TALISMAN: 0.75, SHIELD: 0.75,
  LIGHT_ARMOR: 1.0, MEDIUM_ARMOR: 1.0, HEAVY_ARMOR: 1.0,
  LIGHT_HELMET: 0.6, HEAVY_HELMET: 0.6,
  LIGHT_GLOVES: 0.6, HEAVY_GLOVES: 0.6,
  LIGHT_BOOTS: 0.6, HEAVY_BOOTS: 0.6,
  BELT: 0.6, RING: 0.5, NECKLACE: 0.5,
}
const BOSS_PREMIUM = 1.15 // dungeon_boss / adventure_boss
const LEVEL_CAP = 25 // o termo de nível satura aqui (ancora o high-end lv28-35 existente)

const pts = (stats: Record<string, any>) =>
  Object.entries(stats || {}).reduce((s, [k, v]) => s + (typeof v === 'number' ? (PT_WEIGHT[k] ?? 0) * v : 0), 0)

const budget = (it: (typeof ITEM_CATALOG)[number]) => {
  const slot = SLOT_FACTOR[it.type] ?? 1.0
  const boss = it.source === 'dungeon_boss' || it.source === 'adventure_boss' ? BOSS_PREMIUM : 1.0
  const g = 1 + 0.05 * (Math.min(it.level, LEVEL_CAP) - 1)
  return 11 * (F_RARITY[it.rarity] ?? 1) * g * slot * boss
}

const rows = ITEM_CATALOG
  .filter((it) => SLOT_FACTOR[it.type] !== undefined)
  .map((it) => {
    const p = pts(it.stats), b = budget(it)
    return { it, p, b, ratio: b > 0 ? p / b : 0 }
  })
  .sort((a, b) => a.ratio - b.ratio)

const OUT = Number(process.env.OUT || 0.15) // tolerância p/ marcar outlier
let outliers = 0
console.log('ratio  pts→bud  lv  rarity      source          type          nome')
for (const { it, p, b, ratio } of rows) {
  const flag = Math.abs(ratio - 1) > OUT
  if (flag) outliers++
  if (flag || process.env.ALL === '1') {
    console.log(
      `${ratio.toFixed(2).padStart(5)}  ${String(Math.round(p)).padStart(3)}→${String(Math.round(b)).padEnd(3)}` +
      ` ${String(it.level).padStart(3)}  ${it.rarity.padEnd(10)} ${String(it.source).padEnd(15)} ${it.type.padEnd(13)} ${it.name}` +
      `  ${JSON.stringify(it.stats)}`
    )
  }
}
console.log(`\n${rows.length} itens auditados · ${outliers} outliers (>±${OUT * 100}%)`)
