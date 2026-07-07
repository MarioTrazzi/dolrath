import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { ConsumableSubtype } from '@prisma/client'
import { getConsumableByName, isIngredientItem, isMaterialItem } from '@/lib/itemCatalog'
import { POTION_RECIPES, getRecipeById } from '@/lib/alchemy'
import { addHistoryEntry } from '@/lib/characterHistory'
import { assertInventoryRoom } from '@/lib/inventoryMutations'
import { getCraftChance, getCraftMinLevel, rollCraftBatch } from '@/lib/craftingProfession'
import { getUserAlchemyXp } from '@/lib/craftingServer'
import { getProfessionLevel, getProfessionLevelInfo } from '@/lib/professionSystem'

// ⚗️ Profissão de ALQUIMIA — crafta poções no Triângulo de Transmutação.
// Consome os ingredientes + taxa em gold (carteira do personagem) para TODAS
// as unidades do lote, sucesso ou falha. Cada unidade rola chance de sucesso
// (craftingProfession.ts — raridade da receita + nível da CONTA, gating por
// minLevel) e credita alchemyXp no personagem; o NÍVEL é a soma da conta
// (craftingServer.ts). O servidor decide tudo: nível, chance e RNG aqui dentro.

// GET — nível de Alquimia da conta + chance/gating de cada receita (para a UI).
export async function GET(
  _request: NextRequest,
  { params }: { params: { characterId: string } }
) {
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
      return NextResponse.json({ error: 'Personagem não encontrado' }, { status: 404 })
    }

    const xp = await getUserAlchemyXp(session.user.id)
    const levelInfo = getProfessionLevelInfo(xp)
    const recipes = POTION_RECIPES.map((r) => {
      const minLevel = getCraftMinLevel(r.rarity)
      return {
        id: r.id,
        minLevel,
        chance: getCraftChance(r.rarity, levelInfo.level),
        unlocked: levelInfo.level >= minLevel,
      }
    })
    return NextResponse.json({ xp, levelInfo, recipes })
  } catch (error) {
    console.error('Error loading alchemy info:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
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
    // Fabricação em lote: qtd de tentativas de uma vez (gasta gold×qty e
    // ingredientes×qty — as falhas também consomem). Padrão 1; teto de 99.
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

    // Nível de Alquimia da CONTA + gating da receita (o client nunca manda nível/chance).
    const xpBefore = await getUserAlchemyXp(userId)
    const level = getProfessionLevel(xpBefore)
    const minLevel = getCraftMinLevel(recipe.rarity)
    if (level < minLevel) {
      return NextResponse.json({ error: `Requer Alquimia nível ${minLevel}.` }, { status: 400 })
    }

    // RNG FORA da transação — retry de transação não pode re-rolar o resultado.
    const roll = rollCraftBatch(recipe.rarity, level, quantity)

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

      // 3. Consome os ingredientes do LOTE INTEIRO (as falhas também consomem)
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

      // 4. Debita o gold e credita o XP de Alquimia no mesmo update
      await tx.character.update({
        where: { id: character.id },
        data: { gold: { decrement: totalGoldCost }, alchemyXp: { increment: roll.xpGained } },
      })

      // 5-6. Produz só as unidades que PASSARAM na rolagem (consumível empilha
      // em enhancementLevel 0 — o lote inteiro entra numa única linha, 1 slot).
      let potionItemId: string | null = null
      if (roll.succeeded > 0) {
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

        const existing = await tx.characterInventory.findFirst({
          where: { characterId: character.id, itemId: potionItem.id, enhancementLevel: 0 },
        })
        if (existing) {
          await tx.characterInventory.update({
            where: { id: existing.id },
            data: { quantity: { increment: roll.succeeded } },
          })
        } else {
          // Precisa de uma linha nova — barra antes de cobrar gold/ingrediente à toa.
          await assertInventoryRoom(tx, character.id, 1)
          await tx.characterInventory.create({
            data: { characterId: character.id, itemId: potionItem.id, quantity: roll.succeeded },
          })
        }
        potionItemId = potionItem.id
      }

      const updatedChar = await tx.character.findUnique({
        where: { id: character.id },
        select: { gold: true },
      })
      return { potionItemId, characterGold: updatedChar?.gold ?? null }
    })

    try {
      await addHistoryEntry({
        characterId: character.id,
        activityType: 'ITEM_GAINED',
        description: roll.succeeded > 0
          ? `⚗️ Craftou ${roll.succeeded}× ${recipe.outputName}${roll.failed > 0 ? ` (${roll.failed} falha${roll.failed === 1 ? '' : 's'})` : ''} (−${totalGoldCost} gold).`
          : `⚗️ Transmutação de ${recipe.outputName} falhou — ingredientes e taxa perdidos (−${totalGoldCost} gold).`,
        itemId: result.potionItemId ?? undefined,
        goldAmount: -totalGoldCost,
      })
    } catch (historyError) {
      console.error('Erro ao registrar histórico de craft:', historyError)
    }

    // levelInfo pós-crédito (a UI anima a barra de XP com isto).
    const levelInfo = getProfessionLevelInfo(xpBefore + roll.xpGained)

    const message = roll.failed === 0
      ? roll.attempted > 1
        ? `⚗️ ${roll.attempted}× ${recipe.outputName} criadas com sucesso!`
        : `⚗️ ${recipe.outputName} criada com sucesso!`
      : roll.succeeded === 0
        ? `💥 A transmutação falhou${roll.attempted > 1 ? ` ${roll.attempted}×` : ''} — os ingredientes se perderam.`
        : `⚗️ ${roll.succeeded} de ${roll.attempted} ${recipe.outputName} sobreviveram ao caldeirão.`

    return NextResponse.json({
      success: true,
      attempted: roll.attempted,
      succeeded: roll.succeeded,
      failed: roll.failed,
      chance: roll.chance,
      xpGained: roll.xpGained,
      levelInfo,
      characterGold: result.characterGold,
      crafted: roll.succeeded,
      outputName: recipe.outputName,
      rarity: recipe.rarity,
      message,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro interno do servidor'
    // Erros de validação (gold/ingrediente/inventário cheio/nível) são 400; o resto 500.
    const isValidation = /insuficiente|Falta |Inventário cheio|Requer Alquimia/.test(message)
    console.error('Error crafting potion:', error)
    return NextResponse.json({ error: message }, { status: isValidation ? 400 : 500 })
  }
}
