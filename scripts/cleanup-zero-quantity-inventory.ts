// 🧹 Saneamento das linhas de inventário zeradas ("itens fantasma").
//
// Bug antigo (/api/inventory/use-item): consumir um item DECREMENTAVA a
// quantidade até 0 sem apagar a linha. Resultado: o item continuava aparecendo
// na mochila, ocupava um slot (freeInventorySlots conta LINHAS) e nenhuma ação
// o aceitava — usar, transferir e mandar pro Baú Geral filtram quantity > 0.
//
// A rota já apaga a última unidade e as leituras já escondem linha zerada; este
// script limpa o passivo que ficou no banco (o slot ocupado só volta com o
// DELETE).
//
// Dry-run por padrão. Para aplicar de fato: --apply
//   DATABASE_URL=... npx tsx scripts/cleanup-zero-quantity-inventory.ts
//   DATABASE_URL=... npx tsx scripts/cleanup-zero-quantity-inventory.ts --apply

import { PrismaClient } from '@prisma/client'

const APPLY = process.argv.includes('--apply')

const prisma = new PrismaClient()

async function main() {
  console.log(`🧹 Linhas de inventário zeradas ${APPLY ? '(APPLY — vai apagar do banco)' : '(dry-run)'}\n`)

  const charRows = await prisma.characterInventory.findMany({
    where: { quantity: { lte: 0 } },
    include: {
      item: { select: { name: true } },
      character: { select: { name: true } },
    },
  })

  const userRows = await prisma.userInventory.findMany({
    where: { quantity: { lte: 0 } },
    include: {
      item: { select: { name: true } },
      user: { select: { email: true } },
    },
  })

  console.log(`Mochilas de personagem: ${charRows.length} linha(s)`)
  for (const row of charRows) {
    console.log(`  - ${row.character.name}: ${row.item.name} (qty ${row.quantity})`)
  }

  console.log(`\nBaú Geral (conta): ${userRows.length} linha(s)`)
  for (const row of userRows) {
    console.log(`  - ${row.user.email ?? row.userId}: ${row.item.name} (qty ${row.quantity})`)
  }

  if (!APPLY) {
    console.log('\nDry-run: nada foi apagado. Rode com --apply para limpar.')
    return
  }

  const [charDeleted, userDeleted] = await prisma.$transaction([
    prisma.characterInventory.deleteMany({ where: { quantity: { lte: 0 } } }),
    prisma.userInventory.deleteMany({ where: { quantity: { lte: 0 } } }),
  ])

  console.log(`\n✅ Apagadas ${charDeleted.count} linha(s) de personagem e ${userDeleted.count} do Baú Geral.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
