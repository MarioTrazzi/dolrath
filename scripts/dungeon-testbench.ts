#!/usr/bin/env ts-node
// ============================================================
// DOLRATH — BATERIA DE TESTES DAS MASMORRAS
//
// Responde duas perguntas que nenhum sim existente responde:
//
//   1. "Qual é o herói MÍNIMO que vence o chefe desta masmorra?"
//      Os sims atuais (dungeon-difficulty-sim) só testam o clearLevel FIXO
//      contra uma escada de gear. Nunca variam o NÍVEL, então não dá para
//      perguntar "nv8 com raro DUO passa?" nem "no nv12 dá pra ir de +12?".
//      A Fase 1 varre nível × gear e lê o limiar.
//
//   2. "O drop desta masmorra está correto?"
//      A Fase 2 roda runs completas com o herói NO limiar e mede o espólio.
//      A Fase 3 audita a estrutura do sorteio e aponta buracos.
//
// ⚠️ AS DUAS FÓRMULAS DE HP (o motivo de esta bateria existir)
// O boss é dimensionado por dungeonAdventures.anchorAt, que assume que o
// jogador tem `80 + str*2 + def*4` de HP. Mas do nível 2 em diante o banco
// grava `100 + level*6 + str/2 + def*4` (computeDerivedStats), e é ESSE valor
// que DungeonRun.tsx leva para a luta. O jogador real entra com bem mais HP do
// que a calibração supõe, e o erro cresce com o nível.
//
// Por isso toda tabela sai em DUAS colunas:
//   real  → fórmula de produção (o jogo que está no ar)
//   calib → fórmula que dimensionou o boss (o jogo que os sims descrevem)
// Medir só com `calib` seria repetir o desvio em silêncio; medir só com `real`
// esconderia de onde ele veio.
//
// Uso:
//   npm run sim:dungeons                      → tudo (as 3 fases, 4 masmorras)
//   PHASE=1 npm run sim:dungeons              → só o limiar do chefe
//   PHASE=3 npm run sim:dungeons              → só a auditoria de drop (rápida)
//   DUNGEON=ruinas CLASS=mage npm run sim:dungeons
//   ITERS=8000 RUNS=3000 npm run sim:dungeons → mais precisão
//   OUT=/tmp/rel.html npm run sim:dungeons
//
// ⚠️ es5: o tsconfig do projeto compila em es5 sem downlevelIteration, então
// `[...map]` vira array VAZIO em silêncio (já mordeu o repair-economy-sim). O
// npm script força target es2019 — se você invocar à mão, force também.
// ============================================================

import * as fs from 'fs'
import * as path from 'path'

import {
  DUNGEONS, DUNGEON_LIST, scaleMonster, scaleMonsterGroup, pickMonster,
  rollNodeLoot, rollKillLoot, clampDungeonTier, MAX_DUNGEON_TIER,
  type DungeonDef, type DungeonId, type ScaledMonster, type LootDrop, type LootNodeKind,
} from '@/lib/dungeonAdventures'
import {
  computeLevers, transformLevers, resolveHit, resolveMonsterHit,
  normalizeCombatClass, PVE_DIE, ATTACKS, K50, MAX_LEVEL_REF,
  type CombatClass, type Levers,
} from '@/lib/combatModel'
import { wearFor } from '@/lib/durability'
import { maintenanceWearFactor, SPARE_PART_DURABILITY, type GearWearSnapshot } from '@/lib/maintenanceLoot'
import { rollEquipmentDrop, dropSlotGroupOf, ITEM_CATALOG, RARITY_DROP_WEIGHT } from '@/lib/itemCatalog'
import { REPAIR_PER_DUPLICATE } from '@/lib/enhancementSystem'

import {
  buildHero, gearFor, TARGET_GEAR, ALL_CLASSES, RARITY_PT, enhLabel,
  type Hero, type Rarity,
} from './lib/synthHero'

// ============================================================
// CONFIG
// ============================================================
const PHASE = process.env.PHASE || 'all'
const RACE = process.env.RACE || 'humano'
const ITERS = Number(process.env.ITERS) || 3000   // lutas por célula da Fase 1
const RUNS = Number(process.env.RUNS) || 1200     // runs completas por célula da Fase 2
const OUT = process.env.OUT || path.join(process.cwd(), 'dungeon-testbench.html')
const ONLY_DUNGEON = process.env.DUNGEON as DungeonId | undefined
const ONLY_CLASS = normalizeCombatClass(process.env.CLASS || '') as CombatClass | null

const DUNGEONS_TO_RUN: DungeonDef[] = ONLY_DUNGEON
  ? [DUNGEONS[ONLY_DUNGEON]].filter(Boolean)
  : DUNGEON_LIST
const CLASSES_TO_RUN: CombatClass[] = ONLY_CLASS ? [ONLY_CLASS] : ALL_CLASSES

const ROMAN = ['I', 'II', 'III', 'IV', 'V']

/** Qual fórmula de HP o herói leva para a luta. */
type HpMode = 'real' | 'calib'

// Limiares de leitura da matriz da Fase 1.
const TH_TIGHT = 0.50    // "APERTADO" — dá pra tentar
const TH_COMFY = 0.65    // "CONFORTÁVEL" — o BOSS_TARGET_WIN de design
const TH_EASY = 0.85     // "COM FOLGA" — o "com facilidade" do pedido

/**
 * Escada de gear da Fase 1. A escada do dungeon-difficulty-sim começa em
 * "comum +15", mas a pergunta que motivou esta bateria ("nv10 e equipe +15")
 * cai ABAIXO disso — então ela desce até o gear pelado.
 */
interface Rung { rarity: Rarity; enh: number; label: string }
const RUNGS: Rung[] = [
  { rarity: 'COMMON',    enh: 0,  label: 'comum +0' },
  { rarity: 'COMMON',    enh: 5,  label: 'comum +5' },
  { rarity: 'COMMON',    enh: 10, label: 'comum +10' },
  { rarity: 'COMMON',    enh: 15, label: 'comum +15' },
  { rarity: 'UNCOMMON',  enh: 15, label: 'incomum +15' },
  { rarity: 'UNCOMMON',  enh: 16, label: 'incomum PRI' },
  { rarity: 'RARE',      enh: 17, label: 'raro DUO' },
  { rarity: 'EPIC',      enh: 18, label: 'épico TRI' },
  { rarity: 'LEGENDARY', enh: 19, label: 'lendário TET' },
  { rarity: 'LEGENDARY', enh: 20, label: 'lendário PEN' },
]

// ============================================================
// MOTOR DE COMBATE — porta fiel de DungeonRun.tsx
// (mesma resolução de dungeon-full-run-test.ts:130, mantida idêntica de
// propósito: se divergir, a Fase 1 deixa de ser comparável com os sims que
// calibraram BOSS_HP_MULT.)
// ============================================================
type AttackKind = 'basic' | 'weapon' | 'special'
const TRANSFORM_ON = 4, TRANSFORM_CYCLE = 10

function monsterLevers(m: ScaledMonster): Levers {
  const S = m.level / MAX_LEVEL_REF + 0.5
  return { power: m.attack, armor: m.defense, hp: m.maxHp, evade: m.evade, block: 0, K: K50 * S, scale: m.scale ?? S }
}

