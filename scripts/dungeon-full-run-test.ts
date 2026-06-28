#!/usr/bin/env ts-node
// ============================================================
// DOLRATH — Teste de RUNS COMPLETAS com loot e combate REAIS + relatório HTML
//
// Importa a LÓGICA DE PRODUÇÃO (nada inventado):
//   • monstros/boss: scaleMonster + pickMonster (src/lib/dungeonAdventures)
//   • combate: contestedOutcome + computeLevers (src/lib/combatModel) — a mesma
//     disputa de dados de DungeonRun.tsx
//   • drops: rollNodeLoot — a MESMA tabela d20 que o servidor credita em /step
//
// Cada cenário = personagem no SET-ALVO da masmorra (PRI/DUO/TRI/TET, 9 slots
// inclusive acessórios), no clearLevel da banda. Faz N runs; a cada NÓ DE LUTA o
// jogador usa consumível para restaurar a vida (topa o HP antes do combate).
//
// Saídas:
//   • console: resumo conciso
//   • HTML: relatório detalhado (drops por raridade/origem, win-rate do boss por
//     classe vs. alvo de design, e o detalhe nó-a-nó de cada run).
//
// Uso:
//   node scripts/run-dungeon-test.js                 → Floresta (PRI), 10 runs, gera HTML
//   ALL=1 node scripts/run-dungeon-test.js           → as 4 masmorras no gear-alvo de cada banda
//   DUNGEON=caverna RUNS=20 node scripts/run-dungeon-test.js
//   CLASS=mage RACE=elfo node scripts/run-dungeon-test.js
//   OUT=/caminho/relatorio.html node scripts/run-dungeon-test.js
// (target es2019 é OBRIGATÓRIO: com ES5 o for-of sobre Map itera vazio.)
// ============================================================

import * as fs from 'fs'
import * as path from 'path'
import {
  DUNGEONS,
  scaleMonster,
  pickMonster,
  rollNodeLoot,
  luckTier,
  type DungeonDef,
  type DungeonId,
  type ScaledMonster,
  type NodeLoot,
  type LootNodeKind,
} from '../src/lib/dungeonAdventures'
import {
  computeLevers,
  deriveGearTier,
  transformLevers,
  contestedOutcome,
  normalizeCombatClass,
  PVE_DIE,
  ATTACKS,
  K50,
  MAX_LEVEL_REF,
  NOMINAL_SLOTS,
  type CombatClass,
  type Levers,
} from '../src/lib/combatModel'

// ============================================================
// CONFIG
// ============================================================
const RUNS = Number(process.env.RUNS) || 10
const RACE = process.env.RACE || 'draconiano'
const CLASS = (normalizeCombatClass(process.env.CLASS || 'warrior') || 'warrior') as CombatClass
const ALL = process.env.ALL === '1' || process.argv[2] === 'all'
const OUT = process.env.OUT || path.join(process.cwd(), 'dungeon-report.html')
const BOSS_GATE_ITERS = Number(process.env.BOSS_ITERS) || 3000

// Gear-ALVO por masmorra (espelha TARGET_GEAR de dungeonAdventures): a raridade
// que o boss daquela banda libera, no aprimoramento de topo (PRI/DUO/TRI/TET).
const TARGET_GEAR: Record<DungeonId, { rarity: string; enh: number; tag: string }> = {
  floresta: { rarity: 'UNCOMMON', enh: 16, tag: 'PRI' },
  caverna:  { rarity: 'RARE', enh: 17, tag: 'DUO' },
  pantano:  { rarity: 'EPIC', enh: 18, tag: 'TRI' },
  ruinas:   { rarity: 'LEGENDARY', enh: 19, tag: 'TET' },
}
const ALL_CLASSES: CombatClass[] = ['warrior', 'rogue', 'mage', 'monk']
const MINOR_MONSTER_CHANCE = 0.4
const TRANSFORM_ON = 4, TRANSFORM_CYCLE = 10
const BOSS_TARGET_WIN = 0.65 // alvo de design: cada classe vence ~65% no gear-alvo

