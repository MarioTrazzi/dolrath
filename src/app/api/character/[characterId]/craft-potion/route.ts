import { requireApiActor } from '@/lib/botFleetAuth'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { getTFromRequest, getLocaleFromRequest } from '@/lib/i18n/server'
import { localizeItemName, catalogNameEn } from '@/lib/i18n/catalog'
import { ConsumableSubtype } from '@prisma/client'
import { getConsumableByName, isIngredientItem, isMaterialItem, isProcessedItem } from '@/lib/itemCatalog'
import { POTION_RECIPES, getRecipeById } from '@/lib/alchemy'
import { addHistoryEntry } from '@/lib/characterHistory'
import { advanceQuestProgress } from '@/lib/questServer'
import { consumeFromPool, depositCraftOutput, loadMaterialPool, poolCount } from '@/lib/materialPool'
import { getCraftChance, getCraftMinLevel, rollCraftBatch } from '@/lib/craftingProfession'
import { getUserAlchemyXp } from '@/lib/craftingServer'
import { getProfessionLevel, getProfessionLevelInfo } from '@/lib/professionSystem'
import { localizeServerError } from '@/lib/i18n/serverErrors'

// ⚗️ Profissão de ALQUIMIA — crafta poções no Triângulo de Transmutação.
// Consome os ingredientes + taxa em gold (carteira do personagem) para TODAS
// as unidades do lote, sucesso ou falha. Cada unidade rola chance de sucesso
// (craftingProfession.ts — raridade da receita + nível da CONTA, gating por
// minLevel) e credita alchemyXp no personagem; o NÍVEL é a soma da conta
// (craftingServer.ts). O servidor decide tudo: nível, chance e RNG aqui dentro.

