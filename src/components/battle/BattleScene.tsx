'use client'

import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import ItemIcon from '@/components/ItemIcon'
import { AnimatedDie } from '@/components/battle/AnimatedDice'
import { getTransformationGlow } from '@/lib/transformationSystem'
import { applyEnhancementToStats, getLevelLabel } from '@/lib/enhancementSystem'
import { formatItemStats } from '@/lib/itemStats'
import { resolveImageUrl } from '@/lib/imageUrl'
import { itemImagePath } from '@/lib/itemCatalog'
import {
  resolveActionFx, ImpactFX, AuraFX, DodgeFX, CritFX,
  IMPACT_MS, AURA_MS, type ImpactKind, type AuraKind,
} from '@/components/battle/AbilityFX'

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
  /** Stats de combate exibidos no card (AD/AP/DP). Os *Delta são o bônus já
   *  somado pela transformação (0/ausente quando não transformado). */
  combatStats?: {
    ad: number
    ap?: number
    dp?: number
    adDelta?: number
    apDelta?: number
    dpDelta?: number
  }
  /** Rótulos por-lutador dos 3 pills (default PWR/ARM/HP do PvP). Ex.: dungeon usa ATK/DEF/STR. */
  combatStatLabels?: { ad: string; ap?: string; dp?: string }
}

export interface BattleEvent {
  id: number
  /** resolve = golpe; buff = habilidade utilitária no próprio; status = veneno/sangramento/stun aplicado. */
  kind: 'resolve' | 'item' | 'transform' | 'buff' | 'status'
  attackerId?: string
  defenderId?: string
  /** id da habilidade (dragon_breath, wild_fury...) ou basic/weapon/special — decide a animação. */
  action?: string
  defenseAction?: string
  hit?: boolean
  damage?: number
  isCritical?: boolean
  // Para kind === 'item' | 'transform' | 'buff' | 'status'
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
  /** Mostra 2 dados lado a lado (eu × oponente) em vez de 1 dado + mini-dado — ex.: iniciativa */
  dual?: boolean
  /** Resultado do oponente, usado só quando dual=true */
  opponentResult?: DiceResult | null
  /** Texto exibido quando os 2 dados (dual) revelarem — ex.: "Fulano venceu a iniciativa!" */
  resultBanner?: string | null
}

interface BattleSceneProps {
  left: FighterView | null
  right: FighterView | null
  currentTurnId?: string | null
  winnerId?: string | null
  combatEnded?: boolean
  event?: BattleEvent | null
  dicePanel?: DicePanelInfo | null
  className?: string
  /** Cenário customizado (ex.: fundo temático de masmorra). Substitui o céu noturno
   *  padrão. Passe `null` para não pintar fundo (herda o backdrop full-screen do pai). */
  backdrop?: React.ReactNode | null
  /** PACOTE de inimigos no lado direito (ex.: masmorra com 2-3 monstros). Quando
   *  presente, renderiza todos lado a lado (cada um anima sozinho) em vez do `right`
   *  único. O ATIVO deve ter o mesmo id que `right` (recebe dados/eventos de combate). */
  rightGroup?: FighterView[]
  /** Esconde as barras de HP/MP/stamina dos inimigos (o HP vive no roster de alvo,
   *  fora da arena — evita exibir 2x). O lado esquerdo (jogador) mantém as barras. */
  hideEnemyBars?: boolean
  /** Inimigo único em modo enxuto (monstro do PvE): sem placa de nome/MP/stamina/pills —
   *  só a barra de HP acima do card + nome dentro do card. O jogador mantém o card cheio. */
  enemyHpOnly?: boolean
  /** Id do inimigo em DESTAQUE na cascata (frente + iluminado): o alvo do jogador na
   *  vez dele, ou o atacante atual na vez dos inimigos. Default = right.id. */
  focusEnemyId?: string | null
  /** Clareia via CSS as imagens do lado inimigo (artes de monstro escuras). */
  brightenEnemyImage?: boolean
}

