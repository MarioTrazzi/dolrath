#!/usr/bin/env ts-node
// ============================================================
// DOLRATH — ECONOMIA DE MANUTENÇÃO: a run paga o próprio conserto?
//
// Pergunta única deste sim: o espólio de uma run devolve durabilidade suficiente
// para consertar o que essa mesma run gastou? Foi a falha que o playtest de
// 2026-08-17 expôs — nv6 com o set inteiro quebrado, sem ouro para reparar e
// farmando pior por estar quebrado.
//
// Roda os GERADORES REAIS (rollNodeLoot/rollKillLoot com o parâmetro `gear` novo)
// numa CAMPANHA de runs consecutivas: o set desgasta de verdade, o espólio de
// manutenção responde ao desgaste (maintenanceWearFactor) e o estoque vira
// cópias na forja pelas receitas reais (FORGE_RECIPES).
//
// COBERTURA = durabilidade reposta ÷ durabilidade consumida.
//   < 60%  → a manutenção trava o jogador (o beco do playtest)
//   60-80% → alvo: a run banca a maior parte, o resto sai de ouro/coleta/craft
//   > 95%  → conserto virou automático, o desgaste deixou de ser decisão
//
// Uso:  npm run sim:repair
// ============================================================

import {
  DUNGEON_LIST, rollNodeLoot, rollKillLoot,
  type DungeonDef, type LootDrop,
} from '@/lib/dungeonAdventures'
import { buildTrail, type TrailNode } from '@/lib/dungeonRunServer'
import { wearFor } from '@/lib/durability'
import { REPAIR_PER_DUPLICATE } from '@/lib/enhancementSystem'
import { FORGE_RECIPES } from '@/lib/forge'
import { PROCESSING_RECIPES } from '@/lib/processing'
import { getCatalogItemByName } from '@/lib/itemCatalog'
import { getSlotTypeFromItemType } from '@/lib/equipmentSlot'
import type { GearWearSnapshot } from '@/lib/maintenanceLoot'

const RUNS_PER_CAMPAIGN = 12
const CAMPAIGNS = 400
const MINOR_MONSTER_CHANCE = 0.4 // espelha dungeonRunServer
const PACK_MIN = 1
const PACK_MAX = 3

const d20 = () => 1 + Math.floor(Math.random() * 20)

// Sets de referência: peças REAIS do catálogo, uma por classe. Arma + 4 peças de
// armadura é o que o herói do early game leva para a Floresta.
const SETS: Record<string, { race: string; klass: string; pieces: string[] }> = {
  warrior: {
    race: 'humano', klass: 'warrior',
    pieces: ['Espada de Recruta', 'Elmo de Ferro', 'Peitoral de Ferro', 'Luvas de Couro', 'Botas de Viajante'],
  },
  rogue: {
    race: 'elfo', klass: 'rogue',
    pieces: ['Adaga Ligeira', 'Capuz de Couro', 'Gibão de Couro', 'Luvas de Couro', 'Botas de Viajante'],
  },
  mage: {
    race: 'humano', klass: 'mage',
    pieces: ['Cajado de Aprendiz', 'Capuz de Couro', 'Túnica de Linho Arcano', 'Luvas de Couro', 'Botas de Viajante'],
  },
  monk: {
    race: 'metamorfo', klass: 'monk',
    pieces: ['Manoplas do Discípulo', 'Capuz de Couro', 'Gibão de Couro', 'Luvas de Couro', 'Botas de Viajante'],
  },
}

const SHARD_NAMES = ['Estilhaço de Pedra Negra (Arma)', 'Estilhaço de Pedra Negra (Armadura)']

// ⚠️ NADA de Map/Set aqui: o tsconfig do repo compila com target es5 SEM
// downlevelIteration, e `[...map]` vira array VAZIO em silêncio. A primeira
// versão deste sim usava Map e reportava cobertura de 100% — `[].every()` é
// true, então a forja fabricava cópias sem consumir material nenhum. Objeto
// simples é imune a isso.
const RAW_OF_PROCESSED: Record<string, string> = {}
PROCESSING_RECIPES.forEach(r => {
  const raw = r.inputs.find(i => i.name !== 'Água Pura') ?? r.inputs[0]
  if (raw) RAW_OF_PROCESSED[r.outputName] = raw.name
})

