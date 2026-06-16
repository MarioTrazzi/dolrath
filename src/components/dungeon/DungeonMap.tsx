'use client'

import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AnimatedDie } from '@/components/battle/AnimatedDice'
import { DungeonEventKind } from '@/lib/dungeonAdventures'

// ============================================================
// DungeonMap — peças visuais da tela de EXPLORAÇÃO (handoff
// Claude Design / "DungeonForestMap"): trilha serpenteante de
// nós, token do jogador que caminha de nó em nó, ambiente vivo
// (vagalumes, tochas, vinheta) e narração do Mestre.
//
// Tudo dirigido pelas cores de destaque da masmorra via as
// CSS vars --dgn / --dgn-soft (definidas pelo container pai).
// ============================================================

export type NodeKind = 'start' | 'event' | 'boss'

export interface MapPoint {
  x: number // 0..100 (%)
  y: number // 0..100 (%)
  kind: NodeKind
}

export type NodeVisualState = 'done' | 'current' | 'next' | 'locked'

export interface RevealedNode {
  kind: DungeonEventKind
  emoji: string
}

// Brilho por tipo de evento (em nós já visitados)
export const KIND_GLOW: Record<DungeonEventKind, string> = {
  trap: '#a3e635',
  monster: '#e74c3c',
  nothing: '#94a3b8',
  gold: '#f39c12',
  item: '#34d399', // sobrescrito pela cor da masmorra quando disponível
  blessing: '#fde68a',
}

// ------------------------------------------------------------
// Gera a trilha serpenteante (de baixo p/ cima) a partir do
// número de salas: nó 0 = entrada, 1..rooms = eventos, último = boss.
// ------------------------------------------------------------
export function buildTrailPoints(rooms: number): MapPoint[] {
  const last = rooms + 1
  const pts: MapPoint[] = []
  for (let i = 0; i <= last; i++) {
    const t = last > 0 ? i / last : 0
    const y = 95 - t * 84 // 95% (base) -> 11% (topo)
    let x: number
    if (i === 0 || i === last) x = 50
    else x = i % 2 === 1 ? 28 : 70
    const kind: NodeKind = i === 0 ? 'start' : i === last ? 'boss' : 'event'
    pts.push({ x, y, kind })
  }
  return pts
}

