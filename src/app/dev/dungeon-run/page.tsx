'use client'

// ============================================================
// 🧪 BANCADA JOGÁVEL DE MASMORRA — /dev/dungeon-run
//
// O problema que ela resolve: para sentir o balance das Ruínas é preciso um
// herói nível 50 com set lendário TET, e chegar lá jogando leva semanas.
// Aqui o herói é montado pela URL e a run é a de verdade — trilha semeada,
// salas, chefe, d20 e espólio dos geradores de produção — com as rotas
// /api/dungeon/run/* stubadas no fetch (sem banco, sem auth).
//
// Não substitui /dev/dungeon-mock: aquela é bancada de LAYOUT (nv3 fixo,
// sempre Floresta, sem chefe, com casos de teste de UI que valem manter).
// Esta é bancada de BALANCE.
//
// Exemplos:
//   /dev/dungeon-run?dungeon=ruinas&level=50&class=mage&race=elfo&rarity=LEGENDARY&enh=19&tier=5
//   /dev/dungeon-run?dungeon=floresta&level=10&class=warrior&enh=0
//   /dev/dungeon-run?dungeon=pantano&level=40&class=monk&rarity=EPIC&enh=18&tier=3
//
// Parâmetros (todos opcionais):
//   dungeon  floresta | caverna | pantano | ruinas      (default floresta)
//   level    1..60                                       (default: clearLevel da masmorra)
//   race     humano | draconiano | metamorfo | elfo      (default humano)
//   class    warrior | rogue | mage | monk               (default warrior)
//   rarity   COMMON..LEGENDARY                           (default: raridade-alvo da masmorra)
//   enh      0..20                                       (default: +N alvo da masmorra)
//   tier     1..5                                        (default 1)
//   seed     qualquer texto — a planta da run é semeada por ele (default 'dev-run')
//   dur      durabilidade inicial das peças, 0..100      (default 100)
//
// ⚠️ O HP usa computeDerivedStats — a fórmula que o banco grava e o combate lê.
// Não use a fórmula da criação (80 + str*2 + def*4) aqui: ela é a que dimensiona
// o monstro, e misturar as duas foi exatamente o desvio que a bateria
// (scripts/dungeon-testbench.ts) mede.
// ============================================================

import { useEffect, useState } from 'react'
import DungeonRun, { DungeonCharacter } from '@/components/dungeon/DungeonRun'
import {
  DUNGEONS, scaleMonster, scaleMonsterGroup, rollNodeLoot, rollKillLoot,
  clampDungeonTier, type DungeonDef, type DungeonId, type ScaledMonster,
} from '@/lib/dungeonAdventures'
import { planDungeonRun, planTrail, type PlannedNode } from '@/lib/dungeonRunPlan'
import { computeDerivedStats } from '@/lib/combatFormulas'
import { getRaceStatBonuses, getClassStatBonuses } from '@/lib/characterStats'
import { normalizeCombatClass, type CombatClass } from '@/lib/combatModel'
import { ITEM_CATALOG, canEquip, type Rarity } from '@/lib/itemCatalog'
import { getSlotTypeFromItemType } from '@/lib/equipmentSlot'
import { getStatMultiplier } from '@/lib/enhancementSystem'
import { wearFor } from '@/lib/durability'

// ============================================================
// LEITURA DA URL
// ============================================================
interface Params {
  dungeon: DungeonDef
  level: number
  race: string
  klass: CombatClass
  rarity: Rarity
  enh: number
  tier: number
  seed: string
  dur: number
}

const TARGET_GEAR: Record<string, { rarity: Rarity; enh: number }> = {
  floresta: { rarity: 'UNCOMMON', enh: 16 },
  caverna: { rarity: 'RARE', enh: 17 },
  pantano: { rarity: 'EPIC', enh: 18 },
  ruinas: { rarity: 'LEGENDARY', enh: 19 },
}

const RARITIES: Rarity[] = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY']
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

function readParams(): Params {
  const q = new URLSearchParams(window.location.search)
  const dgId = (q.get('dungeon') || 'floresta') as DungeonId
  const dungeon = DUNGEONS[dgId] || DUNGEONS.floresta
  const tg = TARGET_GEAR[dungeon.id]
  const rarityRaw = String(q.get('rarity') || tg.rarity).toUpperCase() as Rarity
  return {
    dungeon,
    level: clamp(Number(q.get('level')) || dungeon.clearLevel, 1, 60),
    race: q.get('race') || 'humano',
    klass: (normalizeCombatClass(q.get('class') || 'warrior') || 'warrior') as CombatClass,
    rarity: RARITIES.indexOf(rarityRaw) >= 0 ? rarityRaw : tg.rarity,
    enh: clamp(q.get('enh') !== null ? Number(q.get('enh')) : tg.enh, 0, 20),
    tier: clampDungeonTier(Number(q.get('tier')) || 1),
    seed: q.get('seed') || 'dev-run',
    dur: clamp(q.get('dur') !== null ? Number(q.get('dur')) : 100, 0, 100),
  }
}