/** Jogador ataca: ELE rola o dado (sorte multiplicativa); o monstro esquiva por % pura. */
function playerStrike(power: number, sides: number, d: { armor: number; K: number; evade: number }): number {
  return resolveHit({ power }, d, { defense: 'dodge', sides }).damage
}
/** Monstro ataca: ele NÃO rola; o jogador esquiva por % pura (nat max = esquiva garantida). */
function monsterStrike(power: number, sides: number, d: { armor: number; K: number; evade: number }): number {
  return resolveMonsterHit({ power, sides, defender: d }).damage
}

interface FightResult { result: 'win' | 'loss' | 'timeout'; hp: number; turns: number }

function fight(base: Levers, startHp: number, m: ScaledMonster): FightResult {
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
      mhp -= playerStrike(pl.power * ATTACKS[kind].powerMult, PVE_DIE[kind], mLev)
      pturn++
    } else {
      const r = Math.random()
      const kind: AttackKind = m.isBoss
        ? (r < 0.35 ? 'basic' : r < 0.7 ? 'weapon' : 'special')
        : m.hasSpecial ? (r < 0.5 ? 'basic' : r < 0.8 ? 'weapon' : 'special')
        : (r < 0.55 ? 'basic' : 'weapon')
      const isTr = (pturn % TRANSFORM_CYCLE) < TRANSFORM_ON
      const pl = isTr ? transformed : base
      php -= monsterStrike(mLev.power * ATTACKS[kind].powerMult, PVE_DIE[kind], { armor: pl.armor, K: pl.K, evade: pl.evade })
    }
    playerTurn = !playerTurn
  }
  return { result: mhp <= 0 && php > 0 ? 'win' : php <= 0 ? 'loss' : 'timeout', hp: Math.max(0, php), turns: t }
}

/** Luta contra um PACOTE (nó menor): todos os vivos batem por rodada. */
function fightPack(base: Levers, startHp: number, pack: ScaledMonster[]): { result: 'win' | 'loss' | 'timeout'; hp: number; killed: ScaledMonster[] } {
  const transformed = transformLevers(base)
  const levs = pack.map(monsterLevers)
  const hps = pack.map(m => m.hp)
  const killed: ScaledMonster[] = []
  let php = startHp
  let playerTurn = Math.random() < 0.5
  let pturn = 0, t = 0
  const alive = () => hps.some(h => h > 0)
  for (; t < 900 && php > 0 && alive(); t++) {
    if (playerTurn) {
      // Mira o mais fraco vivo (espelha autoPickAttack do piloto automático).
      let idx = -1, best = Infinity
      for (let i = 0; i < hps.length; i++) if (hps[i] > 0 && hps[i] < best) { best = hps[i]; idx = i }
      if (idx < 0) break
      const isTr = pturn % TRANSFORM_CYCLE < TRANSFORM_ON
      const pl = isTr ? transformed : base
      const kind: AttackKind = isTr ? 'special' : 'weapon'
      hps[idx] -= playerStrike(pl.power * ATTACKS[kind].powerMult, PVE_DIE[kind], levs[idx])
      if (hps[idx] <= 0) killed.push(pack[idx])
      pturn++
    } else {
      const isTr = (pturn % TRANSFORM_CYCLE) < TRANSFORM_ON
      const pl = isTr ? transformed : base
      const def = { armor: pl.armor, K: pl.K, evade: pl.evade }
      for (let i = 0; i < hps.length; i++) {
        if (hps[i] <= 0 || php <= 0) continue
        const m = pack[i], r = Math.random()
        const kind: AttackKind = m.hasSpecial ? (r < 0.5 ? 'basic' : r < 0.8 ? 'weapon' : 'special') : (r < 0.55 ? 'basic' : 'weapon')
        php -= monsterStrike(levs[i].power * ATTACKS[kind].powerMult, PVE_DIE[kind], def)
      }
    }
    playerTurn = !playerTurn
  }
  return { result: !alive() && php > 0 ? 'win' : php <= 0 ? 'loss' : 'timeout', hp: Math.max(0, php), killed }
}

/** Levers + HP efetivo de um herói, na fórmula de HP escolhida. */
function leversOf(h: Hero): Levers {
  return computeLevers(h.klass, h.level, h.gear.gearTier, h.attrs)
}
function hpOf(h: Hero, mode: HpMode): number {
  return mode === 'real' ? h.maxHp : h.maxHpCalib
}

// ============================================================
// FASE 1 — LIMIAR DO CHEFE
// Varredura nível × gear. Responde "qual o herói mínimo que vence o chefe".
// ============================================================
interface Cell { level: number; rung: number; win: number }

/**
 * Um limiar tem SEMPRE duas leituras, porque nível e gear são dois custos
 * diferentes (nível custa tempo, gear custa pedra). A primeira versão desta
 * bateria devolvia só "a célula mais barata", e ela caía sempre no canto do
 * eixo — dizia "nv1 com raro DUO", que é verdade e é inútil.
 *
 *   gearAt   → PARADO no nível-alvo da banda, qual o gear MÍNIMO que serve
 *   levelAt  → PARADO no gear-alvo da masmorra, qual o nível MÍNIMO que serve
 *
 * É o par que responde a pergunta do jeito que ela é feita: "para vencer o
 * chefe da Floresta com facilidade preciso de nv10 e equipamento +quanto?"
 */
interface ThresholdPair {
  gearAt?: { rung: Rung; win: number }    // no clearLevel
  levelAt?: { level: number; win: number } // com o gear-alvo
}
interface BossMatrix {
  dungeon: DungeonDef
  klass: CombatClass
  mode: HpMode
  levels: number[]
  cells: Cell[]                    // indexado por [levelIdx * RUNGS.length + rungIdx]
  tight: ThresholdPair
  comfy: ThresholdPair
  easy: ThresholdPair
  /** win% na âncora de design: clearLevel com o gear-alvo, tier I. */
  atTarget: number
  /** win% no gear-alvo por TIER de masmorra (I..V) — o outro eixo de dificuldade. */
  byTier: number[]
}

function bossWinRate(dg: DungeonDef, klass: CombatClass, level: number, rung: Rung, mode: HpMode, iters: number, dungeonTier = 1): number {
  const hero = buildHero(RACE, klass, level, rung.rarity, rung.enh)
  const levers = leversOf(hero)
  const hp = hpOf(hero, mode)
  // O boss ancora no clearLevel FIXO (não no nível do jogador) — é o que faz
  // under-leveled travar e over-leveled virar farm. scaleMonster cuida disso.
  // `dungeonTier` é o outro eixo: +18% em poder/HP por degrau acima de I.
  let wins = 0
  for (let i = 0; i < iters; i++) {
    const boss = scaleMonster(dg.boss, dg, level, { tier: dg.rooms, isMain: true, isBoss: true }, klass, dungeonTier)
    if (fight(levers, hp, boss).result === 'win') wins++
  }
  return wins / iters
}

function levelAxis(dg: DungeonDef): number[] {
  const lo = Math.max(1, dg.levelReq - 2)
  const hi = dg.clearLevel + 3
  const out: number[] = []
  // Passo 1 nas bandas curtas, 2 nas longas — senão Caverna/Pântano viram 16
  // colunas × 10 degraus × ITERS lutas e a bateria demora demais.
  const step = hi - lo > 14 ? 2 : 1
  for (let l = lo; l <= hi; l += step) out.push(l)
  if (out.indexOf(hi) < 0) out.push(hi)
  // O clearLevel precisa estar no eixo: é a âncora de design e a linha que a
  // leitura `gearAt` usa.
  if (out.indexOf(dg.clearLevel) < 0) out.push(dg.clearLevel)
  out.sort((a, b) => a - b)
  return out
}

