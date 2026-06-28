// ============================================================
// MASMORRA SERVIDOR-AUTORITATIVA — núcleo compartilhado pelas rotas
// /api/dungeon/run/{start,step,combat,abandon}.
//
// Regra de ouro: o SERVIDOR é dono do RNG (d20, loot, stats do monstro), da
// progressão (cursor) e do crédito de gold/xp. O cliente nunca envia o valor
// da recompensa — só a AÇÃO. Isto substitui o faucet antigo, em que
// add-exploration-reward confiava no campo `gold` do corpo (mint arbitrário).
// ============================================================

import type { Prisma } from '@prisma/client'
import { ItemType, ConsumableSubtype } from '@prisma/client'
import {
  DUNGEONS,
  scaleMonster,
  pickMonster,
  rollNodeLoot,
  luckTier,
  type DungeonId,
  type DungeonDef,
  type ScaledMonster,
  type NodeLoot,
  type LootNodeKind,
  type LuckTier,
} from './dungeonAdventures'
import { normalizeCombatClass, type CombatClass } from './combatModel'
import { getCatalogItemByName, getConsumableByName, getIngredientByName, getForgeMaterialByName, itemImagePath } from './itemCatalog'

// Custo de stamina por TIPO de nó (espelha DungeonRun.tsx: MINOR/MAIN/BOSS_STEP_COST).
export const STEP_COST = { minor: 4, main: 8, boss: 6 } as const
// Chance de encontrar monstro num nó MENOR, INVERSAMENTE proporcional ao d20: rolagem
// baixa = perigo (quase sempre monstro), rolagem alta = sorte (raramente monstro, mas se
// a luta acontece o espólio é excelente — a qualidade do loot usa o MESMO roll, então
// tier 'high' = drops 'high'). Salas principais são sempre monstro (guardiãs).
const MINOR_MONSTER_CHANCE_BY_TIER: Record<LuckTier, number> = {
  low: 0.9,  // d20 1–5  → quase certo
  mid: 0.5,  // d20 6–13 → meio a meio
  high: 0.1, // d20 14–20 → raro, mas a recompensa é ótima
}

export type NodeKind = 'start' | 'minor' | 'main' | 'boss'
export interface TrailNode { kind: NodeKind; tier: number }

// Sequência da trilha (espelha buildTrailPoints de DungeonMap.tsx, só kind/tier).
export function buildTrail(dungeon: DungeonDef): TrailNode[] {
  const seq: TrailNode[] = [{ kind: 'start', tier: 0 }]
  for (let t = 1; t <= dungeon.rooms; t++) {
    for (let m = 0; m < dungeon.minorNodes; m++) seq.push({ kind: 'minor', tier: t })
    seq.push({ kind: 'main', tier: t })
  }
  seq.push({ kind: 'boss', tier: dungeon.rooms })
  return seq
}

export function getDungeon(id: string): DungeonDef | null {
  return (DUNGEONS as Record<string, DungeonDef>)[id] ?? null
}

const combatClassOf = (cls: string): CombatClass => normalizeCombatClass(cls) ?? 'warrior'

// Estado de combate pendente, persistido em DungeonRun.pending até o desfecho.
export interface RunPending {
  nodeIdx: number
  kind: LootNodeKind // 'minor' | 'main' | 'boss'
  lootRoll: number   // d20 que define a qualidade do espólio pós-combate
  monster: ScaledMonster
}

export interface CharacterForRun {
  id: string
  level: number
  race: string
  class: string
}

// Resolve o PRÓXIMO nó (não-boss): rola o d20 no SERVIDOR e decide monstro vs. achado.
export function resolveExploreNode(
  dungeon: DungeonDef,
  character: CharacterForRun,
  node: TrailNode,
  nodeIdx: number,
):
  | { type: 'monster'; roll: number; pending: RunPending }
  | { type: 'find'; roll: number; loot: NodeLoot } {
  const roll = 1 + Math.floor(Math.random() * 20)
  const klass = combatClassOf(character.class)
  const isMain = node.kind === 'main'
  const scaling = { tier: node.tier, isMain, isBoss: false }

  const monsterEncounter = isMain || Math.random() < MINOR_MONSTER_CHANCE_BY_TIER[luckTier(roll)]
  if (monsterEncounter) {
    const monster = scaleMonster(pickMonster(dungeon), dungeon, character.level, scaling, klass)
    return { type: 'monster', roll, pending: { nodeIdx, kind: isMain ? 'main' : 'minor', lootRoll: roll, monster } }
  }

  const loot = rollNodeLoot(dungeon, roll, isMain ? 'main' : 'minor', character.level, character.race, character.class)
  return { type: 'find', roll, loot }
}

