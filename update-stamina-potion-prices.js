// Aumenta o preço das poções de Stamina no banco (a loja lê item.goldPrice do DB).
// Stamina é o limitador anti-farm — comprá-la de volta é premium de propósito.
// (O preço de venda é derivado em runtime a partir do goldPrice.)
//
// Rodar com a DATABASE_URL de produção, ex.:
//   DATABASE_URL="$DATABASE_URL_NEON" node update-stamina-potion-prices.js
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

const NEW_PRICES = [
  { name: 'Poção de Stamina', goldPrice: 400 },  // antes 80
  { name: 'Elixir de Energia', goldPrice: 750 }, // antes 160
]

async function main() {
  console.log('⚡ Atualizando preços das poções de Stamina...')
  for (const p of NEW_PRICES) {
    const res = await prisma.item.updateMany({
      where: { name: p.name, type: 'CONSUMABLE', subtype: 'STAMINA_POTION' },
      data: { goldPrice: p.goldPrice },
    })
    console.log(`  ${res.count > 0 ? '✅' : '⚠️ '} ${p.name} → ${p.goldPrice}g (linhas: ${res.count})`)
  }
  console.log('✅ Concluído.')
}

main()
  .catch((e) => { console.error('❌ Erro:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
