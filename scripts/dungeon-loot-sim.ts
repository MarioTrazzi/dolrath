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
// ============================================================

import {
  DUNGEON_LIST,
  scaleMonster,
  pickMonster,
  rollNodeLoot,
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
