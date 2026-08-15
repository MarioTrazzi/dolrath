/**
 * Converte BigInt em string recursivamente para que o objeto possa ir no
 * NextResponse.json.
 *
 * ⚠️ Por que existe: `Character` tem colunas BigInt (nftTokenId,
 * marketListingId). Devolver a linha crua faz o JSON.stringify do
 * NextResponse EXPLODIR ("Do not know how to serialize a BigInt") — e, quando
 * isso acontece DEPOIS de uma transação já commitada, o jogador vê um erro
 * enquanto o efeito já foi aplicado no banco. Toda rota que devolve linhas de
 * Character (ou qualquer modelo com BigInt) precisa passar por aqui.
 */
export function serializeBigInt<T>(value: T): T {
  if (typeof value === 'bigint') return value.toString() as unknown as T
  if (Array.isArray(value)) return value.map((v) => serializeBigInt(v)) as unknown as T
  if (value instanceof Date) return value
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = serializeBigInt(v)
    }
    return out as unknown as T
  }
  return value
}
