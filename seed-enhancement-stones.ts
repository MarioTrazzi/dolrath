// ⚒️ Seed das pedras de aprimoramento (estilo Black Desert)
// Executar com: npx tsx seed-enhancement-stones.ts

import { PrismaClient, ItemType } from '@prisma/client'

const prisma = new PrismaClient()

async function seedEnhancementStones() {
  console.log('⚒️ Criando pedras de aprimoramento...')

  const stones = [
    {
      name: 'Pedra Negra (Arma)',
      description: 'Pedra imbuída de energia sombria. Usada para aprimorar armas e escudos de +1 a +15. Obtida em masmorras e aventuras.',
      type: ItemType.CONSUMABLE,
      level: 1,
      goldPrice: 250,
      stats: {
        rarity: 'UNCOMMON',
        enhancementStone: 'WEAPON_BASIC',
        battleUsable: false,
        sellPrice: 150,
      },
    },
    {
      name: 'Pedra Negra (Armadura)',
      description: 'Pedra imbuída de energia sombria. Usada para aprimorar armaduras, elmos, luvas e botas de +1 a +15. Obtida em masmorras e aventuras.',
      type: ItemType.CONSUMABLE,
      level: 1,
      goldPrice: 220,
      stats: {
        rarity: 'UNCOMMON',
        enhancementStone: 'ARMOR_BASIC',
        battleUsable: false,
        sellPrice: 130,
      },
    },
    {
      name: 'Pedra Negra Mágica Concentrada (Arma)',
      description: 'Pedra negra condensada com poder mágico imenso. Necessária para aprimorar armas e escudos aos níveis I a V. Muito rara.',
      type: ItemType.CONSUMABLE,
      level: 30,
      goldPrice: 2500,
      stats: {
        rarity: 'EPIC',
        enhancementStone: 'WEAPON_CONCENTRATED',
        battleUsable: false,
        sellPrice: 1500,
      },
    },
    {
      name: 'Pedra Negra Mágica Concentrada (Armadura)',
      description: 'Pedra negra condensada com poder mágico imenso. Necessária para aprimorar armaduras aos níveis I a V. Muito rara.',
      type: ItemType.CONSUMABLE,
      level: 30,
      goldPrice: 2200,
      stats: {
        rarity: 'EPIC',
        enhancementStone: 'ARMOR_CONCENTRATED',
        battleUsable: false,
        sellPrice: 1300,
      },
    },
  ]

  for (const stone of stones) {
    const existing = await prisma.item.findFirst({ where: { name: stone.name } })
    if (existing) {
      await prisma.item.update({
        where: { id: existing.id },
        data: { description: stone.description, stats: stone.stats, goldPrice: stone.goldPrice },
      })
      console.log(`  🔄 Atualizada: ${stone.name}`)
    } else {
      await prisma.item.create({ data: stone })
      console.log(`  ✨ Criada: ${stone.name}`)
    }
  }

  console.log('✅ Pedras de aprimoramento prontas!')
}

seedEnhancementStones()
  .catch((e) => {
    console.error('❌ Erro ao criar pedras:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
