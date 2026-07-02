// 🔍 Acha registros de Item no banco com `image` null/vazio (causa o bug do ícone
// genérico em telas que não fazem fallback por nome, ex.: grid da EnhancementDialog).
// Agrupa por nome, mostra quantas linhas afeta e se já existe um .webp gerado
// (ou seja, se o backfill seria só gravar itemImagePath(name) no banco).
// Somente leitura — não grava nada.
//   DATABASE_URL=$DATABASE_URL_NEON npx tsx scripts/find-items-null-image.ts

import { existsSync } from 'fs'
import { join } from 'path'
import { PrismaClient } from '@prisma/client'
import { itemImageSlug } from '../src/lib/itemCatalog'

const prisma = new PrismaClient()

async function main() {
  const rows = await prisma.item.findMany({
    where: { OR: [{ image: null }, { image: '' }] },
    select: { id: true, name: true, type: true },
  })

  if (rows.length === 0) {
    console.log('Nenhum item com image null/vazio no banco. 🎉')
    return
  }

  const byName = new Map<string, { type: string; count: number }>()
  for (const r of rows) {
    const e = byName.get(r.name) ?? { type: r.type, count: 0 }
    e.count++
    byName.set(r.name, e)
  }

  const hasAsset = (name: string) => existsSync(join('public', 'items', `${itemImageSlug(name)}.webp`))

  console.log(`Total de linhas afetadas: ${rows.length}`)
  console.log(`Nomes distintos: ${byName.size}\n`)

  const sorted = Array.from(byName.entries()).sort((a, b) => b[1].count - a[1].count)
  for (const [name, { type, count }] of sorted) {
    const asset = hasAsset(name) ? '✅ tem .webp (backfill trivial)' : '❌ SEM .webp (precisa gerar imagem)'
    console.log(`  · [${type}] "${name}" — ${count}x — ${asset}`)
  }
}

main().finally(() => prisma.$disconnect())