// ============================================================
// PERSONAGEM (espelha dungeonAdventures.refAttrs: 18 pts, cap 10, +1/nível, raça/classe)
// ============================================================
const RACES: Record<string, { str: number; agi: number; int: number; def: number }> = {
  humano:     { str: 2, agi: 2, int: 2, def: 2 },
  draconiano: { str: 3, agi: 0, int: 0, def: 5 },
  metamorfo:  { str: 0, agi: 5, int: 0, def: 3 },
  elfo:       { str: 0, agi: 3, int: 4, def: 2 },
}
const CLASS_BONUS: Record<CombatClass, { str: number; agi: number; int: number; def: number }> = {
  warrior: { str: 4, agi: 0, int: 0, def: 3 },
  rogue:   { str: 0, agi: 4, int: 2, def: 0 },
  mage:    { str: 0, agi: 0, int: 5, def: 0 },
  monk:    { str: 0, agi: 4, int: 0, def: 4 },
}
const BUILD: Record<CombatClass, Record<string, number>> = {
  warrior: { str: 0.7, def: 0.3 },
  rogue:   { agi: 0.85, def: 0.15 },
  mage:    { int: 0.85, def: 0.15 },
  monk:    { agi: 0.55, def: 0.45 },
}
const CREATION_PTS = 18, STAT_CAP = 10, REF_SET_HP = 42

function buildChar(race: string, klass: CombatClass, level: number) {
  const w = BUILD[klass]
  const out: Record<string, number> = { str: 0, agi: 0, int: 0, def: 0 }
  const levelPts = Math.max(0, level - 1)
  let spill = 0
  for (const k of Object.keys(w)) { const want = Math.round(CREATION_PTS * w[k]); out[k] = Math.min(STAT_CAP, want); spill += want - out[k] }
  out.def = Math.min(STAT_CAP, out.def + spill)
  for (const k of Object.keys(w)) out[k] += Math.round(levelPts * w[k])
  const rb = RACES[race] || RACES.humano
  const cb = CLASS_BONUS[klass]
  const attrs = {
    str: out.str + rb.str + cb.str, agi: out.agi + rb.agi + cb.agi,
    int: out.int + rb.int + cb.int, def: out.def + rb.def + cb.def,
  }
  const baseHp = 80 + attrs.str * 2 + attrs.def * 4
  return { attrs, baseHp }
}

const enhHpFactor = (enh: number) => (enh <= 0 ? 1 : enh <= 15 ? 1 + enh * 0.08 : 2.5)
function gearFor(rarity: string, enh: number) {
  const pieces = Array.from({ length: NOMINAL_SLOTS }, () => ({ rarity, enhancementLevel: enh }))
  return { gearTier: deriveGearTier(pieces), gearHp: Math.floor(REF_SET_HP * enhHpFactor(enh)) }
}

// ============================================================
// COMBATE — porta fiel de DungeonRun.tsx
// ============================================================
type AttackKind = 'basic' | 'weapon' | 'special'
function monsterLevers(m: ScaledMonster): Levers {
  const S = m.level / MAX_LEVEL_REF + 0.5
  return { power: m.attack, armor: m.defense, hp: m.maxHp, evade: 0.06, K: K50 * S, scale: m.scale ?? S }
}
function strike(power: number, sides: number, defender: { armor: number; K: number; evade: number }, defense: 'dodge' | 'block', atkScale: number, defScale: number): number {
  return contestedOutcome({ power, sides, defender, defense, atkScale, defScale }).damage
}
function bestDefense(atkPower: number, sides: number, defender: { armor: number; K: number; evade: number }, atkScale: number, defScale: number): 'dodge' | 'block' {
  let dodge = 0, block = 0
  for (let i = 0; i < 120; i++) {
    dodge += strike(atkPower, sides, defender, 'dodge', atkScale, defScale)
    block += strike(atkPower, sides, defender, 'block', atkScale, defScale)
  }
  return block <= dodge ? 'block' : 'dodge'
}
function fight(base: Levers, startHp: number, m: ScaledMonster): { result: 'win' | 'loss' | 'timeout'; hp: number; turns: number } {
  const mLev = monsterLevers(m)
  const transformed = transformLevers(base)
  let php = startHp, mhp = m.hp
  let playerTurn = Math.random() < 0.5
  let pturn = 0, t = 0
  for (; t < 800 && php > 0 && mhp > 0; t++) {
    if (playerTurn) {
      const isTr = pturn % TRANSFORM_CYCLE < TRANSFORM_ON
      const pl = isTr ? transformed : base
      const kind: AttackKind = isTr ? 'special' : 'weapon'
      const mDef = Math.random() < 0.5 ? 'dodge' : 'block'
      mhp -= strike(pl.power * ATTACKS[kind].powerMult, PVE_DIE[kind], mLev, mDef, pl.scale, mLev.scale)
      pturn++
    } else {
      const r = Math.random()
      const kind: AttackKind = m.isBoss
        ? (r < 0.35 ? 'basic' : r < 0.7 ? 'weapon' : 'special')
        : m.hasSpecial ? (r < 0.5 ? 'basic' : r < 0.8 ? 'weapon' : 'special') : (r < 0.55 ? 'basic' : 'weapon')
      const isTr = (pturn % TRANSFORM_CYCLE) < TRANSFORM_ON
      const pl = isTr ? transformed : base
      const def = { armor: pl.armor, K: pl.K, evade: pl.evade }
      const pDef = bestDefense(mLev.power * ATTACKS[kind].powerMult, PVE_DIE[kind], def, mLev.scale, pl.scale)
      php -= strike(mLev.power * ATTACKS[kind].powerMult, PVE_DIE[kind], def, pDef, mLev.scale, pl.scale)
    }
    playerTurn = !playerTurn
  }
  return { result: mhp <= 0 && php > 0 ? 'win' : php <= 0 ? 'loss' : 'timeout', hp: Math.max(0, php), turns: t }
}

