'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import BattleScene, { BattleEvent, DiceResult, EquipmentMap, FighterView } from '@/components/battle/BattleScene'
import { AnimatedDie } from '@/components/battle/AnimatedDice'
import DungeonBackdrop from '@/components/dungeon/DungeonBackdrop'
import {
  DungeonDef,
  DungeonEventDef,
  ScaledMonster,
  eventForRoll,
  pickMonster,
  scaleMonster,
} from '@/lib/dungeonAdventures'

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

const ATTACKS: Record<AttackKind, { label: string; icon: string; sides: number; mult: number; stamina: number; mp: number }> = {
  light: { label: 'Ataque Leve', icon: '👊', sides: 6, mult: 1.0, stamina: 1, mp: 0 },
  heavy: { label: 'Ataque Pesado', icon: '⚔️', sides: 10, mult: 1.45, stamina: 2, mp: 0 },
  special: { label: 'Ataque Especial', icon: '✨', sides: 20, mult: 1.9, stamina: 4, mp: 15 },
}

const DEFENSE_COSTS: Record<DefenseKind, number> = { dodge: 1, defend: 3 }
const EXPLORE_COST = 8
const ADVANCE_COST = 5
const BREATH_RECOVER = 12

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

function equipmentBonus(equipArray: any[], key: 'attack' | 'defense'): number {
  let total = 0
  for (const eq of equipArray || []) {
    const stats = eq?.item?.stats
    if (stats?.[key]) total += Number(stats[key]) || 0
    if (key === 'attack' && stats?.bonusDamage) total += Number(stats.bonusDamage) || 0
  }
  return total
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
  // ---------- Recursos locais do personagem (persistem durante a run) ----------
  const [hp, setHp] = useState(character.hp)
  const [mp, setMp] = useState(character.mp)
  const [stamina, setStamina] = useState(character.stamina)
  const hpRef = useRef(hp)
  hpRef.current = hp

  // ---------- Estado geral da run ----------
  const [phase, setPhase] = useState<RunPhase>('explore')
  const [room, setRoom] = useState(1)
  const [roomExplored, setRoomExplored] = useState(false)
  const [log, setLog] = useState<string[]>([dungeon.enterText])
  const [totals, setTotals] = useState({ gold: 0, xp: 0, kills: 0, items: [] as string[] })
  const totalsRef = useRef(totals)
  totalsRef.current = totals
  const [levelUpMsg, setLevelUpMsg] = useState<string | null>(null)
  const [xpSaved, setXpSaved] = useState(false)

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

  // ---------- Modificadores de dados ----------
  const equipAtk = useMemo(() => equipmentBonus(character.equipment, 'attack'), [character.equipment])
  const equipDef = useMemo(() => equipmentBonus(character.equipment, 'defense'), [character.equipment])
  const playerAtkMod = Math.floor(character.attack + equipAtk + character.level / 2)
  const playerDefMod = Math.floor((character.defense + equipDef) / 2)

  // ---------- Lutadores para a arena ----------
  const playerFighter: FighterView = useMemo(() => ({
    id: character.id,
    name: character.name,
    level: character.level,
    race: character.race,
    class: character.class,
    avatar: character.avatar,
    hp,
    maxHp: character.maxHp,
    mp,
    maxMp: character.maxMp,
    stamina,
    maxStamina: character.maxStamina,
    equipmentMap: mapEquipment(character.equipment),
    isAlive: hp > 0,
  }), [character, hp, mp, stamina])

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
  // EXPLORAÇÃO
  // ============================================================

  const handleExploreRoll = () => {
    if (exploreRolling || roomExplored) return
    if (stamina < EXPLORE_COST) {
      showBanner('😮‍💨', `Stamina insuficiente para explorar (precisa de ${EXPLORE_COST}⚡)`)
      return
    }
    setStamina(prev => Math.max(0, prev - EXPLORE_COST))
    persistStamina(EXPLORE_COST)
    setExploreRolling(true)

    const result = mkResult(20, 0)
    later(() => setExploreResult(result), 500)
    later(() => resolveExploration(result.roll), 2400)
  }

  const resolveExploration = (roll: number) => {
    const ev = eventForRoll(dungeon, roll)
    const lvl = character.level
    setRoomExplored(true)

    switch (ev.kind) {
      case 'trap': {
        const dmg = Math.max(1, Math.ceil(character.maxHp * (ev.trapDamagePct || 10) / 100))
        const newHp = Math.max(0, hpRef.current - dmg)
        setHp(newHp)
        setTrapShake(true)
        later(() => setTrapShake(false), 600)
        setEventCard({ def: ev, text: ev.description, effects: [`-${dmg} ❤️`] })
        pushLog(`${ev.icon} ${ev.title} Você perdeu ${dmg} HP.`)
        if (newHp <= 0) {
          later(() => handleDefeat(), 1800)
        }
        break
      }
      case 'monster': {
        const scaled = scaleMonster(pickMonster(dungeon), dungeon, lvl, room)
        setEventCard({
          def: ev,
          text: `${ev.description}`,
          effects: [`${scaled.emoji} ${scaled.name} • Nv.${scaled.level}`],
          monster: scaled,
        })
        pushLog(`${ev.icon} ${ev.title} ${scaled.emoji} ${scaled.name} apareceu!`)
        break
      }
      case 'nothing': {
        const text = dungeon.ambience[Math.floor(Math.random() * dungeon.ambience.length)]
        setEventCard({ def: ev, text, effects: [] })
        pushLog(`${ev.icon} ${text}`)
        break
      }
      case 'gold': {
        const [gMin, gMax] = ev.goldPerLevel || [10, 20]
        const amount = Math.floor((gMin + Math.random() * (gMax - gMin)) * lvl)
        setTotals(prev => ({ ...prev, gold: prev.gold + amount }))
        persistReward(amount)
        setEventCard({ def: ev, text: ev.description, effects: [`+${amount} 💰`] })
        pushLog(`${ev.icon} ${ev.title} +${amount} gold!`)
        break
      }
      case 'item': {
        const name = ev.itemNames?.[Math.floor(Math.random() * (ev.itemNames?.length || 1))] || 'Item Misterioso'
        setTotals(prev => ({ ...prev, items: [...prev.items, name] }))
        persistReward(0, name, `Encontrado em ${dungeon.name}`, ev.itemRarity)
        setEventCard({ def: ev, text: ev.description, effects: [`📦 ${name}`] })
        pushLog(`${ev.icon} ${ev.title} Você encontrou ${name}!`)
        break
      }
      case 'blessing': {
        const effects: string[] = []
        const b = ev.blessing
        if (b?.hpPct) {
          const heal = Math.ceil(character.maxHp * b.hpPct / 100)
          setHp(prev => Math.min(character.maxHp, prev + heal))
          effects.push(`+${heal} ❤️`)
        }
        if (b?.mpPct) {
          const gain = Math.ceil(character.maxMp * b.mpPct / 100)
          setMp(prev => Math.min(character.maxMp, prev + gain))
          effects.push(`+${gain} 🔮`)
        }
        if (b?.staminaPct) {
          const gain = Math.ceil(character.maxStamina * b.staminaPct / 100)
          setStamina(prev => Math.min(character.maxStamina, prev + gain))
          effects.push(`+${gain} ⚡`)
        }
        if (b?.xpPerLevel) {
          const xp = b.xpPerLevel * lvl
          setTotals(prev => ({ ...prev, xp: prev.xp + xp }))
          effects.push(`+${xp} XP`)
        }
        if (ev.goldPerLevel) {
          const [gMin, gMax] = ev.goldPerLevel
          const amount = Math.floor((gMin + Math.random() * (gMax - gMin)) * lvl)
          setTotals(prev => ({ ...prev, gold: prev.gold + amount }))
          persistReward(amount)
          effects.push(`+${amount} 💰`)
        }
        setEventCard({ def: ev, text: ev.description, effects })
        pushLog(`${ev.icon} ${ev.title} ${effects.join(' • ')}`)
        break
      }
    }
  }

  const dismissEvent = () => {
    setEventCard(null)
    setExploreResult(null)
    setExploreRolling(false)
  }

  const advanceRoom = () => {
    if (stamina < ADVANCE_COST) {
      showBanner('😮‍💨', `Stamina insuficiente para avançar (precisa de ${ADVANCE_COST}⚡)`)
      return
    }
    setStamina(prev => Math.max(0, prev - ADVANCE_COST))
    persistStamina(ADVANCE_COST)
    dismissEvent()
    setRoomExplored(false)
    const next = room + 1
    setRoom(next)
    if (next > dungeon.rooms) {
      pushLog(`👑 Você chegou ao covil de ${dungeon.boss.name}...`)
      showBanner('👑', `${dungeon.boss.name} desperta!`, 3000)
    } else {
      pushLog(`🚪 Você avança para a sala ${next}.`)
    }
  }

  const isBossRoom = room > dungeon.rooms

  // ============================================================
  // COMBATE (motor local na arena nova)
  // ============================================================

  const startCombat = (m: ScaledMonster) => {
    setMonster(m)
    setEventCard(null)
    setExploreResult(null)
    setExploreRolling(false)
    setCombatEnded(false)
    setWinnerId(null)
    setDiceResults({})
    setPanelResult(null)
    setHasRolled(false)
    setPendingAttack(null)
    setMonsterPlan(null)
    setDefenseChoice(null)
    setCurrentTurnId(null)
    setPhase('combat')
    setStage('initiative')
    pushLog(`⚔️ Combate contra ${m.emoji} ${m.name} começou!`)
  }

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

  // ---------- Turno do jogador ----------
  const choosePlayerAttack = (kind: AttackKind) => {
    const atk = ATTACKS[kind]
    if (stamina < atk.stamina) {
      showBanner('😮‍💨', `Stamina insuficiente! (${atk.stamina}⚡)`)
      return
    }
    if (mp < atk.mp) {
      showBanner('🔮', `MP insuficiente! (${atk.mp}🔮)`)
      return
    }
    if (atk.stamina > 0) {
      setStamina(prev => Math.max(0, prev - atk.stamina))
      persistStamina(atk.stamina)
    }
    if (atk.mp > 0) setMp(prev => Math.max(0, prev - atk.mp))
    setPendingAttack(kind)
    setPanelResult(null)
    setHasRolled(false)
    setStage('playerRoll')
  }

  const recoverBreath = () => {
    setStamina(prev => Math.min(character.maxStamina, prev + BREATH_RECOVER))
    showBanner('😤', `Você recupera o fôlego (+${BREATH_RECOVER}⚡)`)
    pushLog(`😤 Você recuperou o fôlego (+${BREATH_RECOVER}⚡).`)
    setStage('busy')
    later(() => monsterTelegraph(), 1600)
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

  const choosePlayerDefense = (choice: DefenseKind) => {
    const cost = DEFENSE_COSTS[choice]
    if (stamina < cost) {
      showBanner('😮‍💨', `Stamina insuficiente! (${cost}⚡)`)
      return
    }
    setStamina(prev => Math.max(0, prev - cost))
    persistStamina(cost)
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

    const outcome = computeOutcome(atk, def, defenseChoice, atkDef.mult, character.defense + equipDef)
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

    later(() => {
      setMonster(null)
      if (m.isBoss) {
        finishRun(true)
      } else {
        setPhase('explore')
        showBanner('🏆', `+${m.goldReward} 💰  +${m.xpReward} XP`)
      }
    }, 2800)
  }

  const handleDefeat = () => {
    setPhase('defeat')
    // Na derrota, metade do XP acumulado ainda é salvo
    const xp = Math.floor(totalsRef.current.xp / 2)
    if (xp > 0 && !xpSaved) {
      setXpSaved(true)
      persistXp(xp)
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
    onExit({ hp: Math.max(1, hp), mp, stamina })
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
                {Array.from({ length: dungeon.rooms }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-2 h-2 rounded-full ${i + 1 < room ? 'bg-green-400' : i + 1 === room && !isBossRoom ? 'animate-pulse' : 'bg-white/20'}`}
                    style={i + 1 === room && !isBossRoom ? { backgroundColor: dungeon.accent } : undefined}
                  />
                ))}
                <span className={`text-[11px] ml-0.5 ${isBossRoom ? 'animate-pulse' : 'opacity-40'}`}>👑</span>
                <span className="text-[10px] text-white/60 ml-1.5">
                  {isBossRoom ? 'Covil do Boss' : `Sala ${room}/${dungeon.rooms}`}
                </span>
              </div>
            </div>
          </div>

          <div className="hidden sm:flex flex-col gap-0.5">
            <ResourceBar icon="❤️" value={hp} max={character.maxHp} gradient="from-red-600 to-rose-400" />
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

        {/* ============================================================ */}
        {/* FASE: EXPLORAÇÃO */}
        {/* ============================================================ */}
        {phase === 'explore' && (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 flex flex-col items-center justify-center gap-5 px-4">
              {/* Sala do boss: confronto */}
              {isBossRoom && !eventCard ? (
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 16 }}
                  className="text-center bg-black/70 backdrop-blur-md border-2 rounded-3xl px-6 sm:px-10 py-6 max-w-md shadow-2xl"
                  style={{ borderColor: dungeon.accent, boxShadow: `0 0 50px ${dungeon.accentSoft}` }}
                >
                  <motion.div
                    className="text-6xl mb-3"
                    animate={{ scale: [1, 1.12, 1] }}
                    transition={{ repeat: Infinity, duration: 1.8 }}
                  >
                    {dungeon.boss.emoji}
                  </motion.div>
                  <div className="text-amber-300 text-xs font-bold tracking-widest uppercase mb-1">👑 Boss Final</div>
                  <h3 className="text-white font-black text-xl sm:text-2xl mb-1">{dungeon.boss.name}</h3>
                  <p className="text-white/60 text-xs italic mb-4">"{dungeon.boss.title}"</p>
                  <button
                    onClick={() => startCombat(scaleMonster(dungeon.boss, dungeon, character.level, room, true))}
                    className="px-6 py-3 rounded-xl font-black text-white text-sm bg-gradient-to-r from-red-700 to-amber-600 hover:from-red-600 hover:to-amber-500 shadow-lg transition-all hover:scale-105"
                  >
                    ⚔️ Enfrentar o Boss
                  </button>
                </motion.div>
              ) : !roomExplored && !eventCard ? (
                /* Dado de exploração */
                <motion.div
                  initial={{ y: 16, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  className="text-center bg-black/60 backdrop-blur-md border border-white/15 rounded-3xl px-6 sm:px-10 py-6 shadow-2xl"
                  style={{ boxShadow: `0 0 40px ${dungeon.accentSoft}` }}
                >
                  <div className="text-white/90 font-bold text-sm sm:text-base mb-1">
                    {dungeon.emoji} {dungeon.exploreAction}
                  </div>
                  <div className="text-white/50 text-xs mb-4">{dungeon.exploreHint} • custa {EXPLORE_COST}⚡</div>
                  <div className="flex justify-center">
                    <AnimatedDie
                      sides={20}
                      size={110}
                      mode={exploreRolling ? 'rolling' : 'idle'}
                      result={exploreResult}
                      onClick={handleExploreRoll}
                      disabled={stamina < EXPLORE_COST}
                    />
                  </div>
                  {stamina < EXPLORE_COST && (
                    <div className="text-red-400 text-[11px] font-bold mt-2">😮‍💨 Stamina insuficiente</div>
                  )}
                </motion.div>
              ) : null}

              {/* Card de evento dinâmico */}
              <AnimatePresence>
                {eventCard && (
                  <motion.div
                    key={eventCard.def.title + room}
                    initial={{ scale: 0.7, y: 30, opacity: 0 }}
                    animate={{ scale: 1, y: 0, opacity: 1 }}
                    exit={{ scale: 0.85, y: -20, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 230, damping: 18 }}
                    className="text-center bg-black/75 backdrop-blur-md border-2 rounded-3xl px-6 sm:px-10 py-6 max-w-md shadow-2xl"
                    style={{
                      borderColor: eventCard.def.kind === 'trap' ? 'rgba(248,113,113,0.6)'
                        : eventCard.def.kind === 'monster' ? 'rgba(251,146,60,0.6)'
                        : eventCard.def.kind === 'blessing' ? 'rgba(250,204,21,0.6)'
                        : dungeon.accentSoft,
                      boxShadow: `0 0 50px ${dungeon.accentSoft}`,
                    }}
                  >
                    <motion.div
                      className="text-5xl mb-2"
                      initial={{ rotate: -12, scale: 0.5 }}
                      animate={{ rotate: 0, scale: 1 }}
                      transition={{ type: 'spring', stiffness: 260, damping: 12 }}
                    >
                      {eventCard.monster ? eventCard.monster.emoji : eventCard.def.icon}
                    </motion.div>
                    <h3 className="text-white font-black text-lg sm:text-xl mb-1.5">{eventCard.def.title}</h3>
                    {eventCard.text && <p className="text-white/70 text-xs sm:text-sm mb-3">{eventCard.text}</p>}

                    {eventCard.effects.length > 0 && (
                      <div className="flex flex-wrap justify-center gap-2 mb-4">
                        {eventCard.effects.map((fx, i) => (
                          <motion.span
                            key={fx}
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: 0.3 + i * 0.15, type: 'spring', stiffness: 300 }}
                            className="px-3 py-1 rounded-full bg-white/10 border border-white/20 text-white text-xs font-bold"
                          >
                            {fx}
                          </motion.span>
                        ))}
                      </div>
                    )}

                    {eventCard.monster ? (
                      <button
                        onClick={() => startCombat(eventCard.monster!)}
                        className="px-6 py-3 rounded-xl font-black text-white text-sm bg-gradient-to-r from-red-700 to-orange-600 hover:from-red-600 hover:to-orange-500 shadow-lg transition-all hover:scale-105"
                      >
                        ⚔️ Lutar!
                      </button>
                    ) : (
                      <button
                        onClick={dismissEvent}
                        className="px-6 py-2.5 rounded-xl font-bold text-white/90 text-sm bg-white/10 hover:bg-white/20 border border-white/20 transition-all"
                      >
                        Continuar
                      </button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Avançar de sala */}
              {roomExplored && !eventCard && !isBossRoom && (
                <motion.button
                  initial={{ y: 14, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  onClick={advanceRoom}
                  className="px-6 py-3 rounded-xl font-black text-white text-sm shadow-lg transition-all hover:scale-105"
                  style={{ background: `linear-gradient(90deg, ${dungeon.accent}aa, ${dungeon.accent}55)`, border: `1px solid ${dungeon.accent}` }}
                >
                  {room + 1 > dungeon.rooms ? `👑 Ir ao covil do Boss (${ADVANCE_COST}⚡)` : `🚪 Avançar para a sala ${room + 1} (${ADVANCE_COST}⚡)`}
                </motion.button>
              )}
            </div>

            {/* Rodapé: personagem + log */}
            <div className="flex-shrink-0 flex items-end justify-between gap-3 px-3 sm:px-5 pb-3">
              <div className="flex items-center gap-2.5 bg-black/60 backdrop-blur-sm rounded-2xl border border-white/15 px-3 py-2">
                <div className="w-11 h-11 rounded-xl overflow-hidden border border-white/20 bg-slate-800 flex items-center justify-center flex-shrink-0">
                  {character.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={character.avatar} alt={character.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xl">🧝</span>
                  )}
                </div>
                <div className="leading-tight">
                  <div className="text-white text-xs font-bold">{character.name} <span className="text-amber-300">Nv.{character.level}</span></div>
                  <div className="text-white/50 text-[10px]">{character.race} • {character.class}</div>
                </div>
              </div>

              <div className="hidden md:block w-72 max-h-28 overflow-y-auto bg-black/50 backdrop-blur-sm rounded-xl border border-white/10 px-3 py-2">
                {log.slice(-5).map((entry, i) => (
                  <div key={`${i}-${entry.slice(0, 12)}`} className="text-[10px] text-white/70 py-0.5">{entry}</div>
                ))}
              </div>
            </div>
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
                    const disabled = stamina < atk.stamina || mp < atk.mp
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
                          d{atk.sides} • {atk.stamina}⚡{atk.mp > 0 ? ` • ${atk.mp}🔮` : ''}
                        </span>
                      </button>
                    )
                  })}
                  <button
                    onClick={recoverBreath}
                    disabled={stamina >= character.maxStamina}
                    className={`px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-white transition-all shadow-lg ${
                      stamina >= character.maxStamina
                        ? 'bg-gray-700/60 opacity-50 cursor-not-allowed'
                        : 'bg-gradient-to-r from-emerald-700 to-teal-600 hover:scale-105'
                    }`}
                  >
                    😤 Recuperar Fôlego
                    <span className="block text-[9px] opacity-80 font-normal">+{BREATH_RECOVER}⚡ • perde o turno</span>
                  </button>
                </div>
              ) : stage === 'playerDefense' ? (
                <div className="flex items-center justify-center gap-2">
                  <span className="text-amber-300 text-xs font-bold mr-1 hidden sm:inline">🛡️ Reaja ao ataque:</span>
                  <button
                    onClick={() => choosePlayerDefense('dodge')}
                    disabled={stamina < DEFENSE_COSTS.dodge}
                    className={`px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-white transition-all shadow-lg ${
                      stamina < DEFENSE_COSTS.dodge
                        ? 'bg-gray-700/60 opacity-50 cursor-not-allowed'
                        : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:scale-105'
                    }`}
                  >
                    🌪️ Esquivar
                    <span className="block text-[9px] opacity-80 font-normal">{DEFENSE_COSTS.dodge}⚡ • anula se ganhar</span>
                  </button>
                  <button
                    onClick={() => choosePlayerDefense('defend')}
                    disabled={stamina < DEFENSE_COSTS.defend}
                    className={`px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-white transition-all shadow-lg ${
                      stamina < DEFENSE_COSTS.defend
                        ? 'bg-gray-700/60 opacity-50 cursor-not-allowed'
                        : 'bg-gradient-to-r from-emerald-600 to-green-600 hover:scale-105'
                    }`}
                  >
                    🛡️ Defender
                    <span className="block text-[9px] opacity-80 font-normal">{DEFENSE_COSTS.defend}⚡ • reduz o dano</span>
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
                {dungeon.name} reivindica mais uma alma. Metade do XP acumulado foi preservado.
              </p>
              <div className="text-white/70 text-xs mb-5">
                💰 {totals.gold} ouro já salvo • ⭐ {Math.floor(totals.xp / 2)} XP preservado
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
