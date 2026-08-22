import { requireApiActor } from '@/lib/botFleetAuth'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { getTFromRequest, getLocaleFromRequest } from '@/lib/i18n/server'
import { localizeItemName, catalogNameEn } from '@/lib/i18n/catalog'
import { ConsumableSubtype } from '@prisma/client'
import {
  PROCESSING_BATCH_MAX,
  PROCESSING_RECIPES,
  getProcessingOutput,
  getProcessingRecipeById,
  processingYieldChance,
  rollProcessingBatch,
} from '@/lib/processing'
import { itemImagePath } from '@/lib/itemCatalog'
import { addHistoryEntry } from '@/lib/characterHistory'
import { advanceQuestProgress } from '@/lib/questServer'
import { assertInventoryRoom } from '@/lib/inventoryMutations'
import { getUserProcessXp } from '@/lib/craftingServer'
import { getProfessionLevel, getProfessionLevelInfo } from '@/lib/professionSystem'

// ⚙️ Profissão de PROCESSAMENTO — beneficia matéria-prima crua em insumo
// processado (Barras/Tecidos/Extratos + Ração/Bandagem) e refina estilhaços
// em Pedra Negra (10:1). SEM falha: conversão, não fabricação — toda unidade
// passa, XP fixo da receita, gating por minLevel. Consome os insumos + taxa em
// gold (carteira do personagem) e credita processXp no personagem; o NÍVEL é a
// soma da conta (craftingServer.ts). O servidor decide tudo (nível do aggregate).
//
// O lote é resolvido UNIDADE A UNIDADE (rollProcessingBatch): cada unidade tem
// chance própria de RENDIMENTO EXTRA (sair dobrada) pelo nível da profissão.
// Insumo/taxa/XP seguem as tentativas; só a saída creditada usa `produced`.
// Refino de estilhaço é `noYield` — chance 0, sempre 10:1 exato.