// ============================================================
// TRILHA (espelha dungeonRunServer.buildTrail)
// ============================================================
type NodeKind = 'start' | 'minor' | 'main' | 'boss'
function buildTrail(d: DungeonDef): { kind: NodeKind; tier: number }[] {
  const seq: { kind: NodeKind; tier: number }[] = [{ kind: 'start', tier: 0 }]
  for (let t = 1; t <= d.rooms; t++) {
    for (let mn = 0; mn < d.minorNodes; mn++) seq.push({ kind: 'minor', tier: t })
    seq.push({ kind: 'main', tier: t })
  }
  seq.push({ kind: 'boss', tier: d.rooms })
  return seq
}

// ============================================================
// MODELO DE DADOS DA SIMULAÇÃO
// ============================================================
interface DropRec { name: string; rarity: string; kind: string; emoji: string; enhancement?: number; source: 'minor' | 'main' | 'boss' | 'find' }
interface NodeRec {
  idx: number; kind: NodeKind; tier: number; roll: number; luck: string
  monster?: { name: string; emoji: string; level: number; hp: number; attack: number; defense: number; isBoss: boolean; hasSpecial: boolean }
  fight?: { result: 'win' | 'loss' | 'timeout'; turns: number; hpBefore: number; hpAfter: number; potionUsed: boolean; hpHealed: number }
  gold: number; drops: DropRec[]
}
interface RunRec {
  n: number; completed: boolean; outcome: 'clear' | 'loss' | 'timeout'
  fights: number; victories: number; potionsUsed: number; hpHealed: number; gold: number; dropCount: number
  bossResult?: 'win' | 'loss' | 'timeout'; failNode?: string
  nodes: NodeRec[]
}
interface Scenario {
  dungeon: DungeonDef; klass: CombatClass; race: string; level: number
  gear: { rarity: string; enh: number; tag: string; gearTier: number; gearHp: number }
  attrs: { str: number; agi: number; int: number; def: number }; effMaxHp: number; levers: Levers
  runs: RunRec[]
  bossGate: { klass: CombatClass; winRate: number }[] // win% no gear-alvo, por classe (Monte Carlo)
}

