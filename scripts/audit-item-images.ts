// 🔍 Auditoria: quais itens já têm imagem (public/items/<slug>.webp) e quais faltam.
// Varre TODOS os catálogos (equipamento, consumível, ingrediente de alquimia,
// material de forja, pedras) e cruza com os arquivos .webp + o manifest.
//   npx tsx scripts/audit-item-images.ts
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import {
  ITEM_CATALOG, CONSUMABLE_CATALOG, INGREDIENT_CATALOG, FORGE_MATERIAL_CATALOG,
  PROCESSED_CATALOG, FOOD_CATALOG, SEED_CATALOG, TOOL_CATALOG,
  itemImageSlug,
} from '../src/lib/itemCatalog'

const STONES = [
  'Pedra Negra (Arma)', 'Pedra Negra (Armadura)',
  'Pedra Negra Mágica Concentrada (Arma)', 'Pedra Negra Mágica Concentrada (Armadura)',
]
const LEGACY_CONSUMABLES = ['Poção de Mana Grande', 'Elixir de Energia', 'Elixir Maior', 'Poção de Reviver']

const manifest: Record<string, unknown> = existsSync('scripts/item-image-manifest.json')
  ? JSON.parse(readFileSync('scripts/item-image-manifest.json', 'utf8'))
  : {}

type Row = { name: string; group: string }
const groups: Row[] = [
  ...ITEM_CATALOG.map((i) => ({ name: i.name, group: 'EQUIP' })),
  ...CONSUMABLE_CATALOG.map((c) => ({ name: c.name, group: 'CONSUMÍVEL' })),
  ...LEGACY_CONSUMABLES.map((n) => ({ name: n, group: 'CONSUMÍVEL (legado)' })),
  ...STONES.map((n) => ({ name: n, group: 'PEDRA' })),
  ...INGREDIENT_CATALOG.map((i) => ({ name: i.name, group: 'INGREDIENTE (alquimia)' })),
  ...FORGE_MATERIAL_CATALOG.map((m) => ({ name: m.name, group: 'MATERIAL (forja)' })),
  ...PROCESSED_CATALOG.map((p) => ({ name: p.name, group: 'PROCESSADO (bancada)' })),
  ...FOOD_CATALOG.map((f) => ({ name: f.name, group: 'COMIDA (culinária)' })),
  ...SEED_CATALOG.map((s) => ({ name: s.name, group: 'SEMENTE (fazenda)' })),
  ...TOOL_CATALOG.map((t) => ({ name: t.name, group: 'FERRAMENTA/TRAJE (coleta)' })),
]

const has = (name: string) => existsSync(join('public', 'items', `${itemImageSlug(name)}.webp`))

const byGroup = new Map<string, { ok: string[]; miss: string[] }>()
for (const r of groups) {
  const g = byGroup.get(r.group) ?? { ok: [], miss: [] }
  ;(has(r.name) ? g.ok : g.miss).push(r.name)
  byGroup.set(r.group, g)
}

let totalOk = 0, totalMiss = 0
for (const [group, { ok, miss }] of byGroup) {
  totalOk += ok.length; totalMiss += miss.length
  console.log(`\n=== ${group} — ${ok.length} com imagem, ${miss.length} SEM ===`)
  if (miss.length) console.log('  ❌ FALTAM:\n' + miss.map((n) => `     · ${n}`).join('\n'))
}
console.log(`\n──────────\nTOTAL: ${totalOk} com imagem, ${totalMiss} SEM imagem.`)
console.log(`Manifest registra ${Object.keys(manifest).length} nomes.`)
