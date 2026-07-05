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
//   • PvP: PVP_WINS/dia por conta (recompensa da battle/rewards, sem stamina)
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
  DUNGEON_LIST, scaleMonsterGroup, luckTier,
  type DungeonDef, type LootDrop, type ScaledMonster,
} from '@/lib/dungeonAdventures'
import {
  buildTrail, STEP_COST, resolveExploreNode, resolveBossNode, rollCombatLoot, rollKillLoot,
  type RunPending, type CharacterForRun,
} from '@/lib/dungeonRunServer'
import { rollGatherYield, GATHER_TICK_STAMINA, type GatherFieldId } from '@/lib/gathering'
import { CROPS, WELL, PEN, FARM_ACTION_STAMINA, cropGrowSeconds, rollCropYield } from '@/lib/farming'
import { farmPlotCount, professionXpForLevel, PROFESSION_MAX_LEVEL } from '@/lib/professionSystem'
import { getEnhanceChance, getFailstackGainOnFail } from '@/lib/enhancementSystem'
import { POTION_RECIPES } from '@/lib/alchemy'
import { FORGE_RECIPES } from '@/lib/forge'
import {
  getCatalogItemByName, getConsumableByName, getIngredientByName,
  getForgeMaterialByName, getSeedByName,
} from '@/lib/itemCatalog'
import { getXPForNextLevel } from '@/lib/experienceSystem'

// ---------------- Parâmetros ----------------
const DAYS = Number(process.env.DAYS ?? 30)
const TRIALS = Number(process.env.TRIALS ?? 25)
const CHAR_COUNTS = String(process.env.CHARS ?? '1,3,5,10').split(',').map(Number)
const DUNGEON_ID = String(process.env.DUNGEON ?? 'floresta')
const UTIL = Number(process.env.UTIL ?? 0.75)           // fração do dia jogada (farm sim: 0.75)
const DAILY_GOLD_CAP = Number(process.env.CAP ?? 20000) // dungeonDailyGoldCap default
const POTS_RUN = Number(process.env.POTS_RUN ?? 4)      // poções de vida consumidas por run
const PVP_WINS = Number(process.env.PVP_WINS ?? 2)      // vitórias PvP/dia por conta
const REVIVE = Number(process.env.REVIVE ?? 0.7)        // % das quedas cobertas (segue a run)
const SELL_FRACTION = 0.6                               // sellPrice do catálogo (60% do valor)
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
const sellValueOf = (name: string) => Math.floor(goldValueOf(name) * SELL_FRACTION)

