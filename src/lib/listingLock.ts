import { Contract, Interface } from 'ethers'
import { prisma } from '@/lib/prisma'
import { getItemNftChainId, getItemNftContractAddress, getItemNftProvider } from '@/lib/itemNftOnchain'
import { isListingLocked } from '@/lib/inventoryMutations'

/**
 * 🪙 Resolução da trava de lazy-mint (list-intent → mint on-chain → list-confirm).
 *
 * O voucher assinado no list-intent vale 15 min. Antes, a trava da linha
 * expirava sozinha em 20 min — e quem mintava e NÃO chamava o list-confirm
 * ficava com a NFT na carteira E o item na mochila (vendia ao ferreiro, usava,
 * aprimorava). Agora a linha guarda o `listingPurchaseId` do voucher e só o
 * contrato decide:
 *   - usedPurchaseId = true  → a NFT existe: queima a unidade e registra o ItemNft
 *                              (o mesmo que o list-confirm faria).
 *   - false e voucher vencido → nunca mais será mintado: destrava.
 *   - false e voucher válido  → ainda pode ser mintado: continua travada.
 */

export const LAZY_MINT_VOUCHER_MS = 15 * 60_000
// Folga para o relógio da chain e um bloco atrasado depois do deadline.
const VOUCHER_GRACE_MS = 2 * 60_000

const ITEMS_ABI = [
  'function usedPurchaseId(bytes32) view returns (bool)',
  'event ItemMinted(address indexed to, uint256 indexed tokenId, bytes32 indexed purchaseId, bytes32 itemKey, uint256 paidGold)',
] as const
const itemsIface = new Interface(ITEMS_ABI)

export type ListingLockState = 'unlocked' | 'pending' | 'released' | 'minted'

/** Marca de proveniência gravada em ItemNft.purchaseTxHash (única por voucher). */
export function lazyMintMarker(purchaseId: string): string {
  return `lazymint:${purchaseId.toLowerCase()}`
}

/**
 * Tira UMA unidade da linha travada pelo voucher `purchaseId` e solta a trava,
 * condicionado ao voucher ainda ser o da linha: list-confirm e o resolvedor
 * podem correr juntos e só um queima. Lança se outro já queimou.
 */
export async function burnListedUnitTx(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  rowId: string,
  purchaseId: string | null,
): Promise<void> {
  const claimed = await tx.characterInventory.updateMany({
    where: {
      id: rowId,
      quantity: { gte: 1 },
      // Trava antiga (sem voucher gravado): basta estar travada.
      ...(purchaseId ? { listingPurchaseId: purchaseId } : { listingLockedAt: { not: null } }),
    },
    data: { quantity: { decrement: 1 }, listingLockedAt: null, listingPurchaseId: null },
  })
  if (claimed.count !== 1) throw new ListingAlreadyResolvedError()
  await tx.characterInventory.deleteMany({ where: { id: rowId, quantity: { lte: 0 } } })
}

export class ListingAlreadyResolvedError extends Error {
  constructor() {
    super('LISTING_ALREADY_RESOLVED')
    this.name = 'ListingAlreadyResolvedError'
  }
}

/**
 * Acha o ItemMinted do voucher. Os RPCs da Polygon limitam o intervalo do
 * getLogs, então a busca fica na janela em que o mint PODE ter acontecido: do
 * bloco da trava até o fim do voucher (15 min), estimando o bloco pelo tempo
 * médio recente, com folga, em fatias de 2000 blocos.
 */
async function findMintLog(
  provider: ReturnType<typeof getItemNftProvider>,
  contractAddress: string,
  purchaseId: string,
  lockedAt: Date,
) {
  const topic = itemsIface.getEvent('ItemMinted')!.topicHash
  const latest = await provider.getBlock('latest')
  if (!latest) return null
  const back = Math.min(latest.number, 5000)
  const older = back > 0 ? await provider.getBlock(latest.number - back) : null
  const avg = older && latest.timestamp > older.timestamp ? (latest.timestamp - older.timestamp) / back : 2
  const lockTs = Math.floor(lockedAt.getTime() / 1000)
  const est = latest.number - Math.floor(Math.max(0, latest.timestamp - lockTs) / avg)
  const windowBlocks = Math.ceil((LAZY_MINT_VOUCHER_MS + VOUCHER_GRACE_MS) / 1000 / avg)
  const from = Math.max(0, est - 1000)
  const to = Math.min(latest.number, est + windowBlocks + 1000)
  for (let start = from; start <= to; start += 2000) {
    const logs = await provider.getLogs({
      address: contractAddress,
      topics: [topic, null, null, purchaseId],
      fromBlock: start,
      toBlock: Math.min(to, start + 1999),
    })
    if (logs[0]) return logs[0]
  }
  return null
}

