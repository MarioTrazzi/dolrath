// ✅ Checagem de completude do mapa EN dos catálogos (i18n P2).
// Varre TODOS os catálogos nomeados e acusa entradas sem tradução em
// src/lib/i18n/catalogNames.ts (nome ou specialEffect).
// Rodar: npm run check:i18n

import {
  ITEM_CATALOG,
  CONSUMABLE_CATALOG,
  FOOD_CATALOG,
  INGREDIENT_CATALOG,
  FORGE_MATERIAL_CATALOG,
  PROCESSED_CATALOG,
  SEED_CATALOG,
  TOOL_CATALOG,
} from '../src/lib/itemCatalog'
import { MATERIALS } from '../src/lib/dungeonData'
import { DUNGEONS } from '../src/lib/dungeonAdventures'
import { CATALOG_EN, SPECIAL_EFFECT_EN } from '../src/lib/i18n/catalogNames'

const STONES = [
  'Pedra Negra (Arma)',
  'Pedra Negra (Armadura)',
  'Pedra Negra Mágica Concentrada (Arma)',
  'Pedra Negra Mágica Concentrada (Armadura)',
]

const missingNames: string[] = []
const missingDescs: string[] = []
const missingEffects = new Set<string>()

function checkEntry(name: string, hasDesc: boolean, specialEffect?: unknown) {
  const entry = CATALOG_EN[name]
  if (!entry) missingNames.push(name)
  else if (hasDesc && !entry.descEn) missingDescs.push(name)
  if (typeof specialEffect === 'string' && !SPECIAL_EFFECT_EN[specialEffect]) {
    missingEffects.add(specialEffect)
  }
}

for (const i of [...ITEM_CATALOG, ...TOOL_CATALOG]) checkEntry(i.name, true, i.stats?.specialEffect)
for (const c of [...CONSUMABLE_CATALOG, ...FOOD_CATALOG]) checkEntry(c.name, true)
for (const g of INGREDIENT_CATALOG) checkEntry(g.name, true)
for (const f of FORGE_MATERIAL_CATALOG) checkEntry(f.name, true)
for (const p of PROCESSED_CATALOG) checkEntry(p.name, true)
for (const s of SEED_CATALOG) checkEntry(s.name, true)
for (const s of STONES) checkEntry(s, false)
for (const m of MATERIALS) checkEntry(m.name, true)

// Monstros/masmorras usam nameEn inline (dungeonAdventures) — checa presença.
const missingInline: string[] = []
for (const d of Object.values(DUNGEONS)) {
  if (!d.nameEn) missingInline.push(`dungeon:${d.name}`)
  for (const m of d.monsters) if (!m.nameEn) missingInline.push(`monster:${m.name}`)
  if (!d.boss.nameEn) missingInline.push(`boss:${d.boss.name}`)
  if (!d.boss.titleEn) missingInline.push(`boss-title:${d.boss.name}`)
}

let failed = false
function report(label: string, items: string[]) {
  if (items.length === 0) return
  failed = true
  console.error(`\n❌ ${label} (${items.length}):`)
  for (const i of items) console.error(`   - ${i}`)
}

report('Nomes sem tradução EN (CATALOG_EN)', missingNames)
report('Descrições sem descEn', missingDescs)
report('specialEffect sem tradução (SPECIAL_EFFECT_EN)', Array.from(missingEffects))
report('nameEn/titleEn inline faltando (dungeonAdventures)', missingInline)

if (failed) {
  process.exit(1)
} else {
  console.log('✅ i18n dos catálogos completo: todos os nomes, descrições e efeitos têm EN.')
}
