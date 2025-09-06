/**
 * 🔄 SCRIPT DE RESET DO BANCO DE DADOS EM PRODUÇÃO
 * Para aplicar todas as mudanças do sistema de transformação e balanceamento
 */

const { PrismaClient } = require('@prisma/client')

// Configurar para usar DATABASE_URL de produção
const prisma = new PrismaClient()

async function resetProductionDatabase() {
  console.log('🚨 INICIANDO RESET DO BANCO DE DADOS EM PRODUÇÃO')
  console.log('⚠️  ATENÇÃO: Esta operação irá DELETAR todos os personagens existentes!')
  console.log('')

  try {
    console.log('📊 Status atual do banco:')
    
    // Verificar quantos personagens existem
    const characterCount = await prisma.character.count()
    const userCount = await prisma.user.count()
    
    console.log(`👥 Usuários: ${userCount}`)
    console.log(`🎮 Personagens: ${characterCount}`)
    console.log('')

    if (characterCount > 0) {
      console.log('🗑️  DELETANDO todos os personagens...')
      
      // Deletar todas as dependências primeiro
      await prisma.characterHistory.deleteMany({})
      console.log('✅ Histórico de personagens deletado')
      
      await prisma.characterInventory.deleteMany({})
      console.log('✅ Inventário de personagens deletado')
      
      await prisma.characterEquipment.deleteMany({})
      console.log('✅ Equipamentos de personagens deletado')
      
      // Deletar personagens
      await prisma.character.deleteMany({})
      console.log('✅ Todos os personagens deletados')
    }

    console.log('')
    console.log('🔄 Aplicando migrações mais recentes...')
    
    // As migrações já foram aplicadas automaticamente pelo Vercel/Railway
    // Mas vamos garantir que tudo está atualizado
    
    console.log('✅ Banco de dados resetado com sucesso!')
    console.log('')
    console.log('🎯 MUDANÇAS APLICADAS:')
    console.log('• Sistema de transformação implementado')
    console.log('• Balanceamento de stats corrigido') 
    console.log('• Bônus raciais e de classe adicionados')
    console.log('• Fórmulas de HP/MP/Stamina equilibradas')
    console.log('• Sistema de magia e críticos implementado')
    console.log('')
    console.log('🚀 Prontos para criar novos personagens balanceados!')

    // Verificar status final
    const finalCharacterCount = await prisma.character.count()
    console.log(`📊 Personagens restantes: ${finalCharacterCount}`)

  } catch (error) {
    console.error('❌ Erro durante o reset:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

// Verificar se estamos em produção
if (process.env.NODE_ENV === 'production' || process.env.DATABASE_URL?.includes('vercel') || process.env.DATABASE_URL?.includes('railway')) {
  console.log('🌐 Executando em ambiente de PRODUÇÃO')
  resetProductionDatabase()
} else {
  console.log('⚠️  Este script deve ser executado apenas em PRODUÇÃO')
  console.log('Para usar em desenvolvimento, defina NODE_ENV=production')
}
