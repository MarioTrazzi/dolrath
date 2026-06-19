import { Prisma } from '@prisma/client'

/**
 * Mutações de inventário compartilhadas entre equipar/desequipar.
 *
 * Modelo "mover": um item equipado NÃO permanece no inventário. Ao equipar
 * removemos uma unidade do inventário; ao desequipar (ou trocar de item)
 * devolvemos a instância ao inventário, preservando o nível de aprimoramento.
 *
 * Regra de empilhamento: instâncias base (enhancementLevel === 0) empilham na
 * mesma linha (quantity); instâncias aprimoradas (enhancementLevel > 0) vivem
 * sempre em linhas próprias com quantity 1.
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
  if (enhancementLevel === 0) {
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
