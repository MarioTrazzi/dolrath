#!/usr/bin/env ts-node
// ============================================================
// DOLRATH — Simulador de LOOT/XP/GOLD por masmorra (nó a nó)
//
// Roda os GERADORES REAIS do jogo (rollNodeLoot + scaleMonster de
// dungeonAdventures.ts), espelhando o fluxo servidor-autoritativo de
// dungeonRunServer.ts:
//   • cada nó rola um d20 (a sorte define a qualidade do espólio);
//   • sala MAIN = monstro garantido; nó MINOR = 40% monstro, senão "achado";
//   • BOSS = sempre, com sorte máxima (lootRoll 20);
//   • monstro derrotado credita goldReward + xpReward + loot de combate;
//   • "achado" credita só o ouro + drops (XP só vem de abate).
//
// Gera N runs aleatórias por masmorra, pontua (variedade + raridade + drops
// no boss) e imprime a MELHOR run de cada uma — pronta pra colar como mock nas
// demos da landing. XP/gold são acumulados ao longo da trilha.
//
// Uso:
//   TS_NODE_TRANSPILE_ONLY=1 npx ts-node \
//     --compiler-options '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' \
//     -r tsconfig-paths/register scripts/dungeon-loot-sim.ts
//
// Modo EV (calibração do D20_LOOT_PACKS): EV=1 na frente do comando acima.
// Imprime o VALOR ESPERADO por run (masmorra × tier de masmorra) — ouro, pedras
// (básica/concentrada), estilhaços, materiais de craft, gear — comparando com a
// TABELA ANTIGA (LUCK_CFG de 3 faixas, replicada inline). Âncoras:
//   • pedras/run em tier 1 ≈ paridade (±10%) com a tabela antiga;
//   • curva por tier ≈ +15–20%/tier;
//   • materiais/run × ~3 runs/dia ≥ custo de 4–6 poções básicas (solo 1 char).
// ============================================================

import {
  DUNGEON_LIST,
  scaleMonster,
  pickMonster,
  rollNodeLoot,
  rollKillLoot,
  earlyPoolOf,
  type DungeonDef,
  type LootDrop,
} from '@/lib/dungeonAdventures'
import { buildTrail, type TrailNode } from '@/lib/dungeonRunServer'

const RUNS_PER_DUNGEON = 4000
const MINOR_MONSTER_CHANCE = 0.4 // espelha dungeonRunServer
const RACE = 'elfo'
const CLASS = 'rogue'

const d20 = () => 1 + Math.floor(Math.random() * 20)

interface SimNode {
  kind: 'start' | 'minor' | 'main' | 'boss'
  tier: number
  roll: number
  monster?: { name: string; emoji: string; level: number }
  xp: number
  gold: number
  drops: LootDrop[]
}
interface SimRun {
  nodes: SimNode[]
  totalXp: number
  totalGold: number
  totalDrops: number
}

// Nível de referência da run = topo do band (quem está limpando a masmorra).
function simulateRun(dungeon: DungeonDef): SimRun {
  const level = dungeon.clearLevel
  const character = { id: 'sim', level, race: RACE, class: CLASS }
  const trail = buildTrail(dungeon)
  const nodes: SimNode[] = []
  let totalXp = 0
  let totalGold = 0
  let totalDrops = 0

  for (let i = 0; i < trail.length; i++) {
    const t: TrailNode = trail[i]
    if (t.kind === 'start') {
      nodes.push({ kind: 'start', tier: 0, roll: 0, xp: 0, gold: 0, drops: [] })
      continue
    }
    const roll = t.kind === 'boss' ? 20 : d20()
    const isMain = t.kind === 'main'
    let xp = 0
    let gold = 0
    let drops: LootDrop[] = []
    let monster: SimNode['monster']

    const isMonster = t.kind === 'boss' || isMain || Math.random() < MINOR_MONSTER_CHANCE
    if (isMonster) {
      const def = t.kind === 'boss' ? dungeon.boss : pickMonster(dungeon)
      const m = scaleMonster(def, dungeon, level, { tier: t.tier, isMain: isMain || t.kind === 'boss', isBoss: t.kind === 'boss' }, CLASS)
      monster = { name: m.name, emoji: m.emoji, level: m.level }
      xp = m.xpReward
      const loot = rollNodeLoot(dungeon, roll, t.kind === 'boss' ? 'boss' : isMain ? 'main' : 'minor', level, RACE, CLASS)
      gold = m.goldReward + loot.gold
      drops = loot.drops
    } else {
      const loot = rollNodeLoot(dungeon, roll, 'minor', level, RACE, CLASS)
      gold = loot.gold
      drops = loot.drops
    }

    totalXp += xp
    totalGold += gold
    totalDrops += drops.length
    nodes.push({ kind: t.kind, tier: t.tier, roll, monster, xp, gold, drops })
  }

  return { nodes, totalXp, totalGold, totalDrops }
}

