#!/usr/bin/env ts-node
// ============================================================
// DOLRATH — SIMULADOR ECONÔMICO UNIFICADO (faucet/sink por CONTA)
//
// A peça que faltava entre os sims especializados: soma TODAS as fontes
// (dungeon, coleta, fazenda, PvP, venda de loot a 60%) e TODOS os drenos
// (refino, poções, reparo, aprimoramento, expansão) por DIA e por CONTA
// com N personagens — e mede gold-por-stamina de cada atividade.
//
// FONTE DA VERDADE: importa os geradores REAIS do jogo (zero constante
// duplicada — mesma arquitetura do dungeon-loot-sim.ts):
//   • resolveExploreNode/resolveBossNode/rollCombatLoot/STEP_COST (dungeonRunServer)
//   • scaleMonster goldReward/xpReward + rollKillLoot (dungeonAdventures)
//   • rollGatherYield + curvas de profissão (gathering/professionSystem)
//   • CROPS/WELL/PEN + farmPlotCount/farmGrowthMult (farming)
//   • getEnhanceChance/getFailstackGain (enhancementSystem)
//   • POTION_RECIPES/FORGE_RECIPES + preços do itemCatalog (venda = 60%)
//   • getXPForNextLevel (experienceSystem)
//
// HEURÍSTICAS (parametrizáveis; validadas pelos sims de combate à parte):
//   • defeatChance: mesma curva do farm-progression-sim (boss ~75% no alvo)
//   • POTS_RUN poções de vida por run (craft-first, senão loja)
//   • desgaste: arma −2/abate (boss 2×), 5 peças −1; reparo = cópia/25 pts
//   • PvP: PVP_STA_SHARE do orçamento vai p/ a arena (o RESTO vai p/ a masmorra) —
//     as duas atividades disputam a MESMA stamina; recompensa = calculatePvpStaminaRewards
//
// Uso:
//   npm run sim:economy            (ou o comando ts-node abaixo)
//   TS_NODE_TRANSPILE_ONLY=1 npx ts-node --compiler-options \
//     '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' \
//     -r tsconfig-paths/register scripts/economy-unified-sim.ts
//   DAYS=30 CHARS=1,3,5,10 TRIALS=25 SEED=42 ...  (envs abaixo)
// ============================================================

/* eslint-disable no-console */

// ---- RNG determinístico: patch global ANTES dos imports do jogo ----
const SEED = Number(process.env.SEED ?? 42)
function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
Math.random = mulberry32(SEED)

import {
  DUNGEON_LIST, scaleMonsterGroup, luckTier, firstBossBonusStones, FIRST_BOSS_BONUS,
  type DungeonDef, type LootDrop, type ScaledMonster,
} from '@/lib/dungeonAdventures'
import {
  buildTrail, STEP_COST, resolveExploreNode, resolveBossNode, rollCombatLoot, rollKillLoot,
  type RunPending, type CharacterForRun,
} from '@/lib/dungeonRunServer'
import { rollGatherYield, GATHER_TICK_STAMINA, type GatherFieldId } from '@/lib/gathering'
import { CROPS, WELL, PEN, FARM_ACTION_STAMINA, WELL_COLLECT_STAMINA, cropGrowSeconds, rollCropYield } from '@/lib/farming'
import { farmPlotCount, professionXpForLevel, PROFESSION_MAX_LEVEL } from '@/lib/professionSystem'
import { getEnhanceChance, getFailstackGainOnFail } from '@/lib/enhancementSystem'
import { POTION_RECIPES } from '@/lib/alchemy'
import { FORGE_RECIPES } from '@/lib/forge'
import { PROCESSING_RECIPES } from '@/lib/processing'
import {
  getCatalogItemByName, getConsumableByName, getIngredientByName,
  getForgeMaterialByName, getSeedByName,
} from '@/lib/itemCatalog'
import { getXPForNextLevel } from '@/lib/experienceSystem'
import { SELL_FRACTION_CRAFT_INPUT, SELL_FRACTION_CONSUMABLE } from '@/lib/sellPricing'
import { calculatePvpStaminaRewards, PVP_MIN_ENTRY_STAMINA } from '@/lib/pvpRewards'
import { PVP_FIGHT_WEAR_KILLS, WEAR_WEAPON_PER_KILL, WEAR_GEAR_PER_KILL } from '@/lib/durability'

// ---------------- Parâmetros ----------------
const DAYS = Number(process.env.DAYS ?? 30)
const TRIALS = Number(process.env.TRIALS ?? 25)
const CHAR_COUNTS = String(process.env.CHARS ?? '1,3,5,10').split(',').map(Number)
const DUNGEON_ID = String(process.env.DUNGEON ?? 'floresta')
const UTIL = Number(process.env.UTIL ?? 0.75)           // fração do dia jogada (farm sim: 0.75)
const DAILY_GOLD_CAP = Number(process.env.CAP ?? 20000) // dungeonDailyGoldCap default
const POTS_RUN = Number(process.env.POTS_RUN ?? 4)      // poções de vida consumidas por run
// ⚔️ Arena: fração do orçamento diário de stamina que vai p/ PvP (0 = só masmorra,
// 1 = só arena, 0.5 = o "jogador equilibrado"). O resto sobra p/ a masmorra — é a
// MESMA stamina disputada, que é o ponto do design (arena=ouro, masmorra=itens).
const PVP_STA_SHARE = Number(process.env.PVP_STA_SHARE ?? 0.5)
const PVP_STA_FIGHT = Number(process.env.PVP_STA_FIGHT ?? 20) // stamina gasta por luta (golpes: ~12 ações × ~1.7⚡)
const PVP_WINRATE = Number(process.env.PVP_WINRATE ?? 0.5)    // matchmaking justo: 50%
const PVP_FLAWLESS = Number(process.env.PVP_FLAWLESS ?? 0.15) // % das vitórias sem tomar dano
// 🔧 Desgaste na arena, em "abates-equivalentes" por luta (durability.ts, aplicado em
// battle/rewards). Sem ele a arena é a única atividade SEM custo operacional e domina:
// o sim mostrava +15 em 15d p/ quem só luta vs 18d p/ quem só masmorra. PVP_WEAR=0
// mede o contrafactual (como era antes de 2026-07-15).
const PVP_WEAR_KILLS = Number(process.env.PVP_WEAR ?? PVP_FIGHT_WEAR_KILLS)
const REVIVE = Number(process.env.REVIVE ?? 0.7)        // % das quedas cobertas (segue a run)
const EXPANSIONS = Number(process.env.EXPANSIONS ?? 2)  // expansões de inventário/char (1000g cada, amortizado)
const CSV = process.env.CSV === '1'