function simulateRun(n: number, dg: DungeonDef, klass: CombatClass, race: string, level: number, levers: Levers, effMaxHp: number): RunRec {
  const trail = buildTrail(dg)
  const nodes: NodeRec[] = []
  let gold = 0, fights = 0, victories = 0, potionsUsed = 0, hpHealed = 0, dropCount = 0
  let php = effMaxHp
  let completed = true
  let outcome: RunRec['outcome'] = 'clear'
  let bossResult: RunRec['bossResult']
  let failNode: string | undefined

  for (let i = 0; i < trail.length; i++) {
    const node = trail[i]
    if (node.kind === 'start') { nodes.push({ idx: i, kind: 'start', tier: 0, roll: 0, luck: '', gold: 0, drops: [] }); continue }
    const isBoss = node.kind === 'boss'
    const isMain = node.kind === 'main'
    const roll = isBoss ? 20 : 1 + Math.floor(Math.random() * 20)
    const lk = luckTier(roll)
    const monsterEncounter = isBoss || isMain || Math.random() < MINOR_MONSTER_CHANCE
    const rec: NodeRec = { idx: i, kind: node.kind, tier: node.tier, roll, luck: lk, gold: 0, drops: [] }

    if (monsterEncounter) {
      const scaling = { tier: isBoss ? dg.rooms : node.tier, isMain: isMain || isBoss, isBoss }
      const mon = scaleMonster(isBoss ? dg.boss : pickMonster(dg), dg, level, scaling, klass)
      rec.monster = { name: mon.name, emoji: mon.emoji, level: mon.level, hp: mon.maxHp, attack: mon.attack, defense: mon.defense, isBoss: mon.isBoss, hasSpecial: mon.hasSpecial }
      const hpBefore = php
      let potionUsed = false, healed = 0
      if (php < effMaxHp) { healed = effMaxHp - php; hpHealed += healed; potionsUsed++; php = effMaxHp; potionUsed = true }
      fights++
      const f = fight(levers, php, mon)
      rec.fight = { result: f.result, turns: f.turns, hpBefore, hpAfter: f.hp, potionUsed, hpHealed: healed }
      if (isBoss) bossResult = f.result
      if (f.result === 'win') {
        victories++; php = f.hp
        const loot = rollNodeLoot(dg, roll, node.kind as LootNodeKind, level, race, klass)
        rec.gold = loot.gold; gold += loot.gold
        rec.drops = loot.drops.map(d => ({ name: d.name, rarity: String(d.rarity ?? '—'), kind: d.kind, emoji: d.emoji, enhancement: d.enhancement, source: node.kind as DropRec['source'] }))
        dropCount += rec.drops.length
      } else {
        completed = false; outcome = f.result === 'loss' ? 'loss' : 'timeout'
        failNode = `${node.kind} · ${mon.name}`
        nodes.push(rec); break
      }
    } else {
      const loot = rollNodeLoot(dg, roll, node.kind as LootNodeKind, level, race, klass)
      rec.gold = loot.gold; gold += loot.gold
      rec.drops = loot.drops.map(d => ({ name: d.name, rarity: String(d.rarity ?? '—'), kind: d.kind, emoji: d.emoji, enhancement: d.enhancement, source: 'find' as const }))
      dropCount += rec.drops.length
    }
    nodes.push(rec)
  }
  return { n, completed, outcome, fights, victories, potionsUsed, hpHealed, gold, dropCount, bossResult, failNode, nodes }
}

// Monte Carlo do boss no gear-alvo, por classe → win% (alvo de design ~65%).
function bossGateWinRate(dg: DungeonDef, klass: CombatClass, race: string, iters: number): number {
  const tg = TARGET_GEAR[dg.id]
  const { attrs, baseHp } = buildChar(race, klass, dg.clearLevel)
  const g = gearFor(tg.rarity, tg.enh)
  const levers = computeLevers(klass, dg.clearLevel, g.gearTier, attrs)
  const effMaxHp = baseHp + g.gearHp
  let wins = 0
  for (let i = 0; i < iters; i++) {
    const boss = scaleMonster(dg.boss, dg, dg.clearLevel, { tier: dg.rooms, isMain: true, isBoss: true }, klass)
    if (fight(levers, effMaxHp, boss).result === 'win') wins++
  }
  return wins / iters
}

function runScenario(dg: DungeonDef, klass: CombatClass, race: string): Scenario {
  const tg = TARGET_GEAR[dg.id]
  const level = Number(process.env.LEVEL) || dg.clearLevel
  const { attrs, baseHp } = buildChar(race, klass, level)
  const g = gearFor(tg.rarity, tg.enh)
  const levers = computeLevers(klass, level, g.gearTier, attrs)
  const effMaxHp = baseHp + g.gearHp
  const runs: RunRec[] = []
  for (let i = 1; i <= RUNS; i++) runs.push(simulateRun(i, dg, klass, race, level, levers, effMaxHp))
  const bossGate = ALL_CLASSES.map(k => ({ klass: k, winRate: bossGateWinRate(dg, k, race, BOSS_GATE_ITERS) }))
  return {
    dungeon: dg, klass, race, level,
    gear: { ...tg, gearTier: g.gearTier, gearHp: g.gearHp }, attrs, effMaxHp, levers, runs, bossGate,
  }
}