/** Índice do degrau que corresponde ao gear-alvo da masmorra. */
function targetRungIndex(dg: DungeonDef): number {
  const tg = TARGET_GEAR[dg.id]
  for (let i = 0; i < RUNGS.length; i++) if (RUNGS[i].rarity === tg.rarity && RUNGS[i].enh === tg.enh) return i
  return RUNGS.length - 1
}

function buildBossMatrix(dg: DungeonDef, klass: CombatClass, mode: HpMode): BossMatrix {
  const levels = levelAxis(dg)
  const cells: Cell[] = []
  for (let li = 0; li < levels.length; li++) {
    for (let ri = 0; ri < RUNGS.length; ri++) {
      cells.push({ level: levels[li], rung: ri, win: bossWinRate(dg, klass, levels[li], RUNGS[ri], mode, ITERS) })
    }
  }
  const clearIdx = levels.indexOf(dg.clearLevel)
  const tgIdx = targetRungIndex(dg)
  const cellAt = (li: number, ri: number) => cells[li * RUNGS.length + ri]

  const pairFor = (target: number): ThresholdPair => {
    const pair: ThresholdPair = {}
    // gearAt: anda os degraus de gear no clearLevel até bater o alvo.
    if (clearIdx >= 0) {
      for (let ri = 0; ri < RUNGS.length; ri++) {
        const c = cellAt(clearIdx, ri)
        if (c && c.win >= target) { pair.gearAt = { rung: RUNGS[ri], win: c.win }; break }
      }
    }
    // levelAt: anda os níveis com o gear-alvo até bater o alvo.
    for (let li = 0; li < levels.length; li++) {
      const c = cellAt(li, tgIdx)
      if (c && c.win >= target) { pair.levelAt = { level: levels[li], win: c.win }; break }
    }
    return pair
  }

  const tg = TARGET_GEAR[dg.id]
  const targetRung: Rung = { rarity: tg.rarity, enh: tg.enh, label: tg.tag }
  const byTier: number[] = []
  for (let t = 1; t <= MAX_DUNGEON_TIER; t++) byTier.push(bossWinRate(dg, klass, dg.clearLevel, targetRung, mode, ITERS, t))
  return {
    dungeon: dg, klass, mode, levels, cells,
    tight: pairFor(TH_TIGHT), comfy: pairFor(TH_COMFY), easy: pairFor(TH_EASY),
    atTarget: byTier[0], byTier,
  }
}

function thLabel(dg: DungeonDef, p: ThresholdPair): string {
  const tg = TARGET_GEAR[dg.id]
  const g = p.gearAt
    ? `no nv${dg.clearLevel}: ${p.gearAt.rung.label} (${(p.gearAt.win * 100).toFixed(0)}%)`
    : `no nv${dg.clearLevel}: nem lendário PEN chega`
  const l = p.levelAt
    ? `com ${RARITY_PT[tg.rarity]} ${tg.tag}: nv${p.levelAt.level} (${(p.levelAt.win * 100).toFixed(0)}%)`
    : `com ${RARITY_PT[tg.rarity]} ${tg.tag}: nenhum nível da faixa chega`
  return `${g}   ·   ${l}`
}

function runPhase1(): BossMatrix[] {
  const out: BossMatrix[] = []
  console.log('\n' + '='.repeat(100))
  console.log('  FASE 1 — LIMIAR DO CHEFE   (o herói MÍNIMO que vence)')
  console.log(`  ${ITERS} lutas/célula · raça ${RACE} · APERTADO ≥${TH_TIGHT * 100}% · CONFORTÁVEL ≥${TH_COMFY * 100}% · COM FOLGA ≥${TH_EASY * 100}%`)
  console.log('  real = fórmula de HP que o jogo usa · calib = fórmula contra a qual o boss foi dimensionado')
  console.log('='.repeat(100))
  for (const dg of DUNGEONS_TO_RUN) {
    const tg = TARGET_GEAR[dg.id]
    console.log(`\n── ${dg.emoji} ${dg.name.toUpperCase()} (nv${dg.levelReq}→${dg.clearLevel}) — alvo de design: ${RARITY_PT[tg.rarity]} ${tg.tag} ──`)
    for (const klass of CLASSES_TO_RUN) {
      const real = buildBossMatrix(dg, klass, 'real')
      const calib = buildBossMatrix(dg, klass, 'calib')
      out.push(real, calib)
      const drift = (real.atTarget - calib.atTarget) * 100
      console.log(`   ${klass.padEnd(8)} no alvo: real ${(real.atTarget * 100).toFixed(0)}%  vs  calib ${(calib.atTarget * 100).toFixed(0)}%   (desvio ${drift >= 0 ? '+' : ''}${drift.toFixed(0)}pp)`)
      console.log(`      APERTADO ≥50%     ${thLabel(dg, real.tight)}`)
      console.log(`      CONFORTÁVEL ≥65%  ${thLabel(dg, real.comfy)}`)
      console.log(`      COM FOLGA ≥85%    ${thLabel(dg, real.easy)}`)
      console.log(`      no gear-alvo, por tier:  ` +
        real.byTier.map((w, i) => `${ROMAN[i]} ${(w * 100).toFixed(0)}%`).join('  ·  '))
    }
  }
  return out
}

// ============================================================
// FASE 2 — RUN COMPLETA NO PERFIL-LIMIAR
// Com o herói que a Fase 1 apontou, roda a trilha inteira e mede o espólio.
//
// Consertos sobre o dungeon-full-run-test.ts (que é de julho, o loot mudou em
// agosto): passa `gear` para rollNodeLoot/rollKillLoot (sem ele os drops de
// MANUTENÇÃO e de PEÇA DE REPOSIÇÃO ficam invisíveis), rola rollKillLoot por
// abate, usa pacotes de 1-3 em nó menor e aplica desgaste real via wearFor.
// ============================================================
import { canEquip, getCatalogItemByName } from '@/lib/itemCatalog'
import { getSlotTypeFromItemType } from '@/lib/equipmentSlot'

const MINOR_MONSTER_CHANCE = 0.4
const d20 = () => 1 + Math.floor(Math.random() * 20)
const isWeaponSlot = (type: string) => getSlotTypeFromItemType(type) === 'WEAPON'

/** Os 9 slots nominais que o combate conta (NOMINAL_SLOTS). */
const WANTED_SLOTS = ['WEAPON', 'SHIELD', 'HELMET', 'ARMOR', 'GLOVES', 'BOOTS', 'BELT', 'NECKLACE', 'RING_1']

/**
 * Monta um set de peças REAIS do catálogo para o herói. Precisa ser real (e não
 * um snapshot sintético) porque maintenanceLoot resolve o material de conserto
 * pela RECEITA DE FORJA da peça — um nome inventado cai no fallback genérico e
 * a cobertura de manutenção sai errada.
 *
 * Para cada slot escolhe a peça elegível de maior nível dentro do teto, dando
 * preferência à raridade pedida e caindo para a melhor disponível abaixo dela.
 */
const RARITY_RANK: Record<string, number> = { COMMON: 0, UNCOMMON: 1, RARE: 2, EPIC: 3, LEGENDARY: 4 }