// Rola o BOSS (âncora no clearLevel, normalizado por classe). Espólio = sorte máxima.
export function resolveBossNode(
  dungeon: DungeonDef,
  character: CharacterForRun,
  nodeIdx: number,
): RunPending {
  const klass = combatClassOf(character.class)
  const monster = scaleMonster(dungeon.boss, dungeon, character.level, { tier: dungeon.rooms, isMain: true, isBoss: true }, klass)
  return { nodeIdx, kind: 'boss', lootRoll: 20, monster }
}

// Espólio pós-combate (mesma regra do cliente: boss = sorte máxima e mais drops).
export function rollCombatLoot(dungeon: DungeonDef, character: CharacterForRun, pending: RunPending): NodeLoot {
  const roll = pending.kind === 'boss' ? 20 : pending.lootRoll
  return rollNodeLoot(dungeon, roll, pending.kind, character.level, character.race, character.class)
}

// ============================================================
// TETO DIÁRIO DE EMISSÃO (faucet cap). Mesmo com o combate confiando no
// desfecho win/lose do cliente, o GOLD que a masmorra pode mintar por DIA e por
// USUÁRIO é limitado — isto neutraliza o resíduo (auto-win, multi-char) no que
// importa: a emissão do token. Itens/XP não entram no teto (não são o token).
// Ajustável via env DUNGEON_DAILY_GOLD_CAP. Some o goldEarned de TODAS as runs
// do usuário criadas no dia (UTC) e clampa cada crédito ao que ainda resta.
// ============================================================
export function dungeonDailyGoldCap(): number {
  const raw = process.env.DUNGEON_DAILY_GOLD_CAP
  const n = raw ? Number(raw) : 20000
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 20000
}

