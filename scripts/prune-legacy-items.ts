// 🧹 Remove itens LEGADOS (equipamento de seeds antigos) que NÃO fazem parte do
// catálogo final (ITEM_CATALOG) — com segurança máxima:
//
//  - NUNCA remove consumíveis (type CONSUMABLE: poções, pedras de aprimoramento).
//  - NUNCA remove itens do catálogo final.
//  - NUNCA remove um item REFERENCIADO por algum jogador (inventário, equipado,
//    histórico ou NFT). Esses são apenas listados como "preservados".
//
// Dry-run por padrão. Para aplicar de fato: --apply
//   DATABASE_URL=... npx tsx scripts/prune-legacy-items.ts            # dry-run
//   DATABASE_URL=... npx tsx scripts/prune-legacy-items.ts --apply    # deleta

import { PrismaClient } from '@prisma/client'
import { ITEM_CATALOG, CONSUMABLE_CATALOG } from '../src/lib/itemCatalog'

const APPLY = process.argv.includes('--apply')
const prisma = new PrismaClient()

// Nomes que são "oficiais" e nunca devem ser removidos.
const KEEP_NAMES = new Set<string>([
  ...ITEM_CATALOG.map((i) => i.name),
  ...CONSUMABLE_CATALOG.map((c) => c.name),
])

async function refCount(itemId: string): Promise<number> {
  const [inv, charInv, equip, hist, nft] = await Promise.all([
    prisma.userInventory.count({ where: { itemId } }),
    prisma.characterInventory.count({ where: { itemId } }),
    prisma.characterEquipment.count({ where: { itemId } }),
    prisma.characterHistory.count({ where: { itemId } }),
    prisma.itemNft.count({ where: { itemId } }),
  ])
  return inv + charInv + equip + hist + nft
}

async function main() {
  console.log(`🧹 Prune de itens legados ${APPLY ? '(APPLY — vai deletar)' : '(dry-run)'}\n`)

  const all = await prisma.item.findMany({ select: { id: true, name: true, type: true, image: true } })

  // Candidatos: NÃO consumível e NÃO no catálogo final.
  const candidates = all.filter((i) => i.type !== 'CONSUMABLE' && !KEEP_NAMES.has(i.name))

  console.log(`itens no DB: ${all.length} · candidatos a legado: ${candidates.length}\n`)

  const toDelete: typeof candidates = []
  const preserved: { name: string; refs: number }[] = []

  for (const item of candidates) {
    const refs = await refCount(item.id)
    if (refs > 0) {
      preserved.push({ name: item.name, refs })
    } else {
      toDelete.push(item)
    }
  }

  if (preserved.length) {
    console.log(`🔒 Preservados (em uso por jogadores), NÃO serão removidos:`)
    for (const p of preserved) console.log(`   - ${p.name} (${p.refs} referência(s))`)
    console.log()
  }

  console.log(`🗑️  ${toDelete.length} item(ns) legado(s) órfão(s) ${APPLY ? 'serão removidos' : 'seriam removidos'}:`)
  for (const d of toDelete) console.log(`   - ${d.name} [${d.type}]`)

  if (APPLY && toDelete.length) {
    const ids = toDelete.map((d) => d.id)
    const res = await prisma.item.deleteMany({ where: { id: { in: ids } } })
    console.log(`\n✅ Removidos: ${res.count}`)
  } else if (!APPLY) {
    console.log(`\nℹ️  Dry-run. Rode com --apply para remover de fato.`)
  }

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error('💥', e)
  process.exit(1)
})
