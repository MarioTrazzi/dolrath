'use client'

// ⛏️ MAPA DO REINO — camada PRESENTACIONAL da Coleta (pergaminho medieval).
// Porte do design "Mapa do Reino": cada região é um nó; o painel-pergaminho
// envia heróis, acompanha o ciclo e coleta/encerra. Sem fetch/DB — recebe
// estado e callbacks por props. A página /gathering injeta os dados reais das
// rotas /api/gather/*; o mock /dev/gathering-map-mock injeta estado simulado
// (mesmo espírito de GatheringPanel + /dev/gathering-mock).

import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ArrowRight } from 'lucide-react'
import { GatherItemThumb } from '@/components/gathering/GatheringPanel'
import { GATHER_FIELDS, GATHER_TICK_SECONDS, GATHER_TICK_STAMINA, type GatherFieldId, type PendingYield } from '@/lib/gathering'
import { getProfessionLevelInfo, type ProfessionLevelInfo } from '@/lib/professionSystem'
import { getDisplayName } from '@/lib/enhancementSystem'

// ============================================================
// Tipos compartilhados
// ============================================================

export interface GatherCharacter {
  id: string
  name: string
  level: number
  isAlive?: boolean
  stamina: number
  maxStamina: number
  gatherXp: number
}

export interface OpenSession {
  characterId: string
  fieldId: string
  status: 'active' | 'exhausted'
  startedAt: string
  inventoryFull: boolean
}

export interface GatherGearPieceInfo {
  name: string
  enhancementLevel: number
  /** Bônus efetivo de rendimento (já com o +N), ex.: 0.18 = +18%. */
  yieldBonus: number
  durability: number
  maxDurability: number
  broken: boolean
}

export interface StatusPayload {
  session: {
    id: string
    fieldId: GatherFieldId
    status: 'active' | 'exhausted'
    startedAt: string
    stopRequested?: boolean
  } | null
  pending?: PendingYield
  stamina: number
  maxStamina: number
  /** Ferramenta/traje de coleta equipados p/ o campo da sessão. */
  gear?: { mult: number; tool?: GatherGearPieceInfo; garb?: GatherGearPieceInfo }
  secondsToNextTick?: number
  inventoryFull?: boolean
  gather: ProfessionLevelInfo
  autoStopped?: { deposited: { name: string; qty: number }[]; skipped: { name: string; qty: number }[]; xpGained: number }
}

/** Nó do mapa: posição/paleta/sabor do design + dados reais do campo. */
interface MapNode {
  key: string
  fieldId?: GatherFieldId // ausente = decorativo ("em breve")
  name: string
  emoji: string
  recurso: string
  tagline: string
  sabor: string
  x: number
  y: number
  acc: string
  accSoft: string
  /** Trava estática dos nós decorativos ("em breve"); campos jogáveis travam por unlockLevel. */
  locked: boolean
  soon?: boolean
  /** Nível de Coleta que destrava o campo (GATHER_FIELDS.minGatherLevel; ausente = aberto). */
  unlockLevel?: number
  drops?: { name: string; minLevel?: number }[]
  seedField?: boolean
}

/** Campo travado para a CONTA (nenhum herói alcança o nível). */
const levelLockedFor = (node: MapNode, maxGatherLevel: number) =>
  (node.unlockLevel ?? 1) > maxGatherLevel

const HOME = { x: 50, y: 90 }

// Merge: coordenadas/paleta do "Mapa do Reino" + nome/emoji/drops reais.
export const MAP_NODES: MapNode[] = [
  {
    key: 'ervas', fieldId: 'ervas',
    name: GATHER_FIELDS.ervas.name, emoji: GATHER_FIELDS.ervas.emoji,
    recurso: 'Ervas & Sementes', tagline: GATHER_FIELDS.ervas.tagline,
    sabor: 'Campinas abertas ao sol; o cheiro de hortelã paira no vento — e só aqui nascem sementes.',
    x: 25, y: 71, acc: '#7f9d3a', accSoft: 'rgba(127,157,58,0.45)', locked: false,
    drops: GATHER_FIELDS.ervas.drops, seedField: true,
  },
  {
    key: 'minerios', fieldId: 'minerios',
    name: GATHER_FIELDS.minerios.name, emoji: GATHER_FIELDS.minerios.emoji,
    recurso: 'Minério & Pedra', tagline: GATHER_FIELDS.minerios.tagline,
    sabor: 'Encostas rachadas expõem veios metálicos que reluzem na penumbra.',
    x: 74, y: 63, acc: '#b5793a', accSoft: 'rgba(181,121,58,0.45)', locked: false,
    unlockLevel: GATHER_FIELDS.minerios.minGatherLevel,
    drops: GATHER_FIELDS.minerios.drops,
  },
  {
    key: 'bosque', fieldId: 'bosque',
    name: GATHER_FIELDS.bosque.name, emoji: GATHER_FIELDS.bosque.emoji,
    recurso: 'Madeira & Seiva', tagline: GATHER_FIELDS.bosque.tagline,
    sabor: 'Árvores milenares sussurram; a luz mal atravessa a copa cerrada.',
    x: 35, y: 43, acc: '#3f8452', accSoft: 'rgba(63,132,82,0.45)', locked: false,
    unlockLevel: GATHER_FIELDS.bosque.minGatherLevel,
    drops: GATHER_FIELDS.bosque.drops,
  },
  {
    key: 'costa', fieldId: 'costa',
    name: GATHER_FIELDS.costa.name, emoji: GATHER_FIELDS.costa.emoji,
    recurso: 'Peixe & Frutos do Mar', tagline: GATHER_FIELDS.costa.tagline,
    sabor: 'Falésias varridas pelo vento salgado; a maré baixa desenha poças cheias de vida. Exige uma Vara de Pesca equipada.',
    x: 12, y: 56, acc: '#3a7ea6', accSoft: 'rgba(58,126,166,0.45)', locked: false,
    unlockLevel: GATHER_FIELDS.costa.minGatherLevel,
    drops: GATHER_FIELDS.costa.drops,
  },
  {
    key: 'caca', fieldId: 'caca',
    name: GATHER_FIELDS.caca.name, emoji: GATHER_FIELDS.caca.emoji,
    recurso: 'Carne & Couro', tagline: GATHER_FIELDS.caca.tagline,
    sabor: 'Rastros frescos cruzam a orla da mata — carne e couro sem tocar no gado. Exige uma Faca de Caça equipada.',
    x: 18, y: 27, acc: '#8f6b4a', accSoft: 'rgba(143,107,74,0.45)', locked: false,
    unlockLevel: GATHER_FIELDS.caca.minGatherLevel,
    drops: GATHER_FIELDS.caca.drops,
  },
  {
    key: 'pantano',
    name: 'Pântano das Brumas', emoji: '🌫️',
    recurso: 'Ingredientes raros', tagline: 'Reagentes alquímicos raros — em breve.',
    sabor: 'Névoa densa esconde ingredientes raros. A trilha até lá ainda não foi aberta.',
    x: 73, y: 36, acc: '#4a8a86', accSoft: 'rgba(74,138,134,0.45)', locked: true, soon: true,
  },
  {
    key: 'ermo',
    name: 'Ermo Vulcânico', emoji: '🌋',
    recurso: 'Reagentes lendários', tagline: 'Reagentes lendários — em breve.',
    sabor: 'Rios de lava guardam reagentes de poções lendárias. Expedição ainda impossível.',
    x: 49, y: 15, acc: '#c0492f', accSoft: 'rgba(192,73,47,0.45)', locked: true, soon: true,
  },
]
const NODE_BY_KEY = Object.fromEntries(MAP_NODES.map((n) => [n.key, n]))

