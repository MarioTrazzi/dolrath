import { Contract, Interface, formatUnits, parseUnits } from 'ethers'
import { getGoldContractAddress, getGoldProvider } from './goldOnchain'

const ERC20_PAYMENT_ABI = [
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'function decimals() view returns (uint8)',
] as const

const transferIface = new Interface(ERC20_PAYMENT_ABI)

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function verifyGoldTransferTx(params: {
  txHash: string
  expectedFrom: string
  expectedTo: string
  minAmountHuman: string
  tokenAddress?: string
}) {
  const tokenAddress = (params.tokenAddress || getGoldContractAddress()).trim()
  if (!tokenAddress) throw new Error('Missing GOLD_CONTRACT_ADDRESS')

  const provider = getGoldProvider()

  const retriesRaw = Number(process.env.GOLD_PAYMENT_RECEIPT_RETRIES ?? 6)
  const delayMsRaw = Number(process.env.GOLD_PAYMENT_RECEIPT_DELAY_MS ?? 1000)
  const retries = Number.isFinite(retriesRaw) && retriesRaw >= 0 ? Math.floor(retriesRaw) : 6
  const delayMs = Number.isFinite(delayMsRaw) && delayMsRaw > 0 ? Math.floor(delayMsRaw) : 1000

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

  const tokenAddressLc = tokenAddress.toLowerCase()
  const expectedFromLc = params.expectedFrom.toLowerCase()
  const expectedToLc = params.expectedTo.toLowerCase()

  const contract = new Contract(tokenAddress, ERC20_PAYMENT_ABI, provider)
  const decimals = Number(await contract.decimals())

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

  const minHuman = params.minAmountHuman.trim()
  if (!minHuman) throw new Error('Missing minAmountHuman')

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
