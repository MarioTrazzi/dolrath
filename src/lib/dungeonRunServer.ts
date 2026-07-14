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
  scaleMonsterGroup,
  earlyPoolOf,
  rollNodeLoot,
  rollKillLoot,
  luckTier,
  type DungeonId,
  type DungeonDef,
  type ScaledMonster,
  type NodeLoot,
  type LootDrop,
  type LootNodeKind,
  type LuckTier,
} from './dungeonAdventures'
import { normalizeCombatClass, type CombatClass } from './combatModel'
import { SELL_FRACTION_GEAR, SELL_FRACTION_CRAFT_INPUT, SELL_FRACTION_CONSUMABLE } from './sellPricing'
import { getCatalogItemByName, getConsumableByName, getIngredientByName, getForgeMaterialByName, getSeedByName, itemImagePath } from './itemCatalog'
import { freeInventorySlots } from './inventoryMutations'
import { STONE_META } from './enhancementSystem'

// Custo de stamina por TIPO de nó (espelha DungeonRun.tsx: MINOR/MAIN/BOSS_STEP_COST).
export const STEP_COST = { minor: 4, main: 8, boss: 6 } as const

// 🔒 LOCK VIVO DA RUN (anti-duplicata entre abas). Enquanto a aba que está jogando
// manda heartbeat (a cada ~25s; cada /step e /combat também toca updatedAt), a run
// conta como VIVA e o MESMO herói não pode abrir outra run em outra aba/janela —
// evita farmar o mesmo personagem em paralelo. Se a aba cair (fechar/crashar), o
// heartbeat para e o lock expira sozinho após esta janela, liberando o herói.
export const RUN_LIVE_WINDOW_MS = 60_000
export function isRunLive(run: { status: string; updatedAt: Date }): boolean {
  return run.status === 'active' && Date.now() - new Date(run.updatedAt).getTime() < RUN_LIVE_WINDOW_MS
}
// Chance de encontrar monstro num nó MENOR, INVERSAMENTE proporcional ao d20: rolagem
// baixa = perigo (quase sempre monstro), rolagem alta = sorte (raramente monstro, mas se
// a luta acontece o espólio é excelente — a qualidade do loot usa o MESMO roll, então
// tier 'high' = drops 'high'). Salas principais são sempre monstro (guardiãs).
const MINOR_MONSTER_CHANCE_BY_TIER: Record<LuckTier, number> = {
  low: 0.9,  // d20 1–5  → quase certo
  mid: 0.5,  // d20 6–13 → meio a meio
  high: 0.1, // d20 14–20 → raro, mas a recompensa é ótima
}

// ⛲ Chance de uma fonte revitalizadora (HP/MP cheios) substituir o achado num nó
// MENOR de sorte ALTA (d20 14+). Exclui o espólio daquele nó.
const FOUNTAIN_CHANCE = 0.2

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
// O encontro é um PACOTE de 1..3 monstros (só nó menor traz >1). O nó só "limpa"
// (cursor avança + espólio) quando TODOS morrem; cada abate credita XP por si.
export interface RunPending {
  nodeIdx: number
  kind: LootNodeKind // 'minor' | 'main' | 'boss'
  lootRoll: number   // d20 que define a qualidade do espólio pós-combate
  monsters: ScaledMonster[]
  killedIds?: string[] // ids dos monstros já abatidos (progresso do nó)
  /** @deprecated forma antiga (1 monstro) — lida por pendingMonsters() em runs legadas */
  monster?: ScaledMonster
}

