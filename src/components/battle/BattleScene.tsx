'use client'

import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import ItemIcon from '@/components/ItemIcon'
import { AnimatedDie, MiniDie } from '@/components/battle/AnimatedDice'
import { getTransformationGlow } from '@/lib/transformationSystem'
import { applyEnhancementToStats } from '@/lib/enhancementSystem'
import { formatItemStats } from '@/lib/itemStats'

// ============================================================
// Tipos
// ============================================================

export interface EquippedItem {
  id: string
  name: string
  image?: string | null
  type?: string
  stats?: Record<string, number | undefined>
  /** Nível de aprimoramento da instância equipada (+1, +2, ...). */
  enhancementLevel?: number
}

// Chaves: WEAPON, SHIELD, HELMET, ARMOR, GLOVES, BOOTS, NECKLACE, RING_1, RING_2
export type EquipmentMap = Partial<Record<string, EquippedItem>>

export interface FighterView {
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
  isTransformed?: boolean
  transformationType?: string | null
  /** Arte da forma transformada (substitui o avatar enquanto transformado) */
  transformationImage?: string | null
  equipmentMap?: EquipmentMap
  isAlive?: boolean
  /** Emoji usado como sprite quando não há avatar (ex.: monstros do modo treino) */
  avatarEmoji?: string | null
}

export interface BattleEvent {
  id: number
  kind: 'resolve' | 'item' | 'transform'
  attackerId?: string
  defenderId?: string
  action?: string
  defenseAction?: string
  hit?: boolean
  damage?: number
  isCritical?: boolean
  // Para kind === 'item'
  actorId?: string
  itemName?: string
  hpRestored?: number
  mpRestored?: number
  staminaRestored?: number
}

export interface DiceResult {
  sides: number
  roll: number
  modifier: number
  total: number
}

export interface DicePanelInfo {
  visible: boolean
  diceType: number
  hasRolled: boolean
  label: string
  onRoll: () => void
  /** Resultado do servidor para a minha rolagem (o dado gira até ele chegar) */
  myResult?: DiceResult | null
  /** Mostrar "aguardando oponente" depois de revelar meu resultado */
  waitingForOpponent?: boolean
}

interface BattleSceneProps {
  left: FighterView | null
  right: FighterView | null
  currentTurnId?: string | null
  winnerId?: string | null
  combatEnded?: boolean
  event?: BattleEvent | null
  diceResults?: Record<string, DiceResult | undefined>
  dicePanel?: DicePanelInfo | null
  className?: string
  /** Cenário customizado (ex.: fundo temático de masmorra). Substitui o céu noturno padrão. */
  backdrop?: React.ReactNode
}

interface FloatingText {
  key: number
  side: 'left' | 'right'
  text: string
  color: string
  big?: boolean
}

// ============================================================
// Helpers visuais
// ============================================================

const SLOT_ORDER = ['WEAPON', 'SHIELD', 'HELMET', 'ARMOR', 'GLOVES', 'BOOTS', 'NECKLACE', 'RING_1', 'RING_2']

const SLOT_EMOJI: Record<string, string> = {
  WEAPON: '⚔️',
  SHIELD: '🛡️',
  HELMET: '🪖',
  ARMOR: '🥋',
  GLOVES: '🧤',
  BOOTS: '🥾',
  NECKLACE: '📿',
  RING_1: '💍',
  RING_2: '💍',
}

const TRANSFORM_EMOJI: Record<string, string> = {
  dragon: '🐉',
  wolf: '🐺',
  bear: '🐻',
  eagle: '🦅',
  seventh_sense: '✨',
  celestial: '🌟',
}

const CLASS_EMOJI: Record<string, string> = {
  guerreiro: '🗡️',
  mago: '🧙',
  arqueiro: '🏹',
  ladino: '🗡️',
  paladino: '🛡️',
  clerigo: '✨',
}