// Stamina real: Character.maxStamina default 100 (prisma) + regen 2/15min (staminaSystem)
const STAMINA_CAP = 100
const STAMINA_REGEN_DAY = 192
const DAY_BUDGET = Math.floor((STAMINA_CAP + STAMINA_REGEN_DAY) * UTIL) // 219 (farm sim)

const dungeon: DungeonDef = DUNGEON_LIST.find((d) => d.id === DUNGEON_ID)!
if (!dungeon) throw new Error(`masmorra desconhecida: ${DUNGEON_ID}`)

// ---------------- Preços (catálogo real) ----------------
function goldValueOf(name: string): number {
  const cat = getCatalogItemByName(name); if (cat) return cat.goldPrice
  const con = getConsumableByName(name); if (con) return con.goldPrice
  const ing = getIngredientByName(name); if (ing) return ing.goldValue
  const mat = getForgeMaterialByName(name); if (mat) return mat.goldValue
  const seed = getSeedByName(name); if (seed) return seed.goldValue
  return 5
}
// Fração de venda REAL (sellPricing, P0): consumível pronto 25%, insumo/gear 50%.
function sellValueOf(name: string): number {
  const con = getConsumableByName(name)
  const isCraftInput = !!(getIngredientByName(name) || getForgeMaterialByName(name) || getSeedByName(name))
  const frac = con && !isCraftInput ? SELL_FRACTION_CONSUMABLE : SELL_FRACTION_CRAFT_INPUT
  return Math.floor(goldValueOf(name) * frac)
}

// Receitas reais usadas nas políticas
const VIDA = POTION_RECIPES.find((r) => r.outputName === 'Poção de Vida')!
const REFINO_ARMA = PROCESSING_RECIPES.find((r) => r.outputName === 'Pedra Negra (Arma)')!
const REFINO_ARMADURA = PROCESSING_RECIPES.find((r) => r.outputName === 'Pedra Negra (Armadura)')!
// custo da cópia p/ reparo: receita comum de forja (fee + valor de mercado dos materiais)
const COPY_RECIPE = FORGE_RECIPES.find((r) => r.outputName === 'Espada de Recruta')!
const COPY_COST = COPY_RECIPE.goldCost + COPY_RECIPE.materials.reduce((s, m) => s + goldValueOf(m.name) * m.quantity, 0)

// ---------------- Estado ----------------
interface Char {
  level: number; xp: number
  pieces: number[]            // nível de aprimoramento das 6 peças (arma = [0])
  fsWeapon: number; fsArmor: number
  gatherLevel: number; gatherXp: number
  farmLevel: number; farmXp: number
  wearWeapon: number; wearArmor: number // pontos de desgaste acumulados
}
interface Vault {
  gold: number
  shardsW: number; shardsA: number
  stonesW: number; stonesA: number
  items: Map<string, number>   // ingredientes/materiais/sementes/consumíveis por nome
  potions: number              // Poções de Vida prontas
}
interface Ledger {
  // faucets
  dgGold: number; dgKillGold: number; pvpGold: number; sellGold: number
  // sinks
  potCraftFee: number; potBuy: number; refineFee: number; repair: number; expansion: number
  marketBuy: number; stonesBought: number // 🏪 ouro → pedra no marketplace P2P
  // contadores
  runs: number; kills: number; bossKills: number
  staminaDungeon: number; staminaGather: number; staminaFarm: number; staminaPvp: number
  goldFromDungeonActivity: number // p/ gold-por-stamina
  goldFromGatherSell: number; goldFromFarmSell: number
  xpDungeon: number; xpPvp: number; fights: number
  stonesGained: number; shardsGained: number // ⚖️ o que a masmorra entrega ALÉM do ouro
  capHitDays: number
  sellByKind: Map<string, number>
}
const newLedger = (): Ledger => ({
  dgGold: 0, dgKillGold: 0, pvpGold: 0, sellGold: 0,
  potCraftFee: 0, potBuy: 0, refineFee: 0, repair: 0, expansion: 0,
  marketBuy: 0, stonesBought: 0,
  runs: 0, kills: 0, bossKills: 0,
  staminaDungeon: 0, staminaGather: 0, staminaFarm: 0, staminaPvp: 0,
  goldFromDungeonActivity: 0, goldFromGatherSell: 0, goldFromFarmSell: 0,
  xpDungeon: 0, xpPvp: 0, fights: 0, stonesGained: 0, shardsGained: 0,
  capHitDays: 0, sellByKind: new Map(),
})

