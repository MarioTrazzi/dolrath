import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { ConsumableSubtype } from '@prisma/client'
import { getConsumableByName } from '@/lib/itemCatalog'
import { getRecipeById } from '@/lib/alchemy'
import { addHistoryEntry } from '@/lib/characterHistory'

// ⚗️ Crafta uma poção na Bancada de Alquimia.
// Consome os ingredientes do inventário do personagem + uma taxa em gold
// (User.goldBalance, mesmo pote da loja/recompensas). Sucesso garantido.
export async function POST(
  request: NextRequest,
  { params }: { params: { characterId: string } }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = session.user.id

    const body = await request.json()
    const recipeId: string | undefined = body?.recipeId
    if (!recipeId) {
      return NextResponse.json({ error: 'recipeId é obrigatório' }, { status: 400 })
    }

    const recipe = getRecipeById(recipeId)
    if (!recipe) {
      return NextResponse.json({ error: 'Receita não encontrada' }, { status: 404 })
    }

    const potion = getConsumableByName(recipe.outputName)
    if (!potion) {
      return NextResponse.json({ error: 'Poção da receita não existe no catálogo' }, { status: 500 })
    }

    const character = await prisma.character.findFirst({
      where: { id: params.characterId, userId },
    })
    if (!character) {
      return NextResponse.json({ error: 'Personagem não encontrado' }, { status: 404 })
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Gold (taxa da alquimista) — paga com a CARTEIRA DO PERSONAGEM
      // (Character.gold). Banco é só pra claim/transferência. [[bank — Opção B]]
      const charGold = await tx.character.findUnique({
        where: { id: character.id },
        select: { gold: true },
      })
      if (!charGold || charGold.gold < recipe.goldCost) {
        throw new Error(`GOLD insuficiente na carteira do personagem: precisa de ${recipe.goldCost} 🪙.`)
      }

      // 2. Ingredientes — busca todas as linhas de cada ingrediente do personagem
      const names = recipe.ingredients.map((i) => i.name)
      const rows = await tx.characterInventory.findMany({
        where: {
          characterId: character.id,
          item: { name: { in: names }, type: 'CONSUMABLE' },
        },
        include: { item: true },
      })
      // Só conta o que está marcado como ingrediente (não poções de mesmo nome).
      const ingredientRows = rows.filter(
        (r) => (r.item.stats as any)?.kind === 'ingredient'
      )

      const byName = new Map<string, typeof ingredientRows>()
      for (const r of ingredientRows) {
        const arr = byName.get(r.item.name) ?? []
        arr.push(r)
        byName.set(r.item.name, arr)
      }

      // Confere quantidade de cada ingrediente
      for (const req of recipe.ingredients) {
        const have = (byName.get(req.name) ?? []).reduce((n, r) => n + r.quantity, 0)
        if (have < req.quantity) {
          throw new Error(`Falta ${req.name} (tem ${have}, precisa de ${req.quantity}).`)
        }
      }

      // 3. Consome ingredientes (decrementa linhas; deleta na qtd 0)
      for (const req of recipe.ingredients) {
        let remaining = req.quantity
        for (const r of byName.get(req.name) ?? []) {
          if (remaining <= 0) break
          const take = Math.min(r.quantity, remaining)
          if (r.quantity > take) {
            await tx.characterInventory.update({
              where: { id: r.id },
              data: { quantity: { decrement: take } },
            })
          } else {
            await tx.characterInventory.delete({ where: { id: r.id } })
          }
          remaining -= take
        }
      }

      // 4. Debita o gold da carteira do personagem
      await tx.character.update({
        where: { id: character.id },
        data: { gold: { decrement: recipe.goldCost } },
      })

      // 5. Acha/cria o Item da poção (mesma lógica de add-exploration-reward)
      let potionItem = await tx.item.findFirst({ where: { name: potion.name } })
      if (!potionItem) {
        potionItem = await tx.item.create({
          data: {
            name: potion.name,
            description: potion.description,
            type: 'CONSUMABLE',
            subtype: potion.subtype as ConsumableSubtype,
            level: potion.level,
            goldPrice: potion.goldPrice,
            stats: {
              ...potion.stats,
              rarity: potion.rarity,
              sellPrice: Math.floor(potion.goldPrice * 0.6),
            },
          },
        })
      }

      // 6. Adiciona ao inventário (consumível empilha em enhancementLevel 0)
      const existing = await tx.characterInventory.findFirst({
        where: { characterId: character.id, itemId: potionItem.id, enhancementLevel: 0 },
      })
      if (existing) {
        await tx.characterInventory.update({
          where: { id: existing.id },
          data: { quantity: { increment: 1 } },
        })
      } else {
        await tx.characterInventory.create({
          data: { characterId: character.id, itemId: potionItem.id, quantity: 1 },
        })
      }

      const updatedChar = await tx.character.findUnique({
        where: { id: character.id },
        select: { gold: true },
      })
      return { potionItemId: potionItem.id, characterGold: updatedChar?.gold ?? null }
    })

    try {
      await addHistoryEntry({
        characterId: character.id,
        activityType: 'ITEM_GAINED',
        description: `⚗️ Craftou ${recipe.outputName} (−${recipe.goldCost} gold).`,
        itemId: result.potionItemId,
        goldAmount: -recipe.goldCost,
      })
    } catch (historyError) {
      console.error('Erro ao registrar histórico de craft:', historyError)
    }

    return NextResponse.json({
      success: true,
      characterGold: result.characterGold,
      message: `⚗️ ${recipe.outputName} criada com sucesso!`,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro interno do servidor'
    // Erros de validação (gold/ingrediente) são 400; o resto 500.
    const isValidation = /insuficiente|Falta /.test(message)
    console.error('Error crafting potion:', error)
    return NextResponse.json({ error: message }, { status: isValidation ? 400 : 500 })
  }
}