function startOfUtcDay(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

async function dungeonGoldCreditedToday(tx: Prisma.TransactionClient, userId: string): Promise<number> {
  const agg = await tx.dungeonRun.aggregate({
    _sum: { goldEarned: true },
    where: { userId, createdAt: { gte: startOfUtcDay() } },
  })
  return agg._sum.goldEarned ?? 0
}

// Credita ouro na CARTEIRA DO PERSONAGEM (Character.gold — "dinheiro na mão"),
// respeitando o teto diário POR USUÁRIO. Devolve quanto foi realmente creditado
// (pode ser menos, ou 0 se o teto estourou). O personagem leva o gold pra loja;
// para dar claim, deposita no banco (User.goldBalance). [[bank model — Opção B]]
async function creditCappedGoldTx(
  tx: Prisma.TransactionClient,
  userId: string,
  characterId: string,
  amount: number,
): Promise<number> {
  const want = Math.max(0, Math.floor(amount))
  if (want <= 0) return 0
  const creditedToday = await dungeonGoldCreditedToday(tx, userId)
  const remaining = Math.max(0, dungeonDailyGoldCap() - creditedToday)
  const give = Math.min(want, remaining)
  if (give > 0) {
    await tx.character.update({ where: { id: characterId }, data: { gold: { increment: give } } })
  }
  return give
}

function rarityValue(rarity: string): number {
  switch (rarity) {
    case 'COMMON': return 5
    case 'UNCOMMON': return 15
    case 'RARE': return 50
    case 'EPIC': return 150
    case 'LEGENDARY': return 500
    default: return 5
  }
}

// Resolve/cria o Item do catálogo a partir do nome (mesma lógica de
// add-exploration-reward) e o adiciona ao inventário do personagem.
async function addDropToInventoryTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  drop: { name: string; rarity?: string; enhancement?: number },
) {
  const itemName = drop.name
  let existingItem = await tx.item.findFirst({ where: { name: itemName } })

  if (!existingItem) {
    const catalogItem = getCatalogItemByName(itemName)
    const consumable = catalogItem ? undefined : getConsumableByName(itemName)
    const ingredient = catalogItem || consumable ? undefined : getIngredientByName(itemName)
    const material = catalogItem || consumable || ingredient ? undefined : getForgeMaterialByName(itemName)
    if (catalogItem) {
      existingItem = await tx.item.create({
        data: {
          name: catalogItem.name,
          description: catalogItem.description,
          type: catalogItem.type as ItemType,
          level: catalogItem.level,
          goldPrice: catalogItem.goldPrice,
          stats: {
            ...catalogItem.stats,
            rarity: catalogItem.rarity,
            raceRestriction: catalogItem.raceRestriction ?? null,
            dungeons: catalogItem.dungeons,
            sellPrice: Math.floor(catalogItem.goldPrice * 0.6),
          },
        },
      })
    } else if (consumable) {
      existingItem = await tx.item.create({
        data: {
          name: consumable.name,
          description: consumable.description,
          type: 'CONSUMABLE',
          subtype: consumable.subtype as ConsumableSubtype,
          level: consumable.level,
          goldPrice: consumable.goldPrice,
          stats: { ...consumable.stats, rarity: consumable.rarity, sellPrice: Math.floor(consumable.goldPrice * 0.6) },
        },
      })
    } else if (ingredient) {
      existingItem = await tx.item.create({
        data: {
          name: ingredient.name,
          description: ingredient.description,
          type: 'CONSUMABLE',
          image: itemImagePath(ingredient.name),
          level: 1,
          goldPrice: ingredient.goldValue,
          stats: {
            kind: 'ingredient',
            rarity: ingredient.rarity,
            emoji: ingredient.emoji,
            sellPrice: Math.floor(ingredient.goldValue * 0.6),
          },
        },
      })
    } else if (material) {
      existingItem = await tx.item.create({
        data: {
          name: material.name,
          description: material.description,
          type: 'CONSUMABLE',
          image: itemImagePath(material.name),
          level: 1,
          goldPrice: material.goldValue,
          stats: {
            kind: 'material',
            rarity: material.rarity,
            emoji: material.emoji,
            sellPrice: Math.floor(material.goldValue * 0.6),
          },
        },
      })
    } else {
      const rarity = drop.rarity || 'COMMON'
      existingItem = await tx.item.create({
        data: {
          name: itemName,
          description: 'Item encontrado durante exploração',
          type: 'CONSUMABLE',
          level: 1,
          goldPrice: rarityValue(rarity),
          stats: { rarity, value: rarityValue(rarity), sellPrice: Math.floor(rarityValue(rarity) * 0.6) },
        },
      })
    }
  }

  // Equipamento NÃO agrupa (cada peça é um slot); consumível empilha em enhancementLevel 0.
  const isConsumable = existingItem.type === 'CONSUMABLE'
  const existingInv = isConsumable
    ? await tx.characterInventory.findFirst({ where: { characterId, itemId: existingItem.id, enhancementLevel: 0 } })
    : null

  if (existingInv) {
    await tx.characterInventory.update({ where: { id: existingInv.id }, data: { quantity: { increment: 1 } } })
  } else {
    const enhancementLevel = isConsumable ? 0 : Math.max(0, Math.floor(Number(drop.enhancement) || 0))
    await tx.characterInventory.create({
      data: { characterId, itemId: existingItem.id, quantity: 1, enhancementLevel },
    })
  }
}

// Credita o espólio de um nó: ouro no User.goldBalance (pote off-chain/claimável)
// + cada drop no inventário do personagem. Tudo dentro da transação da rota.
export async function applyLootTx(
  tx: Prisma.TransactionClient,
  userId: string,
  characterId: string,
  loot: NodeLoot,
): Promise<number> {
  // Ouro vai pra carteira do personagem (com teto diário); drops (itens) sempre entram.
  const credited = await creditCappedGoldTx(tx, userId, characterId, loot.gold)
  for (const d of loot.drops) {
    await addDropToInventoryTx(tx, characterId, { name: d.name, rarity: d.rarity, enhancement: d.enhancement })
  }
  return credited
}

// Credita ouro avulso (recompensa de abate do monstro) na carteira do personagem.
export async function creditGoldTx(
  tx: Prisma.TransactionClient,
  userId: string,
  characterId: string,
  gold: number,
): Promise<number> {
  return creditCappedGoldTx(tx, userId, characterId, gold)
}

// Serializa o monstro para o cliente animar (mesma forma do ScaledMonster).
export function publicMonster(m: ScaledMonster): ScaledMonster {
  return m
}

export type { ScaledMonster, NodeLoot, DungeonId }
