import { Interface } from 'ethers'
import { getItemNftContractAddress, getItemNftProvider } from './itemNftOnchain'

const ITEMS_VERIFY_ABI = [
  'event ItemMinted(address indexed to, uint256 indexed tokenId, bytes32 indexed purchaseId, bytes32 itemKey, uint256 paidGold)',
] as const

const itemsIface = new Interface(ITEMS_VERIFY_ABI)

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function readRetryConfig() {
  const retriesRaw = Number(process.env.ITEM_NFT_RECEIPT_RETRIES ?? process.env.GOLD_PAYMENT_RECEIPT_RETRIES ?? 6)
  const delayMsRaw = Number(process.env.ITEM_NFT_RECEIPT_DELAY_MS ?? process.env.GOLD_PAYMENT_RECEIPT_DELAY_MS ?? 1000)
  const retries = Number.isFinite(retriesRaw) && retriesRaw >= 0 ? Math.floor(retriesRaw) : 6
  const delayMs = Number.isFinite(delayMsRaw) && delayMsRaw > 0 ? Math.floor(delayMsRaw) : 1000
  return { retries, delayMs }
}

export async function verifyItemMintTx(params: {
  txHash: string
  expectedTo: string
  expectedPurchaseId: string
  expectedItemKey: string
  expectedMinPaidGold: bigint
  contractAddress?: string
}) {
  const contractAddress = (params.contractAddress || getItemNftContractAddress()).trim()
  if (!contractAddress) throw new Error('Missing ITEM_NFT_CONTRACT_ADDRESS')

  const provider = getItemNftProvider()

  const { retries, delayMs } = readRetryConfig()
  let receipt = await provider.getTransactionReceipt(params.txHash)
  for (let attempt = 0; !receipt && attempt < retries; attempt++) {
    await sleep(delayMs)
    receipt = await provider.getTransactionReceipt(params.txHash)
  }

  if (!receipt) throw new Error('Mint tx ainda não encontrada. Aguarde a confirmação e tente novamente.')
  if (receipt.status !== 1) throw new Error('Mint tx falhou (status != 1)')

  const expectedToLc = params.expectedTo.toLowerCase()
  const expectedPurchaseIdLc = params.expectedPurchaseId.toLowerCase()
  const contractLc = contractAddress.toLowerCase()

  const parsed = receipt.logs
    .filter((log) => log.address.toLowerCase() === contractLc)
    .map((log) => {
      try {
        return itemsIface.parseLog(log)
      } catch {
        return null
      }
    })
    .filter(Boolean)
    .find((evt: any) => {
      const to = String(evt.args.to).toLowerCase()
      const purchaseId = String(evt.args.purchaseId).toLowerCase()
      const itemKey = String(evt.args.itemKey).toLowerCase()
      return to === expectedToLc && purchaseId === expectedPurchaseIdLc
        && itemKey === String(params.expectedItemKey || '').toLowerCase()
    }) as any | undefined

  if (!parsed) {
    throw new Error('Nenhum evento ItemMinted compatível encontrado para essa transação')
  }

  const tokenId = parsed.args.tokenId as bigint
  const paidGold = parsed.args.paidGold as bigint
  const itemKey = parsed.args.itemKey as string

  if (paidGold < params.expectedMinPaidGold) {
    throw new Error('Mint registrou paidGold menor do que o esperado')
  }

  return {
    tokenId,
    paidGold,
    itemKey,
  }
}