// ============================================================
// HERÓI — atributos, HP e um set de 9 peças REAIS do catálogo
// ============================================================
const BUILD: Record<CombatClass, Partial<Record<'str' | 'agi' | 'int' | 'def', number>>> = {
  warrior: { str: 0.7, def: 0.3 },
  rogue: { agi: 0.85, def: 0.15 },
  mage: { int: 0.85, def: 0.15 },
  monk: { agi: 0.55, def: 0.45 },
}
const CREATION_PTS = 18, STAT_CAP = 10, STAT_FLOOR = 8

function buildAttrs(race: string, klass: CombatClass, level: number) {
  const w = BUILD[klass]
  const keys = Object.keys(w) as ('str' | 'agi' | 'int' | 'def')[]
  const out = { str: 0, agi: 0, int: 0, def: 0 }
  let spill = 0
  for (const k of keys) {
    const want = Math.round(CREATION_PTS * (w[k] || 0))
    out[k] = Math.min(STAT_CAP, want)
    spill += want - out[k]
  }
  out.def = Math.min(STAT_CAP, out.def + spill)
  for (const k of keys) out[k] += Math.round(Math.max(0, level - 1) * (w[k] || 0))
  const r = getRaceStatBonuses(race)
  const c = getClassStatBonuses(klass)
  return {
    str: Math.max(STAT_FLOOR, out.str + r.str + c.str),
    agi: Math.max(STAT_FLOOR, out.agi + r.agi + c.agi),
    int: Math.max(STAT_FLOOR, out.int + r.int + c.int),
    def: out.def + r.def + c.def,
  }
}

const SLOTS = ['WEAPON', 'SHIELD', 'HELMET', 'ARMOR', 'GLOVES', 'BOOTS', 'BELT', 'NECKLACE', 'RING_1'] as const
const RANK: Record<string, number> = { COMMON: 0, UNCOMMON: 1, RARE: 2, EPIC: 3, LEGENDARY: 4 }

/** Melhor peça REAL do catálogo para cada slot, dentro do nível e da raridade pedidos. */
function buildEquipment(p: Params) {
  const wanted = RANK[p.rarity]
  const out: any[] = []
  for (const slot of SLOTS) {
    let best: (typeof ITEM_CATALOG)[number] | null = null
    let bestScore = -1
    for (const it of ITEM_CATALOG) {
      if (getSlotTypeFromItemType(it.type) !== slot) continue
      if (it.level > p.level + 2) continue
      if ((RANK[it.rarity] ?? 0) > wanted) continue
      if (!canEquip(p.race, p.klass, it.type, it.raceRestriction).ok) continue
      const score = (RANK[it.rarity] ?? 0) * 1000 + it.level
      if (score > bestScore) { bestScore = score; best = it }
    }
    if (!best) continue
    // Acessório nunca vem aprimorado (ACCESSORY_TYPES em dungeonAdventures).
    const isAccessory = best.type === 'RING' || best.type === 'NECKLACE' || best.type === 'BELT'
    out.push({
      id: `eq-${slot}`,
      slot,
      enhancementLevel: isAccessory ? 0 : p.enh,
      durability: p.dur,
      maxDurability: 100,
      item: { id: `it-${slot}`, name: best.name, type: best.type, image: null, stats: { ...best.stats, rarity: best.rarity } },
    })
  }
  return out
}

function buildHero(p: Params): DungeonCharacter {
  const attrs = buildAttrs(p.race, p.klass, p.level)
  const derived = computeDerivedStats({ ...attrs, level: p.level })
  const equipment = buildEquipment(p)
  return {
    id: 'dev-hero',
    name: `Bancada nv${p.level}`,
    level: p.level,
    experience: 0,
    nextLevelExperience: 1000,
    race: p.race,
    class: p.klass,
    avatar: null,
    hp: derived.maxHp,
    maxHp: derived.maxHp,
    mp: derived.maxMp,
    maxMp: derived.maxMp,
    stamina: derived.maxStamina,
    maxStamina: derived.maxStamina,
    attack: Math.floor(attrs.str * 1.2),
    defense: Math.floor(attrs.def * 0.8),
    magicPower: Math.floor(attrs.int * 1.5),
    str: attrs.str,
    agi: attrs.agi,
    int: attrs.int,
    def: attrs.def,
    equipment,
  }
}