// ⚖️ Valor de mercado da pedra (STONE_META): loja 250/220, venda 150/130 — o preço P2P
// fica no meio. É a régua p/ comparar "itens da masmorra" com "ouro da arena".
const STONE_MARKET_GOLD = Number(process.env.STONE_GOLD ?? 200)
// 🏪 Marketplace P2P ligado? (MARKET=1). É a hipótese central do design: quem faz arena
// compra pedra com ouro de quem masmorra. Default 0 = mede o pior caso (sem liquidez).
const MARKET = process.env.MARKET === '1'
const MARKET_GOLD_RESERVE = Number(process.env.MARKET_RESERVE ?? 1500) // caixa p/ poções/reparo

const addItem = (v: Vault, name: string, qty = 1) => v.items.set(name, (v.items.get(name) ?? 0) + qty)
const takeItem = (v: Vault, name: string, qty: number): boolean => {
  const have = v.items.get(name) ?? 0
  if (have < qty) return false
  v.items.set(name, have - qty); return true
}

// ---------------- Heurística de combate (validada nos sims de PvE) ----------------
function defeatChance(c: Char, isBoss: boolean): number {
  const avgEnh = c.pieces.reduce((s, p) => s + p, 0) / c.pieces.length
  if (isBoss) return Math.min(0.95, Math.max(0.2, 0.9 - 0.08 * (c.level - 1) - 0.03 * avgEnh))
  return Math.max(0.02, 0.12 - 0.01 * c.level)
}
function gainXp(c: Char, xp: number) {
  c.xp += xp
  while (c.level < 50 && c.xp >= getXPForNextLevel(c.level)) { c.xp -= getXPForNextLevel(c.level); c.level++ }
}
function gainProfXp(kind: 'gather' | 'farm', c: Char, xp: number) {
  if (kind === 'gather') {
    c.gatherXp += xp
    while (c.gatherLevel < PROFESSION_MAX_LEVEL && c.gatherXp >= professionXpForLevel(c.gatherLevel + 1)) c.gatherLevel++
  } else {
    c.farmXp += xp
    while (c.farmLevel < PROFESSION_MAX_LEVEL && c.farmXp >= professionXpForLevel(c.farmLevel + 1)) c.farmLevel++
  }
}

// ---------------- Espólio → cofre (com política de venda) ----------------
// Equipamento: guarda até formar o set (6 peças/char em aprimoramento); excedente VENDE.
// Pedra/estilhaço: NUNCA vende (motor do aprimoramento). Resto: consome ou vende no fim do dia.
function absorbDrops(v: Vault, led: Ledger, drops: LootDrop[], c: Char | null, capLeft: { v: number }) {
  for (const d of drops) {
    if (d.kind === 'stone') {
      if (d.name.includes('(Arma)')) v.stonesW++; else v.stonesA++
      led.stonesGained++
    } else if (d.name.startsWith('Estilhaço de Pedra Negra')) {
      led.shardsGained++
      if (d.name.includes('(Arma)')) v.shardsW++; else v.shardsA++
    } else if (d.kind === 'item') {
      // gear cai JÁ aprimorado (floresta +4..+7, rollDropEnhancement): se supera a
      // peça mais fraca do set, EQUIPA (o farm real progride assim); senão VENDE.
      const enh = Math.max(0, Number((d as any).enhancement) || 0)
      if (c && enh > 0) {
        const weakest = c.pieces.indexOf(Math.min(...c.pieces))
        if (enh > c.pieces[weakest]) { c.pieces[weakest] = enh; continue }
      }
      // P0: venda dentro do teto diário (rota real BLOQUEIA sem teto; aqui o item fica sem vender)
      const gv = Math.floor(goldValueOf(d.name) * 0.5) // gear vende a 50%
      if (capLeft.v < gv) continue
      capLeft.v -= gv
      v.gold += gv; led.sellGold += gv; led.goldFromDungeonActivity += gv
      led.sellByKind.set('gear', (led.sellByKind.get('gear') ?? 0) + gv)
    } else if (d.name === 'Poção de Vida' || d.name === 'Poção de Vida Pequena') {
      v.potions++ // dropou poção de cura: USA antes de craftar/comprar (não vende)
    } else {
      addItem(v, d.name)
    }
  }
}

// ---------------- Uma RUN (trilha real do servidor) ----------------
function runDungeon(v: Vault, led: Ledger, c: Char, capLeft: { v: number }, bossesToday: { n: number }): number {
  const trail = buildTrail(dungeon)
  const meAsRun: CharacterForRun = { id: 'sim', level: c.level, race: 'elfo', class: 'rogue' }
  let stamina = 0

  const credit = (gold: number, isKill: boolean) => {
    const give = Math.max(0, Math.min(gold, capLeft.v))
    capLeft.v -= give
    v.gold += give
    led.dgGold += give; if (isKill) led.dgKillGold += give
    led.goldFromDungeonActivity += give
  }

  for (let idx = 1; idx < trail.length; idx++) {
    const node = trail[idx]
    const cost = STEP_COST[node.kind as keyof typeof STEP_COST] ?? 4
    stamina += cost

    let pending: RunPending | null = null
    if (node.kind === 'boss') {
      pending = resolveBossNode(dungeon, meAsRun, idx)
    } else {
      const r = resolveExploreNode(dungeon, meAsRun, node, idx)
      if (r.type === 'find') {
        credit(r.loot.gold, false)
        absorbDrops(v, led, r.loot.drops, c, capLeft)
        continue
      }
      pending = r.pending
    }

    // combate: abate a abate (goldReward/xpReward reais do scaleMonster)
    const isBoss = node.kind === 'boss'
    let fell = false
    for (const m of pending.monsters as ScaledMonster[]) {
      if (Math.random() < defeatChance(c, isBoss)) {
        if (Math.random() < REVIVE) continue // coberto: tenta o próximo do pacote
        fell = true; break
      }
      led.kills++
      if (isBoss) {
        led.bossKills++
        // 🌅 bônus dos primeiros bosses do dia da CONTA (rota combat)
        if (bossesToday.n < FIRST_BOSS_BONUS.bossesPerDay) absorbDrops(v, led, firstBossBonusStones(), c, capLeft)
        bossesToday.n++
      }
      credit(m.goldReward, true)
      gainXp(c, m.xpReward); led.xpDungeon += m.xpReward
      // drop POR ABATE (mesma chamada da rota dungeon/run/combat): estilhaço 40/60% + boss 1-3 Pedras
      absorbDrops(v, led, rollKillLoot(pending.kind, isBoss, dungeon.difficultyStars), c, capLeft)
      // desgaste real (durability.ts): arma −2/abate (boss ×2), 5 peças −1
      c.wearWeapon += isBoss ? 4 : 2
      c.wearArmor += (isBoss ? 2 : 1) * 5
      pending.killedIds!.push(m.id)
    }
    if (fell) break // caiu sem cobertura: a run termina aqui

    if (pending.killedIds!.length === pending.monsters.length) {
      const loot = rollCombatLoot(dungeon, meAsRun, pending)
      credit(loot.gold, false)
      absorbDrops(v, led, loot.drops, c, capLeft)
    }
  }
  return stamina
}

