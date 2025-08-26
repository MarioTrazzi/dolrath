const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function addStaminaPotions() {
  try {
    console.log('🧪 Adicionando poções de stamina ao banco...')

    // Criar poção de stamina
    const staminaPotion = await prisma.item.create({
      data: {
        name: 'Poção de Stamina',
        description: 'Restaura 50 pontos de stamina quando usada.',
        type: 'CONSUMABLE',
        goldPrice: 25,
        stats: {
          staminaRestore: 50
        }
      }
    })

    console.log('✅ Poção de Stamina criada:', staminaPotion)

    // Criar poção de vida
    const healthPotion = await prisma.item.create({
      data: {
        name: 'Poção de Vida',
        description: 'Restaura 50 pontos de vida quando usada.',
        type: 'CONSUMABLE',
        goldPrice: 30,
        stats: {
          healthRestore: 50
        }
      }
    })

    console.log('✅ Poção de Vida criada:', healthPotion)

    // Criar poção de mana
    const manaPotion = await prisma.item.create({
      data: {
        name: 'Poção de Mana',
        description: 'Restaura 30 pontos de mana quando usada.',
        type: 'CONSUMABLE',
        goldPrice: 20,
        stats: {
          manaRestore: 30
        }
      }
    })

    console.log('✅ Poção de Mana criada:', manaPotion)

    console.log('🎉 Todas as poções foram adicionadas com sucesso!')
    
  } catch (error) {
    console.error('❌ Erro ao adicionar poções:', error)
  } finally {
    await prisma.$disconnect()
  }
}

addStaminaPotions()
