import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { addHistoryEntry } from '@/lib/characterHistory'
import {
  getGearCategory,
  getNextLevel,
  getEnhanceChance,
  getDurabilityLossOnFail,
  getRequiredMaterial,
  getLevelLabel,
  getDisplayName,
  getRiskDescription,
  getBaseChance,
  rollEnhancement,
} from '@/lib/enhancementSystem'

async function loadContext(characterId: string, userId: string, inventoryId: string) {
  const character = await prisma.character.findFirst({
    where: { id: characterId, userId },
  })
  if (!character) return { error: 'Personagem não encontrado', status: 404 as const }

  const inventoryItem = await prisma.characterInventory.findFirst({
    where: { id: inventoryId, characterId },
    include: { item: true },
  })
  if (!inventoryItem) return { error: 'Item não encontrado no inventário', status: 404 as const }

  const category = getGearCategory(inventoryItem.item.type)
  if (!category) return { error: 'Este item não pode ser aprimorado', status: 400 as const }

  return { character, inventoryItem, category }
}

// Conta quantas unidades do material necessário o personagem possui.
// Para pedras, soma a quantidade de todas as pilhas; para cópias, conta as
// instâncias base (nível 0) do próprio item.
async function countMaterial(
  characterId: string,
  inventoryItem: { id: string; itemId: string; quantity: number; enhancementLevel: number },
  material: ReturnType<typeof getRequiredMaterial>,
): Promise<number> {
  if (material.kind === 'STONE') {
    const rows = await prisma.characterInventory.findMany({
      where: { characterId, item: { name: material.name } },
      select: { quantity: true },
    })
    return rows.reduce((sum, r) => sum + r.quantity, 0)
  }
  // DUPLICATE: cópias base (nível 0) do mesmo item, incluindo as da própria pilha.
  const rows = await prisma.characterInventory.findMany({
    where: { characterId, itemId: inventoryItem.itemId, enhancementLevel: 0 },
    select: { id: true, quantity: true },
  })
  const total = rows.reduce((sum, r) => sum + r.quantity, 0)
  // A própria instância selecionada não conta como sua própria cópia.
  return inventoryItem.enhancementLevel === 0 ? Math.max(0, total - 1) : total
}

// Procura o material necessário no inventário do personagem.
// Retorna a linha de onde consumir, ou null se não houver.
async function findMaterialRow(
  characterId: string,
  inventoryItem: { id: string; itemId: string; quantity: number; enhancementLevel: number },
  material: ReturnType<typeof getRequiredMaterial>,
) {
  if (material.kind === 'STONE') {
    return prisma.characterInventory.findFirst({
      where: {
        characterId,
        quantity: { gte: 1 },
        item: { name: material.name },
      },
    })
  }
  // DUPLICATE: uma cópia base (nível 0) do mesmo item.
  // Pode ser a própria linha, se ela for nível 0 com quantidade >= 2.
  if (inventoryItem.enhancementLevel === 0 && inventoryItem.quantity >= 2) {
    return prisma.characterInventory.findFirst({ where: { id: inventoryItem.id } })
  }
  return prisma.characterInventory.findFirst({
    where: {
      characterId,
      itemId: inventoryItem.itemId,
      enhancementLevel: 0,
      quantity: { gte: 1 },
      id: { not: inventoryItem.id },
    },
  })
}