function buildRealSet(level: number, race: string, klass: CombatClass, rarity: Rarity): GearWearSnapshot[] {
  const wanted = RARITY_RANK[rarity]
  const out: GearWearSnapshot[] = []
  for (const slot of WANTED_SLOTS) {
    let best: { name: string; type: string; score: number } | null = null
    for (const it of ITEM_CATALOG) {
      if (getSlotTypeFromItemType(it.type) !== slot) continue
      if (it.level > level + 2) continue
      if (!canEquip(race, klass, it.type, it.raceRestriction).ok) continue
      const rr = RARITY_RANK[it.rarity] ?? 0
      if (rr > wanted) continue // não veste acima do que a banda entrega
      // Prioriza raridade, depois nível — é o que um jogador equiparia.
      const score = rr * 1000 + it.level
      if (!best || score > best.score) best = { name: it.name, type: it.type, score }
    }
    if (best) out.push({ name: best.name, type: best.type, durability: 100, maxDurability: 100 })
  }
  return out
}

interface LootTally {
  gold: number
  drops: number
  byRarity: Record<string, number>
  byKind: Record<string, number>
  bySlotGroup: Record<string, number>
  bySource: Record<string, number>
  byName: Record<string, number>
  stonesBasic: number
  stonesConc: number
  shards: number
  maintMats: number
  spareParts: number
}

const emptyTally = (): LootTally => ({
  gold: 0, drops: 0, byRarity: {}, byKind: {}, bySlotGroup: {}, bySource: {}, byName: {},
  stonesBasic: 0, stonesConc: 0, shards: 0, maintMats: 0, spareParts: 0,
})

function tallyDrops(t: LootTally, drops: LootDrop[], source: string) {
  for (const d of drops) {
    t.drops++
    const rar = String((d as any).rarity ?? '—')
    t.byRarity[rar] = (t.byRarity[rar] || 0) + 1
    t.byKind[d.kind] = (t.byKind[d.kind] || 0) + 1
    t.bySource[source] = (t.bySource[source] || 0) + 1
    t.byName[d.name] = (t.byName[d.name] || 0) + 1
    if (d.kind === 'item') {
      const cat = getCatalogItemByName(d.name)
      if (cat) {
        const g = dropSlotGroupOf(cat.type)
        t.bySlotGroup[g] = (t.bySlotGroup[g] || 0) + 1
      }
    }
    if (d.kind === 'stone') {
      if (String((d as any).rarity) === 'RARE') t.stonesConc++
      else t.stonesBasic++
    }
    if (d.name.indexOf('Estilhaço de Pedra Negra') === 0) t.shards++
    const reason = (d as any).reason
    if (reason === 'maintenance') t.maintMats++
    if (reason === 'spare') t.spareParts++
  }
}

interface RunResult {
  cleared: boolean
  bossWin: boolean
  bossAttempted: boolean
  fights: number
  kills: number
  wearSpent: number
  potions: number
}

function simulateRun(dg: DungeonDef, hero: Hero, mode: HpMode, tier: number, gear: GearWearSnapshot[], t: LootTally): RunResult {
  const levers = leversOf(hero)
  const maxHp = hpOf(hero, mode)
  const level = hero.level
  let php = maxHp
  let fights = 0, kills = 0, wearSpent = 0, potions = 0
  let cleared = true, bossWin = false, bossAttempted = false

  // Trilha: start + rooms × (minorNodes menores + 1 principal) + boss.
  interface T { kind: 'minor' | 'main' | 'boss'; tier: number }
  const trail: T[] = []
  for (let r = 1; r <= dg.rooms; r++) {
    for (let m = 0; m < dg.minorNodes; m++) trail.push({ kind: 'minor', tier: r })
    trail.push({ kind: 'main', tier: r })
  }
  trail.push({ kind: 'boss', tier: dg.rooms })

  for (const node of trail) {
    const isBoss = node.kind === 'boss'
    const isMain = node.kind === 'main'
    const roll = isBoss ? 20 : d20()
    const hasMonster = isBoss || isMain || Math.random() < MINOR_MONSTER_CHANCE

    if (hasMonster) {
      // Topa o HP antes da luta (o piloto automático usa poção entre encontros).
      if (php < maxHp) { potions++; php = maxHp }
      fights++
      const scaling = { tier: isBoss ? dg.rooms : node.tier, isMain: isMain || isBoss, isBoss }
      let killed: ScaledMonster[] = []
      let won = false
      if (isBoss || isMain) {
        const mon = scaleMonster(isBoss ? dg.boss : pickMonster(dg), dg, level, scaling, hero.klass, tier)
        const f = fight(levers, php, mon)
        php = f.hp; won = f.result === 'win'
        if (won) killed = [mon]
        if (isBoss) { bossAttempted = true; bossWin = won }
      } else {
        const pack = scaleMonsterGroup(dg, level, scaling, hero.klass, tier)
        const f = fightPack(levers, php, pack)
        php = f.hp; won = f.result === 'win'; killed = f.killed
      }

      // Espólio POR ABATE + desgaste real (a conta de flushRunRewards).
      for (const m of killed) {
        kills++
        tallyDrops(t, rollKillLoot(node.kind as LootNodeKind, m.isBoss, dg.difficultyStars, tier, roll, dg, gear), node.kind)
        for (const eq of gear) {
          if (eq.durability <= 0) continue
          const w = wearFor(isWeaponSlot(eq.type) ? 'WEAPON' : 'ARMOR', 1, m.isBoss, level)
          const applied = Math.min(eq.durability, w)
          eq.durability -= applied
          wearSpent += applied
        }
      }

      if (!won) { cleared = false; break }
      const loot = rollNodeLoot(dg, roll, node.kind as LootNodeKind, level, hero.race, hero.klass, tier, gear)
      t.gold += loot.gold
      tallyDrops(t, loot.drops, node.kind)
    } else {
      // Nó de "achado": só ouro + drops, sem XP (não houve abate).
      const loot = rollNodeLoot(dg, roll, 'minor', level, hero.race, hero.klass, tier, gear)
      t.gold += loot.gold
      tallyDrops(t, loot.drops, 'find')
    }
  }
  return { cleared, bossWin, bossAttempted, fights, kills, wearSpent, potions }
}

interface Phase2Row {
  dungeon: DungeonDef
  klass: CombatClass
  tier: number
  /** 'limiar' = o mínimo que a Fase 1 achou · 'alvo' = o gear que o design pretendia. */
  profile: 'limiar' | 'alvo'
  hero: Hero
  runs: number
  clears: number
  bossWins: number
  bossAtt: number
  tally: LootTally
  wearSpent: number
  potions: number
}

/**
 * Reposição BRUTA de durabilidade: cada insumo de manutenção e cada peça de
 * reposição contam como REPAIR_PER_DUPLICATE.
 *
 * ⚠️ É um TETO, não a cobertura real. Uma cópia na forja consome VÁRIOS
 * materiais por receita (FORGE_RECIPES), então o espólio bruto sempre parece
 * mais generoso do que é. Quem mede cobertura de verdade — simulando a bancada,
 * as receitas e o refino — é `npm run sim:repair`; esta coluna existe só para
 * comparar masmorras entre si e ver se o espólio de manutenção RESPONDE ao
 * desgaste, não para julgar se 60-80% foi atingido.
 */
const grossRestore = (t: LootTally) => (t.maintMats + t.spareParts) * REPAIR_PER_DUPLICATE

