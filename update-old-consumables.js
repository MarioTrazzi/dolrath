const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function updateOldConsumables() {
  console.log('🔧 Atualizando itens consumíveis antigos...')

  try {
    // Mapear nomes para subtipos
    const itemUpdates = [
      { name: 'Poção de Vida Pequena', subtype: 'HEALTH_POTION' },
      { name: 'Poção de Vida', subtype: 'HEALTH_POTION' },
      { name: 'Poção de Mana', subtype: 'MANA_POTION' },
      { name: 'Poção de Stamina', subtype: 'STAMINA_POTION' },
      { name: 'Elixir Maior', subtype: 'ELIXIR' },
      { name: 'Elixir Menor', subtype: 'ELIXIR' },
    ]

    for (const update of itemUpdates) {
      const result = await prisma.item.updateMany({
        where: {
          name: update.name,
          type: 'CONSUMABLE',
          subtype: null // Só atualizar os que não têm subtype
        },
        data: {
          subtype: update.subtype
        }
      })
      
      if (result.count > 0) {
        console.log(`✅ Atualizados ${result.count} itens: ${update.name} -> ${update.subtype}`)
      }
    }

    console.log('✅ Atualização concluída!')
  } catch (error) {
    console.error('❌ Erro na atualização:', error)
  } finally {
    await prisma.$disconnect()
  }
}

updateOldConsumables()
