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
import { ItemType, ConsumableSubtype, Prisma as PrismaNs } from '@prisma/client'
import { prisma } from './prisma'
import { buildXpUpdate } from './characterLevelSystem'
import { wearFor } from './durability'
import {
  DUNGEONS,
  scaleMonster,
  scaleMonsterGroup,
  rollNodeLoot,
  rollKillLoot,
  firstBossBonusStones,
  FIRST_BOSS_BONUS,
  MAX_DUNGEON_TIER,
  clampDungeonTier,
  type DungeonId,
  type DungeonDef,
  type ScaledMonster,
  type NodeLoot,
  type LootDrop,
  type LootNodeKind,
  type DungeonMonsterDef,
} from './dungeonAdventures'
import { normalizeCombatClass, type CombatClass } from './combatModel'
import type { PlannedNode } from './dungeonRunPlan'
import { SELL_FRACTION_GEAR, SELL_FRACTION_CRAFT_INPUT, SELL_FRACTION_CONSUMABLE } from './sellPricing'
import { getCatalogItemByName, getConsumableByName, getIngredientByName, getForgeMaterialByName, getSeedByName, itemImagePath } from './itemCatalog'
import { freeInventorySlots } from './inventoryMutations'
import { advanceQuestProgress } from './questServer'
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
// A chance de encontro por faixa do d20 e a chance de fonte moram agora em
// lib/dungeonRunPlan.ts: elas decidem o ARRANJO da run, e o arranjo passou a ser
// decidido na criação (semeado pelo runId) para o cliente poder pintar o mapa.

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
  /**
   * Espólio JÁ ROLADO no /step, por monstro (id → drops) e do nó (só sai se o
   * pacote inteiro cair). Rolar aqui — e não no desfecho — é o que permite o
   * cliente montar o card de espólio com ZERO rede ao fim da luta.
   * Ausente em `pending` de runs abertas antes desta mudança: nesse caso o
   * desfecho rola na hora, como antes.
   */
  killDrops?: Record<string, LootDrop[]>
  nodeLoot?: NodeLoot
  /** @deprecated forma antiga (1 monstro) — lida por pendingMonsters() em runs legadas */
  monster?: ScaledMonster
}

// Normaliza o pendente para a lista de monstros, tolerando o formato legado { monster }.
export function pendingMonsters(p: RunPending): ScaledMonster[] {
  if (Array.isArray(p.monsters) && p.monsters.length > 0) return p.monsters
  return p.monster ? [p.monster] : []
}

// ============================================================
// 💰 ESPÓLIO ACUMULADO (DungeonRun.accrued)
//
// O crédito da run deixou de acontecer nó a nó: cada /step soma o que o nó
// rendeu aqui (uma escrita JSONB barata, dentro da transação que já debita
// stamina) e o /finish escreve TUDO no personagem numa transação só. Isto tira
// a rede do fim de cada luta — durante a run o jogador vê informação, não
// escrita no banco.
//
// O servidor segue dono do "quanto": o cliente só reporta QUAIS monstros caíram,
// e o teto é sempre o `pending` que o próprio servidor rolou.
// ============================================================
export interface RunAccrued {
  /** Ouro BRUTO (antes do teto diário, aplicado uma vez no /finish). */
  gold: number
  xp: number
  drops: LootDrop[]
  /** Abates totais e quantos foram de chefe — base do desgaste do gear. */
  kills: number
  bossKills: number
}

export function emptyAccrued(): RunAccrued {
  return { gold: 0, xp: 0, drops: [], kills: 0, bossKills: 0 }
}

/** Lê o acumulado de uma run tolerando null/formato inesperado. */
export function readAccrued(raw: unknown): RunAccrued {
  const a = (raw ?? {}) as Partial<RunAccrued>
  return {
    gold: Number(a.gold) || 0,
    xp: Number(a.xp) || 0,
    drops: Array.isArray(a.drops) ? a.drops : [],
    kills: Number(a.kills) || 0,
    bossKills: Number(a.bossKills) || 0,
  }
}

export function mergeAccrued(base: RunAccrued, add: RunAccrued): RunAccrued {
  return {
    gold: base.gold + add.gold,
    xp: base.xp + add.xp,
    drops: [...base.drops, ...add.drops],
    kills: base.kills + add.kills,
    bossKills: base.bossKills + add.bossKills,
  }
}

/** Desfecho de um nó reportado pelo cliente. */
export type NodeOutcome = 'clear' | 'retreat' | 'lose'

/**
 * Aplica o desfecho de UM nó de combate contra o `pending` que o servidor rolou.
 *
 * `clear` credita todos os monstros ainda vivos + o espólio do nó; `retreat`/
 * `lose` creditam só os abates REPORTADOS (ids desconhecidos ou repetidos são
 * ignorados — o teto é sempre o que o servidor rolou) e não pagam espólio de nó.
 */
