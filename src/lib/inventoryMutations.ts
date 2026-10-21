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
  // O fallback tem que acompanhar o DEFAULT do schema (25). Enquanto ficou em 10
  // ele contradizia o banco: qualquer leitura que falhasse tratava o herói como
  // tendo 10 slots e descartava espólio em silêncio.
  const limit = character?.inventorySlots ?? 25
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
 * 🪙 Janela da trava de listagem (marketplace/list-intent): enquanto um lazy-mint
 * está em voo a peça não pode sair da mochila por NENHUM caminho — senão o
 * jogador fica com a NFT e com o item (ou com o que o item virou). O voucher de
 * mint vence em 15 min, então 20 min cobre o mint inteiro.
 */
export const LISTING_LOCK_MS = 20 * 60_000

/**
 * Filtro Prisma: linhas SEM trava de listagem viva. Trava com voucher gravado
 * (`listingPurchaseId`) NÃO expira por tempo — o mint pode ter acontecido e só
 * o contrato sabe; quem solta é o resolveListingLock (src/lib/listingLock.ts).
 * A expiração por tempo vale só para travas antigas, sem voucher gravado.
 */
export function listingUnlockedWhere(now = Date.now()) {
  return {
    OR: [
      { listingLockedAt: null },
      { listingLockedAt: { lt: new Date(now - LISTING_LOCK_MS) }, listingPurchaseId: null },
    ],
  }
}

/** Mesma regra do `listingUnlockedWhere`, para uma linha já lida. */
export function isListingLocked(
  row: { listingLockedAt?: Date | null; listingPurchaseId?: string | null },
  now = Date.now(),
): boolean {
  if (!row.listingLockedAt) return false
  if (row.listingPurchaseId) return true
  return now - new Date(row.listingLockedAt).getTime() < LISTING_LOCK_MS
}

/**
 * A linha não tinha mais a quantidade pedida quando a transação chegou nela —
 * outro request (aba duplicada, clique duplo) consumiu antes. As rotas pegam
 * isso e respondem 409 em vez de 500.
 */
export class InventoryQuantityError extends Error {
  constructor() {
    super('INVENTORY_QUANTITY_CHANGED')
    this.name = 'InventoryQuantityError'
  }
}

/**
 * Tira `qty` unidades de uma linha de CharacterInventory de forma ATÔMICA.
 *
 * O padrão antigo (ler a linha fora da transação, depois `decrement` ou
 * `delete` conforme a quantidade lida) deixava dois requests simultâneos
 * venderem/consumirem a mesma pilha: ambos liam 5, ambos decrementavam 3, a
 * linha ia a −1 e o gold/efeito era entregue duas vezes. Aqui o UPDATE só
 * acontece se ainda houver `qty` na linha (o Postgres reavalia o WHERE depois
 * de pegar o lock), e a linha que zera é apagada no mesmo passo.
 */
export async function takeFromCharacterInventory(
  tx: Prisma.TransactionClient,
  inventoryRowId: string,
  qty: number,
) {
  const n = Math.max(1, Math.floor(qty))
  const { count } = await tx.characterInventory.updateMany({
    // Peça travada por um mint em andamento também conta como indisponível.
    where: { id: inventoryRowId, quantity: { gte: n }, ...listingUnlockedWhere() },
    data: { quantity: { decrement: n } },
  })
  if (count === 0) throw new InventoryQuantityError()
  await tx.characterInventory.deleteMany({ where: { id: inventoryRowId, quantity: { lte: 0 } } })
}

/** Mesmo contrato de `takeFromCharacterInventory`, para o Baú Geral (UserInventory). */
export async function takeFromUserInventory(
  tx: Prisma.TransactionClient,
  inventoryRowId: string,
  qty: number,
) {
  const n = Math.max(1, Math.floor(qty))
  const { count } = await tx.userInventory.updateMany({
    where: { id: inventoryRowId, quantity: { gte: n } },
    data: { quantity: { decrement: n } },
  })
  if (count === 0) throw new InventoryQuantityError()
  await tx.userInventory.deleteMany({ where: { id: inventoryRowId, quantity: { lte: 0 } } })
}
