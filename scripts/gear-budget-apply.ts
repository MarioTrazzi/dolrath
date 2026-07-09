// ============================================================
// APLICA O BUDGET DE STATS aos outliers do catálogo — one-off da Fase 2.
//   npx tsx scripts/gear-budget-apply.ts          → dry-run (imprime old→new)
//   APPLY=1 npx tsx scripts/gear-budget-apply.ts  → reescreve itemCatalog.ts
// Rescala proporcionalmente os stats numéricos de cada item que desvia >±10%
// do budget (mesma fórmula do gear-budget-audit.ts), preservando a MISTURA de
// stats do item e o specialEffect (só os números na linha `stats: {...}` mudam).
// ============================================================
import { readFileSync, writeFileSync } from 'fs'
import { ITEM_CATALOG } from '../src/lib/itemCatalog'

const PT_WEIGHT: Record<string, number> = { str: 1, agi: 1, int: 1, def: 1, res: 1, con: 1, hp: 0.5, mp: 0.5 }
const F_RARITY: Record<string, number> = { COMMON: 1.0, UNCOMMON: 1.3, RARE: 1.7, EPIC: 2.2, LEGENDARY: 2.9 }
const SLOT_FACTOR: Record<string, number> = {
  SWORD: 1.0, AXE: 1.0, DAGGER: 1.0, BOW: 1.0, STAFF: 1.0, GAUNTLET: 1.0,
  PARRY_DAGGER: 0.75, ORB: 0.75, TALISMAN: 0.75, SHIELD: 0.75,
  LIGHT_ARMOR: 1.0, MEDIUM_ARMOR: 1.0, HEAVY_ARMOR: 1.0,
  LIGHT_HELMET: 0.6, HEAVY_HELMET: 0.6,
  LIGHT_GLOVES: 0.6, HEAVY_GLOVES: 0.6,
  LIGHT_BOOTS: 0.6, HEAVY_BOOTS: 0.6,
  BELT: 0.6, RING: 0.5, NECKLACE: 0.5,
}
const BOSS_PREMIUM = 1.15
const LEVEL_CAP = 25
const TOLERANCE = 0.10

const pts = (stats: Record<string, any>) =>
  Object.entries(stats || {}).reduce((s, [k, v]) => s + (typeof v === 'number' ? (PT_WEIGHT[k] ?? 0) * v : 0), 0)
const budget = (it: (typeof ITEM_CATALOG)[number]) => {
  const slot = SLOT_FACTOR[it.type]
  if (slot === undefined) return null
  const boss = it.source === 'dungeon_boss' || it.source === 'adventure_boss' ? BOSS_PREMIUM : 1.0
  const g = 1 + 0.05 * (Math.min(it.level, LEVEL_CAP) - 1)
  return 11 * (F_RARITY[it.rarity] ?? 1) * g * slot * boss
}

const FILE = new URL('../src/lib/itemCatalog.ts', import.meta.url).pathname
const lines = readFileSync(FILE, 'utf8').split('\n')

function findStatsLine(name: string): number {
  const needle1 = `name: '${name}'`
  const needle2 = `name: "${name}"`
  const i = lines.findIndex((l) => l.includes(needle1) || l.includes(needle2))
  if (i < 0) throw new Error(`não achei o item: ${name}`)
  for (let j = i; j < i + 6; j++) {
    if (/^\s*stats: \{.*\},/.test(lines[j])) return j
  }
  throw new Error(`não achei a linha stats de: ${name}`)
}

let changed = 0
for (const it of ITEM_CATALOG) {
  const b = budget(it)
  if (b == null) continue
  const p = pts(it.stats)
  if (p <= 0 || Math.abs(p / b - 1) <= TOLERANCE) continue

  const scale = b / p
  const news: Record<string, number> = {}
  for (const [k, v] of Object.entries(it.stats)) {
    if (typeof v === 'number' && PT_WEIGHT[k] !== undefined) news[k] = Math.max(1, Math.round(v * scale))
  }
  const li = findStatsLine(it.name)
  let line = lines[li]
  for (const [k, v] of Object.entries(news)) {
    const re = new RegExp(`(\\b${k}: )\\d+(?:\\.\\d+)?`)
    if (!re.test(line)) throw new Error(`chave ${k} não achada na linha de ${it.name}`)
    line = line.replace(re, `$1${v}`)
  }
  console.log(`${it.name} [${it.type} ${it.rarity} lv${it.level}] ${Math.round(p)}→${Math.round(b)} pts`)
  console.log(`   antes:  ${lines[li].trim()}`)
  console.log(`   depois: ${line.trim()}`)
  lines[li] = line
  changed++
}

if (process.env.APPLY === '1') {
  writeFileSync(FILE, lines.join('\n'))
  console.log(`\n✍️  ${changed} itens reescritos em itemCatalog.ts`)
} else {
  console.log(`\n(dry-run) ${changed} itens seriam alterados — rode com APPLY=1 para gravar`)
}
