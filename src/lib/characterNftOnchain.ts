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

    // Many public RPCs (incl. Polygon) redirect http -> https via 301, which breaks JSON-RPC POST.
    if (u.protocol === 'http:' && !isLocalhost) {
      u.protocol = 'https:'
    }
    return u.toString()
  } catch {
    return candidate
  }
}

export function getCharacterNftChainId(): number {
  const raw = process.env.CHARACTER_NFT_CHAIN_ID || process.env.NFT_CHAIN_ID || '80002'
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) throw new Error('Invalid CHARACTER_NFT_CHAIN_ID')
  return n
}

export function getCharacterNftContractAddress(): string {
  return (process.env.CHARACTER_NFT_CONTRACT_ADDRESS || process.env.NFT_CONTRACT_ADDRESS || '').trim()
}

export function getCharacterNftRpcUrl(): string {
  const raw =
    process.env.CHARACTER_NFT_RPC_URL ||
    process.env.POLYGON_AMOY_RPC_URL ||
    process.env.DOL_RPC_URL ||
    ''

  return normalizeRpcUrl(raw)
}

export function getCharacterNftProvider(): JsonRpcProvider {
  const rpcUrl = getCharacterNftRpcUrl()
  if (!rpcUrl) throw new Error('Missing CHARACTER_NFT_RPC_URL (or POLYGON_AMOY_RPC_URL)')

  const req = new FetchRequest(rpcUrl)
  const timeoutMs = Number(process.env.NFT_RPC_TIMEOUT_MS || 10_000)
  req.timeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 10_000

  return new JsonRpcProvider(req)
}
