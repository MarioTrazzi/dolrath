'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import BattleScene, { BattleEvent, DiceResult, EquipmentMap, FighterView } from '@/components/battle/BattleScene'
import DungeonBackdrop from '@/components/dungeon/DungeonBackdrop'
import {
  buildTrailPoints,
  MapTrail,
  MapNode,
  PlayerToken,
  MapAmbient,
  MasterNarration,
  DiceOverlay,
  NodeVisualState,
  RevealedNode,
} from '@/components/dungeon/DungeonMap'
import {
  DungeonDef,
  DungeonEventDef,
  DungeonEventKind,
  NodeScaling,
  NodeLoot,
  ScaledMonster,
  scaleMonster,
} from '@/lib/dungeonAdventures'
import {
  TRANSFORMATION_CONFIG,
  getRaceTransformations,
  type TransformationType,
} from '@/lib/transformationSystem'
import { applyEnhancementToStats } from '@/lib/enhancementSystem'
import {
  computeLevers,
  transformLevers,
  deriveGearTier,
  normalizeCombatClass,
  contestedOutcome,
  PVE_DIE,
  K50,
  MAX_LEVEL_REF,
  type Levers,
} from '@/lib/combatModel'

// ============================================================
// DungeonRun — experiência completa de uma masmorra:
// exploração com d20 + eventos dinâmicos na tela, e combate
// turno a turno na arena nova (BattleScene + dados animados)
// ============================================================

export interface DungeonCharacter {
  id: string
  name: string
  level: number
  race: string
  class: string
  avatar?: string | null
  /** Arte da forma transformada (gerada via gpt-image-1); substitui o avatar enquanto transformado */
  transformationImage?: string | null
  /** Metamorfo: mapa forma->imagem (escolhe a forma em combate) */
  transformationImages?: Record<string, string> | null
  hp: number
  maxHp: number
  mp: number
  maxMp: number
  stamina: number
  maxStamina: number
  attack: number
  defense: number
  /** Poder mágico (AP), derivado de INT. Alimenta a Investida Arcana. */
  magicPower: number
  /** Atributos distribuídos (criação + nível) — alimentam o TILT do modelo enxuto. */
  str?: number
  agi?: number
  int?: number
  def?: number
  equipment: any[]
}

interface DungeonRunProps {
  dungeon: DungeonDef
  character: DungeonCharacter
  onExit: (updates: { hp: number; mp: number; stamina: number }) => void
}

type RunPhase = 'explore' | 'combat' | 'summary' | 'defeat'

type CombatStage =
  | 'initiative'
  | 'playerSelect'
  | 'playerRoll'
  | 'playerDefense'
  | 'defenseRoll'
  | 'busy'

type AttackKind = 'basic' | 'weapon' | 'special'
type DefenseKind = 'dodge' | 'defend'

// Combate NÃO gasta stamina (a stamina é o orçamento DIÁRIO de runs).
//
// ⚔️ MODELO ENXUTO (src/lib/combatModel.ts) é a fonte única da verdade — PvE e PvP
// usam o MESMO motor e os MESMOS 3 ataques (ATAQUE-POR-ARMA, docs/combate-ataque-por-arma.md):
//   dano = PODER × powerMult × SORTE(d12) × (1 − DR)
// O PODER vem dos levers (PROFILE da classe × escala nível+gear + TILT dos atributos);
// o ataque PRIMÁRIO é a ARMA (o poder da arma entra via gearTier). Mitigação proporcional
// (DR = armadura/(armadura+K)); esquiva usa a evasão do lever; bloqueio amplifica a
// armadura (×BLOCK_ARMOR_MULT). Todos rolam d12 (a sorte do modelo); diferem só no powerMult.
//  - basic (Básico): golpe barato/seguro (powerMult menor).
//  - weapon (Arma): o ataque primário da sua arma (powerMult cheio).
//  - special (Especial): burst — só LIBERADO transformado (igual ao PvP).
// (powerMults espelham combatModel.ATTACKS: 0.72 / 1.0 / 1.5)
// DISPUTA DE DADOS (combatModel.contestedOutcome): cada ataque rola um dado próprio
// (básico d8 / arma d12 / especial d20 — ver PVE_DIE). MP: a arma é um golpe canalizado
// (8 MP) e o especial é a SKILL da arma (18 MP); o básico é o fallback sem custo. Sem
// regen passivo no combate — o MP volta de consumíveis/espólios.
const ATTACKS: Record<
  AttackKind,
  { label: string; icon: string; powerMult: number; requiresTransform: boolean; mp: number }
> = {
  basic: { label: 'Ataque Básico', icon: '👊', powerMult: 0.72, requiresTransform: false, mp: 0 },
  weapon: { label: 'Ataque da Arma', icon: '⚔️', powerMult: 1.0, requiresTransform: false, mp: 8 },
  special: { label: 'Especial', icon: '✨', powerMult: 1.5, requiresTransform: true, mp: 18 },
}

// Especial = SKILL da ARMA equipada (nome por categoria; detecta pelo nome do item).
function weaponSkillName(equipment: any[]): string {
  const w = (equipment || []).find((e: any) => {
    const slot = String(e?.slot || '').toLowerCase()
    return slot === 'weapon' || slot === 'mainhand' || slot === 'main_hand'
  })
  const n = String(w?.item?.name || w?.name || '').toLowerCase()
  if (/manopla|punho|cestus/.test(n)) return 'Punho do Trovão'
  if (/garra|presa|lâmina das|lamina das/.test(n)) return 'Garras Selvagens'
  if (/adaga|punhal|presas/.test(n)) return 'Dança das Lâminas'
  if (/arco/.test(n)) return 'Flecha Perfurante'
  if (/cajado|bordão|bordao|orbe/.test(n)) return /orbe/.test(n) ? 'Pulso Arcano' : 'Explosão Arcana'
  if (/espada|lâmina|lamina|aço|aco/.test(n)) return 'Talho Brutal'
  return 'Especial'
}

// Custo de stamina por TIPO de nó ao avançar na trilha (exploração).
const MINOR_STEP_COST = 4 // nó menor
const MAIN_STEP_COST = 8  // sala principal (encontro garantido)
const BOSS_STEP_COST = 6  // aproximar-se do covil

// Chance de encontrar monstro num nó MENOR (sala principal é sempre monstro).
const MINOR_MONSTER_CHANCE = 0.4

// Custo de stamina ao DEFENDER no combate (esquiva e soco são grátis).
const DEFEND_STAMINA_COST = 1

// Falas de transição do Mestre entre as salas (genéricas, tom de RPG)
const TRANSITIONS = [
  'Você respira fundo e segue trilha adentro.',
  'A vereda serpenteia entre raízes e sombras...',
  'Mais fundo na masmorra, o ar fica denso e frio.',
  'Galhos rangem acima; você avança com a lâmina à mão.',
  'A névoa se abre por um instante, revelando o caminho.',
]

const MONSTER_ID = 'dungeon-monster'

interface ResolvedEvent {
  def: DungeonEventDef
  text: string
  effects: string[]
  monster?: ScaledMonster
}

interface Banner {
  key: number
  icon: string
  text: string
}

// Respostas das rotas servidor-autoritativas (/api/dungeon/run/*).
interface StepResponse {
  type: 'find' | 'monster' | 'boss'
  roll?: number
  monster?: ScaledMonster
  loot?: NodeLoot
  gold?: number
  cursor?: number
  stamina?: number
  pendingCombat?: boolean
  error?: string
}
interface CombatGrant {
  gold: number
  killGold: number
  lootGold: number
  xp: number
  loot: NodeLoot
}
interface CombatResponse {
  granted?: CombatGrant
  finished?: boolean
  bossDefeated?: boolean
  leveledUp?: boolean
  newLevel?: number
  error?: string
}

// Efeito restaurador de um consumível a partir dos stats do catálogo.
function consumableEffect(stats: any): { hp: number; mp: number } {
  const s = stats || {}
  return { hp: Number(s.healAmount) || 0, mp: Number(s.manaAmount) || 0 }
}
function consumableIcon(stats: any): string {
  const e = consumableEffect(stats)
  if (e.hp && e.mp) return '💖'
  if (e.hp) return '❤️'
  if (e.mp) return '🔮'
  return '🧪'
}

interface DungeonConsumable {
  id: string
  name: string
  hp: number
  mp: number
  qty: number
  icon: string
}

function rollDie(sides: number): number {
  return 1 + Math.floor(Math.random() * sides)
}

function mkResult(sides: number, modifier: number): DiceResult {
  const r = rollDie(sides)
  return { sides, roll: r, modifier, total: r + modifier }
}

// Mapeia o array de CharacterEquipment (Prisma) para o formato da arena
function mapEquipment(equipArray: any[]): EquipmentMap {
  const map: EquipmentMap = {}
  for (const eq of equipArray || []) {
    if (eq?.slot && eq?.item) {
      map[eq.slot] = {
        id: eq.item.id,
        name: eq.item.name,
        image: eq.item.image,
        type: eq.item.type,
        stats: eq.item.stats || {},
        enhancementLevel: eq.enhancementLevel || 0,
      }
    }
  }
  return map
}

// Stats efetivos de uma peça de equipamento JÁ com o aprimoramento aplicado.
// (Antes o combate ignorava enhancementLevel e procurava chaves attack/defense
//  inexistentes — então armadura e aprimoramento valiam zero na masmorra.)
function enhancedStats(eq: any): Record<string, number> {
  const raw = eq?.item?.stats || {}
  const level = Number(eq?.enhancementLevel) || 0
  return applyEnhancementToStats(raw, level) as Record<string, number>
}

const num = (v: any) => (typeof v === 'number' ? v : Number(v) || 0)

// Poder agregado do equipamento (com aprimoramento) nas três dimensões usadas
// pelo combate da masmorra.
function equipmentPower(equipArray: any[]): { attack: number; defense: number; hp: number } {
  let attack = 0
  let defense = 0
  let hp = 0
  for (const eq of equipArray || []) {
    const s = enhancedStats(eq)
    // ataque: melhor atributo ofensivo da peça (gear dá atributos REAIS — STR/AGI/INT)
    attack += Math.max(num(s.str), num(s.agi), num(s.int))
    // defesa: DEF da peça (+ resistência/constituição, se houver)
    defense += num(s.def) + Math.floor((num(s.res) + num(s.con)) / 2)
    // vida extra das peças
    hp += num(s.hp)
  }
  return { attack, defense, hp }
}

