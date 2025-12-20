import { FetchRequest, JsonRpcProvider } from 'ethers'

function normalizeRpcUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return ''

  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)
  const candidate = hasScheme ? trimmed : `https://${trimmed}`

  try {
    const u = new URL(candidate)
    const host = u.hostname.toLowerCase()
    const isLocalhost = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0'

    if (u.protocol === 'http:' && !isLocalhost) {
      u.protocol = 'https:'
    }
    return u.toString()
  } catch {
    return candidate
  }
}

export function getItemNftChainId(): number {
  const raw = process.env.ITEM_NFT_CHAIN_ID || '80002'
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) throw new Error('Invalid ITEM_NFT_CHAIN_ID')
  return n
}

export function getItemNftContractAddress(): string {
  return (process.env.ITEM_NFT_CONTRACT_ADDRESS || '').trim()
}

export function getItemNftRpcUrl(): string {
  const raw = process.env.ITEM_NFT_RPC_URL || process.env.POLYGON_AMOY_RPC_URL || process.env.GOLD_RPC_URL || ''
  return normalizeRpcUrl(raw)
}

export function getItemNftProvider(): JsonRpcProvider {
  const rpcUrl = getItemNftRpcUrl()
  if (!rpcUrl) throw new Error('Missing ITEM_NFT_RPC_URL (or POLYGON_AMOY_RPC_URL)')

  const req = new FetchRequest(rpcUrl)
  const timeoutMs = Number(process.env.ITEM_NFT_RPC_TIMEOUT_MS || 10_000)
  req.timeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 10_000

  return new JsonRpcProvider(req)
}
