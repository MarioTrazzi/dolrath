import { Contract, FetchRequest, JsonRpcProvider, formatUnits } from 'ethers'

const GOLD_ABI = [
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
  'function usedNonce(address,uint256) view returns (bool)',
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

export function getGoldChainId(): number {
  const raw =
    process.env.GOLD_CHAIN_ID ||
    process.env.NEXT_PUBLIC_GOLD_CHAIN_ID ||
    process.env.CHARACTER_NFT_CHAIN_ID ||
    '80002'
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) throw new Error('Invalid GOLD_CHAIN_ID')
  return n
}

export function getGoldContractAddress(): string {
  return (process.env.GOLD_CONTRACT_ADDRESS || process.env.NEXT_PUBLIC_GOLD_CONTRACT_ADDRESS || '').trim()
}

export function getGoldRpcUrl(): string {
  const raw =
    process.env.GOLD_RPC_URL ||
    process.env.NEXT_PUBLIC_GOLD_RPC_URL ||
    process.env.POLYGON_AMOY_RPC_URL ||
    process.env.POLYGON_MAINNET_RPC_URL ||
    ''
  return normalizeRpcUrl(raw)
}

export function getGoldProvider(): JsonRpcProvider {
  const rpcUrl = getGoldRpcUrl()
  if (!rpcUrl) throw new Error('Missing GOLD_RPC_URL (or POLYGON_AMOY_RPC_URL)')

  const req = new FetchRequest(rpcUrl)
  const timeoutMs = Number(process.env.GOLD_RPC_TIMEOUT_MS || 10_000)
  req.timeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 10_000

  return new JsonRpcProvider(req)
}

export function getGoldContract(): Contract {
  const address = getGoldContractAddress()
  if (!address) throw new Error('Missing GOLD_CONTRACT_ADDRESS (or NEXT_PUBLIC_GOLD_CONTRACT_ADDRESS)')
  return new Contract(address, GOLD_ABI, getGoldProvider())
}

export async function fetchGoldBalance(params: { walletAddress: string }) {
  const contract = getGoldContract()
  const [raw, decimals, symbol] = await Promise.all([
    contract.balanceOf(params.walletAddress),
    contract.decimals(),
    contract.symbol(),
  ])

  return {
    raw: raw.toString(),
    decimals: Number(decimals),
    symbol: String(symbol),
    formatted: formatUnits(raw, decimals),
  }
}
