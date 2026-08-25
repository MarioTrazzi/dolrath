import { Prisma } from '@prisma/client'
import { assertInventoryRoom } from './inventoryMutations'

/**
 * 🌐⚒️ POOL DE INSUMOS — mochila do herói + Baú Geral da conta.
 *
 * As quatro bancadas (Forja, Alquimia, Processamento, Culinária) enxergavam
 * apenas `CharacterInventory`. Como o espólio se acumula no Baú Geral
 * (`UserInventory`, 50 slots contra 25 da mochila), craftar virava um pedágio:
 * arrastar cada material do baú pra mochila antes de abrir a bancada — atrito
 * puro, sem decisão de jogo embutida. Aqui as duas fontes viram UM pool.
 *
 * Não é conceito novo no jogo: /api/inventory/use-item já consome dos dois
 * inventários. Este módulo é a versão compartilhada disso, para as bancadas.
 *
 * ORDEM DE CONSUMO: mochila primeiro, baú depois. A mochila é o inventário
 * escasso e é onde a coleta despeja — gastá-la primeiro LIBERA slot do herói,
 * que é o oposto do atrito que estamos matando.
 *
 * O que NÃO muda: o gold sai da carteira do personagem e o XP é creditado no
 * personagem que craftou (o nível da profissão é que é a soma da conta, em
 * craftingServer.ts). Quem faz, ganha. [[dolrath-crafting-professions]]
 *
 * Nota estrutural: `UserInventory` é uma pilha pura (@@unique([userId, itemId]),
 * só `quantity`) — não tem enhancementLevel nem durability. Para INSUMO isso é
 * inofensivo (material/ingrediente/processado é sempre CONSUMABLE, +0 e sem
 * desgaste); é por isso que leitura de insumo e depósito de saída são tratados
 * como problemas separados aqui.
 */

/** Slots default do Baú Geral — tem que acompanhar o DEFAULT do schema (50). */
const GLOBAL_SLOTS_DEFAULT = 50

export type PoolSource = 'character' | 'global'

/**
 * Forma mínima do Item para os filtros das bancadas — compatível com o
 * `CraftableLike` de itemCatalog.ts (isIngredientItem/isMaterialItem/…).
 */
export type PoolItem = { id: string; name: string; type: string; stats: Prisma.JsonValue }

/** Uma linha de insumo, de qualquer um dos dois inventários. */
export interface PoolRow {
  source: PoolSource
  /** id da LINHA (CharacterInventory.id ou UserInventory.id), não do Item. */
  id: string
  quantity: number
  item: PoolItem
}

/** nome do catálogo → linhas que o fornecem, JÁ ordenadas mochila-antes-do-baú. */
export type MaterialPool = Map<string, PoolRow[]>

/**
 * Carrega as linhas de insumo dos DOIS inventários, agrupadas por nome.
 *
 * `accept` é o filtro opcional que a Alquimia usa para não deixar uma poção de
 * mesmo nome passar por ingrediente (craft-potion peneira por
 * isIngredientItem || isMaterialItem || isProcessedItem).
 */
export async function loadMaterialPool(
  tx: Prisma.TransactionClient,
  {
    characterId,
    userId,
    names,
    accept,
  }: {
    characterId: string
    userId: string
    names: string[]
    accept?: (item: PoolItem) => boolean
  },
): Promise<MaterialPool> {
  if (names.length === 0) return new Map()

  // Materiais, ingredientes e processados são TODOS CONSUMABLE (distinguidos
  // por stats.kind) — o casamento é por nome dentro de CONSUMABLE, igual ao
  // que as rotas faziam antes de existir este módulo.
  const where = { name: { in: names }, type: 'CONSUMABLE' as const }

  const [charRows, globalRows] = await Promise.all([
    tx.characterInventory.findMany({
      where: { characterId, quantity: { gt: 0 }, item: where },
      include: { item: true },
    }),
    tx.userInventory.findMany({
      where: { userId, quantity: { gt: 0 }, item: where },
      include: { item: true },
    }),
  ])

  const pool: MaterialPool = new Map()
  // A ordem de inserção É a ordem de consumo: mochila primeiro, baú depois.
  const push = (source: PoolSource, row: { id: string; quantity: number; item: PoolItem }) => {
    if (accept && !accept(row.item)) return
    const arr = pool.get(row.item.name) ?? []
    arr.push({ source, id: row.id, quantity: row.quantity, item: row.item })
    pool.set(row.item.name, arr)
  }
  for (const r of charRows) push('character', r)
  for (const r of globalRows) push('global', r)

  return pool
}