const ROADS: [string, string][] = [
  ['home', 'ervas'], ['home', 'minerios'],
  ['ervas', 'bosque'], ['minerios', 'pantano'],
  ['bosque', 'ermo'], ['bosque', 'pantano'],
  ['ervas', 'costa'], ['bosque', 'caca'],
]
const ptFor = (id: string) => (id === 'home' ? HOME : NODE_BY_KEY[id])

const gatherLevelOf = (xp: number) => getProfessionLevelInfo(xp ?? 0).level

function fmtDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}`
  if (m > 0) return `${m}m${String(sec).padStart(2, '0')}`
  return `${sec}s`
}

// ============================================================
// Peças decorativas do pergaminho
// ============================================================

function Portrait({ size = 40, tone = '#4a3418', busy = false, className = '' }: {
  size?: number; tone?: string; busy?: boolean; className?: string
}) {
  return (
    <span
      className={`relative inline-grid place-items-center rounded-full overflow-hidden shrink-0 ${className}`}
      style={{
        width: size, height: size,
        background: 'radial-gradient(circle at 40% 32%, #f0e2bd, #cdb888 78%)',
        border: `2px solid ${busy ? tone : 'rgba(74,52,24,0.55)'}`,
        boxShadow: busy ? `0 0 8px ${tone}66, inset 0 0 6px rgba(94,64,26,0.4)` : 'inset 0 0 6px rgba(94,64,26,0.4)',
      }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" width={size * 0.72} height={size * 0.72}>
        <circle cx="12" cy="8.5" r="4" fill="rgba(74,52,24,0.55)" />
        <path d="M4.5 20.5c0-4.2 3.4-6.5 7.5-6.5s7.5 2.3 7.5 6.5z" fill="rgba(74,52,24,0.55)" />
      </svg>
    </span>
  )
}

function Compass({ size = 54 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className="opacity-70" aria-hidden="true">
      <circle cx="50" cy="50" r="30" fill="none" stroke="#5b4327" strokeWidth="1.5" />
      <circle cx="50" cy="50" r="38" fill="none" stroke="#5b4327" strokeWidth="0.8" strokeDasharray="2 3" />
      <polygon points="50,10 56,50 50,54 44,50" fill="#7a2f26" stroke="#4a3418" strokeWidth="0.6" />
      <polygon points="50,90 44,50 50,46 56,50" fill="#4a3418" />
      <polygon points="50,50 90,50 50,56" fill="#5b4327" opacity="0.5" />
      <polygon points="50,50 10,50 50,44" fill="#5b4327" opacity="0.5" />
      <text x="50" y="8" textAnchor="middle" className="font-map" fill="#4a3418" fontSize="9" fontWeight="700">N</text>
    </svg>
  )
}

function Roads({ activeKeys }: { activeKeys: string[] }) {
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100"
      preserveAspectRatio="none" aria-hidden="true">
      {ROADS.map(([a, b], i) => {
        const p1 = ptFor(a), p2 = ptFor(b)
        if (!p1 || !p2) return null
        const mx = (p1.x + p2.x) / 2 + (i % 2 ? 5 : -5)
        const my = (p1.y + p2.y) / 2
        const d = `M ${p1.x} ${p1.y} Q ${mx} ${my} ${p2.x} ${p2.y}`
        const lit = activeKeys.includes(a) || activeKeys.includes(b)
        return (
          <path key={i} d={d} fill="none"
            stroke={lit ? 'rgba(122,47,38,0.75)' : 'rgba(74,52,24,0.5)'}
            strokeWidth="1.6" strokeDasharray="0.4 2.4" strokeLinecap="round"
            vectorEffect="non-scaling-stroke" />
        )
      })}
    </svg>
  )
}

function ProgressRing({ progress, color, size }: { progress: number; color: string; size: number }) {
  const r = size / 2 - 2
  const c = 2 * Math.PI * r
  return (
    <svg className="absolute -rotate-90 pointer-events-none" width={size + 4} height={size + 4}
      style={{ left: -2, top: -2 }} aria-hidden="true">
      <circle cx={(size + 4) / 2} cy={(size + 4) / 2} r={r} fill="none" stroke="rgba(74,52,24,0.3)" strokeWidth="3" />
      <circle cx={(size + 4) / 2} cy={(size + 4) / 2} r={r} fill="none" stroke={color} strokeWidth="3"
        strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - progress)}
        style={{ transition: 'stroke-dashoffset 0.5s linear', filter: `drop-shadow(0 0 3px ${color})` }} />
    </svg>
  )
}

function RegionNode({ node, sessions, now, maxGatherLevel, onTap }: {
  node: MapNode; sessions: OpenSession[]; now: number; maxGatherLevel: number; onTap: (n: MapNode) => void
}) {
  const isLocked = node.locked || levelLockedFor(node, maxGatherLevel)
  const here = sessions.filter((s) => s.fieldId === node.fieldId)
  const first = here[0]
  const anyExhausted = here.some((s) => s.status === 'exhausted')
  const anyFull = here.some((s) => s.inventoryFull)
  let progress = 0
  if (first) {
    const tickMs = GATHER_TICK_SECONDS * 1000
    progress = ((now - new Date(first.startedAt).getTime()) % tickMs) / tickMs
  }
  const size = isLocked ? 54 : 58

  return (
    <button
      onClick={() => onTap(node)}
      className="absolute -translate-x-1/2 -translate-y-1/2 group"
      style={{ left: `${node.x}%`, top: `${node.y}%`, zIndex: 6, ['--acc' as string]: node.acc, ['--acc-soft' as string]: node.accSoft }}
      aria-label={node.name}
    >
      <span
        className={`relative grid place-items-center rounded-full transition-transform group-active:scale-95 ${!isLocked && here.length === 0 ? 'region-pulse' : ''}`}
        style={{
          width: size, height: size,
          background: isLocked
            ? 'radial-gradient(circle at 40% 30%, #cbb98e, #a68f61 80%)'
            : 'radial-gradient(circle at 40% 28%, #f3e6c2, #dcc493 82%)',
          border: `2.5px solid ${isLocked ? 'rgba(74,52,24,0.5)' : node.acc}`,
          filter: isLocked ? 'grayscale(0.35)' : 'none',
          boxShadow: here.length
            ? '0 3px 10px rgba(0,0,0,0.35)'
            : '0 3px 8px rgba(0,0,0,0.35), inset 0 1px 2px rgba(255,255,255,0.5)',
          opacity: isLocked ? 0.92 : 1,
        }}
      >
        {first && <ProgressRing progress={progress} color={node.acc} size={size} />}
        <span className="text-[26px] leading-none" style={{ filter: isLocked ? 'grayscale(1) opacity(0.6)' : 'drop-shadow(0 1px 1px rgba(94,64,26,0.5))' }}>
          {node.emoji}
        </span>

        {isLocked && (
          <span className="absolute -bottom-1 -right-1 w-5 h-5 grid place-items-center rounded-full text-[11px]"
            style={{ background: '#4a3418', color: '#e8d7ac', boxShadow: '0 1px 3px rgba(0,0,0,0.4)' }}>🔒</span>
        )}
        {anyExhausted && (
          <span className="absolute -top-2 -right-2 w-6 h-6 grid place-items-center rounded-full text-white text-sm font-black"
            style={{ background: node.acc, boxShadow: `0 0 10px ${node.acc}`, animation: 'ready-throb 1s ease-in-out infinite' }}>!</span>
        )}
        {!anyExhausted && anyFull && (
          <span className="absolute -top-2 -right-2 w-6 h-6 grid place-items-center rounded-full text-[13px]"
            style={{ background: '#3a2f12', color: '#f3d78a', boxShadow: '0 1px 3px rgba(0,0,0,0.4)' }}>🎒</span>
        )}
        {here.length > 1 && (
          <span className="absolute -bottom-1 -left-1 px-1 h-4 min-w-4 grid place-items-center rounded-full text-[9px] font-bold"
            style={{ background: '#4a3418', color: '#e8d7ac' }}>×{here.length}</span>
        )}
      </span>

      {first && (
        <span className="absolute -top-1 -left-3" style={{ animation: 'token-bob 2.6s ease-in-out infinite' }}>
          <Portrait size={22} tone={node.acc} busy />
        </span>
      )}

      <span className="absolute left-1/2 -translate-x-1/2 top-full mt-1 whitespace-nowrap font-map font-bold text-[10.5px] tracking-wide ink text-center"
        style={{ textShadow: '0 1px 0 rgba(255,247,224,0.6)' }}>
        {node.name}
        {!node.locked && levelLockedFor(node, maxGatherLevel) && (
          <span className="block font-combat font-normal text-[9px]" style={{ color: '#7a2f26' }}>Coleta Nv.{node.unlockLevel}</span>
        )}
      </span>
    </button>
  )
}

function HomeMark() {
  return (
    <div className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center" style={{ left: `${HOME.x}%`, top: `${HOME.y}%`, zIndex: 5 }}>
      <span className="grid place-items-center rounded-full" style={{
        width: 46, height: 46,
        background: 'radial-gradient(circle at 40% 30%, #f3e6c2, #d8bf8b 82%)',
        border: '2.5px solid #7a2f26',
        boxShadow: '0 3px 8px rgba(0,0,0,0.35), inset 0 1px 2px rgba(255,255,255,0.5)',
      }}>
        <span className="text-[22px]">🏰</span>
      </span>
      <span className="mt-1 font-mapd text-[11px] ink tracking-wide" style={{ textShadow: '0 1px 0 rgba(255,247,224,0.6)' }}>Vila de Dolrath</span>
    </div>
  )
}

const MOTES = Array.from({ length: 12 }, (_, i) => {
  let s = (i + 5) * 8123 + 311
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647 }
  return { id: i, x: r() * 100, y: 10 + r() * 82, size: 2 + r() * 3, dur: 7 + r() * 6, delay: r() * 7,
    mx: `${(r() * 2 - 1) * 24}px`, my: `${-10 - r() * 30}px` }
})
function Ambient() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-[inherit]" aria-hidden="true">
      <div className="absolute -top-6 left-4 w-28 h-40 rounded-full blur-2xl" style={{ background: 'rgba(243,180,90,0.20)', animation: 'candle-flicker 3.8s ease-in-out infinite' }} />
      <div className="absolute bottom-8 right-2 w-24 h-36 rounded-full blur-2xl" style={{ background: 'rgba(243,180,90,0.16)', animation: 'candle-flicker 4.6s ease-in-out 0.7s infinite' }} />
      {MOTES.map((m) => (
        <span key={m.id} className="absolute rounded-full" style={{
          left: `${m.x}%`, top: `${m.y}%`, width: m.size, height: m.size,
          background: 'rgba(120,86,44,0.5)', ['--mx' as string]: m.mx, ['--my' as string]: m.my,
          animation: `mote-drift ${m.dur}s ease-in-out ${m.delay}s infinite`,
        }} />
      ))}
    </div>
  )
}

function DropChip({ name, seed, dim }: { name?: string; seed?: boolean; dim?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[12px] font-medium font-map"
      style={{
        background: 'rgba(94,64,26,0.10)', border: '1px solid rgba(74,52,24,0.28)',
        color: dim ? 'rgba(74,52,24,0.55)' : '#4a3418', opacity: dim ? 0.65 : 1,
      }}>
      <span className="w-4 h-4 grid place-items-center overflow-hidden rounded-sm shrink-0">
        {seed ? '🫘' : dim ? '🔒' : <GatherItemThumb name={name!} className="text-[13px]" />}
      </span>
      {seed ? 'Sementes de cultivo' : name}
    </span>
  )
}

function ParchProfessionBar({ info, acc }: { info: ProfessionLevelInfo; acc: string }) {
  return (
    <div className="w-full">
      <div className="flex items-center justify-between text-[11px] mb-1">
        <span className="font-map font-bold ink">⛏️ Coleta <span style={{ color: acc }}>Nv. {info.level}</span></span>
        <span className="ink-soft font-combat">{info.isMax ? 'MÁX' : `${info.xpIntoLevel}/${info.xpForNext} XP`}</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(74,52,24,0.18)' }}>
        <div className="h-full rounded-full" style={{ width: `${Math.round(info.progress * 100)}%`, background: `linear-gradient(90deg, ${acc}, ${acc}aa)` }} />
      </div>
    </div>
  )
}

function StopConfirm({ acc, secondsToNextTick, onNow, onAfter, onClose }: {
  acc: string; secondsToNextTick: number; onNow: () => void; onAfter: () => void; onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={onClose}>
      <div className="parchment parch-frame relative w-full max-w-xs rounded-2xl p-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-mapd text-[16px] ink mb-1">🚪 Encerrar a coleta?</h3>
        <p className="text-[12px] ink-soft leading-snug mb-3">
          Encerre agora (perde o ciclo em curso) ou espere o ciclo atual terminar — o último espólio cai sozinho
          e o herói é liberado sem gastar stamina num ciclo novo.
        </p>
        <div className="flex flex-col gap-2">
          <button onClick={() => { onAfter(); onClose() }}
            className="w-full py-2.5 rounded-xl font-map font-bold text-[13px] text-white active:scale-[0.98] transition-transform"
            style={{ background: `linear-gradient(90deg, ${acc}, ${acc}cc)` }}>
            ⏳ Aguardar último ciclo ({fmtDuration(secondsToNextTick)})
          </button>
          <button onClick={() => { onNow(); onClose() }}
            className="w-full py-2.5 rounded-xl font-map font-bold text-[13px] ink active:scale-[0.98] transition-transform"
            style={{ background: 'rgba(94,64,26,0.12)', border: '1px solid rgba(74,52,24,0.35)' }}>
            🚪 Encerrar agora
          </button>
          <button onClick={onClose} className="w-full py-2 rounded-xl font-semibold text-[13px] ink-soft">Cancelar</button>
        </div>
      </div>
    </div>
  )
}

function ActiveSessionDetail({ node, status, countdown, busy, onCollect, onStopNow, onStopAfter, onCancelStop }: {
  node: MapNode; status: StatusPayload; countdown: number; busy: boolean
  onCollect: () => void; onStopNow: () => void; onStopAfter: () => void; onCancelStop: () => void
}) {
  const [showStop, setShowStop] = useState(false)
  const acc = node.acc
  const exhausted = status.session?.status === 'exhausted'
  const paused = !!status.inventoryFull && !exhausted
  const stopRequested = !!status.session?.stopRequested
  const pending = status.pending ?? { drops: [], xp: 0, ticks: 0 }
  const totalItems = pending.drops.reduce((n, d) => n + d.qty, 0)
  const pct = exhausted || paused ? 100 : Math.round((1 - countdown / GATHER_TICK_SECONDS) * 100)

  return (
    <div className="rounded-xl px-3 py-3 mb-3" style={{ background: 'rgba(94,64,26,0.08)', border: '1px solid rgba(74,52,24,0.25)' }}>
      {paused && (
        <div className="mb-2.5 rounded-lg px-2.5 py-2 text-[11.5px] font-bold text-center ink" style={{ background: 'rgba(181,121,58,0.16)', border: '1px dashed rgba(122,47,38,0.4)' }}>
          🎒 Inventário cheio — coleta pausada, sem gastar stamina. Abra espaço para continuar.
        </div>
      )}
      {!exhausted && stopRequested && (
        <div className="mb-2.5 rounded-lg px-2.5 py-2 text-[11.5px] font-bold text-center ink" style={{ background: 'rgba(74,138,134,0.14)', border: '1px dashed rgba(74,138,134,0.5)' }}>
          ⏳ Encerrando sozinho ao fim deste ciclo ({fmtDuration(countdown)}) — sem gastar stamina num ciclo novo.
        </div>
      )}

      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="font-map font-bold text-[13px] ink">
          {exhausted ? '💤 Stamina esgotada' : paused ? 'Aguardando espaço…' : `Coletando · ${pending.ticks} tique${pending.ticks === 1 ? '' : 's'}`}
        </span>
        <span className="font-combat text-[11px]" style={{ color: exhausted ? '#7a2f26' : acc }}>
          {exhausted ? 'espólio pronto' : paused ? '🎒 pausado' : `⏳ ${fmtDuration(countdown)}`}
        </span>
      </div>

      {!exhausted && !paused && (
        <div className="relative h-2 rounded-full overflow-hidden mb-3" style={{ background: 'rgba(74,52,24,0.18)' }}>
          <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${acc}bb, ${acc})`, boxShadow: `0 0 6px ${acc}88`, transition: 'width 0.5s linear' }} />
        </div>
      )}

      <div className="rounded-lg px-2.5 py-2 mb-2.5" style={{ background: 'rgba(94,64,26,0.06)', border: '1px solid rgba(74,52,24,0.2)' }}>
        <div className="text-[10px] uppercase tracking-[0.16em] ink-soft font-bold mb-1.5">
          🎒 Espólio acumulado {totalItems > 0 ? `(${totalItems})` : ''}
        </div>
        {pending.drops.length === 0 ? (
          <p className="text-[11.5px] ink-soft italic">Nada ainda — o primeiro tique rende em até 15 min. Pode fechar a página: a coleta continua.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {pending.drops.map((d) => (
              <div key={d.name} title={d.name} className="flex items-center gap-1 rounded-md pr-1.5 overflow-hidden" style={{ background: 'rgba(74,52,24,0.1)', border: '1px solid rgba(74,52,24,0.22)' }}>
                <span className="w-7 h-7 grid place-items-center overflow-hidden"><GatherItemThumb name={d.name} /></span>
                <span className="ink font-combat text-[11px] font-bold">×{d.qty}</span>
              </div>
            ))}
          </div>
        )}
        {pending.xp > 0 && <div className="text-[10.5px] mt-1.5 font-bold" style={{ color: acc }}>+{pending.xp} XP de Coleta ao coletar</div>}
      </div>

      <div className="mb-2.5"><ParchProfessionBar info={status.gather} acc={acc} /></div>
      <div className="text-[10.5px] ink-soft mb-2.5">⚡ {status.stamina}/{status.maxStamina} de stamina · tique de 15 min custa {GATHER_TICK_STAMINA} ⚡</div>
      {(status.gear?.tool || status.gear?.garb) && (
        <div className="text-[10.5px] ink-soft mb-2.5 space-y-0.5">
          {[status.gear.tool, status.gear.garb].filter(Boolean).map((p) => (
            <div key={p!.name}>
              🛠️ {getDisplayName(p!.name, p!.enhancementLevel)} ·{' '}
              {p!.broken
                ? <span className="font-bold" style={{ color: '#7a2f26' }}>quebrada — sem bônus (repare com uma cópia)</span>
                : <>+{Math.round(p!.yieldBonus * 100)}% rendimento · durabilidade {p!.durability}/{p!.maxDurability}</>}
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={onCollect} disabled={busy || (pending.drops.length === 0 && pending.xp === 0)}
          className="flex-1 py-2.5 rounded-xl font-map font-bold text-[13px] text-white active:scale-[0.98] transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: `linear-gradient(90deg, ${acc}, ${acc}cc)`, boxShadow: `0 0 14px ${acc}55` }}>
          🎒 Coletar espólio
        </button>
        {!exhausted && stopRequested ? (
          <button onClick={onCancelStop} disabled={busy}
            className="px-3.5 py-2.5 rounded-xl font-map font-bold text-[13px] ink active:scale-[0.98] transition-transform disabled:opacity-40"
            style={{ background: 'rgba(74,138,134,0.16)', border: '1px solid rgba(74,138,134,0.5)' }}>
            ↩️ Cancelar
          </button>
        ) : (
          <button onClick={() => (exhausted ? onStopNow() : setShowStop(true))} disabled={busy}
            className="px-3.5 py-2.5 rounded-xl font-map font-bold text-[13px] ink active:scale-[0.98] transition-transform disabled:opacity-40"
            style={{ background: 'rgba(94,64,26,0.12)', border: '1px solid rgba(74,52,24,0.35)' }}>
            🚪 Encerrar
          </button>
        )}
      </div>

      {showStop && (
        <StopConfirm acc={acc} secondsToNextTick={countdown} onNow={onStopNow} onAfter={onStopAfter} onClose={() => setShowStop(false)} />
      )}
    </div>
  )
}

function RegionActiveBody({
  node, characters, sessions, expandedId, status, countdown, busy, sendHeroId,
  onExpand, onSelectSend, onDispatch, onCollect, onStopNow, onStopAfter, onCancelStop,
}: {
  node: MapNode; characters: GatherCharacter[]; sessions: OpenSession[]
  expandedId: string | null; status: StatusPayload | null; countdown: number; busy: boolean; sendHeroId: string | null
  onExpand: (characterId: string) => void; onSelectSend: (characterId: string | null) => void
  onDispatch: (fieldId: GatherFieldId, characterId: string) => void
  onCollect: () => void; onStopNow: () => void; onStopAfter: () => void; onCancelStop: () => void
}) {
  const fieldId = node.fieldId!
  const charById = useMemo(() => new Map(characters.map((c) => [c.id, c])), [characters])
  const here = sessions.filter((s) => s.fieldId === fieldId)
  const freeHeroes = characters.filter((c) => !sessions.some((s) => s.characterId === c.id))

  return (
    <>
      {here.length > 0 && (
        <div className="flex flex-col gap-2 mb-4">
          <div className="text-[10px] uppercase tracking-[0.18em] ink-soft font-bold">Em coleta ({here.length})</div>
          {here.map((s) => {
            const hero = charById.get(s.characterId)
            const expanded = expandedId === s.characterId
            const label = s.inventoryFull ? '🎒 pausada' : s.status === 'exhausted' ? 'espólio pronto' : 'coletando'
            return (
              <div key={s.characterId}>
                <button onClick={() => onExpand(expanded ? '' : s.characterId)}
                  className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left active:scale-[0.99] transition-transform"
                  style={{ background: expanded ? 'rgba(94,64,26,0.14)' : 'rgba(94,64,26,0.08)', border: `1px solid ${expanded ? node.acc : 'rgba(74,52,24,0.25)'}` }}>
                  <Portrait size={34} tone={node.acc} busy />
                  <div className="flex-1 min-w-0">
                    <div className="font-map font-bold text-[13px] ink truncate">
                      {hero?.name ?? 'Herói'} <span className="ink-soft font-normal">Nv.{hero?.level ?? '?'}</span>
                    </div>
                    <div className="text-[11px] font-combat" style={{ color: s.status === 'exhausted' ? '#7a2f26' : node.acc }}>{label}</div>
                  </div>
                  <span className="text-[11px] ink-soft">{expanded ? '▲' : '▼'}</span>
                </button>
                {expanded && status?.session && (
                  <div className="mt-2">
                    <ActiveSessionDetail
                      node={node} status={status} countdown={countdown} busy={busy}
                      onCollect={onCollect} onStopNow={onStopNow} onStopAfter={onStopAfter} onCancelStop={onCancelStop}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="text-[10px] uppercase tracking-[0.18em] ink-soft font-bold mb-2">Enviar herói</div>
      {freeHeroes.length === 0 ? (
        <p className="text-[13px] ink-soft italic px-1 py-2">Nenhum herói livre — todos estão em campo ou você ainda não criou um. Recolha um espólio para liberar alguém.</p>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {freeHeroes.map((h) => {
              const dead = h.isAlive === false
              const noStamina = h.stamina < GATHER_TICK_STAMINA
              const lowLevel = gatherLevelOf(h.gatherXp) < (node.unlockLevel ?? 1)
              const apto = !dead && !noStamina && !lowLevel
              const sel = sendHeroId === h.id
              const hint = dead ? '💀 morto'
                : lowLevel ? `🔒 Coleta Nv.${node.unlockLevel}`
                : noStamina ? '⚡ sem stamina'
                : `⛏️ Nv.${gatherLevelOf(h.gatherXp)}`
              return (
                <button key={h.id} onClick={() => apto && onSelectSend(sel ? null : h.id)} disabled={!apto}
                  className="shrink-0 w-[94px] rounded-xl px-2 py-2.5 text-center transition-all active:scale-95"
                  style={{
                    background: sel ? 'rgba(94,64,26,0.16)' : 'rgba(94,64,26,0.05)',
                    border: sel ? `2px solid ${node.acc}` : '1.5px solid rgba(74,52,24,0.25)',
                    opacity: apto ? 1 : 0.5,
                  }}>
                  <Portrait size={38} tone={node.acc} busy={sel} className="mx-auto mb-1" />
                  <div className="font-map font-bold text-[12px] ink truncate">{h.name}</div>
                  <div className="text-[10px] font-combat mt-0.5" style={{ color: apto ? '#6b4f28' : '#7a2f26' }}>{hint}</div>
                </button>
              )
            })}
          </div>
          <div className="text-[11px] ink-soft mt-1.5 mb-3 px-1">
            Cada tique de 15 min custa <b className="ink">{GATHER_TICK_STAMINA} ⚡</b> e o herói fica ocupado até você encerrar.
          </div>
          <button disabled={!sendHeroId || busy} onClick={() => sendHeroId && onDispatch(fieldId, sendHeroId)}
            className="w-full py-3.5 rounded-xl font-map font-bold text-[15px] text-white inline-flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: sendHeroId ? `linear-gradient(90deg, ${node.acc}, ${node.acc}cc)` : 'rgba(74,52,24,0.4)', boxShadow: sendHeroId ? `0 0 20px ${node.acc}66` : 'none' }}>
            <ArrowRight size={18} />
            {sendHeroId ? `Enviar ${charById.get(sendHeroId)?.name ?? 'herói'} para coletar` : 'Escolha um herói'}
          </button>
        </>
      )}
    </>
  )
}

function RegionPanel(props: {
  node: MapNode | null; characters: GatherCharacter[]; sessions: OpenSession[]; maxGatherLevel: number
  expandedId: string | null; status: StatusPayload | null; countdown: number; busy: boolean; sendHeroId: string | null
  onClose: () => void; onExpand: (characterId: string) => void; onSelectSend: (characterId: string | null) => void
  onDispatch: (fieldId: GatherFieldId, characterId: string) => void
  onCollect: () => void; onStopNow: () => void; onStopAfter: () => void; onCancelStop: () => void
}) {
  const { node, maxGatherLevel, onClose } = props
  const levelLocked = node ? !node.locked && levelLockedFor(node, maxGatherLevel) : false
  return (
    <AnimatePresence>
      {node && (
        <motion.div className="absolute inset-0 z-30 flex items-end justify-center"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" onClick={onClose} />

          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="parchment parch-frame relative w-full max-w-md rounded-t-3xl px-5 pt-3 pb-6 max-h-[86%] overflow-y-auto"
            style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
            <div className="mx-auto w-11 h-1.5 rounded-full mb-3" style={{ background: 'rgba(74,52,24,0.35)' }} />
            <button onClick={onClose} className="absolute top-3 right-3 w-8 h-8 grid place-items-center rounded-full ink"
              style={{ background: 'rgba(94,64,26,0.12)', border: '1px solid rgba(74,52,24,0.3)' }} aria-label="Fechar">
              <X size={16} />
            </button>

            <div className="flex items-center gap-3 pr-8 mb-1">
              <span className="grid place-items-center rounded-full shrink-0" style={{
                width: 52, height: 52, background: 'radial-gradient(circle at 40% 28%, #f3e6c2, #dcc493 82%)',
                border: `2.5px solid ${node.locked || levelLocked ? 'rgba(74,52,24,0.5)' : node.acc}`,
                boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.5)', filter: node.locked || levelLocked ? 'grayscale(0.3)' : 'none',
              }}>
                <span className="text-[28px]">{node.emoji}</span>
              </span>
              <div className="min-w-0">
                <h2 className="font-mapd text-[20px] leading-tight ink truncate">{node.name}</h2>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[11px] font-map font-bold" style={{ color: node.acc }}>{node.recurso}</span>
                  <span className="text-[11px] ink-soft font-combat">· tique 15 min</span>
                </div>
              </div>
            </div>

            <p className="text-[13px] ink-soft leading-snug mb-3 italic">{node.sabor}</p>

            {node.drops && (
              <div className="mb-4">
                <div className="text-[10px] uppercase tracking-[0.18em] ink-soft font-bold mb-1.5">Espólio da região</div>
                <div className="flex flex-wrap gap-1.5">
                  {node.drops.map((d) => (
                    <DropChip key={d.name} name={d.name} dim={(d.minLevel ?? 1) > maxGatherLevel} />
                  ))}
                  {node.seedField && <DropChip seed />}
                </div>
              </div>
            )}

            <div className="h-px w-full my-3" style={{ background: 'rgba(74,52,24,0.22)' }} />

            {node.locked ? (
              <div className="rounded-xl px-4 py-4 text-center" style={{ background: 'rgba(122,47,38,0.10)', border: '1px dashed rgba(122,47,38,0.5)' }}>
                <div className="text-2xl mb-1">🔒</div>
                <div className="font-map font-bold ink text-[14px] mb-1">Região bloqueada</div>
                <p className="text-[13px] ink-soft leading-snug">Ainda não há trilha até aqui — esta região chega numa próxima expedição.</p>
                <span className="inline-block mt-2 text-[11px] font-combat px-2.5 py-1 rounded-md"
                  style={{ background: 'rgba(94,64,26,0.12)', border: '1px solid rgba(74,52,24,0.3)', color: '#7a2f26' }}>
                  ⏳ Em breve
                </span>
              </div>
            ) : levelLocked ? (
              <div className="rounded-xl px-4 py-4 text-center" style={{ background: 'rgba(94,64,26,0.08)', border: '1px dashed rgba(74,52,24,0.45)' }}>
                <div className="text-2xl mb-1">🔒</div>
                <div className="font-map font-bold ink text-[14px] mb-1">Desbloqueia com Coleta Nv.{node.unlockLevel}</div>
                <p className="text-[13px] ink-soft leading-snug">
                  Nenhum herói seu alcançou esse nível ainda. Cada tique de coleta rende XP de Coleta — continue nos campos já abertos.
                </p>
                <span className="inline-block mt-2 text-[11px] font-combat px-2.5 py-1 rounded-md"
                  style={{ background: 'rgba(94,64,26,0.12)', border: '1px solid rgba(74,52,24,0.3)', color: '#6b4f28' }}>
                  ⛏️ Melhor herói: Nv.{maxGatherLevel}
                </span>
              </div>
            ) : (
              <RegionActiveBody
                node={node} characters={props.characters} sessions={props.sessions}
                expandedId={props.expandedId} status={props.status} countdown={props.countdown} busy={props.busy} sendHeroId={props.sendHeroId}
                onExpand={props.onExpand} onSelectSend={props.onSelectSend} onDispatch={props.onDispatch}
                onCollect={props.onCollect} onStopNow={props.onStopNow} onStopAfter={props.onStopAfter} onCancelStop={props.onCancelStop}
              />
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Hud({ livres, emCampo, prontos }: { livres: number; emCampo: number; prontos: number }) {
  return (
    <header className="shrink-0 px-4 py-2.5 border-b border-white/10 bg-black/50 backdrop-blur-xl flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-[0.24em] text-textsec/80 leading-none mb-1">⛏️ Coleta</div>
        <div className="font-map font-bold text-[15px] leading-none text-white truncate">Mapa do Reino</div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/10 bg-black/40 text-[11px]">
          <Portrait size={16} />
          <b className="text-white font-combat">{livres}</b>
          <span className="text-textsec/70">livre{livres === 1 ? '' : 's'}</span>
          {emCampo > 0 && <span className="text-warning/90 font-combat">· {emCampo} em campo</span>}
        </span>
        {prontos > 0 && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-emerald-400/30 bg-emerald-500/10 text-[11px]">
            <span>🎒</span><b className="text-emerald-200 font-combat">{prontos}</b>
          </span>
        )}
      </div>
    </header>
  )
}

// ============================================================
// Vista completa do Mapa do Reino (Hud + mapa + painel + avisos)
// ============================================================

export interface KingdomMapViewProps {
  characters: GatherCharacter[]
  openSessions: OpenSession[]
  now: number
  selectedKey: string | null
  expandedId: string | null
  status: StatusPayload | null
  countdown: number
  busy: boolean
  sendHeroId: string | null
  notice: string | null
  levelUpBanner: string | null
  onSelectNode: (key: string | null) => void
  onExpand: (characterId: string) => void
  onSelectSend: (characterId: string | null) => void
  onDispatch: (fieldId: GatherFieldId, characterId: string) => void
  onCollect: () => void
  onStopNow: () => void
  onStopAfter: () => void
  onCancelStop: () => void
}

export function KingdomMapView(props: KingdomMapViewProps) {
  const { characters, openSessions, now, selectedKey, notice, levelUpBanner, onSelectNode } = props

  const activeKeys = useMemo(
    () => openSessions.map((s) => MAP_NODES.find((n) => n.fieldId === s.fieldId)?.key).filter(Boolean) as string[],
    [openSessions]
  )
  const maxGatherLevel = useMemo(
    () => characters.reduce((m, c) => Math.max(m, gatherLevelOf(c.gatherXp)), 1),
    [characters]
  )
  const livres = characters.filter((c) => !openSessions.some((s) => s.characterId === c.id)).length
  const emCampo = characters.length - livres
  const prontos = openSessions.filter((s) => s.status === 'exhausted' || s.inventoryFull).length
  const selectedNode = selectedKey ? NODE_BY_KEY[selectedKey] : null

  return (
    <div className="relative flex flex-col font-primary text-white overflow-hidden"
      style={{ minHeight: 'calc(100dvh - 6rem)', background: 'radial-gradient(120% 80% at 50% 0%, #14142e, #0b0b18 70%)' }}>
      <Hud livres={livres} emCampo={emCampo} prontos={prontos} />

      <div className="pointer-events-none fixed left-1/2 -translate-x-1/2 top-28 z-40 w-full max-w-md px-4 flex flex-col items-center gap-2">
        <AnimatePresence>
          {levelUpBanner && (
            <motion.div key="lvl" initial={{ scale: 0.9, opacity: 0, y: -8 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="pointer-events-auto flex items-center gap-2 rounded-2xl border-2 border-lime-400/60 bg-gradient-to-r from-lime-500/20 via-emerald-400/15 to-lime-500/20 px-5 py-3 text-center backdrop-blur-xl">
              <span className="text-xl">⭐</span>
              <span className="font-black text-lime-200 text-sm">{levelUpBanner}</span>
            </motion.div>
          )}
          {notice && (
            <motion.div key="notice" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              className="pointer-events-auto max-w-[92%] px-4 py-2.5 rounded-xl text-[13px] text-center bg-black/70 border border-white/15 backdrop-blur-xl">
              {notice}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <main className="relative flex-1 min-h-0 p-3">
        <div className="parchment parch-frame relative w-full h-full min-h-[62vh] max-w-md mx-auto rounded-2xl overflow-hidden">
          <Ambient />

          <div className="absolute top-2 left-0 right-0 text-center pointer-events-none z-[4]">
            <div className="font-mapd text-[15px] ink tracking-wide" style={{ textShadow: '0 1px 0 rgba(255,247,224,0.6)' }}>Reino de Dolrath</div>
            <div className="font-map text-[9px] ink-soft tracking-[0.3em] uppercase">Regiões de Coleta</div>
          </div>

          <div className="absolute bottom-2 right-2 pointer-events-none z-[4]"><Compass size={54} /></div>

          <Roads activeKeys={activeKeys} />
          <HomeMark />
          {MAP_NODES.map((n) => (
            <RegionNode key={n.key} node={n} sessions={openSessions} now={now} maxGatherLevel={maxGatherLevel} onTap={(node) => onSelectNode(node.key)} />
          ))}
        </div>

        <p className="text-center text-white/30 text-[11px] mt-3 max-w-md mx-auto">
          🫘 Sementes só caem nos Campos de Ervas — plante-as na <a href="/farm" className="underline">Fazenda</a>.
          Recursos raros de chefe seguem exclusivos das masmorras.
        </p>
      </main>

      <RegionPanel
        node={selectedNode} characters={characters} sessions={openSessions} maxGatherLevel={maxGatherLevel}
        expandedId={props.expandedId} status={props.status} countdown={props.countdown} busy={props.busy} sendHeroId={props.sendHeroId}
        onClose={() => onSelectNode(null)}
        onExpand={props.onExpand} onSelectSend={props.onSelectSend} onDispatch={props.onDispatch}
        onCollect={props.onCollect} onStopNow={props.onStopNow} onStopAfter={props.onStopAfter} onCancelStop={props.onCancelStop}
      />
    </div>
  )
}
