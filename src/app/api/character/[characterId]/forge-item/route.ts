import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { getTFromRequest, getLocaleFromRequest } from '@/lib/i18n/server'
import { localizeItemName, catalogNameEn } from '@/lib/i18n/catalog'
import { ItemType } from '@prisma/client'
import { FORGE_RECIPES, getForgeRecipeById, getForgeOutputCatalogItem } from '@/lib/forge'
import { itemImagePath } from '@/lib/itemCatalog'
import { STONE_NAMES, STONE_META } from '@/lib/enhancementSystem'
import { addHistoryEntry } from '@/lib/characterHistory'
import { assertInventoryRoom } from '@/lib/inventoryMutations'
import {
  getCraftChance,
  getCraftMinLevel,
  isRefineRecipe,
  refineXpAndLevel,
  rollCraftBatch,
} from '@/lib/craftingProfession'
import { getUserForgeXp } from '@/lib/craftingServer'
import { advanceQuestProgress } from '@/lib/questServer'
import { getProfessionLevel, getProfessionLevelInfo } from '@/lib/professionSystem'

// ⚒️ Profissão de FORJA — crafta equipamento OU refina pedra concentrada.
// Consome materiais/pedras do inventário + taxa em gold (carteira do personagem)
// para TODAS as unidades do lote, sucesso ou falha. Gear rola chance de sucesso
// por unidade (craftingProfession.ts — raridade + nível da CONTA, gating por
// minLevel); refino concentrado continua determinístico (10 pedras → 1).
// O refino básico (10 estilhaços → Pedra Negra) está em process-item.
// Cada craft credita forgeXp no personagem; o NÍVEL é a soma da conta
// (craftingServer.ts). O servidor decide tudo: nível do aggregate, chance da
// tabela, RNG aqui dentro.

/** minLevel/chance de uma receita de forja para um dado nível da profissão. */
function forgeRecipeInfo(recipe: (typeof FORGE_RECIPES)[number], level: number) {
  if (isRefineRecipe(recipe)) {
    const { minLevel } = refineXpAndLevel(recipe.rarity)
    return { minLevel, chance: 1, noFail: true }
  }
  return { minLevel: getCraftMinLevel(recipe.rarity), chance: getCraftChance(recipe.rarity, level), noFail: false }
}

