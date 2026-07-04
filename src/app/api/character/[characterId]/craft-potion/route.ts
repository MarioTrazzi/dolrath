import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { ConsumableSubtype } from '@prisma/client'
import { getConsumableByName, isIngredientItem, isMaterialItem } from '@/lib/itemCatalog'
import { getRecipeById } from '@/lib/alchemy'
import { addHistoryEntry } from '@/lib/characterHistory'
import { assertInventoryRoom } from '@/lib/inventoryMutations'

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
    // Fabricação em lote: qtd de poções a criar de uma vez (gasta gold×qty e
    // ingredientes×qty). Padrão 1; teto de 99 por chamada.
    const rawQty = Number(body?.quantity ?? 1)
    const quantity = Number.isFinite(rawQty) ? Math.min(99, Math.max(1, Math.floor(rawQty))) : 1

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

    const totalGoldCost = recipe.goldCost * quantity

    const result = await prisma.$transaction(async (tx) => {
      // 1. Gold (taxa da alquimista) — paga com a CARTEIRA DO PERSONAGEM
      // (Character.gold). Banco é só pra claim/transferência. [[bank — Opção B]]
      const charGold = await tx.character.findUnique({
        where: { id: character.id },
        select: { gold: true },
      })
      if (!charGold || charGold.gold < totalGoldCost) {
        throw new Error(`GOLD insuficiente na carteira do personagem: precisa de ${totalGoldCost} 🪙.`)
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
      // Só conta o que é insumo de craft (não poções de mesmo nome). Classifica pelo
      // catálogo para também aceitar registros antigos sem stats.kind. Materiais de
      // forja valem quando a receita os pede (ex.: Fibra de Linho na Bandagem) — o
      // casamento por nome com recipe.ingredients já restringe o resto. [[dolrath-alchemy-crafting]]
      const ingredientRows = rows.filter((r) => isIngredientItem(r.item) || isMaterialItem(r.item))

      const byName = new Map<string, typeof ingredientRows>()
      for (const r of ingredientRows) {
        const arr = byName.get(r.item.name) ?? []
        arr.push(r)
        byName.set(r.item.name, arr)
      }

      // Confere quantidade de cada ingrediente (×quantity para o lote)
      for (const req of recipe.ingredients) {
        const need = req.quantity * quantity
        const have = (byName.get(req.name) ?? []).reduce((n, r) => n + r.quantity, 0)
        if (have < need) {
          throw new Error(`Falta ${req.name} (tem ${have}, precisa de ${need}).`)
        }
      }

      // 3. Consome ingredientes (decrementa linhas; deleta na qtd 0)
      for (const req of recipe.ingredients) {
        let remaining = req.quantity * quantity
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

      // 4. Debita o gold da carteira do personagem (taxa × quantidade)
      await tx.character.update({
        where: { id: character.id },
        data: { gold: { decrement: totalGoldCost } },
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

      // 6. Adiciona ao inventário (consumível empilha em enhancementLevel 0).
      // O lote inteiro entra numa única linha (empilha), então ocupa 1 slot.
      const existing = await tx.characterInventory.findFirst({
        where: { characterId: character.id, itemId: potionItem.id, enhancementLevel: 0 },
      })
      if (existing) {
        await tx.characterInventory.update({
          where: { id: existing.id },
          data: { quantity: { increment: quantity } },
        })
      } else {
        // Precisa de uma linha nova — barra antes de cobrar gold/ingrediente à toa.
        await assertInventoryRoom(tx, character.id, 1)
        await tx.characterInventory.create({
          data: { characterId: character.id, itemId: potionItem.id, quantity },
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
        description: `⚗️ Craftou ${quantity}× ${recipe.outputName} (−${totalGoldCost} gold).`,
        itemId: result.potionItemId,
        goldAmount: -totalGoldCost,
      })
    } catch (historyError) {
      console.error('Erro ao registrar histórico de craft:', historyError)
    }

    return NextResponse.json({
      success: true,
      characterGold: result.characterGold,
      crafted: quantity,
      outputName: recipe.outputName,
      rarity: recipe.rarity,
      message: quantity > 1
        ? `⚗️ ${quantity}× ${recipe.outputName} criadas com sucesso!`
        : `⚗️ ${recipe.outputName} criada com sucesso!`,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro interno do servidor'
    // Erros de validação (gold/ingrediente/inventário cheio) são 400; o resto 500.
    const isValidation = /insuficiente|Falta |Inventário cheio/.test(message)
    console.error('Error crafting potion:', error)
    return NextResponse.json({ error: message }, { status: isValidation ? 400 : 500 })
  }
}
