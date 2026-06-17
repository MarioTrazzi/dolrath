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
  pickMonster,
  rollNodeLoot,
  scaleMonster,
} from '@/lib/dungeonAdventures'
import {
  TRANSFORMATION_CONFIG,
  getRaceTransformations,
  type TransformationType,
} from '@/lib/transformationSystem'
import { applyEnhancementToStats } from '@/lib/enhancementSystem'

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
  hp: number
  maxHp: number
  mp: number
  maxMp: number
  stamina: number
  maxStamina: number
  attack: number
  defense: number
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

type AttackKind = 'light' | 'heavy' | 'special'
type DefenseKind = 'dodge' | 'defend'

// Combate NÃO gasta stamina (a stamina é o orçamento DIÁRIO de runs).
// O que limita o combate é HP (sobrevivência) e MP (especial/transformação).
const ATTACKS: Record<AttackKind, { label: string; icon: string; sides: number; mult: number; mp: number }> = {
  light: { label: 'Ataque Leve', icon: '👊', sides: 6, mult: 1.0, mp: 0 },
  heavy: { label: 'Ataque Pesado', icon: '⚔️', sides: 10, mult: 1.45, mp: 0 },
  special: { label: 'Ataque Especial', icon: '✨', sides: 20, mult: 1.9, mp: 15 },
}

// Custo de stamina por TIPO de nó ao avançar na trilha (exploração).
const MINOR_STEP_COST = 4 // nó menor
const MAIN_STEP_COST = 8  // sala principal (encontro garantido)
const BOSS_STEP_COST = 6  // aproximar-se do covil

// Chance de encontrar monstro num nó MENOR (sala principal é sempre monstro).
const MINOR_MONSTER_CHANCE = 0.4

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
    // ataque: dano da arma + melhor atributo ofensivo da peça
    attack += num(s.bonusDamage) + num(s.attack) + Math.max(num(s.str), num(s.agi), num(s.int))
    // defesa: defesa da peça + resistência/constituição (metade)
    defense += num(s.def) + num(s.defense) + Math.floor((num(s.res) + num(s.con)) / 2)
    // vida extra das peças
    hp += num(s.hp)
  }
  return { attack, defense, hp }
}

interface Outcome {
  hit: boolean
  damage: number
  crit: boolean
}