interface Outcome {
  hit: boolean
  damage: number
  crit: boolean
  /** dados e bônus exibíveis (estilo RiPG) para o log de combate */
  sides: number
  atkRoll: number
  defRoll: number
  atkBonus: number
  defBonus: number
}

// Resolve UM golpe pela DISPUTA DE DADOS (combatModel.contestedOutcome). `atkRoll`/`defRoll`
// = os dados JÁ rolados para a animação (mesmo dado do ataque, `sides`); `power` = poder
// efetivo já com o powerMult; `atkScale`/`defScale` = escalas de poder (gear+nível) que
// entram no ACERTO. Esquiva COMPLETA (espelho do crítico) só no extremo; bloqueio vence → golpe aparado; senão dano ∝ margem.
function computeOutcome(
  atkRoll: number,
  defRoll: number,
  sides: number,
  defenseChoice: DefenseKind,
  power: number,
  defender: { armor: number; K: number; evade: number },
  atkScale: number,
  defScale: number
): Outcome {
  const r = contestedOutcome({
    power, sides, atkRoll, defRoll,
    defense: defenseChoice === 'defend' ? 'block' : 'dodge',
    defender, atkScale, defScale,
  })
  return {
    hit: !r.avoided, damage: r.damage, crit: r.crit,
    sides, atkRoll: r.roll, defRoll: r.defRoll, atkBonus: r.atkBonus, defBonus: r.defBonus,
  }
}

// Monta a linha de dado estilo RiPG: "⚔️ d12 = 9 +3 (esquiva) = 12"
function diceLine(label: string, sides: number, roll: number, bonus: number, tag: string): string {
  return bonus > 0
    ? `${label} d${sides} = ${roll} +${bonus} ${tag} = ${roll + bonus}`
    : `${label} d${sides} = ${roll} = ${roll}`
}

