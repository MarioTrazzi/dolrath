// Rate-limit em memória (janela deslizante) para rotas sensíveis — sobretudo as
// que ASSINAM intents EIP-712 com a chave do servidor (claim de GOLD, mints).
// Por instância: no Fluid Compute da Vercel as instâncias são reutilizadas, então
// isso segura abuso real; não é contagem global entre instâncias, e não precisa
// ser — o objetivo é impedir um cliente de extrair assinaturas em volume.

const buckets = new Map<string, number[]>()
let lastSweep = Date.now()

export type RateLimitOptions = {
  /** Janela em ms. */
  windowMs: number
  /** Máximo de chamadas permitidas dentro da janela. */
  max: number
}

/** true = permitido; false = estourou o limite (responda 429). */
export function rateLimitAllow(key: string, opts: RateLimitOptions): boolean {
  const now = Date.now()

  // Varredura preguiçosa p/ não crescer sem limite.
  if (now - lastSweep > 60_000) {
    lastSweep = now
    const stale: string[] = []
    buckets.forEach((hits, k) => {
      if (hits.length === 0 || now - hits[hits.length - 1] > opts.windowMs) stale.push(k)
    })
    stale.forEach((k) => buckets.delete(k))
  }

  const hits = (buckets.get(key) ?? []).filter((t) => now - t < opts.windowMs)
  if (hits.length >= opts.max) {
    buckets.set(key, hits)
    return false
  }
  hits.push(now)
  buckets.set(key, hits)
  return true
}

export function rateLimited429(retryAfterSeconds = 60) {
  return new Response(
    JSON.stringify({ error: 'Muitas solicitações — aguarde um instante e tente de novo.' }),
    { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': String(retryAfterSeconds) } },
  )
}