/** Quanto o pool tem de um insumo, somando as duas origens. */
export function poolCount(pool: MaterialPool, name: string): number {
  return (pool.get(name) ?? []).reduce((n, r) => n + r.quantity, 0)
}

/** Quanto do insumo veio do Baú Geral — só para a mensagem ao jogador. */
export function poolCountFromGlobal(pool: MaterialPool, name: string): number {
  return (pool.get(name) ?? []).reduce((n, r) => (r.source === 'global' ? n + r.quantity : n), 0)
}

/**
 * Consome N unidades de cada insumo, mochila antes do baú.
 *
 * Um update por LINHA tocada (nunca por unidade): o lote do Processamento vai a
 * 500 e a $transaction do Postgres estoura em P2028 por volta de ~5s.
 * [[dolrath-run-flush-tx-budget]]
 */
export async function consumeFromPool(
  tx: Prisma.TransactionClient,
  pool: MaterialPool,
  needs: { name: string; quantity: number }[],
): Promise<void> {
  for (const need of needs) {
    let remaining = need.quantity
    for (const row of pool.get(need.name) ?? []) {
      if (remaining <= 0) break
      const take = Math.min(row.quantity, remaining)
      // Abate no objeto em memória também: se uma receita futura listar o mesmo
      // insumo duas vezes, a segunda passada tem que ver o saldo já gasto — hoje
      // nenhuma das 84 receitas repete nome, e é assim que continua inofensivo.
      row.quantity -= take
      if (row.quantity > 0) {
        if (row.source === 'character') {
          await tx.characterInventory.update({
            where: { id: row.id },
            data: { quantity: { decrement: take } },
          })
        } else {
          await tx.userInventory.update({
            where: { id: row.id },
            data: { quantity: { decrement: take } },
          })
        }
      } else {
        // Zerou: APAGA a linha. Linha de quantity 0 é fantasma — aparece no baú
        // mas nenhuma ação a aceita. [[dolrath-inventory-ghost-rows]]
        if (row.source === 'character') {
          await tx.characterInventory.delete({ where: { id: row.id } })
        } else {
          await tx.userInventory.delete({ where: { id: row.id } })
        }
      }
      remaining -= take
    }
    if (remaining > 0) {
      // Não deveria acontecer (a rota confere com poolCount antes), mas melhor
      // estourar a transação do que consumir pela metade.
      throw new Error(`Falta ${need.name} para completar o lote.`)
    }
  }
}