export default function DungeonRun({ dungeon, character, onExit }: DungeonRunProps) {
  // ---------- Recursos locais do personagem (durante a run) ----------
  // HP e MP começam cheios: a stamina diária é o que limita as tentativas.
  const [hp, setHp] = useState(() => character.maxHp + equipmentPower(character.equipment).hp)
  const [mp, setMp] = useState(character.maxMp)
  const [stamina, setStamina] = useState(character.stamina)
  const hpRef = useRef(hp)
  hpRef.current = hp

  // ---------- Estado geral da run ----------
  const [phase, setPhase] = useState<RunPhase>('explore')
  const [log, setLog] = useState<string[]>([dungeon.enterText])
  const [totals, setTotals] = useState({ gold: 0, xp: 0, kills: 0, items: [] as string[] })
  const totalsRef = useRef(totals)
  totalsRef.current = totals
  const [levelUpMsg, setLevelUpMsg] = useState<string | null>(null)

  // ---------- Mapa de exploração (trilha de nós) ----------
  // entrada → (nós menores + sala principal) × salas → covil do boss.
  const trailPoints = useMemo(
    () => buildTrailPoints(dungeon.rooms, dungeon.minorNodes),
    [dungeon.rooms, dungeon.minorNodes]
  )
  const LAST = trailPoints.length - 1
  const [tokenIdx, setTokenIdx] = useState(0)
  const [moving, setMoving] = useState(false)
  const [narration, setNarration] = useState(dungeon.enterText)
  const [nodeEvents, setNodeEvents] = useState<Record<number, RevealedNode>>({})
  const [floats, setFloats] = useState<{ id: number; label: string; color: string }[]>([])
  // Consumíveis do inventário do personagem (usáveis no mapa e no combate)
  const [consumables, setConsumables] = useState<DungeonConsumable[]>([])
  const [showItems, setShowItems] = useState(false)
  const atBoss = tokenIdx === LAST
  const nextIsBoss = tokenIdx === LAST - 1
  const nextMainNode = trailPoints[tokenIdx + 1]?.kind === 'main'
  // Progresso por SALA PRINCIPAL (os nós menores não contam como "sala").
  const curTier = trailPoints[tokenIdx]?.tier || 0
  const atMainNode = trailPoints[tokenIdx]?.kind === 'main'
  const mainsDone = trailPoints.reduce((n, p, i) => n + (p.kind === 'main' && i < tokenIdx ? 1 : 0), 0)
  // Escalonamento (tier/tipo de nó) a partir de um índice da trilha.
  const scalingAt = (idx: number): NodeScaling => {
    const pt = trailPoints[idx]
    return { tier: pt?.tier || 1, isMain: pt?.kind === 'main', isBoss: pt?.kind === 'boss' }
  }
  const stepCost = (idx: number): number => {
    const pt = trailPoints[idx]
    if (pt?.kind === 'boss') return BOSS_STEP_COST
    if (pt?.kind === 'main') return MAIN_STEP_COST
    return MINOR_STEP_COST
  }

  // ---------- Exploração ----------
  const [exploreRolling, setExploreRolling] = useState(false)
  const [exploreResult, setExploreResult] = useState<DiceResult | null>(null)
  const [eventCard, setEventCard] = useState<ResolvedEvent | null>(null)
  const [trapShake, setTrapShake] = useState(false)

  // ---------- Combate ----------
  const [monster, setMonster] = useState<ScaledMonster | null>(null)
  const monsterRef = useRef<ScaledMonster | null>(null)
  monsterRef.current = monster
  const [stage, setStage] = useState<CombatStage>('busy')
  const [currentTurnId, setCurrentTurnId] = useState<string | null>(null)
  const [pendingAttack, setPendingAttack] = useState<AttackKind | null>(null)
  const [monsterPlan, setMonsterPlan] = useState<AttackKind | null>(null)
  const [defenseChoice, setDefenseChoice] = useState<DefenseKind | null>(null)
  const [panelResult, setPanelResult] = useState<DiceResult | null>(null)
  const [hasRolled, setHasRolled] = useState(false)
  const [diceResults, setDiceResults] = useState<Record<string, DiceResult | undefined>>({})
  const [battleEvent, setBattleEvent] = useState<BattleEvent | null>(null)
  const [combatEnded, setCombatEnded] = useState(false)
  const [winnerId, setWinnerId] = useState<string | null>(null)
  const [lootCard, setLootCard] = useState<ResolvedEvent | null>(null)
  const battleEventCounter = useRef(0)
  // d20 de sorte do nó atual (define a qualidade do loot pós-combate)
  const lootRollRef = useRef(12)

  // ---------- Sessão SERVIDOR-AUTORITATIVA ----------
  // O servidor é dono do RNG e do crédito de gold/xp/loot. O cliente guarda só
  // o runId e o monstro que o servidor rolou para o nó atual (para o combate).
  const runIdRef = useRef<string | null>(null)
  const [runReady, setRunReady] = useState(false)
  const serverMonsterRef = useRef<ScaledMonster | null>(null)
  const startedRef = useRef(false)

  // ---------- Transformação (local, por combate) ----------
  const transformForms = useMemo(() => getRaceTransformations(character.race), [character.race])
  const [transform, setTransform] = useState<{ type: TransformationType; turns: number } | null>(null)
  const [transformCd, setTransformCd] = useState(0)
  const [showFormPicker, setShowFormPicker] = useState(false)
  const transformRef = useRef(transform)
  transformRef.current = transform
  const transformCdRef = useRef(transformCd)
  transformCdRef.current = transformCd
  const activeTransformCfg = transform ? TRANSFORMATION_CONFIG[transform.type] : null

  // ---------- Banners centrais ----------
  const [banner, setBanner] = useState<Banner | null>(null)
  const bannerKey = useRef(0)

  // ---------- Timers ----------
  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([])
  const later = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms)
    timeouts.current.push(t)
  }, [])
  useEffect(() => () => { timeouts.current.forEach(clearTimeout) }, [])

  const pushLog = useCallback((msg: string) => {
    setLog(prev => [...prev.slice(-40), msg])
  }, [])

  // Número flutuante sobre o mapa (efeito de ganho/perda)
  const pushFloat = useCallback((label: string, color: string) => {
    const id = Math.random()
    setFloats(prev => [...prev, { id, label, color }])
    later(() => setFloats(prev => prev.filter(f => f.id !== id)), 1500)
  }, [later])

  const showBanner = useCallback((icon: string, text: string, duration = 2400) => {
    bannerKey.current += 1
    const key = bannerKey.current
    setBanner({ key, icon, text })
    later(() => setBanner(prev => (prev?.key === key ? null : prev)), duration)
  }, [later])

  const pushBattleEvent = useCallback((data: Omit<BattleEvent, 'id'>) => {
    battleEventCounter.current += 1
    setBattleEvent({ ...data, id: battleEventCounter.current })
  }, [])

  // ---------- Persistência (APIs existentes) ----------
  const persistStamina = useCallback((cost: number) => {
    fetch(`/api/character/${character.id}/update-stamina`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staminaCost: cost }),
    })
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data?.character?.stamina !== undefined) setStamina(data.character.stamina)
      })
      .catch(() => {})
  }, [character.id])

  // Abre a sessão no servidor (uma vez). O servidor valida posse + gating e
  // passa a ser dono do RNG/recompensas. Sem runId, a exploração fica travada.
  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    ;(async () => {
      try {
        const res = await fetch('/api/dungeon/run/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ characterId: character.id, dungeonId: dungeon.id }),
        })
        const data = await res.json()
        if (!res.ok) {
          showBanner('🚫', data?.error || 'Não foi possível entrar na masmorra')
          return
        }
        runIdRef.current = data.runId
        if (typeof data.stamina === 'number') setStamina(data.stamina)
        setRunReady(true)
      } catch {
        showBanner('⚠️', 'Sem conexão com o servidor')
      }
    })()
  }, [character.id, dungeon.id, showBanner])

  // Exibe (sem persistir) o espólio que o SERVIDOR já creditou: ouro + drops.
  const showLoot = useCallback((loot: NodeLoot) => {
    if (loot.gold > 0) {
      setTotals(prev => ({ ...prev, gold: prev.gold + loot.gold }))
      pushFloat(`+${loot.gold} 💰`, '#f39c12')
    }
    for (const d of loot.drops) {
      const label = d.enhancement ? `${d.name} +${d.enhancement}` : d.name
      setTotals(prev => ({ ...prev, items: [...prev.items, label] }))
      pushLog(`${d.emoji} ${label}`)
    }
  }, [pushFloat, pushLog])

  // Carrega os consumíveis restauradores (HP/MP) do inventário do personagem.
  const loadConsumables = useCallback(async () => {
    try {
      const res = await fetch(`/api/store/inventory?characterId=${character.id}`)
      if (!res.ok) return
      const data = await res.json()
      const list: DungeonConsumable[] = (Array.isArray(data) ? data : [])
        .filter((row: any) => row?.item?.type === 'CONSUMABLE' && row.quantity > 0)
        .map((row: any) => {
          const e = consumableEffect(row.item.stats)
          return { id: row.item.id, name: row.item.name, hp: e.hp, mp: e.mp, qty: row.quantity, icon: consumableIcon(row.item.stats) }
        })
        .filter((c: DungeonConsumable) => c.hp > 0 || c.mp > 0)
      setConsumables(list)
    } catch {
      /* silencioso */
    }
  }, [character.id])

  useEffect(() => { loadConsumables() }, [loadConsumables])

  // ---------- Levers de combate (MODELO ENXUTO) ----------
  // Gear conta via TIER (raridade × aprimoramento → escala de poder); atributos da
  // criação/nível via TILT; a transformação aplica o buff simétrico (×TRANSFORM_SCALE).
  const gear = useMemo(() => equipmentPower(character.equipment), [character.equipment])
  const gearTier = useMemo(
    () => deriveGearTier((character.equipment || []).map((e: any) => ({
      rarity: e?.item?.rarity ?? e?.rarity,
      enhancementLevel: e?.enhancementLevel,
    }))),
    [character.equipment]
  )
  const combatClass = useMemo(() => normalizeCombatClass(character.class) ?? 'warrior', [character.class])
  const baseLevers = useMemo<Levers>(
    () => computeLevers(combatClass, character.level, gearTier, {
      str: character.str, agi: character.agi, int: character.int, def: character.def,
    }),
    [combatClass, character.level, gearTier, character.str, character.agi, character.int, character.def]
  )
  // Transformação = buff simétrico por cima dos levers-base (×TRANSFORM_SCALE).
  const playerLevers = useMemo<Levers>(
    () => (transform ? transformLevers(baseLevers) : baseLevers),
    [transform, baseLevers]
  )
  // HP da run = pool do jogo (atributos via maxHp + vida das peças). É o recurso que o
  // jogador gerencia entre lutas; a OFENSA/DEFESA do combate vêm dos levers.
  const effMaxHp = character.maxHp + gear.hp
  // Poder efetivo de um ataque = poder do lever × multiplicador do tipo.
  const playerPowerFor = (kind: AttackKind) => playerLevers.power * ATTACKS[kind].powerMult
  // Tem arma de mão equipada? (sem arma: some o "Ataque da Arma"; luta-se no soco)
  const hasWeapon = useMemo(
    () => (character.equipment || []).some((e: any) => {
      const slot = String(e?.slot || '').toLowerCase()
      return slot === 'weapon' || slot === 'mainhand' || slot === 'main_hand'
    }),
    [character.equipment]
  )
  // O ESPECIAL é a skill da ARMA equipada (nome por categoria). SEM arma ele vem da
  // TRANSFORMAÇÃO (golpe da fera), então recebe um nome equivalente.
  const specialName = useMemo(
    () => (hasWeapon ? weaponSkillName(character.equipment) : 'Fúria Selvagem'),
    [hasWeapon, character.equipment]
  )

  // ---------- Lutadores para a arena ----------
  const playerFighter: FighterView = useMemo(() => ({
    id: character.id,
    name: character.name,
    level: character.level,
    race: character.race,
    class: character.class,
    avatar: character.avatar,
    hp,
    maxHp: effMaxHp,
    mp,
    maxMp: character.maxMp,
    stamina,
    maxStamina: character.maxStamina,
    equipmentMap: mapEquipment(character.equipment),
    isAlive: hp > 0,
    isTransformed: !!transform,
    transformationType: transform?.type ?? null,
    // Metamorfo: usa a arte da forma ativa; demais raças usam a única imagem.
    transformationImage:
      (transform && character.transformationImages?.[transform.type]) ||
      character.transformationImage ||
      null,
    // ATK = poder ofensivo, DEF = armadura (ambos do lever; deltas = ganho da transformação),
    // STR = atributo de força distribuído (não muda na transformação).
    combatStats: {
      ad: Math.round(playerLevers.power),
      ap: Math.round(playerLevers.armor),
      dp: Math.max(0, Math.round(character.str ?? 0)),
      adDelta: Math.round(playerLevers.power - baseLevers.power),
      apDelta: Math.round(playerLevers.armor - baseLevers.armor),
      dpDelta: 0,
    },
    combatStatLabels: { ad: 'ATK', ap: 'DEF', dp: 'STR' },
  }), [character, hp, mp, stamina, transform, effMaxHp, playerLevers, baseLevers])

  const monsterFighter: FighterView | null = useMemo(() => monster ? {
    id: MONSTER_ID,
    name: monster.name,
    level: monster.level,
    race: dungeon.name,
    class: monster.isBoss ? 'Boss' : 'Monstro',
    avatarEmoji: monster.emoji,
    hp: monster.hp,
    maxHp: monster.maxHp,
    mp: 0,
    maxMp: 0,
    stamina: 0,
    maxStamina: 0,
    isAlive: monster.hp > 0,
    // Monstro não tem atributo STR: card mostra só ATK (ataque) e DEF (defesa).
    combatStats: {
      ad: Math.floor(monster.attack + monster.level / 2),
      ap: monster.defense,
      dp: undefined,
    },
    combatStatLabels: { ad: 'ATK', ap: 'DEF' },
  } : null, [monster, dungeon.name])

  // ============================================================
  // EXPLORAÇÃO — mapa de trilha de nós
  // ============================================================

  // Estado visual de cada nó do mapa
  const nodeState = (idx: number): NodeVisualState => {
    if (idx === tokenIdx) return 'current'
    if (idx < tokenIdx) return 'done'
    if (idx === tokenIdx + 1) return 'next'
    return 'locked'
  }

  // Monta o card do nó a partir do que o SERVIDOR resolveu (monstro já rolado,
  // ou achado já creditado). Nenhum RNG ou crédito acontece aqui no cliente.
  const applyServerEvent = (data: StepResponse, atIdx: number): ResolvedEvent => {
    const sc = scalingAt(atIdx)
    lootRollRef.current = data.roll ?? 12

    if (data.type === 'monster' && data.monster) {
      const ev = dungeon.events.find(e => e.kind === 'monster')!
      const scaled = data.monster
      serverMonsterRef.current = scaled
      setNodeEvents(prev => ({ ...prev, [atIdx]: { kind: 'monster', emoji: scaled.emoji } }))
      pushLog(`${ev.icon} ${ev.title} ${scaled.emoji} ${scaled.name} apareceu!`)
      return {
        def: ev,
        text: sc.isMain ? `Guardião da sala: ${ev.description}` : ev.description,
        effects: [`${scaled.emoji} ${scaled.name} • Nv.${scaled.level}`],
        monster: scaled,
      }
    }

    // Achado — o servidor já creditou ouro/itens; aqui só exibimos.
    const loot: NodeLoot = data.loot ?? { gold: 0, drops: [] }
    showLoot(loot)

    const hasGear = loot.drops.some(d => d.kind === 'item' || d.kind === 'stone')
    const anyDrop = loot.drops.length > 0 || loot.gold > 0
    const roll = data.roll ?? 12
    const tier = roll <= 5 ? 'low' : roll <= 13 ? 'mid' : 'high'
    const icon = hasGear ? '🌟' : anyDrop ? '✨' : '🍃'
    const title = hasGear ? 'Grande achado!' : anyDrop ? 'Um bom achado' : 'Nada de útil...'
    const text = !anyDrop
      ? dungeon.ambience[Math.floor(Math.random() * dungeon.ambience.length)]
      : tier === 'high'
        ? 'A sorte sorri: você vasculha e encontra algo valioso.'
        : tier === 'mid'
          ? 'Entre folhas e pedras, você recolhe o que dá.'
          : 'Pouca coisa — mas nada se perde.'
    const revealKind: DungeonEventKind = hasGear ? 'item' : anyDrop ? 'gold' : 'nothing'
    setNodeEvents(prev => ({ ...prev, [atIdx]: { kind: revealKind, emoji: icon } }))

    const effects: string[] = []
    if (loot.gold > 0) effects.push(`+${loot.gold} 💰`)
    for (const d of loot.drops) effects.push(`${d.emoji} ${d.name}`)

    const def: DungeonEventDef = { kind: revealKind, min: 0, max: 0, icon, title, description: text }
    return { def, text, effects }
  }

  // Botão principal: pede o próximo nó ao SERVIDOR (ele cobra stamina, rola o
  // d20 e decide monstro/achado/boss), depois anima o resultado recebido.
  const advance = async () => {
    if (phase !== 'explore' || exploreRolling || moving || eventCard || atBoss) return
    if (!runReady || !runIdRef.current) return
    const dest = tokenIdx + 1

    setExploreRolling(true)
    let data: StepResponse
    try {
      const res = await fetch('/api/dungeon/run/step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId: runIdRef.current }),
      })
      data = await res.json()
      if (!res.ok) {
        setExploreRolling(false)
        if (res.status === 400) showBanner('😮‍💨', `${data?.error || 'Stamina insuficiente'} — ela reseta amanhã`)
        else showBanner('⚠️', data?.error || 'Falha ao avançar')
        return
      }
    } catch {
      setExploreRolling(false)
      showBanner('⚠️', 'Sem conexão com o servidor')
      return
    }

    if (typeof data.stamina === 'number') setStamina(data.stamina)

    // Covil do boss: o monstro do boss veio do servidor (sem rolagem de d20).
    if (data.type === 'boss') {
      setExploreRolling(false)
      if (data.monster) serverMonsterRef.current = data.monster
      setMoving(true)
      setTokenIdx(dest)
      setNarration('A trilha desemboca no covil. O ar treme... algo antigo se ergue.')
      pushLog(`👑 Você chegou ao covil de ${dungeon.boss.name}...`)
      later(() => setMoving(false), 900)
      later(() => showBanner('👑', `${dungeon.boss.name} desperta!`, 3000), 950)
      return
    }

    // Nó de evento: anima o d20 que o SERVIDOR rolou e revela.
    setExploreResult(null)
    const result: DiceResult = { sides: 20, roll: data.roll ?? 12, modifier: 0, total: data.roll ?? 12 }
    later(() => setExploreResult(result), 700)
    later(() => {
      setExploreRolling(false)
      setExploreResult(null)
      setMoving(true)
      setTokenIdx(dest)
      const resolved = applyServerEvent(data, dest)
      later(() => setMoving(false), 850)
      later(() => setEventCard(resolved), 650)
    }, 2200)
  }

  // Fecha o card de evento e o Mestre narra a transição.
  const dismissEvent = () => {
    setEventCard(null)
    setExploreResult(null)
    setExploreRolling(false)
    if (nextIsBoss) {
      setNarration('A trilha termina adiante. Você sente um olhar antigo cravado em você...')
    } else if (!atBoss) {
      setNarration(TRANSITIONS[tokenIdx % TRANSITIONS.length])
    }
  }

  const isBossRoom = atBoss

  // ============================================================
  // COMBATE (motor local na arena nova)
  // ============================================================

  const startCombat = (m: ScaledMonster) => {
    setMonster(m)
    setEventCard(null)
    setExploreResult(null)
    setExploreRolling(false)
    setMoving(false)
    setCombatEnded(false)
    setWinnerId(null)
    setDiceResults({})
    setPanelResult(null)
    setHasRolled(false)
    setPendingAttack(null)
    setMonsterPlan(null)
    setDefenseChoice(null)
    setCurrentTurnId(null)
    setBattleEvent(null)
    setLootCard(null)
    // Transformação reinicia a cada combate
    setTransform(null)
    setTransformCd(0)
    setShowFormPicker(false)
    setPhase('combat')
    setStage('initiative')
    pushLog(`⚔️ Combate contra ${m.emoji} ${m.name} começou!`)
  }

  // ---------- Transformação (custa só MP; stamina é o orçamento diário) ----------
  const activateTransform = (type: TransformationType) => {
    const cfg = TRANSFORMATION_CONFIG[type]
    if (!cfg || transform || transformCd > 0) return
    if (mp < cfg.cost.mp) {
      showBanner('🔮', `MP insuficiente para transformar! (${cfg.cost.mp}🔮)`)
      return
    }
    setMp(prev => Math.max(0, prev - cfg.cost.mp))
    setTransform({ type, turns: cfg.duration })
    setShowFormPicker(false)
    showBanner('✨', `${cfg.name} ativada! (${cfg.duration} turnos)`, 2800)
    pushLog(`✨ Você assumiu a ${cfg.name}!`)
  }

  // Avança os contadores de transformação ao fim de cada turno ofensivo do jogador
  const tickPlayerTurn = useCallback(() => {
    const t = transformRef.current
    if (t) {
      const remaining = t.turns - 1
      if (remaining <= 0) {
        const cfg = TRANSFORMATION_CONFIG[t.type]
        setTransform(null)
        setTransformCd(cfg.cooldown)
        showBanner('↩️', 'A transformação terminou')
        pushLog('↩️ Sua transformação terminou.')
      } else {
        setTransform({ ...t, turns: remaining })
      }
    } else if (transformCdRef.current > 0) {
      setTransformCd(transformCdRef.current - 1)
    }
  }, [showBanner, pushLog])

  // Levers do MONSTRO (classe desconhecida → fallback): poder/armadura dos stats
  // escalados, K pelo nível. Espelha o derive do socket-server e o dungeon-sim.
  const monsterLevers = (m: ScaledMonster): Levers => {
    const S = m.level / MAX_LEVEL_REF + 0.5 // K pela escala do NÍVEL (= sim/socket)
    // scale (p/ a disputa de dados) = a escala de PODER do monstro (gear+nível âncora).
    return { power: m.attack, armor: m.defense, hp: m.maxHp, evade: 0.06, K: K50 * S, scale: m.scale ?? S }
  }
  // Poder efetivo do golpe do monstro = poder do lever × multiplicador do tipo.
  const monsterPowerFor = (m: ScaledMonster, kind: AttackKind) => monsterLevers(m).power * ATTACKS[kind].powerMult

  // ---------- Iniciativa ----------
  const handleInitiativeRoll = () => {
    if (hasRolled) return
    setHasRolled(true)
    const mine = mkResult(20, 0)
    setPanelResult(mine)
    const theirs = mkResult(20, 0)
    later(() => setDiceResults(prev => ({ ...prev, [MONSTER_ID]: theirs })), 1700)
    later(() => {
      setStage('busy')
      setPanelResult(null)
      setHasRolled(false)
      const playerFirst = mine.total >= theirs.total
      showBanner(playerFirst ? '⚡' : '😈', playerFirst ? 'Você começa!' : `${monsterRef.current?.name} começa!`)
      later(() => setDiceResults({}), 1200)
      later(() => {
        if (playerFirst) {
          setCurrentTurnId(character.id)
          setStage('playerSelect')
        } else {
          monsterTelegraph()
        }
      }, 1400)
    }, 3000)
  }

  // ---------- Turno do jogador (Especial exige transformação, igual ao PvP) ----------
  const choosePlayerAttack = (kind: AttackKind) => {
    if (ATTACKS[kind].requiresTransform && !transform) {
      showBanner('🔒', 'O Especial só pode ser usado transformado!')
      return
    }
    if (mp < ATTACKS[kind].mp) {
      showBanner('🔵', `MP insuficiente para ${ATTACKS[kind].label}! (${ATTACKS[kind].mp}🔵)`)
      return
    }
    setPendingAttack(kind)
    setPanelResult(null)
    setHasRolled(false)
    setStage('playerRoll')
  }

  const handlePlayerAttackRoll = () => {
    const m = monsterRef.current
    if (!m || hasRolled || !pendingAttack) return
    setHasRolled(true)
    // DISPUTA DE DADOS: cada ataque rola o SEU dado (básico d8 / arma d12 / especial d20).
    const sides = PVE_DIE[pendingAttack]
    const atk = mkResult(sides, 0)
    setPanelResult(atk)

    // Monstro reage e rola o MESMO dado (maior vence; evasão/escala entram na margem).
    const mDefChoice: DefenseKind = Math.random() < 0.5 ? 'dodge' : 'defend'
    const def = mkResult(sides, 0)
    later(() => setDiceResults(prev => ({ ...prev, [MONSTER_ID]: def })), 1700)
    later(() => resolvePlayerAttack(atk, def, mDefChoice), 3000)
  }

  const resolvePlayerAttack = (atk: DiceResult, def: DiceResult, mDefChoice: DefenseKind) => {
    const m = monsterRef.current
    if (!m || !pendingAttack) return
    const atkDef = ATTACKS[pendingAttack]
    setStage('busy')
    setPanelResult(null)
    setHasRolled(false)
    const kindUsed = pendingAttack
    setPendingAttack(null)

    // Custo de MP do ataque (arma/especial) — sem regen passivo no combate.
    if (atkDef.mp > 0) setMp(prev => Math.max(0, prev - atkDef.mp))

    const mLev = monsterLevers(m)
    const outcome = computeOutcome(
      atk.roll, def.roll, PVE_DIE[kindUsed], mDefChoice,
      playerPowerFor(kindUsed), mLev, playerLevers.scale, mLev.scale,
    )
    pushBattleEvent({
      kind: 'resolve',
      attackerId: character.id,
      defenderId: MONSTER_ID,
      action: kindUsed,
      defenseAction: mDefChoice,
      hit: outcome.hit,
      damage: outcome.damage,
      isCritical: outcome.crit,
    })

    later(() => setDiceResults({}), 1500)

    // Log estilo RiPG: a conta dos dois dados + a linha que justifica o dano.
    const defTag = mDefChoice === 'dodge' ? '(esquiva)' : '(defesa)'
    pushLog(
      `${diceLine(atkDef.icon, outcome.sides, outcome.atkRoll, outcome.atkBonus, '(perícia)')}  vs  ` +
      `${diceLine(m.emoji, outcome.sides, outcome.defRoll, outcome.defBonus, defTag)}`
    )
    if (!outcome.hit) pushLog(`💨 ${m.name} esquiva o golpe por completo!`)
    else if (outcome.crit) pushLog(`💥 Acerto CRÍTICO! ${outcome.damage} de dano em ${m.name}`)
    else pushLog(`${atkDef.icon} Acerto: ${outcome.damage} de dano em ${m.name}`)

    const newHp = Math.max(0, m.hp - outcome.damage)
    later(() => setMonster(prev => (prev ? { ...prev, hp: newHp } : prev)), 500)
    if (newHp <= 0) {
      later(() => handleCombatVictory(m), 1600)
      return
    }
    tickPlayerTurn()
    later(() => monsterTelegraph(), 2000)
  }

  // ---------- Turno do monstro ----------
  const monsterTelegraph = () => {
    const m = monsterRef.current
    if (!m) return
    setCurrentTurnId(MONSTER_ID)
    // Bosses preferem golpes fortes; só quem tem habilidade especial pode usá-la.
    const r = Math.random()
    const kind: AttackKind = m.isBoss
      ? (r < 0.35 ? 'basic' : r < 0.7 ? 'weapon' : 'special')
      : m.hasSpecial
        ? (r < 0.5 ? 'basic' : r < 0.8 ? 'weapon' : 'special')
        : (r < 0.55 ? 'basic' : 'weapon')
    setMonsterPlan(kind)
    showBanner(m.emoji, `${m.name} prepara um ${ATTACKS[kind].label}!`, 2600)
    setStage('playerDefense')
  }

  // ---------- Usar consumível (mapa e combate) ----------
  const useConsumable = (c: DungeonConsumable) => {
    if (c.qty <= 0) return
    const inCombatTurn = phase === 'combat' && stage === 'playerSelect'
    const hpFull = hpRef.current >= effMaxHp
    const mpFull = mp >= character.maxMp
    if ((c.hp > 0 && c.mp === 0 && hpFull) || (c.mp > 0 && c.hp === 0 && mpFull)) {
      showBanner('✋', 'Recurso já está cheio')
      return
    }
    if (c.hp > 0) {
      const gain = Math.min(effMaxHp, hpRef.current + c.hp) - hpRef.current
      setHp(prev => Math.min(effMaxHp, prev + c.hp))
      if (gain > 0) pushFloat(`+${gain} ❤️`, '#2ecc71')
    }
    if (c.mp > 0) {
      setMp(prev => Math.min(character.maxMp, prev + c.mp))
      pushFloat(`+${c.mp} 🔮`, '#3b82f6')
    }
    pushLog(`🧪 Usou ${c.name}`)
    showBanner(c.icon, `${c.name} usada!`)

    // baixa otimista + persistência
    setConsumables(prev => prev.map(x => (x.id === c.id ? { ...x, qty: x.qty - 1 } : x)).filter(x => x.qty > 0))
    fetch(`/api/character/${character.id}/use-consumable`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId: c.id }),
    }).catch(() => {})

    setShowItems(false)

    // No combate, usar item consome o turno do jogador.
    if (inCombatTurn) {
      setStage('busy')
      tickPlayerTurn()
      later(() => monsterTelegraph(), 1400)
    }
  }

  // Esquivar é de graça (aposta no dado); Defender custa 1 stamina (mitiga sempre, então
  // não pode ser spammado). Soco/esquiva grátis empurram os recursos pros golpes de MP.
  const choosePlayerDefense = (choice: DefenseKind) => {
    if (choice === 'defend') {
      if (stamina < DEFEND_STAMINA_COST) {
        showBanner('😮‍💨', `Sem stamina para Defender (precisa de ${DEFEND_STAMINA_COST}⚡)`)
        return
      }
      setStamina(prev => Math.max(0, prev - DEFEND_STAMINA_COST))
      persistStamina(DEFEND_STAMINA_COST)
    }
    setDefenseChoice(choice)
    setPanelResult(null)
    setHasRolled(false)
    setStage('defenseRoll')
  }

  const handleDefenseRoll = () => {
    const m = monsterRef.current
    if (!m || hasRolled || !monsterPlan || !defenseChoice) return
    setHasRolled(true)
    // DISPUTA DE DADOS: o golpe do monstro define o dado (básico d8 / arma d12 / especial d20).
    const sides = PVE_DIE[monsterPlan]
    const def = mkResult(sides, 0)
    setPanelResult(def)

    const atk = mkResult(sides, 0)
    later(() => setDiceResults(prev => ({ ...prev, [MONSTER_ID]: atk })), 1700)
    later(() => resolveMonsterAttack(atk, def), 3000)
  }

  const resolveMonsterAttack = (atk: DiceResult, def: DiceResult) => {
    const m = monsterRef.current
    if (!m || !monsterPlan || !defenseChoice) return
    setStage('busy')
    setPanelResult(null)
    setHasRolled(false)

    const mLev = monsterLevers(m)
    const outcome = computeOutcome(
      atk.roll, def.roll, PVE_DIE[monsterPlan], defenseChoice,
      monsterPowerFor(m, monsterPlan),
      { armor: playerLevers.armor, K: playerLevers.K, evade: playerLevers.evade },
      mLev.scale, playerLevers.scale,
    )
    pushBattleEvent({
      kind: 'resolve',
      attackerId: MONSTER_ID,
      defenderId: character.id,
      action: monsterPlan,
      defenseAction: defenseChoice,
      hit: outcome.hit,
      damage: outcome.damage,
      isCritical: outcome.crit,
    })

    const myDefense = defenseChoice
    setMonsterPlan(null)
    setDefenseChoice(null)
    later(() => setDiceResults({}), 1500)

    // Log estilo RiPG (monstro ataca, você defende).
    const defTag = myDefense === 'dodge' ? '(esquiva)' : '(defesa)'
    pushLog(
      `${diceLine(m.emoji, outcome.sides, outcome.atkRoll, outcome.atkBonus, '(fúria)')}  vs  ` +
      `${diceLine('🛡️', outcome.sides, outcome.defRoll, outcome.defBonus, defTag)}`
    )
    if (!outcome.hit) pushLog(`💨 Você esquiva o golpe por completo! (0 de dano)`)
    else if (outcome.crit) pushLog(`💥 ${m.name} acerta em cheio! ${outcome.damage} de dano em você`)
    else pushLog(`🩸 ${m.name} causou ${outcome.damage} de dano em você`)

    const newHp = Math.max(0, hpRef.current - outcome.damage)
    later(() => setHp(newHp), 500)
    if (newHp <= 0) {
      later(() => {
        setCombatEnded(true)
        setWinnerId(MONSTER_ID)
        later(() => handleDefeat(), 2200)
      }, 1400)
      return
    }
    later(() => {
      setCurrentTurnId(character.id)
      setStage('playerSelect')
    }, 2000)
  }

  // ---------- Fim de combate ----------
  // VITÓRIA: o SERVIDOR credita gold do abate + espólio + XP (e avança o cursor).
  // O cliente só reporta o desfecho e EXIBE o que o servidor devolveu.
  const handleCombatVictory = async (m: ScaledMonster) => {
    setCombatEnded(true)
    setWinnerId(character.id)

    let grant: CombatGrant | null = null
    let leveledUp = false
    try {
      const res = await fetch('/api/dungeon/run/combat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId: runIdRef.current, outcome: 'win' }),
      })
      const data: CombatResponse = await res.json()
      if (res.ok) {
        grant = data.granted ?? null
        leveledUp = !!data.leveledUp
        if (leveledUp) setLevelUpMsg('🎉 Você subiu de nível!')
      }
    } catch {
      /* sem conexão: exibe os valores do monstro como fallback visual */
    }

    const killGold = grant?.killGold ?? m.goldReward
    const xp = grant?.xp ?? m.xpReward
    const loot: NodeLoot = grant?.loot ?? { gold: 0, drops: [] }

    setTotals(prev => ({ ...prev, gold: prev.gold + killGold, xp: prev.xp + xp, kills: prev.kills + 1 }))
    pushLog(`🏆 Você derrotou ${m.emoji} ${m.name}! +${killGold} 💰 +${xp} XP`)
    showLoot(loot)

    later(() => {
      setMonster(null)
      setCombatEnded(false)
      if (m.isBoss) {
        finishRun(true)
      } else {
        setPhase('explore')
        setNarration(nextIsBoss
          ? 'A trilha termina adiante. Você sente um olhar antigo cravado em você...'
          : TRANSITIONS[tokenIdx % TRANSITIONS.length])

        const totalGold = killGold + loot.gold
        const hasGear = loot.drops.some(d => d.kind === 'item' || d.kind === 'stone')

        const effects: string[] = []
        if (xp > 0) effects.push(`+${xp} ⭐ XP`)
        if (totalGold > 0) effects.push(`+${totalGold} 💰`)
        for (const d of loot.drops) effects.push(`${d.emoji} ${d.enhancement ? `${d.name} +${d.enhancement}` : d.name}`)

        const def: DungeonEventDef = {
          kind: hasGear ? 'item' : 'gold',
          min: 0,
          max: 0,
          icon: hasGear ? '🌟' : '🏆',
          title: 'Espólio da Vitória',
          description: hasGear
            ? `${m.emoji} ${m.name} foi derrotado e deixou cair seus pertences.`
            : `${m.emoji} ${m.name} foi derrotado.`,
        }
        setLootCard({ def, text: def.description, effects })
      }
    }, 2800)
  }

  // DERROTA: avisa o servidor (encerra a run). XP dos abates já foi creditado por kill.
  const handleDefeat = () => {
    setPhase('defeat')
    if (runIdRef.current) {
      fetch('/api/dungeon/run/combat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId: runIdRef.current, outcome: 'lose' }),
      }).catch(() => {})
    }
  }

  const finishRun = async (bossDefeated: boolean) => {
    setPhase('summary')
    // Sair no meio (sem boss): encerra a sessão no servidor.
    if (!bossDefeated && runIdRef.current) {
      fetch('/api/dungeon/run/abandon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId: runIdRef.current }),
      }).catch(() => {})
    }
    if (bossDefeated) {
      pushLog(`👑 ${dungeon.name} conquistada!`)
    }
  }

  const exitRun = () => {
    // Garante o encerramento da sessão no servidor ao sair.
    if (runIdRef.current) {
      fetch('/api/dungeon/run/abandon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId: runIdRef.current }),
      }).catch(() => {})
    }
    // HP e MP voltam ao cheio entre runs — só a stamina (orçamento diário) é consumida.
    onExit({ hp: effMaxHp, mp: character.maxMp, stamina })
  }

  // ---------- Painel de dados da arena ----------
  const dicePanel = useMemo(() => {
    if (phase !== 'combat') return null
    if (stage === 'initiative') {
      return {
        visible: true,
        diceType: 20,
        hasRolled,
        label: '⚡ Iniciativa! Role o d20',
        onRoll: handleInitiativeRoll,
        myResult: panelResult,
        waitingForOpponent: false,
      }
    }
    if (stage === 'playerRoll' && pendingAttack) {
      const atk = ATTACKS[pendingAttack]
      const sides = PVE_DIE[pendingAttack]
      const label = pendingAttack === 'special' ? `${atk.icon} ${specialName}` : `${atk.icon} ${atk.label}`
      return {
        visible: true,
        diceType: sides,
        hasRolled,
        label: `${label} — role o d${sides}!`,
        onRoll: handlePlayerAttackRoll,
        myResult: panelResult,
        waitingForOpponent: false,
      }
    }
    if (stage === 'defenseRoll' && monsterPlan) {
      const sides = PVE_DIE[monsterPlan]
      return {
        visible: true,
        diceType: sides,
        hasRolled,
        label: `🛡️ Defenda-se! Role o d${sides}`,
        onRoll: handleDefenseRoll,
        myResult: panelResult,
        waitingForOpponent: false,
      }
    }
    return null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, stage, hasRolled, panelResult, pendingAttack, monsterPlan, stamina, mp])

  // ============================================================
  // RENDER
  // ============================================================

  const ResourceBar = ({ icon, value, max, gradient }: { icon: string; value: number; max: number; gradient: string }) => (
    <div className="flex items-center gap-1.5">
      <span className="text-xs">{icon}</span>
      <div className="w-24 sm:w-32 h-2.5 bg-black/60 rounded-full overflow-hidden border border-white/10">
        <motion.div
          className={`h-full rounded-full bg-gradient-to-r ${gradient}`}
          initial={false}
          animate={{ width: `${Math.max(0, Math.min(100, max > 0 ? (value / max) * 100 : 0))}%` }}
          transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        />
      </div>
      <span className="text-[10px] text-white/80 font-mono w-14">{value}/{max}</span>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black">
      {/* Cenário temático */}
      <div className="absolute inset-0">
        <DungeonBackdrop theme={dungeon.id} />
      </div>

      <motion.div
        className="relative h-full flex flex-col"
        style={{ ['--dgn' as string]: dungeon.accent, ['--dgn-soft' as string]: dungeon.accentSoft }}
        animate={trapShake ? { x: [0, -10, 10, -8, 8, 0] } : { x: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* ---------- Header ---------- */}
        <div className="flex-shrink-0 flex items-center justify-between px-3 sm:px-5 py-2.5 bg-black/50 backdrop-blur-sm border-b border-white/10">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xl sm:text-2xl">{dungeon.emoji}</span>
            <div className="min-w-0">
              <h2 className="text-white font-black text-sm sm:text-base truncate">{dungeon.name}</h2>
              <div className="flex items-center gap-1">
                {Array.from({ length: dungeon.rooms }).map((_, i) => {
                  const done = i + 1 <= mainsDone
                  const current = i + 1 === curTier && !isBossRoom
                  return (
                    <div
                      key={i}
                      className={`w-2 h-2 rounded-full ${done ? 'bg-green-400' : current ? 'animate-pulse' : 'bg-white/20'}`}
                      style={current ? { backgroundColor: dungeon.accent } : undefined}
                    />
                  )
                })}
                <span className={`text-[11px] ml-0.5 ${isBossRoom ? 'animate-pulse' : 'opacity-40'}`}>👑</span>
                <span className="text-[10px] text-white/60 ml-1.5">
                  {isBossRoom ? 'Covil do Boss' : tokenIdx === 0 ? 'Entrada' : `Sala ${curTier}/${dungeon.rooms}`}
                </span>
              </div>
            </div>
          </div>

          {/* Stats do topo: só na trilha. Em combate a arena já mostra o HP dos lutadores. */}
          {phase !== 'combat' && (
            <div className="hidden sm:flex flex-col gap-0.5">
              <ResourceBar icon="❤️" value={hp} max={effMaxHp} gradient="from-red-600 to-rose-400" />
              <ResourceBar icon="🔮" value={mp} max={character.maxMp} gradient="from-blue-600 to-cyan-400" />
              <ResourceBar icon="⚡" value={stamina} max={character.maxStamina} gradient="from-yellow-600 to-amber-300" />
            </div>
          )}

          <div className="flex items-center gap-2.5">
            <div className="text-right text-[10px] text-white/80 leading-tight">
              <div>💰 {totals.gold}</div>
              <div>⭐ {totals.xp} XP</div>
            </div>
            {(phase === 'explore' || phase === 'combat') && (
              <button
                onClick={() => finishRun(false)}
                className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-bold transition-colors"
                title={phase === 'combat' ? 'Abandonar a batalha e sair (mantém recompensas)' : 'Sair da masmorra (mantém recompensas)'}
              >
                🚪 {phase === 'combat' ? 'Fugir' : 'Sair'}
              </button>
            )}
          </div>
        </div>

        {/* Barras de recurso no mobile — só na trilha; em combate a arena mostra o HP. */}
        {phase !== 'combat' && (
          <div className="sm:hidden flex-shrink-0 flex items-center justify-center gap-3 px-3 py-1.5 bg-black/40 border-b border-white/10">
            <ResourceBar icon="❤️" value={hp} max={character.maxHp} gradient="from-red-600 to-rose-400" />
            <ResourceBar icon="⚡" value={stamina} max={character.maxStamina} gradient="from-yellow-600 to-amber-300" />
          </div>
        )}

        {/* ---------- Banner central ---------- */}
        <div className="absolute top-20 inset-x-0 flex justify-center z-40 pointer-events-none px-4">
          <AnimatePresence>
            {banner && (
              <motion.div
                key={banner.key}
                initial={{ y: -25, opacity: 0, scale: 0.85 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: -15, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                className="bg-black/80 backdrop-blur-md border rounded-2xl px-5 py-2.5 shadow-2xl"
                style={{ borderColor: dungeon.accentSoft, boxShadow: `0 0 30px ${dungeon.accentSoft}` }}
              >
                <span className="text-lg mr-2">{banner.icon}</span>
                <span className="text-white font-bold text-sm sm:text-base">{banner.text}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ---------- Painel de consumíveis (mapa e combate) ---------- */}
        {showItems && (
          <div className="absolute inset-0 z-50 grid place-items-center px-5" onClick={() => setShowItems(false)}>
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
            <div
              className="relative w-full max-w-sm rounded-2xl p-5 border border-white/15 bg-[#12122a]/95 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-black text-white text-lg">🧪 Consumíveis</h3>
                <div className="flex gap-3 text-xs font-combat">
                  <span className="text-emerald-400">❤️ {Math.round(hp)}/{effMaxHp}</span>
                  <span className="text-blue-400">🔮 {mp}/{character.maxMp}</span>
                </div>
              </div>
              {consumables.length === 0 ? (
                <p className="text-textsec text-sm text-center py-6">Nenhum consumível restaurador no inventário.</p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {consumables.map(c => {
                    const hpFull = hp >= effMaxHp
                    const mpFull = mp >= character.maxMp
                    const disabled =
                      (c.hp > 0 && c.mp === 0 && hpFull) ||
                      (c.mp > 0 && c.hp === 0 && mpFull) ||
                      (c.hp > 0 && c.mp > 0 && hpFull && mpFull)
                    return (
                      <div key={c.id} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xl">{c.icon}</span>
                          <div className="min-w-0">
                            <div className="text-white text-sm font-bold truncate">
                              {c.name} <span className="text-textsec font-normal">×{c.qty}</span>
                            </div>
                            <div className="text-textsec text-[11px]">
                              {c.hp > 0 ? `+${c.hp} ❤️` : ''}{c.hp > 0 && c.mp > 0 ? ' • ' : ''}{c.mp > 0 ? `+${c.mp} 🔮` : ''}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => useConsumable(c)}
                          disabled={disabled}
                          className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-black text-white disabled:opacity-40 transition-transform active:scale-95"
                          style={{ background: 'linear-gradient(90deg,#2ecc71,#16a34a)' }}
                        >
                          Usar
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
              {phase === 'combat' && (
                <p className="text-textsec/70 text-[10px] text-center mt-2">No combate, usar um item consome seu turno.</p>
              )}
              <button
                onClick={() => setShowItems(false)}
                className="mt-3 w-full py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-bold transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* FASE: EXPLORAÇÃO */}
        {/* ============================================================ */}
        {phase === 'explore' && (
          <div className="flex-1 flex flex-col min-h-0">
            {/* ---------- MAPA: trilha de nós ---------- */}
            <main className="relative flex-1 min-h-0">
              <MapAmbient />

              <div className="absolute inset-0 mx-auto max-w-md">
                <MapTrail points={trailPoints} progress={tokenIdx / LAST} />
                {trailPoints.map((pt, idx) => (
                  <MapNode
                    key={idx}
                    pt={pt}
                    state={nodeState(idx)}
                    revealed={nodeEvents[idx]}
                    accent={dungeon.accent}
                    bossName={dungeon.boss.name}
                  />
                ))}
                <PlayerToken point={trailPoints[tokenIdx]} moving={moving} avatar={character.avatar} />

                {/* números flutuantes (ganhos/perdas) */}
                <div className="absolute left-1/2 top-3 -translate-x-1/2 flex flex-col items-center gap-1 pointer-events-none z-20">
                  {floats.map(f => (
                    <span
                      key={f.id}
                      className="float-num font-combat font-black text-lg"
                      style={{ color: f.color, textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}
                    >
                      {f.label}
                    </span>
                  ))}
                </div>
              </div>

              {/* selo de progresso */}
              <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 text-[10px] uppercase tracking-[0.2em] text-textsec/70 font-bold pointer-events-none">
                {atBoss
                  ? 'Covil do Chefe'
                  : tokenIdx === 0
                    ? `Entrada • ${dungeon.rooms} salas`
                    : atMainNode
                      ? `⚔️ Sala ${curTier} de ${dungeon.rooms}`
                      : `A caminho da sala ${curTier} de ${dungeon.rooms}`}
              </div>

              {/* overlay: dado rolando */}
              <DiceOverlay rolling={exploreRolling} result={exploreResult} />

              {/* overlays: evento / boss / loot */}
              <AnimatePresence>
                {lootCard && (
                  <motion.div
                    key="loot-overlay"
                    className="absolute inset-0 z-30 grid place-items-center px-5"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" />
                    <motion.div
                      initial={{ scale: 0.4, y: 40, opacity: 0 }}
                      animate={{ scale: 1, y: 0, opacity: 1 }}
                      exit={{ scale: 0.6, opacity: 0, y: 20 }}
                      transition={{ type: 'spring', stiffness: 260, damping: 16 }}
                      className="relative w-full max-w-sm rounded-2xl p-6 text-center"
                      style={{
                        background: 'linear-gradient(180deg, rgba(30,30,63,0.92), rgba(15,15,35,0.96))',
                        border: `1px solid ${dungeon.accentSoft}`,
                        boxShadow: `0 24px 60px -12px ${dungeon.accentSoft}, 0 0 40px ${dungeon.accentSoft}`,
                        backdropFilter: 'blur(20px)',
                      }}
                    >
                      <motion.div
                        initial={{ scale: 0, rotate: -20 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: 'spring', stiffness: 240, damping: 12, delay: 0.08 }}
                        className="text-6xl mb-2 mt-1 inline-block"
                        style={{ filter: `drop-shadow(0 0 18px ${dungeon.accentSoft})` }}
                      >
                        {lootCard.def.icon}
                      </motion.div>

                      <h3 className="text-2xl font-black mb-1.5" style={{ color: dungeon.accent }}>{lootCard.def.title}</h3>
                      {lootCard.text && <p className="text-sm text-textsec leading-snug mb-4">{lootCard.text}</p>}

                      {lootCard.effects.length > 0 && (
                        <div className="flex flex-wrap justify-center gap-2 mb-5">
                          {lootCard.effects.map((fx, i) => (
                            <motion.span
                              key={fx}
                              initial={{ opacity: 0, y: 10, scale: 0.8 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              transition={{ delay: 0.2 + i * 0.12, type: 'spring', stiffness: 300, damping: 18 }}
                              className="inline-flex items-center gap-1 px-3 py-1 rounded-full border text-sm font-bold font-combat bg-white/10 border-white/20 text-white"
                            >
                              {fx}
                            </motion.span>
                          ))}
                        </div>
                      )}

                      <button
                        onClick={() => setLootCard(null)}
                        className="w-full py-3.5 rounded-lg font-bold text-white text-base transition-transform active:scale-[0.98] hover:scale-[1.02]"
                        style={{ background: `linear-gradient(90deg, ${dungeon.accent}, ${dungeon.accent}aa)`, boxShadow: `0 0 22px ${dungeon.accentSoft}` }}
                      >
                        Continuar a jornada →
                      </button>
                    </motion.div>
                  </motion.div>
                )}

                {eventCard && !lootCard && (
                  <motion.div
                    key="event-overlay"
                    className="absolute inset-0 z-30 grid place-items-center px-5"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" />
                    <motion.div
                      initial={{ scale: 0.4, y: 40, opacity: 0 }}
                      animate={{ scale: 1, y: 0, opacity: 1 }}
                      exit={{ scale: 0.6, opacity: 0, y: 20 }}
                      transition={{ type: 'spring', stiffness: 260, damping: 16 }}
                      className="relative w-full max-w-sm rounded-2xl p-6 text-center"
                      style={{
                        background: 'linear-gradient(180deg, rgba(30,30,63,0.92), rgba(15,15,35,0.96))',
                        border: `1px solid ${eventCard.def.kind === 'trap' ? 'rgba(248,113,113,0.4)'
                          : eventCard.def.kind === 'monster' ? 'rgba(231,76,60,0.4)'
                          : eventCard.def.kind === 'blessing' ? 'rgba(253,230,138,0.4)'
                          : dungeon.accentSoft}`,
                        boxShadow: `0 24px 60px -12px ${dungeon.accentSoft}, 0 0 40px ${dungeon.accentSoft}`,
                        backdropFilter: 'blur(20px)',
                      }}
                    >
                      {exploreResult && (
                        <div
                          className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-background border text-xs font-combat font-bold"
                          style={{ borderColor: dungeon.accentSoft, color: dungeon.accent }}
                        >
                          🎲 d20 → {exploreResult.roll}
                        </div>
                      )}

                      <motion.div
                        initial={{ scale: 0, rotate: -20 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: 'spring', stiffness: 240, damping: 12, delay: 0.08 }}
                        className="text-6xl mb-2 mt-1 inline-block"
                        style={{ filter: `drop-shadow(0 0 18px ${dungeon.accentSoft})` }}
                      >
                        {eventCard.monster ? eventCard.monster.emoji : eventCard.def.icon}
                      </motion.div>

                      <h3 className="text-2xl font-black mb-1.5" style={{ color: dungeon.accent }}>{eventCard.def.title}</h3>
                      {eventCard.text && <p className="text-sm text-textsec leading-snug mb-4">{eventCard.text}</p>}

                      {eventCard.effects.length > 0 && (
                        <div className="flex flex-wrap justify-center gap-2 mb-5">
                          {eventCard.effects.map((fx, i) => (
                            <motion.span
                              key={fx}
                              initial={{ opacity: 0, y: 10, scale: 0.8 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              transition={{ delay: 0.2 + i * 0.12, type: 'spring', stiffness: 300, damping: 18 }}
                              className="inline-flex items-center gap-1 px-3 py-1 rounded-full border text-sm font-bold font-combat bg-white/10 border-white/20 text-white"
                            >
                              {fx}
                            </motion.span>
                          ))}
                        </div>
                      )}

                      {eventCard.monster ? (
                        <button
                          onClick={() => startCombat(eventCard.monster!)}
                          className="w-full py-3.5 rounded-lg font-black text-white text-lg transition-transform active:scale-[0.98] hover:scale-[1.02] inline-flex items-center justify-center gap-2"
                          style={{ background: 'linear-gradient(90deg, #e74c3c, #b91c1c)', boxShadow: '0 0 24px rgba(231,76,60,0.45)' }}
                        >
                          ⚔️ Lutar!
                        </button>
                      ) : (
                        <button
                          onClick={dismissEvent}
                          className="w-full py-3.5 rounded-lg font-bold text-white text-base transition-transform active:scale-[0.98] hover:scale-[1.02]"
                          style={{ background: `linear-gradient(90deg, ${dungeon.accent}, ${dungeon.accent}aa)`, boxShadow: `0 0 22px ${dungeon.accentSoft}` }}
                        >
                          Continuar a jornada →
                        </button>
                      )}
                    </motion.div>
                  </motion.div>
                )}

                {atBoss && !eventCard && (
                  <motion.div
                    key="boss-overlay"
                    className="absolute inset-0 z-30 grid place-items-center px-5"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <div className="absolute inset-0 bg-black/65 backdrop-blur-[3px]" />
                    <motion.div
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                      className="relative w-full max-w-sm rounded-2xl p-7 text-center overflow-hidden"
                      style={{
                        background: 'linear-gradient(180deg, rgba(60,8,40,0.92), rgba(15,8,20,0.97))',
                        border: '1px solid rgba(231,76,60,0.5)',
                        boxShadow: '0 30px 70px -10px rgba(231,76,60,0.5), 0 0 60px rgba(231,76,60,0.35)',
                      }}
                    >
                      <motion.div
                        className="absolute inset-0 pointer-events-none"
                        animate={{ opacity: [0.3, 0.6, 0.3] }}
                        transition={{ duration: 2.5, repeat: Infinity }}
                        style={{ background: 'radial-gradient(circle at 50% 35%, rgba(231,76,60,0.25), transparent 60%)' }}
                      />
                      <div className="relative">
                        <span className="text-[11px] font-black uppercase tracking-[0.3em] text-error">⚠ O Chefe Desperta</span>
                        <motion.div
                          animate={{ scale: [1, 1.06, 1], rotate: [0, -2, 2, 0] }}
                          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                          className="text-7xl my-3 inline-block"
                          style={{ filter: 'drop-shadow(0 0 26px rgba(231,76,60,0.7))' }}
                        >
                          {dungeon.boss.emoji}
                        </motion.div>
                        <h2 className="text-3xl font-black text-white leading-none">{dungeon.boss.name}</h2>
                        <p className="text-sm text-error/90 font-bold uppercase tracking-wider mt-1 mb-5">{dungeon.boss.title}</p>
                        <button
                          onClick={() => startCombat(serverMonsterRef.current ?? scaleMonster(dungeon.boss, dungeon, character.level, { tier: dungeon.rooms, isMain: true, isBoss: true }, combatClass))}
                          className="w-full py-4 rounded-lg font-black text-white text-lg inline-flex items-center justify-center gap-2 transition-transform active:scale-[0.98] hover:scale-[1.02]"
                          style={{ background: 'linear-gradient(90deg, #e94560, #b91c1c)', boxShadow: '0 0 28px rgba(233,69,96,0.5)' }}
                        >
                          👑 Enfrentar o Chefe
                        </button>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </main>

            {/* ---------- NARRAÇÃO DO MESTRE ---------- */}
            <MasterNarration text={narration} />

            {/* ---------- AÇÃO ---------- */}
            <footer
              className="flex-shrink-0 px-4 pt-1 pb-4 z-20"
              style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
            >
              <div className="mx-auto max-w-md flex items-center gap-2.5">
                <button
                  onClick={() => finishRun(false)}
                  disabled={exploreRolling || moving}
                  title="Sair da masmorra (mantém recompensas)"
                  className="shrink-0 w-12 h-[52px] grid place-items-center rounded-xl border border-white/10 bg-black/50 backdrop-blur-xl text-textsec hover:text-white hover:border-white/25 transition-colors active:scale-95 disabled:opacity-40"
                >
                  🚪
                </button>
                <button
                  onClick={() => { loadConsumables(); setShowItems(true) }}
                  disabled={exploreRolling || moving}
                  title="Usar consumível (HP/MP)"
                  className="shrink-0 w-12 h-[52px] grid place-items-center rounded-xl border border-white/10 bg-black/50 backdrop-blur-xl text-textsec hover:text-white hover:border-white/25 transition-colors active:scale-95 disabled:opacity-40 relative"
                >
                  🧪
                  {consumables.length > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-emerald-500 text-[9px] font-black grid place-items-center text-white">
                      {consumables.reduce((n, c) => n + c.qty, 0)}
                    </span>
                  )}
                </button>
                <button
                  onClick={
                    atBoss
                      ? () => startCombat(serverMonsterRef.current ?? scaleMonster(dungeon.boss, dungeon, character.level, { tier: dungeon.rooms, isMain: true, isBoss: true }, combatClass))
                      : advance
                  }
                  disabled={exploreRolling || moving || !!eventCard}
                  className="flex-1 h-[52px] rounded-xl font-black text-lg text-white inline-flex items-center justify-center gap-2.5 transition-all active:scale-[0.98] hover:scale-[1.01] disabled:opacity-50 disabled:cursor-wait disabled:hover:scale-100"
                  style={{
                    background: atBoss
                      ? 'linear-gradient(90deg, #e94560, #b91c1c)'
                      : nextMainNode
                        ? 'linear-gradient(90deg, #f39c12, #b45309)'
                        : `linear-gradient(90deg, ${dungeon.accent}, ${dungeon.accent}aa)`,
                    boxShadow: atBoss ? '0 0 26px rgba(233,69,96,0.5)' : nextMainNode ? '0 0 26px rgba(243,156,18,0.45)' : `0 0 26px ${dungeon.accentSoft}`,
                  }}
                >
                  {exploreRolling || moving
                    ? '...'
                    : atBoss
                      ? '⚔️ Enfrentar o Chefe'
                      : nextIsBoss
                        ? '👑 Aproximar-se do covil'
                        : nextMainNode
                          ? `⚔️ Entrar na sala ${trailPoints[tokenIdx + 1]?.tier}`
                          : '🎲 Seguir a trilha'}
                </button>
              </div>
            </footer>
          </div>
        )}

        {/* ============================================================ */}
        {/* FASE: COMBATE */}
        {/* ============================================================ */}
        {phase === 'combat' && monster && (
          <div className="flex-1 flex flex-col min-h-0">
            <BattleScene
              className="flex-1 min-h-[280px]"
              left={playerFighter}
              right={monsterFighter}
              currentTurnId={currentTurnId}
              winnerId={winnerId}
              combatEnded={combatEnded}
              event={battleEvent}
              diceResults={diceResults}
              dicePanel={dicePanel}
              backdrop={<DungeonBackdrop theme={dungeon.id} />}
            />

            {/* Log de combate (estilo RiPG): mostra a conta dos dados e o dano resultante */}
            <div className="flex-shrink-0 bg-black/60 border-t border-white/5 px-3 sm:px-6 py-1.5">
              <div className="mx-auto max-w-2xl h-[46px] overflow-y-auto flex flex-col justify-end gap-0.5 font-mono text-[10px] leading-tight text-white/65">
                {log.slice(-4).map((line, i) => (
                  <div key={`${log.length}-${i}`} className="break-words last:text-white/90">{line}</div>
                ))}
              </div>
            </div>

            {/* Barra de ações do combate */}
            <div className="flex-shrink-0 bg-black/70 backdrop-blur-md border-t border-white/10 px-3 sm:px-6 py-3 min-h-[88px] flex items-center justify-center">
              {combatEnded ? (
                <div className="text-white/70 text-sm font-bold animate-pulse">
                  {winnerId === character.id ? '🏆 Vitória! Coletando recompensas...' : '💀 Derrotado...'}
                </div>
              ) : stage === 'playerSelect' ? (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {(Object.keys(ATTACKS) as AttackKind[])
                    // Sem arma equipada não há "Ataque da Arma" (luta-se no soco); o Especial
                    // continua, pois vem da transformação (golpe da fera).
                    .filter(kind => kind !== 'weapon' || hasWeapon)
                    .map(kind => {
                    const atk = ATTACKS[kind]
                    // Especial só liberado transformado (igual ao PvP) e exige MP.
                    const locked = (atk.requiresTransform && !transform) || mp < atk.mp
                    const noMp = mp < atk.mp
                    const name = kind === 'special' ? specialName : atk.label
                    return (
                      <button
                        key={kind}
                        onClick={() => choosePlayerAttack(kind)}
                        disabled={locked}
                        className={`px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-white transition-all shadow-lg ${
                          locked
                            ? 'bg-gray-700/60 opacity-50 cursor-not-allowed'
                            : kind === 'basic' ? 'bg-gradient-to-r from-yellow-600 to-amber-500 hover:scale-105'
                            : kind === 'weapon' ? 'bg-gradient-to-r from-red-700 to-red-500 hover:scale-105'
                            : 'bg-gradient-to-r from-purple-700 to-fuchsia-600 hover:scale-105'
                        }`}
                      >
                        {locked && atk.requiresTransform && !transform ? '🔒' : atk.icon} {name}
                        <span className="block text-[9px] opacity-80 font-normal">
                          d{PVE_DIE[kind]}{atk.mp > 0 ? ` • ${atk.mp}🔵${noMp ? ' (sem MP)' : ''}` : ''}{atk.requiresTransform && !transform ? ' • transforme-se' : ''}
                        </span>
                      </button>
                    )
                  })}

                  {/* Transformação (apenas raças com formas) — custa só MP */}
                  {transformForms.length > 0 && (
                    <div className="relative">
                      {transform ? (
                        <div className="px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-white bg-gradient-to-r from-fuchsia-700 to-purple-600 shadow-lg shadow-purple-900/50">
                          {activeTransformCfg?.name}
                          <span className="block text-[9px] opacity-90 font-normal">restam {transform.turns} turno(s)</span>
                        </div>
                      ) : (() => {
                        const single = transformForms.length === 1 ? TRANSFORMATION_CONFIG[transformForms[0]] : null
                        const disabled = transformCd > 0 || (!!single && mp < single.cost.mp)
                        return (
                          <>
                            <button
                              onClick={() => {
                                if (transformCd > 0) return
                                if (single) activateTransform(transformForms[0])
                                else setShowFormPicker(v => !v)
                              }}
                              disabled={disabled}
                              className={`px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-white transition-all shadow-lg ${
                                disabled
                                  ? 'bg-gray-700/60 opacity-50 cursor-not-allowed'
                                  : 'bg-gradient-to-r from-fuchsia-700 to-purple-600 hover:scale-105'
                              }`}
                            >
                              {transformCd > 0 ? `🌀 Recarga (${transformCd})` : '🌀 Transformar'}
                              <span className="block text-[9px] opacity-80 font-normal">
                                {single ? `${single.cost.mp}🔮` : `${transformForms.length} formas`}
                              </span>
                            </button>

                            {showFormPicker && !single && (
                              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-50 w-60 bg-black/90 backdrop-blur-md border border-white/15 rounded-xl p-2 shadow-2xl space-y-1">
                                {transformForms.map(t => {
                                  const cfg = TRANSFORMATION_CONFIG[t]
                                  const dis = mp < cfg.cost.mp
                                  return (
                                    <button
                                      key={t}
                                      onClick={() => activateTransform(t)}
                                      disabled={dis}
                                      className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                                        dis ? 'opacity-40 cursor-not-allowed bg-white/5' : 'bg-white/10 hover:bg-white/20'
                                      }`}
                                    >
                                      <span className="font-bold text-white text-xs">{cfg.name}</span>
                                      <span className="block text-[9px] text-white/60">{cfg.cost.mp}🔮 • {cfg.duration} turnos</span>
                                    </button>
                                  )
                                })}
                              </div>
                            )}
                          </>
                        )
                      })()}
                    </div>
                  )}

                  {/* Usar consumível (consome o turno) */}
                  <button
                    onClick={() => { loadConsumables(); setShowItems(true) }}
                    className="px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-white transition-all shadow-lg bg-gradient-to-r from-emerald-700 to-green-600 hover:scale-105"
                  >
                    🧪 Item
                    <span className="block text-[9px] opacity-80 font-normal">HP/MP • gasta o turno</span>
                  </button>
                </div>
              ) : stage === 'playerDefense' ? (
                <div className="flex items-center justify-center gap-2">
                  <span className="text-amber-300 text-xs font-bold mr-1 hidden sm:inline">🛡️ Reaja ao ataque:</span>
                  <button
                    onClick={() => choosePlayerDefense('dodge')}
                    className="px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-white transition-all shadow-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:scale-105"
                  >
                    🌪️ Esquivar
                    <span className="block text-[9px] opacity-80 font-normal">grátis • zera no lance extremo</span>
                  </button>
                  <button
                    onClick={() => choosePlayerDefense('defend')}
                    disabled={stamina < DEFEND_STAMINA_COST}
                    className="px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-white transition-all shadow-lg bg-gradient-to-r from-emerald-600 to-green-600 hover:scale-105 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                  >
                    🛡️ Defender
                    <span className="block text-[9px] opacity-80 font-normal">{DEFEND_STAMINA_COST}⚡ • reduz sempre</span>
                  </button>
                </div>
              ) : stage === 'initiative' || stage === 'playerRoll' || stage === 'defenseRoll' ? (
                <div className="text-white/60 text-xs sm:text-sm font-bold">
                  🎲 {hasRolled ? 'Rolando...' : 'Clique no dado na arena para rolar!'}
                </div>
              ) : (
                <div className="text-white/50 text-xs sm:text-sm font-bold animate-pulse">⚔️ Resolvendo ação...</div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* FASE: RESUMO (vitória / saída) */}
        {/* ============================================================ */}
        {phase === 'summary' && (
          <div className="flex-1 flex items-center justify-center px-4">
            <motion.div
              initial={{ scale: 0.8, y: 30, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 16 }}
              className="text-center bg-black/80 backdrop-blur-md border-2 rounded-3xl px-8 sm:px-12 py-8 max-w-md shadow-2xl"
              style={{ borderColor: dungeon.accent, boxShadow: `0 0 60px ${dungeon.accentSoft}` }}
            >
              <motion.div
                className="text-6xl mb-3"
                animate={{ rotate: [0, -8, 8, 0], scale: [1, 1.1, 1] }}
                transition={{ repeat: Infinity, duration: 2.4 }}
              >
                🏆
              </motion.div>
              <h3 className="text-white font-black text-2xl mb-1">{dungeon.name}</h3>
              <p className="text-white/60 text-xs mb-5">Expedição concluída!</p>

              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="bg-white/5 border border-white/15 rounded-xl py-2.5">
                  <div className="text-amber-300 font-black text-lg">{totals.gold}</div>
                  <div className="text-white/50 text-[10px]">💰 Ouro</div>
                </div>
                <div className="bg-white/5 border border-white/15 rounded-xl py-2.5">
                  <div className="text-purple-300 font-black text-lg">{totals.xp}</div>
                  <div className="text-white/50 text-[10px]">⭐ XP</div>
                </div>
                <div className="bg-white/5 border border-white/15 rounded-xl py-2.5">
                  <div className="text-red-300 font-black text-lg">{totals.kills}</div>
                  <div className="text-white/50 text-[10px]">⚔️ Vitórias</div>
                </div>
              </div>

              {totals.items.length > 0 && (
                <div className="flex flex-wrap justify-center gap-1.5 mb-4">
                  {totals.items.map((item, i) => (
                    <span key={`${item}-${i}`} className="px-2.5 py-1 rounded-full bg-white/10 border border-white/20 text-white text-[10px] font-bold">
                      📦 {item}
                    </span>
                  ))}
                </div>
              )}

              {levelUpMsg && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="text-yellow-300 font-bold text-sm mb-4"
                >
                  🎉 {levelUpMsg}
                </motion.div>
              )}

              <button
                onClick={exitRun}
                className="px-8 py-3 rounded-xl font-black text-white text-sm bg-gradient-to-r from-emerald-700 to-teal-600 hover:from-emerald-600 hover:to-teal-500 shadow-lg transition-all hover:scale-105"
              >
                🏠 Voltar ao mapa
              </button>
            </motion.div>
          </div>
        )}

        {/* ============================================================ */}
        {/* FASE: DERROTA */}
        {/* ============================================================ */}
        {phase === 'defeat' && (
          <div className="flex-1 flex items-center justify-center px-4">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 16 }}
              className="text-center bg-black/85 backdrop-blur-md border-2 border-red-900 rounded-3xl px-8 sm:px-12 py-8 max-w-md shadow-2xl shadow-red-950/60"
            >
              <div className="text-6xl mb-3">💀</div>
              <h3 className="text-red-400 font-black text-2xl mb-2">Você caiu...</h3>
              <p className="text-white/60 text-xs mb-4">
                Sem perdas: tudo que você ganhou foi guardado. Volte mais forte — a stamina reseta amanhã.
              </p>
              <div className="text-white/70 text-xs mb-5">
                💰 {totals.gold} ouro • ⭐ {totals.xp} XP • 📦 {totals.items.length} itens — tudo salvo
              </div>
              <button
                onClick={exitRun}
                className="px-8 py-3 rounded-xl font-black text-white text-sm bg-gradient-to-r from-stone-700 to-stone-600 hover:from-stone-600 hover:to-stone-500 shadow-lg transition-all hover:scale-105"
              >
                🏠 Voltar ao mapa
              </button>
            </motion.div>
          </div>
        )}
      </motion.div>
    </div>
  )
}