// Receitas reais usadas nas políticas
const VIDA = POTION_RECIPES.find((r) => r.outputName === 'Poção de Vida')!
const REFINO_ARMA = FORGE_RECIPES.find((r) => r.outputName === 'Pedra Negra (Arma)')!
const REFINO_ARMADURA = FORGE_RECIPES.find((r) => r.outputName === 'Pedra Negra (Armadura)')!
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
  // contadores
  runs: number; kills: number; bossKills: number
  staminaDungeon: number; staminaGather: number; staminaFarm: number
  goldFromDungeonActivity: number // p/ gold-por-stamina
  goldFromGatherSell: number; goldFromFarmSell: number
  xpDungeon: number
  capHitDays: number
  sellByKind: Map<string, number>
}
const newLedger = (): Ledger => ({
  dgGold: 0, dgKillGold: 0, pvpGold: 0, sellGold: 0,
  potCraftFee: 0, potBuy: 0, refineFee: 0, repair: 0, expansion: 0,
  runs: 0, kills: 0, bossKills: 0,
  staminaDungeon: 0, staminaGather: 0, staminaFarm: 0,
  goldFromDungeonActivity: 0, goldFromGatherSell: 0, goldFromFarmSell: 0,
  xpDungeon: 0, capHitDays: 0, sellByKind: new Map(),
})

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
function absorbDrops(v: Vault, led: Ledger, drops: LootDrop[], c: Char | null) {
  for (const d of drops) {
    if (d.kind === 'stone') {
      if (d.name.includes('(Arma)')) v.stonesW++; else v.stonesA++
    } else if (d.name.startsWith('Estilhaço de Pedra Negra')) {
      if (d.name.includes('(Arma)')) v.shardsW++; else v.shardsA++
    } else if (d.kind === 'item') {
      // gear cai JÁ aprimorado (floresta +4..+7, rollDropEnhancement): se supera a
      // peça mais fraca do set, EQUIPA (o farm real progride assim); senão VENDE.
      const enh = Math.max(0, Number((d as any).enhancement) || 0)
      if (c && enh > 0) {
        const weakest = c.pieces.indexOf(Math.min(...c.pieces))
        if (enh > c.pieces[weakest]) { c.pieces[weakest] = enh; continue }
      }
      const gv = sellValueOf(d.name)
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
function runDungeon(v: Vault, led: Ledger, c: Char, capLeft: { v: number }): number {
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
        absorbDrops(v, led, r.loot.drops, c)
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
      led.kills++; if (isBoss) led.bossKills++
      credit(m.goldReward, true)
      gainXp(c, m.xpReward); led.xpDungeon += m.xpReward
      // drop POR ABATE (mesma chamada da rota dungeon/run/combat): estilhaço 40/60% + boss 1-3 Pedras
      absorbDrops(v, led, rollKillLoot(pending.kind, isBoss), c)
      // desgaste real (durability.ts): arma −2/abate (boss ×2), 5 peças −1
      c.wearWeapon += isBoss ? 4 : 2
      c.wearArmor += (isBoss ? 2 : 1) * 5
      pending.killedIds!.push(m.id)
    }
    if (fell) break // caiu sem cobertura: a run termina aqui

    if (pending.killedIds!.length === pending.monsters.length) {
      const loot = rollCombatLoot(dungeon, meAsRun, pending)
      credit(loot.gold, false)
      absorbDrops(v, led, loot.drops, c)
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

function sellSurplus(v: Vault, led: Ledger, potIngredientBuffer: number) {
  // ⚠️ Map.forEach (não for..of): target es5 sem downlevelIteration NÃO itera Map em for..of.
  v.items.forEach((qty, name) => {
    if (qty <= 0) return
    // segura ingredientes da poção de vida (buffer p/ craft) e sementes (fazenda)
    const isPotIng = VIDA.ingredients.some((i) => i.name === name)
    const isSeed = !!getSeedByName(name)
    const keep = isPotIng ? potIngredientBuffer : isSeed ? qty : 0
    const sell = Math.max(0, qty - keep)
    if (sell <= 0) return
    const gv = sellValueOf(name) * sell
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
      const qty = rollCropYield(crop)
      addItem(v, crop.outputName, qty)
      led.goldFromFarmSell += sellValueOf(crop.outputName) * qty
      gainProfXp('farm', c, crop.farmXp)
      stamina += FARM_ACTION_STAMINA * 2 // plantar + colher
    }
  }
  // poço: 2 visitas/dia no teto (12 águas cada)
  const waters = Math.min(WELL.cap * 2, Math.floor((activeHours * 3600) / WELL.intervalSeconds))
  if (waters > 0) {
    addItem(v, WELL.outputName, waters)
    led.goldFromFarmSell += sellValueOf(WELL.outputName) * waters
    gainProfXp('farm', c, WELL.farmXpPerCollect * 2)
    stamina += FARM_ACTION_STAMINA * 2
  }
  // cercado (nv5+): 1 ciclo/dia se houver Ração (craft real a partir de Trigo via alquimia)
  if (c.farmLevel >= 5) {
    const racao = POTION_RECIPES.find((r) => r.outputName === 'Ração')
    if (racao && racao.ingredients.every((i) => (v.items.get(i.name) ?? 0) >= i.quantity) && v.gold >= racao.goldCost) {
      racao.ingredients.forEach((i) => takeItem(v, i.name, i.quantity))
      v.gold -= racao.goldCost; led.potCraftFee += racao.goldCost
      addItem(v, PEN.outputName, PEN.yield)
      led.goldFromFarmSell += sellValueOf(PEN.outputName) * PEN.yield
      gainProfXp('farm', c, PEN.farmXp)
      stamina += FARM_ACTION_STAMINA * 2
    }
  }
  return stamina
}

// ---------------- PvP (battle/rewards/route.ts — duplicado consciente: é rota) ----------------
function pvpGoldForWin(level: number, firstOfDay: boolean): number {
  let gold = 15
  const levelMult = Math.min(Math.pow(1.1, level - 1), 8) // xpMultiplier cap defensivo
  gold = Math.floor(gold * levelMult * 1.08)
  if (firstOfDay) gold = Math.floor(gold * 1.5)
  return Math.max(1, gold)
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
      // masmorra: runs até o orçamento acabar
      while (budget >= 30) { // custo mínimo de uma run parcial útil
        craftOrBuyPotions(v, led, POTS_RUN)
        v.potions = Math.max(0, v.potions - POTS_RUN)
        const spent = runDungeon(v, led, c, capLeft)
        led.staminaDungeon += spent
        led.runs++
        budget -= Math.max(spent, 20)
        if (capLeft.v <= 0) { capWasHit = true; break }
      }
      payRepairs(v, led, c)
    })

    // PvP: sem stamina persistente (auditoria 2026-07-05) — só o gate de partidas/dia
    const pvpLevel = Math.max(...chars.map((c) => c.level))
    for (let w = 0; w < PVP_WINS; w++) {
      const g = pvpGoldForWin(pvpLevel, w === 0)
      v.gold += g; led.pvpGold += g
    }

    refineAll(v, led)
    // pedras no MAIN primeiro (maior nível), depois os alts — política do farm rotativo
    ;[...chars].sort((a, b) => b.level - a.level).forEach((c) => enhance(v, c))
    sellSurplus(v, led, 12)
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
console.log(`   políticas: venda 60% · poções/run ${POTS_RUN} (craft-first) · PvP ${PVP_WINS} win/dia · cap diário ${fmt(DAILY_GOLD_CAP)}`)
console.log('')

const csvRows: string[] = ['chars,faucet_total_dia,dungeon_chao,dungeon_abate,venda,pvp,sink_total_dia,pocoes,refino,reparo,expansao,net_dia,gpstam_dungeon,gpstam_coleta,gpstam_fazenda,dias_main_full,dias_all_full']

for (const n of CHAR_COUNTS) {
  const acc = { faucet: 0, dgChao: 0, dgKill: 0, sell: 0, pvp: 0, sink: 0, pots: 0, refine: 0, repair: 0, exp: 0, gsDg: 0, gsGa: 0, gsFa: 0, mainFull: [] as number[], allFull: [] as number[], lvl: 0, capDays: 0, kills: 0, runs: 0 }
  const sellKinds = new Map<string, number>()

  for (let t = 0; t < TRIALS; t++) {
    Math.random = mulberry32(SEED + t * 7919 + n * 104729)
    const r = simulateAccount(n)
    const L = r.led
    const chao = L.dgGold - L.dgKillGold
    const faucet = L.dgGold + L.sellGold + L.pvpGold
    const sink = L.potCraftFee + L.potBuy + L.refineFee + L.repair + L.expansion
    acc.faucet += faucet / DAYS
    acc.dgChao += chao / DAYS; acc.dgKill += L.dgKillGold / DAYS
    acc.sell += L.sellGold / DAYS; acc.pvp += L.pvpGold / DAYS
    acc.sink += sink / DAYS
    acc.pots += (L.potCraftFee + L.potBuy) / DAYS; acc.refine += L.refineFee / DAYS
    acc.repair += L.repair / DAYS; acc.exp += L.expansion / DAYS
    acc.gsDg += L.staminaDungeon > 0 ? L.goldFromDungeonActivity / L.staminaDungeon : 0
    acc.gsGa += L.staminaGather > 0 ? L.goldFromGatherSell / L.staminaGather : 0
    acc.gsFa += L.staminaFarm > 0 ? L.goldFromFarmSell / L.staminaFarm : 0
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
  console.log(`   SINK   ${fmt(sink)}/dia   →  poções ${fmt(acc.pots / T)} · refino ${fmt(acc.refine / T)} · reparo ${fmt(acc.repair / T)} · expansão ${fmt(acc.exp / T)}`)
  console.log(`   NET    ${net >= 0 ? '+' : ''}${fmt(net)}/dia   (sobra p/ claim on-chain)`)
  console.log(`   ⚖️ gold/stamina: dungeon ${(acc.gsDg / T).toFixed(1)} · coleta ${(acc.gsGa / T).toFixed(1)} · fazenda ${(acc.gsFa / T).toFixed(1)}`)
  console.log(`   📈 runs/dia ${(acc.runs / T / DAYS).toFixed(1)} · abates/dia ${(acc.kills / T / DAYS).toFixed(0)} · nível main d${DAYS}: ${(acc.lvl / T).toFixed(0)} · cap 20k batido em ${(acc.capDays / T).toFixed(1)} dia(s)`)
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
