import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ITEM_CATALOG, TOOL_CATALOG, itemImagePath } from '@/lib/itemCatalog'
import { ItemType } from '@prisma/client'

// Verificação básica: header X-SEED-SECRET deve corresponder à variável SEED_SECRET
const SEED_SECRET = process.env.SEED_SECRET || 'dev-secret'

async function seedItemCatalog() {
  const results = { created: 0, updated: 0, items: [] as string[] }

  // Ferramentas/trajes de coleta (TOOL_CATALOG) entram no mesmo loop: são
  // craft-only (fora de loja/drop), mas o seed garante preço/imagem/stats.
  for (const item of [...ITEM_CATALOG, ...TOOL_CATALOG]) {
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
      results.updated++
      results.items.push(`🔄 ${item.name}`)
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
      results.created++
      results.items.push(`✨ ${item.name}`)
    }
  }

  return results
}

async function seedEnhancementStones() {
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

  const results = { created: 0, updated: 0, items: [] as string[] }

  for (const stone of stones) {
    // Pedras vêm de masmorras (luta/exploração), não da loja.
    const stats = { ...stone.stats, source: 'dungeon' }
    const image = itemImagePath(stone.name)
    const existing = await prisma.item.findFirst({ where: { name: stone.name } })
    if (existing) {
      await prisma.item.update({
        where: { id: existing.id },
        data: { description: stone.description, stats, goldPrice: stone.goldPrice, image },
      })
      results.updated++
      results.items.push(`🔄 ${stone.name}`)
    } else {
      await prisma.item.create({ data: { ...stone, stats, image } })
      results.created++
      results.items.push(`✨ ${stone.name}`)
    }
  }

  return results
}

export async function POST(request: Request) {
  try {
    // Verificação básica de segurança
    const secret = request.headers.get('x-seed-secret')
    if (secret !== SEED_SECRET) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    console.log('🌱 Iniciando seed do catálogo e pedras de aprimoramento...')

    const catalogResults = await seedItemCatalog()
    const stonesResults = await seedEnhancementStones()

    return NextResponse.json({
      success: true,
      message: 'Seeds executados com sucesso!',
      catalog: {
        created: catalogResults.created,
        updated: catalogResults.updated,
        total: catalogResults.items.length,
        preview: catalogResults.items.slice(0, 5),
      },
      stones: {
        created: stonesResults.created,
        updated: stonesResults.updated,
        total: stonesResults.items.length,
        items: stonesResults.items,
      },
    })
  } catch (error) {
    console.error('❌ Erro ao executar seed:', error)
    return NextResponse.json(
      {
        error: 'Seed failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