// ============================================================
// MODO EV — calibração do D20_LOOT_PACKS (EV=1). Espelha o fluxo do servidor:
// 1º nó menor TRAVADO (pacote de 3), chance de monstro em nó menor inversa ao
// d20 (0.9/0.5/0.1), fonte em sorte alta, drop POR ABATE na classe do d20 do nó.
// Compara com a TABELA ANTIGA (LUCK_CFG) replicada inline.
// ============================================================
if (process.env.EV) {
  const EV_RUNS = Number(process.env.EV_RUNS || 20000)
  const MINOR_MON = { low: 0.9, mid: 0.5, high: 0.1 } as const
  const FOUNTAIN = 0.2
  const luck = (r: number) => (r <= 5 ? 'low' : r <= 13 ? 'mid' : 'high') as 'low' | 'mid' | 'high'
  const packSize = () => { const r = Math.random(); return r < 0.4 ? 1 : r < 0.75 ? 2 : 3 }

  // --- tabela ANTIGA (pré-D20_LOOT_PACKS), p/ âncora de paridade ---
  const OLD = {
    low:  { goldBase: 4,  goldVar: 8,  pConsumable: 0.18, pStone: 0.03, pShard: 0.12, gear: 0.05, bossGear: 0.03 },
    mid:  { goldBase: 10, goldVar: 16, pConsumable: 0.35, pStone: 0.08, pShard: 0.22, gear: 0.15, bossGear: 0.11 },
    high: { goldBase: 18, goldVar: 30, pConsumable: 0.45, pStone: 0.15, pShard: 0.32, gear: 0.30, bossGear: 0.22 },
  }
  const NODE_MULT = { minor: { all: 0.8, stone: 0.4, gold: 0.8 }, main: { all: 1.0, stone: 1.0, gold: 1.3 }, boss: { all: 1.0, stone: 2.5, gold: 2.0 } }
  const OLD_KILL_SHARD = { minor: 0.4, main: 0.6, boss: 0.6 }

  interface Tally { gold: number; stoneBasic: number; stoneConc: number; shard: number; mats: number; gear: number; cons: number; bossIng: number }
  const zero = (): Tally => ({ gold: 0, stoneBasic: 0, stoneConc: 0, shard: 0, mats: 0, gear: 0, cons: 0, bossIng: 0 })
  const isShard = (d: LootDrop) => d.name.startsWith('Estilhaço de Pedra Negra')
  const addDrops = (t: Tally, drops: LootDrop[]) => {
    for (const d of drops) {
      if (d.kind === 'stone') { if (String(d.rarity) === 'RARE') t.stoneConc++; else t.stoneBasic++ }
      else if (isShard(d)) t.shard++
      else if (d.kind === 'ingredient' && ['RARE', 'EPIC'].includes(String(d.rarity))) t.bossIng++
      else if (d.kind === 'ingredient' || d.kind === 'material') t.mats++
      else if (d.kind === 'item') t.gear++
      else if (d.kind === 'consumable') t.cons++
    }
  }

  // Run NOVA (geradores reais) — assume vitória em todo encontro (EV de teto).
  const newRun = (dungeon: DungeonDef, tier: number): Tally => {
    const t = zero()
    const level = dungeon.clearLevel
    const trail = buildTrail(dungeon)
    for (let i = 0; i < trail.length; i++) {
      const n = trail[i]
      if (n.kind === 'start') continue
      if (n.kind === 'boss') {
        addDrops(t, rollKillLoot('boss', true, dungeon.difficultyStars, tier, 20, dungeon))
        const loot = rollNodeLoot(dungeon, 20, 'boss', level, RACE, CLASS, tier)
        t.gold += loot.gold; addDrops(t, loot.drops)
        continue
      }
      const roll = d20()
      const isMain = n.kind === 'main'
      const isFirstMinor = i === 1 && n.kind === 'minor'
      const encounter = isMain || isFirstMinor || Math.random() < MINOR_MON[luck(roll)]
      if (encounter) {
        const kills = isMain ? 1 : isFirstMinor ? 3 : packSize()
        for (let k = 0; k < kills; k++) addDrops(t, rollKillLoot(isMain ? 'main' : 'minor', false, dungeon.difficultyStars, tier, roll, dungeon))
        const loot = rollNodeLoot(dungeon, roll, isMain ? 'main' : 'minor', level, RACE, CLASS, tier)
        t.gold += loot.gold; addDrops(t, loot.drops)
      } else if (n.tier > 1 && luck(roll) === 'high' && Math.random() < FOUNTAIN) {
        // fonte: sem espólio
      } else {
        const loot = rollNodeLoot(dungeon, roll, 'minor', level, RACE, CLASS, tier)
        t.gold += loot.gold; addDrops(t, loot.drops)
      }
    }
    return t
  }

  // Run ANTIGA (LUCK_CFG inline) — mesma trilha/encontros, SEM trava do 1º nó.
  const oldRun = (dungeon: DungeonDef, tier: number): Tally => {
    const t = zero()
    const level = dungeon.clearLevel
    const tierReward = 1 + (tier - 1) * 0.15
    const conc = tier >= 3
    const trail = buildTrail(dungeon)
    const node = (roll: number, kind: 'minor' | 'main' | 'boss') => {
      const cfg = OLD[luck(roll)]
      const m = NODE_MULT[kind]
      t.gold += Math.floor((cfg.goldBase + Math.random() * cfg.goldVar) * m.gold * dungeon.difficulty * (1 + level * 0.04) * tierReward)
      if (Math.random() < cfg.pShard * m.all) t.shard++
      if (Math.random() < cfg.pConsumable * m.all) t.cons++
      if (Math.random() < cfg.gear * m.all) t.gear++
      if (kind === 'boss' && Math.random() < cfg.bossGear * m.all) t.gear++
      if (Math.random() < cfg.pStone * m.stone * tierReward) { if (conc) t.stoneConc++; else t.stoneBasic++ }
    }
    for (let i = 0; i < trail.length; i++) {
      const n = trail[i]
      if (n.kind === 'start') continue
      if (n.kind === 'boss') {
        addDrops(t, rollKillLoot('boss', true, dungeon.difficultyStars, tier, 20, dungeon)) // igual nos 2 modelos
        node(20, 'boss')
        continue
      }
      const roll = d20()
      const isMain = n.kind === 'main'
      const encounter = isMain || Math.random() < MINOR_MON[luck(roll)]
      if (encounter) {
        const kills = isMain ? 1 : packSize()
        for (let k = 0; k < kills; k++) if (Math.random() < OLD_KILL_SHARD[isMain ? 'main' : 'minor']) t.shard++
        node(roll, isMain ? 'main' : 'minor')
      } else if (n.tier > 1 && luck(roll) === 'high' && Math.random() < FOUNTAIN) {
        // fonte
      } else {
        node(roll, 'minor')
      }
    }
    return t
  }

  const avg = (f: () => Tally): Tally => {
    const acc = zero()
    for (let i = 0; i < EV_RUNS; i++) {
      const r = f()
      acc.gold += r.gold; acc.stoneBasic += r.stoneBasic; acc.stoneConc += r.stoneConc
      acc.shard += r.shard; acc.mats += r.mats; acc.gear += r.gear; acc.cons += r.cons; acc.bossIng += r.bossIng
    }
    for (const k of Object.keys(acc) as (keyof Tally)[]) acc[k] = acc[k] / EV_RUNS
    return acc
  }
  const f = (x: number) => x.toFixed(2).padStart(6)

  console.log(`EV por RUN (${EV_RUNS} runs/célula) — NOVO (D20_LOOT_PACKS) vs ANTIGO (LUCK_CFG)`)
  for (const dungeon of DUNGEON_LIST) {
    console.log(`\n${dungeon.emoji} ${dungeon.name} (${dungeon.difficultyStars}★, nv ${dungeon.clearLevel})`)
    console.log('  tier  |   gold  pedraB pedraC estilh   mats   gear   cons bossIng')
    for (let tier = 1; tier <= 5; tier++) {
      const nv = avg(() => newRun(dungeon, tier))
      const ov = avg(() => oldRun(dungeon, tier))
      console.log(`  t${tier} N  | ${f(nv.gold)} ${f(nv.stoneBasic)} ${f(nv.stoneConc)} ${f(nv.shard)} ${f(nv.mats)} ${f(nv.gear)} ${f(nv.cons)} ${f(nv.bossIng)}`)
      console.log(`  t${tier} A  | ${f(ov.gold)} ${f(ov.stoneBasic)} ${f(ov.stoneConc)} ${f(ov.shard)} ${f(ov.mats)} ${f(ov.gear)} ${f(ov.cons)}      —`)
    }
  }
  process.exit(0)
}

