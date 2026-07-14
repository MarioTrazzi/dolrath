import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { ConsumableSubtype } from '@prisma/client'
import {
  PROCESSING_RECIPES,
  getProcessingOutput,
  getProcessingRecipeById,
} from '@/lib/processing'
import { itemImagePath } from '@/lib/itemCatalog'
import { addHistoryEntry } from '@/lib/characterHistory'
import { assertInventoryRoom } from '@/lib/inventoryMutations'
import { getUserProcessXp } from '@/lib/craftingServer'
import { getProfessionLevel, getProfessionLevelInfo } from '@/lib/professionSystem'

// ⚙️ Profissão de PROCESSAMENTO — beneficia matéria-prima crua em insumo
// processado (Barras/Tecidos/Extratos + Ração/Bandagem) e refina estilhaços
// em Pedra Negra (10:1). SEM falha: conversão, não fabricação — toda unidade
// passa, XP fixo da receita, gating por minLevel. Consome os insumos + taxa em
// gold (carteira do personagem) e credita processXp no personagem; o NÍVEL é a
// soma da conta (craftingServer.ts). O servidor decide tudo (nível do aggregate).

// GET — nível de Processamento da conta + gating de cada receita (para a UI).
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

    const xp = await getUserProcessXp(session.user.id)
    const levelInfo = getProfessionLevelInfo(xp)
    const recipes = PROCESSING_RECIPES.map((r) => ({
      id: r.id,
      minLevel: r.minLevel,
      chance: 1,
      noFail: true,
      unlocked: levelInfo.level >= r.minLevel,
    }))
    return NextResponse.json({ xp, levelInfo, recipes })
  } catch (error) {
    console.error('Error loading processing info:', error)
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
    const rawQuantity = Number(body?.quantity ?? 1)
    const quantity = Number.isFinite(rawQuantity) ? Math.min(99, Math.max(1, Math.floor(rawQuantity))) : 1

    const recipe = getProcessingRecipeById(recipeId)
    if (!recipe) {
      return NextResponse.json({ error: 'Receita não encontrada' }, { status: 404 })
    }

    // Valida a saída (processado, consumível migrado — Ração/Bandagem — ou pedra).
    const output = getProcessingOutput(recipe)
    if (!output.processed && !output.consumable && !output.stone) {
      return NextResponse.json({ error: 'Saída da receita não existe no catálogo' }, { status: 500 })
    }

    const character = await prisma.character.findFirst({
      where: { id: params.characterId, userId },
    })
    if (!character) {
      return NextResponse.json({ error: 'Personagem não encontrado' }, { status: 404 })
    }

    // Nível de Processamento da CONTA + gating da receita (o client nunca manda nível).
    const xpBefore = await getUserProcessXp(userId)
    const level = getProfessionLevel(xpBefore)
    if (level < recipe.minLevel) {
      return NextResponse.json({ error: `Requer Processamento nível ${recipe.minLevel}.` }, { status: 400 })
    }

    // Sem RNG: processamento é conversão determinística (modelo do refino) —
    // todas as unidades passam, XP fixo da receita. Mantemos o shape do roll das
    // rotas irmãs para a UI reutilizar o mesmo contrato.
    const roll = {
      attempted: quantity,
      succeeded: quantity,
      failed: 0,
      xpGained: recipe.xp * quantity,
      chance: 1,
    }

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
        description: `⚙️ Processou ${roll.attempted > 1 ? `${roll.attempted}× ` : ''}${recipe.outputName} (−${totalGoldCost} gold).`,
        itemId: result.outputItemId ?? undefined,
        goldAmount: -totalGoldCost,
      })
    } catch (historyError) {
      console.error('Erro ao registrar histórico de processamento:', historyError)
    }

    // levelInfo pós-crédito (a UI anima a barra de XP com isto).
    const levelInfo = getProfessionLevelInfo(xpBefore + roll.xpGained)

    return NextResponse.json({
      success: true,
      attempted: roll.attempted,
      succeeded: roll.succeeded,
      failed: roll.failed,
      chance: roll.chance,
      xpGained: roll.xpGained,
      levelInfo,
      characterGold: result.characterGold,
      outputName: recipe.outputName,
      rarity: recipe.rarity,
      message: `⚙️ ${roll.attempted > 1 ? `${roll.attempted}× ` : ''}${recipe.outputName} processado${roll.attempted > 1 ? 's' : ''} com sucesso!`,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro interno do servidor'
    const isValidation = /insuficiente|Falta |Inventário cheio|Requer Processamento/.test(message)
    console.error('Error processing item:', error)
    return NextResponse.json({ error: message }, { status: isValidation ? 400 : 500 })
  }
}
