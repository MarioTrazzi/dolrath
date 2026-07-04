import { Prisma } from '@prisma/client'

/**
 * Mutações de inventário compartilhadas entre equipar/desequipar.
 *
 * Modelo "mover": um item equipado NÃO permanece no inventário. Ao equipar
 * removemos uma unidade do inventário; ao desequipar (ou trocar de item)
 * devolvemos a instância ao inventário, preservando o nível de aprimoramento.
 *
 * Regra de empilhamento: instâncias base (enhancementLevel === 0) empilham na
 * mesma linha (quantity); instâncias aprimoradas (enhancementLevel > 0) OU
 * desgastadas (durability < maxDurability) vivem sempre em linhas próprias com
 * quantity 1 — empilhar uma peça desgastada apagaria a durabilidade dela.
 */

/**
 * Devolve uma instância de item ao inventário do personagem.
 */
export async function restoreItemToInventory(
  tx: Prisma.TransactionClient,
  characterId: string,
  itemId: string,
  enhancementLevel: number,
  durability = 100,
  maxDurability = 100,
) {
  if (enhancementLevel === 0 && durability >= maxDurability) {
    const existing = await tx.characterInventory.findFirst({
      where: { characterId, itemId, enhancementLevel: 0 },
    })
    if (existing) {
      await tx.characterInventory.update({
        where: { id: existing.id },
        data: { quantity: { increment: 1 } },
      })
      return
    }
  }

  await tx.characterInventory.create({
    data: {
      characterId,
      itemId,
      quantity: 1,
      enhancementLevel,
      durability,
      maxDurability,
    },
  })
}

/**
 * Quantos slots o personagem tem livres agora (linhas de CharacterInventory
 * contam 1 slot cada, empilhado ou não — mesma regra usada em transfer-item).
 */
export async function freeInventorySlots(
  tx: Prisma.TransactionClient,
  characterId: string,
): Promise<{ used: number; limit: number; free: number }> {
  const [used, character] = await Promise.all([
    tx.characterInventory.count({ where: { characterId } }),
    tx.character.findUnique({ where: { id: characterId }, select: { inventorySlots: true } }),
  ])
  const limit = character?.inventorySlots ?? 10
  return { used, limit, free: Math.max(0, limit - used) }
}

/**
 * Garante que há espaço pra `slotsNeeded` linhas NOVAS antes de criar. Lança
 * erro (pego como 400 pelas rotas) — usado em ações explícitas do jogador
 * (craft, forja, compra), onde é melhor barrar com uma mensagem clara do que
 * cobrar gold/ingrediente e não entregar o item.
 */
export async function assertInventoryRoom(
  tx: Prisma.TransactionClient,
  characterId: string,
  slotsNeeded = 1,
) {
  if (slotsNeeded <= 0) return
  const { used, limit, free } = await freeInventorySlots(tx, characterId)
  if (slotsNeeded > free) {
    throw new Error(`Inventário cheio (${used}/${limit}). Libere espaço antes de continuar.`)
  }
}

/**
 * Remove uma unidade de uma linha do inventário. Se a linha tiver quantity > 1,
 * apenas decrementa; caso contrário, apaga a linha. Relê dentro da transação
 * para evitar quantidade obsoleta.
 */
export async function removeOneFromInventory(
  tx: Prisma.TransactionClient,
  inventoryRowId: string,
) {
  const row = await tx.characterInventory.findUnique({ where: { id: inventoryRowId } })
  if (!row) return

  if (row.quantity > 1) {
    await tx.characterInventory.update({
      where: { id: inventoryRowId },
      data: { quantity: { decrement: 1 } },
    })
  } else {
    await tx.characterInventory.delete({ where: { id: inventoryRowId } })
  }
}
