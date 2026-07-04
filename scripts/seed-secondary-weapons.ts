// Semeia (upsert por nome) os novos offhands PARRY_DAGGER (Ladino) e TALISMAN (Monge)
// no banco. Mesma forma de stats do /api/seed. Rodar com DATABASE_URL_NEON.
//   DATABASE_URL="$DATABASE_URL_NEON" npx tsx scripts/seed-secondary-weapons.ts
import { PrismaClient, ItemType } from '@prisma/client'
import { ITEM_CATALOG, itemImagePath } from '../src/lib/itemCatalog'

const prisma = new PrismaClient()

async function main() {
  const targets = ITEM_CATALOG.filter((i) => i.type === 'PARRY_DAGGER' || i.type === 'TALISMAN')
  let created = 0
  let updated = 0
  for (const item of targets) {
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
      console.log(`🔄 ${item.rarity.padEnd(9)} ${item.name}`)
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
      console.log(`✨ ${item.rarity.padEnd(9)} ${item.name}`)
    }
  }
  console.log(`\nTotal: ${targets.length} · criados ${created} · atualizados ${updated}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