// GET — nível de Forja da conta + chance/gating de cada receita (para a UI).
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

    const xp = await getUserForgeXp(session.user.id)
    const levelInfo = getProfessionLevelInfo(xp)
    const recipes = FORGE_RECIPES.map((r) => {
      const info = forgeRecipeInfo(r, levelInfo.level)
      return { id: r.id, ...info, unlocked: levelInfo.level >= info.minLevel }
    })
    return NextResponse.json({ xp, levelInfo, recipes })
  } catch (error) {
    console.error('Error loading forge info:', error)
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

    const recipe = getForgeRecipeById(recipeId)
    if (!recipe) {
      return NextResponse.json({ error: t('Recipe not found') }, { status: 404 })
    }

    // Valida que a saída existe (gear → catálogo; stone → STONE_META).
    const catalogItem = getForgeOutputCatalogItem(recipe)
    if (recipe.kind === 'gear' && !catalogItem) {
      return NextResponse.json({ error: t('The recipe piece does not exist in the catalog') }, { status: 500 })
    }
    if (recipe.kind === 'stone' && !STONE_META[recipe.outputName]) {
      return NextResponse.json({ error: t('The recipe stone is unknown') }, { status: 500 })
    }

    const character = await prisma.character.findFirst({
      where: { id: params.characterId, userId },
    })
    if (!character) {
      return NextResponse.json({ error: t('Character not found') }, { status: 404 })
    }

    // Nível de Forja da CONTA + gating da receita (o client nunca manda nível/chance).
    const xpBefore = await getUserForgeXp(userId)
    const level = getProfessionLevel(xpBefore)
    const { minLevel } = forgeRecipeInfo(recipe, level)
    if (level < minLevel) {
      return NextResponse.json({ error: t('Requires Forge level {n}.', { n: minLevel }) }, { status: 400 })
    }

    // RNG FORA da transação — retry de transação não pode re-rolar o resultado.
    // Refino é conversão determinística: todas as unidades "passam", XP fixo.
    const roll = isRefineRecipe(recipe)
      ? {
          attempted: quantity,
          succeeded: quantity,
          failed: 0,
          xpGained: refineXpAndLevel(recipe.rarity).xp * quantity,
          chance: 1,
          units: Array.from({ length: quantity }, () => ({ ok: true })),
        }
      : rollCraftBatch(recipe.rarity, level, quantity)

    const result = await prisma.$transaction(async (tx) => {
      // 1. Gold (taxa do ferreiro) — carteira do personagem. Falha também paga.
      const charGold = await tx.character.findUnique({
        where: { id: character.id },
        select: { gold: true },
      })
      const totalGoldCost = recipe.goldCost * quantity
      if (!charGold || charGold.gold < totalGoldCost) {
        throw new Error(`GOLD insuficiente na carteira do personagem: precisa de ${totalGoldCost} 🪙.`)
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
        const needed = req.quantity * quantity
        const have = (byName.get(req.name) ?? []).reduce((n, r) => n + r.quantity, 0)
        if (have < needed) {
          throw new Error(`Falta ${req.name} (tem ${have}, precisa de ${needed}).`)
        }
      }

      // 3. Consome os materiais do LOTE INTEIRO (as falhas também consomem).
      for (const req of recipe.materials) {
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

      // 4. Debita o gold e credita o XP de Forja no mesmo update.
      await tx.character.update({
        where: { id: character.id },
        data: { gold: { decrement: totalGoldCost }, forgeXp: { increment: roll.xpGained } },
      })

      // 5. Produz a saída — só para as unidades que PASSARAM na rolagem.
      let outputItemId: string | null = null
      if (roll.succeeded > 0) {
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
          await assertInventoryRoom(tx, character.id, roll.succeeded)
          for (let i = 0; i < roll.succeeded; i++) {
            await tx.characterInventory.create({
              data: { characterId: character.id, itemId: item.id, quantity: 1 },
            })
          }
          outputItemId = item.id
        } else {
          // Refino: acha/cria a pedra e empilha (consumível).
          const meta = STONE_META[recipe.outputName]
          let item = await tx.item.findFirst({ where: { name: recipe.outputName } })
          if (!item) {
            item = await tx.item.create({
              data: {
                name: recipe.outputName,
                description: meta.description,
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
              data: { quantity: { increment: roll.succeeded } },
            })
          } else {
            await assertInventoryRoom(tx, character.id, 1)
            await tx.characterInventory.create({
              data: { characterId: character.id, itemId: item.id, quantity: roll.succeeded },
            })
          }
          outputItemId = item.id
        }
      }

      const updatedChar = await tx.character.findUnique({
        where: { id: character.id },
        select: { gold: true },
      })
      return { outputItemId, characterGold: updatedChar?.gold ?? null }
    })

    const totalGoldCost = recipe.goldCost * quantity
    const scoreLabel = roll.failed > 0
      ? `${roll.succeeded}/${roll.attempted} sucesso${roll.succeeded === 1 ? '' : 's'}`
      : roll.attempted > 1 ? `${roll.attempted}x` : ''
    try {
      await addHistoryEntry({
        characterId: character.id,
        activityType: 'ITEM_GAINED',
        // Histórico gravado no banco: EN canônico (como o metadata da NFT).
        description: roll.succeeded > 0
          ? `⚒️ Forged${scoreLabel ? ` ${scoreLabel}` : ''} ${catalogNameEn(recipe.outputName)} (−${totalGoldCost} gold).`
          : `⚒️ Forging of ${catalogNameEn(recipe.outputName)} failed — materials and fee lost (−${totalGoldCost} gold).`,
        itemId: result.outputItemId ?? undefined,
        goldAmount: -totalGoldCost,
      })
    } catch (historyError) {
      console.error('Erro ao registrar histórico de forja:', historyError)
    }

    // 🗺️ Missões: pós-commit e fire-and-forget (só unidades que passaram na rolagem).
    if (roll.succeeded > 0) {
      advanceQuestProgress(character.id, { type: 'craft_forge', amount: roll.succeeded }).catch(() => {})
    }

    // levelInfo pós-crédito (a UI anima a barra de XP com isto).
    const levelInfo = getProfessionLevelInfo(xpBefore + roll.xpGained)

    const outName = localizeItemName(recipe.outputName, getLocaleFromRequest(request))
    const message = roll.failed === 0
      ? roll.attempted > 1
        ? t('⚒️ {n}× {name} forged successfully!', { n: roll.attempted, name: outName })
        : t('⚒️ {name} forged successfully!', { name: outName })
      : roll.succeeded === 0
        ? roll.attempted > 1
          ? t('💥 The forge failed {n}× — the materials were lost in the fire.', { n: roll.attempted })
          : t('💥 The forge failed — the materials were lost in the fire.')
        : t('⚒️ {ok} of {total} {name} survived the forge.', {
            ok: roll.succeeded, total: roll.attempted, name: outName,
          })

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
      message,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro interno do servidor'
    const isValidation = /insuficiente|Falta |Inventário cheio|Requer Forja/.test(message)
    console.error('Error forging item:', error)
    return NextResponse.json({ error: message }, { status: isValidation ? 400 : 500 })
  }
}
