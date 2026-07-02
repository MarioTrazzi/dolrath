import { Contract, FetchRequest, JsonRpcProvider } from 'ethers'

// ABI mínimo de leitura do DolrathCharacterMarket (escrow de NFT de personagem em DOL).
const CHARACTER_MARKET_ABI = [
  'function dol() view returns (address)',
  'function characters() view returns (address)',
  'function getActiveListingIds() view returns (uint256[])',
  'function listings(uint256) view returns (address seller, uint256 tokenId, uint256 priceDol, bool active)',
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

    // Muitos RPCs públicos redirecionam http -> https via 301, quebrando o POST JSON-RPC.
    if (u.protocol === 'http:' && !isLocalhost) u.protocol = 'https:'
    return u.toString()
  } catch {
    return candidate
  }
}

export function getCharacterMarketChainId(): number {
  const raw =
    process.env.CHARACTER_MARKET_CHAIN_ID ||
    process.env.CHARACTER_NFT_CHAIN_ID ||
    process.env.DOL_CHAIN_ID ||
    '80002'
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) throw new Error('Invalid CHARACTER_MARKET_CHAIN_ID')
  return n
}

export function getCharacterMarketContractAddress(): string {
  return (process.env.CHARACTER_MARKET_CONTRACT_ADDRESS || '').trim()
}

export function getCharacterMarketRpcUrl(): string {
  const raw =
    process.env.CHARACTER_MARKET_RPC_URL ||
    process.env.POLYGON_AMOY_RPC_URL ||
    process.env.DOL_RPC_URL ||
    process.env.CHARACTER_NFT_RPC_URL ||
    ''
  return normalizeRpcUrl(raw)
}

export function getCharacterMarketProvider(): JsonRpcProvider {
  const rpcUrl = getCharacterMarketRpcUrl()
  if (!rpcUrl) throw new Error('Missing CHARACTER_MARKET_RPC_URL (or POLYGON_AMOY_RPC_URL)')

  const req = new FetchRequest(rpcUrl)
  const timeoutMs = Number(process.env.CHARACTER_MARKET_RPC_TIMEOUT_MS || 10_000)
  req.timeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 10_000

  return new JsonRpcProvider(req)
}

export function getCharacterMarketContract(): Contract {
  const address = getCharacterMarketContractAddress()
  if (!address) throw new Error('Missing CHARACTER_MARKET_CONTRACT_ADDRESS')
  return new Contract(address, CHARACTER_MARKET_ABI, getCharacterMarketProvider())
}

// Contratos antigos (pré-taxa) não têm os getters — nesse caso a taxa é 0.
export async function getCharacterMarketFees(): Promise<{ burnBps: number; treasuryBps: number; totalBps: number }> {
  try {
    const market = getCharacterMarketContract()
    const [burn, treasury] = await Promise.all([market.burnFeeBps(), market.treasuryFeeBps()])
    const burnBps = Number(burn)
    const treasuryBps = Number(treasury)
    return { burnBps, treasuryBps, totalBps: burnBps + treasuryBps }
  } catch {
    return { burnBps: 0, treasuryBps: 0, totalBps: 0 }
  }
}