// ============================================================
// STUB DAS ROTAS — espelha o protocolo real do /step e do /finish
// ============================================================
const STEP_COST = { minor: 4, main: 8, boss: 6 } as const
const isWeaponSlot = (type: string) => getSlotTypeFromItemType(type) === 'WEAPON'

function installFetchStub(p: Params, hero: DungeonCharacter) {
  const real = window.fetch.bind(window)
  const dg = p.dungeon
  const plan = planDungeonRun(dg, p.seed)
  const trail = planTrail(dg)

  // Snapshot de gear vivo: é o que rollNodeLoot/rollKillLoot usam para decidir
  // o espólio de MANUTENÇÃO (quem não gasta, quase não recebe).
  const gear = hero.equipment.map((eq: any) => ({
    name: eq.item.name, type: eq.item.type,
    durability: eq.durability, maxDurability: eq.maxDurability,
  }))

  let stamina = hero.maxStamina
  let cursor = 0
  const accrued = { gold: 0, xp: 0, kills: 0, bossKills: 0, drops: [] as any[] }
  let pending: { kind: 'minor' | 'main' | 'boss'; monsters: ScaledMonster[]; killDrops: Record<string, any[]>; nodeLoot: any } | null = null

  const charForRun = { id: hero.id, level: p.level, race: p.race, class: p.klass, gear }

  /** Absorve o desfecho do nó anterior que vem de carona, como a rota real. */
  const absorb = (resolve: any): boolean => {
    if (!resolve || !pending) return false
    const killedIds: string[] = Array.isArray(resolve.killedIds) ? resolve.killedIds : []
    const dead = pending.monsters.filter(m => killedIds.indexOf(m.id) >= 0)
    accrued.kills += dead.length
    for (const m of dead) {
      if (m.isBoss) accrued.bossKills++
      accrued.gold += m.goldReward
      accrued.xp += m.xpReward
      const dr = pending.killDrops[m.id]
      if (dr) for (const d of dr) accrued.drops.push(d)
      // Desgaste real — a conta de flushRunRewards.
      for (const eq of gear) {
        if (eq.durability <= 0) continue
        eq.durability = Math.max(0, eq.durability - wearFor(isWeaponSlot(eq.type) ? 'WEAPON' : 'ARMOR', 1, m.isBoss, p.level))
      }
    }
    if (dead.length === pending.monsters.length && resolve.outcome === 'clear' && pending.nodeLoot) {
      accrued.gold += pending.nodeLoot.gold
      for (const d of pending.nodeLoot.drops) accrued.drops.push(d)
    }
    pending = null
    return true
  }

  const rollKillDrops = (kind: 'minor' | 'main' | 'boss', monsters: ScaledMonster[], roll: number) => {
    const out: Record<string, any[]> = {}
    for (const m of monsters) out[m.id] = rollKillLoot(kind, m.isBoss, dg.difficultyStars, p.tier, roll, dg, gear)
    return out
  }

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })

    if (url.indexOf('/api/dungeon/run/start') >= 0) {
      return json({ runId: p.seed, stamina, inventoryUsed: 0, inventorySlots: 60, inventoryFull: false })
    }
    if (url.indexOf('/api/dungeon/run/heartbeat') >= 0) return json({ active: true })

    if (url.indexOf('/api/dungeon/run/step') >= 0) {
      const body = init?.body ? JSON.parse(String(init.body)) : {}
      const resolved = absorb(body.resolve)

      const nextIdx = cursor + 1
      const node = trail[nextIdx]
      if (!node) return json({ error: 'fim da trilha' })
      cursor = nextIdx
      stamina = Math.max(0, stamina - (STEP_COST as any)[node.kind])

      // ---- BOSS: espólio de sorte MÁXIMA (roll 20), como resolveBossNode ----
      if (node.kind === 'boss') {
        const boss = scaleMonster(dg.boss, dg, p.level, { tier: dg.rooms, isMain: true, isBoss: true }, p.klass, p.tier)
        const killDrops = rollKillDrops('boss', [boss], 20)
        const nodeLoot = rollNodeLoot(dg, 20, 'boss', p.level, p.race, p.klass, p.tier, gear)
        pending = { kind: 'boss', monsters: [boss], killDrops, nodeLoot }
        return json({ resolved, type: 'boss', roll: 20, monster: boss, monsters: [boss], killDrops, nodeLoot, stamina })
      }

      const planned: PlannedNode | undefined = plan.get(nextIdx)
      const roll = 1 + Math.floor(Math.random() * 20)
      const isMain = node.kind === 'main'

      if (planned && planned.category === 'combat') {
        const species = planned.monsters
          .map(name => dg.monsters.filter(m => m.name === name)[0])
          .filter(Boolean)
        const monsters = scaleMonsterGroup(
          dg, p.level, { tier: node.tier, isMain, isBoss: false }, p.klass, p.tier,
          species.length ? { species } : { earlyBias: !isMain && node.tier === 1 },
        )
        const kind = isMain ? 'main' : 'minor'
        const killDrops = rollKillDrops(kind, monsters, roll)
        const nodeLoot = rollNodeLoot(dg, roll, kind, p.level, p.race, p.klass, p.tier, gear)
        pending = { kind, monsters, killDrops, nodeLoot }
        return json({ resolved, type: 'monster', roll, monster: monsters[0], monsters, killDrops, nodeLoot, stamina })
      }

      // ---- ACHADO (inclui a fonte revitalizadora) ----
      if (planned && planned.flavor === 'fountain') {
        return json({ resolved, type: 'find', roll, loot: { gold: 0, drops: [], fountain: true }, gold: 0, cursor: nextIdx, stamina })
      }
      const loot = rollNodeLoot(dg, roll, isMain ? 'main' : 'minor', p.level, p.race, p.klass, p.tier, gear)
      accrued.gold += loot.gold
      for (const d of loot.drops) accrued.drops.push(d)
      return json({ resolved, type: 'find', roll, loot, gold: loot.gold, cursor: nextIdx, stamina })
    }

    if (url.indexOf('/api/dungeon/run/finish') >= 0) {
      const body = init?.body ? JSON.parse(String(init.body)) : {}
      absorb(body.resolve)
      const equipmentWear = hero.equipment.map((eq: any, i: number) => ({
        slot: eq.slot, name: eq.item.name,
        durability: gear[i] ? gear[i].durability : eq.durability,
        maxDurability: eq.maxDurability,
        justBroke: !!(gear[i] && gear[i].durability <= 0),
      }))
      return json({
        finished: true, gold: accrued.gold, xp: accrued.xp, kills: accrued.kills,
        drops: accrued.drops, skippedDrops: [], equipmentWear,
        bossDefeated: accrued.bossKills > 0, leveledUp: false,
      })
    }

    if (url.indexOf('/api/dungeon/run/') >= 0) return json({ ok: true, active: false })
    if (url.indexOf('/api/character/') >= 0) return json({ ok: true })
    return real(input as RequestInfo, init)
  }
}

