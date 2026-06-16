import { PrismaClient, ItemType, ConsumableSubtype } from '@prisma/client'
import { itemImagePath } from './src/lib/itemCatalog'

const prisma = new PrismaClient()

async function seedBattleConsumables() {
  console.log('🧪 Criando consumíveis de batalha...')

  const battleConsumables = [
    // Poções de Vida
    {
      name: 'Poção de Vida Pequena',
      description: 'Restaura 30 HP instantaneamente durante o combate',
      type: ItemType.CONSUMABLE,
      subtype: ConsumableSubtype.HEALTH_POTION,
      level: 1,
      goldPrice: 50,
      stats: {
        healAmount: 30,
        effect: 'instant',
        battleUsable: true
      }
    },
    {
      name: 'Poção de Vida',
      description: 'Restaura 50 HP instantaneamente durante o combate',
      type: ItemType.CONSUMABLE,
      subtype: ConsumableSubtype.HEALTH_POTION,
      level: 2,
      goldPrice: 100,
      stats: {
        healAmount: 50,
        effect: 'instant',
        battleUsable: true
      }
    },
    {
      name: 'Poção de Vida Grande',
      description: 'Restaura 80 HP instantaneamente durante o combate',
      type: ItemType.CONSUMABLE,
      subtype: ConsumableSubtype.HEALTH_POTION,
      level: 3,
      goldPrice: 200,
      stats: {
        healAmount: 80,
        effect: 'instant',
        battleUsable: true
      }
    },

    // Poções de Mana
    {
      name: 'Poção de Mana',
      description: 'Restaura 30 MP instantaneamente durante o combate',
      type: ItemType.CONSUMABLE,
      subtype: ConsumableSubtype.MANA_POTION,
      level: 1,
      goldPrice: 75,
      stats: {
        manaAmount: 30,
        effect: 'instant',
        battleUsable: true
      }
    },
    {
      name: 'Poção de Mana Grande',
      description: 'Restaura 50 MP instantaneamente durante o combate',
      type: ItemType.CONSUMABLE,
      subtype: ConsumableSubtype.MANA_POTION,
      level: 2,
      goldPrice: 150,
      stats: {
        manaAmount: 50,
        effect: 'instant',
        battleUsable: true
      }
    },

    // Poções de Stamina
    {
      name: 'Poção de Stamina',
      description: 'Restaura 20 Stamina instantaneamente',
      type: ItemType.CONSUMABLE,
      subtype: ConsumableSubtype.STAMINA_POTION,
      level: 1,
      goldPrice: 80,
      stats: {
        staminaAmount: 20,
        effect: 'instant',
        battleUsable: true
      }
    },
    {
      name: 'Elixir de Energia',
      description: 'Restaura 40 Stamina instantaneamente',
      type: ItemType.CONSUMABLE,
      subtype: ConsumableSubtype.STAMINA_POTION,
      level: 2,
      goldPrice: 160,
      stats: {
        staminaAmount: 40,
        effect: 'instant',
        battleUsable: true
      }
    },

    // Elixires (combo HP+MP)
    {
      name: 'Elixir Menor',
      description: 'Restaura 25 HP e 20 MP durante o combate',
      type: ItemType.CONSUMABLE,
      subtype: ConsumableSubtype.ELIXIR,
      level: 1,
      goldPrice: 120,
      stats: {
        healAmount: 25,
        manaAmount: 20,
        effect: 'instant',
        battleUsable: true
      }
    },
    {
      name: 'Elixir Maior',
      description: 'Restaura 40 HP e 30 MP durante o combate',
      type: ItemType.CONSUMABLE,
      subtype: ConsumableSubtype.ELIXIR,
      level: 2,
      goldPrice: 250,
      stats: {
        healAmount: 40,
        manaAmount: 30,
        effect: 'instant',
        battleUsable: true
      }
    },
    {
      name: 'Elixir Supremo',
      description: 'Restaura 60 HP e 50 MP durante o combate',
      type: ItemType.CONSUMABLE,
      subtype: ConsumableSubtype.ELIXIR,
      level: 3,
      goldPrice: 400,
      stats: {
        healAmount: 60,
        manaAmount: 50,
        effect: 'instant',
        battleUsable: true
      }
    },

    // Buffs Temporários
    {
      name: 'Poção de Força',
      description: 'Aumenta o ataque em 5 pontos por 3 turnos',
      type: ItemType.CONSUMABLE,
      subtype: ConsumableSubtype.STRENGTH_BUFF,
      level: 2,
      goldPrice: 180,
      stats: {
        attackBonus: 5,
        duration: 3,
        effect: 'temporary',
        battleUsable: true
      }
    },
    {
      name: 'Poção de Defesa',
      description: 'Aumenta a defesa em 3 pontos por 3 turnos',
      type: ItemType.CONSUMABLE,
      subtype: ConsumableSubtype.DEFENSE_BUFF,
      level: 2,
      goldPrice: 160,
      stats: {
        defenseBonus: 3,
        duration: 3,
        effect: 'temporary',
        battleUsable: true
      }
    },
    {
      name: 'Poção de Agilidade',
      description: 'Aumenta a chance de esquiva em 15% por 3 turnos',
      type: ItemType.CONSUMABLE,
      subtype: ConsumableSubtype.AGILITY_BUFF,
      level: 2,
      goldPrice: 170,
      stats: {
        dodgeBonus: 15,
        duration: 3,
        effect: 'temporary',
        battleUsable: true
      }
    },

    // Poção de Reviver
    {
      name: 'Poção de Reviver',
      description: 'Revive um personagem morto com 25% do HP máximo',
      type: ItemType.CONSUMABLE,
      subtype: ConsumableSubtype.REVIVE_POTION,
      level: 3,
      goldPrice: 500,
      stats: {
        reviveHpPercent: 25,
        effect: 'revive',
        battleUsable: false // Não pode usar em combate
      }
    }
  ]

  for (const consumable of battleConsumables) {
    try {
      const created = await prisma.item.create({
        data: { ...consumable, image: itemImagePath(consumable.name) }
      })
      console.log(`✅ Criado: ${created.name} (${created.subtype})`)
    } catch (error) {
      console.log(`❌ Erro ao criar ${consumable.name}:`, error)
    }
  }

  console.log('✅ Consumíveis de batalha criados com sucesso!')
}

async function main() {
  try {
    await seedBattleConsumables()
  } catch (error) {
    console.error('❌ Erro:', error)
  } finally {
    await prisma.$disconnect()
  }
}

main()
