// 🧪 Seed idempotente dos consumíveis do CONSUMABLE_CATALOG (fonte única).
// Insere/atualiza cada consumível na tabela Item (type CONSUMABLE), com subtype,
// imagem (/items/<slug>.webp) e metadados (source/rarity) dentro de stats — assim
// a /store mostra os de loja (source 'shop') e esconde os de masmorra/aventura.
//
// Rodar: DATABASE_URL=... npx tsx seed-consumable-catalog.ts

import { PrismaClient, ItemType, ConsumableSubtype } from '@prisma/client'
import { CONSUMABLE_CATALOG, itemImagePath } from './src/lib/itemCatalog'

const prisma = new PrismaClient()

async function main() {
  console.log(`🧪 Semeando ${CONSUMABLE_CATALOG.length} consumíveis do catálogo...\n`)
  let created = 0
  let updated = 0

  for (const c of CONSUMABLE_CATALOG) {
    const stats = {
      ...c.stats,
      rarity: c.rarity,
      source: c.source,
      adventureBoss: c.adventureBoss ?? null,
      sellPrice: Math.floor(c.goldPrice * 0.6),
    }

    const data = {
      description: c.description,
      type: ItemType.CONSUMABLE,
      subtype: c.subtype as ConsumableSubtype,
      level: c.level,
      goldPrice: c.goldPrice,
      image: itemImagePath(c.name),
      stats,
    }

    const existing = await prisma.item.findFirst({ where: { name: c.name } })
    if (existing) {
      await prisma.item.update({ where: { id: existing.id }, data })
      updated++
      console.log(`  🔄 [${c.rarity.padEnd(9)}] ${c.name} (${c.source})`)
    } else {
      await prisma.item.create({ data: { name: c.name, ...data } })
      created++
      console.log(`  ✨ [${c.rarity.padEnd(9)}] ${c.name} (${c.source})`)
    }
  }

  console.log(`\n✅ Concluído: ${created} criados, ${updated} atualizados.`)
}

main()
  .catch((e) => { console.error('❌', e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