/** Custo em material CRU de forjar uma cópia da peça (sem o estilhaço ligante). */
function copyCostOf(pieceName: string): { mats: Record<string, number>; shard: string; gold: number } | null {
  const recipe = FORGE_RECIPES.find(r => r.kind === 'gear' && r.outputName === pieceName)
  if (!recipe) return null
  const gold = recipe.goldCost
  const mats: Record<string, number> = {}
  let shard = SHARD_NAMES[1]
  recipe.materials.forEach(m => {
    if (m.name.startsWith('Estilhaço de Pedra Negra')) { shard = m.name; return }
    const processed = RAW_OF_PROCESSED[m.name]
    const raw = processed ?? m.name
    // Processado 2:1 — uma Barra de Ferro custa 2 Ferros.
    const factor = processed ? 2 : 1
    mats[raw] = (mats[raw] ?? 0) + m.quantity * factor
  })
  return { mats, shard, gold }
}

function freshSet(klass: string): GearWearSnapshot[] {
  return SETS[klass].pieces.map(name => {
    const item = getCatalogItemByName(name)
    if (!item) throw new Error(`Peça inexistente no catálogo: ${name}`)
    return { name, type: item.type, durability: 100, maxDurability: 100 }
  })
}

const isWeaponSlot = (type: string) => getSlotTypeFromItemType(type) === 'WEAPON'

interface CampaignResult {
  wearSpent: number
  wearRestored: number
  maintMats: number
  spareParts: number
  forgeGold: number
  brokenRuns: number // runs terminadas com ao menos uma peça quebrada
}

function runCampaign(dungeon: DungeonDef, klass: string, level: number): CampaignResult {
  const { race } = SETS[klass]
  const gear = freshSet(klass)
  const stock: Record<string, number> = {}
  const add = (name: string, n = 1) => { stock[name] = (stock[name] ?? 0) + n }

  let wearSpent = 0
  let wearRestored = 0
  let maintMats = 0
  let spareParts = 0
  let forgeGold = 0
  let brokenRuns = 0
  // Peças de reposição na bolsa, por nome (cada uma vale REPAIR_PER_DUPLICATE).
  const spares: Record<string, number> = {}

  for (let run = 0; run < RUNS_PER_CAMPAIGN; run++) {
    const trail = buildTrail(dungeon)

    for (const t of trail as TrailNode[]) {
      if (t.kind === 'start') continue
      const roll = t.kind === 'boss' ? 20 : d20()
      const isMain = t.kind === 'main'
      const kind = t.kind === 'boss' ? 'boss' : isMain ? 'main' : 'minor'
      const isMonster = t.kind === 'boss' || isMain || Math.random() < MINOR_MONSTER_CHANCE

      const collect = (drops: LootDrop[]) => {
        for (const d of drops) {
          if (d.reason === 'spare') {
            spares[d.name] = (spares[d.name] ?? 0) + 1
            spareParts++
          } else if (d.reason === 'maintenance') {
            add(d.name); maintMats++
          } else if (SHARD_NAMES.includes(d.name)) {
            add(d.name)
          }
        }
      }

      if (isMonster) {
        const kills = t.kind === 'boss' ? 1 : PACK_MIN + Math.floor(Math.random() * (PACK_MAX - PACK_MIN + 1))
        for (let k = 0; k < kills; k++) {
          collect(rollKillLoot(kind, t.kind === 'boss', dungeon.difficultyStars, 1, roll, dungeon, gear))
          // Desgaste do abate — a conta real de flushRunRewards.
          for (const eq of gear) {
            if (eq.durability <= 0) continue
            const w = wearFor(isWeaponSlot(eq.type) ? 'WEAPON' : 'ARMOR', 1, t.kind === 'boss', level)
            const applied = Math.min(eq.durability, w)
            eq.durability -= applied
            wearSpent += applied
          }
        }
      }
      collect(rollNodeLoot(dungeon, roll, kind, level, race, klass, 1, gear).drops)
    }

    // ---- Bancada: converte o que caiu em durabilidade ----
    // Peça mais gasta primeiro (é o que o jogador faz na prática).
    const byWear = [...gear].sort((a, b) => a.durability - b.durability)
    for (const eq of byWear) {
      let missing = eq.maxDurability - eq.durability
      // 1) peça de reposição pronta na bolsa
      while (missing > 0 && (spares[eq.name] ?? 0) > 0) {
        spares[eq.name] -= 1
        const gained = Math.min(missing, REPAIR_PER_DUPLICATE)
        eq.durability += gained; wearRestored += gained; missing -= gained
      }
      // 2) forjar cópias com o estoque de material de manutenção
      const cost = copyCostOf(eq.name)
      if (!cost) continue
      const matNames = Object.keys(cost.mats)
      while (missing > 0) {
        const canForge = matNames.every(n => (stock[n] ?? 0) >= cost.mats[n])
          && (stock[cost.shard] ?? 0) >= 1
        if (!canForge) break
        matNames.forEach(n => { stock[n] -= cost.mats[n] })
        stock[cost.shard] -= 1
        forgeGold += cost.gold
        const gained = Math.min(missing, REPAIR_PER_DUPLICATE)
        eq.durability += gained; wearRestored += gained; missing -= gained
      }
    }
    if (gear.some(eq => eq.durability <= 0)) brokenRuns++
  }

  return { wearSpent, wearRestored, maintMats, spareParts, brokenRuns, forgeGold }
}

