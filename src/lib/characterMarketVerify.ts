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

// Busca o recibo (com retry — a tx pode ainda não ter propagado) e devolve os
// eventos do mercado que ela emitiu, já decodificados.
async function parseMarketLogs(txHash: string, contractAddressOverride?: string) {
  const contractAddress = (contractAddressOverride || getCharacterMarketContractAddress()).trim()
  if (!contractAddress) throw new Error('Missing CHARACTER_MARKET_CONTRACT_ADDRESS')

  const provider = getCharacterMarketProvider()
  const { retries, delayMs } = readRetryConfig()

  let receipt = await provider.getTransactionReceipt(txHash)
  for (let attempt = 0; !receipt && attempt < retries; attempt++) {
    await sleep(delayMs)
    receipt = await provider.getTransactionReceipt(txHash)
  }

  if (!receipt) {
    throw new Error('Transação ainda não encontrada. Aguarde a confirmação e tente novamente.')
  }
  if (receipt.status !== 1) {
    throw new Error('Transação falhou (status != 1)')
  }

  const contractLc = contractAddress.toLowerCase()
  return receipt.logs
    .filter((log) => log.address.toLowerCase() === contractLc)
    .map((log) => {
      try {
        return marketIface.parseLog(log)
      } catch {
        return null
      }
    })
    .filter(Boolean) as any[]
}

export async function verifyCharacterPurchasedTx(params: {
  txHash: string
  expectedBuyer?: string
  expectedListingId?: bigint
  contractAddress?: string
}) {
  const events = await parseMarketLogs(params.txHash, params.contractAddress)
  const expectedBuyerLc = params.expectedBuyer?.toLowerCase()

  const parsed = events.find((evt: any) => {
    if (evt.name !== 'ListingPurchased') return false
    if (params.expectedListingId != null && (evt.args.listingId as bigint) !== params.expectedListingId) {
      return false
    }
    if (expectedBuyerLc && String(evt.args.buyer).toLowerCase() !== expectedBuyerLc) return false
    return true
  })

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

/** Prova que o vendedor colocou ESTE tokenId em escrow (listagem criada). */
export async function verifyCharacterListedTx(params: {
  txHash: string
  expectedSeller?: string
  expectedTokenId?: bigint
  contractAddress?: string
}) {
  const events = await parseMarketLogs(params.txHash, params.contractAddress)
  const expectedSellerLc = params.expectedSeller?.toLowerCase()

  const parsed = events.find((evt: any) => {
    if (evt.name !== 'ListingCreated') return false
    if (params.expectedTokenId != null && (evt.args.tokenId as bigint) !== params.expectedTokenId) return false
    if (expectedSellerLc && String(evt.args.seller).toLowerCase() !== expectedSellerLc) return false
    return true
  })

  if (!parsed) {
    throw new Error('Nenhum evento ListingCreated compatível encontrado para essa transação')
  }

  return {
    listingId: parsed.args.listingId as bigint,
    seller: String(parsed.args.seller),
    tokenId: parsed.args.tokenId as bigint,
    priceDol: parsed.args.priceDol as bigint,
  }
}

/** Prova que a listagem foi cancelada pelo vendedor (NFT saiu do escrow). */
export async function verifyCharacterListingCancelledTx(params: {
  txHash: string
  expectedSeller?: string
  expectedListingId?: bigint
  contractAddress?: string
}) {
  const events = await parseMarketLogs(params.txHash, params.contractAddress)
  const expectedSellerLc = params.expectedSeller?.toLowerCase()

  const parsed = events.find((evt: any) => {
    if (evt.name !== 'ListingCancelled') return false
    if (params.expectedListingId != null && (evt.args.listingId as bigint) !== params.expectedListingId) return false
    if (expectedSellerLc && String(evt.args.seller).toLowerCase() !== expectedSellerLc) return false
    return true
  })

  if (!parsed) {
    throw new Error('Nenhum evento ListingCancelled compatível encontrado para essa transação')
  }

  return {
    listingId: parsed.args.listingId as bigint,
    seller: String(parsed.args.seller),
  }
}
