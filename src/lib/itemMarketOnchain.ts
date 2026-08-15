import { Contract, FetchRequest, JsonRpcProvider } from 'ethers'

const ITEM_MARKET_ABI = [
  'function gold() view returns (address)',
  'function items() view returns (address)',
  'function getActiveListingIds() view returns (uint256[])',
  'function listings(uint256) view returns (address seller, uint256 tokenId, uint256 priceGold, bool active)',
  'function burnFeeBps() view returns (uint16)',
  'function treasuryFeeBps() view returns (uint16)',
] as const

function normalizeRpcUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return ''

  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)
  const candidate = hasScheme ? trimmed : `https://${trimmed}`

  try {
    const u = new URL(candidate)
    const host = u.hostname.toLowerCase()
    const isLocalhost = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0'

    if (u.protocol === 'http:' && !isLocalhost) u.protocol = 'https:'
    return u.toString()
  } catch {
    return candidate
  }
}

export function getItemMarketChainId(): number {
  const raw = process.env.ITEM_MARKET_CHAIN_ID || process.env.GOLD_CHAIN_ID || '80002'
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) throw new Error('Invalid ITEM_MARKET_CHAIN_ID')
  return n
}

export function getItemMarketContractAddress(): string {
  return (process.env.ITEM_MARKET_CONTRACT_ADDRESS || '').trim()
}

export function getItemMarketRpcUrl(): string {
  const raw =
    process.env.ITEM_MARKET_RPC_URL ||
    process.env.POLYGON_AMOY_RPC_URL ||
    process.env.GOLD_RPC_URL ||
    process.env.ITEM_NFT_RPC_URL ||
    ''
  return normalizeRpcUrl(raw)
}

export function getItemMarketProvider(): JsonRpcProvider {
  const rpcUrl = getItemMarketRpcUrl()
  if (!rpcUrl) throw new Error('Missing ITEM_MARKET_RPC_URL (or POLYGON_AMOY_RPC_URL)')

  const req = new FetchRequest(rpcUrl)
  const timeoutMs = Number(process.env.ITEM_MARKET_RPC_TIMEOUT_MS || 10_000)
  req.timeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 10_000

  return new JsonRpcProvider(req)
}

export function getItemMarketContract(): Contract {
  const address = getItemMarketContractAddress()
  if (!address) throw new Error('Missing ITEM_MARKET_CONTRACT_ADDRESS')
  return new Contract(address, ITEM_MARKET_ABI, getItemMarketProvider())
}

const ITEM_NFT_OWNER_ABI = ['function ownerOf(uint256 tokenId) view returns (address)'] as const

export function getItemNftContractAddressForMarket(): string {
  return (process.env.ITEM_NFT_CONTRACT_ADDRESS || '').trim()
}

/**
 * Dono ATUAL da NFT do item, lido da chain — a autoridade da posse.
 *
 * O evento `ListingPurchased` prova que uma compra aconteceu um dia, não que
 * quem está pedindo ainda é o dono: quem revende o item de volta ao vendedor
 * original consegue reapresentar a tx da própria compra. Mesmo raciocínio do
 * mercado de personagens (`characterMarketOnchain.getCharacterNftOwner`).
 */
export async function getItemNftOwner(tokenId: bigint): Promise<string> {
  const nftAddress = getItemNftContractAddressForMarket()
  if (!nftAddress) throw new Error('Missing ITEM_NFT_CONTRACT_ADDRESS')

  const nft = new Contract(nftAddress, ITEM_NFT_OWNER_ABI, getItemMarketProvider())
  return String(await nft.ownerOf(tokenId))
}

// Contratos antigos (pré-taxa) não têm os getters — nesse caso a taxa é 0.
export async function getItemMarketFees(): Promise<{ burnBps: number; treasuryBps: number; totalBps: number }> {
  try {
    const market = getItemMarketContract()
    const [burn, treasury] = await Promise.all([market.burnFeeBps(), market.treasuryFeeBps()])
    const burnBps = Number(burn)
    const treasuryBps = Number(treasury)
    return { burnBps, treasuryBps, totalBps: burnBps + treasuryBps }
  } catch {
    return { burnBps: 0, treasuryBps: 0, totalBps: 0 }
  }
}
