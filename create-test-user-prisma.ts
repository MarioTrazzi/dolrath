/**
 * Script para criar usuário de teste usando Prisma
 * Execute: npx tsx create-test-user-prisma.ts
 */

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function createTestUser() {
  try {
    console.log('🔐 Criando usuário de teste...')
    
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
      console.log('⚠️  Usuário já existe!')
      console.log('📧 Email:', testUser.email)
      console.log('🔑 Senha:', testUser.password)
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
    
    console.log('✅ Usuário criado com sucesso!')
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
    
  } catch (error) {
    console.error('❌ Erro:', error)
  } finally {
    await prisma.$disconnect()
  }
}

createTestUser()
