import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { addHistoryEntry } from '@/lib/characterHistory'
import {
  getDisplayName,
  getGearCategory,
  ACCESSORY_REPAIR_DUST_NAME,
} from '@/lib/enhancementSystem'
import { repairPlan, isPurchasableSource, type RepairSource } from '@/lib/repairPricing'
import { getCatalogItemByName, getForgeMaterialByName } from '@/lib/itemCatalog'

// Reparo de alto nível: peças RARAS/ÉPICAS/LENDÁRIAS quase nunca têm cópias, então
// são reparadas com Estilhaço de Memória (só de chefe), +REPAIR_PER_DUPLICATE de
// durabilidade cada, como toda fonte de reparo.
const MEMORY_SHARD_NAME = 'Estilhaço de Memória'
const HIGH_RARITIES = new Set(['RARE', 'EPIC', 'LEGENDARY'])

class RepairError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

// Repara a durabilidade de um item consumindo cópias base dele (estilo BDO) — ou
// Estilhaço de Memória se a peça for rara+, ou Pó de Joia se for acessório.
// Aceita item do INVENTÁRIO (inventoryId) ou item EQUIPADO (equipmentId) —
// desgaste por uso acontece com a peça no corpo, então dá pra reparar sem desequipar.
// mode 'single' (padrão): 1 unidade (+REPAIR_PER_DUPLICATE de durabilidade).
// mode 'full': o necessário para reparar 100%.
// buyMissing: o que faltar na bolsa o FERREIRO VENDE no balcão e funde na hora —
// cobra gold (rateado pela durabilidade fundida) sem criar linha de inventário,
// então reparar não exige slot livre. Estilhaço de Memória fica de fora: é gate
// de chefe de propósito. [[dolrath-onchain-gold-not-items]]
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
    const buyMissing: boolean = body?.buyMissing === true
    if (!inventoryId && !equipmentId) {
      return NextResponse.json({ error: 'inventoryId ou equipmentId é obrigatório' }, { status: 400 })
    }

    const character = await prisma.character.findFirst({
      where: { id: params.characterId, userId: session.user.id },
    })
    if (!character) {
      return NextResponse.json({ error: 'Personagem não encontrado' }, { status: 404 })
    }

    // Tudo dentro da transação: alvo, material e gold são lidos e gravados no
    // mesmo instante — com duas abas abertas (ou o farm automático rodando) uma
    // leitura fora da tx virava reparo de graça ou cópia consumida em dobro.
    const outcome = await prisma.$transaction(async (tx) => {
      // Alvo do reparo: linha do inventário OU peça equipada (mesmo shape relevante).
      const target = inventoryId
        ? await tx.characterInventory.findFirst({
            where: { id: inventoryId, characterId: params.characterId },
            include: { item: true },
          })
        : await tx.characterEquipment.findFirst({
            where: { id: equipmentId, characterId: params.characterId },
            include: { item: true },
          })
      if (!target) throw new RepairError('Item não encontrado', 404)
      if (target.durability >= target.maxDurability) {
        throw new RepairError('O item já está com durabilidade máxima', 400)
      }

      // Acessório (anel/colar/cinto) não acumula cópia e estilhaço de chefe é
      // escasso demais — sempre repara com Pó de Joia (Coleta) + gold, não importa
      // a raridade. Arma/armadura seguem a regra de sempre: raridade decide a
      // fonte (cópia nível-0 comum/incomum, Estilhaço de Memória rara+).
      const isAccessory = getGearCategory(target.item.type) === 'ACCESSORY'
      const rarity = String(
        (target.item.stats as Record<string, unknown> | null)?.rarity ??
        getCatalogItemByName(target.item.name)?.rarity ??
        'COMMON'
      ).toUpperCase()
      const source: RepairSource = isAccessory
        ? 'DUST'
        : HIGH_RARITIES.has(rarity)
        ? 'SHARD'
        : 'COPY'

      // Stacks da fonte de reparo (Pó de Joia, estilhaço de memória ou cópia).
      const sources =
        source === 'DUST'
          ? (await tx.characterInventory.findMany({
              where: {
                characterId: params.characterId,
                item: { name: ACCESSORY_REPAIR_DUST_NAME, type: 'CONSUMABLE' },
                quantity: { gte: 1 },
              },
              orderBy: { quantity: 'asc' },
            })).map((s) => ({ id: s.id, quantity: s.quantity }))
          : source === 'SHARD'
          ? (await tx.characterInventory.findMany({
              where: {
                characterId: params.characterId,
                item: { name: MEMORY_SHARD_NAME, type: 'CONSUMABLE' },
                quantity: { gte: 1 },
              },
              orderBy: { quantity: 'asc' },
            })).map((s) => ({ id: s.id, quantity: s.quantity }))
          : (await tx.characterInventory.findMany({
              where: {
                characterId: params.characterId,
                itemId: target.itemId,
                enhancementLevel: 0,
                quantity: { gte: 1 },
                // Reparando uma linha do inventário, ela mesma não serve de cópia.
                ...(inventoryId ? { id: { not: target.id } } : {}),
              },
              orderBy: { quantity: 'asc' },
            })).map((d) => ({ id: d.id, quantity: d.quantity }))

      const totalUnits = sources.reduce((sum, s) => sum + s.quantity, 0)

      // Preço de balcão de UMA unidade da fonte. Cópia = preço da própria peça
      // (o ferreiro forja uma lisa de reposição, mesmo que a vitrine não a
      // estoque); Pó de Joia = preço de catálogo do material.
      let unitPrice = 0
      if (source === 'COPY') {
        unitPrice = Math.max(0, Math.floor(target.item.goldPrice ?? 0))
      } else if (source === 'DUST') {
        const dustItem = await tx.item.findFirst({
          where: { name: ACCESSORY_REPAIR_DUST_NAME },
          select: { goldPrice: true },
        })
        unitPrice = Math.max(
          0,
          Math.floor(dustItem?.goldPrice ?? getForgeMaterialByName(ACCESSORY_REPAIR_DUST_NAME)?.goldValue ?? 0)
        )
      }

      const plan = repairPlan({
        missing: target.maxDurability - target.durability,
        unitsOwned: totalUnits,
        mode,
        source,
        unitPrice,
        itemGoldPrice: target.item.goldPrice,
        allowBuy: buyMissing && isPurchasableSource(source) && unitPrice > 0,
      })

      if (plan.blocked) {
        throw new RepairError(
          source === 'DUST'
            ? `É necessário ${ACCESSORY_REPAIR_DUST_NAME} (Coleta — Vale dos Minérios) para reparar ${target.item.name}.`
            : source === 'SHARD'
            ? `É necessário um ${MEMORY_SHARD_NAME} (de chefe de masmorra) para reparar ${target.item.name}.`
            : `É necessária uma cópia de ${target.item.name} para reparar.`,
          400
        )
      }

      // Paga com a CARTEIRA DO PERSONAGEM (Character.gold). A mensagem segue o
      // formato "precisa de N 🪙" que `parseNeededGold` lê para oferecer a
      // recarga on-chain no cliente.
      const wallet = await tx.character.findUnique({
        where: { id: params.characterId },
        select: { gold: true },
      })
      if (plan.totalGold > 0 && (wallet?.gold ?? 0) < plan.totalGold) {
        throw new RepairError(
          `GOLD insuficiente na carteira do personagem: precisa de ${plan.totalGold} 🪙.`,
          400
        )
      }

      // Consome da bolsa só o que veio da bolsa — o resto foi comprado no balcão
      // e nunca existiu como linha de inventário.
      let remaining = plan.unitsFromStock
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

      if (plan.totalGold > 0) {
        await tx.character.update({
          where: { id: params.characterId },
          data: { gold: { decrement: plan.totalGold } },
        })
      }

      const newDurability = target.durability + plan.durabilityGained
      if (inventoryId) {
        await tx.characterInventory.update({
          where: { id: target.id },
          data: { durability: newDurability },
        })
      } else {
        await tx.characterEquipment.update({
          where: { id: target.id },
          data: { durability: newDurability },
        })
      }

      return {
        plan,
        source,
        newDurability,
        maxDurability: target.maxDurability,
        itemId: target.itemId,
        itemName: target.item.name,
        enhancementLevel: target.enhancementLevel,
        unitsRemaining: totalUnits - plan.unitsFromStock,
      }
    })

    const { plan, source } = outcome
    const unitLabel =
      source === 'DUST' ? ACCESSORY_REPAIR_DUST_NAME : source === 'SHARD' ? MEMORY_SHARD_NAME : 'cópia'
    const plural = plan.unitsUsed > 1 ? 's' : ''
    // "3 cópias (2 compradas)" — deixa claro o que saiu da bolsa e o que foi comprado.
    const unitsText = `${plan.unitsUsed} ${unitLabel}${plural}${plan.unitsBought > 0 ? ` (${plan.unitsBought} comprada${plan.unitsBought > 1 ? 's' : ''})` : ''}`
    const goldText = plan.totalGold > 0 ? ` + ${plan.totalGold} gold` : ''

    try {
      await addHistoryEntry({
        characterId: params.characterId,
        activityType: 'ITEM_REPAIRED',
        description: `🔧 ${getDisplayName(outcome.itemName, outcome.enhancementLevel)} reparado (+${plan.durabilityGained} durabilidade, ${unitsText}${goldText}).`,
        itemId: outcome.itemId,
      })
    } catch (historyError) {
      console.error('Erro ao registrar histórico de reparo:', historyError)
    }

    return NextResponse.json({
      success: true,
      durability: outcome.newDurability,
      maxDurability: outcome.maxDurability,
      usedMemoryShard: source === 'SHARD',
      copiesUsed: plan.unitsUsed,
      copiesBought: plan.unitsBought,
      copiesRemaining: outcome.unitsRemaining,
      goldSpent: plan.totalGold,
      fullyRepaired: outcome.newDurability >= outcome.maxDurability,
      message: `🔧 Item reparado! Durabilidade: ${outcome.newDurability}/${outcome.maxDurability} (${unitsText}${goldText})`,
    })
  } catch (error) {
    if (error instanceof RepairError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('Error repairing item:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