// ---------------- Fim de dia: crafts, aprimoramento, vendas ----------------
function refineAll(v: Vault, led: Ledger) {
  const doRefine = (shards: 'shardsW' | 'shardsA', stones: 'stonesW' | 'stonesA', fee: number) => {
    while (v[shards] >= 10 && v.gold >= fee) {
      v[shards] -= 10; v[stones]++; v.gold -= fee; led.refineFee += fee
    }
  }
  doRefine('shardsW', 'stonesW', REFINO_ARMA.goldCost)
  doRefine('shardsA', 'stonesA', REFINO_ARMADURA.goldCost)
}

function craftOrBuyPotions(v: Vault, led: Ledger, needed: number) {
  const potPrice = goldValueOf('Poção de Vida')
  while (v.potions < needed) {
    // craft-first: receita real (ingredientes do cofre + taxa)
    const canCraft = VIDA.ingredients.every((i) => (v.items.get(i.name) ?? 0) >= i.quantity)
    if (canCraft && v.gold >= VIDA.goldCost) {
      VIDA.ingredients.forEach((i) => takeItem(v, i.name, i.quantity))
      v.gold -= VIDA.goldCost; led.potCraftFee += VIDA.goldCost
      v.potions++
    } else if (v.gold >= potPrice) {
      v.gold -= potPrice; led.potBuy += potPrice
      v.potions++
    } else break
  }
}

function payRepairs(v: Vault, led: Ledger, c: Char) {
  // 25 pts de durabilidade por cópia; cópia = craft comum (fee + materiais a mercado)
  const copies = Math.floor(c.wearWeapon / 25) + Math.floor(c.wearArmor / 25)
  if (copies <= 0) return
  const cost = Math.min(v.gold, copies * COPY_COST)
  v.gold -= cost; led.repair += cost
  c.wearWeapon %= 25; c.wearArmor %= 25
}

// aprimora as peças do char (arma usa pedra de arma; 5 peças usam de armadura)
function enhance(v: Vault, c: Char) {
  const tryPiece = (i: number) => {
    if (c.pieces[i] >= 15) return false
    const isW = i === 0
    const stones = isW ? 'stonesW' as const : 'stonesA' as const
    if (v[stones] <= 0) return false
    v[stones]--
    const target = c.pieces[i] + 1
    if (target <= 7) { c.pieces[i] = target; return true } // garantido
    const cat = isW ? 'WEAPON' : 'ARMOR'
    const fs = isW ? c.fsWeapon : c.fsArmor
    if (Math.random() < getEnhanceChance(cat as any, target, fs)) {
      c.pieces[i] = target
      if (isW) c.fsWeapon = 0; else c.fsArmor = 0
    } else {
      const gain = getFailstackGainOnFail(target)
      if (isW) c.fsWeapon += gain; else c.fsArmor += gain
    }
    return true
  }
  // política: sempre a peça mais fraca (mantém o set parelho — igual farm sim)
  for (let guard = 0; guard < 200; guard++) {
    const order = c.pieces.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0])
    let acted = false
    for (const [, i] of order) { if (tryPiece(i)) { acted = true; break } }
    if (!acted) break
  }
}

// 🏪 MARKETPLACE (MARKET=1): o jogador da arena converte OURO em PEDRA comprando de
// quem masmorra. É a peça que fecha o design da especialização — sem uma ponta
// vendendo pedra, quem escolhe a arena nunca fecha o +15 por mais ouro que junte.
// Liquidez infinita = cenário OTIMISTA (mostra o teto, não a realidade do day-1).
function buyStonesFromMarket(v: Vault, led: Ledger, chars: Char[]) {
  if (!MARKET) return
  const needsW = chars.some((c) => c.pieces[0] < 15)
  const needsA = chars.some((c) => c.pieces.slice(1).some((p) => p < 15))
  let guard = 0
  while (v.gold >= STONE_MARKET_GOLD + MARKET_GOLD_RESERVE && guard++ < 500) {
    // 1 arma : 5 armaduras — a proporção real do set (mesma lógica do STONE_WEAPON_SHARE)
    const buyW = needsW && (!needsA || guard % 6 === 0)
    if (!buyW && !needsA) break
    if (buyW) v.stonesW++; else v.stonesA++
    v.gold -= STONE_MARKET_GOLD
    led.marketBuy += STONE_MARKET_GOLD
    led.stonesBought++
  }
}