// ============================================================
// PÁGINA
// ============================================================
const RARITY_PT: Record<string, string> = {
  COMMON: 'comum', UNCOMMON: 'incomum', RARE: 'raro', EPIC: 'épico', LEGENDARY: 'lendário',
}
const ENH_TAG: Record<number, string> = { 16: 'PRI', 17: 'DUO', 18: 'TRI', 19: 'TET', 20: 'PEN' }
const ROMAN = ['I', 'II', 'III', 'IV', 'V']

export default function DungeonRunBench() {
  const [state, setState] = useState<{ p: Params; hero: DungeonCharacter } | null>(null)

  useEffect(() => {
    const p = readParams()
    const hero = buildHero(p)
    installFetchStub(p, hero)
    setState({ p, hero })
  }, [])

  if (!state) return null
  const { p, hero } = state
  const enhTag = ENH_TAG[p.enh] || `+${p.enh}`

  return (
    <>
      <DungeonRun
        dungeon={p.dungeon}
        character={hero}
        tier={p.tier}
        cards
        onExit={() => window.location.reload()}
      />
      {/* Etiqueta do cenário: sem ela é fácil olhar um número e não lembrar de
          que herói ele veio. */}
      <div className="pointer-events-none fixed left-2 top-2 z-[9999] max-w-[92vw] rounded-lg border border-amber-500/40 bg-zinc-950/90 px-3 py-2 text-[11px] leading-relaxed text-amber-100 shadow-lg">
        <div className="font-semibold text-amber-300">
          {p.dungeon.emoji} {p.dungeon.name} · tier {ROMAN[p.tier - 1]}
        </div>
        <div>
          {p.race} {p.klass} nv{p.level} · {RARITY_PT[p.rarity]} {enhTag} · {hero.equipment.length} peças
        </div>
        <div className="text-amber-200/70">
          HP {hero.maxHp} · MP {hero.maxMp} · STR {hero.str} AGI {hero.agi} INT {hero.int} DEF {hero.def}
        </div>
      </div>
    </>
  )
}
