import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { getTFromRequest, getLocaleFromRequest } from '@/lib/i18n/server'
import { localizeItemName, catalogNameEn } from '@/lib/i18n/catalog'
import { ConsumableSubtype } from '@prisma/client'
import {
  COOKING_RECIPES,
  getCookingOutput,
  getCookingRecipeById,
} from '@/lib/cooking'
import { itemImagePath } from '@/lib/itemCatalog'
import { addHistoryEntry } from '@/lib/characterHistory'
import { advanceQuestProgress } from '@/lib/questServer'
import { assertInventoryRoom } from '@/lib/inventoryMutations'
import { getUserCookXp } from '@/lib/craftingServer'
import { getProfessionLevel, getProfessionLevelInfo } from '@/lib/professionSystem'

// 🍳 Profissão de CULINÁRIA — cozinha insumos da fazenda/coleta/moagem em
// pratos do FOOD_CATALOG (buff de atributo por tempo real; motor em
// lib/foodBuff.ts). SEM falha: é o modelo do processamento (conversão, não
// fabricação) — todo prato sai, XP fixo da receita, gating por minLevel.
// Consome os insumos + taxa em gold (carteira do personagem) e credita cookXp
// no personagem; o NÍVEL é a soma da conta (craftingServer.ts).

// GET — nível de Culinária da conta + gating de cada receita (para a UI).
export async function GET(
  request: NextRequest,
  { params }: { params: { characterId: string } }
) {
  const t = getTFromRequest(request)
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const character = await prisma.character.findFirst({
      where: { id: params.characterId, userId: session.user.id },
      select: { id: true },
    })
    if (!character) {
      return NextResponse.json({ error: t('Character not found') }, { status: 404 })
    }

    const xp = await getUserCookXp(session.user.id)
    const levelInfo = getProfessionLevelInfo(xp)
    const recipes = COOKING_RECIPES.map((r) => ({
      id: r.id,
      minLevel: r.minLevel,
      chance: 1,
      noFail: true,
      unlocked: levelInfo.level >= r.minLevel,
    }))
    return NextResponse.json({ xp, levelInfo, recipes })
  } catch (error) {
    console.error('Error loading cooking info:', error)
    return NextResponse.json({ error: t('Internal server error') }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { characterId: string } }
) {
  const t = getTFromRequest(request)
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = session.user.id

    const body = await request.json()
    const recipeId: string | undefined = body?.recipeId
    if (!recipeId) {
      return NextResponse.json({ error: t('recipeId is required') }, { status: 400 })
    }
    const rawQuantity = Number(body?.quantity ?? 1)
    const quantity = Number.isFinite(rawQuantity) ? Math.min(99, Math.max(1, Math.floor(rawQuantity))) : 1

    const recipe = getCookingRecipeById(recipeId)
    if (!recipe) {
      return NextResponse.json({ error: t('Recipe not found') }, { status: 404 })
    }

    const food = getCookingOutput(recipe)
    if (!food) {
      return NextResponse.json({ error: t('The recipe dish does not exist in the catalog') }, { status: 500 })
    }

    const character = await prisma.character.findFirst({
      where: { id: params.characterId, userId },
    })
    if (!character) {
      return NextResponse.json({ error: t('Character not found') }, { status: 404 })
    }

    // Nível de Culinária da CONTA + gating da receita (o client nunca manda nível).
    const xpBefore = await getUserCookXp(userId)
    const level = getProfessionLevel(xpBefore)
    if (level < recipe.minLevel) {
      return NextResponse.json({ error: t('Requires Cooking level {n}.', { n: recipe.minLevel }) }, { status: 400 })
    }

    // Sem RNG: cozinhar é conversão determinística (modelo do processamento) —
    // todos os pratos saem, XP fixo da receita. Mantemos o shape do roll das
    // rotas irmãs para a UI reutilizar o mesmo contrato.
    const roll = {
      attempted: quantity,
      succeeded: quantity,
      failed: 0,
      xpGained: recipe.xp * quantity,
      chance: 1,
      units: Array.from({ length: quantity }, () => ({ ok: true })),
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Gold (taxa da cozinha) — carteira do personagem.
      const charGold = await tx.character.findUnique({
        where: { id: character.id },
        select: { gold: true },
      })
      const totalGoldCost = recipe.goldCost * quantity
      if (!charGold || charGold.gold < totalGoldCost) {
        throw new Error(`GOLD insuficiente na carteira do personagem: precisa de ${totalGoldCost} 🪙.`)
      }

      // 2. Insumos — linhas CONSUMABLE com o nome exigido (ingredientes têm
      //    stats.kind='ingredient', processados 'processed', Ração é consumível
      //    comum — todos CONSUMABLE, então casamos por nome).
      const names = recipe.inputs.map((m) => m.name)
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

      for (const req of recipe.inputs) {
        const needed = req.quantity * quantity
        const have = (byName.get(req.name) ?? []).reduce((n, r) => n + r.quantity, 0)
        if (have < needed) {
          throw new Error(`Falta ${req.name} (tem ${have}, precisa de ${needed}).`)
        }
      }

      // 3. Consome os insumos do lote inteiro.
      for (const req of recipe.inputs) {
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

      // 4. Debita o gold e credita o XP de Culinária no mesmo update.
      await tx.character.update({
        where: { id: character.id },
        data: { gold: { decrement: totalGoldCost }, cookXp: { increment: roll.xpGained } },
      })

      // 5. Produz o prato (acha/cria o Item on-demand e EMPILHA — comida agrupa).
      let item = await tx.item.findFirst({ where: { name: recipe.outputName } })
      if (!item) {
        item = await tx.item.create({
          data: {
            name: food.name,
            description: food.description,
            type: 'CONSUMABLE',
            subtype: food.subtype as ConsumableSubtype,
            image: itemImagePath(food.name),
            level: food.level,
            goldPrice: food.goldPrice,
            stats: {
              ...food.stats,
              rarity: food.rarity,
              sellPrice: Math.floor(food.goldPrice * 0.25),
              source: 'cooking',
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
          data: { quantity: { increment: roll.succeeded } },
        })
      } else {
        await assertInventoryRoom(tx, character.id, 1)
        await tx.characterInventory.create({
          data: { characterId: character.id, itemId: item.id, quantity: roll.succeeded },
        })
      }

      const updatedChar = await tx.character.findUnique({
        where: { id: character.id },
        select: { gold: true },
      })
      return { outputItemId: item.id, characterGold: updatedChar?.gold ?? null }
    })

    const totalGoldCost = recipe.goldCost * quantity
    try {
      await addHistoryEntry({
        characterId: character.id,
        activityType: 'ITEM_GAINED',
        // Histórico gravado no banco: EN canônico (como o metadata da NFT).
        description: `🍳 Cooked ${roll.attempted > 1 ? `${roll.attempted}× ` : ''}${catalogNameEn(recipe.outputName)} (−${totalGoldCost} gold).`,
        itemId: result.outputItemId ?? undefined,
        goldAmount: -totalGoldCost,
      })
    } catch (historyError) {
      console.error('Erro ao registrar histórico de culinária:', historyError)
    }

    // 🗺️ Missões: pós-commit e fire-and-forget.
    if (roll.succeeded > 0) {
      advanceQuestProgress(character.id, { type: 'craft_cook', amount: roll.succeeded }).catch(() => {})
    }

    // levelInfo pós-crédito (a UI anima a barra de XP com isto).
    const levelInfo = getProfessionLevelInfo(xpBefore + roll.xpGained)

    return NextResponse.json({
      success: true,
      attempted: roll.attempted,
      succeeded: roll.succeeded,
      failed: roll.failed,
      chance: roll.chance,
      // Sequência por unidade — a bancada encena um por vez. [[useBatchReveal]]
      units: roll.units,
      xpGained: roll.xpGained,
      levelInfo,
      characterGold: result.characterGold,
      outputName: recipe.outputName,
      rarity: recipe.rarity,
      message: roll.attempted > 1
        ? t('🍳 {n}× {name} cooked successfully!', {
            n: roll.attempted,
            name: localizeItemName(recipe.outputName, getLocaleFromRequest(request)),
          })
        : t('🍳 {name} cooked successfully!', {
            name: localizeItemName(recipe.outputName, getLocaleFromRequest(request)),
          }),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro interno do servidor'
    const isValidation = /insuficiente|Falta |Inventário cheio|Requer Culinária/.test(message)
    console.error('Error cooking food:', error)
    return NextResponse.json({ error: message }, { status: isValidation ? 400 : 500 })
  }
}
