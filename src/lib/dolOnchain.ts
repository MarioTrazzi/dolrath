import { Contract, FetchRequest, JsonRpcProvider, formatUnits } from 'ethers'

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
] as const

function normalizeRpcUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return ''

  // If the user already provided a scheme, keep it.
  // Otherwise default to https:// (common case on Vercel env vars).
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

export function getDolRpcUrl(): string {
  const raw =
    process.env.DOL_RPC_URL ||
    process.env.POLYGON_AMOY_RPC_URL ||
    process.env.POLYGON_MAINNET_RPC_URL ||
    ''

  return normalizeRpcUrl(raw)
}

export function getDolTokenAddress(): string {
  return (process.env.DOL_TOKEN_ADDRESS || '').trim()
}

export function getDolProvider() {
  const rpcUrl = getDolRpcUrl()
  if (!rpcUrl) throw new Error('Missing DOL_RPC_URL (or POLYGON_AMOY_RPC_URL)')

  // Prevent hanging requests (common with public RPCs).
  const req = new FetchRequest(rpcUrl)
  const timeoutMs = Number(process.env.DOL_RPC_TIMEOUT_MS || 10_000)
  req.timeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 10_000

  return new JsonRpcProvider(req)
}

export function getDolContract() {
  const tokenAddress = getDolTokenAddress()
  if (!tokenAddress) throw new Error('Missing DOL_TOKEN_ADDRESS')
  return new Contract(tokenAddress, ERC20_ABI, getDolProvider())
}

export async function fetchDolBalance(params: { walletAddress: string }) {
  const contract = getDolContract()
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