function sellSurplus(v: Vault, led: Ledger, potIngredientBuffer: number, capLeft: { v: number }) {
  // ⚠️ Map.forEach (não for..of): target es5 sem downlevelIteration NÃO itera Map em for..of.
  v.items.forEach((qty, name) => {
    if (qty <= 0) return
    // segura ingredientes da poção de vida (buffer p/ craft) e sementes (fazenda)
    const isPotIng = VIDA.ingredients.some((i) => i.name === name)
    const isSeed = !!getSeedByName(name)
    const keep = isPotIng ? potIngredientBuffer : isSeed ? qty : 0
    let sell = Math.max(0, qty - keep)
    if (sell <= 0) return
    // P0: teto diário limita quantas unidades o ferreiro compra hoje (resto fica p/ amanhã)
    const unit = sellValueOf(name)
    if (unit > 0) sell = Math.min(sell, Math.floor(capLeft.v / unit))
    if (sell <= 0) return
    const gv = unit * sell
    capLeft.v -= gv
    v.gold += gv; led.sellGold += gv
    const ing = getIngredientByName(name)
    const mat = getForgeMaterialByName(name)
    const kind = ing ? 'ingrediente' : mat ? 'material' : 'consumível'
    led.sellByKind.set(kind, (led.sellByKind.get(kind) ?? 0) + gv)
    v.items.set(name, qty - sell)
  })
}

// ---------------- Coleta e fazenda (geradores reais) ----------------
function gatherDay(v: Vault, led: Ledger, c: Char, field: GatherFieldId, budget: number): number {
  const ticks = Math.floor(budget / GATHER_TICK_STAMINA)
  if (ticks <= 0) return 0
  const y = rollGatherYield(field, c.gatherLevel, ticks)
  let gv = 0
  for (const d of y.drops) {
    if (d.name.startsWith('Estilhaço de Pedra Negra')) {
      if (d.name.includes('(Arma)')) v.shardsW += d.qty; else v.shardsA += d.qty
    } else {
      addItem(v, d.name, d.qty)
      gv += sellValueOf(d.name) * d.qty // valor potencial (a venda real acontece no surplus)
    }
  }
  led.goldFromGatherSell += gv
  gainProfXp('gather', c, y.xp)
  return ticks * GATHER_TICK_STAMINA
}

function farmDay(v: Vault, led: Ledger, c: Char): number {
  let stamina = 0
  const activeHours = 24 * UTIL
  const plots = farmPlotCount(c.farmLevel)
  // mix: metade erva (poção), metade trigo (ração/venda); linho se sobrar semente
  const mix: Array<keyof typeof CROPS> = []
  for (let i = 0; i < plots; i++) mix.push(i % 2 === 0 ? 'erva' : 'trigo')
  for (const cropId of mix) {
    const crop = CROPS[cropId]
    if (!takeItem(v, crop.seedName, 1)) continue
    const cycles = Math.max(1, Math.floor((activeHours * 3600) / cropGrowSeconds(crop, c.farmLevel)))
    for (let k = 0; k < cycles; k++) {
      // replantio dentro do dia consome mais sementes
      if (k > 0 && !takeItem(v, crop.seedName, 1)) break
      const qty = rollCropYield(crop, c.farmLevel)
      addItem(v, crop.outputName, qty)
      led.goldFromFarmSell += sellValueOf(crop.outputName) * qty
      gainProfXp('farm', c, crop.farmXp)
      stamina += FARM_ACTION_STAMINA * 2 // plantar + colher
    }
  }
  // poço: 1 Água por pull (−1⚡); ~2 visitas/dia no teto (12 águas cada)
  const waters = Math.min(WELL.cap * 2, Math.floor((activeHours * 3600) / WELL.intervalSeconds))
  if (waters > 0) {
    addItem(v, WELL.outputName, waters)
    // Purifica na bancada (1 Água → 1 Água Pura) para o restante do craft
    const purify = PROCESSING_RECIPES.find((r) => r.id === 'proc_agua_pura')
    const purifyCost = purify ? purify.goldCost * waters : Infinity
    if (purify && v.gold >= purifyCost && takeItem(v, WELL.outputName, waters)) {
      v.gold -= purifyCost
      led.potCraftFee += purifyCost
      addItem(v, purify.outputName, waters)
      led.goldFromFarmSell += sellValueOf(purify.outputName) * waters
    } else {
      led.goldFromFarmSell += sellValueOf(WELL.outputName) * waters
    }
    gainProfXp('farm', c, WELL.farmXpPerCollect * waters)
    stamina += WELL_COLLECT_STAMINA * waters
  }
  // cercado (nv5+): 1 ciclo/dia se houver Ração (craft real a partir de Trigo via PROCESSAMENTO)
  if (c.farmLevel >= 5) {
    const racao = PROCESSING_RECIPES.find((r) => r.outputName === 'Ração')
    if (racao && racao.inputs.every((i) => (v.items.get(i.name) ?? 0) >= i.quantity) && v.gold >= racao.goldCost) {
      racao.inputs.forEach((i) => takeItem(v, i.name, i.quantity))
      v.gold -= racao.goldCost; led.potCraftFee += racao.goldCost
      addItem(v, PEN.outputName, PEN.yield)
      led.goldFromFarmSell += sellValueOf(PEN.outputName) * PEN.yield
      gainProfXp('farm', c, PEN.farmXp)
      stamina += FARM_ACTION_STAMINA * 2
    }
  }
  return stamina
}

