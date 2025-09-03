/**
 * Script para criar usuário de teste no banco NEON (produção)
 * Execute: npx tsx create-test-user-production.ts
 */

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

// URL do banco Neon (produção)
const NEON_DATABASE_URL = "postgresql://neondb_owner:npg_q0Tn8rxZaQtN@ep-curly-snowflake-acb621d1-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: NEON_DATABASE_URL
    }
  }
})

async function createTestUserProduction() {
  try {
    console.log('🔐 Criando usuário de teste no banco NEON (produção)...')
    console.log('🗄️ Conectando ao banco:', NEON_DATABASE_URL.split('@')[1].split('/')[0])
    
    const testUser = {
      email: 'teste@dolrath.com',
      password: 'teste123',
      name: 'Usuário Teste'
    }
    
    // Verificar se o usuário já existe
    const existingUser = await prisma.user.findUnique({
      where: { email: testUser.email }
    })
    
    if (existingUser) {
      console.log('⚠️  Usuário já existe no banco de produção!')
      console.log('📧 Email:', testUser.email)
      console.log('🔑 Senha:', testUser.password)
      
      // Verificar se tem personagem
      const characters = await prisma.character.findMany({
        where: { userId: existingUser.id }
      })
      
      if (characters.length > 0) {
        console.log('⚔️  Personagens encontrados:')
        characters.forEach(char => {
          console.log(`   - ${char.name} (${char.class}, Level ${char.level})`)
        })
      } else {
        console.log('⚠️  Usuário não tem personagens, criando um...')
        
        const character = await prisma.character.create({
          data: {
            userId: existingUser.id,
            name: 'Guerreiro Teste',
            race: 'Humano',
            class: 'Guerreiro',
            level: 5,
            hp: 100,
            maxHp: 100,
            mp: 50,
            maxMp: 50,
            stamina: 100,
            maxStamina: 100,
            gold: 1000,
            availablePoints: 0,
            attributes: {
              strength: 15,
              agility: 12,
              intelligence: 10,
              resistance: 13,
              critical: 5,
              speed: 10
            },
            baseStats: {
              attack: 25,
              defense: 18
            }
          }
        })
        
        console.log('✅ Personagem criado:', character.name)
      }
      
      return
    }
    
    // Hash da senha
    const hashedPassword = await bcrypt.hash(testUser.password, 12)
    
    // Criar usuário
    const user = await prisma.user.create({
      data: {
        email: testUser.email,
        name: testUser.name,
        password: hashedPassword
      }
    })
    
    console.log('✅ Usuário criado com sucesso no banco NEON!')
    console.log('📧 Email:', testUser.email)
    console.log('🔑 Senha:', testUser.password)
    console.log('👤 ID:', user.id)
    
    // Criar personagem de teste
    const character = await prisma.character.create({
      data: {
        userId: user.id,
        name: 'Guerreiro Teste',
        race: 'Humano',
        class: 'Guerreiro',
        level: 5,
        hp: 100,
        maxHp: 100,
        mp: 50,
        maxMp: 50,
        stamina: 100,
        maxStamina: 100,
        gold: 1000,
        availablePoints: 0,
        attributes: {
          strength: 15,
          agility: 12,
          intelligence: 10,
          resistance: 13,
          critical: 5,
          speed: 10
        },
        baseStats: {
          attack: 25,
          defense: 18
        }
      }
    })
    
    console.log('⚔️  Personagem criado:', character.name)
    console.log('🆔 Character ID:', character.id)
    
    console.log('\n🎯 PRONTO PARA TESTE!')
    console.log('   Acesse sua aplicação e faça login com:')
    console.log('   Email: teste@dolrath.com')
    console.log('   Senha: teste123')
    
  } catch (error) {
    console.error('❌ Erro:', error)
  } finally {
    await prisma.$disconnect()
  }
}

createTestUserProduction()