export function resolveNodeOutcome(
  pending: RunPending,
  outcome: NodeOutcome,
  reportedIds: unknown,
  // Só usado quando o `pending` é legado (sem killDrops/nodeLoot pré-rolados).
  fallback?: { dungeon: DungeonDef; character: CharacterForRun; tier: number },
): { delta: RunAccrued; newlyKilled: ScaledMonster[]; killed: Set<string>; allDead: boolean } {
  const monsters = pendingMonsters(pending)
  const killed = new Set(pending.killedIds ?? [])
  const alive = monsters.filter(m => !killed.has(m.id))

  let newlyKilled = alive
  if (outcome !== 'clear') {
    const reported = new Set(Array.isArray(reportedIds) ? (reportedIds as string[]) : [])
    newlyKilled = alive.filter(m => reported.has(m.id))
  }
  for (const m of newlyKilled) killed.add(m.id)
  const allDead = monsters.every(m => killed.has(m.id))

  const drops: LootDrop[] = []
  for (const m of newlyKilled) {
    const pre = pending.killDrops?.[m.id]
    drops.push(
      ...(pre ??
        (fallback
          ? rollKillLoot(pending.kind, !!m.isBoss, fallback.dungeon.difficultyStars, fallback.tier, pending.lootRoll, fallback.dungeon)
          : []))
    )
  }

  // O espólio do NÓ só sai quando o pacote inteiro cai (recompensa por limpar).
  let gold = newlyKilled.reduce((s, m) => s + m.goldReward, 0)
  if (allDead && outcome === 'clear') {
    const node =
      pending.nodeLoot ?? (fallback ? rollCombatLoot(fallback.dungeon, fallback.character, pending, fallback.tier) : null)
    if (node) {
      gold += node.gold
      drops.push(...node.drops)
    }
  }

  return {
    delta: {
      gold,
      xp: newlyKilled.reduce((s, m) => s + m.xpReward, 0),
      drops,
      kills: newlyKilled.length,
      bossKills: newlyKilled.filter(m => !!m.isBoss).length,
    },
    newlyKilled,
    killed,
    allDead,
  }
}

/**
 * Ordem de crédito dos drops: pedra → gear → resto. No nat 20 a pedra é o
 * jackpot; com a mochila quase cheia, materiais/estilhaços não podem roubar o
 * último slot e descartá-la. O cliente espelha esta ordem ao prever a mochila cheia.
 */
export function orderDropsForCredit(drops: LootDrop[]): LootDrop[] {
  const rank = (d: LootDrop) => (d.kind === 'stone' ? 0 : d.kind === 'item' ? 1 : 2)
  return [...drops].sort((a, b) => rank(a) - rank(b))
}

export interface CharacterForRun {
  id: string
  level: number
  race: string
  class: string
}

// Resolve o PRÓXIMO nó (não-boss): rola o d20 no SERVIDOR e decide monstro vs. achado.
/**
 * O que há no nó — LÊ A PLANTA, não sorteia.
 *
 * Até 2026-07-28 esta função rolava `Math.random()` aqui: o d20 decidia
 * monstro-vs-achado (faixa de sorte) e outro sorteio escolhia espécie e tamanho
 * do bando. Isso tornava impossível o cliente saber o que havia num nó antes de
 * pisar nele — e por isso o mapa desenhava "?". Agora tudo isso vem de
 * `planDungeonRun(dungeon, runId)`, uma função pura semeada pelo runId que o
 * cliente também roda; o servidor continua sendo o dono dos STATS e do espólio.
 *
 * O d20 sobreviveu com o papel que o design dá a ele: qualidade do espólio.
 */
