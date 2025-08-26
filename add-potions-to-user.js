const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function addPotionsToUser() {
  try {
    console.log('🎒 Adicionando poções ao inventário do usuário...')

    // Buscar o primeiro usuário
    const user = await prisma.user.findFirst()
    if (!user) {
      console.log('❌ Nenhum usuário encontrado')
      return
    }

    console.log('👤 Usuário encontrado:', user.name || user.email)

    // Buscar as poções criadas
    const staminaPotion = await prisma.item.findFirst({
      where: { name: 'Poção de Stamina' }
    })

    const healthPotion = await prisma.item.findFirst({
      where: { name: 'Poção de Vida' }
    })

    const manaPotion = await prisma.item.findFirst({
      where: { name: 'Poção de Mana' }
    })

    // Adicionar 5 poções de stamina ao inventário do usuário
    if (staminaPotion) {
      await prisma.userInventory.create({
        data: {
          userId: user.id,
          itemId: staminaPotion.id,
          quantity: 5
        }
      })
      console.log('✅ 5x Poção de Stamina adicionada ao inventário')
    }

    // Adicionar 3 poções de vida
    if (healthPotion) {
      await prisma.userInventory.create({
        data: {
          userId: user.id,
          itemId: healthPotion.id,
          quantity: 3
        }
      })
      console.log('✅ 3x Poção de Vida adicionada ao inventário')
    }

    // Adicionar 3 poções de mana
    if (manaPotion) {
      await prisma.userInventory.create({
        data: {
          userId: user.id,
          itemId: manaPotion.id,
          quantity: 3
        }
      })
      console.log('✅ 3x Poção de Mana adicionada ao inventário')
    }

    console.log('🎉 Poções adicionadas ao inventário com sucesso!')
    
  } catch (error) {
    console.error('❌ Erro ao adicionar poções ao inventário:', error)
  } finally {
    await prisma.$disconnect()
  }
}

addPotionsToUser()
