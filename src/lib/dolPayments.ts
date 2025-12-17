import { Interface, Contract, formatUnits, parseUnits } from 'ethers'
import { getDolProvider, getDolTokenAddress } from './dolOnchain'

const ERC20_PAYMENT_ABI = [
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'function decimals() view returns (uint8)',
] as const

const transferIface = new Interface(ERC20_PAYMENT_ABI)

export async function verifyDolTransferTx(params: {
  txHash: string
  expectedFrom: string
  expectedTo: string
  minAmountHuman: string
  tokenAddress?: string
}) {
  const tokenAddress = (params.tokenAddress || getDolTokenAddress()).trim()
  if (!tokenAddress) throw new Error('Missing DOL_TOKEN_ADDRESS')

  const provider = getDolProvider()
  const receipt = await provider.getTransactionReceipt(params.txHash)

  if (!receipt) {
    throw new Error('Transação ainda não encontrada. Aguarde a confirmação e tente novamente.')
  }

  if (receipt.status !== 1) {
    throw new Error('Transação falhou (status != 1)')
  }

  const tokenAddressLc = tokenAddress.toLowerCase()
  const expectedFromLc = params.expectedFrom.toLowerCase()
  const expectedToLc = params.expectedTo.toLowerCase()

  // Basic sanity: ERC-20 transfer tx typically targets the token contract.
  // We won't require it strictly (meta-tx / router patterns exist), but it's a good hint.

  const contract = new Contract(tokenAddress, ERC20_PAYMENT_ABI, provider)
  const decimals = Number(await contract.decimals())

  // Parse Transfer logs emitted by the token contract.
  const matching = receipt.logs
    .filter((log) => log.address.toLowerCase() === tokenAddressLc)
    .map((log) => {
      try {
        return transferIface.parseLog(log)
      } catch {
        return null
      }
    })
    .filter(Boolean)
    .find((parsed: any) => {
      const from = String(parsed.args.from).toLowerCase()
      const to = String(parsed.args.to).toLowerCase()
      return from === expectedFromLc && to === expectedToLc
    }) as any | undefined

  if (!matching) {
    throw new Error('Nenhum evento Transfer compatível encontrado para essa transação')
  }

  const value = matching.args.value as bigint

  // Compare against minimum in human units.
  const minHuman = params.minAmountHuman.trim()
  if (!minHuman) throw new Error('Missing minAmountHuman')

  // Avoid floating point: compare in base units by formatting and re-parsing is risky.
  // We'll compare by converting minHuman to base units using the same decimals.
  const minBase = parseUnits(minHuman, decimals)

  if (value < minBase) {
    throw new Error(
      `Pagamento insuficiente: recebido ${formatUnits(value, decimals)}, esperado no mínimo ${minHuman}`
    )
  }

  return {
    decimals,
    raw: value.toString(),
    formatted: formatUnits(value, decimals),
  }
}
