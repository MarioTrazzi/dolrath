/**
 * Script para verificar usuário de teste no banco de produção
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function checkTestUser() {
  try {
    console.log('🔍 Verificando usuário de teste...')
    
    const user = await prisma.user.findUnique({
      where: { email: 'teste@dolrath.com' },
      include: {
        characters: true
      }
    })
    
    if (!user) {
      console.log('❌ Usuário não encontrado!')
      return
    }
    
    console.log('✅ Usuário encontrado!')
    console.log('📧 Email:', user.email)
    console.log('👤 Nome:', user.name)
    console.log('🆔 ID:', user.id)
    
    if (user.characters.length > 0) {
      console.log('\n⚔️  Personagens:')
      user.characters.forEach(char => {
        console.log(`   - ${char.name} (${char.class} ${char.race}, Level ${char.level})`)
        console.log(`     HP: ${char.hp}/${char.maxHp} | MP: ${char.mp}/${char.maxMp}`)
        console.log(`     Gold: ${char.gold} | ID: ${char.id}`)
      })
    } else {
      console.log('⚠️  Usuário não tem personagens!')
    }
    
    console.log('\n🎯 CREDENCIAIS PARA TESTE:')
    console.log('   Email: teste@dolrath.com')
    console.log('   Senha: teste123')
    
  } catch (error) {
    console.error('❌ Erro:', error)
  } finally {
    await prisma.$disconnect()
  }
}

checkTestUser()