const RARITY_RANK: Record<string, number> = { COMMON: 1, UNCOMMON: 2, RARE: 3, EPIC: 4, LEGENDARY: 5 }

// Pontua uma run para escolher a mais "vitrine": variedade de drops, presença de
// raridade alta, drop de equipamento no boss e poucos nós completamente vazios.
function scoreRun(run: SimRun): number {
  let score = 0
  const bossNode = run.nodes[run.nodes.length - 1]
  const bossGear = bossNode.drops.some(d => d.kind === 'item')
  if (bossGear) score += 40
  let maxRarity = 0
  let emptyNonStart = 0
  for (const n of run.nodes) {
    if (n.kind === 'start') continue
    if (n.drops.length === 0 && n.gold === 0) emptyNonStart++
    score += n.drops.length * 3
    if (n.drops.some(d => d.kind === 'item')) score += 6
    if (n.drops.some(d => d.kind === 'stone')) score += 8
    for (const d of n.drops) maxRarity = Math.max(maxRarity, RARITY_RANK[String(d.rarity).toUpperCase()] || 0)
  }
  score += maxRarity * 10
  score -= emptyNonStart * 7
  // queremos pelo menos UM raro+, mas evitar runs irreais (tudo épico)
  if (maxRarity < 3) score -= 25
  return score
}

