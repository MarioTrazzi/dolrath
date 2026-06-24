import { Interface } from 'ethers'
import { getCharacterMarketContractAddress, getCharacterMarketProvider } from './characterMarketOnchain'

const MARKET_VERIFY_ABI = [
  'event ListingCreated(uint256 indexed listingId, address indexed seller, uint256 indexed tokenId, uint256 priceDol)',
  'event ListingCancelled(uint256 indexed listingId, address indexed seller)',
  'event ListingPurchased(uint256 indexed listingId, address indexed seller, address indexed buyer, uint256 tokenId, uint256 priceDol)',
] as const

const marketIface = new Interface(MARKET_VERIFY_ABI)

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function readRetryConfig() {
  const retriesRaw = Number(
    process.env.CHARACTER_MARKET_RECEIPT_RETRIES ?? process.env.GOLD_PAYMENT_RECEIPT_RETRIES ?? 6
  )
  const delayMsRaw = Number(
    process.env.CHARACTER_MARKET_RECEIPT_DELAY_MS ?? process.env.GOLD_PAYMENT_RECEIPT_DELAY_MS ?? 1000
  )
  const retries = Number.isFinite(retriesRaw) && retriesRaw >= 0 ? Math.floor(retriesRaw) : 6
  const delayMs = Number.isFinite(delayMsRaw) && delayMsRaw > 0 ? Math.floor(delayMsRaw) : 1000
  return { retries, delayMs }
}

export async function verifyCharacterPurchasedTx(params: {
  txHash: string
  expectedBuyer?: string
  expectedListingId?: bigint
  contractAddress?: string
}) {
  const contractAddress = (params.contractAddress || getCharacterMarketContractAddress()).trim()
  if (!contractAddress) throw new Error('Missing CHARACTER_MARKET_CONTRACT_ADDRESS')

  const provider = getCharacterMarketProvider()
  const { retries, delayMs } = readRetryConfig()

  let receipt = await provider.getTransactionReceipt(params.txHash)
  for (let attempt = 0; !receipt && attempt < retries; attempt++) {
    await sleep(delayMs)
    receipt = await provider.getTransactionReceipt(params.txHash)
  }

  if (!receipt) {
    throw new Error('Transação ainda não encontrada. Aguarde a confirmação e tente novamente.')
  }
  if (receipt.status !== 1) {
    throw new Error('Transação falhou (status != 1)')
  }

  const contractLc = contractAddress.toLowerCase()
  const expectedBuyerLc = params.expectedBuyer?.toLowerCase()

  const parsed = receipt.logs
    .filter((log) => log.address.toLowerCase() === contractLc)
    .map((log) => {
      try {
        return marketIface.parseLog(log)
      } catch {
        return null
      }
    })
    .filter(Boolean)
    .find((evt: any) => {
      if (evt.name !== 'ListingPurchased') return false
      if (params.expectedListingId != null && (evt.args.listingId as bigint) !== params.expectedListingId) {
        return false
      }
      if (expectedBuyerLc && String(evt.args.buyer).toLowerCase() !== expectedBuyerLc) return false
      return true
    }) as any | undefined

  if (!parsed) {
    throw new Error('Nenhum evento ListingPurchased compatível encontrado para essa transação')
  }

  return {
    listingId: parsed.args.listingId as bigint,
    seller: String(parsed.args.seller),
    buyer: String(parsed.args.buyer),
    tokenId: parsed.args.tokenId as bigint,
    priceDol: parsed.args.priceDol as bigint,
  }
}