function main() {
  const pct = (n: number) => `${(n * 100).toFixed(0)}%`
  console.log('\n🔧 ECONOMIA DE MANUTENÇÃO — a run paga o próprio conserto?')
  console.log(`   ${CAMPAIGNS} campanhas × ${RUNS_PER_CAMPAIGN} runs · set de 5 peças · tier 1\n`)

  // O nível do playtest (6, Floresta) entra como cenário próprio: é o caso que
  // motivou tudo isto, e é onde o amaciamento de WEAR_SOFTENING está ligado.
  const scenarios: { dungeon: DungeonDef; level: number }[] = [
    { dungeon: DUNGEON_LIST[0], level: 6 },
    ...DUNGEON_LIST.map(d => ({ dungeon: d, level: d.clearLevel })),
  ]

  for (const { dungeon, level } of scenarios) {
    console.log(`\n🗺️  ${dungeon.name}  (nv ${level}, ${dungeon.difficultyStars}★)`)
    console.log('   classe     desgaste/run   reposto/run   cobertura   mats/run   peças/run   taxa forja/run   runs c/ peça quebrada')
    for (const klass of Object.keys(SETS)) {
      const acc: CampaignResult = { wearSpent: 0, wearRestored: 0, maintMats: 0, spareParts: 0, brokenRuns: 0, forgeGold: 0 }
      for (let c = 0; c < CAMPAIGNS; c++) {
        const r = runCampaign(dungeon, klass, level)
        acc.wearSpent += r.wearSpent; acc.wearRestored += r.wearRestored
        acc.maintMats += r.maintMats; acc.spareParts += r.spareParts; acc.brokenRuns += r.brokenRuns
        acc.forgeGold += r.forgeGold
      }
      const runs = CAMPAIGNS * RUNS_PER_CAMPAIGN
      const coverage = acc.wearSpent > 0 ? acc.wearRestored / acc.wearSpent : 0
      const flag = coverage < 0.6 ? '❌' : coverage > 0.95 ? '⚠️ ' : '✅'
      console.log(
        `   ${klass.padEnd(10)} ${(acc.wearSpent / runs).toFixed(0).padStart(10)}` +
        `${(acc.wearRestored / runs).toFixed(0).padStart(14)}` +
        `${(flag + ' ' + pct(coverage)).padStart(14)}` +
        `${(acc.maintMats / runs).toFixed(1).padStart(11)}` +
        `${(acc.spareParts / runs).toFixed(2).padStart(12)}` +
        `${(acc.forgeGold / runs).toFixed(0).padStart(17)}` +
        `${pct(acc.brokenRuns / runs).padStart(22)}`
      )
    }
  }
  console.log('\n   Alvo: cobertura 60-80%. ❌ = a manutenção trava; ⚠️ = conserto virou automático.\n')
}

main()