function bestRun(dungeon: DungeonDef): SimRun {
  let best: SimRun | null = null
  let bestScore = -Infinity
  for (let i = 0; i < RUNS_PER_DUNGEON; i++) {
    const r = simulateRun(dungeon)
    const s = scoreRun(r)
    if (s > bestScore) { bestScore = s; best = r }
  }
  return best!
}

// ---- saída ----
function fmtDrop(d: LootDrop): string {
  const enh = d.enhancement ? ` +${d.enhancement}` : ''
  return `${d.emoji} ${d.name}${enh} [${d.rarity ?? '—'}/${d.kind}]`
}

for (const dungeon of DUNGEON_LIST) {
  const run = bestRun(dungeon)
  console.log(`\n${'='.repeat(64)}`)
  console.log(`${dungeon.emoji}  ${dungeon.name}  — Nv.${dungeon.levelReq}→${dungeon.clearLevel} · ${dungeon.rooms} salas + boss`)
  console.log(`${'='.repeat(64)}`)
  let accXp = 0
  let accGold = 0
  run.nodes.forEach((n, i) => {
    if (n.kind === 'start') { console.log(`  [${i}] 🚪 entrada`); return }
    accXp += n.xp
    accGold += n.gold
    const label = n.kind === 'boss' ? '👑 BOSS' : n.kind === 'main' ? '⚔️  SALA' : '·   nó'
    const mon = n.monster ? `${n.monster.emoji} ${n.monster.name} (Nv.${n.monster.level})` : 'achado'
    console.log(`  [${i}] ${label}  d20=${String(n.roll).padStart(2)}  ${mon}`)
    console.log(`        +${n.xp} XP  +${n.gold} gold   →  acc ${accXp} XP · ${accGold} gold`)
    for (const d of n.drops) console.log(`        loot: ${fmtDrop(d)}`)
  })
  console.log(`  TOTAL: ${run.totalXp} XP · ${run.totalGold} gold · ${run.totalDrops} drops`)

  // bloco JSON compacto pronto p/ colar como mock
  const mock = run.nodes
    .filter(n => n.kind !== 'start')
    .map(n => ({
      kind: n.kind,
      roll: n.roll,
      mon: n.monster ? n.monster.name.replace(/^👑 /, '').split(' • ')[0] : null,
      emoji: n.monster?.emoji ?? null,
      xp: n.xp,
      gold: n.gold,
      drops: n.drops.map(d => ({ name: d.name, emoji: d.emoji, rarity: d.rarity, kind: d.kind, enh: d.enhancement ?? 0 })),
    }))
  console.log(`  MOCK[${dungeon.id}] = ${JSON.stringify(mock)}`)
}
