import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { addHistoryEntry } from '@/lib/characterHistory'
import {
  REPAIR_PER_DUPLICATE,
  getDisplayName,
  getGearCategory,
  ACCESSORY_REPAIR_DUST_NAME,
  accessoryRepairGoldCost,
} from '@/lib/enhancementSystem'
import { getCatalogItemByName } from '@/lib/itemCatalog'

// Reparo de alto nível: peças RARAS/ÉPICAS/LENDÁRIAS quase nunca têm cópias, então
// são reparadas com Estilhaço de Memória (só de chefe), +10 de durabilidade cada.
const MEMORY_SHARD_NAME = 'Estilhaço de Memória'
const HIGH_RARITIES = new Set(['RARE', 'EPIC', 'LEGENDARY'])

// Repara a durabilidade de um item consumindo cópias base dele (estilo BDO) — ou
// Estilhaço de Memória se a peça for rara+. Aceita item do INVENTÁRIO
// (inventoryId) ou item EQUIPADO (equipmentId) — desgaste por uso acontece com a
// peça no corpo, então dá pra reparar sem desequipar.
// mode 'single' (padrão): consome 1 unidade (+REPAIR_PER_DUPLICATE de durabilidade).
// mode 'full': consome o máximo necessário/disponível para reparar 100%.
export async function POST(
  request: NextRequest,
  { params }: { params: { characterId: string } }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const inventoryId: string | undefined = body?.inventoryId
    const equipmentId: string | undefined = body?.equipmentId
    const mode: 'single' | 'full' = body?.mode === 'full' ? 'full' : 'single'
    if (!inventoryId && !equipmentId) {
      return NextResponse.json({ error: 'inventoryId ou equipmentId é obrigatório' }, { status: 400 })
    }

    const character = await prisma.character.findFirst({
      where: { id: params.characterId, userId: session.user.id },
    })
    if (!character) {
      return NextResponse.json({ error: 'Personagem não encontrado' }, { status: 404 })
    }

    // Alvo do reparo: linha do inventário OU peça equipada (mesmo shape relevante).
    const inventoryItem = inventoryId
      ? await prisma.characterInventory.findFirst({
          where: { id: inventoryId, characterId: params.characterId },
          include: { item: true },
        })
      : await prisma.characterEquipment.findFirst({
          where: { id: equipmentId, characterId: params.characterId },
          include: { item: true },
        })
    if (!inventoryItem) {
      return NextResponse.json({ error: 'Item não encontrado' }, { status: 404 })
    }

    if (inventoryItem.durability >= inventoryItem.maxDurability) {
      return NextResponse.json({ error: 'O item já está com durabilidade máxima' }, { status: 400 })
    }

    // Acessório (anel/colar/cinto) não acumula cópia e estilhaço de chefe é
    // escasso demais — sempre repara com Pó de Joia (Coleta) + gold, não importa
    // a raridade. Arma/armadura seguem a regra de sempre: raridade decide a
    // fonte (cópia nível-0 comum/incomum, Estilhaço de Memória rara+).
    const category = getGearCategory(inventoryItem.item.type)
    const isAccessory = category === 'ACCESSORY'

    const rarity = String(
      (inventoryItem.item.stats as Record<string, unknown> | null)?.rarity ??
      getCatalogItemByName(inventoryItem.item.name)?.rarity ??
      'COMMON'
    ).toUpperCase()
    const useMemoryShard = !isAccessory && HIGH_RARITIES.has(rarity)

    // Stacks da fonte de reparo (Pó de Joia, estilhaço de memória ou cópia).
    const sources = isAccessory
      ? (await prisma.characterInventory.findMany({
          where: {
            characterId: params.characterId,
            item: { name: ACCESSORY_REPAIR_DUST_NAME, type: 'CONSUMABLE' },
            quantity: { gte: 1 },
          },
          orderBy: { quantity: 'asc' },
        })).map((s) => ({ id: s.id, quantity: s.quantity }))
      : useMemoryShard
      ? (await prisma.characterInventory.findMany({
          where: {
            characterId: params.characterId,
            item: { name: MEMORY_SHARD_NAME, type: 'CONSUMABLE' },
            quantity: { gte: 1 },
          },
          orderBy: { quantity: 'asc' },
        })).map((s) => ({ id: s.id, quantity: s.quantity }))
      : (await prisma.characterInventory.findMany({
          where: {
            characterId: params.characterId,
            itemId: inventoryItem.itemId,
            enhancementLevel: 0,
            quantity: { gte: 1 },
            // Reparando uma linha do inventário, ela mesma não serve de cópia.
            ...(inventoryId ? { id: { not: inventoryItem.id } } : {}),
          },
          orderBy: { quantity: 'asc' },
        })).map((d) => ({ id: d.id, quantity: d.quantity }))

    const totalUnits = sources.reduce((sum, s) => sum + s.quantity, 0)
    if (totalUnits < 1) {
      return NextResponse.json(
        {
          error: isAccessory
            ? `É necessário ${ACCESSORY_REPAIR_DUST_NAME} (Coleta — Vale dos Minérios) para reparar ${inventoryItem.item.name}.`
            : useMemoryShard
            ? `É necessário um ${MEMORY_SHARD_NAME} (de chefe de masmorra) para reparar ${inventoryItem.item.name}.`
            : `É necessária uma cópia de ${inventoryItem.item.name} para reparar.`,
        },
        { status: 400 }
      )
    }

    // Quantas unidades gastar (cada uma vale REPAIR_PER_DUPLICATE de durabilidade).
    const missing = inventoryItem.maxDurability - inventoryItem.durability
    const unitsNeeded = Math.ceil(missing / REPAIR_PER_DUPLICATE)
    const unitsToUse = mode === 'full' ? Math.min(unitsNeeded, totalUnits) : 1

    // Acessório também cobra gold (fração do preço do item), além do Pó de Joia.
    const goldCost = isAccessory ? accessoryRepairGoldCost(inventoryItem.item.goldPrice, unitsToUse) : 0
    if (goldCost > 0 && character.gold < goldCost) {
      return NextResponse.json(
        { error: `Gold insuficiente: reparar custa ${goldCost} gold (você tem ${character.gold}).` },
        { status: 400 }
      )
    }

    const newDurability = Math.min(
      inventoryItem.maxDurability,
      inventoryItem.durability + unitsToUse * REPAIR_PER_DUPLICATE
    )
    const gained = newDurability - inventoryItem.durability
    const unitLabel = isAccessory ? ACCESSORY_REPAIR_DUST_NAME : useMemoryShard ? MEMORY_SHARD_NAME : 'cópia'

    await prisma.$transaction(async (tx) => {
      // Consome `unitsToUse` unidades percorrendo os stacks disponíveis.
      let remaining = unitsToUse
      for (const s of sources) {
        if (remaining <= 0) break
        const take = Math.min(s.quantity, remaining)
        if (s.quantity > take) {
          await tx.characterInventory.update({
            where: { id: s.id },
            data: { quantity: { decrement: take } },
          })
        } else {
          await tx.characterInventory.delete({ where: { id: s.id } })
        }
        remaining -= take
      }
      if (goldCost > 0) {
        await tx.character.update({
          where: { id: params.characterId },
          data: { gold: { decrement: goldCost } },
        })
      }
      if (inventoryId) {
        await tx.characterInventory.update({
          where: { id: inventoryItem.id },
          data: { durability: newDurability },
        })
      } else {
        await tx.characterEquipment.update({
          where: { id: inventoryItem.id },
          data: { durability: newDurability },
        })
      }
    })

    try {
      await addHistoryEntry({
        characterId: params.characterId,
        activityType: 'ITEM_REPAIRED',
        description: `🔧 ${getDisplayName(inventoryItem.item.name, inventoryItem.enhancementLevel)} reparado (+${gained} durabilidade, ${unitsToUse} ${unitLabel}${unitsToUse > 1 ? 's' : ''}${goldCost > 0 ? ` + ${goldCost} gold` : ''}).`,
        itemId: inventoryItem.itemId,
      })
    } catch (historyError) {
      console.error('Erro ao registrar histórico de reparo:', historyError)
    }

    return NextResponse.json({
      success: true,
      durability: newDurability,
      maxDurability: inventoryItem.maxDurability,
      usedMemoryShard: useMemoryShard,
      copiesUsed: unitsToUse,
      copiesRemaining: totalUnits - unitsToUse,
      goldSpent: goldCost,
      fullyRepaired: newDurability >= inventoryItem.maxDurability,
      message: `🔧 Item reparado! Durabilidade: ${newDurability}/${inventoryItem.maxDurability} (${unitsToUse} ${unitLabel}${unitsToUse > 1 ? 's' : ''} usada${unitsToUse > 1 ? 's' : ''}${goldCost > 0 ? ` + ${goldCost} gold` : ''})`,
    })
  } catch (error) {
    console.error('Error repairing item:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