// GET — nível de Processamento da conta + gating de cada receita (para a UI).
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

    const xp = await getUserProcessXp(userId)
    const levelInfo = getProfessionLevelInfo(xp)
    const recipes = PROCESSING_RECIPES.map((r) => ({
      id: r.id,
      minLevel: r.minLevel,
      chance: 1,
      noFail: true,
      yieldChance: processingYieldChance(r, levelInfo.level),
      unlocked: levelInfo.level >= r.minLevel,
    }))
    return NextResponse.json({ xp, levelInfo, recipes })
  } catch (error) {
    console.error('Error loading processing info:', error)
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
    const rawQuantity = Number(body?.quantity ?? 1)
    const quantity = Number.isFinite(rawQuantity)
      ? Math.min(PROCESSING_BATCH_MAX, Math.max(1, Math.floor(rawQuantity)))
      : 1

    const recipe = getProcessingRecipeById(recipeId)
    if (!recipe) {
      return NextResponse.json({ error: t('Recipe not found') }, { status: 404 })
    }

    // Valida a saída (processado, consumível, pedra ou ingrediente — Água Pura).
    const output = getProcessingOutput(recipe)
    if (!output.processed && !output.consumable && !output.stone && !output.ingredient) {
      return NextResponse.json({ error: t('The recipe output does not exist in the catalog') }, { status: 500 })
    }

    const character = await prisma.character.findFirst({
      where: { id: params.characterId, userId },
    })
    if (!character) {
      return NextResponse.json({ error: t('Character not found') }, { status: 404 })
    }

    // Nível de Processamento da CONTA + gating da receita (o client nunca manda nível).
    const xpBefore = await getUserProcessXp(userId)
    const level = getProfessionLevel(xpBefore)
    if (level < recipe.minLevel) {
      return NextResponse.json({ error: t('Requires Processing level {n}.', { n: recipe.minLevel }) }, { status: 400 })
    }

    // Sem falha (toda unidade passa), mas COM rendimento: cada unidade rola
    // sozinha a chance de sair dobrada. Rolado FORA da $transaction — retry de
    // transação não pode re-rolar o RNG.
    const roll = rollProcessingBatch(recipe, level, quantity)

    const result = await prisma.$transaction(async (tx) => {
      // 1. Gold (taxa da bancada) — carteira do personagem.
      const charGold = await tx.character.findUnique({
        where: { id: character.id },
        select: { gold: true },
      })
      const totalGoldCost = recipe.goldCost * quantity
      if (!charGold || charGold.gold < totalGoldCost) {
        throw new Error(`GOLD insuficiente na carteira do personagem: precisa de ${totalGoldCost} 🪙.`)
      }

      // 2. Insumos — linhas CONSUMABLE com o nome exigido (materiais têm
      //    stats.kind='material', ingredientes 'ingredient', processados
      //    'processed' — todos CONSUMABLE, então casamos por nome).
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

      // 4. Debita o gold e credita o XP de Processamento no mesmo update.
      await tx.character.update({
        where: { id: character.id },
        data: { gold: { decrement: totalGoldCost }, processXp: { increment: roll.xpGained } },
      })

      // 5. Produz a saída (acha/cria o Item on-demand e EMPILHA — insumo/pedra agrupa).
      let item = await tx.item.findFirst({ where: { name: recipe.outputName } })
      if (!item) {
        if (output.processed) {
          item = await tx.item.create({
            data: {
              name: output.processed.name,
              description: output.processed.description,
              type: 'CONSUMABLE',
              image: itemImagePath(output.processed.name),
              level: 1,
              goldPrice: output.processed.goldValue,
              stats: {
                kind: 'processed',
                rarity: output.processed.rarity,
                battleUsable: false,
                sellPrice: Math.floor(output.processed.goldValue * 0.5),
                source: 'processing',
              },
            },
          })
        } else if (output.stone) {
          item = await tx.item.create({
            data: {
              name: output.stone.name,
              description: output.stone.description,
              type: 'CONSUMABLE',
              image: itemImagePath(output.stone.name),
              level: output.stone.level,
              goldPrice: output.stone.goldPrice,
              stats: {
                rarity: output.stone.rarity,
                enhancementStone: output.stone.code,
                battleUsable: false,
                sellPrice: output.stone.sellPrice,
                source: 'processing',
              },
            },
          })
        } else if (output.ingredient) {
          item = await tx.item.create({
            data: {
              name: output.ingredient.name,
              description: output.ingredient.description,
              type: 'CONSUMABLE',
              image: itemImagePath(output.ingredient.name),
              level: 1,
              goldPrice: output.ingredient.goldValue,
              stats: {
                kind: 'ingredient',
                rarity: output.ingredient.rarity,
                emoji: output.ingredient.emoji,
                sellPrice: Math.floor(output.ingredient.goldValue * 0.5),
                source: 'processing',
              },
            },
          })
        } else {
          item = await tx.item.create({
            data: {
              name: output.consumable!.name,
              description: output.consumable!.description,
              type: 'CONSUMABLE',
              subtype: output.consumable!.subtype as ConsumableSubtype,
              image: itemImagePath(output.consumable!.name),
              level: output.consumable!.level,
              goldPrice: output.consumable!.goldPrice,
              stats: {
                ...output.consumable!.stats,
                rarity: output.consumable!.rarity,
                sellPrice: Math.floor(output.consumable!.goldPrice * 0.6),
              },
            },
          })
        }
      }
      const existing = await tx.characterInventory.findFirst({
        where: { characterId: character.id, itemId: item.id, enhancementLevel: 0 },
      })
      if (existing) {
        await tx.characterInventory.update({
          where: { id: existing.id },
          data: { quantity: { increment: roll.produced } },
        })
      } else {
        await assertInventoryRoom(tx, character.id, 1)
        await tx.characterInventory.create({
          data: { characterId: character.id, itemId: item.id, quantity: roll.produced },
        })
      }

      const updatedChar = await tx.character.findUnique({
        where: { id: character.id },
        select: { gold: true },
      })
      return { outputItemId: item.id, characterGold: updatedChar?.gold ?? null }
    })

    const totalGoldCost = recipe.goldCost * quantity
    const bonusSuffix = roll.bonus > 0 ? ` (+${roll.bonus} de rendimento)` : ''
    try {
      await addHistoryEntry({
        characterId: character.id,
        activityType: 'ITEM_GAINED',
        // Histórico gravado no banco: EN canônico (como o metadata da NFT).
        description: `⚙️ Processed ${roll.produced > 1 ? `${roll.produced}× ` : ''}${catalogNameEn(recipe.outputName)}${bonusSuffix} (−${totalGoldCost} gold).`,
        itemId: result.outputItemId ?? undefined,
        goldAmount: -totalGoldCost,
      })
    } catch (historyError) {
      console.error('Erro ao registrar histórico de processamento:', historyError)
    }

    // 🗺️ Missões: pós-commit e fire-and-forget. Conta TENTATIVAS (o extra é brinde).
    if (roll.attempted > 0) {
      advanceQuestProgress(character.id, { type: 'craft_process', amount: roll.attempted }).catch(() => {})
    }

    // levelInfo pós-crédito (a UI anima a barra de XP com isto).
    const levelInfo = getProfessionLevelInfo(xpBefore + roll.xpGained)

    return NextResponse.json({
      success: true,
      attempted: roll.attempted,
      // succeeded/failed/chance seguem o contrato das rotas irmãs (craft com
      // falha); aqui sucesso == tentativa e a chance exibida é a de rendimento.
      succeeded: roll.attempted,
      failed: 0,
      chance: 1,
      produced: roll.produced,
      bonus: roll.bonus,
      yieldChance: roll.chance,
      // Sequência por unidade — a bancada encena um por vez. [[useBatchReveal]]
      units: roll.units,
      xpGained: roll.xpGained,
      levelInfo,
      characterGold: result.characterGold,
      outputName: recipe.outputName,
      rarity: recipe.rarity,
      message: roll.produced > 1
        ? t('⚙️ {n}× {name} processed successfully!', {
            n: roll.produced,
            name: localizeItemName(recipe.outputName, getLocaleFromRequest(request)),
          })
        : t('⚙️ {name} processed successfully!', {
            name: localizeItemName(recipe.outputName, getLocaleFromRequest(request)),
          }),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro interno do servidor'
    const isValidation = /insuficiente|Falta |Inventário cheio|Requer Processamento/.test(message)
    console.error('Error processing item:', error)
    return NextResponse.json({ error: message }, { status: isValidation ? 400 : 500 })
  }
}
