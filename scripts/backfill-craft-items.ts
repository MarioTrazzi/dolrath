// 🧪 Conserta registros de INGREDIENTES de alquimia e MATERIAIS de forja que foram
// criados antes do sistema de craft (ou reaproveitados por nome no loot) e ficaram
// sem `image` e/ou sem `stats.kind`. Sem esses campos o card do inventário ficava
// sem imagem e sem o botão "Usar na Alquimia/Forja" (ex.: "Flor de Mana").
//
// Item é global e reaproveitado por nome, então UM update por nome conserta o item
// para todos os jogadores. A fonte de verdade é o catálogo (INGREDIENT_CATALOG /
// FORGE_MATERIAL_CATALOG). [[dolrath-alchemy-crafting]]
//
// Dry-run por padrão. Para aplicar de fato: --apply
//   DATABASE_URL=... npx tsx scripts/backfill-craft-items.ts            # dry-run
//   DATABASE_URL=... npx tsx scripts/backfill-craft-items.ts --apply    # grava

import { PrismaClient } from '@prisma/client'
import {
  INGREDIENT_CATALOG,
  FORGE_MATERIAL_CATALOG,
  itemImagePath,
} from '../src/lib/itemCatalog'

const APPLY = process.argv.includes('--apply')
const prisma = new PrismaClient()

type Meta = { kind: 'ingredient' | 'material'; emoji: string; goldValue: number; rarity: string }

const META_BY_NAME = new Map<string, Meta>([
  ...INGREDIENT_CATALOG.map((i) => [i.name, { kind: 'ingredient' as const, emoji: i.emoji, goldValue: i.goldValue, rarity: i.rarity }] as const),
  ...FORGE_MATERIAL_CATALOG.map((m) => [m.name, { kind: 'material' as const, emoji: m.emoji, goldValue: m.goldValue, rarity: m.rarity }] as const),
])

async function main() {
  console.log(`🧪 Backfill de itens de craft — ${APPLY ? 'APLICANDO' : 'DRY-RUN'}`)
  const names = Array.from(META_BY_NAME.keys())
  const items = await prisma.item.findMany({
    where: { name: { in: names }, type: 'CONSUMABLE' },
  })

  let fixed = 0
  let ok = 0
  for (const item of items) {
    const meta = META_BY_NAME.get(item.name)!
    const stats = (item.stats as Record<string, any> | null) ?? {}
    const needsKind = stats.kind !== meta.kind
    const needsImage = !item.image
    if (!needsKind && !needsImage) {
      ok++
      continue
    }
    const reasons = [needsKind && 'stats.kind', needsImage && 'image'].filter(Boolean).join(' + ')
    console.log(`  • ${item.name} — faltando: ${reasons}`)
    if (APPLY) {
      await prisma.item.update({
        where: { id: item.id },
        data: {
          ...(needsImage ? { image: itemImagePath(item.name) } : {}),
          stats: {
            ...stats,
            kind: meta.kind,
            rarity: stats.rarity ?? meta.rarity,
            emoji: stats.emoji ?? meta.emoji,
            sellPrice: stats.sellPrice ?? Math.floor(meta.goldValue * 0.6),
          },
        },
      })
    }
    fixed++
  }

  console.log(`\nResumo: ${items.length} registros de craft encontrados · ${ok} já corretos · ${fixed} ${APPLY ? 'corrigidos' : 'a corrigir'}.`)
  if (!APPLY && fixed > 0) console.log('Rode com --apply para gravar as correções.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