export async function GET(
  request: NextRequest,
  { params }: { params: { characterId: string } }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const inventoryId = request.nextUrl.searchParams.get('inventoryId')
    if (!inventoryId) {
      return NextResponse.json({ error: 'inventoryId é obrigatório' }, { status: 400 })
    }

    const ctx = await loadContext(params.characterId, session.user.id, inventoryId)
    if ('error' in ctx) {
      return NextResponse.json({ error: ctx.error }, { status: ctx.status })
    }
    const { character, inventoryItem, category } = ctx

    const targetLevel = getNextLevel(category, inventoryItem.enhancementLevel)
    if (targetLevel === null) {
      return NextResponse.json({
        maxLevel: true,
        currentLevel: inventoryItem.enhancementLevel,
        displayName: getDisplayName(inventoryItem.item.name, inventoryItem.enhancementLevel),
      })
    }

    const material = getRequiredMaterial(category, targetLevel, inventoryItem.item.type)
    const materialRow = await findMaterialRow(params.characterId, inventoryItem, material)
    const materialCount = await countMaterial(params.characterId, inventoryItem, material)
    const durabilityCost = getDurabilityLossOnFail(targetLevel)
    const isSafe = getBaseChance(category, targetLevel) >= 1
    const enoughDurability = isSafe || inventoryItem.durability >= durabilityCost

    return NextResponse.json({
      maxLevel: false,
      category,
      currentLevel: inventoryItem.enhancementLevel,
      targetLevel,
      targetLabel: getLevelLabel(targetLevel),
      displayName: getDisplayName(inventoryItem.item.name, inventoryItem.enhancementLevel),
      // Identidade do item, para o cabeçalho e a prévia de stats no diálogo.
      itemName: inventoryItem.item.name,
      itemType: inventoryItem.item.type,
      itemImage: inventoryItem.item.image,
      itemStats: inventoryItem.item.stats,
      chance: getEnhanceChance(category, targetLevel, character.failstacks),
      failstacks: character.failstacks,
      durability: inventoryItem.durability,
      maxDurability: inventoryItem.maxDurability,
      material: material.kind === 'STONE'
        ? { kind: 'STONE', name: material.name }
        : { kind: 'DUPLICATE', name: inventoryItem.item.name },
      materialAvailable: !!materialRow,
      materialCount,
      enoughDurability,
      canEnhance: !!materialRow && enoughDurability,
      risk: getRiskDescription(category, targetLevel, inventoryItem.enhancementLevel),
    })
  } catch (error) {
    console.error('Error fetching enhancement info:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
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

    const { inventoryId } = await request.json()
    if (!inventoryId) {
      return NextResponse.json({ error: 'inventoryId é obrigatório' }, { status: 400 })
    }

    const ctx = await loadContext(params.characterId, session.user.id, inventoryId)
    if ('error' in ctx) {
      return NextResponse.json({ error: ctx.error }, { status: ctx.status })
    }
    const { character, inventoryItem, category } = ctx

    const targetLevel = getNextLevel(category, inventoryItem.enhancementLevel)
    if (targetLevel === null) {
      return NextResponse.json({ error: 'O item já está no nível máximo' }, { status: 400 })
    }

    // Durabilidade precisa cobrir o custo de uma falha (exceto níveis seguros)
    const durabilityCost = getDurabilityLossOnFail(targetLevel)
    const isSafe = getBaseChance(category, targetLevel) >= 1
    if (!isSafe && category !== 'ACCESSORY' && inventoryItem.durability < durabilityCost) {
      return NextResponse.json(
        { error: 'Durabilidade insuficiente. Repare o item antes de aprimorar.' },
        { status: 400 }
      )
    }

    const material = getRequiredMaterial(category, targetLevel, inventoryItem.item.type)
    const materialRow = await findMaterialRow(params.characterId, inventoryItem, material)
    if (!materialRow) {
      const name = material.kind === 'STONE' ? material.name : `uma cópia de ${inventoryItem.item.name}`
      return NextResponse.json({ error: `Material insuficiente: é necessário ${name}.` }, { status: 400 })
    }

    const outcome = rollEnhancement(category, inventoryItem.enhancementLevel, character.failstacks)
    if (!outcome) {
      return NextResponse.json({ error: 'O item já está no nível máximo' }, { status: 400 })
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Consumir o material (pedra ou cópia do acessório)
      if (materialRow.quantity > 1) {
        await tx.characterInventory.update({
          where: { id: materialRow.id },
          data: { quantity: { decrement: 1 } },
        })
      } else {
        await tx.characterInventory.delete({ where: { id: materialRow.id } })
      }

      // A linha do item pode ter sido alterada (material vindo da mesma pilha)
      const consumedFromSelf = materialRow.id === inventoryItem.id
      const selfQuantity = consumedFromSelf ? inventoryItem.quantity - 1 : inventoryItem.quantity
      const selfDeleted = consumedFromSelf && materialRow.quantity <= 1

      let finalLevel = inventoryItem.enhancementLevel
      let finalDurability = inventoryItem.durability
      let destroyedCompletely = false

      if (outcome.success) {
        finalLevel = outcome.resultLevel
        if (selfDeleted) {
          // A pilha inteira foi consumida como material — recria a instância aprimorada
          await tx.characterInventory.create({
            data: {
              characterId: params.characterId,
              itemId: inventoryItem.itemId,
              quantity: 1,
              enhancementLevel: outcome.resultLevel,
              durability: inventoryItem.durability,
              maxDurability: inventoryItem.maxDurability,
            },
          })
        } else if (selfQuantity > 1) {
          // Separa a instância aprimorada da pilha
          await tx.characterInventory.update({
            where: { id: inventoryItem.id },
            data: { quantity: { decrement: 1 } },
          })
          await tx.characterInventory.create({
            data: {
              characterId: params.characterId,
              itemId: inventoryItem.itemId,
              quantity: 1,
              enhancementLevel: outcome.resultLevel,
              durability: inventoryItem.durability,
              maxDurability: inventoryItem.maxDurability,
            },
          })
        } else {
          await tx.characterInventory.update({
            where: { id: inventoryItem.id },
            data: { enhancementLevel: outcome.resultLevel },
          })
        }

        // Sucesso zera os failstacks
        await tx.character.update({
          where: { id: params.characterId },
          data: { failstacks: 0 },
        })
      } else {
        // Falha acumula failstacks
        await tx.character.update({
          where: { id: params.characterId },
          data: { failstacks: { increment: outcome.failstackGain } },
        })

        if (outcome.destroyed) {
          // Acessório quebrou — destrói a instância
          if (!selfDeleted) {
            if (selfQuantity > 1) {
              await tx.characterInventory.update({
                where: { id: inventoryItem.id },
                data: { quantity: { decrement: 1 } },
              })
            } else {
              await tx.characterInventory.delete({ where: { id: inventoryItem.id } })
            }
          }
          const remaining = await tx.characterInventory.count({
            where: { characterId: params.characterId, itemId: inventoryItem.itemId },
          })
          destroyedCompletely = true
          if (remaining === 0) {
            // Sem cópias restantes — remove também do equipamento
            await tx.characterEquipment.deleteMany({
              where: { characterId: params.characterId, itemId: inventoryItem.itemId },
            })
          }
        } else {
          finalLevel = outcome.resultLevel
          finalDurability = Math.max(0, inventoryItem.durability - outcome.durabilityLoss)
          await tx.characterInventory.update({
            where: { id: inventoryItem.id },
            data: { enhancementLevel: finalLevel, durability: finalDurability },
          })
        }
      }

      // 2. Sincronizar nível no equipamento, se o item estiver equipado
      if (!destroyedCompletely && finalLevel !== inventoryItem.enhancementLevel) {
        await tx.characterEquipment.updateMany({
          where: { characterId: params.characterId, itemId: inventoryItem.itemId },
          data: { enhancementLevel: finalLevel },
        })
      }

      const updatedCharacter = await tx.character.findUnique({
        where: { id: params.characterId },
        select: { failstacks: true },
      })

      return { finalLevel, finalDurability, destroyedCompletely, failstacks: updatedCharacter?.failstacks ?? 0 }
    })

    // 3. Histórico (fora da transação — não falha a operação)
    const itemName = inventoryItem.item.name
    try {
      if (outcome.success) {
        await addHistoryEntry({
          characterId: params.characterId,
          activityType: 'ITEM_ENHANCED',
          description: `⚒️ ${getDisplayName(itemName, outcome.resultLevel)} — aprimoramento bem-sucedido! (${(outcome.chance * 100).toFixed(1)}%)`,
          itemId: inventoryItem.itemId,
        })
      } else if (outcome.destroyed) {
        await addHistoryEntry({
          characterId: params.characterId,
          activityType: 'ITEM_DESTROYED',
          description: `💔 ${itemName} foi destruído ao falhar o aprimoramento para ${getLevelLabel(outcome.targetLevel)}.`,
          itemId: inventoryItem.itemId,
        })
      } else {
        await addHistoryEntry({
          characterId: params.characterId,
          activityType: 'ENHANCEMENT_FAILED',
          description: `⚒️ Falha ao aprimorar ${getDisplayName(itemName, inventoryItem.enhancementLevel)} para ${getLevelLabel(outcome.targetLevel)}.`,
          itemId: inventoryItem.itemId,
        })
      }
    } catch (historyError) {
      console.error('Erro ao registrar histórico de aprimoramento:', historyError)
    }

    const message = outcome.success
      ? `✨ Sucesso! ${getDisplayName(itemName, outcome.resultLevel)}`
      : outcome.destroyed
        ? `💔 ${itemName} foi destruído na tentativa de ${getLevelLabel(outcome.targetLevel)}...`
        : outcome.downgraded
          ? `❌ Falhou! O item regrediu para ${getDisplayName(itemName, result.finalLevel)}.`
          : `❌ Falhou! ${itemName} perdeu ${outcome.durabilityLoss} de durabilidade.`

    return NextResponse.json({
      success: outcome.success,
      destroyed: outcome.destroyed,
      downgraded: outcome.downgraded,
      chance: outcome.chance,
      newLevel: result.finalLevel,
      newLevelLabel: getLevelLabel(result.finalLevel),
      durability: result.finalDurability,
      failstacks: result.failstacks,
      message,
    })
  } catch (error) {
    console.error('Error enhancing item:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