// ---------------- ⚔️ ARENA (PvP) ----------------
// Modelo REAL: calculatePvpStaminaRewards (src/lib/pvpRewards.ts) — pool = a stamina
// que os DOIS gastaram, split 70/30 win/loss. Zero constante duplicada aqui.
//
// 🎲 Design (2026-07-15): a arena paga OURO + XP e NADA MAIS — os jogadores apostam e
// o governo paga; dropar item numa arena não faz sentido. A masmorra é quem paga em
// ITENS. As duas disputam a MESMA stamina, então o equilíbrio é ouro/stamina.
//
// O oponente é espelho (mesmo nível, mesma stamina por luta): matchmaking justo, sem
// underdog/bully. Cada luta gasta PVP_STA_FIGHT do MEU orçamento; o pool inclui a
// stamina do oponente, e é por isso que com 50% de winrate cada lado recebe de volta
// exatamente o que gastou (0.5×0.7 + 0.5×0.3 = 0.5 do pool = a própria stamina).
function pvpDay(
  v: Vault, led: Ledger, c: Char, budget: number,
  capLeft: { v: number }, winsToday: { n: number },
): number {
  // Luta abaixo do piso não gera faucet nenhum (a rota devolve `below_min_stamina`),
  // então nem simula.
  if (PVP_STA_FIGHT < PVP_MIN_ENTRY_STAMINA) return 0
  let spent = 0
  while (budget - spent >= PVP_STA_FIGHT) {
    const mySta = PVP_STA_FIGHT
    const oppSta = PVP_STA_FIGHT
    const iWon = Math.random() < PVP_WINRATE
    const firstWin = iWon && winsToday.n === 0
    const calc = calculatePvpStaminaRewards({
      winnerStaminaSpent: iWon ? mySta : oppSta,
      loserStaminaSpent: iWon ? oppSta : mySta,
      isFlawless: iWon && Math.random() < PVP_FLAWLESS,
      isFirstWinOfDay: firstWin,
      winnerLevel: c.level,
      loserLevel: c.level, // espelho: sem underdog/bully
    })
    const mine = iWon ? calc.winner : calc.loser
    if (iWon) winsToday.n++

    // teto diário compartilhado com a masmorra (a rota real clampa igual)
    const give = Math.max(0, Math.min(mine.gold, capLeft.v))
    capLeft.v -= give
    v.gold += give
    led.pvpGold += give
    gainXp(c, mine.xp); led.xpPvp += mine.xp
    // 🔧 desgaste da luta (wearForPvpFight: arma −2/abate-equiv, cada uma das 5 peças −1)
    c.wearWeapon += WEAR_WEAPON_PER_KILL * PVP_WEAR_KILLS
    c.wearArmor += WEAR_GEAR_PER_KILL * PVP_WEAR_KILLS * 5
    led.fights++
    spent += mySta
  }
  return spent
}

// ---------------- Loop principal ----------------
interface TrialResult {
  led: Ledger
  daysToMainFull: number | null
  daysToAllFull: number | null
  finalLevelMain: number
  goldFinal: number
}

function simulateAccount(nChars: number): TrialResult {
  const chars: Char[] = Array.from({ length: nChars }, () => ({
    level: 1, xp: 0, pieces: [0, 0, 0, 0, 0, 0].map(() => 1), // set base equipado no dia 0
    fsWeapon: 0, fsArmor: 0,
    gatherLevel: 1, gatherXp: 0, farmLevel: 1, farmXp: 0,
    wearWeapon: 0, wearArmor: 0,
  }))
  const v: Vault = { gold: 0, shardsW: 0, shardsA: 0, stonesW: 0, stonesA: 0, items: new Map(), potions: 0 }
  const led = newLedger()
  // expansão de inventário: sink one-off no início (1000g × EXPANSIONS × char, pago quando der)
  let expansionDebt = EXPANSIONS * 1000 * nChars

  // alocação: 1 coletor fixo quando N≥3 (ervas p/ poção), resto masmorra;
  // N≥5: 2º coletor em minérios (estilhaço). Fazenda = overhead do coletor/char 1.
  const gatherers = process.env.GATHERERS !== undefined
    ? Math.min(Number(process.env.GATHERERS), Math.max(0, nChars - 1))
    : nChars >= 5 ? 2 : nChars >= 3 ? 1 : 0
  let daysToMainFull: number | null = null
  let daysToAllFull: number | null = null

  for (let day = 1; day <= DAYS; day++) {
    const capLeft = { v: DAILY_GOLD_CAP }
    const bossesToday = { n: 0 }
    let capWasHit = false

    chars.forEach((c, i) => {
      let budget = DAY_BUDGET
      if (i === 0) { const s = farmDay(v, led, c); budget -= s; led.staminaFarm += s }
      if (i < gatherers && nChars >= 3) {
        const field: GatherFieldId = i === 0 ? 'ervas' : 'minerios'
        const s = gatherDay(v, led, c, field, budget)
        led.staminaGather += s
        return
      }
      // ⚔️ ARENA primeiro: consome PVP_STA_SHARE do orçamento; a masmorra fica com o resto.
      // É a escolha do jogador (arena=ouro, masmorra=itens) disputando a MESMA stamina.
      if (PVP_STA_SHARE > 0) {
        const winsToday = { n: 0 }
        const s = pvpDay(v, led, c, Math.floor(budget * PVP_STA_SHARE), capLeft, winsToday)
        budget -= s; led.staminaPvp += s
      }
      // masmorra: runs até o orçamento acabar
      while (budget >= 30) { // custo mínimo de uma run parcial útil
        craftOrBuyPotions(v, led, POTS_RUN)
        v.potions = Math.max(0, v.potions - POTS_RUN)
        const spent = runDungeon(v, led, c, capLeft, bossesToday)
        led.staminaDungeon += spent
        led.runs++
        budget -= Math.max(spent, 20)
        if (capLeft.v <= 0) { capWasHit = true; break }
      }
      payRepairs(v, led, c)
    })

    refineAll(v, led)
    buyStonesFromMarket(v, led, chars) // 🏪 ouro da arena → pedra (fecha a especialização)
    // pedras no MAIN primeiro (maior nível), depois os alts — política do farm rotativo
    ;[...chars].sort((a, b) => b.level - a.level).forEach((c) => enhance(v, c))
    sellSurplus(v, led, 12, capLeft)
    if (expansionDebt > 0 && v.gold > 2000) {
      const pay = Math.min(expansionDebt, 1000)
      v.gold -= pay; expansionDebt -= pay; led.expansion += pay
    }
    if (capWasHit) led.capHitDays++

    const full = (c: Char) => c.pieces.every((p) => p >= 15)
    if (daysToMainFull === null && full(chars[gatherers] ?? chars[0])) daysToMainFull = day
    if (daysToAllFull === null && chars.every(full)) daysToAllFull = day
  }

  return {
    led, daysToMainFull, daysToAllFull,
    finalLevelMain: (chars[gatherers] ?? chars[0]).level,
    goldFinal: v.gold,
  }
}