// ============================================================
// AGREGAÇÕES (para HTML)
// ============================================================
interface DropAgg { name: string; rarity: string; kind: string; emoji: string; count: number; runsWith: number; bySource: Record<string, number> }
function aggregateDrops(runs: RunRec[]) {
  const map = new Map<string, DropAgg>()
  for (const r of runs) {
    const seen = new Set<string>()
    for (const nd of r.nodes) for (const d of nd.drops) {
      const key = `${d.name}|${d.rarity}`
      let a = map.get(key)
      if (!a) { a = { name: d.name, rarity: d.rarity, kind: d.kind, emoji: d.emoji, count: 0, runsWith: 0, bySource: {} }; map.set(key, a) }
      a.count++; a.bySource[d.source] = (a.bySource[d.source] || 0) + 1
      if (!seen.has(key)) { a.runsWith++; seen.add(key) }
    }
  }
  return Array.from(map.values())
}

const RARITY_ORDER = ['LEGENDARY', 'EPIC', 'RARE', 'UNCOMMON', 'COMMON', '—']
const sum = (a: number[]) => a.reduce((s, x) => s + x, 0)
const pct = (x: number) => `${(x * 100).toFixed(0)}%`
const fix = (x: number, d = 1) => x.toFixed(d)

// ============================================================
// CONSOLE (resumo conciso)
// ============================================================
function printConsole(sc: Scenario) {
  const { dungeon: dg } = sc
  const clears = sc.runs.filter(r => r.completed).length
  const bossWins = sc.runs.filter(r => r.bossResult === 'win').length
  const bossAtt = sc.runs.filter(r => r.bossResult).length
  console.log(`\n${dg.emoji} ${dg.name} — ${sc.klass} Nv.${sc.level} · ${sc.gear.rarity} +${sc.gear.enh} (${sc.gear.tag})`)
  console.log(`  Runs limpas ${clears}/${sc.runs.length} · Boss ${bossWins}/${bossAtt} · drops ${sum(sc.runs.map(r => r.dropCount))} · gold ${sum(sc.runs.map(r => r.gold))}`)
  console.log(`  Boss-gate (Monte Carlo ${BOSS_GATE_ITERS}× no gear-alvo, alvo ~65%): ` +
    sc.bossGate.map(b => `${b.klass} ${pct(b.winRate)}`).join(' · '))
}

// ============================================================
// HTML
// ============================================================
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const rBadge = (r: string) => `<span class="r r-${r}">${r}</span>`
const kindIcon: Record<string, string> = { minor: '·', main: '⚔️', boss: '👑', start: '🚪' }