export function resolveExploreNode(
  dungeon: DungeonDef,
  character: CharacterForRun,
  node: TrailNode,
  nodeIdx: number,
  tier: number = 1,
  planned: PlannedNode,
):
  | { type: 'monster'; roll: number; pending: RunPending }
  | { type: 'find'; roll: number; loot: NodeLoot } {
  const roll = 1 + Math.floor(Math.random() * 20)
  const klass = combatClassOf(character.class)
  const isMain = node.kind === 'main'
  const scaling = { tier: node.tier, isMain, isBoss: false }

  if (planned.category === 'combat') {
    // Espécies da planta → defs do catálogo. Nome que não casa (catálogo mudou
    // no meio de uma run aberta) cai no sorteio de sempre, para não derrubar a run.
    const species = planned.monsters
      .map(name => dungeon.monsters.find(m => m.name === name))
      .filter((m): m is DungeonMonsterDef => !!m)
    const monsters = species.length
      ? scaleMonsterGroup(dungeon, character.level, scaling, klass, tier, { species })
      : scaleMonsterGroup(dungeon, character.level, scaling, klass, tier, {
          earlyBias: !isMain && node.tier === 1,
        })
    return {
      type: 'monster',
      roll,
      pending: { nodeIdx, kind: isMain ? 'main' : 'minor', lootRoll: roll, monsters, killedIds: [] },
    }
  }

  // ⛲ Fonte revitalizadora: HP/MP cheios em vez de espólio. Quem escolhe é a
  // planta (só nó menor a partir da 2ª sala); aqui só se emite o evento.
  if (planned.flavor === 'fountain') {
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

// Emissão de gold do DIA (UTC) por usuário = masmorra + VENDAS ao ferreiro + ARENA.
// ⚖️ Balance de lançamento (P0): a venda passava por fora do cap e era ~40% do
// faucet da conta — agora as duas fontes dividem o MESMO teto diário.
// ⚖️ 2026-07-15: a ARENA entrou no teto. Antes o ouro de PvP consumia o teto do PvP
// (battle/rewards tinha a própria cópia desta soma) mas NÃO o da masmorra — dava p/
// estourar 20k lutando e MAIS 20k masmorrando. Com a arena virando a fonte principal
// de ouro (PVP_GOLD_PER_STA 31), essa assimetria deixou de ser detalhe.
export async function pvpGoldEmittedTodayTx(tx: Prisma.TransactionClient, userId: string): Promise<number> {
  // Fonte: ledger PvpMatch (transacional), não mais o characterHistory best-effort
  // por prefixo de description — history perdido deixava ouro invisível ao teto.
  const gte = startOfUtcDay()
  const [asWinner, asLoser] = await Promise.all([
    tx.pvpMatch.aggregate({ _sum: { winnerGold: true }, where: { winnerUserId: userId, createdAt: { gte } } }),
    tx.pvpMatch.aggregate({ _sum: { loserGold: true }, where: { loserUserId: userId, createdAt: { gte } } }),
  ])
  return (asWinner._sum?.winnerGold ?? 0) + (asLoser._sum?.loserGold ?? 0)
}

async function goldEmittedToday(tx: Prisma.TransactionClient, userId: string): Promise<number> {
  const gte = startOfUtcDay()
  const [runs, sales, pvp] = await Promise.all([
    tx.dungeonRun.aggregate({ _sum: { goldEarned: true }, where: { userId, createdAt: { gte } } }),
    tx.goldSale.aggregate({ _sum: { amount: true }, where: { userId, createdAt: { gte } } }),
    pvpGoldEmittedTodayTx(tx, userId),
  ])
  return (runs._sum.goldEarned ?? 0) + (sales._sum.amount ?? 0) + pvp
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

/**
 * Orçamento de slots compartilhado por um LOTE de drops. Sem ele cada drop
 * refazia `count` + `findUnique` do personagem (N+1 dentro da transação); com
 * ele o cálculo acontece uma vez e o contador desce sozinho a cada linha nova.
 */
export interface SlotBudget { free: number }

/**
 * O registro do catálogo precisa de conserto? Predicado PURO (não toca no banco),
 * usado nos dois caminhos: `ensureCatalogItemTx` decide se roda os `update` de
 * cura, e o pré-resolvedor em lote (`prepareDropItems`) decide se aquele nome
 * merece um round-trip próprio ou se já veio pronto do `findMany`.
 */
function needsCatalogHeal(item: { name: string; type: ItemType; image: string | null; stats: unknown }): boolean {
  if (item.type !== 'CONSUMABLE') return false
  const stats = (item.stats as Record<string, any> | null) ?? {}
  // Pedra criada pelo fallback genérico: sem `enhancementStone` ela cai no
  // inventário mas não funciona no aprimoramento.
  if (STONE_META[item.name] && !stats.enhancementStone) return true
  // Ingrediente/material legado: sem `stats.kind`/`image` o card fica sem imagem
  // e sem o botão de "Usar na Alquimia/Forja". [[dolrath-alchemy-crafting]]
  const ing = getIngredientByName(item.name)
  const mat = ing ? undefined : getForgeMaterialByName(item.name)
  if (ing || mat) {
    if (stats.kind !== (ing ? 'ingredient' : 'material')) return true
    if (!item.image) return true
  }
  return false
}

/**
 * Resolve (achando, curando ou criando) o Item do catálogo a partir do NOME.
 *
 * Aceita tanto um `tx` quanto o `prisma` cru — o `Item` é global e idempotente
 * por nome, então esta parte pode (e deve) rodar FORA da transação de crédito:
 * era ela que enchia a transação do /finish de round-trips até estourar o
 * timeout de 5s do Prisma (P2028) e derrubar o espólio da run inteira.
 */
export async function ensureCatalogItemTx(
  tx: Prisma.TransactionClient,
  itemName: string,
  rarityHint?: string,
) {
  let existingItem = await tx.item.findFirst({ where: { name: itemName } })
  if (existingItem && !needsCatalogHeal(existingItem)) return existingItem

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
      const rarity = rarityHint || 'COMMON'
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

  return existingItem
}

// Resolve/cria o Item do catálogo a partir do nome (mesma lógica de
// add-exploration-reward) e o adiciona ao inventário do personagem.
// Exportada: a COLETA (gatheringServer.ts) e a FAZENDA depositam por aqui.
// `qty` só vale para consumível (empilha); equipamento é sempre 1 peça/linha.
export async function addDropToInventoryTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  drop: { name: string; rarity?: string; enhancement?: number; qty?: number },
  slots?: SlotBudget,
) {
  const qty = Math.max(1, Math.floor(Number(drop.qty) || 1))
  const existingItem = await ensureCatalogItemTx(tx, drop.name, drop.rarity)

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
  // Com orçamento de lote o contador já veio calculado (uma consulta pro lote todo).
  if (slots) {
    if (slots.free <= 0) return false
    slots.free -= 1
  } else {
    const { free } = await freeInventorySlots(tx, characterId)
    if (free <= 0) return false
  }

  const enhancementLevel = isConsumable ? 0 : Math.max(0, Math.floor(Number(drop.enhancement) || 0))
  await tx.characterInventory.create({
    data: { characterId, itemId: existingItem.id, quantity: isConsumable ? qty : 1, enhancementLevel },
  })
  return true
}

/** nome do drop → linha do catálogo, pré-resolvida FORA da transação. */
export type DropCatalog = Map<string, { id: string; isConsumable: boolean }>

/**
 * Pré-resolve o catálogo de um LOTE de drops SEM transação aberta.
 *
 * Uma consulta só (`findMany` pelo índice de `Item.name`) cobre o caso normal;
 * só nome inédito ou registro que precisa de cura paga round-trip próprio. Isto
 * é o que tira ~3 queries POR DROP de dentro da transação do /finish — com 30-60
 * drops numa run boa, era isso que estourava o timeout de 5s (P2028) e fazia a
 * run inteira ser perdida.
 */
export async function prepareDropItems(drops: LootDrop[]): Promise<DropCatalog> {
  const catalog: DropCatalog = new Map()
  const names = Array.from(new Set(drops.map(d => d.name)))
  if (names.length === 0) return catalog

  const rows = await prisma.item.findMany({ where: { name: { in: names } } })
  const byName = new Map<string, (typeof rows)[number]>()
  for (const r of rows) if (!byName.has(r.name)) byName.set(r.name, r)

  for (const name of names) {
    const row = byName.get(name)
    if (row && !needsCatalogHeal(row)) {
      catalog.set(name, { id: row.id, isConsumable: row.type === 'CONSUMABLE' })
      continue
    }
    // Ausente ou precisando de conserto: aqui sim vale a lógica completa (que
    // cria/atualiza). `prisma` serve como TransactionClient — sem transação, de
    // propósito: criar linha de catálogo é global e idempotente por nome.
    const rarity = drops.find(d => d.name === name)?.rarity
    const ensured = await ensureCatalogItemTx(prisma, name, rarity)
    catalog.set(name, { id: ensured.id, isConsumable: ensured.type === 'CONSUMABLE' })
  }
  return catalog
}

/**
 * Credita um LOTE de drops (a run inteira) em POUCAS escritas.
 *
 * Agrupa por item antes de tocar no banco: 5 estilhaços iguais viram UM
 * `increment: 5`, e todas as linhas novas saem num `createMany`. Respeita a
 * ordem de prioridade (pedra → gear → resto) ao gastar os slots, devolvendo o
 * que não coube para o cliente avisar em vez de fingir que coletou.
 *
 * O catálogo (`prepareDropItems`) tem que vir pronto — nada de resolver nome
 * dentro da transação.
 */
export async function creditDropsBatchTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  drops: LootDrop[],
  catalog: DropCatalog,
): Promise<LootDrop[]> {
  if (drops.length === 0) return []
  const ordered = orderDropsForCredit(drops)
  const itemIds = Array.from(
    new Set(ordered.map(d => catalog.get(d.name)?.id).filter((id): id is string => !!id))
  )

  const { free } = await freeInventorySlots(tx, characterId)
  const existingRows = itemIds.length
    ? await tx.characterInventory.findMany({
        where: { characterId, itemId: { in: itemIds }, enhancementLevel: 0 },
        select: { id: true, itemId: true },
      })
    : []
  // Só interessa UMA pilha por item (a mesma que o findFirst antigo escolheria).
  const stackOf = new Map<string, string>()
  for (const r of existingRows) if (!stackOf.has(r.itemId)) stackOf.set(r.itemId, r.id)

  let slotsFree = free
  const skipped: LootDrop[] = []
  const bumps: { id: string; inc: number }[] = [] // linha existente → quanto somar
  const bumpIdx = new Map<string, number>()
  const creates: { itemId: string; quantity: number; enhancementLevel: number }[] = []
  const newStackIdx = new Map<string, number>() // consumível inédito empilha entre si

  for (const d of ordered) {
    const cat = catalog.get(d.name)
    if (!cat) { skipped.push(d); continue }
    if (cat.isConsumable) {
      const rowId = stackOf.get(cat.id)
      if (rowId) {
        const bi = bumpIdx.get(rowId)
        if (bi != null) bumps[bi].inc += 1
        else { bumpIdx.set(rowId, bumps.length); bumps.push({ id: rowId, inc: 1 }) }
        continue
      }
      const idx = newStackIdx.get(cat.id)
      if (idx != null) { creates[idx].quantity += 1; continue }
      if (slotsFree <= 0) { skipped.push(d); continue }
      slotsFree -= 1
      newStackIdx.set(cat.id, creates.length)
      creates.push({ itemId: cat.id, quantity: 1, enhancementLevel: 0 })
      continue
    }
    // Equipamento NUNCA agrupa: 1 slot por peça. [[dolrath-inventory-stacking-rule]]
    if (slotsFree <= 0) { skipped.push(d); continue }
    slotsFree -= 1
    creates.push({ itemId: cat.id, quantity: 1, enhancementLevel: Math.max(0, Math.floor(Number(d.enhancement) || 0)) })
  }

  // Sequencial de propósito: queries concorrentes na mesma transação interativa
  // dividem uma conexão só e o Prisma não garante ordem.
  for (const b of bumps) {
    await tx.characterInventory.update({ where: { id: b.id }, data: { quantity: { increment: b.inc } } })
  }
  if (creates.length > 0) {
    await tx.characterInventory.createMany({ data: creates.map(c => ({ characterId, ...c })) })
  }
  return skipped
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

// ⚔️ Aplica desgaste ao gear equipado, com clamp em 0 (peça QUEBRADA — segue equipada,
// mas sem somar bônus até o reparo). Dois updateMany por grupo porque `decrement` não
// tem piso: o 1º baixa quem aguenta o débito, o 2º zera quem não aguenta.
// Compartilhado pela masmorra (dungeon/run/combat) e pela arena (battle/rewards).
export async function applyGearWearTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  weaponWear: number,
  gearWear: number,
): Promise<void> {
  if (weaponWear > 0) {
    await tx.characterEquipment.updateMany({
      where: { characterId, slot: 'WEAPON', durability: { gt: weaponWear } },
      data: { durability: { decrement: weaponWear } },
    })
    await tx.characterEquipment.updateMany({
      where: { characterId, slot: 'WEAPON', durability: { gt: 0, lte: weaponWear } },
      data: { durability: 0 },
    })
  }
  if (gearWear > 0) {
    await tx.characterEquipment.updateMany({
      where: { characterId, slot: { not: 'WEAPON' }, durability: { gt: gearWear } },
      data: { durability: { decrement: gearWear } },
    })
    await tx.characterEquipment.updateMany({
      where: { characterId, slot: { not: 'WEAPON' }, durability: { gt: 0, lte: gearWear } },
      data: { durability: 0 },
    })
  }
}

// Serializa o monstro para o cliente animar (mesma forma do ScaledMonster).
export function publicMonster(m: ScaledMonster): ScaledMonster {
  return m
}

// ============================================================
// 🏁 FLUSH — o único ponto pesado do loop da masmorra.
//
// Escreve no personagem, de UMA vez, tudo o que a run acumulou: ouro (teto
// diário aplicado uma vez), XP + level-up, drops em lote e desgaste do gear.
// Antes isto rodava por NÓ, e cada rodada refazia o teto diário, o catálogo de
// itens por nome e a contagem de slots — 20-40 round-trips presos numa transação
// interativa a cada fim de luta.
//
// Chamado por /finish (saída normal) e também por /start e /abandon quando
// encontram uma run velha com espólio pendurado: aba que fecha ou trava não
// perde nada, só recebe na entrada seguinte.
// ============================================================
export type RunEndReason = 'boss' | 'retreat' | 'lose'

/** Sinaliza que outra requisição fechou a run primeiro (rollback + 409). */
class RunAlreadyClosedError extends Error {}

export interface RunFlushGrant {
  gold: number
  xp: number
  drops: LootDrop[]
  skippedDrops: LootDrop[]
  kills: number
  bossDefeated: boolean
  leveledUp: boolean
  newLevel: number
  equipmentWear: { slot: string; name: string; durability: number; maxDurability: number; justBroke: boolean }[]
  /**
   * ⚡ Stamina final do personagem — só vem quando o flush ESTORNOU o passo de um
   * nó que ficou por jogar (ver `staminaRefund` abaixo). O cliente sai da run com o
   * valor da tela, então sem isto a ficha voltaria ao mapa com a stamina
   * pré-estorno até a próxima leitura.
   */
  stamina?: number
}

interface FlushableRun {
  id: string
  userId: string
  characterId: string
  dungeonId: string
  tier: number
  cursor: number
  pending: unknown
  accrued: unknown
}

export async function flushRunRewards(
  run: FlushableRun,
  opts: {
    reason: RunEndReason
    resolve?: { nodeIdx?: number; outcome?: NodeOutcome; killedIds?: unknown }
    /**
     * ❤️ Fração de HP/MP com que o herói saiu da run (0..1). HP/MP agora
     * SOBREVIVEM à run — voltar ao cheio é serviço pago da Alquimista.
     *
     * Vem como FRAÇÃO, não valor bruto: o teto efetivo da run inclui gear e
     * passivas da árvore, então o número cru quebraria assim que o jogador
     * trocasse de equipamento ou subisse de nível.
     *
     * `undefined` = quem fechou a run não tem essa informação (drain de run
     * órfã, /abandon de bot, flushStaleRuns) → não escreve nada, o HP fica
     * como estava.
     */
    hpPct?: number
    mpPct?: number
  },
): Promise<RunFlushGrant | null> {
  const dungeon = getDungeon(run.dungeonId)
  if (!dungeon) return null

  const character = await prisma.character.findUnique({
    where: { id: run.characterId },
    // Só o que buildXpUpdate precisa — o row inteiro traz JSONBs grandes
    // (transformationImages, skillTree) que não têm uso nenhum aqui.
    // maxHp/maxMp entram para converter a fração de saída em valor absoluto.
    select: {
      id: true, level: true, race: true, class: true, experience: true,
      availablePoints: true, baseStats: true, maxHp: true, maxMp: true,
      // ⚡ Só para o ESTORNO do passo não jogado (ver `staminaRefund`).
      stamina: true, maxStamina: true, staminaUpdatedAt: true,
    },
  })
  if (!character) return null
  const charForRun: CharacterForRun = {
    id: character.id,
    level: character.level,
    race: character.race,
    class: character.class,
  }

  let accrued = readAccrued(run.accrued)

  // Desfecho do ÚLTIMO nó — o que não teve /step seguinte para levá-lo de carona.
  let bossDefeated = false
  /**
   * ⚡ ESTORNO do passo que o jogador PAGOU e não jogou.
   *
   * O /step debita a stamina na SAÍDA do nó anterior (prefetchStep, para a
   * latência caber debaixo da caminhada), então quem manda parar no meio do
   * trajeto já pagou por um nó que nunca aconteceu. Como o resto da run só é
   * creditado aqui no flush, a stamina fecha a conta no mesmo lugar.
   *
   * `pending` só existe em nó de COMBATE e o cursor só avança quando o pacote
   * cai — logo, pendente + nenhum monstro abatido = nó que não rendeu nada.
   * Achado/fonte não entram: o /step já creditou o espólio e avançou o cursor.
   * Nunca devolve mais do que foi cobrado, então não abre farm de stamina.
   */
  let staminaRefund = 0
  if (run.pending) {
    const pending = run.pending as unknown as RunPending
    const wanted = opts.resolve
    const matches = wanted && (wanted.nodeIdx == null || Number(wanted.nodeIdx) === pending.nodeIdx)
    // Sem `resolve` que case, ninguém morreu neste nó por definição.
    let untouched = (pending.killedIds ?? []).length === 0
    if (matches) {
      const outcome: NodeOutcome = wanted.outcome === 'clear' ? 'clear' : opts.reason === 'lose' ? 'lose' : 'retreat'
      const { delta, allDead, newlyKilled } = resolveNodeOutcome(pending, outcome, wanted.killedIds, {
        dungeon,
        character: charForRun,
        tier: run.tier,
      })
      accrued = mergeAccrued(accrued, delta)
      bossDefeated = pending.kind === 'boss' && allDead && outcome === 'clear'
      if (newlyKilled.length > 0) untouched = false
    }
    if (untouched) staminaRefund = STEP_COST[pending.kind]
  }

  // 🌅 Bônus solo: os primeiros bosses do DIA da CONTA rendem pedras extras.
  if (bossDefeated) {
    const startOfDay = new Date()
    startOfDay.setUTCHours(0, 0, 0, 0)
    const bossesToday = await prisma.dungeonRun.count({
      where: { userId: run.userId, status: 'finished', updatedAt: { gte: startOfDay } },
    })
    if (bossesToday < FIRST_BOSS_BONUS.bossesPerDay) {
      accrued = mergeAccrued(accrued, { ...emptyAccrued(), drops: firstBossBonusStones() })
    }
  }

  // O status vem do que o SERVIDOR confirmou, não do que o cliente pediu: só
  // 'finished' (que destrava o tier seguinte) com o chefe comprovadamente morto.
  const status = bossDefeated ? 'finished' : opts.reason === 'lose' ? 'defeated' : 'abandoned'

  // Desgaste: linear nos abates, chefe dobra. Soma idêntica à do débito por nó.
  const normalKills = Math.max(0, accrued.kills - accrued.bossKills)
  const weaponWear = wearFor('WEAPON', normalKills, false) + wearFor('WEAPON', accrued.bossKills, true)
  const gearWear = wearFor('ARMOR', normalKills, false) + wearFor('ARMOR', accrued.bossKills, true)

  const xp = buildXpUpdate(character, accrued.xp)

  // ❤️ HP/MP de saída: converte a fração reportada pelo cliente no valor absoluto
  // da coluna. Clamp em [0,1] — o cliente é a autoridade do combate (mesmo modelo
  // do resto da run), mas não pode inventar um pool acima do teto.
  // HP tem piso 1: cair não "mata" o personagem (isAlive/deathTimestamp seguem
  // sendo do fluxo antigo de revive), só o deixa precisando da Alquimista.
  const clamp01 = (v: unknown) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : null
  const hpPct = clamp01(opts.hpPct)
  const mpPct = clamp01(opts.mpPct)
  // Subiu de nível na run? A cura do level up (buildXpUpdate) VENCE: recompensa
  // clássica de RPG, e os pontos que a destravam são limitados pelo próprio
  // nível — não dá para farmar cura de graça por aí.
  const poolUpdate = xp.leveledUp ? {} : {
    ...(hpPct !== null ? { hp: Math.max(1, Math.round(character.maxHp * hpPct)) } : {}),
    ...(mpPct !== null ? { mp: Math.max(0, Math.round(character.maxMp * mpPct)) } : {}),
  }

  // ⏱️ TUDO o que dá para ler/resolver ANTES fica fora da transação. A transação
  // interativa do Prisma tem timeout (P2028) e um rollback aqui significa perder
  // a run inteira do jogador — ela precisa conter só as ESCRITAS.
  const t0 = Date.now()
  const [catalog, remaining, equipped, live] = await Promise.all([
    prepareDropItems(accrued.drops),
    dailyGoldRemainingTx(prisma, run.userId),
    weaponWear > 0 || gearWear > 0
      ? prisma.characterEquipment.findMany({
          where: { characterId: character.id },
          include: { item: { select: { name: true } } },
        })
      : Promise.resolve([] as { slot: string; durability: number; maxDurability: number; item: { name: string } }[]),
    // ⚡ Estorno: a stamina VIVA (regen passivo ou tiques de coleta já debitados)
    // é a base do crédito — somar sobre o valor parado da coluna devolveria a
    // mais. Import dinâmico porque gatheringServer importa este módulo: em
    // estático o ciclo se fecharia na carga, e aqui a chamada é só neste ramo.
    staminaRefund > 0
      ? import('./staminaServer').then(m => m.regenAndPersist(character, { deferWrite: true }))
      : Promise.resolve(null),
  ])
  const gold = Math.min(Math.max(0, Math.floor(accrued.gold)), remaining)

  // Valor ABSOLUTO (não `increment`) porque precisa do teto; a âncora vai junto,
  // como no /step — o regen até agora já está dentro de `live`, nada se perde.
  const staminaUpdate = live
    ? { stamina: Math.min(character.maxStamina, live.stamina + staminaRefund), staminaUpdatedAt: new Date() }
    : null

  // Relatório de desgaste (só texto para o cliente); a escrita é o applyGearWearTx.
  const equipmentWear: RunFlushGrant['equipmentWear'] = []
  for (const eq of equipped) {
    if (eq.durability <= 0) continue // já quebrada: não desgasta além de 0
    const wear = eq.slot === 'WEAPON' ? weaponWear : gearWear
    const after = Math.max(0, eq.durability - wear)
    if (after === eq.durability) continue
    equipmentWear.push({
      slot: eq.slot,
      name: eq.item.name,
      durability: after,
      maxDurability: eq.maxDurability,
      justBroke: after === 0,
    })
  }

  const tPrep = Date.now() - t0

  try {
    const granted = await prisma.$transaction(async (tx) => {
      // Fecha a run PRIMEIRO e de forma condicional: se outra requisição já
      // fechou, `count` vem 0 e o throw desfaz tudo (nada é creditado duas vezes).
      const claimed = await tx.dungeonRun.updateMany({
        where: { id: run.id, status: 'active' },
        data: { status, pending: PrismaNs.DbNull, accrued: PrismaNs.DbNull },
      })
      if (claimed.count !== 1) throw new RunAlreadyClosedError()

      const skippedDrops = await creditDropsBatchTx(tx, character.id, accrued.drops, catalog)

      await tx.character.update({
        where: { id: character.id },
        // poolUpdate (hp/mp) e o estorno de stamina viajam no MESMO update: o
        // flush tem orçamento de tempo (P2028 leva a run inteira junto), então
        // nada de query extra.
        data: {
          ...xp.updateData,
          ...poolUpdate,
          ...(staminaUpdate ?? {}),
          ...(gold > 0 ? { gold: { increment: gold } } : {}),
        },
      })

      await tx.dungeonRun.update({
        where: { id: run.id },
        data: { goldEarned: { increment: gold }, xpEarned: { increment: accrued.xp } },
      })

      // 🏆 Desbloqueio de TIER: vencer o boss no tier == maxTier atual sobe o maxTier.
      if (bossDefeated) {
        const key = { characterId_dungeonId: { characterId: character.id, dungeonId: dungeon.id } }
        const prog = await tx.dungeonProgress.upsert({
          where: key,
          create: { characterId: character.id, dungeonId: dungeon.id, maxTier: 1 },
          update: {},
        })
        const beat = clampDungeonTier(run.tier)
        if (beat >= prog.maxTier && prog.maxTier < MAX_DUNGEON_TIER) {
          await tx.dungeonProgress.update({ where: key, data: { maxTier: prog.maxTier + 1 } })
        }
      }

      if (equipmentWear.length > 0) await applyGearWearTx(tx, character.id, weaponWear, gearWear)

      return {
        gold,
        xp: accrued.xp,
        drops: accrued.drops,
        skippedDrops,
        kills: accrued.kills,
        bossDefeated,
        leveledUp: xp.leveledUp,
        newLevel: xp.leveledUp ? xp.newLevelInfo.level : character.level,
        equipmentWear,
        ...(staminaUpdate ? { stamina: staminaUpdate.stamina } : {}),
      }
    }, {
      // A transação carrega a run INTEIRA de um jogador: rollback aqui é espólio
      // perdido, não uma request repetida. O default de 5s do Prisma estourava
      // (P2028) em runs com muito drop — a função da Vercel tem 300s de folga.
      timeout: 20_000,
      maxWait: 10_000,
    })

    // Medição no log: `drops` e `ms` são o sinal que teria pego o P2028 antes do
    // jogador reclamar. Aparece no `vercel logs -q "[finish]"`.
    console.log(
      `[finish] run=${run.id} drops=${accrued.drops.length} gold=${gold} xp=${accrued.xp} prep=${tPrep}ms tx=${Date.now() - t0 - tPrep}ms`
    )

    // 🗺️ Missões: pós-commit e fire-and-forget (fail-soft, nunca afeta a rota).
    if (accrued.kills > 0) {
      advanceQuestProgress(character.id, { type: 'dungeon_monster_kill', amount: accrued.kills }).catch(() => {})
    }
    if (bossDefeated) {
      advanceQuestProgress(character.id, { type: 'dungeon_boss_kill', amount: 1 }).catch(() => {})
    }
    if (xp.leveledUp) {
      advanceQuestProgress(character.id, { type: 'level_reach', value: xp.newLevelInfo.level }).catch(() => {})
    }

    return granted
  } catch (err) {
    if (err instanceof RunAlreadyClosedError) return null
    throw err
  }
}

/**
 * Drena o espólio de runs que ficaram para trás (aba fechada, crash, lock
 * expirado) e as marca como abandonadas. Sem isto o `accrued` daquelas runs
 * nunca chegaria no personagem.
 */
export async function flushStaleRuns(where: { userId: string; characterId?: string }): Promise<void> {
  const stale = await prisma.dungeonRun.findMany({
    where: { ...where, status: 'active' },
    select: {
      id: true, userId: true, characterId: true, dungeonId: true,
      tier: true, cursor: true, pending: true, accrued: true,
    },
  })
  // Runs cujo flush LANÇOU: o espólio continua no banco e não pode ser apagado.
  const failed = new Set<string>()
  for (const run of stale) {
    // Sem `resolve`: o combate que estava aberto não teve desfecho reportado, então
    // só entra o que já estava acumulado. Falha de uma run não pode travar as outras.
    try {
      await flushRunRewards(run, { reason: 'retreat' })
    } catch (err) {
      failed.add(run.id)
      console.error(`[flushStaleRuns] falhou ao drenar run=${run.id} — accrued PRESERVADO`, err)
    }
  }
  // Rede de segurança: o flush pode devolver `null` sem fechar a run (masmorra
  // removida do catálogo, personagem apagado). Nada pode ficar 'active' para
  // sempre — isso seguraria o lock do herói a cada entrada.
  //
  // ⚠️ Só entra aqui quem NÃO lançou. Quando o flush falha (P2028, rede, deadlock),
  // apagar `accrued` aqui destruía o espólio da run inteira, em silêncio — era isso
  // que transformava um /finish com erro em perda definitiva. A run fica 'active'
  // com o espólio intacto e é tentada de novo no /start seguinte; ela não bloqueia
  // o herói porque o lock (`isRunLive`) é por tempo.
  const drainable = stale.filter(r => !failed.has(r.id)).map(r => r.id)
  if (drainable.length > 0) {
    await prisma.dungeonRun.updateMany({
      where: { id: { in: drainable }, status: 'active' },
      data: { status: 'abandoned', pending: PrismaNs.DbNull, accrued: PrismaNs.DbNull },
    })
  }
}

export type { ScaledMonster, NodeLoot, DungeonId }