function hpBarColor(pct: number): string {
  if (pct > 50) return 'from-green-500 to-emerald-400'
  if (pct > 25) return 'from-yellow-500 to-amber-400'
  return 'from-red-600 to-red-400'
}


// ============================================================
// Sub-componentes
// ============================================================

function StatBar({ value, max, gradient, icon }: { value: number; max: number; gradient: string; icon: string }) {
  const pct = Math.max(0, Math.min(100, max > 0 ? (value / max) * 100 : 0))
  return (
    <div className="flex items-center gap-1 w-full">
      <span className="text-[10px] w-4 text-center flex-shrink-0">{icon}</span>
      <div className="flex-1 h-2.5 bg-black/50 rounded-full overflow-hidden border border-white/10">
        <motion.div
          className={`h-full rounded-full bg-gradient-to-r ${gradient}`}
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        />
      </div>
      <span className="text-[9px] text-white/80 w-12 text-right flex-shrink-0 font-mono">
        {value}/{max}
      </span>
    </div>
  )
}

// Slot de equipamento no combate: mostra o item, badge +N e, ao passar o mouse,
// um card (via portal) com os stats já aprimorados — mesmo formato do inventário.
function EquipSlot({ slot, item }: { slot: string; item: EquippedItem }) {
  const ref = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })

  const level = item.enhancementLevel || 0
  const stats = formatItemStats(applyEnhancementToStats(item.stats, level), item.type)

  const show = () => {
    const r = ref.current?.getBoundingClientRect()
    if (r) {
      const W = 190
      let left = r.left + r.width / 2 - W / 2
      left = Math.max(8, Math.min(left, window.innerWidth - W - 8))
      setPos({ top: r.top - 8, left })
    }
    setHover(true)
  }

  return (
    <div
      ref={ref}
      onMouseEnter={show}
      onMouseLeave={() => setHover(false)}
      className="relative w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-black/40 border border-amber-500/40 flex items-center justify-center overflow-hidden hover:border-amber-400 hover:scale-110 transition-all cursor-help shadow-lg shadow-black/50"
    >
      {item.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
      ) : item.type ? (
        <ItemIcon type={item.type as any} size={18} className="text-amber-300" />
      ) : (
        <span className="text-sm">{SLOT_EMOJI[slot] || '❔'}</span>
      )}
      {level > 0 && (
        <span
          className="absolute right-0 bottom-0 text-[9px] font-black leading-none text-amber-300 px-0.5"
          style={{ textShadow: '0 1px 2px #000, 0 0 3px #000' }}
        >
          +{level}
        </span>
      )}

      {hover && typeof document !== 'undefined' && createPortal(
        <div
          className="pointer-events-none fixed z-[9999] w-[190px] rounded-lg border border-amber-500/40 bg-gray-950/95 p-2 shadow-2xl"
          style={{ top: pos.top, left: pos.left, transform: 'translateY(-100%)' }}
        >
          <div className="flex items-center gap-1 text-xs font-bold text-white">
            <span className="truncate">{item.name}</span>
            {level > 0 && <span className="flex-shrink-0 text-[10px] font-black text-amber-300">+{level}</span>}
          </div>
          {stats.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {stats.map((s, i) => (
                <span key={i} className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}

function EquipmentColumn({ equipment, side }: { equipment?: EquipmentMap; side: 'left' | 'right' }) {
  return (
    <div className={`flex flex-col gap-1 ${side === 'left' ? 'items-start' : 'items-end'}`}>
      {SLOT_ORDER.map(slot => {
        const item = equipment?.[slot]
        if (!item) return null
        return <EquipSlot key={slot} slot={slot} item={item} />
      })}
    </div>
  )
}

function FighterFigure({
  fighter,
  side,
  isTurn,
  isWinner,
  isDefeated,
  lunging,
  shaking,
  dodging,
  defending,
  diceResult,
}: {
  fighter: FighterView
  side: 'left' | 'right'
  isTurn: boolean
  isWinner: boolean
  isDefeated: boolean
  lunging: boolean
  shaking: boolean
  dodging: boolean
  defending: boolean
  diceResult?: DiceResult
}) {
  const hpPct = fighter.maxHp > 0 ? (fighter.hp / fighter.maxHp) * 100 : 0
  const transformEmoji = fighter.isTransformed && fighter.transformationType
    ? TRANSFORM_EMOJI[fighter.transformationType] || '🌟'
    : null
  // Cor do brilho por forma (ex.: celestial = dourado, dragão = vermelho)
  const glow = getTransformationGlow(fighter.transformationType)
  // Enquanto transformado, mostra a arte da forma (se gerada); senão, o avatar normal.
  const displayedImage = (fighter.isTransformed && fighter.transformationImage)
    ? fighter.transformationImage
    : fighter.avatar

  // Direção da investida: esquerda avança para a direita e vice-versa
  const lungeX = side === 'left' ? 90 : -90
  const dodgeX = side === 'left' ? -45 : 45

  return (
    <div className={`flex items-end gap-1 sm:gap-2 ${side === 'right' ? 'flex-row-reverse' : ''}`}>
      {/* Equipamentos ao lado externo do lutador */}
      <EquipmentColumn equipment={fighter.equipmentMap} side={side} />

      <div className="flex flex-col items-center gap-1 w-32 sm:w-44">
        {/* Placa de nome + barras */}
        <div className={`w-full bg-black/60 backdrop-blur-sm rounded-xl px-2 py-1.5 border ${
          isTurn ? 'border-amber-400 shadow-lg shadow-amber-500/30' : 'border-white/15'
        }`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] sm:text-xs font-bold text-white truncate">
              {transformEmoji && <span className="mr-1">{transformEmoji}</span>}
              {fighter.name}
            </span>
            <span className="text-[9px] text-amber-300 font-bold flex-shrink-0 ml-1">Nv.{fighter.level}</span>
          </div>
          <div className="space-y-0.5">
            <StatBar value={fighter.hp} max={fighter.maxHp} gradient={hpBarColor(hpPct)} icon="❤️" />
            <StatBar value={fighter.mp} max={fighter.maxMp} gradient="from-blue-600 to-cyan-400" icon="🔮" />
            <StatBar value={fighter.stamina} max={fighter.maxStamina} gradient="from-yellow-600 to-amber-300" icon="⚡" />
          </div>
        </div>

        {/* Resultado do dado (mini-dado girando) */}
        <div className="h-11 flex items-center">
          <AnimatePresence>
            {diceResult && (
              <MiniDie sides={diceResult.sides} result={diceResult} />
            )}
          </AnimatePresence>
        </div>

        {/* Sprite do personagem */}
        <motion.div
          className="relative"
          animate={
            lunging ? { x: [0, lungeX, 0], scale: [1, 1.06, 1] }
            : dodging ? { x: [0, dodgeX, 0], opacity: [1, 0.45, 1] }
            : shaking ? { x: [0, -8, 8, -6, 6, 0] }
            : { x: 0 }
          }
          transition={
            lunging ? { duration: 0.5, times: [0, 0.5, 1], ease: 'easeInOut' }
            : dodging ? { duration: 0.45 }
            : shaking ? { duration: 0.4 }
            : { duration: 0.2 }
          }
        >
          {/* Aura de turno / transformação (cor da forma quando transformado) */}
          {(isTurn || fighter.isTransformed) && !isDefeated && (
            <div
              className="absolute -inset-2 rounded-2xl blur-md animate-pulse pointer-events-none"
              style={
                fighter.isTransformed
                  ? { backgroundColor: glow.hex, opacity: 0.4 }
                  : { backgroundColor: '#fbbf24', opacity: 0.2 }
              }
            />
          )}

          {/* Bolha de defesa */}
          <AnimatePresence>
            {defending && (
              <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1.15, opacity: 1 }}
                exit={{ scale: 1.4, opacity: 0 }}
                className="absolute -inset-1 rounded-2xl border-4 border-cyan-400/70 bg-cyan-400/10 z-10 pointer-events-none"
              />
            )}
          </AnimatePresence>

          <motion.div
            animate={isDefeated ? { rotate: side === 'left' ? -90 : 90, y: 30, opacity: 0.5 } : { rotate: 0, y: 0, opacity: 1 }}
            transition={{ duration: 0.8, ease: 'easeIn' }}
            className={`relative w-28 h-36 sm:w-40 sm:h-52 rounded-2xl overflow-hidden border-2 shadow-2xl ${
              isWinner ? 'border-yellow-400 shadow-yellow-500/40'
              : fighter.isTransformed ? ''
              : isTurn ? 'border-amber-400/70'
              : 'border-white/20'
            } ${isDefeated ? 'grayscale' : ''}`}
            style={
              fighter.isTransformed && !isDefeated && !isWinner
                ? { borderColor: glow.hex, boxShadow: `0 0 18px 2px ${glow.hex}` }
                : undefined
            }
          >
            {displayedImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={displayedImage}
                alt={fighter.name}
                className={`w-full h-full object-cover ${side === 'right' ? 'scale-x-[-1]' : ''}`}
              />
            ) : (
              <div className={`w-full h-full bg-gradient-to-b from-slate-700 to-slate-900 flex flex-col items-center justify-center gap-2 ${side === 'right' ? 'scale-x-[-1]' : ''}`}>
                <span className="text-5xl sm:text-6xl">
                  {transformEmoji || fighter.avatarEmoji || CLASS_EMOJI[fighter.class?.toLowerCase()] || '🧝'}
                </span>
              </div>
            )}
            {/* Faixa raça/classe */}
            <div className="absolute bottom-0 inset-x-0 bg-black/70 text-center py-0.5">
              <span className="text-[9px] text-white/80">{fighter.race} • {fighter.class}</span>
            </div>
          </motion.div>

          {/* Sombra no chão */}
          <div className="mx-auto mt-1 w-24 sm:w-32 h-3 bg-black/50 rounded-[100%] blur-sm" />
        </motion.div>
      </div>
    </div>
  )
}

// ============================================================
// Componente principal
// ============================================================

export default function BattleScene({
  left,
  right,
  currentTurnId,
  winnerId,
  combatEnded,
  event,
  diceResults,
  dicePanel,
  className = '',
  backdrop,
}: BattleSceneProps) {
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([])
  const [lungingSide, setLungingSide] = useState<'left' | 'right' | null>(null)
  const [shakingSide, setShakingSide] = useState<'left' | 'right' | null>(null)
  const [dodgingSide, setDodgingSide] = useState<'left' | 'right' | null>(null)
  const [defendingSide, setDefendingSide] = useState<'left' | 'right' | null>(null)
  const [slashSide, setSlashSide] = useState<'left' | 'right' | null>(null)
  const textKey = useRef(0)
  const lastEventId = useRef(0)
  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([])

  const sideOf = (id?: string | null): 'left' | 'right' | null => {
    if (!id) return null
    if (left?.id === id) return 'left'
    if (right?.id === id) return 'right'
    return null
  }

  const pushText = (side: 'left' | 'right', text: string, color: string, big = false) => {
    textKey.current += 1
    const key = textKey.current
    setFloatingTexts(prev => [...prev, { key, side, text, color, big }])
    const t = setTimeout(() => {
      setFloatingTexts(prev => prev.filter(ft => ft.key !== key))
    }, 1500)
    timeouts.current.push(t)
  }

  const later = (fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms)
    timeouts.current.push(t)
  }

  // Coreografia dos eventos de batalha
  useEffect(() => {
    if (!event || event.id === lastEventId.current) return
    lastEventId.current = event.id

    if (event.kind === 'resolve') {
      const atkSide = sideOf(event.attackerId)
      const defSide = sideOf(event.defenderId)
      if (!atkSide || !defSide) return

      // 1. Investida do atacante
      setLungingSide(atkSide)
      later(() => setLungingSide(null), 550)

      // 2. Impacto (no meio da investida)
      later(() => {
        if (event.hit) {
          setSlashSide(defSide)
          later(() => setSlashSide(null), 350)
          setShakingSide(defSide)
          later(() => setShakingSide(null), 450)

          if (event.defenseAction === 'defend') {
            setDefendingSide(defSide)
            later(() => setDefendingSide(null), 700)
          }

          if (event.isCritical) {
            pushText(defSide, 'CRÍTICO!', 'text-yellow-300', true)
            later(() => pushText(defSide, `-${event.damage}`, 'text-yellow-300', true), 150)
          } else {
            pushText(defSide, `-${event.damage}`, 'text-red-400', (event.damage || 0) > 30)
          }
        } else {
          // Esquiva bem-sucedida
          setDodgingSide(defSide)
          later(() => setDodgingSide(null), 500)
          pushText(defSide, 'ESQUIVOU!', 'text-cyan-300', true)
        }
      }, 280)
    } else if (event.kind === 'item') {
      const side = sideOf(event.actorId)
      if (!side) return
      if (event.hpRestored) pushText(side, `+${event.hpRestored} HP`, 'text-green-400', true)
      if (event.mpRestored) later(() => pushText(side, `+${event.mpRestored} MP`, 'text-blue-400'), 200)
      if (event.staminaRestored) later(() => pushText(side, `+${event.staminaRestored} ⚡`, 'text-yellow-300'), 400)
    } else if (event.kind === 'transform') {
      const side = sideOf(event.actorId)
      if (!side) return
      pushText(side, 'TRANSFORMAÇÃO!', 'text-purple-300', true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id])

  // Limpar timeouts ao desmontar
  useEffect(() => () => { timeouts.current.forEach(clearTimeout) }, [])

  // Enquanto o dado grande do centro gira para o jogador local (lado esquerdo),
  // esconder o mini-dado dele para não revelar o resultado antes da hora
  const miniDieFor = (fighter: FighterView, side: 'left' | 'right') => {
    if (side === 'left' && dicePanel?.visible) return undefined
    return diceResults?.[fighter.id]
  }

  const renderFighter = (fighter: FighterView | null, side: 'left' | 'right') => {
    if (!fighter) {
      return (
        <div className="flex flex-col items-center justify-end w-32 sm:w-44 gap-2 opacity-60">
          <div className="w-28 h-36 sm:w-40 sm:h-52 rounded-2xl border-2 border-dashed border-white/20 flex flex-col items-center justify-center gap-2">
            <span className="text-3xl animate-pulse">⏳</span>
            <span className="text-[10px] text-white/50 text-center px-2">Aguardando oponente...</span>
          </div>
        </div>
      )
    }
    return (
      <div className="relative">
        <FighterFigure
          fighter={fighter}
          side={side}
          isTurn={currentTurnId === fighter.id && !combatEnded}
          isWinner={!!combatEnded && winnerId === fighter.id}
          isDefeated={(!!combatEnded && !!winnerId && winnerId !== fighter.id) || fighter.hp <= 0}
          lunging={lungingSide === side}
          shaking={shakingSide === side}
          dodging={dodgingSide === side}
          defending={defendingSide === side}
          diceResult={miniDieFor(fighter, side)}
        />

        {/* Efeito de corte */}
        <AnimatePresence>
          {slashSide === side && (
            <motion.div
              initial={{ opacity: 0, scale: 0.4, rotate: -25 }}
              animate={{ opacity: 1, scale: 1.3, rotate: 15 }}
              exit={{ opacity: 0, scale: 1.6 }}
              transition={{ duration: 0.3 }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none z-20"
            >
              <span className="text-6xl drop-shadow-[0_0_12px_rgba(255,200,0,0.9)]">💥</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Textos flutuantes (dano, cura, esquiva) */}
        <div className="absolute inset-x-0 top-10 flex flex-col items-center pointer-events-none z-30">
          <AnimatePresence>
            {floatingTexts.filter(ft => ft.side === side).map(ft => (
              <motion.span
                key={ft.key}
                initial={{ y: 20, opacity: 0, scale: 0.6 }}
                animate={{ y: -50, opacity: 1, scale: ft.big ? 1.35 : 1 }}
                exit={{ y: -80, opacity: 0 }}
                transition={{ duration: 1.2, ease: 'easeOut' }}
                className={`font-black drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] ${ft.color} ${ft.big ? 'text-2xl sm:text-3xl' : 'text-lg sm:text-xl'}`}
                style={{ position: 'absolute' }}
              >
                {ft.text}
              </motion.span>
            ))}
          </AnimatePresence>
        </div>
      </div>
    )
  }

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* Cenário de fundo (customizável via backdrop) */}
      {backdrop ?? (
        <>
          <div className="absolute inset-0 bg-gradient-to-b from-indigo-950 via-purple-950/80 to-slate-900" />
          <div className="absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-emerald-950/90 to-transparent" />
          {/* Lua / estrelas decorativas */}
          <div className="absolute top-4 right-8 w-10 h-10 rounded-full bg-amber-100/80 blur-[2px] shadow-[0_0_30px_rgba(255,240,200,0.5)]" />
          <div className="absolute top-8 left-12 text-white/30 text-xs">✦</div>
          <div className="absolute top-16 left-1/3 text-white/20 text-[10px]">✦</div>
          <div className="absolute top-6 right-1/3 text-white/25 text-xs">✦</div>
        </>
      )}

      {/* Lutadores */}
      <div className="relative h-full flex items-end justify-between px-2 sm:px-8 pb-6 pt-2 gap-2">
        {renderFighter(left, 'left')}

        {/* Centro: VS / banner de vitória / prompt de dado */}
        <div className="flex-1 flex flex-col items-center justify-center self-center gap-3 min-w-0">
          {combatEnded && winnerId ? (
            <motion.div
              initial={{ scale: 0, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 12 }}
              className="text-center bg-black/70 border-2 border-yellow-400 rounded-2xl px-4 py-3 shadow-2xl shadow-yellow-500/30"
            >
              <div className="text-3xl mb-1">🏆</div>
              <div className="text-yellow-300 font-black text-sm sm:text-lg">
                {sideOf(winnerId) === 'left' ? left?.name : right?.name} venceu!
              </div>
            </motion.div>
          ) : dicePanel?.visible ? (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="text-center bg-black/70 border border-white/20 rounded-2xl px-4 py-2.5 backdrop-blur-sm"
            >
              <div className="text-[11px] sm:text-xs text-white/80 mb-1 font-bold">{dicePanel.label}</div>
              <div className="flex justify-center">
                <AnimatedDie
                  sides={dicePanel.diceType}
                  size={88}
                  mode={dicePanel.hasRolled ? 'rolling' : 'idle'}
                  result={dicePanel.myResult || null}
                  onClick={dicePanel.onRoll}
                />
              </div>
              {dicePanel.hasRolled && dicePanel.myResult && dicePanel.waitingForOpponent && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.2 }}
                  className="text-green-400 text-[10px] font-bold"
                >
                  ⏳ Aguardando oponente rolar...
                </motion.div>
              )}
            </motion.div>
          ) : (
            <div className="text-2xl sm:text-4xl font-black text-white/20 select-none">VS</div>
          )}
        </div>

        {renderFighter(right, 'right')}
      </div>
    </div>
  )
}