function scenarioHtml(sc: Scenario): string {
  const { dungeon: dg } = sc
  const runs = sc.runs
  const clears = runs.filter(r => r.completed).length
  const bossWins = runs.filter(r => r.bossResult === 'win').length
  const bossAtt = runs.filter(r => r.bossResult).length
  const totFights = sum(runs.map(r => r.fights))
  const totVic = sum(runs.map(r => r.victories))
  const totGold = sum(runs.map(r => r.gold))
  const totDrops = sum(runs.map(r => r.dropCount))
  const totPot = sum(runs.map(r => r.potionsUsed))
  const totHeal = sum(runs.map(r => r.hpHealed))

  // Win-rate por tipo de nó (rampa de salas)
  const byKind = (k: NodeKind) => {
    const fs = runs.flatMap(r => r.nodes.filter(n => n.kind === k && n.fight))
    const w = fs.filter(n => n.fight!.result === 'win').length
    return fs.length ? { w, n: fs.length, rate: w / fs.length } : null
  }
  const minorWR = byKind('minor'), mainWR = byKind('main')

  const drops = aggregateDrops(runs)
  drops.sort((a, b) => (RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity)) || b.count - a.count || a.name.localeCompare(b.name))

  // Distribuição por raridade
  const byRarity = new Map<string, number>()
  for (const d of drops) byRarity.set(d.rarity, (byRarity.get(d.rarity) || 0) + d.count)
  const rarityBars = RARITY_ORDER.filter(r => byRarity.has(r)).map(r => {
    const c = byRarity.get(r)!
    return `<div class="bar-row"><span class="bar-lab">${rBadge(r)}</span><div class="bar"><div class="bar-fill r-bg-${r}" style="width:${(c / totDrops * 100).toFixed(1)}%"></div></div><span class="bar-val">${c} · ${(c / totDrops * 100).toFixed(0)}%</span></div>`
  }).join('')

  // Boss-gate matrix (por classe)
  const gateRows = sc.bossGate.map(b => {
    const ok = Math.abs(b.winRate - BOSS_TARGET_WIN) <= 0.12
    const cls = b.winRate < BOSS_TARGET_WIN - 0.12 ? 'bad' : b.winRate > BOSS_TARGET_WIN + 0.12 ? 'high' : 'ok'
    return `<tr><td>${b.klass}${b.klass === sc.klass ? ' <b>◀</b>' : ''}</td><td class="num ${cls}">${pct(b.winRate)}</td><td><div class="bar mini"><div class="bar-fill ${cls === 'bad' ? 'b-bad' : cls === 'high' ? 'b-high' : 'b-ok'}" style="width:${(b.winRate * 100).toFixed(0)}%"></div><span class="target" style="left:${BOSS_TARGET_WIN * 100}%"></span></div></td><td>${ok ? '✅' : cls === 'bad' ? '⚠️ baixo' : '⬆️ alto'}</td></tr>`
  }).join('')

  // Tabela de drops
  const dropRows = drops.map(d => {
    const src = ['boss', 'main', 'minor', 'find'].filter(s => d.bySource[s]).map(s => `${kindIcon[s] || '🔍'}${d.bySource[s]}`).join(' ')
    return `<tr><td>${d.emoji} ${esc(d.name)}</td><td>${rBadge(d.rarity)}</td><td>${d.kind}</td><td class="num">${d.count}</td><td class="num">${d.runsWith}/${runs.length}</td><td class="src">${src}</td></tr>`
  }).join('')

  // Runs detalhadas (accordion)
  const runDetails = runs.map(r => {
    const rows = r.nodes.filter(n => n.kind !== 'start').map(n => {
      const tag = `${kindIcon[n.kind] || '?'} ${n.kind}`
      let battle = '<span class="muted">achado</span>'
      if (n.monster) {
        const f = n.fight!
        const res = f.result === 'win' ? '<span class="win">✅</span>' : f.result === 'loss' ? '<span class="loss">❌</span>' : '<span class="loss">⏱️</span>'
        battle = `${n.monster.emoji} ${esc(n.monster.name)} <span class="muted">Nv${n.monster.level} · ${n.monster.hp}hp/${n.monster.attack}atk/${n.monster.defense}def</span> ${res} <span class="muted">${f.turns}t · HP ${f.hpAfter}${f.potionUsed ? ` <span class="pot">🧪+${f.hpHealed}</span>` : ''}</span>`
      }
      const loot = n.drops.length ? n.drops.map(d => `<span class="chip r-bd-${d.rarity}">${d.emoji}${esc(d.name)}${d.enhancement ? `+${d.enhancement}` : ''}</span>`).join('') : '<span class="muted">—</span>'
      return `<tr><td class="num">${n.idx}</td><td>${tag}</td><td class="num">${n.roll || '—'}</td><td>${battle}</td><td class="num">${n.gold}</td><td>${loot}</td></tr>`
    }).join('')
    const head = `Run #${r.n} — ${r.completed ? '🏆 limpou' : `💀 ${r.outcome}`} · ${r.victories}/${r.fights} lutas · ${r.potionsUsed}🧪 · ${r.gold}g · ${r.dropCount} drops`
    return `<details class="run ${r.completed ? '' : 'failed'}"><summary>${head}</summary>
      <table class="nodes"><thead><tr><th>#</th><th>nó</th><th>d20</th><th>combate / achado</th><th>gold</th><th>loot</th></tr></thead><tbody>${rows}</tbody></table></details>`
  }).join('')

  const objClears = clears === runs.length
  const objBoss = bossAtt > 0 && Math.abs(bossWins / bossAtt - BOSS_TARGET_WIN) <= 0.15

  return `
<section class="scenario">
  <h2>${dg.emoji} ${dg.name} <span class="tag">${sc.gear.rarity} +${sc.gear.enh} · ${sc.gear.tag}</span></h2>
  <div class="meta">Nv.${sc.level} ${sc.klass} ${sc.race} · STR ${sc.attrs.str}/AGI ${sc.attrs.agi}/INT ${sc.attrs.int}/DEF ${sc.attrs.def} · HP ${sc.effMaxHp} · gearTier ${fix(sc.gear.gearTier, 3)} · Power ${fix(sc.levers.power)} · Armor ${fix(sc.levers.armor)} · levelReq ${dg.levelReq}→clear ${dg.clearLevel} · ${dg.rooms} salas + ${dg.minorNodes} menores/sala</div>

  <div class="cards">
    <div class="card"><div class="big">${clears}/${runs.length}</div><div class="lab">runs limpas</div></div>
    <div class="card"><div class="big">${bossAtt ? pct(bossWins / bossAtt) : '—'}</div><div class="lab">boss vencido (${bossWins}/${bossAtt})</div></div>
    <div class="card"><div class="big">${minorWR ? pct(minorWR.rate) : '—'} / ${mainWR ? pct(mainWR.rate) : '—'}</div><div class="lab">win nó menor / sala</div></div>
    <div class="card"><div class="big">${fix(totDrops / runs.length)}</div><div class="lab">drops/run (${totDrops} total)</div></div>
    <div class="card"><div class="big">${Math.round(totGold / runs.length)}</div><div class="lab">gold/run (${totGold} total)</div></div>
    <div class="card"><div class="big">${fix(totPot / runs.length)}</div><div class="lab">poções/run (${totHeal} HP)</div></div>
  </div>

  <div class="objbox">
    <b>Objetivo de design:</b>
    <span class="${objClears ? 'pass' : 'warn'}">${objClears ? '✅' : '⚠️'} Trajeto (salas/nós) vencível — ${totVic}/${totFights} lutas não-boss limpas</span> ·
    <span class="${objBoss ? 'pass' : 'warn'}">${objBoss ? '✅' : '⚠️'} Boss = gate de gear (~65% no gear-alvo)</span>
  </div>

  <div class="grid2">
    <div>
      <h3>🎲 Win-rate do BOSS no gear-alvo, por classe <span class="muted">(Monte Carlo ${BOSS_GATE_ITERS}×, alvo ${pct(BOSS_TARGET_WIN)})</span></h3>
      <table class="gate"><thead><tr><th>classe</th><th>win%</th><th></th><th></th></tr></thead><tbody>${gateRows}</tbody></table>
    </div>
    <div>
      <h3>📊 Drops por raridade</h3>
      ${rarityBars}
    </div>
  </div>

  <h3>📦 Lista de drops agregada (${runs.length} runs) <span class="muted">— origem: 👑boss ⚔️sala ·menor 🔍achado</span></h3>
  <table class="drops"><thead><tr><th>item</th><th>raridade</th><th>tipo</th><th>qtd</th><th>runs c/</th><th>origem</th></tr></thead><tbody>${dropRows}</tbody></table>

  <h3>🗺️ Detalhe das runs</h3>
  ${runDetails}
</section>`
}

