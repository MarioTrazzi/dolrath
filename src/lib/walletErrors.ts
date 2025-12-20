export type ContractInterfaceLike = {
  parseError(data: string): { name?: string }
}

function isHexData(value: unknown): value is string {
  return typeof value === 'string' && /^0x[0-9a-fA-F]*$/.test(value)
}

function pickFirstString(values: unknown[]): string {
  for (const v of values) {
    if (typeof v === 'string') {
      const s = v.trim()
      if (s) return s
    }
  }
  return ''
}

export function extractEthersErrorData(err: any): string | null {
  const candidates = [
    err?.data,
    err?.info?.error?.data,
    err?.error?.data,
    err?.cause?.data,
    err?.cause?.info?.error?.data,
  ]

  for (const c of candidates) {
    if (isHexData(c)) return c
    if (c && typeof c === 'object') {
      // Some providers wrap it as { data: '0x...' }
      const maybe = (c as any)?.data
      if (isHexData(maybe)) return maybe
    }
  }

  return null
}

const DEFAULT_CUSTOM_ERROR_MESSAGES: Record<string, string> = {
  Expired: 'Assinatura expirada. Recarregue a página e tente novamente.',
  OnlyRecipient: 'Carteira conectada não confere com o destinatário.',
  AlreadyMinted: 'Essa ação já foi executada (assinatura/id já utilizado).',
  InvalidSignature: 'Assinatura inválida. Tente novamente.',
}

export function decodeContractCustomErrorMessage(params: {
  contractInterface?: ContractInterfaceLike | null
  err: unknown
  messagesByName?: Record<string, string>
}): string | null {
  const iface = params.contractInterface
  if (!iface) return null

  const data = extractEthersErrorData(params.err as any)
  if (!data) return null

  try {
    const parsed = iface.parseError(data)
    const name = typeof parsed?.name === 'string' ? parsed.name : ''
    if (!name) return null

    const custom = params.messagesByName?.[name]
    if (custom) return custom

    return DEFAULT_CUSTOM_ERROR_MESSAGES[name] || null
  } catch {
    return null
  }
}

export function getWalletTxErrorMessage(err: unknown, fallback = 'Erro ao enviar transação'): string {
  const e: any = err

  // Standard MetaMask / EIP-1193 rejection
  if (e?.code === 4001) return 'Transação cancelada na carteira'

  const msg = pickFirstString([
    e?.shortMessage,
    e?.reason,
    e?.message,
    e?.info?.error?.message,
    e?.info?.error?.data?.message,
    e?.data?.message,
    e?.error?.message,
    e?.error?.data?.message,
    e?.cause?.message,
  ])

  if (!msg) return fallback

  const lower = msg.toLowerCase()

  if (lower.includes('user rejected') || lower.includes('rejected')) return 'Transação cancelada na carteira'
  if (lower.includes('insufficient funds')) return 'Saldo insuficiente de MATIC para gas'
  if (lower.includes('nonce too low')) return 'Nonce muito baixo. Tente novamente em instantes.'
  if (lower.includes('replacement fee too low')) return 'Taxa baixa para substituir transação pendente. Aumente o gas ou aguarde.'

  // Providers often wrap the real reason inside an "Internal JSON-RPC error" umbrella.
  if (lower.includes('internal json-rpc error')) {
    const nested = pickFirstString([
      e?.info?.error?.message,
      e?.info?.error?.data?.message,
      e?.error?.message,
      e?.error?.data?.message,
      e?.data?.message,
    ])

    if (nested && nested !== msg) return nested
  }

  return msg
}