function runPhase2(matrices: BossMatrix[]): Phase2Row[] {
  const rows: Phase2Row[] = []
  const tiers = process.env.TIERS ? process.env.TIERS.split(',').map(Number) : [1, 3, 5]

  console.log('\n' + '='.repeat(100))
  console.log('  FASE 2 — RUN COMPLETA')
  console.log(`  ${RUNS} runs/célula · tiers ${tiers.join('/')} · loot, desgaste e manutenção REAIS (rollNodeLoot + rollKillLoot com gear)`)
  console.log('  limiar = o herói MÍNIMO da Fase 1 · alvo = o gear que o design pretendia para esta banda')
  console.log('='.repeat(100))

  for (const dg of DUNGEONS_TO_RUN) {
    for (const klass of CLASSES_TO_RUN) {
      const m = matrices.filter(x => x.dungeon.id === dg.id && x.klass === klass && x.mode === 'real')[0]
      const tg = TARGET_GEAR[dg.id]
      // Dois perfis, sempre no nível-alvo da banda: o gear MÍNIMO que basta para
      // o chefe (a pergunta do Mario) e o gear-ALVO de design (o contrafactual).
      const profiles: { kind: 'limiar' | 'alvo'; rarity: Rarity; enh: number }[] = [
        m && m.comfy.gearAt
          ? { kind: 'limiar', rarity: m.comfy.gearAt.rung.rarity, enh: m.comfy.gearAt.rung.enh }
          : { kind: 'limiar', rarity: tg.rarity, enh: tg.enh },
        { kind: 'alvo', rarity: tg.rarity, enh: tg.enh },
      ]

      for (const prof of profiles) {
        const hero = buildHero(RACE, klass, dg.clearLevel, prof.rarity, prof.enh)
        for (const tier of tiers) {
          const t = emptyTally()
          let clears = 0, bossWins = 0, bossAtt = 0, wearSpent = 0, potions = 0
          for (let i = 0; i < RUNS; i++) {
            const gear = buildRealSet(dg.clearLevel, RACE, klass, prof.rarity)
            const r = simulateRun(dg, hero, 'real', clampDungeonTier(tier), gear, t)
            if (r.cleared) clears++
            if (r.bossAttempted) { bossAtt++; if (r.bossWin) bossWins++ }
            wearSpent += r.wearSpent
            potions += r.potions
          }
          rows.push({ dungeon: dg, klass, tier, profile: prof.kind, hero, runs: RUNS, clears, bossWins, bossAtt, tally: t, wearSpent, potions })
        }
      }
    }
  }

  for (const dg of DUNGEONS_TO_RUN) {
    console.log(`\n── ${dg.emoji} ${dg.name.toUpperCase()} (nv${dg.clearLevel}) ──`)
    console.log('   classe   perfil  gear             tier  clear  boss   drops  ouro   gear/run  pedras  estilh  desgaste  reposição')
    for (const r of rows.filter(x => x.dungeon.id === dg.id)) {
      const per = (n: number) => (n / r.runs).toFixed(1)
      const gearDrops = r.tally.byKind['item'] || 0
      console.log(
        `   ${r.klass.padEnd(8)} ${r.profile.padEnd(6)}  ${(RARITY_PT[r.hero.gear.rarity] + ' ' + enhLabel(r.hero.gear.enh)).padEnd(16)} ` +
        `${String(r.tier).padStart(3)}  ${((r.clears / r.runs) * 100).toFixed(0).padStart(4)}% ` +
        `${(r.bossAtt ? (r.bossWins / r.bossAtt) * 100 : 0).toFixed(0).padStart(4)}% ` +
        `${per(r.tally.drops).padStart(6)} ${per(r.tally.gold).padStart(6)} ` +
        `${per(gearDrops).padStart(9)} ${per(r.tally.stonesBasic + r.tally.stonesConc).padStart(7)} ${per(r.tally.shards).padStart(7)} ` +
        `${per(r.wearSpent).padStart(9)} ${per(grossRestore(r.tally)).padStart(10)}`
      )
    }
  }
  console.log('\n   "reposição" é o TETO bruto do espólio de manutenção (cada insumo = 25 de durabilidade).')
  console.log('   A cobertura REAL — que passa pelas receitas da forja — quem mede é `npm run sim:repair`.\n')
  return rows
}

// ============================================================
// FASE 3 — AUDITORIA ESTRUTURAL DO DROP
// Determinística (sem Monte Carlo do combate): pergunta se o SORTEIO consegue
// entregar o que a masmorra promete. É o que pega buraco de pool, monocultura
// e raridade-âncora inalcançável.
// ============================================================

/**
 * Espelha o DUNGEON_GEAR_RARITY privado de dungeonAdventures.ts:1017.
 * ⚠️ Se aquele mudar, este espelho precisa acompanhar — é a única duplicação
 * que a bateria não conseguiu evitar (a const não é exportada).
 */
const GEAR_RARITY_MIRROR: Record<string, { node: Rarity[]; boss: Rarity[] }> = {
  floresta: { node: ['COMMON', 'UNCOMMON'], boss: ['RARE'] },
  caverna:  { node: ['UNCOMMON', 'RARE'],   boss: ['RARE', 'EPIC'] },
  pantano:  { node: ['RARE'],               boss: ['EPIC'] },
  ruinas:   { node: ['RARE', 'EPIC'],       boss: ['EPIC', 'LEGENDARY'] },
}

/** Grupos que SLOT_GROUP_WEIGHT espera ver representados no sorteio. */
const ALL_SLOT_GROUPS = ['weapon', 'armor', 'offhand', 'accessory']

type Severity = 'ALTO' | 'MÉDIO' | 'BAIXO'

/**
 * Um achado é emitido POR CLASSE (o pool elegível muda com a classe), mas o
 * mesmo defeito costuma valer para 3-4 classes. `key` agrupa as ocorrências
 * idênticas para o relatório listar "warrior, mage, monk" numa linha só, em
 * vez de repetir o parágrafo quatro vezes.
 */
interface Finding {
  severity: Severity
  dungeon: string
  cell: string
  key: string
  title: string
  detail: string
  classes: CombatClass[]
}

const SEV_ORDER: Record<Severity, number> = { ALTO: 0, 'MÉDIO': 1, BAIXO: 2 }
const AUDIT_SAMPLES = Number(process.env.AUDIT_SAMPLES) || 20000

const PT_GROUP: Record<string, string> = { weapon: 'arma', armor: 'armadura', offhand: 'secundária', accessory: 'acessório' }
const SLOT_GROUP_TARGET: Record<string, number> = { weapon: 22, armor: 42, offhand: 10, accessory: 26 }