function buildHtml(scenarios: Scenario[]): string {
  const nav = scenarios.length > 1
    ? `<nav>${scenarios.map((s, i) => `<a href="#sc${i}">${s.dungeon.emoji} ${s.dungeon.name}</a>`).join('')}</nav>` : ''
  const body = scenarios.map((s, i) => `<a id="sc${i}"></a>${scenarioHtml(s)}`).join('')
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dolrath — Relatório de Masmorra</title>
<style>
:root{--bg:#0f1115;--panel:#181b22;--panel2:#1f232c;--line:#2a2f3a;--txt:#e6e9ef;--muted:#8b93a3;--acc:#34d399}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--txt);font:14px/1.5 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
header{padding:20px 28px;border-bottom:1px solid var(--line);background:linear-gradient(180deg,#1a1d24,#0f1115)}
header h1{margin:0 0 4px;font-size:20px}header .sub{color:var(--muted);font-size:13px}
nav{position:sticky;top:0;z-index:5;display:flex;gap:6px;flex-wrap:wrap;padding:10px 28px;background:#11141a;border-bottom:1px solid var(--line)}
nav a{color:var(--txt);text-decoration:none;background:var(--panel2);padding:5px 11px;border-radius:7px;font-size:13px;border:1px solid var(--line)}
nav a:hover{border-color:var(--acc)}
section.scenario{padding:22px 28px;border-bottom:8px solid #0a0c0f}
h2{font-size:18px;margin:0 0 4px}h2 .tag{font-size:12px;color:#0f1115;background:var(--acc);padding:2px 8px;border-radius:6px;vertical-align:middle;font-weight:700}
h3{font-size:14px;margin:22px 0 10px;color:#cdd3df}
.meta{color:var(--muted);font-size:12.5px;margin-bottom:14px}
.cards{display:flex;gap:10px;flex-wrap:wrap;margin:6px 0 14px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:12px 16px;min-width:120px;flex:1}
.card .big{font-size:22px;font-weight:700}.card .lab{color:var(--muted);font-size:12px}
.objbox{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:11px 14px;margin:6px 0 8px;font-size:13px}
.objbox .pass{color:var(--acc)}.objbox .warn{color:#fbbf24}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:26px;align-items:start}
@media(max-width:820px){.grid2{grid-template-columns:1fr}}
table{border-collapse:collapse;width:100%;font-size:13px;background:var(--panel);border:1px solid var(--line);border-radius:8px;overflow:hidden}
th,td{padding:6px 10px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top}
th{background:var(--panel2);color:var(--muted);font-weight:600;font-size:12px}
tr:last-child td{border-bottom:none}
td.num{text-align:right;font-variant-numeric:tabular-nums}
.muted{color:var(--muted)}.win{color:var(--acc)}.loss{color:#f87171}.pot{color:#5eead4}
.num.bad{color:#f87171}.num.high{color:#fbbf24}.num.ok{color:var(--acc)}
.r{font-size:11px;font-weight:700;padding:1px 6px;border-radius:5px;border:1px solid}
.r-LEGENDARY{color:#f59e0b;border-color:#f59e0b;background:#3a2a05}
.r-EPIC{color:#c084fc;border-color:#c084fc;background:#2a1840}
.r-RARE{color:#60a5fa;border-color:#60a5fa;background:#102a4a}
.r-UNCOMMON{color:#34d399;border-color:#34d399;background:#0c3327}
.r-COMMON{color:#9ca3af;border-color:#4b5563;background:#1c1f26}
.r-\\—{color:#6b7280;border-color:#374151}
.r-bg-LEGENDARY{background:#f59e0b}.r-bg-EPIC{background:#c084fc}.r-bg-RARE{background:#60a5fa}.r-bg-UNCOMMON{background:#34d399}.r-bg-COMMON{background:#6b7280}
.bar-row{display:flex;align-items:center;gap:10px;margin:5px 0}.bar-lab{width:90px}.bar-val{width:90px;color:var(--muted);font-size:12px;text-align:right}
.bar{flex:1;height:14px;background:#11141a;border-radius:7px;overflow:hidden;border:1px solid var(--line);position:relative}
.bar.mini{height:12px}.bar-fill{height:100%}
.b-ok{background:var(--acc)}.b-bad{background:#f87171}.b-high{background:#fbbf24}
.target{position:absolute;top:-2px;bottom:-2px;width:2px;background:#fff;opacity:.6}
.gate td{vertical-align:middle}
.src{color:var(--muted);font-size:12px;letter-spacing:1px}
.chip{display:inline-block;font-size:11.5px;padding:1px 6px;margin:1px 3px 1px 0;border-radius:5px;background:#13161c;border:1px solid var(--line)}
.r-bd-LEGENDARY{border-color:#f59e0b}.r-bd-EPIC{border-color:#c084fc}.r-bd-RARE{border-color:#60a5fa}.r-bd-UNCOMMON{border-color:#34d399}.r-bd-COMMON{border-color:#374151}
details.run{background:var(--panel);border:1px solid var(--line);border-radius:8px;margin:7px 0}
details.run.failed{border-color:#7f1d1d}
details.run>summary{cursor:pointer;padding:9px 13px;font-weight:600;font-size:13px;user-select:none}
details.run[open]>summary{border-bottom:1px solid var(--line)}
table.nodes,table.nodes th,table.nodes td{font-size:12.5px}
table.nodes{border:none;border-radius:0}
</style></head><body>
<header><h1>🗺️ Dolrath — Relatório de Masmorra</h1>
<div class="sub">${RUNS} runs/cenário · combate e loot da lógica de produção (scaleMonster · contestedOutcome · rollNodeLoot) · gerado ${new Date().toLocaleString('pt-BR')}</div></header>
${nav}
${body}
</body></html>`
}

// ============================================================
// MAIN
// ============================================================
const targets: DungeonId[] = ALL
  ? ['floresta', 'caverna', 'pantano', 'ruinas']
  : [((process.env.DUNGEON || process.argv[2] || 'floresta') as DungeonId)]

if (targets.some(id => !DUNGEONS[id])) {
  console.error(`❌ Masmorra inválida. Opções: ${Object.keys(DUNGEONS).join(', ')}, all`)
  process.exit(1)
}

console.log('═'.repeat(80))
console.log(`Simulando ${targets.length} cenário(s) × ${RUNS} runs (+ boss-gate ${BOSS_GATE_ITERS}× por classe)…`)
const scenarios = targets.map(id => {
  const sc = runScenario(DUNGEONS[id], CLASS, RACE)
  printConsole(sc)
  return sc
})

fs.writeFileSync(OUT, buildHtml(scenarios))
console.log('═'.repeat(80))
console.log(`\n📄 Relatório HTML salvo em:\n   ${OUT}\n   abra com:  open "${OUT}"\n`)