// Normaliza o pendente para a lista de monstros, tolerando o formato legado { monster }.
export function pendingMonsters(p: RunPending): ScaledMonster[] {
  if (Array.isArray(p.monsters) && p.monsters.length > 0) return p.monsters
  return p.monster ? [p.monster] : []
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
  tier: number = 1,
):
  | { type: 'monster'; roll: number; pending: RunPending }
  | { type: 'find'; roll: number; loot: NodeLoot } {
  const roll = 1 + Math.floor(Math.random() * 20)
  const klass = combatClassOf(character.class)
  const isMain = node.kind === 'main'
  const scaling = { tier: node.tier, isMain, isBoss: false }

  // 🔰 1º nó menor da run (nodeIdx 1) é TRAVADO: encontro garantido com um pacote
  // fixo de 3 dos arquétipos mais fracos (earlyPool) — a "luta de calibração" que
  // assegura XP cedo e elimina o tanque solo na porta pro nível 1. O d20 é rolado
  // normalmente e segue sendo o lootRoll (qualidade do espólio, não o encontro).
  const isFirstMinor = nodeIdx === 1 && node.kind === 'minor'
  const monsterEncounter = isMain || isFirstMinor || Math.random() < MINOR_MONSTER_CHANCE_BY_TIER[luckTier(roll)]
  if (monsterEncounter) {
    // Sala principal = guardião SOLO; nó menor pode trazer um pacote de 1..3 (mais
    // fracos). Nós menores da 1ª sala sorteiam com viés pró-fracos (earlyBias).
    const monsters = isFirstMinor
      ? scaleMonsterGroup(dungeon, character.level, scaling, klass, tier, { forcedSize: 3, pool: earlyPoolOf(dungeon) })
      : scaleMonsterGroup(dungeon, character.level, scaling, klass, tier, { earlyBias: !isMain && node.tier === 1 })
    return { type: 'monster', roll, pending: { nodeIdx, kind: isMain ? 'main' : 'minor', lootRoll: roll, monsters, killedIds: [] } }
  }

  // ⛲ Fonte revitalizadora: só em nó MENOR, a partir da 2ª sala em diante (tier > 1)
  // — nos nós menores da 1ª sala o HP/MP ainda está cheio, então a fonte não faz
  // sentido ali. Faixa de SORTE ALTA (d20 14+), com 20% de chance. Se a fonte aparece,
  // NÃO há espólio — ela restaura HP/MP cheios no cliente (recurso da run; o servidor
  // só sinaliza o evento). [[dolrath-dungeon-design-vision]]
  if (!isMain && node.tier > 1 && luckTier(roll) === 'high' && Math.random() < FOUNTAIN_CHANCE) {
    return { type: 'find', roll, loot: { gold: 0, drops: [], fountain: true } }
  }

  const loot = rollNodeLoot(dungeon, roll, isMain ? 'main' : 'minor', character.level, character.race, character.class, tier)
  return { type: 'find', roll, loot }
}

// Rola o BOSS (âncora no clearLevel, normalizado por classe). Espólio = sorte máxima.
export function resolveBossNode(
  dungeon: DungeonDef,
  character: CharacterForRun,
  nodeIdx: number,
  tier: number = 1,
): RunPending {
  const klass = combatClassOf(character.class)
  const monster = scaleMonster(dungeon.boss, dungeon, character.level, { tier: dungeon.rooms, isMain: true, isBoss: true }, klass, tier)
  return { nodeIdx, kind: 'boss', lootRoll: 20, monsters: [monster], killedIds: [] }
}

// Espólio pós-combate (mesma regra do cliente: boss = sorte máxima e mais drops).
export function rollCombatLoot(dungeon: DungeonDef, character: CharacterForRun, pending: RunPending, tier: number = 1): NodeLoot {
  const raw = pending.kind === 'boss' ? 20 : pending.lootRoll
  const roll = Math.max(1, Math.min(20, Math.floor(Number(raw)) || 10))
  return rollNodeLoot(dungeon, roll, pending.kind, character.level, character.race, character.class, tier)
}

export { rollKillLoot }

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

// Emissão de gold do DIA (UTC) por usuário = masmorra + VENDAS ao ferreiro.
// ⚖️ Balance de lançamento (P0): a venda passava por fora do cap e era ~40% do
// faucet da conta — agora as duas fontes dividem o MESMO teto diário.
async function goldEmittedToday(tx: Prisma.TransactionClient, userId: string): Promise<number> {
  const gte = startOfUtcDay()
  const [runs, sales] = await Promise.all([
    tx.dungeonRun.aggregate({ _sum: { goldEarned: true }, where: { userId, createdAt: { gte } } }),
    tx.goldSale.aggregate({ _sum: { amount: true }, where: { userId, createdAt: { gte } } }),
  ])
  return (runs._sum.goldEarned ?? 0) + (sales._sum.amount ?? 0)
}

// Quanto do teto diário AINDA cabe. A rota de combate consulta UMA vez e aloca
// os créditos do nó (abates + espólio) localmente — antes cada crédito refazia
// os dois aggregates do dia.
export async function dailyGoldRemainingTx(tx: Prisma.TransactionClient, userId: string): Promise<number> {
  const creditedToday = await goldEmittedToday(tx, userId)
  return Math.max(0, dungeonDailyGoldCap() - creditedToday)
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
  const creditedToday = await goldEmittedToday(tx, userId)
  const remaining = Math.max(0, dungeonDailyGoldCap() - creditedToday)
  const give = Math.min(want, remaining)
  if (give > 0) {
    await tx.character.update({ where: { id: characterId }, data: { gold: { increment: give } } })
  }
  return give
}