function auditCell(dg: DungeonDef, klass: CombatClass, level: number, rarities: Rarity[], cellName: string, out: Finding[]) {
  const cell = `${cellName} nv${level}`
  const push = (severity: Severity, key: string, title: string, detail: string) =>
    out.push({ severity, dungeon: dg.name, cell, key: `${dg.id}|${cellName}|${key}`, title, detail, classes: [klass] })

  // 1) POOL VAZIO — a raridade está declarada mas nenhum item é elegível.
  for (const r of rarities) {
    const any = rollEquipmentDrop(dg.id, level, RACE, klass, [r], { mode: 'own' })
    if (!any) {
      push('ALTO', `pool-vazio:${r}`, `pool ${RARITY_PT[r]} VAZIO`,
        `DUNGEON_GEAR_RARITY declara ${r} nesta célula, mas nenhum item do catálogo é elegível no nv${level}. A raridade nunca sai — essa metade da tabela está morta.`)
    }
  }

  // Amostra o sorteio REAL para as verificações de distribuição.
  const byGroup: Record<string, number> = {}
  const byName: Record<string, number> = {}
  const byRarity: Record<string, number> = {}
  let total = 0
  let maxItemLevel = 0
  for (let i = 0; i < AUDIT_SAMPLES; i++) {
    const it = rollEquipmentDrop(dg.id, level, RACE, klass, rarities, { mode: 'own' })
    if (!it) continue
    total++
    const g = dropSlotGroupOf(it.type)
    byGroup[g] = (byGroup[g] || 0) + 1
    byName[it.name] = (byName[it.name] || 0) + 1
    byRarity[it.rarity] = (byRarity[it.rarity] || 0) + 1
    if (it.level > maxItemLevel) maxItemLevel = it.level
  }
  if (total === 0) return

  // 2) GRUPO DE SLOT AUSENTE — o grupo tem peso, mas nunca sai nada dele.
  for (const g of ALL_SLOT_GROUPS) {
    if (!byGroup[g]) {
      push('ALTO', `grupo-ausente:${g}`, `nunca solta ${PT_GROUP[g]}`,
        `SLOT_GROUP_WEIGHT reserva ${SLOT_GROUP_TARGET[g]}% dos drops para ${PT_GROUP[g]}, mas em ${AUDIT_SAMPLES} sorteios saíram ZERO. Como o gear só conta por raridade × +N (deriveGearTier sobre 9 slots), esses slots ficam presos na raridade antiga: o jogador não sobe o gearTier por mais que farme.`)
    }
  }

  // 3) MONOCULTURA — um único item domina a célula.
  const names = Object.keys(byName)
  let topName = '', topCount = 0
  for (const n of names) if (byName[n] > topCount) { topCount = byName[n]; topName = n }
  const topShare = topCount / total
  if (topShare > 0.25) {
    push(topShare > 0.4 ? 'ALTO' : 'MÉDIO', `monocultura:${topName}`,
      `${(topShare * 100).toFixed(0)}% dos drops é "${topName}"`,
      `Um único item concentra ${(topShare * 100).toFixed(0)}% dos drops desta célula (pool com ${names.length} itens distintos elegíveis). O espólio deixa de parecer sorteio.`)
  }

  // 4) RARIDADE-ÂNCORA INALCANÇÁVEL — a raridade que o gear-alvo exige quase
  //    não sai, porque RARITY_DROP_WEIGHT esmaga os degraus altos.
  const tg = TARGET_GEAR[dg.id]
  if (rarities.indexOf(tg.rarity) >= 0) {
    const share = (byRarity[tg.rarity] || 0) / total
    if (share < 0.05) {
      push('ALTO', `ancora-rara:${tg.rarity}`,
        `${RARITY_PT[tg.rarity]} sai em só ${(share * 100).toFixed(1)}% dos gears`,
        `O gate desta masmorra exige ${RARITY_PT[tg.rarity]} ${tg.tag} — é o gear-alvo contra o qual BOSS_HP_MULT foi calibrado. Mas o sorteio entrega essa raridade em ${(share * 100).toFixed(1)}% dos gears, porque RARITY_DROP_WEIGHT dá peso ${RARITY_DROP_WEIGHT[tg.rarity]} a ela contra ${RARITY_DROP_WEIGHT.EPIC} do épico e ${RARITY_DROP_WEIGHT.COMMON} do comum. A masmorra pede uma peça que ela mesma quase não solta.`)
    }
  }

  // 5) TETO DE NÍVEL — o catálogo acabou antes do herói.
  if (maxItemLevel > 0 && level > maxItemLevel + 8) {
    push('MÉDIO', 'teto-nivel', `catálogo satura em nv${maxItemLevel}, herói está no nv${level}`,
      `O item mais alto que esta célula consegue entregar é nv${maxItemLevel}, ${level - maxItemLevel} níveis abaixo do herói. levelDropWeight cai no piso 0.2 e deixa de discriminar por proximidade de nível — daqui para cima o drop para de evoluir e só o aprimoramento progride.`)
  }
}

/** Junta ocorrências do mesmo defeito em classes diferentes numa linha só. */
function mergeFindings(raw: Finding[]): Finding[] {
  const byKey: Record<string, Finding> = {}
  const order: string[] = []
  for (const f of raw) {
    const hit = byKey[f.key]
    if (hit) {
      for (const k of f.classes) if (hit.classes.indexOf(k) < 0) hit.classes.push(k)
      // Mantém a redação da ocorrência mais severa.
      if (SEV_ORDER[f.severity] < SEV_ORDER[hit.severity]) { hit.severity = f.severity; hit.title = f.title; hit.detail = f.detail }
    } else {
      byKey[f.key] = { ...f, classes: f.classes.slice() }
      order.push(f.key)
    }
  }
  const out = order.map(k => byKey[k])
  out.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity])
  return out
}

const classList = (f: Finding) => (f.classes.length >= CLASSES_TO_RUN.length ? 'todas as classes' : f.classes.join(', '))

function runPhase3(): Finding[] {
  const raw: Finding[] = []
  console.log('\n' + '='.repeat(96))
  console.log('  FASE 3 — AUDITORIA ESTRUTURAL DO DROP')
  console.log(`  ${AUDIT_SAMPLES} sorteios por célula, com rollEquipmentDrop de produção`)
  console.log('='.repeat(96))

  for (const dg of DUNGEONS_TO_RUN) {
    const mir = GEAR_RARITY_MIRROR[dg.id]
    if (!mir) continue
    for (const klass of CLASSES_TO_RUN) {
      // Duas células por masmorra: o nó comum e o covil, no clearLevel da banda.
      auditCell(dg, klass, dg.clearLevel, mir.node, 'nó', raw)
      auditCell(dg, klass, dg.clearLevel, mir.boss, 'chefe', raw)
    }

    // 6) gearTier SATURADO — mais raridade/+N deixa de dar poder.
    const tg = TARGET_GEAR[dg.id]
    const atTarget = gearFor(tg.rarity, tg.enh).gearTier
    const atPen = gearFor('LEGENDARY', 20).gearTier
    if (atTarget >= 1 && atPen <= atTarget) {
      raw.push({
        severity: 'MÉDIO', dungeon: dg.name, cell: 'progressão de gear',
        key: `${dg.id}|gear|saturado`, classes: CLASSES_TO_RUN.slice(),
        title: 'gearTier já saturado no gear-alvo',
        detail: `O gear-alvo (${RARITY_PT[tg.rarity]} ${tg.tag}) já atinge gearTier ${atTarget.toFixed(2)}, e deriveGearTier/clampGearTier travam em 1.0. Lendário PEN dá gearTier ${atPen.toFixed(2)} — ZERO poder adicional acima de TET, só o HP extra da peça. O último degrau de aprimoramento não compra poder de combate.`,
      })
    }
  }

  const findings = mergeFindings(raw)
  if (findings.length === 0) {
    console.log('\n   ✅ Nenhum achado — o sorteio entrega o que as tabelas prometem.\n')
  } else {
    console.log(`\n   ${findings.length} achado(s).`)
    let lastSev = ''
    for (const f of findings) {
      if (f.severity !== lastSev) { console.log(`\n   ── severidade ${f.severity} ──`); lastSev = f.severity }
      console.log(`   • [${f.dungeon} · ${f.cell}] ${f.title}   (${classList(f)})`)
      console.log(`     ${f.detail}`)
    }
    console.log('')
  }
  return findings
}