function computeOutcome(
  atk: DiceResult,
  def: DiceResult,
  defenseChoice: DefenseKind,
  mult: number,
  defenderDefense: number
): Outcome {
  if (defenseChoice === 'dodge' && def.total >= atk.total) {
    return { hit: false, damage: 0, crit: false }
  }
  const base = Math.round(atk.total * mult)
  const reduction = Math.floor(defenderDefense * 0.4) + (defenseChoice === 'defend' ? Math.floor(def.total * 0.5) : 0)
  let damage = Math.max(1, base - reduction)
  const crit = atk.roll === atk.sides
  if (crit) damage = Math.round(damage * 1.5)
  return { hit: true, damage, crit }
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
  const [xpSaved, setXpSaved] = useState(false)

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
  const battleEventCounter = useRef(0)
  // d20 de sorte do nó atual (define a qualidade do loot pós-combate)
  const lootRollRef = useRef(12)

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

  const persistReward = useCallback((gold: number, itemName?: string, itemDescription?: string, rarity?: string) => {
    if (gold <= 0 && !itemName) return
    fetch('/api/inventory/add-exploration-reward', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        characterId: character.id,
        itemName: itemName || null,
        itemDescription: itemDescription || null,
        rarity: rarity || null,
        gold: gold || 0,
      }),
    }).catch(() => {})
  }, [character.id])

  // Aplica o resultado do loot por sorte: ouro + drops (já persistindo no inventário).
  const applyLoot = useCallback((loot: NodeLoot) => {
    if (loot.gold > 0) {
      setTotals(prev => ({ ...prev, gold: prev.gold + loot.gold }))
      persistReward(loot.gold)
      pushFloat(`+${loot.gold} 💰`, '#f39c12')
    }
    for (const d of loot.drops) {
      setTotals(prev => ({ ...prev, items: [...prev.items, d.name] }))
      persistReward(0, d.name, `Achado em ${dungeon.name}`, d.rarity)
      pushLog(`${d.emoji} ${d.name}`)
    }
  }, [persistReward, pushFloat, pushLog, dungeon.name])

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

  const persistXp = useCallback(async (xp: number) => {
    if (xp <= 0) return null
    try {
      const res = await fetch(`/api/character/${character.id}/add-xp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ xp }),
      })
      if (!res.ok) return null
      return await res.json()
    } catch {
      return null
    }
  }, [character.id])

  // ---------- Poder do equipamento (COM aprimoramento) ----------
  const gear = useMemo(() => equipmentPower(character.equipment), [character.equipment])
  const equipAtk = gear.attack
  const equipDef = gear.defense
  // HP efetivo = base do personagem + vida das peças aprimoradas
  const effMaxHp = character.maxHp + gear.hp
  // Multiplicadores ativos da transformação (1 quando não transformado)
  const atkMult = activeTransformCfg ? activeTransformCfg.statModifiers.attack : 1
  const defMult = activeTransformCfg ? activeTransformCfg.statModifiers.defense : 1
  const playerAtkMod = Math.floor((character.attack + equipAtk + character.level / 2) * atkMult)
  const playerDefMod = Math.floor(((character.defense + equipDef) / 2) * defMult)
  const playerDefenseForDamage = Math.floor((character.defense + equipDef) * defMult)

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
  }), [character, hp, mp, stamina, transform])

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

  // Resolve um nó: sala principal = monstro garantido; nó menor = chance de
  // monstro, senão um ACHADO cuja qualidade é definida pela sorte do d20.
  const buildAndApplyEvent = (roll: number, atIdx: number): ResolvedEvent => {
    const sc = scalingAt(atIdx)
    const lvl = character.level
    lootRollRef.current = roll // sorte usada também no loot pós-combate

    const monsterEncounter = sc.isMain || (!sc.isBoss && Math.random() < MINOR_MONSTER_CHANCE)
    if (monsterEncounter) {
      const ev = dungeon.events.find(e => e.kind === 'monster')!
      const scaled = scaleMonster(pickMonster(dungeon), dungeon, lvl, sc)
      setNodeEvents(prev => ({ ...prev, [atIdx]: { kind: 'monster', emoji: scaled.emoji } }))
      pushLog(`${ev.icon} ${ev.title} ${scaled.emoji} ${scaled.name} apareceu!`)
      return {
        def: ev,
        text: sc.isMain ? `Guardião da sala: ${ev.description}` : ev.description,
        effects: [`${scaled.emoji} ${scaled.name} • Nv.${scaled.level}`],
        monster: scaled,
      }
    }

    // Nó de achado — o d20 define a sorte do loot.
    const loot = rollNodeLoot(dungeon, roll, sc.isMain ? 'main' : 'minor', lvl)
    applyLoot(loot)

    const hasGear = loot.drops.some(d => d.kind === 'item' || d.kind === 'stone')
    const anyDrop = loot.drops.length > 0 || loot.gold > 0
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

  // Botão principal: o token caminha para o próximo nó.
  const advance = () => {
    if (phase !== 'explore' || exploreRolling || moving || eventCard || atBoss) return
    const dest = tokenIdx + 1
    const cost = stepCost(dest)

    if (stamina < cost) {
      showBanner('😮‍💨', `Stamina insuficiente (precisa de ${cost}⚡) — ela reseta amanhã`)
      return
    }

    // Último passo: chega ao covil do boss (sem rolagem).
    if (dest === LAST) {
      setStamina(prev => Math.max(0, prev - cost))
      persistStamina(cost)
      setMoving(true)
      setTokenIdx(dest)
      setNarration('A trilha desemboca no covil. O ar treme... algo antigo se ergue.')
      pushLog(`👑 Você chegou ao covil de ${dungeon.boss.name}...`)
      later(() => setMoving(false), 900)
      later(() => showBanner('👑', `${dungeon.boss.name} desperta!`, 3000), 950)
      return
    }

    // Nó de evento (menor ou sala principal): rola o d20, anda e revela.
    setStamina(prev => Math.max(0, prev - cost))
    persistStamina(cost)
    setExploreRolling(true)
    setExploreResult(null)

    const result = mkResult(20, 0)
    later(() => setExploreResult(result), 700)
    later(() => {
      setExploreRolling(false)
      setExploreResult(null)
      setMoving(true)
      setTokenIdx(dest)
      const resolved = buildAndApplyEvent(result.roll, dest)
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

  const monsterAtkMod = (m: ScaledMonster) => Math.floor(m.attack + m.level / 2)
  const monsterDefMod = (m: ScaledMonster) => Math.floor(m.defense / 2)

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

  // ---------- Turno do jogador (ataque custa só MP no especial) ----------
  const choosePlayerAttack = (kind: AttackKind) => {
    const atk = ATTACKS[kind]
    if (mp < atk.mp) {
      showBanner('🔮', `MP insuficiente! (${atk.mp}🔮)`)
      return
    }
    if (atk.mp > 0) setMp(prev => Math.max(0, prev - atk.mp))
    setPendingAttack(kind)
    setPanelResult(null)
    setHasRolled(false)
    setStage('playerRoll')
  }

  const handlePlayerAttackRoll = () => {
    const m = monsterRef.current
    if (!m || hasRolled || !pendingAttack) return
    setHasRolled(true)
    const atkDef = ATTACKS[pendingAttack]
    const atk = mkResult(atkDef.sides, playerAtkMod)
    setPanelResult(atk)

    // Monstro escolhe defesa e rola o mesmo dado
    const mDefChoice: DefenseKind = Math.random() < 0.5 ? 'dodge' : 'defend'
    const def = mkResult(atkDef.sides, monsterDefMod(m) + (mDefChoice === 'defend' ? 2 : 1))
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
    setPendingAttack(null)

    const outcome = computeOutcome(atk, def, mDefChoice, atkDef.mult, m.defense)
    pushBattleEvent({
      kind: 'resolve',
      attackerId: character.id,
      defenderId: MONSTER_ID,
      action: pendingAttack,
      defenseAction: mDefChoice,
      hit: outcome.hit,
      damage: outcome.damage,
      isCritical: outcome.crit,
    })

    later(() => setDiceResults({}), 1500)

    if (outcome.hit) {
      const newHp = Math.max(0, m.hp - outcome.damage)
      later(() => setMonster(prev => (prev ? { ...prev, hp: newHp } : prev)), 500)
      pushLog(`${atkDef.icon} Você causou ${outcome.damage} de dano${outcome.crit ? ' CRÍTICO' : ''} em ${m.name}!`)
      if (newHp <= 0) {
        later(() => handleCombatVictory(m), 1600)
        return
      }
    } else {
      pushLog(`💨 ${m.name} esquivou do seu ataque!`)
    }
    tickPlayerTurn()
    later(() => monsterTelegraph(), 2000)
  }

  // ---------- Turno do monstro ----------
  const monsterTelegraph = () => {
    const m = monsterRef.current
    if (!m) return
    setCurrentTurnId(MONSTER_ID)
    // Bosses preferem golpes fortes
    const r = Math.random()
    const kind: AttackKind = m.isBoss
      ? r < 0.35 ? 'light' : r < 0.7 ? 'heavy' : 'special'
      : r < 0.5 ? 'light' : r < 0.85 ? 'heavy' : 'special'
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

  const choosePlayerDefense = (choice: DefenseKind) => {
    setDefenseChoice(choice)
    setPanelResult(null)
    setHasRolled(false)
    setStage('defenseRoll')
  }

  const handleDefenseRoll = () => {
    const m = monsterRef.current
    if (!m || hasRolled || !monsterPlan || !defenseChoice) return
    setHasRolled(true)
    const atkDef = ATTACKS[monsterPlan]
    const def = mkResult(atkDef.sides, playerDefMod + (defenseChoice === 'defend' ? 2 : 1))
    setPanelResult(def)

    const atk = mkResult(atkDef.sides, monsterAtkMod(m))
    later(() => setDiceResults(prev => ({ ...prev, [MONSTER_ID]: atk })), 1700)
    later(() => resolveMonsterAttack(atk, def), 3000)
  }

  const resolveMonsterAttack = (atk: DiceResult, def: DiceResult) => {
    const m = monsterRef.current
    if (!m || !monsterPlan || !defenseChoice) return
    const atkDef = ATTACKS[monsterPlan]
    setStage('busy')
    setPanelResult(null)
    setHasRolled(false)

    const outcome = computeOutcome(atk, def, defenseChoice, atkDef.mult, playerDefenseForDamage)
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

    setMonsterPlan(null)
    setDefenseChoice(null)
    later(() => setDiceResults({}), 1500)

    if (outcome.hit) {
      const newHp = Math.max(0, hpRef.current - outcome.damage)
      later(() => setHp(newHp), 500)
      pushLog(`${m.emoji} ${m.name} causou ${outcome.damage} de dano${outcome.crit ? ' CRÍTICO' : ''} em você!`)
      if (newHp <= 0) {
        later(() => {
          setCombatEnded(true)
          setWinnerId(MONSTER_ID)
          later(() => handleDefeat(), 2200)
        }, 1400)
        return
      }
    } else {
      pushLog(`💨 Você esquivou do ataque de ${m.name}!`)
    }
    later(() => {
      setCurrentTurnId(character.id)
      setStage('playerSelect')
    }, 2000)
  }

  // ---------- Fim de combate ----------
  const handleCombatVictory = (m: ScaledMonster) => {
    setCombatEnded(true)
    setWinnerId(character.id)
    setTotals(prev => ({ ...prev, gold: prev.gold + m.goldReward, xp: prev.xp + m.xpReward, kills: prev.kills + 1 }))
    persistReward(m.goldReward)
    pushLog(`🏆 Você derrotou ${m.emoji} ${m.name}! +${m.goldReward} 💰 +${m.xpReward} XP`)

    // Espólio do monstro: rolado pela sorte do nó (boss = sorte máxima e mais drops).
    const nodeKind = m.isBoss ? 'boss' : trailPoints[tokenIdx]?.kind === 'main' ? 'main' : 'minor'
    const lootRoll = m.isBoss ? 20 : lootRollRef.current
    applyLoot(rollNodeLoot(dungeon, lootRoll, nodeKind, character.level))

    later(() => {
      setMonster(null)
      if (m.isBoss) {
        finishRun(true)
      } else {
        setPhase('explore')
        setNarration(nextIsBoss
          ? 'A trilha termina adiante. Você sente um olhar antigo cravado em você...'
          : TRANSITIONS[tokenIdx % TRANSITIONS.length])
        showBanner('🏆', `+${m.goldReward} 💰  +${m.xpReward} XP`)
      }
    }, 2800)
  }

  const handleDefeat = () => {
    setPhase('defeat')
    // Sem penalidade: o XP acumulado é salvo INTEGRALMENTE (gear/itens já foram salvos na hora).
    if (!xpSaved && totalsRef.current.xp > 0) {
      setXpSaved(true)
      persistXp(totalsRef.current.xp)
    }
  }

  const finishRun = async (bossDefeated: boolean) => {
    setPhase('summary')
    if (!xpSaved && totalsRef.current.xp > 0) {
      setXpSaved(true)
      const result = await persistXp(totalsRef.current.xp)
      if (result?.leveledUp) {
        setLevelUpMsg(result.message || '🎉 Você subiu de nível!')
      }
    }
    if (bossDefeated) {
      pushLog(`👑 ${dungeon.name} conquistada!`)
    }
  }

  const exitRun = () => {
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
      return {
        visible: true,
        diceType: atk.sides,
        hasRolled,
        label: `${atk.icon} ${atk.label} — role o d${atk.sides}!`,
        onRoll: handlePlayerAttackRoll,
        myResult: panelResult,
        waitingForOpponent: false,
      }
    }
    if (stage === 'defenseRoll' && monsterPlan) {
      const atk = ATTACKS[monsterPlan]
      return {
        visible: true,
        diceType: atk.sides,
        hasRolled,
        label: `🛡️ Defenda-se! Role o d${atk.sides}`,
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

          <div className="hidden sm:flex flex-col gap-0.5">
            <ResourceBar icon="❤️" value={hp} max={effMaxHp} gradient="from-red-600 to-rose-400" />
            <ResourceBar icon="🔮" value={mp} max={character.maxMp} gradient="from-blue-600 to-cyan-400" />
            <ResourceBar icon="⚡" value={stamina} max={character.maxStamina} gradient="from-yellow-600 to-amber-300" />
          </div>

          <div className="flex items-center gap-2.5">
            <div className="text-right text-[10px] text-white/80 leading-tight">
              <div>💰 {totals.gold}</div>
              <div>⭐ {totals.xp} XP</div>
            </div>
            {phase === 'explore' && (
              <button
                onClick={() => finishRun(false)}
                className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-bold transition-colors"
                title="Sair da masmorra (mantém recompensas)"
              >
                🚪 Sair
              </button>
            )}
          </div>
        </div>

        {/* Barras de recurso no mobile */}
        <div className="sm:hidden flex-shrink-0 flex items-center justify-center gap-3 px-3 py-1.5 bg-black/40 border-b border-white/10">
          <ResourceBar icon="❤️" value={hp} max={character.maxHp} gradient="from-red-600 to-rose-400" />
          <ResourceBar icon="⚡" value={stamina} max={character.maxStamina} gradient="from-yellow-600 to-amber-300" />
        </div>

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

              {/* overlays: evento / boss */}
              <AnimatePresence>
                {eventCard && (
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
                          onClick={() => startCombat(scaleMonster(dungeon.boss, dungeon, character.level, { tier: dungeon.rooms, isMain: true, isBoss: true }))}
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
                      ? () => startCombat(scaleMonster(dungeon.boss, dungeon, character.level, { tier: dungeon.rooms, isMain: true, isBoss: true }))
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

            {/* Barra de ações do combate */}
            <div className="flex-shrink-0 bg-black/70 backdrop-blur-md border-t border-white/10 px-3 sm:px-6 py-3 min-h-[88px] flex items-center justify-center">
              {combatEnded ? (
                <div className="text-white/70 text-sm font-bold animate-pulse">
                  {winnerId === character.id ? '🏆 Vitória! Coletando recompensas...' : '💀 Derrotado...'}
                </div>
              ) : stage === 'playerSelect' ? (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {(Object.keys(ATTACKS) as AttackKind[]).map(kind => {
                    const atk = ATTACKS[kind]
                    const disabled = mp < atk.mp
                    return (
                      <button
                        key={kind}
                        onClick={() => choosePlayerAttack(kind)}
                        disabled={disabled}
                        className={`px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-white transition-all shadow-lg ${
                          disabled
                            ? 'bg-gray-700/60 opacity-50 cursor-not-allowed'
                            : kind === 'light' ? 'bg-gradient-to-r from-yellow-600 to-amber-500 hover:scale-105'
                            : kind === 'heavy' ? 'bg-gradient-to-r from-red-700 to-red-500 hover:scale-105'
                            : 'bg-gradient-to-r from-purple-700 to-fuchsia-600 hover:scale-105'
                        }`}
                      >
                        {atk.icon} {atk.label}
                        <span className="block text-[9px] opacity-80 font-normal">
                          d{atk.sides}{atk.mp > 0 ? ` • ${atk.mp}🔮` : ''}
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
                    <span className="block text-[9px] opacity-80 font-normal">anula se ganhar a rolagem</span>
                  </button>
                  <button
                    onClick={() => choosePlayerDefense('defend')}
                    className="px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-white transition-all shadow-lg bg-gradient-to-r from-emerald-600 to-green-600 hover:scale-105"
                  >
                    🛡️ Defender
                    <span className="block text-[9px] opacity-80 font-normal">reduz o dano recebido</span>
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