/** Resolve a trava de UMA linha consultando o contrato. */
export async function resolveListingLock(rowId: string, now = Date.now()): Promise<ListingLockState> {
  const row = await prisma.characterInventory.findUnique({
    where: { id: rowId },
    include: { character: { select: { userId: true } } },
  })
  if (!row || !row.listingLockedAt) return 'unlocked'
  const purchaseId = row.listingPurchaseId
  if (!purchaseId) {
    // Trava antiga: segue a regra de tempo de sempre.
    return now - row.listingLockedAt.getTime() < 20 * 60_000 ? 'pending' : 'unlocked'
  }

  const contractAddress = getItemNftContractAddress()
  if (!contractAddress) return 'pending'
  const provider = getItemNftProvider()
  const items = new Contract(contractAddress, ITEMS_ABI, provider)

  const used = Boolean(await items.usedPurchaseId(purchaseId))
  if (!used) {
    const voucherOver = now > row.listingLockedAt.getTime() + LAZY_MINT_VOUCHER_MS + VOUCHER_GRACE_MS
    if (!voucherOver) return 'pending'
    const released = await prisma.characterInventory.updateMany({
      where: { id: row.id, listingPurchaseId: purchaseId },
      data: { listingLockedAt: null, listingPurchaseId: null },
    })
    return released.count === 1 ? 'released' : 'unlocked'
  }

  // Mintado e nunca confirmado: acha o evento do voucher e fecha a conta.
  const log = await findMintLog(provider, contractAddress, purchaseId, row.listingLockedAt)
  if (!log) return 'pending' // RPC sem o log ainda — tenta de novo depois.
  const parsed = itemsIface.parseLog(log)!
  const tokenId = parsed.args.tokenId as bigint
  const paidGold = parsed.args.paidGold as bigint

  try {
    await prisma.$transaction(async (tx) => {
      await burnListedUnitTx(tx, row.id, purchaseId)
      const already = await tx.itemNft.findUnique({ where: { mintTxHash: log.transactionHash } })
      if (!already) {
        await tx.itemNft.create({
          data: {
            userId: row.character.userId,
            itemId: row.itemId,
            chainId: getItemNftChainId(),
            contract: contractAddress,
            tokenId,
            paidGoldWei: paidGold.toString(),
            enhancementLevel: row.enhancementLevel,
            mintSource: 'lazy',
            purchaseTxHash: lazyMintMarker(purchaseId),
            mintTxHash: log.transactionHash,
          },
        })
      }
    })
  } catch (e) {
    if (e instanceof ListingAlreadyResolvedError) return 'minted'
    throw e
  }
  return 'minted'
}

/**
 * Resolve as travas com voucher de um personagem que JÁ podem ter desfecho
 * (voucher vencido). Barato quando não há nenhuma: uma consulta indexada por
 * personagem; a chain só é chamada se existir trava pendurada.
 */
export async function resolveStaleListingLocks(characterId: string, now = Date.now()): Promise<void> {
  const stale = await prisma.characterInventory.findMany({
    where: {
      characterId,
      listingPurchaseId: { not: null },
      listingLockedAt: { lt: new Date(now - LAZY_MINT_VOUCHER_MS - VOUCHER_GRACE_MS) },
    },
    select: { id: true },
  })
  for (const r of stale) {
    try {
      await resolveListingLock(r.id, now)
    } catch (e) {
      console.error('[listingLock] resolve failed', r.id, e)
    }
  }
}

/**
 * Para as rotas que usam uma peça (vender, aprimorar, mandar ao Baú): a linha
 * ainda está presa a uma listagem? Antes de recusar, tenta resolver — um
 * voucher vencido sem uso solta a peça na hora. null = livre.
 */
export async function stillListingLocked(row: {
  id: string
  listingLockedAt?: Date | null
  listingPurchaseId?: string | null
}): Promise<null | 'pending' | 'minted'> {
  if (!isListingLocked(row)) return null
  if (!row.listingPurchaseId) return 'pending'
  const state = await resolveListingLock(row.id).catch((e) => {
    console.error('[listingLock] resolve failed', row.id, e)
    return 'pending' as const
  })
  if (state === 'released' || state === 'unlocked') return null
  return state
}

/** Mensagem (chave i18n) para a peça presa: em listagem ou já virou NFT. */
export function listingLockErrorKey(state: 'pending' | 'minted'): string {
  return state === 'minted'
    ? 'This piece was already minted as an NFT.'
    : 'This piece is being listed on the market. Wait a few minutes.'
}
