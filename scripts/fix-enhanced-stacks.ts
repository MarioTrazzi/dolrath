// 🧼 Saneamento de pilhas aprimoradas indevidamente agrupadas.
//
// Bug antigo: ao transferir do inventário global / receber recompensa, um item
// base (nível 0) podia ser empilhado numa instância aprimorada (enhancementLevel
// > 0), deixando a linha aprimorada com quantity > 1 — quando deveria ser sempre
// quantity 1 (uma instância única por linha).
//
// Este script separa essas linhas: mantém 1 instância aprimorada e move o
// excedente para a pilha base (nível 0) do mesmo item (incrementa a existente ou
// cria uma nova com durabilidade padrão de cópia recém-comprada).
//
// Dry-run por padrão. Para aplicar de fato: --apply
//   DATABASE_URL=... npx tsx scripts/fix-enhanced-stacks.ts                  # dry-run (personagem "Arkantos")
//   DATABASE_URL=... npx tsx scripts/fix-enhanced-stacks.ts --apply          # aplica em "Arkantos"
//   DATABASE_URL=... npx tsx scripts/fix-enhanced-stacks.ts --character=Nome # outro personagem
//   DATABASE_URL=... npx tsx scripts/fix-enhanced-stacks.ts --all            # todos os personagens

import { PrismaClient } from '@prisma/client'

const APPLY = process.argv.includes('--apply')
const ALL = process.argv.includes('--all')
const charArg = process.argv.find((a) => a.startsWith('--character='))
const CHARACTER_NAME = charArg ? charArg.split('=')[1] : 'Arkantos'

const prisma = new PrismaClient()

async function main() {
  console.log(`🧼 Saneamento de pilhas aprimoradas ${APPLY ? '(APPLY — vai alterar o banco)' : '(dry-run)'}`)
  console.log(ALL ? '  Alvo: TODOS os personagens' : `  Alvo: personagem "${CHARACTER_NAME}"`)
  console.log('')

  const characters = await prisma.character.findMany({
    where: ALL ? {} : { name: CHARACTER_NAME },
    select: { id: true, name: true, user: { select: { email: true } } },
  })

  if (characters.length === 0) {
    console.log('Nenhum personagem encontrado para o alvo.')
    return
  }

  let rowsFixed = 0
  let copiesMoved = 0

  for (const character of characters) {
    // Linhas aprimoradas com quantidade indevida (> 1).
    const badRows = await prisma.characterInventory.findMany({
      where: {
        characterId: character.id,
        enhancementLevel: { gt: 0 },
        quantity: { gt: 1 },
      },
      include: { item: { select: { name: true } } },
    })
    if (badRows.length === 0) continue

    console.log(
      `👤 ${character.name} (${character.user?.email ?? 'sem email'}) — ${badRows.length} linha(s) a sanear`
    )

    for (const row of badRows) {
      const excess = row.quantity - 1
      console.log(
        `   • ${row.item.name} +${row.enhancementLevel}: quantity ${row.quantity} → 1; ` +
          `movendo ${excess} cópia(s) base (nível 0)`
      )
      rowsFixed++
      copiesMoved += excess

      if (!APPLY) continue

      await prisma.$transaction(async (tx) => {
        // 1. A linha aprimorada vira instância única.
        await tx.characterInventory.update({
          where: { id: row.id },
          data: { quantity: 1 },
        })

        // 2. Excedente vai para a pilha base (nível 0) do mesmo item.
        const baseStack = await tx.characterInventory.findFirst({
          where: {
            characterId: character.id,
            itemId: row.itemId,
            enhancementLevel: 0,
          },
        })

        if (baseStack) {
          await tx.characterInventory.update({
            where: { id: baseStack.id },
            data: { quantity: { increment: excess } },
          })
        } else {
          await tx.characterInventory.create({
            data: {
              characterId: character.id,
              itemId: row.itemId,
              quantity: excess,
              enhancementLevel: 0,
              // durability/maxDurability ficam no padrão do schema (100/100),
              // equivalente a uma cópia base recém-comprada.
            },
          })
        }
      })
    }
  }

  console.log('')
  console.log(
    `Resumo: ${rowsFixed} linha(s) aprimorada(s) saneada(s), ${copiesMoved} cópia(s) base realocada(s).`
  )

  if (!APPLY) {
    console.log('⚠️ Dry-run — nada foi alterado. Rode novamente com --apply para aplicar.')
    return
  }

  // Verificação pós-aplicação.
  const remaining = await prisma.characterInventory.count({
    where: {
      enhancementLevel: { gt: 0 },
      quantity: { gt: 1 },
      ...(ALL ? {} : { character: { name: CHARACTER_NAME } }),
    },
  })
  console.log(
    remaining === 0
      ? '✅ Verificação: nenhuma linha aprimorada com quantity > 1 restante.'
      : `❗ Atenção: ainda restam ${remaining} linha(s) aprimorada(s) com quantity > 1.`
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
