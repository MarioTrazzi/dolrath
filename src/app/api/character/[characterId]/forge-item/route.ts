import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { ItemType } from '@prisma/client'
import { getForgeRecipeById, getForgeOutputCatalogItem } from '@/lib/forge'
import { itemImagePath } from '@/lib/itemCatalog'
import { STONE_NAMES } from '@/lib/enhancementSystem'
import { addHistoryEntry } from '@/lib/characterHistory'
import { assertInventoryRoom } from '@/lib/inventoryMutations'

// ⚒️ Crafta uma peça de equipamento OU refina uma pedra na Mesa de Forja.
// Consome materiais/pedras do inventário do personagem + taxa em gold (carteira
// do personagem, igual à alquimia). Sucesso garantido (sem RNG).

// Fallback de stats para criar a pedra de saída do refino caso ainda não exista
// no banco (em produção já está seedada — ver api/seed/route.ts).
const STONE_META: Record<string, { code: string; rarity: string; goldPrice: number; sellPrice: number; level: number }> = {
  [STONE_NAMES.WEAPON_BASIC]: { code: 'WEAPON_BASIC', rarity: 'UNCOMMON', goldPrice: 250, sellPrice: 150, level: 1 },
  [STONE_NAMES.ARMOR_BASIC]: { code: 'ARMOR_BASIC', rarity: 'UNCOMMON', goldPrice: 220, sellPrice: 130, level: 1 },
  [STONE_NAMES.WEAPON_CONCENTRATED]: { code: 'WEAPON_CONCENTRATED', rarity: 'EPIC', goldPrice: 2500, sellPrice: 1500, level: 30 },
  [STONE_NAMES.ARMOR_CONCENTRATED]: { code: 'ARMOR_CONCENTRATED', rarity: 'EPIC', goldPrice: 2200, sellPrice: 1300, level: 30 },
}

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

    const recipe = getForgeRecipeById(recipeId)
    if (!recipe) {
      return NextResponse.json({ error: 'Receita não encontrada' }, { status: 404 })
    }

    // Valida que a saída existe (gear → catálogo; stone → STONE_META).
    const catalogItem = getForgeOutputCatalogItem(recipe)
    if (recipe.kind === 'gear' && !catalogItem) {
      return NextResponse.json({ error: 'Peça da receita não existe no catálogo' }, { status: 500 })
    }
    if (recipe.kind === 'stone' && !STONE_META[recipe.outputName]) {
      return NextResponse.json({ error: 'Pedra da receita desconhecida' }, { status: 500 })
    }

    const character = await prisma.character.findFirst({
      where: { id: params.characterId, userId },
    })
    if (!character) {
      return NextResponse.json({ error: 'Personagem não encontrado' }, { status: 404 })
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Gold (taxa do ferreiro) — carteira do personagem.
      const charGold = await tx.character.findUnique({
        where: { id: character.id },
        select: { gold: true },
      })
      if (!charGold || charGold.gold < recipe.goldCost) {
        throw new Error(`GOLD insuficiente na carteira do personagem: precisa de ${recipe.goldCost} 🪙.`)
      }

      // 2. Materiais/pedras de entrada — linhas CONSUMABLE com o nome exigido.
      //    (materiais têm stats.kind='material'; pedras têm stats.enhancementStone —
      //    ambos CONSUMABLE, então casamos por nome dentro de CONSUMABLE.)
      const names = recipe.materials.map((m) => m.name)
      const rows = await tx.characterInventory.findMany({
        where: {
          characterId: character.id,
          item: { name: { in: names }, type: 'CONSUMABLE' },
        },
        include: { item: true },
      })

      const byName = new Map<string, typeof rows>()
      for (const r of rows) {
        const arr = byName.get(r.item.name) ?? []
        arr.push(r)
        byName.set(r.item.name, arr)
      }

      for (const req of recipe.materials) {
        const have = (byName.get(req.name) ?? []).reduce((n, r) => n + r.quantity, 0)
        if (have < req.quantity) {
          throw new Error(`Falta ${req.name} (tem ${have}, precisa de ${req.quantity}).`)
        }
      }

      // 3. Consome os materiais (decrementa; deleta na qtd 0).
      for (const req of recipe.materials) {
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

      // 4. Debita o gold.
      await tx.character.update({
        where: { id: character.id },
        data: { gold: { decrement: recipe.goldCost } },
      })

      // 5. Produz a saída.
      let outputItemId: string
      if (recipe.kind === 'gear' && catalogItem) {
        // Acha/cria o Item da peça (mesma lógica de addDropToInventoryTx).
        let item = await tx.item.findFirst({ where: { name: catalogItem.name } })
        if (!item) {
          item = await tx.item.create({
            data: {
              name: catalogItem.name,
              description: catalogItem.description,
              type: catalogItem.type as ItemType,
              image: itemImagePath(catalogItem.name),
              level: catalogItem.level,
              goldPrice: catalogItem.goldPrice,
              stats: {
                ...catalogItem.stats,
                rarity: catalogItem.rarity,
                raceRestriction: catalogItem.raceRestriction ?? null,
                dungeons: catalogItem.dungeons,
                sellPrice: Math.floor(catalogItem.goldPrice * 0.6),
              },
            },
          })
        }
        // Equipamento NÃO empilha — cada peça é uma linha (durabilidade cheia por default).
        await assertInventoryRoom(tx, character.id, 1)
        await tx.characterInventory.create({
          data: { characterId: character.id, itemId: item.id, quantity: 1 },
        })
        outputItemId = item.id
      } else {
        // Refino: acha/cria a pedra e empilha (consumível).
        const meta = STONE_META[recipe.outputName]
        let item = await tx.item.findFirst({ where: { name: recipe.outputName } })
        if (!item) {
          item = await tx.item.create({
            data: {
              name: recipe.outputName,
              description: 'Pedra de aprimoramento refinada na forja.',
              type: 'CONSUMABLE',
              image: itemImagePath(recipe.outputName),
              level: meta.level,
              goldPrice: meta.goldPrice,
              stats: {
                rarity: meta.rarity,
                enhancementStone: meta.code,
                battleUsable: false,
                sellPrice: meta.sellPrice,
                source: 'dungeon',
              },
            },
          })
        }
        const existing = await tx.characterInventory.findFirst({
          where: { characterId: character.id, itemId: item.id, enhancementLevel: 0 },
        })
        if (existing) {
          await tx.characterInventory.update({
            where: { id: existing.id },
            data: { quantity: { increment: 1 } },
          })
        } else {
          await assertInventoryRoom(tx, character.id, 1)
          await tx.characterInventory.create({
            data: { characterId: character.id, itemId: item.id, quantity: 1 },
          })
        }
        outputItemId = item.id
      }

      const updatedChar = await tx.character.findUnique({
        where: { id: character.id },
        select: { gold: true },
      })
      return { outputItemId, characterGold: updatedChar?.gold ?? null }
    })

    try {
      await addHistoryEntry({
        characterId: character.id,
        activityType: 'ITEM_GAINED',
        description: `⚒️ Forjou ${recipe.outputName} (−${recipe.goldCost} gold).`,
        itemId: result.outputItemId,
        goldAmount: -recipe.goldCost,
      })
    } catch (historyError) {
      console.error('Erro ao registrar histórico de forja:', historyError)
    }

    return NextResponse.json({
      success: true,
      characterGold: result.characterGold,
      message: `⚒️ ${recipe.outputName} forjado com sucesso!`,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro interno do servidor'
    const isValidation = /insuficiente|Falta |Inventário cheio/.test(message)
    console.error('Error forging item:', error)
    return NextResponse.json({ error: message }, { status: isValidation ? 400 : 500 })
  }
}
