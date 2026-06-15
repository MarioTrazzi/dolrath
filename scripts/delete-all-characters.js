// ⚠️ DESTRUTIVO — apaga TODOS os personagens do banco apontado por DATABASE_URL.
//
// As relações filhas (CharacterInventory, CharacterEquipment, CharacterHistory)
// têm onDelete: Cascade no schema, então são removidas junto automaticamente.
// Itens do catálogo, usuários, NFTs e inventário de usuário NÃO são afetados.
//
// Motivo: após o rebalanceamento, personagens criados antes ficam com stats
// antigos. Apagando-os, todo personagem recriado nasce já com o balanceamento
// atual (o servidor recalcula os stats na criação em api/character/route.ts).
//
// USO (faça um backup do banco antes!):
//   1) Dry-run (só conta, não apaga):
//        node scripts/delete-all-characters.js
//   2) Execução real (exige confirmação explícita):
//        CONFIRM=DELETE_ALL node scripts/delete-all-characters.js
//
// Aponte para o banco certo via DATABASE_URL (ex.: produção Neon/Railway).

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const total = await prisma.character.count()
  console.log(`🔎 Personagens no banco: ${total}`)

  if (total === 0) {
    console.log('✅ Nada a apagar.')
    return
  }

  if (process.env.CONFIRM !== 'DELETE_ALL') {
    console.log('\n🟡 DRY-RUN — nenhum personagem foi apagado.')
    console.log('   Para apagar de verdade, rode:')
    console.log('   CONFIRM=DELETE_ALL node scripts/delete-all-characters.js\n')
    return
  }

  console.log('🗑️  Apagando todos os personagens (cascata: inventário, equipamento, histórico)...')
  const result = await prisma.character.deleteMany({})
  console.log(`✅ ${result.count} personagens apagados.`)
}

main()
  .catch((e) => {
    console.error('❌ Erro:', e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