// ------------------------------------------------------------
// Caminho SVG suave (Catmull-Rom -> Bézier) ligando os nós.
// ------------------------------------------------------------
function smoothPath(pts: MapPoint[]): string {
  if (pts.length < 2) return ''
  const p = pts.map(q => [q.x, q.y] as const)
  let d = `M ${p[0][0]} ${p[0][1]}`
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] || p[i]
    const p1 = p[i]
    const p2 = p[i + 1]
    const p3 = p[i + 2] || p2
    const c1x = p1[0] + (p2[0] - p0[0]) / 6
    const c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6
    const c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${p2[0]} ${p2[1]}`
  }
  return d
}

// ============================================================
// Trilha: caminho esmaecido de fundo + caminho aceso por cima
// ============================================================
export function MapTrail({ points, progress }: { points: MapPoint[]; progress: number }) {
  const d = React.useMemo(() => smoothPath(points), [points])
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d={d}
        fill="none"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth="2.4"
        strokeDasharray="0.6 2.4"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={d}
        fill="none"
        stroke="var(--dgn)"
        strokeWidth="3"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        pathLength={1}
        style={{
          filter: 'drop-shadow(0 0 6px var(--dgn))',
          strokeDasharray: `${Math.max(progress, 0.0001)} 2`,
          transition: 'stroke-dasharray 0.9s ease-in-out',
        }}
      />
    </svg>
  )
}

// ============================================================
// Nó do mapa
// ============================================================
export function MapNode({
  pt,
  state,
  revealed,
  accent,
  bossName,
}: {
  pt: MapPoint
  state: NodeVisualState
  revealed?: RevealedNode
  accent: string
  bossName: string
}) {
  const isBoss = pt.kind === 'boss'
  const isStart = pt.kind === 'start'
  const base =
    'absolute -translate-x-1/2 -translate-y-1/2 rounded-full flex items-center justify-center select-none'
  const size = isBoss ? 'w-16 h-16' : 'w-11 h-11'
  const glow = revealed ? (revealed.kind === 'item' ? accent : KIND_GLOW[revealed.kind]) : null

  let face: React.ReactNode = null
  let ring: string
  let fill: string
  let opacity = 1

  if (isStart) {
    ring = '1px solid rgba(255,255,255,0.25)'
    fill = 'rgba(255,255,255,0.06)'
    face = <span className="text-lg">🚪</span>
  } else if (state === 'done') {
    ring = `1px solid ${glow || 'rgba(255,255,255,0.3)'}`
    fill = 'rgba(15,15,35,0.85)'
    opacity = 0.55
    face = revealed ? (
      <span className="text-lg">{revealed.emoji}</span>
    ) : (
      <span className="text-success text-base">✓</span>
    )
  } else if (state === 'current') {
    ring = '2px solid var(--dgn)'
    fill = 'rgba(15,15,35,0.9)'
    face = revealed ? (
      <span className="text-lg">{revealed.emoji}</span>
    ) : (
      <span className="w-2 h-2 rounded-full" style={{ background: 'var(--dgn)' }}></span>
    )
  } else if (state === 'next') {
    ring = '2px solid var(--dgn)'
    fill = 'rgba(15,15,35,0.95)'
    face = isBoss ? (
      <span className="text-2xl">👑</span>
    ) : (
      <span className="font-black text-base" style={{ color: 'var(--dgn)' }}>
        ?
      </span>
    )
  } else {
    // locked
    ring = '1px solid rgba(255,255,255,0.1)'
    fill = 'rgba(10,10,25,0.7)'
    opacity = isBoss ? 0.7 : 0.4
    face = isBoss ? (
      <span className="text-2xl opacity-50">👑</span>
    ) : (
      <span className="font-black text-sm text-white/30">?</span>
    )
  }

  return (
    <div
      className={`${base} ${size}`}
      style={{
        left: `${pt.x}%`,
        top: `${pt.y}%`,
        opacity,
        border: ring,
        background: fill,
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        animation: state === 'next' ? 'node-pulse 1.8s ease-in-out infinite' : undefined,
        boxShadow: state === 'done' && !isStart && glow ? `0 0 10px ${glow}33` : undefined,
        zIndex: isBoss ? 5 : 3,
      }}
    >
      {face}
      {isBoss && state !== 'done' && (
        <span
          className="absolute -bottom-6 whitespace-nowrap text-[10px] font-bold tracking-wide uppercase"
          style={{ color: state === 'locked' ? 'rgba(255,255,255,0.4)' : '#f39c12' }}
        >
          {bossName}
        </span>
      )}
    </div>
  )
}

// ============================================================
// Token do jogador (foto da NFT) — desliza entre nós com rastro
// ============================================================
export function PlayerToken({
  point,
  moving,
  avatar,
}: {
  point: MapPoint
  moving: boolean
  avatar?: string | null
}) {
  const at = { left: `${point.x}%`, top: `${point.y}%` }
  return (
    <>
      {/* rastro de partículas (lag via transition-delay) */}
      {[0, 1, 2].map(i => (
        <div
          key={i}
          className="trail-dot absolute rounded-full pointer-events-none"
          style={{
            ...at,
            marginLeft: -(9 - i * 2),
            marginTop: -(9 - i * 2),
            width: 18 - i * 4,
            height: 18 - i * 4,
            background: 'radial-gradient(circle, var(--dgn), transparent 70%)',
            zIndex: 6,
            opacity: moving ? 0.5 - i * 0.13 : 0,
            transitionDelay: `${0.07 * (i + 1)}s, ${0.07 * (i + 1)}s, 0s`,
          }}
        />
      ))}
      {/* token — left/top sempre = nó atual; .token-pos dá o deslize suave */}
      <div className="token-pos absolute" style={{ ...at, zIndex: 8 }}>
        <div className="-translate-x-1/2 -translate-y-1/2">
          <div className="relative" style={{ animation: 'token-bob 2.4s ease-in-out infinite' }}>
            {/* aura pulsante */}
            <span
              className="absolute inset-0 rounded-full"
              style={{
                boxShadow: '0 0 16px 4px var(--dgn-soft)',
                animation: 'node-pulse 2.2s ease-in-out infinite',
              }}
            ></span>
            {/* avatar NFT */}
            <div
              className="relative w-12 h-12 rounded-full grid place-items-center overflow-hidden"
              style={{
                border: '2.5px solid var(--dgn)',
                background: 'radial-gradient(circle at 38% 30%, #2a3a5e, #141426 70%)',
                boxShadow: '0 0 14px var(--dgn-soft), inset 0 0 10px rgba(0,0,0,0.6)',
              }}
            >
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatar} alt="" className="w-full h-full object-cover" />
              ) : (
                <span
                  className="text-2xl"
                  style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))' }}
                >
                  🧝‍♀️
                </span>
              )}
            </div>
            {/* selo "NFT" */}
            <span
              className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-1.5 py-px rounded-full text-[8px] font-bold uppercase tracking-wider text-white"
              style={{ background: 'var(--dgn)', boxShadow: '0 0 8px var(--dgn-soft)' }}
            >
              NFT
            </span>
          </div>
        </div>
      </div>
    </>
  )
}

// ============================================================
// Ambiente — vagalumes flutuando + brilhos + tochas + vinheta
// ============================================================
const FIREFLIES = Array.from({ length: 16 }, (_, i) => {
  let s = (i + 3) * 9301 + 49297
  const r = () => {
    s = (s * 16807) % 2147483647
    return s / 2147483647
  }
  return {
    id: i,
    x: r() * 100,
    y: 8 + r() * 86,
    size: 2 + r() * 3,
    dur: 6 + r() * 7,
    delay: r() * 6,
    fx: `${(r() * 2 - 1) * 30}px`,
    fy: `${(r() * 2 - 1) * 26}px`,
  }
})

export function MapAmbient() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {/* brilho mágico de cima e roxo de baixo, na cor da masmorra */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 80% at 50% 5%, var(--dgn-soft), transparent 55%), radial-gradient(100% 70% at 50% 100%, rgba(124,58,237,0.16), transparent 60%)',
        }}
      ></div>
      <div
        className="absolute top-1/4 -left-24 w-80 h-80 rounded-full blur-3xl"
        style={{ background: 'rgba(124,58,237,0.18)' }}
      ></div>
      <div
        className="absolute bottom-10 -right-24 w-72 h-72 rounded-full blur-3xl"
        style={{ background: 'var(--dgn-soft)', opacity: 0.4 }}
      ></div>
      {/* tochas âmbar nos cantos */}
      <div
        className="absolute top-20 left-3 w-16 h-40 rounded-full blur-2xl"
        style={{ background: 'rgba(243,156,18,0.18)', animation: 'torch-flicker 3.5s ease-in-out infinite' }}
      ></div>
      <div
        className="absolute top-32 right-3 w-16 h-40 rounded-full blur-2xl"
        style={{ background: 'rgba(243,156,18,0.16)', animation: 'torch-flicker 4.2s ease-in-out 0.6s infinite' }}
      ></div>
      {/* vagalumes */}
      {FIREFLIES.map(f => (
        <span
          key={f.id}
          className="absolute rounded-full"
          style={
            {
              left: `${f.x}%`,
              top: `${f.y}%`,
              width: f.size,
              height: f.size,
              background: '#fde68a',
              boxShadow: '0 0 8px 2px rgba(253,230,138,0.7)',
              '--fx': f.fx,
              '--fy': f.fy,
              animation: `firefly-drift ${f.dur}s ease-in-out ${f.delay}s infinite`,
            } as React.CSSProperties
          }
        ></span>
      ))}
      {/* vinheta nos cantos */}
      <div
        className="absolute inset-0"
        style={{ boxShadow: 'inset 0 0 140px 40px rgba(0,0,0,0.75)' }}
      ></div>
    </div>
  )
}

// ============================================================
// Narração do Mestre — legenda de filme com efeito typewriter
// ============================================================
export function MasterNarration({ text }: { text: string }) {
  const [shown, setShown] = React.useState('')
  React.useEffect(() => {
    setShown('')
    if (!text) return
    let i = 0
    const id = setInterval(() => {
      i++
      setShown(text.slice(0, i))
      if (i >= text.length) clearInterval(id)
    }, 24)
    return () => clearInterval(id)
  }, [text])
  return (
    <div className="px-4 pb-1 pointer-events-none">
      <div className="mx-auto max-w-md text-center">
        <div
          className="inline-flex items-center gap-1.5 mb-1.5 text-[10px] font-bold uppercase tracking-[0.22em]"
          style={{ color: 'var(--dgn)' }}
        >
          📜 O Mestre narra
        </div>
        <p
          className="text-[15px] sm:text-base leading-snug text-amber-50/90 italic min-h-[2.6em]"
          style={{ textShadow: '0 2px 12px rgba(0,0,0,0.9)' }}
        >
          {shown}
          <span className="inline-block w-px h-[1em] align-middle ml-0.5 bg-amber-100/70 animate-pulse"></span>
        </p>
      </div>
    </div>
  )
}

// ============================================================
// Dado rolando (overlay em tela cheia) — "Rolando o destino..."
// ============================================================
export function DiceOverlay({
  rolling,
  result,
}: {
  rolling: boolean
  result: { roll: number; modifier: number; total: number } | null
}) {
  return (
    <AnimatePresence>
      {rolling && (
        <motion.div
          className="absolute inset-0 z-40 grid place-items-center bg-black/55 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            initial={{ scale: 0.5, rotate: -40 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 14 }}
            className="flex flex-col items-center gap-3"
          >
            <AnimatedDie sides={20} size={130} mode={result ? 'idle' : 'rolling'} result={result} />
            <span className="text-xs uppercase tracking-[0.25em] text-textsec font-bold">
              Rolando o destino...
            </span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