/** Slots livres do Baú Geral — espelha freeInventorySlots do personagem. */
export async function freeGlobalChestSlots(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<{ used: number; limit: number; free: number }> {
  const [used, user] = await Promise.all([
    tx.userInventory.count({ where: { userId, quantity: { gt: 0 } } }),
    tx.user.findUnique({ where: { id: userId }, select: { globalInventorySlots: true } }),
  ])
  const limit = user?.globalInventorySlots ?? GLOBAL_SLOTS_DEFAULT
  return { used, limit, free: Math.max(0, limit - used) }
}

/**
 * Garante espaço no Baú Geral antes de criar linha nova.
 *
 * Nota: o cap do baú (User.globalInventorySlots) NÃO é enforçado nas rotas
 * antigas (transfer-to-global e as compras empurram sem contar) — é hoje só um
 * número na UI. Este caminho de escrita nasce com o cap valendo; corrigir as
 * rotas antigas é mudança de comportamento com efeito econômico e merece commit
 * próprio.
 */
export async function assertGlobalChestRoom(
  tx: Prisma.TransactionClient,
  userId: string,
  slotsNeeded = 1,
): Promise<void> {
  if (slotsNeeded <= 0) return
  const { used, limit, free } = await freeGlobalChestSlots(tx, userId)
  if (slotsNeeded > free) {
    throw new Error(`Baú Geral cheio (${used}/${limit}). Libere espaço antes de continuar.`)
  }
}

/**
 * Deposita a saída do craft: mochila do herói se couber, senão Baú Geral.
 *
 * Como o insumo agora pode vir inteiro do baú, é perfeitamente possível craftar
 * com a mochila lotada — travar aí com "Inventário cheio" recriaria o atrito por
 * outra porta. Só falha se os DOIS estiverem cheios.
 *
 * Seguro por construção: peça recém-craftada é sempre +0 e com durabilidade
 * cheia, que é exatamente a condição que transfer-to-global já exige para
 * aceitar um item no baú.
 */
export async function depositCraftOutput(
  tx: Prisma.TransactionClient,
  {
    characterId,
    userId,
    itemId,
    quantity,
    isEquipment,
  }: {
    characterId: string
    userId: string
    itemId: string
    quantity: number
    /** Equipamento não empilha na mochila: 1 linha (1 slot) por peça. */
    isEquipment: boolean
  },
): Promise<PoolSource> {
  if (quantity <= 0) return 'character'

  if (isEquipment) {
    const { free } = await freeInventoryRoomSafe(tx, characterId)
    if (free >= quantity) {
      for (let i = 0; i < quantity; i++) {
        await tx.characterInventory.create({ data: { characterId, itemId, quantity: 1 } })
      }
      return 'character'
    }
    // No baú a peça vira pilha por itemId (o baú não guarda +N nem desgaste, e
    // uma peça recém-forjada é exatamente isso: +0 e íntegra).
    return depositToGlobalChest(tx, userId, itemId, quantity)
  }

  // Consumível empilha: se já existe a pilha, não gasta slot nenhum.
  const existing = await tx.characterInventory.findFirst({
    where: { characterId, itemId, enhancementLevel: 0 },
  })
  if (existing) {
    await tx.characterInventory.update({
      where: { id: existing.id },
      data: { quantity: { increment: quantity } },
    })
    return 'character'
  }

  const { free } = await freeInventoryRoomSafe(tx, characterId)
  if (free >= 1) {
    await tx.characterInventory.create({ data: { characterId, itemId, quantity } })
    return 'character'
  }
  return depositToGlobalChest(tx, userId, itemId, quantity)
}

/** Empilha no Baú Geral (@@unique([userId, itemId]) faz o upsert ser exato). */
async function depositToGlobalChest(
  tx: Prisma.TransactionClient,
  userId: string,
  itemId: string,
  quantity: number,
): Promise<PoolSource> {
  const existing = await tx.userInventory.findUnique({
    where: { userId_itemId: { userId, itemId } },
  })
  if (!existing) await assertGlobalChestRoom(tx, userId, 1)
  await tx.userInventory.upsert({
    where: { userId_itemId: { userId, itemId } },
    create: { userId, itemId, quantity },
    update: { quantity: { increment: quantity } },
  })
  return 'global'
}

/**
 * Espaço livre na mochila. Usa a mesma contagem de `assertInventoryRoom`
 * (linhas de CharacterInventory, empilhadas ou não), mas devolve o número em
 * vez de lançar — aqui "cheio" não é erro, é o gatilho do transbordo.
 */
async function freeInventoryRoomSafe(
  tx: Prisma.TransactionClient,
  characterId: string,
): Promise<{ free: number }> {
  const [used, character] = await Promise.all([
    tx.characterInventory.count({ where: { characterId } }),
    tx.character.findUnique({ where: { id: characterId }, select: { inventorySlots: true } }),
  ])
  const limit = character?.inventorySlots ?? 25
  return { free: Math.max(0, limit - used) }
}

// `assertInventoryRoom` continua sendo o caminho para quem QUER barrar em vez
// de transbordar; re-exportado para as rotas não precisarem de dois imports.
export { assertInventoryRoom }
