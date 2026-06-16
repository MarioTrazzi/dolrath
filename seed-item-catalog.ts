// 📦 Seed do catálogo de itens (equipamentos com raridade, raça e masmorra)
// Executar com: npx tsx seed-item-catalog.ts
//
// Insere/atualiza cada item do ITEM_CATALOG na tabela Item. Metadados de
// raridade, restrição de raça e masmorras de origem ficam no JSON `stats`.
// A imagem fica nula de propósito: a UI usa o ícone por tipo (ItemIcon).

import { PrismaClient, ItemType } from '@prisma/client'
import { ITEM_CATALOG, itemImagePath } from './src/lib/itemCatalog'

const prisma = new PrismaClient()

async function seedItemCatalog() {
  console.log(`📦 Semeando ${ITEM_CATALOG.length} itens do catálogo...\n`)

  let created = 0
  let updated = 0

  for (const item of ITEM_CATALOG) {
    const stats = {
      ...item.stats,
      rarity: item.rarity,
      source: item.source,
      build: item.build ?? null,
      adventureBoss: item.adventureBoss ?? null,
      raceRestriction: item.raceRestriction ?? null,
      dungeons: item.dungeons,
      sellPrice: Math.floor(item.goldPrice * 0.6),
    }

    const existing = await prisma.item.findFirst({ where: { name: item.name } })

    if (existing) {
      await prisma.item.update({
        where: { id: existing.id },
        data: {
          description: item.description,
          type: item.type as ItemType,
          level: item.level,
          goldPrice: item.goldPrice,
          image: itemImagePath(item.name),
          stats,
        },
      })
      updated++
      console.log(`  🔄 [${item.rarity.padEnd(9)}] ${item.name}${item.raceRestriction ? ` (${item.raceRestriction})` : ''}`)
    } else {
      await prisma.item.create({
        data: {
          name: item.name,
          description: item.description,
          type: item.type as ItemType,
          level: item.level,
          goldPrice: item.goldPrice,
          image: itemImagePath(item.name),
          stats,
        },
      })
      created++
      console.log(`  ✨ [${item.rarity.padEnd(9)}] ${item.name}${item.raceRestriction ? ` (${item.raceRestriction})` : ''}`)
    }
  }

  console.log(`\n✅ Concluído: ${created} criados, ${updated} atualizados.`)
}

seedItemCatalog()
  .catch((e) => {
    console.error('❌ Erro ao semear catálogo:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
