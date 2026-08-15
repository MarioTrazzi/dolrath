import { Contract, FetchRequest, JsonRpcProvider } from 'ethers'
import { getCharacterNftContractAddress } from './characterNftOnchain'

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

/**
 * Moeda do mercado de personagens.
 *
 * Separada de `DOL_TOKEN_ADDRESS` de propósito: aquela var guarda o token de
 * PAGAMENTO da criação de personagem, e no ensaio da Amoy ela aponta para o
 * TestUSDC (6 casas, sem `burnFrom`). O mercado precisa do DOL de verdade — o
 * `buy()` queima 2,5% via `burnFrom`, então um token não-queimável faz TODA
 * compra reverter. Sem esta separação, o deploy criaria um mercado imutável
 * cobrando dólar de teste (`dol` é immutable no contrato: só redeploy conserta).
 *
 * Fallback em DOL_TOKEN_ADDRESS para não quebrar ambiente onde os dois são o
 * mesmo token (o caso normal fora do ensaio).
 */
export function getCharacterMarketPayTokenAddress(): string {
  return (
    process.env.CHARACTER_MARKET_PAY_TOKEN_ADDRESS ||
    process.env.DOL_TOKEN_ADDRESS ||
    ''
  ).trim()
}

const PAY_TOKEN_ABI = [
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function balanceOf(address) view returns (uint256)',
] as const

export function getCharacterMarketPayTokenContract(): Contract {
  const address = getCharacterMarketPayTokenAddress()
  if (!address) throw new Error('Missing CHARACTER_MARKET_PAY_TOKEN_ADDRESS (ou DOL_TOKEN_ADDRESS)')
  return new Contract(address, PAY_TOKEN_ABI, getCharacterMarketProvider())
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

const CHARACTER_NFT_OWNER_ABI = ['function ownerOf(uint256 tokenId) view returns (address)'] as const

/**
 * Dono ATUAL da NFT do personagem, lido da chain.
 *
 * Esta é a autoridade da posse — o evento `ListingPurchased` só prova que uma
 * compra ACONTECEU um dia, não que quem está pedindo ainda é o dono. Sem este
 * cheque, reenviar uma tx de compra antiga reconquistava o personagem de graça.
 * Usa o provider do mercado (mesma chain do escrow).
 */
export async function getCharacterNftOwner(tokenId: bigint): Promise<string> {
  const nftAddress = getCharacterNftContractAddress()
  if (!nftAddress) throw new Error('Missing CHARACTER_NFT_CONTRACT_ADDRESS')

  const nft = new Contract(nftAddress, CHARACTER_NFT_OWNER_ABI, getCharacterMarketProvider())
  return String(await nft.ownerOf(tokenId))
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