// ---------------- Agregação e relatório ----------------
const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const per = (n: number, d: number) => (d > 0 ? ((100 * n) / d).toFixed(0) + '%' : '—')

console.log('💰 DOLRATH — SIMULADOR ECONÔMICO UNIFICADO (geradores reais do jogo)')
console.log(`   masmorra ${dungeon.id} · ${DAYS} dias · ${TRIALS} trials · seed ${SEED} · budget ${DAY_BUDGET} stamina/char/dia`)
console.log(`   políticas: venda 25% consumível / 50% resto (P0, dentro do cap) · poções/run ${POTS_RUN} (craft-first) · cap diário ${fmt(DAILY_GOLD_CAP)}`)
console.log(`   ⚔️ arena: ${(PVP_STA_SHARE * 100).toFixed(0)}% da stamina · ${PVP_STA_FIGHT}⚡/luta · winrate ${(PVP_WINRATE * 100).toFixed(0)}% (arena=ouro+xp, masmorra=itens)`)
console.log('')

const csvRows: string[] = ['chars,faucet_total_dia,dungeon_chao,dungeon_abate,venda,pvp,sink_total_dia,pocoes,refino,reparo,expansao,net_dia,gpstam_dungeon,gpstam_coleta,gpstam_fazenda,dias_main_full,dias_all_full']

