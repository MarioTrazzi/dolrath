// 🔧 Plano de reparo do ferreiro — fonte ÚNICA da conta, usada pela rota
// /api/character/[id]/repair-item e pela Bancada de Reparo (RepairBench).
// Servidor e cliente importam a MESMA função pura: o preço que o botão mostra é
// o preço que o servidor cobra (o servidor recalcula, o cliente nunca envia valor).
//
// Regra do balcão: o que estiver na bolsa é consumido primeiro; o que faltar o
// ferreiro VENDE na hora (cópia lisa da peça / Pó de Joia) e funde ali mesmo —
// a unidade comprada nunca vira linha de inventário, então reparar não exige
// slot livre. [[dolrath-onchain-gold-not-items]] continua valendo: o gasto é em
// GOLD off-chain (Character.gold); item nenhum é comprado como NFT.

import { REPAIR_PER_DUPLICATE, accessoryRepairGoldCost } from './enhancementSystem'

// De onde sai a durabilidade da peça:
//  COPY  — arma/armadura/ferramenta comum ou incomum: cópia nível 0 do próprio item
//  DUST  — acessório (anel/colar/cinto): Pó de Joia + taxa de gold
//  SHARD — peça rara/épica/lendária: Estilhaço de Memória (só de chefe)
export type RepairSource = 'COPY' | 'DUST' | 'SHARD'

// Estilhaço de Memória é gate de chefe de propósito — o ferreiro não vende.
// Cópia e Pó de Joia são mundanos: ele forja/mói na hora por gold.
export function isPurchasableSource(source: RepairSource): boolean {
  return source !== 'SHARD'
}

export interface RepairPlanInput {
  /** maxDurability - durability (quanto falta encher). */
  missing: number
  /** Unidades da fonte disponíveis na bolsa (cópias, Pó de Joia ou estilhaços). */
  unitsOwned: number
  /** 'single' = uma unidade (+25); 'full' = encher a barra. */
  mode: 'single' | 'full'
  source: RepairSource
  /** Preço de UMA unidade da fonte: goldPrice da peça (COPY) ou do Pó de Joia (DUST). */
  unitPrice: number
  /** goldPrice da peça reparada — base da taxa de gold do acessório. */
  itemGoldPrice?: number | null
  /** Ligar a compra do que falta. Desligado = comportamento antigo (só bolsa). */
  allowBuy: boolean
}

export interface RepairPlan {
  /** Unidades consumidas da bolsa (inteiras — sobra de durabilidade se perde, como sempre). */
  unitsFromStock: number
  /** Unidades compradas no balcão (inteiras em durabilidade, rateadas no preço). */
  unitsBought: number
  /** Total de unidades usadas. */
  unitsUsed: number
  /** Gold das unidades compradas (rateado: paga-se só o pedaço fundido). */
  buyCost: number
  /** Taxa de gold do acessório (Pó de Joia sempre cobra, comprado ou não). */
  accessoryGold: number
  /** buyCost + accessoryGold. */
  totalGold: number
  /** Durabilidade recuperada (nunca passa de `missing`). */
  durabilityGained: number
  /** A fonte é comprável (false só para SHARD). */
  canBuy: boolean
  /** Faltou material e não dá pra comprar → o reparo não acontece. */
  blocked: boolean
}

/**
 * Monta o plano de reparo: quanto sai da bolsa, quanto é comprado, quanto custa
 * em gold e quanta durabilidade volta.
 *
 * O preço da compra é RATEADO pela durabilidade realmente usada — faltando 30 de
 * durabilidade o jogador paga 30/25 = 1,2 cópia, não 2. As unidades da bolsa
 * continuam inteiras (o excedente da última se perde, comportamento de sempre).
 */
export function repairPlan(input: RepairPlanInput): RepairPlan {
  const missing = Math.max(0, Math.floor(input.missing))
  const unitsOwned = Math.max(0, Math.floor(input.unitsOwned))
  const canBuy = isPurchasableSource(input.source)
  const unitPrice = Math.max(0, Math.floor(input.unitPrice || 0))

  const unitsNeededForFull = Math.ceil(missing / REPAIR_PER_DUPLICATE)
  const unitsNeeded = input.mode === 'full' ? unitsNeededForFull : Math.min(1, unitsNeededForFull)

  const unitsFromStock = Math.min(unitsNeeded, unitsOwned)
  const unitsBought = input.allowBuy && canBuy ? unitsNeeded - unitsFromStock : 0
  const unitsUsed = unitsFromStock + unitsBought

  // Durabilidade coberta por cada origem (a bolsa entra primeiro).
  const coveredTotal = Math.min(missing, unitsUsed * REPAIR_PER_DUPLICATE)
  const coveredByStock = Math.min(missing, unitsFromStock * REPAIR_PER_DUPLICATE)
  const coveredByBought = Math.max(0, coveredTotal - coveredByStock)

  const buyCost = Math.ceil((unitPrice * coveredByBought) / REPAIR_PER_DUPLICATE)
  const accessoryGold =
    input.source === 'DUST' ? accessoryRepairGoldCost(input.itemGoldPrice, unitsUsed) : 0

  return {
    unitsFromStock,
    unitsBought,
    unitsUsed,
    buyCost,
    accessoryGold,
    totalGold: buyCost + accessoryGold,
    durabilityGained: coveredTotal,
    canBuy,
    blocked: unitsUsed < 1,
  }
}