interface FloatingText {
  key: number
  fighterId: string
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

function StatBar({
  value,
  max,
  gradient,
  icon,
  showValue = true,
  size = 'sm',
}: {
  value: number
  max: number
  gradient: string
  icon: string
  /** Quando false, omite o texto value/max e a barra ocupa o espaço — útil no mobile. */
  showValue?: boolean
  size?: 'sm' | 'lg'
}) {
  const pct = Math.max(0, Math.min(100, max > 0 ? (value / max) * 100 : 0))
  const barH = size === 'lg' ? 'h-3' : 'h-2.5'
  return (
    <div className="flex items-center gap-1 w-full">
      <span className={`${size === 'lg' ? 'text-xs' : 'text-[10px]'} w-4 text-center flex-shrink-0`}>{icon}</span>
      <div className={`flex-1 ${barH} bg-black/50 rounded-full overflow-hidden border border-white/10`}>
        <motion.div
          className={`h-full rounded-full bg-gradient-to-r ${gradient}`}
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        />
      </div>
      {showValue && (
        <span className="text-[10px] text-white/80 w-14 text-right flex-shrink-0 font-mono">
          {value}/{max}
        </span>
      )}
    </div>
  )
}

// Slot de equipamento no combate: mostra o item, badge +N e, ao passar o mouse,
// um card (via portal) com os stats já aprimorados — mesmo formato do inventário.
// `size='lg'` = tile grande em destaque (arma em punho, à frente do card).
function EquipSlot({ slot, item, size = 'sm' }: { slot: string; item: EquippedItem; size?: 'sm' | 'lg' }) {
  const isLg = size === 'lg'
  const ref = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })

  // Imagem: banco (item.image) → asset estático por nome (/items/<slug>.webp) →
  // ícone genérico só se a arte 404. Mesmo padrão de EquipmentSlot/DraggableItem,
  // para cobrir itens novos criados sem `image` no banco (ex.: colar/anel), que
  // antes caíam direto no ItemIcon (SVG) aqui no combate.
  const [imgError, setImgError] = useState(false)
  const itemImage = !imgError
    ? (resolveImageUrl(item.image) ?? (item.name ? itemImagePath(item.name) : null))
    : null

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

  // Touch: tap alterna o card (não há hover no celular); tap fora fecha.
  useEffect(() => {
    if (!hover) return
    const close = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setHover(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [hover])

  return (
    <div
      ref={ref}
      onMouseEnter={show}
      onMouseLeave={() => setHover(false)}
      onClick={() => (hover ? setHover(false) : show())}
      className={`relative flex items-center justify-center overflow-hidden bg-black/40 border shadow-lg hover:border-amber-400 hover:scale-110 transition-all cursor-help ${
        isLg
          ? 'w-11 h-11 sm:w-16 sm:h-16 rounded-xl border-amber-400/60'
          : 'w-9 h-9 rounded-lg border-amber-500/40 shadow-black/50'
      }`}
      style={isLg ? { boxShadow: '0 0 14px rgba(251,191,36,0.35)' } : undefined}
    >
      {itemImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={itemImage}
          alt={item.name}
          onError={() => setImgError(true)}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover"
        />
      ) : item.type ? (
        <ItemIcon type={item.type as any} size={isLg ? 30 : 18} className="text-amber-300" />
      ) : (
        <span className={isLg ? 'text-2xl' : 'text-sm'}>{SLOT_EMOJI[slot] || '❔'}</span>
      )}
      {level > 0 && (
        <span
          className={`absolute right-0 bottom-0 font-black leading-none text-amber-300 px-0.5 ${isLg ? 'text-xs' : 'text-[9px]'}`}
          style={{ textShadow: '0 1px 2px #000, 0 0 3px #000' }}
        >
          {getLevelLabel(level)}
        </span>
      )}

      {hover && typeof document !== 'undefined' && createPortal(
        <div
          className="pointer-events-none fixed z-[9999] w-[190px] rounded-lg border border-amber-500/40 bg-gray-950/95 p-2 shadow-2xl"
          style={{ top: pos.top, left: pos.left, transform: 'translateY(-100%)' }}
        >
          <div className="flex items-center gap-1 text-xs font-bold text-white">
            <span className="truncate">{item.name}</span>
            {level > 0 && <span className="flex-shrink-0 text-[10px] font-black text-amber-300">{getLevelLabel(level)}</span>}
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

function EquipmentColumn({ equipment, side, exclude = [] }: { equipment?: EquipmentMap; side: 'left' | 'right'; exclude?: string[] }) {
  return (
    <div className={`flex flex-col gap-1 ${side === 'left' ? 'items-start' : 'items-end'}`}>
      {SLOT_ORDER.map(slot => {
        if (exclude.includes(slot)) return null
        const item = equipment?.[slot]
        if (!item) return null
        return <EquipSlot key={slot} slot={slot} item={item} />
      })}
    </div>
  )
}

// Armas "em punho": arma principal + secundária (offhand). Ganham destaque À FRENTE
// do card na arena (igual ao mockup da landing) e saem da coluna lateral.
const HELD_SLOTS = ['WEAPON', 'SHIELD']

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
  fxOverlay,
  hideBars = false,
  compact = false,
  hideNamePlate = false,
  nameInCard = false,
  showHpBar = false,
  hpAbove = false,
  brightenImage = false,
  hideHpValue = false,
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
  /** FX de habilidade (impacto/aura/esquiva/crítico) ancorado no SPRITE do lutador. */
  fxOverlay?: React.ReactNode
  /** Esconde as barras de recurso (HP/MP/stamina) — usado p/ inimigos cujo HP vive no roster. */
  hideBars?: boolean
  /** Versão menor (sprite + placa) p/ caber um pacote de 2-3 lado a lado. */
  compact?: boolean
  /** Esconde a placa de cima (nome/nível/barras) — card vira só a imagem do monstro. */
  hideNamePlate?: boolean
  /** Faixa inferior do card mostra NOME • Nv.X do lutador (em vez de raça • classe). */
  nameInCard?: boolean
  /** Mostra uma barra de HP fina junto ao card (pacote da masmorra). */
  showHpBar?: boolean
  /** Posiciona a barra de HP ACIMA do card (em vez de abaixo) — usado na cascata. */
  hpAbove?: boolean
  /** Clareia a imagem via CSS (artes de monstro costumam ser escuras) — sem regenerar. */
  brightenImage?: boolean
  /** Omite o texto HP atual/máx (ex.: 55/55) e engrossa a barra — monstro no mobile. */
  hideHpValue?: boolean
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

  // Armas em punho (principal + secundária) exibidas GRANDES à frente do card.
  // Só no modo cheio — o pacote compacto de monstros não tem equipamento.
  const heldSlots = compact ? [] : HELD_SLOTS.filter(s => fighter.equipmentMap?.[s])

  return (
    <div className={`flex items-end gap-1 sm:gap-2 ${side === 'right' ? 'flex-row-reverse' : ''}`}>
      {/* Equipamentos ao lado externo do lutador — arma/secundária saem daqui e vão
          pra frente do card (oculto na versão compacta) */}
      {!compact && <EquipmentColumn equipment={fighter.equipmentMap} side={side} exclude={HELD_SLOTS} />}

      <div className={`flex flex-col items-center gap-1 ${compact ? 'w-24 sm:w-28' : 'w-32 sm:w-44'}`}>
        {/* Placa de nome + barras (oculta nos cards do pacote — viram só a imagem) */}
        {!hideNamePlate && (
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
          {!hideBars && (
            <div className="space-y-0.5">
              <StatBar
                value={fighter.hp}
                max={fighter.maxHp}
                gradient={hpBarColor(hpPct)}
                icon="❤️"
                showValue={!hideHpValue}
              />
              <StatBar value={fighter.mp} max={fighter.maxMp} gradient="from-blue-600 to-cyan-400" icon="🔮" />
              <StatBar value={fighter.stamina} max={fighter.maxStamina} gradient="from-yellow-600 to-amber-300" icon="⚡" />
            </div>
          )}

        </div>
        )}

        {/* Barra de HP ACIMA do card (cascata do pacote) — só a barra, sem números */}
        {showHpBar && hpAbove && (
          <div className="w-full px-0.5 -mb-0.5">
            <StatBar
              value={fighter.hp}
              max={fighter.maxHp}
              gradient={hpBarColor(hpPct)}
              icon="❤️"
              showValue={false}
            />
          </div>
        )}

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
            className={`relative ${compact ? 'w-24 h-32 sm:w-28 sm:h-40' : 'w-28 h-36 sm:w-40 sm:h-52'} rounded-2xl overflow-hidden border-2 shadow-2xl ${
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
                className={`w-full h-full object-cover ${side === 'right' ? 'scale-x-[-1]' : ''} ${brightenImage ? 'art-bright' : ''}`}
              />
            ) : (
              <div className={`w-full h-full bg-gradient-to-b from-slate-700 to-slate-900 flex flex-col items-center justify-center gap-2 ${side === 'right' ? 'scale-x-[-1]' : ''}`}>
                <span className="text-5xl sm:text-6xl">
                  {transformEmoji || fighter.avatarEmoji || CLASS_EMOJI[fighter.class?.toLowerCase()] || '🧝'}
                </span>
              </div>
            )}
            {/* Faixa inferior: nome + nível do monstro (pacote) ou raça • classe (padrão) */}
            <div className="absolute bottom-0 inset-x-0 bg-black/70 text-center py-0.5 px-1">
              {nameInCard ? (
                // Nome pode ser longo (ex.: "Aranha Gigante") — trunca SÓ o nome e
                // preserva o Nv.X, senão o nível some primeiro.
                <span className="flex items-baseline justify-center gap-1 text-[10px] font-bold">
                  <span className="truncate text-white/85">{fighter.name}</span>
                  <span className="flex-shrink-0 text-amber-300">Nv.{fighter.level}</span>
                </span>
              ) : (
                <span className="text-[10px] text-white/85 font-bold truncate block">
                  {fighter.race} • {fighter.class}
                </span>
              )}
            </div>
          </motion.div>

          {/* Sombra no chão */}
          <div className={`mx-auto mt-1 ${compact ? 'w-16 sm:w-24' : 'w-24 sm:w-32'} h-3 bg-black/50 rounded-[100%] blur-sm`} />

          {/* Armas em punho À FRENTE do card, voltadas para o oponente (lado interno).
              Ficam dentro do sprite, então acompanham a investida/tremor do golpe. */}
          {heldSlots.length > 0 && (
            <div
              className={`absolute top-1/2 -translate-y-1/2 z-20 flex flex-col gap-1.5 ${
                side === 'left' ? 'left-full ml-1 items-start' : 'right-full mr-1 items-end'
              }`}
            >
              {heldSlots.map(slot => (
                <EquipSlot key={slot} slot={slot} item={fighter.equipmentMap![slot]!} size="lg" />
              ))}
            </div>
          )}

          {/* FX de habilidade sobre o corpo do lutador (acompanha o shake do card) */}
          {fxOverlay}
        </motion.div>

        {/* Barra de HP ABAIXO do card (quando não for a cascata) — só a barra, sem números */}
        {showHpBar && !hpAbove && (
          <div className="w-full mt-0.5">
            <StatBar
              value={fighter.hp}
              max={fighter.maxHp}
              gradient={hpBarColor(hpPct)}
              icon="❤️"
              showValue={false}
            />
          </div>
        )}
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
  dicePanel,
  className = '',
  backdrop,
  rightGroup,
  hideEnemyBars = false,
  enemyHpOnly = false,
  focusEnemyId,
  brightenEnemyImage = false,
}: BattleSceneProps) {
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([])
  // Animações são por-ID (não por-lado): num pacote, só o monstro alvo sacode/avança,
  // os outros ficam parados. Em PvP (left/right) o id do lutador equivale ao lado.
  const [lungingId, setLungingId] = useState<string | null>(null)
  const [shakingId, setShakingId] = useState<string | null>(null)
  const [dodgingId, setDodgingId] = useState<string | null>(null)
  const [defendingId, setDefendingId] = useState<string | null>(null)
  // FX por habilidade: impacto no defensor / aura no conjurador (key = remonta a animação)
  const [impactFx, setImpactFx] = useState<{ id: string; kind: ImpactKind; key: number } | null>(null)
  const [auraFx, setAuraFx] = useState<{ id: string; kind: AuraKind; color?: string; key: number } | null>(null)
  const [critId, setCritId] = useState<string | null>(null)
  const [dodgeFxId, setDodgeFxId] = useState<string | null>(null)
  const fxKey = useRef(0)
  const textKey = useRef(0)
  const lastEventId = useRef(0)
  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([])

  // Lado de cada combatente: esquerda = jogador; direita = `right` e todos do pacote.
  const sideOf = (id?: string | null): 'left' | 'right' | null => {
    if (!id) return null
    if (left?.id === id) return 'left'
    if (right?.id === id) return 'right'
    if (rightGroup?.some(f => f.id === id)) return 'right'
    return null
  }

  const pushText = (fighterId: string, text: string, color: string, big = false) => {
    textKey.current += 1
    const key = textKey.current
    setFloatingTexts(prev => [...prev, { key, fighterId, text, color, big }])
    const t = setTimeout(() => {
      setFloatingTexts(prev => prev.filter(ft => ft.key !== key))
    }, 1500)
    timeouts.current.push(t)
  }

  const later = (fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms)
    timeouts.current.push(t)
  }

  const fighterById = (id?: string | null): FighterView | null => {
    if (!id) return null
    if (left?.id === id) return left
    if (right?.id === id) return right
    return rightGroup?.find(f => f.id === id) ?? null
  }

  // Mostra uma AURA (buff/status/transformação) no card do próprio lutador.
  const showAura = (id: string, kind: AuraKind, color?: string) => {
    fxKey.current += 1
    const key = fxKey.current
    setAuraFx({ id, kind, color, key })
    later(() => setAuraFx(prev => (prev?.key === key ? null : prev)), AURA_MS[kind])
  }

  // Coreografia dos eventos de batalha
  useEffect(() => {
    if (!event) return
    if (event.id === lastEventId.current) {
      // Dois pushBattleEvent com o mesmo id = 2º nunca anima. Não devia acontecer
      // (contador monotônico), mas se acontecer isso explica um "dano sem efeito".
      console.warn('[BattleScene] evento repetido descartado (id duplicado)', event)
      return
    }
    lastEventId.current = event.id

    if (event.kind === 'resolve') {
      const atkId = event.attackerId
      const defId = event.defenderId
      if (!atkId || !defId || !sideOf(atkId) || !sideOf(defId)) {
        // Descarte silencioso de um golpe: id do atacante/defensor não bate com
        // nenhum lutador conhecido no momento (identidade dessincronizada — mesma
        // classe de bug do boss trocado pelo guardião anterior, commit 57e6b1c).
        console.warn('[BattleScene] evento "resolve" descartado — id não reconhecido', {
          atkId, defId, sideOfAtk: sideOf(atkId), sideOfDef: sideOf(defId),
          leftId: left?.id, rightId: right?.id, rightGroupIds: rightGroup?.map(f => f.id),
        })
        return
      }

      // FX da habilidade: impacto no defensor OU aura no conjurador (buff de forma no PvP
      // chega como resolve com dano 0 — vira aura, sem investida nem "ESQUIVOU!").
      const fx = resolveActionFx(event.action, fighterById(atkId)?.class)
      if ('aura' in fx) {
        showAura(atkId, fx.aura)
        return
      }

      // 1. Investida do atacante
      setLungingId(atkId)
      later(() => setLungingId(null), 550)

      // 2. Impacto (no meio da investida)
      later(() => {
        if (event.hit) {
          fxKey.current += 1
          const key = fxKey.current
          setImpactFx({ id: defId, kind: fx.impact, key })
          later(() => setImpactFx(prev => (prev?.key === key ? null : prev)), IMPACT_MS[fx.impact])
          setShakingId(defId)
          later(() => setShakingId(null), 450)

          if (event.defenseAction === 'defend') {
            setDefendingId(defId)
            later(() => setDefendingId(null), 700)
          }

          if (event.isCritical) {
            setCritId(defId)
            later(() => setCritId(null), 800)
            pushText(defId, 'CRÍTICO!', 'text-yellow-300', true)
            later(() => pushText(defId, `-${event.damage}`, 'text-yellow-300', true), 150)
          } else {
            pushText(defId, `-${event.damage}`, 'text-red-400', (event.damage || 0) > 30)
          }
        } else {
          // Esquiva bem-sucedida: deslize + linhas de velocidade
          setDodgingId(defId)
          later(() => setDodgingId(null), 500)
          setDodgeFxId(defId)
          later(() => setDodgeFxId(null), 600)
          pushText(defId, 'ESQUIVOU!', 'text-cyan-300', true)
        }
      }, 280)
    } else if (event.kind === 'item') {
      const id = event.actorId
      if (!id || !sideOf(id)) {
        console.warn('[BattleScene] evento "item" descartado — id não reconhecido', { id, event })
        return
      }
      if (event.hpRestored) showAura(id, 'heal')
      if (event.hpRestored) pushText(id, `+${event.hpRestored} HP`, 'text-green-400', true)
      if (event.mpRestored) later(() => pushText(id, `+${event.mpRestored} MP`, 'text-blue-400'), 200)
      if (event.staminaRestored) later(() => pushText(id, `+${event.staminaRestored} ⚡`, 'text-yellow-300'), 400)
    } else if (event.kind === 'transform') {
      const id = event.actorId
      if (!id || !sideOf(id)) {
        console.warn('[BattleScene] evento "transform" descartado — id não reconhecido', { id, event })
        return
      }
      const glow = getTransformationGlow(fighterById(id)?.transformationType)
      showAura(id, 'transform', glow.hex)
      pushText(id, 'TRANSFORMAÇÃO!', 'text-purple-300', true)
    } else if (event.kind === 'buff') {
      // Habilidade utilitária usada no PvE (o PvP manda como 'resolve' com o id da habilidade)
      const id = event.actorId
      if (!id || !sideOf(id)) {
        console.warn('[BattleScene] evento "buff" descartado — id não reconhecido', { id, event })
        return
      }
      const fx = resolveActionFx(event.action, fighterById(id)?.class)
      showAura(id, 'aura' in fx ? fx.aura : 'focus')
    } else if (event.kind === 'status') {
      // Status aplicado no lutador (veneno/sangramento/stun dos golpes de monstro)
      const id = event.actorId
      const kind = event.action as AuraKind
      if (!id || !sideOf(id) || !['poison', 'bleed', 'stun'].includes(kind)) {
        console.warn('[BattleScene] evento "status" descartado — id/kind não reconhecido', { id, kind, event })
        return
      }
      showAura(id, kind)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id])

  // Limpar timeouts ao desmontar
  useEffect(() => () => { timeouts.current.forEach(clearTimeout) }, [])

  // Enquanto o dado grande do centro gira para o jogador local (lado esquerdo),
  const renderFighter = (
    fighter: FighterView | null,
    side: 'left' | 'right',
    opts: {
      hideBars?: boolean
      compact?: boolean
      hideNamePlate?: boolean
      nameInCard?: boolean
      showHpBar?: boolean
      hpAbove?: boolean
      brightenImage?: boolean
      hideHpValue?: boolean
    } = {},
  ) => {
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
    // FX por habilidade ancorados no sprite: impacto / aura de buff / esquiva / crítico
    const fxOverlay = (
      <>
        {impactFx?.id === fighter.id && <ImpactFX key={`imp-${impactFx.key}`} kind={impactFx.kind} side={side} />}
        {auraFx?.id === fighter.id && <AuraFX key={`aura-${auraFx.key}`} kind={auraFx.kind} color={auraFx.color} />}
        {dodgeFxId === fighter.id && <DodgeFX side={side} />}
        {critId === fighter.id && <CritFX />}
      </>
    )

    return (
      <div className="relative" key={fighter.id}>
        <FighterFigure
          fighter={fighter}
          side={side}
          isTurn={currentTurnId === fighter.id && !combatEnded}
          isWinner={!!combatEnded && winnerId === fighter.id}
          isDefeated={(!!combatEnded && !!winnerId && winnerId !== fighter.id) || fighter.hp <= 0}
          lunging={lungingId === fighter.id}
          shaking={shakingId === fighter.id}
          dodging={dodgingId === fighter.id}
          defending={defendingId === fighter.id}
          fxOverlay={fxOverlay}
          hideBars={opts.hideBars}
          compact={opts.compact}
          hideNamePlate={opts.hideNamePlate}
          nameInCard={opts.nameInCard}
          showHpBar={opts.showHpBar}
          hpAbove={opts.hpAbove}
          brightenImage={opts.brightenImage}
          hideHpValue={opts.hideHpValue}
        />

        {/* Textos flutuantes (dano, cura, esquiva) */}
        <div className="absolute inset-x-0 top-10 flex flex-col items-center pointer-events-none z-30">
          <AnimatePresence>
            {floatingTexts.filter(ft => ft.fighterId === fighter.id).map(ft => (
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
      {/* Cenário de fundo (customizável via backdrop). `null` = transparente
          (herda o fundo full-screen do container pai, ex.: DungeonRun). */}
      {backdrop !== undefined ? backdrop : (
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

      {/* Lutadores — no celular (retrato) a arena é alta, então o combate fica
          CENTRALIZADO na vertical (embaixo ele encostava no rodapé); no desktop
          mantém o pé no "chão" (items-end). */}
      <div className="relative h-full flex items-center sm:items-end justify-between px-2 sm:px-8 pb-2 sm:pb-6 pt-2 gap-2">
        {renderFighter(left, 'left')}

        {/* Centro: VS / banner de vitória / prompt de dado — z acima dos cards dos
            lutadores (que chegam a ter zIndex 10+ no pacote), senão no mobile o dado
            de iniciativa fica atrás do card do monstro quando o centro estoura a largura. */}
        <div className="relative z-40 flex-1 flex flex-col items-center justify-center self-center gap-3 min-w-0">
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
              {dicePanel.dual ? (
                <>
                  <div className="flex items-center justify-center gap-3 sm:gap-5">
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-[9px] text-white/50 font-bold uppercase truncate max-w-[72px]">{left?.name || 'Você'}</span>
                      <AnimatedDie sides={dicePanel.diceType} size={64} mode="rolling" result={dicePanel.myResult || null} />
                    </div>
                    <span className="text-white/30 font-black text-base sm:text-lg">×</span>
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-[9px] text-white/50 font-bold uppercase truncate max-w-[72px]">{right?.name || 'Oponente'}</span>
                      <AnimatedDie sides={dicePanel.diceType} size={64} mode="rolling" result={dicePanel.opponentResult || null} />
                    </div>
                  </div>
                  <AnimatePresence>
                    {dicePanel.resultBanner && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.8, y: -4 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        className="mt-1.5 text-yellow-300 text-xs font-black"
                      >
                        🏆 {dicePanel.resultBanner}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              ) : (
                <>
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
                </>
              )}
            </motion.div>
          ) : (
            <div className="text-2xl sm:text-4xl font-black text-white/20 select-none">VS</div>
          )}
        </div>

        {rightGroup && rightGroup.length > 0 ? (() => {
          // Pacote em CASCATA sobreposta e COMPACTA (centralizada, p/ não estourar a tela
          // em fullscreen). Mais FORTE ao centro (vertical); mais FRACO mais à FRENTE
          // (z maior); o FOCADO (alvo do jogador / atacante atual) vem à frente + iluminado.
          const byStrength = [...rightGroup].sort((a, b) => (b.level - a.level) || (b.maxHp - a.maxHp))
          // Ordem VERTICAL: mais forte no meio (n=3 → [2º, 1º, 3º]); n≤2 mantém ordem.
          const arranged = rightGroup.length === 3
            ? [byStrength[1], byStrength[0], byStrength[2]]
            : rightGroup
          const focus = focusEnemyId ?? right?.id
          return (
            <div className="relative flex flex-col items-end justify-center self-center pr-2 sm:pr-4">
              {arranged.map((f, i) => {
                const focused = f.id === focus
                return (
                  <div
                    key={f.id}
                    className={`relative transition-[filter] duration-300 ${i === 0 ? '' : '-mt-14 sm:-mt-20'}`}
                    style={{
                      transform: `translateX(${i % 2 === 0 ? -4 : 16}px)`,
                      // Cascata ESTRITA: z só pela posição (topo atrás, base à frente). NÃO
                      // trazemos o focado pra frente — senão ele cobriria o HP do vizinho.
                      // O foco é marcado só pelo BRILHO (os outros ficam escurecidos).
                      zIndex: 10 + i,
                      filter: focused ? 'none' : 'brightness(0.85) saturate(0.95)',
                    }}
                  >
                    {renderFighter(f, 'right', {
                      hideBars: hideEnemyBars,
                      compact: true,
                      hideNamePlate: true,
                      nameInCard: true,
                      showHpBar: true,
                      hpAbove: true,
                      brightenImage: brightenEnemyImage,
                    })}
                  </div>
                )
              })}
            </div>
          )
        })() : (
          renderFighter(right, 'right', enemyHpOnly
            // PvE monstro: HP só na barra (sem número). PvP: card simétrico com HP 12/80 etc.
            ? { hideNamePlate: true, nameInCard: true, showHpBar: true, hpAbove: true, brightenImage: brightenEnemyImage }
            : { hideBars: hideEnemyBars, brightenImage: brightenEnemyImage })
        )}
      </div>
    </div>
  )
}