// ============================================================
// RELATÓRIO HTML — chumbo + ouro, como o resto do jogo
// ============================================================
const esc = (s: string) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[c])
const pctS = (x: number) => `${(x * 100).toFixed(0)}%`

/** Cor da célula do heatmap: vermelho (0%) → âmbar (65%) → verde (100%). */
function heatColor(w: number): string {
  const hue = Math.round(w * 120)          // 0 = vermelho, 120 = verde
  const light = 22 + Math.round(w * 14)
  return `hsl(${hue} 55% ${light}%)`
}

function heatmapHtml(m: BossMatrix): string {
  const head = RUNGS.map(r => `<th>${esc(r.label)}</th>`).join('')
  const rows = m.levels.map((lv, li) => {
    const tds = RUNGS.map((_r, ri) => {
      const c = m.cells[li * RUNGS.length + ri]
      const w = c ? c.win : 0
      const mark = w >= TH_EASY ? '★' : w >= TH_COMFY ? '●' : w >= TH_TIGHT ? '·' : ''
      return `<td style="background:${heatColor(w)}" title="nv${lv} · ${esc(_r.label)} → ${pctS(w)}">${(w * 100).toFixed(0)}<span class="mk">${mark}</span></td>`
    }).join('')
    const anchor = lv === m.dungeon.clearLevel ? ' class="anchor"' : ''
    return `<tr${anchor}><th>nv${lv}</th>${tds}</tr>`
  }).join('')
  return `<div class="scroll"><table class="heat"><thead><tr><th></th>${head}</tr></thead><tbody>${rows}</tbody></table></div>`
}

