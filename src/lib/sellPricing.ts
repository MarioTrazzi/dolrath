// 💰 Preço de VENDA ao ferreiro/alquimista — fonte única das duas rotas de venda.
//
// Balance de lançamento (docs/balance-report-launch.md, P0): a venda de
// CONSUMÍVEL dropado a ~50-60% era ~40% de todo o faucet de gold da conta — e
// passava por fora do teto diário. Consumível (poção pronta) agora vende a 25%;
// ingrediente/material/semente seguem a 50% (são o "gold" da coleta — cortá-los
// mataria a profissão); equipamento segue a 50% (padrão de RPG).
//
// O `stats.sellPrice` gravado nos Items é METADADO (nenhuma rota lê) — o preço
// efetivo é SEMPRE o desta função, sobre o goldPrice atual do catálogo.

export const SELL_FRACTION_GEAR = 0.5
export const SELL_FRACTION_CRAFT_INPUT = 0.5 // ingrediente/material/semente/processado
export const SELL_FRACTION_CONSUMABLE = 0.25 // poções e consumíveis prontos

type SellableItem = {
  type: string
  goldPrice?: number | null
  stats?: unknown
}

/** Fração de venda pelo TIPO do item (consumível pronto vale menos que insumo). */
export function sellFractionFor(item: SellableItem): number {
  if (item.type !== 'CONSUMABLE') return SELL_FRACTION_GEAR
  const kind = (item.stats as { kind?: string } | null)?.kind
  if (kind === 'ingredient' || kind === 'material' || kind === 'seed' || kind === 'processed') {
    return SELL_FRACTION_CRAFT_INPUT
  }
  return SELL_FRACTION_CONSUMABLE
}

/** Preço unitário de venda (piso 0). */
export function sellUnitPrice(item: SellableItem): number {
  return Math.max(0, Math.floor((item.goldPrice ?? 0) * sellFractionFor(item)))
}