// GET — nível de Alquimia da conta + chance/gating de cada receita (para a UI).
export async function GET(
  request: NextRequest,
  { params }: { params: { characterId: string } }
) {
  const t = getTFromRequest(request)
  try {
    const resolved = await requireApiActor(request, params.characterId)
    if ('error' in resolved) return resolved.error
    const userId = resolved.actor.userId
    const character = await prisma.character.findFirst({
      where: { id: params.characterId, userId },
      select: { id: true },
    })
    if (!character) {
      return NextResponse.json({ error: t('Character not found') }, { status: 404 })
    }

    const xp = await getUserAlchemyXp(userId)
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
    return NextResponse.json({ error: t('Internal server error') }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { characterId: string } }
) {
  const t = getTFromRequest(request)
  try {
    const resolved = await requireApiActor(request, params.characterId)
    if ('error' in resolved) return resolved.error
    const userId = resolved.actor.userId

    const body = await request.json()
    const recipeId: string | undefined = body?.recipeId
    if (!recipeId) {
      return NextResponse.json({ error: t('recipeId is required') }, { status: 400 })
    }
    // Fabricação em lote: qtd de tentativas de uma vez (gasta gold×qty e
    // ingredientes×qty — as falhas também consomem). Padrão 1; teto de 99.
    const rawQty = Number(body?.quantity ?? 1)
    const quantity = Number.isFinite(rawQty) ? Math.min(99, Math.max(1, Math.floor(rawQty))) : 1

    const recipe = getRecipeById(recipeId)
    if (!recipe) {
      return NextResponse.json({ error: t('Recipe not found') }, { status: 404 })
    }

    const potion = getConsumableByName(recipe.outputName)
    if (!potion) {
      return NextResponse.json({ error: t('The recipe potion does not exist in the catalog') }, { status: 500 })
    }

    const character = await prisma.character.findFirst({
      where: { id: params.characterId, userId },
    })
    if (!character) {
      return NextResponse.json({ error: t('Character not found') }, { status: 404 })
    }

    // Nível de Alquimia da CONTA + gating da receita (o client nunca manda nível/chance).
    const xpBefore = await getUserAlchemyXp(userId)
    const level = getProfessionLevel(xpBefore)
    const minLevel = getCraftMinLevel(recipe.rarity)
    if (level < minLevel) {
      return NextResponse.json({ error: t('Requires Alchemy level {n}.', { n: minLevel }) }, { status: 400 })
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

      // 2. Ingredientes — POOL: mochila do herói + Baú Geral da conta.
      // Só conta o que é insumo de craft (não poções de mesmo nome). Classifica pelo
      // catálogo para também aceitar registros antigos sem stats.kind. Materiais de
      // forja e PROCESSADOS (Extrato Herbal etc. — destilaria do Processamento) valem
      // quando a receita os pede — o casamento por nome com recipe.ingredients já
      // restringe o resto. [[dolrath-alchemy-crafting]]
      const names = recipe.ingredients.map((i) => i.name)
      const pool = await loadMaterialPool(tx, {
        characterId: character.id,
        userId,
        names,
        accept: (item) => isIngredientItem(item) || isMaterialItem(item) || isProcessedItem(item),
      })

      // Confere quantidade de cada ingrediente (×quantity para o lote)
      for (const req of recipe.ingredients) {
        const need = req.quantity * quantity
        const have = poolCount(pool, req.name)
        if (have < need) {
          throw new Error(`Falta ${req.name} (tem ${have}, precisa de ${need}).`)
        }
      }

      // 3. Consome os ingredientes do LOTE INTEIRO (as falhas também consomem),
      //    mochila antes do baú.
      await consumeFromPool(
        tx,
        pool,
        recipe.ingredients.map((i) => ({ name: i.name, quantity: i.quantity * quantity })),
      )

      // 4. Debita o gold e credita o XP de Alquimia no mesmo update
      await tx.character.update({
        where: { id: character.id },
        data: { gold: { decrement: totalGoldCost }, alchemyXp: { increment: roll.xpGained } },
      })

      // 5-6. Produz só as unidades que PASSARAM na rolagem (consumível empilha
      // em enhancementLevel 0 — o lote inteiro entra numa única linha, 1 slot).
      let potionItemId: string | null = null
      let outputWentTo: 'character' | 'global' = 'character'
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

        // Mochila cheia transborda pro Baú Geral em vez de barrar: o ingrediente
        // pode ter vindo todo do baú. [[materialPool]]
        outputWentTo = await depositCraftOutput(tx, {
          characterId: character.id,
          userId,
          itemId: potionItem.id,
          quantity: roll.succeeded,
          isEquipment: false,
        })
        potionItemId = potionItem.id
      }

      const updatedChar = await tx.character.findUnique({
        where: { id: character.id },
        select: { gold: true },
      })
      return { potionItemId, outputWentTo, characterGold: updatedChar?.gold ?? null }
    })

    try {
      await addHistoryEntry({
        characterId: character.id,
        activityType: 'ITEM_GAINED',
        description: roll.succeeded > 0
          // Histórico gravado no banco: EN canônico (como o metadata da NFT).
          ? `⚗️ Crafted ${roll.succeeded}× ${catalogNameEn(recipe.outputName)}${roll.failed > 0 ? ` (${roll.failed} fail${roll.failed === 1 ? '' : 's'})` : ''} (−${totalGoldCost} gold).`
          : `⚗️ Transmutation of ${catalogNameEn(recipe.outputName)} failed — ingredients and fee lost (−${totalGoldCost} gold).`,
        itemId: result.potionItemId ?? undefined,
        goldAmount: -totalGoldCost,
      })
    } catch (historyError) {
      console.error('Erro ao registrar histórico de craft:', historyError)
    }

    // 🗺️ Missões: pós-commit e fire-and-forget (só unidades que passaram na rolagem).
    if (roll.succeeded > 0) {
      advanceQuestProgress(character.id, { type: 'craft_potion', amount: roll.succeeded }).catch(() => {})
    }

    // levelInfo pós-crédito (a UI anima a barra de XP com isto).
    const levelInfo = getProfessionLevelInfo(xpBefore + roll.xpGained)

    const outName = localizeItemName(recipe.outputName, getLocaleFromRequest(request))
    const baseMessage = roll.failed === 0
      ? roll.attempted > 1
        ? t('⚗️ {n}× {name} created successfully!', { n: roll.attempted, name: outName })
        : t('⚗️ {name} created successfully!', { name: outName })
      : roll.succeeded === 0
        ? roll.attempted > 1
          ? t('💥 The transmutation failed {n}× — the ingredients were lost.', { n: roll.attempted })
          : t('💥 The transmutation failed — the ingredients were lost.')
        : t('⚗️ {ok} of {total} {name} survived the cauldron.', {
            ok: roll.succeeded, total: roll.attempted, name: outName,
          })

    // Mochila cheia: a poção caiu no Baú Geral. Dizer isso é obrigatório — senão
    // o jogador acha que o craft sumiu.
    const message = roll.succeeded > 0 && result.outputWentTo === 'global'
      ? `${baseMessage} ${t('📦 Your backpack was full — it went to the Global Chest.')}`
      : baseMessage

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
      crafted: roll.succeeded,
      outputName: recipe.outputName,
      rarity: recipe.rarity,
      outputWentTo: result.outputWentTo,
      message,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro interno do servidor'
    // Erros de validação (gold/ingrediente/inventário cheio/nível) são 400; o resto 500.
    const isValidation = /insuficiente|Falta |Inventário cheio|Baú Geral cheio|Requer Alquimia/.test(message)
    console.error('Error crafting potion:', error)
    return NextResponse.json({ error: localizeServerError(message, getLocaleFromRequest(request)) }, { status: isValidation ? 400 : 500 })
  }
}