function buildHtml(matrices: BossMatrix[], rows: Phase2Row[], findings: Finding[]): string {
  const sections: string[] = []

  // ---- Fase 1 ----
  if (matrices.length) {
    const blocks = DUNGEONS_TO_RUN.map(dg => {
      const tg = TARGET_GEAR[dg.id]
      const perClass = CLASSES_TO_RUN.map(klass => {
        const real = matrices.filter(x => x.dungeon.id === dg.id && x.klass === klass && x.mode === 'real')[0]
        const calib = matrices.filter(x => x.dungeon.id === dg.id && x.klass === klass && x.mode === 'calib')[0]
        if (!real) return ''
        const drift = calib ? (real.atTarget - calib.atTarget) * 100 : 0
        return `
  <div class="klass">
    <h4>${esc(klass)}</h4>
    <p class="drift">No alvo de design (nv${dg.clearLevel} · ${esc(RARITY_PT[tg.rarity])} ${esc(tg.tag)}):
      <b>real ${pctS(real.atTarget)}</b> vs <span class="dim">calib ${calib ? pctS(calib.atTarget) : '—'}</span>
      <span class="badge ${drift > 5 ? 'warn' : ''}">desvio ${drift >= 0 ? '+' : ''}${drift.toFixed(0)}pp</span></p>
    <table class="th"><thead><tr><th></th><th>gear mínimo no nv${dg.clearLevel}</th><th>nível mínimo com ${esc(RARITY_PT[tg.rarity])} ${esc(tg.tag)}</th></tr></thead><tbody>
      ${([['APERTADO ≥50%', real.tight], ['CONFORTÁVEL ≥65%', real.comfy], ['COM FOLGA ≥85%', real.easy]] as [string, ThresholdPair][]).map(([lab, p]) => `<tr><th>${lab}</th>
        <td>${p.gearAt ? `${esc(p.gearAt.rung.label)} <span class="dim">(${pctS(p.gearAt.win)})</span>` : '<span class="dim">nem lendário PEN chega</span>'}</td>
        <td>${p.levelAt ? `nv${p.levelAt.level} <span class="dim">(${pctS(p.levelAt.win)})</span>` : '<span class="dim">nenhum nível da faixa chega</span>'}</td></tr>`).join('')}
    </tbody></table>
    <p class="tiers">No gear-alvo, por tier de masmorra: ${real.byTier.map((w, i) => `<span class="chip ${w < 0.35 ? 'bad' : w > 0.85 ? 'warn' : ''}">${ROMAN[i]} ${pctS(w)}</span>`).join(' ')}</p>
    ${heatmapHtml(real)}
  </div>`
      }).join('')
      return `<section><h3>${esc(dg.emoji)} ${esc(dg.name)} <span class="tag">nv${dg.levelReq}→${dg.clearLevel} · alvo ${esc(RARITY_PT[tg.rarity])} ${esc(tg.tag)}</span></h3>${perClass}</section>`
    }).join('')
    sections.push(`<div class="phase"><h2>Fase 1 — Limiar do chefe</h2>
    <p class="lead">Cada célula é ${ITERS} lutas contra o chefe. Linha = nível do herói, coluna = gear.
    <b>★</b> ≥85% (com folga) · <b>●</b> ≥65% (confortável) · <b>·</b> ≥50% (apertado).
    A linha destacada é o <code>clearLevel</code>, a âncora de design.</p>${blocks}</div>`)
  }

  // ---- Fase 2 ----
  if (rows.length) {
    const blocks = DUNGEONS_TO_RUN.map(dg => {
      const mine = rows.filter(r => r.dungeon.id === dg.id)
      if (!mine.length) return ''
      const trs = mine.map(r => {
        const per = (n: number) => (n / r.runs).toFixed(1)
        const gearDrops = r.tally.byKind['item'] || 0
        const groups = ALL_SLOT_GROUPS.map(g => {
          const n = r.tally.bySlotGroup[g] || 0
          const tot = ALL_SLOT_GROUPS.reduce((s, x) => s + (r.tally.bySlotGroup[x] || 0), 0)
          const share = tot ? n / tot : 0
          const off = Math.abs(share * 100 - SLOT_GROUP_TARGET[g])
          return `<span class="chip ${n === 0 ? 'bad' : off > 12 ? 'warn' : ''}">${esc(PT_GROUP[g])} ${(share * 100).toFixed(0)}%</span>`
        }).join(' ')
        const clear = r.clears / r.runs
        return `<tr class="${r.profile === 'alvo' ? 'alt' : ''}">
        <td>${esc(r.klass)}</td><td><span class="chip">${esc(r.profile)}</span></td>
        <td>${esc(RARITY_PT[r.hero.gear.rarity])} ${esc(enhLabel(r.hero.gear.enh))}</td>
        <td>${r.tier}</td>
        <td class="${clear < 0.2 ? 'bad' : clear > 0.8 ? 'good' : ''}">${pctS(clear)}</td>
        <td>${pctS(r.bossAtt ? r.bossWins / r.bossAtt : 0)}</td>
        <td>${per(r.tally.drops)}</td><td>${per(r.tally.gold)}</td>
        <td>${per(gearDrops)}</td>
        <td>${per(r.tally.stonesBasic + r.tally.stonesConc)}</td><td>${per(r.tally.shards)}</td>
        <td>${per(r.wearSpent)}</td><td>${per(grossRestore(r.tally))}</td>
        <td class="groups">${groups}</td></tr>`
      }).join('')
      return `<section><h3>${esc(dg.emoji)} ${esc(dg.name)} <span class="tag">herói nv${dg.clearLevel}</span></h3><div class="scroll"><table class="grid">
      <thead><tr><th>classe</th><th>perfil</th><th>gear</th><th>tier</th><th>clear</th><th>boss</th><th>drops/run</th><th>ouro/run</th><th>gear/run</th><th>pedras/run</th><th>estilh/run</th><th>desgaste/run</th><th>reposição/run</th><th>grupos de slot (alvo 22/42/10/26)</th></tr></thead>
      <tbody>${trs}</tbody></table></div></section>`
    }).join('')
    sections.push(`<div class="phase"><h2>Fase 2 — Run completa no perfil-limiar</h2>
    <p class="lead">${RUNS} runs por célula, herói no nível-alvo da banda.
    <b>limiar</b> = o gear mínimo que a Fase 1 achou suficiente para o chefe; <b>alvo</b> = o gear que o design pretendia.
    Loot, desgaste e manutenção são os geradores de produção (<code>rollNodeLoot</code> + <code>rollKillLoot</code>, com o snapshot de gear).
    <b>reposição</b> é o teto bruto do espólio de manutenção — a cobertura real, que passa pelas receitas da forja, quem mede é <code>npm run sim:repair</code>.</p>${blocks}</div>`)
  }

  // ---- Fase 3 ----
  if (findings.length) {
    const items = findings.map(f => `<li class="sev-${f.severity === 'MÉDIO' ? 'med' : f.severity === 'ALTO' ? 'high' : 'low'}">
      <div class="fh"><span class="sev">${esc(f.severity)}</span><b>${esc(f.title)}</b>
      <span class="where">${esc(f.dungeon)} · ${esc(f.cell)} · ${esc(classList(f))}</span></div>
      <p>${esc(f.detail)}</p></li>`).join('')
    sections.push(`<div class="phase"><h2>Fase 3 — Auditoria estrutural do drop</h2>
    <p class="lead">${AUDIT_SAMPLES} sorteios por célula com <code>rollEquipmentDrop</code> de produção. ${findings.length} achado(s).</p>
    <ul class="findings">${items}</ul></div>`)
  }

  return `<title>Bateria das Masmorras</title>
<style>
:root{--bg:#0b0d10;--panel:#14181d;--panel2:#1b2027;--line:#2a3138;--ink:#e8e3d6;--dim:#8b939c;--gold:#d4af5a;--good:#5aa469;--warn:#c9922e;--bad:#b4543f}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.55 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
header{padding:28px 32px;border-bottom:2px solid var(--gold);background:linear-gradient(180deg,#171b21,#0b0d10)}
header h1{margin:0 0 6px;font-size:24px;letter-spacing:.3px;color:var(--gold)}
header p{margin:0;color:var(--dim);max-width:70ch}
.phase{padding:8px 32px 32px;border-bottom:8px solid #06080a}
.phase>h2{color:var(--gold);font-size:19px;margin:26px 0 6px}
.lead{color:var(--dim);max-width:88ch;margin:0 0 18px}
section{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:16px 18px;margin:0 0 16px}
section h3{margin:0 0 12px;font-size:16px}
.tag{color:var(--dim);font-weight:400;font-size:12px;margin-left:8px}
.klass{border-top:1px solid var(--line);padding:12px 0 4px}
.klass h4{margin:0 0 6px;color:var(--gold);font-size:13px;text-transform:uppercase;letter-spacing:.6px}
.drift{margin:0 0 8px;color:var(--dim)}
.tiers{margin:0 0 10px;color:var(--dim);font-size:12px}
.drift b{color:var(--ink)}
.dim{color:var(--dim)}
.badge{display:inline-block;margin-left:8px;padding:1px 8px;border:1px solid var(--line);border-radius:99px;font-size:12px}
.badge.warn{border-color:var(--warn);color:var(--warn)}
table.th{margin:0 0 14px;background:var(--panel2);border:1px solid var(--line);border-radius:8px;font-size:12px}
table.th thead th{color:var(--dim);font-weight:500;font-size:11px;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--line)}
table.th tbody th{color:var(--dim);font-weight:500;text-align:left}
table.th td{color:var(--ink)}
.scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
table{border-collapse:collapse;font-size:12px;min-width:100%}
th,td{padding:5px 9px;text-align:left;white-space:nowrap}
table.heat th{color:var(--dim);font-weight:500;font-size:11px}
table.heat td{color:#fff;text-align:center;font-variant-numeric:tabular-nums;border:1px solid #0b0d10;min-width:44px}
table.heat .mk{margin-left:3px;opacity:.85}
table.heat tr.anchor th{color:var(--gold)}
table.heat tr.anchor td{outline:1px solid var(--gold);outline-offset:-1px}
table.grid th{color:var(--dim);border-bottom:1px solid var(--line);font-weight:500}
table.grid td{border-bottom:1px solid #1e242b;font-variant-numeric:tabular-nums}
table.grid tr.alt td{background:#171c22}
td.good{color:var(--good)}td.warn{color:var(--warn)}td.bad{color:var(--bad)}
.groups{white-space:normal;max-width:340px}
.chip{display:inline-block;padding:1px 7px;margin:1px;border:1px solid var(--line);border-radius:99px;font-size:11px;color:var(--dim)}
.chip.warn{border-color:var(--warn);color:var(--warn)}
.chip.bad{border-color:var(--bad);color:var(--bad)}
ul.findings{list-style:none;margin:0;padding:0}
ul.findings li{background:var(--panel);border:1px solid var(--line);border-left:4px solid var(--dim);border-radius:8px;padding:12px 16px;margin:0 0 10px}
li.sev-high{border-left-color:var(--bad)}
li.sev-med{border-left-color:var(--warn)}
.fh{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.sev{font-size:11px;letter-spacing:.6px;color:var(--dim)}
.where{color:var(--dim);font-size:12px}
ul.findings p{margin:6px 0 0;color:var(--dim);max-width:100ch}
code{background:var(--panel2);padding:1px 5px;border-radius:4px;font-size:12px}
</style>
<header>
<h1>🗺️ Bateria das Masmorras</h1>
<p>Limiar do chefe, saúde do drop e auditoria estrutural — sobre os geradores de produção.
Toda tabela de vitória sai em duas leituras: <b>real</b> (a fórmula de HP que o banco grava e o combate usa)
e <b>calib</b> (a fórmula contra a qual o boss foi dimensionado). A distância entre elas é o desvio.</p>
</header>
${sections.join('')}`
}

// ============================================================
// MAIN
// ============================================================
function main() {
  const t0 = Date.now()
  const wants = (p: string) => PHASE === 'all' || PHASE === p

  let matrices: BossMatrix[] = []
  let rows: Phase2Row[] = []
  let findings: Finding[] = []

  if (wants('1')) matrices = runPhase1()
  if (wants('2')) {
    // A Fase 2 precisa do perfil da Fase 1. Se rodou sozinha, resolve o limiar
    // com menos iterações — o suficiente para escolher o perfil.
    if (!matrices.length) {
      console.log('\n   (PHASE=2 sozinha: resolvendo o limiar com amostra reduzida para escolher o perfil…)')
      for (const dg of DUNGEONS_TO_RUN) {
        for (const klass of CLASSES_TO_RUN) matrices.push(buildBossMatrix(dg, klass, 'real'))
      }
    }
    rows = runPhase2(matrices)
  }
  if (wants('3')) findings = runPhase3()

  const html = buildHtml(matrices, rows, findings)
  fs.writeFileSync(OUT, html, 'utf8')
  console.log(`\n📄 Relatório: ${OUT}`)
  console.log(`⏱️  ${((Date.now() - t0) / 1000).toFixed(1)}s\n`)
}

main()
