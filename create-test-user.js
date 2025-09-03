/**
 * Script para criar usuário de teste
 * Execute: node create-test-user.js
 */

const bcrypt = require('bcryptjs')

// Dados do usuário de teste
const testUser = {
  email: 'teste@dolrath.com',
  password: 'teste123',
  name: 'Usuário Teste'
}

async function createTestUser() {
  console.log('🔐 Criando usuário de teste...')
  
  // Hash da senha
  const hashedPassword = await bcrypt.hash(testUser.password, 12)
  
  console.log('📋 Dados do usuário de teste:')
  console.log('Email:', testUser.email)
  console.log('Senha:', testUser.password)
  console.log('Nome:', testUser.name)
  console.log('Hash da senha:', hashedPassword)
  
  console.log('\n🔧 SQL para inserir no banco:')
  console.log(`
INSERT INTO "User" (id, email, name, password, "createdAt", "updatedAt") 
VALUES (
  gen_random_uuid(),
  '${testUser.email}',
  '${testUser.name}',
  '${hashedPassword}',
  NOW(),
  NOW()
);`)

  console.log('\n✅ Execute este SQL no seu banco de dados Neon')
  console.log('   Ou use o Prisma Studio para adicionar o usuário')
}

createTestUser().catch(console.error)