for (const n of CHAR_COUNTS) {
  const acc = { faucet: 0, dgChao: 0, dgKill: 0, sell: 0, pvp: 0, sink: 0, pots: 0, refine: 0, repair: 0, exp: 0, gsDg: 0, gsGa: 0, gsFa: 0, gsPvp: 0, vsDg: 0, stonesDay: 0, xsDg: 0, xsPvp: 0, market: 0, stonesBought: 0, mainFull: [] as number[], allFull: [] as number[], lvl: 0, capDays: 0, kills: 0, runs: 0, fights: 0 }
  const sellKinds = new Map<string, number>()

  for (let t = 0; t < TRIALS; t++) {
    Math.random = mulberry32(SEED + t * 7919 + n * 104729)
    const r = simulateAccount(n)
    const L = r.led
    const chao = L.dgGold - L.dgKillGold
    const faucet = L.dgGold + L.sellGold + L.pvpGold
    // 🏪 marketBuy NÃO é sink de economia (o ouro vai p/ outro jogador, não some) —
    // mas é gasto do bolso deste jogador, então entra no net dele.
    const sink = L.potCraftFee + L.potBuy + L.refineFee + L.repair + L.expansion + L.marketBuy
    acc.faucet += faucet / DAYS
    acc.dgChao += chao / DAYS; acc.dgKill += L.dgKillGold / DAYS
    acc.sell += L.sellGold / DAYS; acc.pvp += L.pvpGold / DAYS
    acc.sink += sink / DAYS
    acc.pots += (L.potCraftFee + L.potBuy) / DAYS; acc.refine += L.refineFee / DAYS
    acc.market += L.marketBuy / DAYS; acc.stonesBought += L.stonesBought / DAYS
    acc.repair += L.repair / DAYS; acc.exp += L.expansion / DAYS
    acc.gsDg += L.staminaDungeon > 0 ? L.goldFromDungeonActivity / L.staminaDungeon : 0
    acc.gsGa += L.staminaGather > 0 ? L.goldFromGatherSell / L.staminaGather : 0
    acc.gsFa += L.staminaFarm > 0 ? L.goldFromFarmSell / L.staminaFarm : 0
    acc.gsPvp += L.staminaPvp > 0 ? L.pvpGold / L.staminaPvp : 0
    acc.fights += L.fights
    // ⚖️ VALOR/stamina da masmorra = ouro + as pedras que ela retém (a preço P2P).
    // É esta régua — não o ouro sozinho — que a arena precisa igualar, já que ela
    // não entrega item nenhum.
    const stoneEq = L.stonesGained + L.shardsGained / 10
    acc.stonesDay += stoneEq / DAYS
    acc.xsDg += L.staminaDungeon > 0 ? L.xpDungeon / L.staminaDungeon : 0
    acc.xsPvp += L.staminaPvp > 0 ? L.xpPvp / L.staminaPvp : 0
    acc.vsDg += L.staminaDungeon > 0 ? (L.goldFromDungeonActivity + stoneEq * STONE_MARKET_GOLD) / L.staminaDungeon : 0
    if (r.daysToMainFull) acc.mainFull.push(r.daysToMainFull)
    if (r.daysToAllFull) acc.allFull.push(r.daysToAllFull)
    acc.lvl += r.finalLevelMain
    acc.capDays += L.capHitDays
    acc.kills += L.kills; acc.runs += L.runs
    L.sellByKind.forEach((gv, k) => sellKinds.set(k, (sellKinds.get(k) ?? 0) + gv / DAYS / TRIALS))
  }

  const T = TRIALS
  const med = (a: number[]) => (a.length ? a.sort((x, y) => x - y)[Math.floor(a.length / 2)] : null)
  const faucet = acc.faucet / T, sink = acc.sink / T
  const net = faucet - sink
  const mf = med(acc.mainFull), af = med(acc.allFull)

  console.log(`── ${n} personagem(ns) ─────────────────────────────────────`)
  console.log(`   FAUCET ${fmt(faucet)}/dia   →  chão ${fmt(acc.dgChao / T)} (${per(acc.dgChao / T, faucet)}) · abate ${fmt(acc.dgKill / T)} (${per(acc.dgKill / T, faucet)}) · venda ${fmt(acc.sell / T)} (${per(acc.sell / T, faucet)}) · pvp ${fmt(acc.pvp / T)} (${per(acc.pvp / T, faucet)})`)
  const kindsStr = Array.from(sellKinds.entries()).map(([k, gv]) => `${k} ${fmt(gv)}`).join(' · ')
  console.log(`     venda por tipo: ${kindsStr || '—'}`)
  console.log(`   SINK   ${fmt(sink)}/dia   →  poções ${fmt(acc.pots / T)} · refino ${fmt(acc.refine / T)} · reparo ${fmt(acc.repair / T)} · expansão ${fmt(acc.exp / T)}${MARKET ? ` · 🏪 pedra ${fmt(acc.market / T)} (${(acc.stonesBought / T).toFixed(1)}/dia)` : ''}`)
  console.log(`   NET    ${net >= 0 ? '+' : ''}${fmt(net)}/dia   (sobra p/ claim on-chain)`)
  // ⚖️ A RÉGUA DO DESIGN (2026-07-15): arena=ouro, masmorra=itens. O jogador escolhe a
  // COMPOSIÇÃO, não o valor — então este número tem que ficar ~plano em PVP_STA_SHARE
  // 0 / 0.5 / 1. Se cair conforme a arena cresce, fazer PvP é punição.
  // pedra COMPRADA entra no valor: o net já pagou por ela (marketBuy está no sink),
  // então somá-la de volta mantém a régua comparável entre MARKET=0 e MARKET=1.
  const stonesDay = acc.stonesDay / T + acc.stonesBought / T
  const totalValue = net + stonesDay * STONE_MARKET_GOLD
  console.log(`   💎 VALOR TOTAL ${fmt(totalValue)}/dia  =  net ${fmt(net)} + ${stonesDay.toFixed(1)} pedras × ${STONE_MARKET_GOLD}g   ← tem que ficar PLANO em PVP_STA_SHARE 0/0.5/1`)
  console.log(`   ⚖️ gold/stamina: dungeon ${(acc.gsDg / T).toFixed(1)} · ARENA ${(acc.gsPvp / T).toFixed(1)} · coleta ${(acc.gsGa / T).toFixed(1)} · fazenda ${(acc.gsFa / T).toFixed(1)}`)
  console.log(`   🎯 VALOR/stamina (ouro + pedras a ${STONE_MARKET_GOLD}g): dungeon ${(acc.vsDg / T).toFixed(1)} vs ARENA ${(acc.gsPvp / T).toFixed(1)}  ← a régua da escolha`)
  console.log(`      pedras-equiv/dia ${(acc.stonesDay / T).toFixed(1)} (só da masmorra)`)
  console.log(`   📈 runs/dia ${(acc.runs / T / DAYS).toFixed(1)} · lutas/dia ${(acc.fights / T / DAYS).toFixed(1)} · abates/dia ${(acc.kills / T / DAYS).toFixed(0)} · nível main d${DAYS}: ${(acc.lvl / T).toFixed(0)} · cap 20k batido em ${(acc.capDays / T).toFixed(1)} dia(s)`)
  console.log(`   📚 xp/stamina: dungeon ${(acc.xsDg / T).toFixed(1)} · ARENA ${(acc.xsPvp / T).toFixed(1)}   (nível também não pode punir quem escolhe a arena)`)
  console.log(`   🎯 set +15: main ${mf ? mf + 'd' : `>${DAYS}d`} (${acc.mainFull.length}/${T} trials) · todos ${af ? af + 'd' : `>${DAYS}d`} (${acc.allFull.length}/${T})`)
  console.log('')

  csvRows.push([n, faucet, acc.dgChao / T, acc.dgKill / T, acc.sell / T, acc.pvp / T, sink, acc.pots / T, acc.refine / T, acc.repair / T, acc.exp / T, net, acc.gsDg / T, acc.gsGa / T, acc.gsFa / T, mf ?? '', af ?? ''].map((x) => (typeof x === 'number' ? Math.round(x * 10) / 10 : x)).join(','))
}

if (CSV) {
  const fs = require('fs') as typeof import('fs')
  const path = require('path') as typeof import('path')
  const out = path.join(__dirname, '..', 'docs', 'balance')
  fs.mkdirSync(out, { recursive: true })
  fs.writeFileSync(path.join(out, 'economy-unified.csv'), csvRows.join('\n'))
  console.log(`CSV → docs/balance/economy-unified.csv`)
}