// Credita o gold de uma VENDA ao ferreiro, respeitando o teto diário compartilhado
// com a masmorra, e registra no ledger GoldSale (é o registro que entra na soma do
// dia). `target` decide o destino: carteira do personagem (venda do inventário) ou
// banco da conta (venda do Baú Geral). Devolve quanto foi realmente creditado.
export async function creditCappedSaleGoldTx(
  tx: Prisma.TransactionClient,
  userId: string,
  target: { characterId: string } | { bank: true },
  amount: number,
): Promise<number> {
  const want = Math.max(0, Math.floor(amount))
  if (want <= 0) return 0
  const creditedToday = await goldEmittedToday(tx, userId)
  const remaining = Math.max(0, dungeonDailyGoldCap() - creditedToday)
  const give = Math.min(want, remaining)
  if (give <= 0) return 0
  await tx.goldSale.create({ data: { userId, amount: give } })
  if ('characterId' in target) {
    await tx.character.update({ where: { id: target.characterId }, data: { gold: { increment: give } } })
  } else {
    await tx.user.update({ where: { id: userId }, data: { goldBalance: { increment: give } } })
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
// Exportada: a COLETA (gatheringServer.ts) e a FAZENDA depositam por aqui.
// `qty` só vale para consumível (empilha); equipamento é sempre 1 peça/linha.
export async function addDropToInventoryTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  drop: { name: string; rarity?: string; enhancement?: number; qty?: number },
) {
  const itemName = drop.name
  const qty = Math.max(1, Math.floor(Number(drop.qty) || 1))
  let existingItem = await tx.item.findFirst({ where: { name: itemName } })

  // Cura pedras criadas pelo fallback genérico (sem stats.enhancementStone) —
  // senão caem no inventário mas não funcionam no aprimoramento.
  if (existingItem && existingItem.type === 'CONSUMABLE' && STONE_META[itemName]) {
    const stats = (existingItem.stats as Record<string, any> | null) ?? {}
    const meta = STONE_META[itemName]
    if (!stats.enhancementStone) {
      existingItem = await tx.item.update({
        where: { id: existingItem.id },
        data: {
          description: meta.description,
          level: meta.level,
          goldPrice: meta.goldPrice,
          image: existingItem.image || itemImagePath(itemName),
          stats: {
            ...stats,
            rarity: meta.rarity,
            enhancementStone: meta.code,
            battleUsable: false,
            sellPrice: meta.sellPrice,
            emoji: meta.emoji,
          },
        },
      })
    }
  }

  // Cura registros legados: ingredientes/materiais criados antes do sistema de craft
  // (ou reaproveitados por nome) podem não ter `image`/`stats.kind`. Como o Item é
  // global e reaproveitado por nome, sem isto o card ficava sem imagem e sem o botão
  // de "Usar na Alquimia/Forja". [[dolrath-alchemy-crafting]]
  if (existingItem && existingItem.type === 'CONSUMABLE') {
    const ing = getIngredientByName(itemName)
    const mat = ing ? undefined : getForgeMaterialByName(itemName)
    const meta = ing
      ? { kind: 'ingredient' as const, emoji: ing.emoji, goldValue: ing.goldValue, rarity: ing.rarity }
      : mat
      ? { kind: 'material' as const, emoji: mat.emoji, goldValue: mat.goldValue, rarity: mat.rarity }
      : null
    if (meta) {
      const stats = (existingItem.stats as Record<string, any> | null) ?? {}
      const needsKind = stats.kind !== meta.kind
      const needsImage = !existingItem.image
      if (needsKind || needsImage) {
        existingItem = await tx.item.update({
          where: { id: existingItem.id },
          data: {
            ...(needsImage ? { image: itemImagePath(itemName) } : {}),
            stats: {
              ...stats,
              kind: meta.kind,
              rarity: stats.rarity ?? meta.rarity,
              emoji: stats.emoji ?? meta.emoji,
              sellPrice: stats.sellPrice ?? Math.floor(meta.goldValue * SELL_FRACTION_CRAFT_INPUT),
            },
          },
        })
      }
    }
  }

  if (!existingItem) {
    const catalogItem = getCatalogItemByName(itemName)
    const consumable = catalogItem ? undefined : getConsumableByName(itemName)
    const ingredient = catalogItem || consumable ? undefined : getIngredientByName(itemName)
    const material = catalogItem || consumable || ingredient ? undefined : getForgeMaterialByName(itemName)
    const seed = catalogItem || consumable || ingredient || material ? undefined : getSeedByName(itemName)
    if (seed) {
      existingItem = await tx.item.create({
        data: {
          name: seed.name,
          description: seed.description,
          type: 'CONSUMABLE',
          image: itemImagePath(seed.name),
          level: 1,
          goldPrice: seed.goldValue,
          stats: {
            kind: 'seed',
            rarity: seed.rarity,
            emoji: seed.emoji,
            sellPrice: Math.floor(seed.goldValue * SELL_FRACTION_CRAFT_INPUT),
          },
        },
      })
    } else if (catalogItem) {
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
            sellPrice: Math.floor(catalogItem.goldPrice * SELL_FRACTION_GEAR),
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
          stats: { ...consumable.stats, rarity: consumable.rarity, sellPrice: Math.floor(consumable.goldPrice * SELL_FRACTION_CONSUMABLE) },
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
            sellPrice: Math.floor(ingredient.goldValue * SELL_FRACTION_CRAFT_INPUT),
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
            sellPrice: Math.floor(material.goldValue * SELL_FRACTION_CRAFT_INPUT),
          },
        },
      })
    } else if (STONE_META[itemName]) {
      // Pedra de aprimoramento on-demand (seed pode não ter rodado ainda).
      const meta = STONE_META[itemName]
      existingItem = await tx.item.create({
        data: {
          name: itemName,
          description: meta.description,
          type: 'CONSUMABLE',
          image: itemImagePath(itemName),
          level: meta.level,
          goldPrice: meta.goldPrice,
          stats: {
            rarity: meta.rarity,
            enhancementStone: meta.code,
            battleUsable: false,
            sellPrice: meta.sellPrice,
            emoji: meta.emoji,
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
          stats: { rarity, value: rarityValue(rarity), sellPrice: Math.floor(rarityValue(rarity) * SELL_FRACTION_GEAR) },
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
    // Empilha numa linha existente: não gasta slot novo, sempre entra.
    await tx.characterInventory.update({ where: { id: existingInv.id }, data: { quantity: { increment: qty } } })
    return true
  }

  // Precisa de uma linha NOVA — só cria se ainda houver slot livre. Sem isto,
  // o inventário passava do limite (drops de dungeon ignoravam inventorySlots).
  const { free } = await freeInventorySlots(tx, characterId)
  if (free <= 0) return false

  const enhancementLevel = isConsumable ? 0 : Math.max(0, Math.floor(Number(drop.enhancement) || 0))
  await tx.characterInventory.create({
    data: { characterId, itemId: existingItem.id, quantity: isConsumable ? qty : 1, enhancementLevel },
  })
  return true
}

// Credita o espólio de um nó: ouro no User.goldBalance (pote off-chain/claimável)
// + cada drop no inventário do personagem. Tudo dentro da transação da rota.
// Itens que não couberem (inventário cheio) são descartados silenciosamente —
// `skippedDrops` devolve exatamente quais, pra rota/cliente avisarem o jogador
// e não fingir na UI que o item foi coletado.
export async function applyLootTx(
  tx: Prisma.TransactionClient,
  userId: string,
  characterId: string,
  loot: NodeLoot,
): Promise<{ gold: number; skippedDrops: LootDrop[] }> {
  // Ouro vai pra carteira do personagem (com teto diário); drops (itens) sempre entram.
  const credited = await creditCappedGoldTx(tx, userId, characterId, loot.gold)
  const skippedDrops: LootDrop[] = []
  // Pedras (e gear) antes de mats/estilhaços — inventário cheio não come o jackpot.
  const ordered = [...loot.drops].sort((a, b) => {
    const rank = (d: LootDrop) => (d.kind === 'stone' ? 0 : d.kind === 'item' ? 1 : 2)
    return rank(a) - rank(b)
  })
  for (const d of ordered) {
    const added = await addDropToInventoryTx(tx, characterId, { name: d.name, rarity: d.rarity, enhancement: d.enhancement })
    if (!added) skippedDrops.push(d)
  }
  return { gold: credited, skippedDrops }
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
