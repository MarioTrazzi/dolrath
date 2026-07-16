'use client'

import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion, type PanInfo } from 'framer-motion'
import {
  getDieGeometry,
  qMul,
  qFromAxisAngle,
  qSlerp,
  qRotate,
  qToMatrix3d,
  qNormalize,
  v3Dot,
  v3Normalize,
  type Quat,
  type V3,
} from './diceGeometry'

// ============================================================
// Dados animados estilo mesa de RPG — agora poliedros 3D reais
// (CSS perspective + preserve-3d + uma face por lado).
// - O dado tomba caoticamente no espaço enquanto o resultado
//   não chega e POUSA com a face certa virada para a câmera.
// - O pouso termina exatamente em minSpinMs (mesmo instante em
//   que o dado antigo "cravava"), então o ritmo do jogo não muda.
// ============================================================

export interface DieResult {
  roll: number
  modifier: number
  total: number
}

const DICE_THEME: Record<number, { from: string; to: string; glow: string }> = {
  4: { from: '#ef4444', to: '#7f1d1d', glow: 'rgba(239,68,68,0.7)' },
  6: { from: '#3b82f6', to: '#1e3a8a', glow: 'rgba(59,130,246,0.7)' },
  8: { from: '#22c55e', to: '#14532d', glow: 'rgba(34,197,94,0.7)' },
  10: { from: '#eab308', to: '#713f12', glow: 'rgba(234,179,8,0.7)' },
  12: { from: '#a855f7', to: '#581c87', glow: 'rgba(168,85,247,0.7)' },
  20: { from: '#ec4899', to: '#831843', glow: 'rgba(236,72,153,0.7)' },
}

// ============================================================
// Die3D — o poliedro em si
// ============================================================

/** Luz fixa no mundo (cima-esquerda, puxando pro espectador). */
const LIGHT: V3 = v3Normalize([-0.42, -0.72, 0.55])
/** Inclinação final: dado pousado levemente visto de cima (vende o volume). */
const FINAL_TILT = qFromAxisAngle([1, 0, 0], -0.26)
const IDLE_AXIS: V3 = v3Normalize([0.35, 1, 0.22])
const TUMBLE_RAD_S = 9

/** easeOutBack suave — o pouso passa um tiquinho do alvo e volta. */
function easeOutBack(t: number) {
  const c1 = 0.9
  return 1 + (c1 + 1) * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

interface Die3DProps {
  sides: number
  size: number
  phase: 'idle' | 'tumbling' | 'settling'
  /** Rolagem do servidor — define em qual face o dado pousa. */
  targetRoll?: number | null
  settleMs: number
  dimmed?: boolean
  reduceMotion?: boolean
  onSettled?: () => void
}

function Die3D({ sides, size, phase, targetRoll, settleMs, dimmed, reduceMotion, onSettled }: Die3DProps) {
  const geom = useMemo(() => getDieGeometry(sides), [sides])
  const theme = DICE_THEME[sides] || DICE_THEME[6]
  const uid = useId()
  const k = size * 0.47 // px por unidade (circunraio 1 → raio em px)

  const innerRef = useRef<HTMLDivElement>(null)
  const hopRef = useRef<HTMLDivElement>(null)
  const shadowRef = useRef<HTMLDivElement>(null)
  const shadeRefs = useRef<(SVGPolygonElement | null)[]>([])
  const glintRefs = useRef<(SVGPolygonElement | null)[]>([])
  const qRef = useRef<Quat>(qMul(FINAL_TILT, geom.faces[geom.faces.length - 1].settle))
  const hopValRef = useRef(0)
  const onSettledRef = useRef(onSettled)
  onSettledRef.current = onSettled
  const [settledFace, setSettledFace] = useState<number | null>(null)

  const faceTransforms = useMemo(
    () =>
      geom.faces.map(f => {
        const [Xx, Xy, Xz] = f.basisX
        const [Yx, Yy, Yz] = f.basisY
        const [Nx, Ny, Nz] = f.normal
        const [cx, cy, cz] = f.center
        return `matrix3d(${Xx},${Xy},${Xz},0,${Yx},${Yy},${Yz},0,${Nx},${Ny},${Nz},0,${cx * k},${cy * k},${cz * k},1)`
      }),
    [geom, k],
  )

  useEffect(() => {
    const targetFace =
      targetRoll != null
        ? Math.min(Math.max(targetRoll - 1, 0), geom.faces.length - 1)
        : geom.faces.length - 1
    const targetQ = qMul(FINAL_TILT, geom.faces[targetFace].settle)

    // Aplica transform + iluminação por face + sombra — 1x por frame
    const apply = (q: Quat, hop: number) => {
      hopValRef.current = hop
      if (innerRef.current) innerRef.current.style.transform = qToMatrix3d(q)
      if (hopRef.current)
        hopRef.current.style.transform = `translate3d(0, ${(-hop * size * 0.06).toFixed(2)}px, 0)`
      if (shadowRef.current) {
        shadowRef.current.style.opacity = (0.5 - hop * 0.28).toFixed(3)
        shadowRef.current.style.transform = `translateX(-50%) scaleX(${(1 - hop * 0.22).toFixed(3)})`
      }
      for (let i = 0; i < geom.faces.length; i++) {
        const b = v3Dot(qRotate(q, geom.faces[i].normal), LIGHT)
        const sh = shadeRefs.current[i]
        if (sh) sh.style.opacity = Math.min(0.62, Math.max(0, (1 - b) * 0.34)).toFixed(3)
        const gl = glintRefs.current[i]
        if (gl) gl.style.opacity = (Math.max(0, b - 0.62) * 0.75).toFixed(3)
      }
    }

    if (phase !== 'settling') setSettledFace(null)

    if (reduceMotion) {
      // Sem tombo: mostra direto a orientação final (ou a de descanso)
      qRef.current = phase === 'settling' ? targetQ : qRef.current
      apply(qRef.current, 0)
      if (phase === 'settling') {
        setSettledFace(targetFace)
        onSettledRef.current?.()
      }
      return
    }

    let raf = 0
    let last = performance.now()
    let axis: V3 = v3Normalize([Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5])
    let hopPhase = Math.random() * Math.PI
    let settleFrom: Quat | null = null
    let settleStart = 0
    let hopAtStart = 0

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      let hop = 0

      if (phase === 'idle') {
        qRef.current = qNormalize(qMul(qFromAxisAngle(IDLE_AXIS, dt * 0.55), qRef.current))
      } else if (phase === 'tumbling') {
        // eixo deriva a cada frame → tombo caótico, não um giro de pião
        axis = v3Normalize([
          axis[0] + (Math.random() - 0.5) * 0.4,
          axis[1] + (Math.random() - 0.5) * 0.4,
          axis[2] + (Math.random() - 0.5) * 0.4,
        ])
        qRef.current = qNormalize(qMul(qFromAxisAngle(axis, dt * TUMBLE_RAD_S), qRef.current))
        hopPhase += dt * 9
        hop = Math.abs(Math.sin(hopPhase))
      } else {
        // settling: desacelera do tombo até a face do resultado
        if (!settleFrom) {
          settleFrom = qRef.current
          settleStart = now
          hopAtStart = hopValRef.current
        }
        const t = Math.min((now - settleStart) / settleMs, 1)
        qRef.current = qSlerp(settleFrom, targetQ, easeOutBack(t))
        hop = hopAtStart * (1 - t)
        if (t >= 1) {
          qRef.current = targetQ
          apply(targetQ, 0)
          setSettledFace(targetFace)
          onSettledRef.current?.()
          return // pousado — para o loop
        }
      }

      apply(qRef.current, hop)
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [phase, targetRoll, geom, size, settleMs, reduceMotion])

  return (
    <div
      className="relative"
      style={{ width: size, height: size, perspective: size * 3.4, opacity: dimmed ? 0.45 : 1 }}
    >
      {/* gradiente compartilhado pelas faces (referência cruzada entre SVGs) */}
      <svg width={0} height={0} className="absolute" aria-hidden>
        <defs>
          <linearGradient id={`${uid}-grad`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={theme.from} />
            <stop offset="100%" stopColor={theme.to} />
          </linearGradient>
        </defs>
      </svg>

      {/* sombra no chão — o que vende o quique */}
      <div
        ref={shadowRef}
        className="absolute pointer-events-none"
        style={{
          left: '50%',
          bottom: -size * 0.07,
          width: size * 0.72,
          height: size * 0.17,
          borderRadius: '50%',
          background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0) 70%)',
          transform: 'translateX(-50%)',
          opacity: 0.5,
        }}
      />

      <div ref={hopRef} className="absolute inset-0" style={{ transformStyle: 'preserve-3d' }}>
        <div
          ref={innerRef}
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 0,
            height: 0,
            transformStyle: 'preserve-3d',
            transform: qToMatrix3d(qRef.current),
          }}
        >
          {geom.faces.map((f, i) => {
            const R2 = f.radius * 1.15
            const W = 2 * R2 * k
            const num = i + 1
            const isTarget = settledFace === i
            const fs = f.inradius * (isTarget ? 1.4 : 1.0)
            const pts = f.verts2d.map(([x, y]) => `${x.toFixed(4)},${y.toFixed(4)}`).join(' ')
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: -W / 2,
                  top: -W / 2,
                  width: W,
                  height: W,
                  transform: faceTransforms[i],
                  backfaceVisibility: 'hidden',
                }}
              >
                <svg viewBox={`${-R2} ${-R2} ${2 * R2} ${2 * R2}`} width="100%" height="100%" style={{ display: 'block' }}>
                  <polygon
                    points={pts}
                    fill={`url(#${uid}-grad)`}
                    stroke={isTarget ? 'rgba(255,222,130,0.95)' : 'rgba(236,202,122,0.45)'}
                    strokeWidth={f.radius * 0.055}
                    strokeLinejoin="round"
                  />
                  {/* sombra e brilho por face — opacidade dirigida pelo rAF (luz fixa no mundo) */}
                  <polygon ref={el => { shadeRefs.current[i] = el }} points={pts} fill="#000" style={{ opacity: 0 }} />
                  <polygon ref={el => { glintRefs.current[i] = el }} points={pts} fill="#fff" style={{ opacity: 0 }} />
                  <text x={0} y={fs * 0.07} textAnchor="middle" dominantBaseline="central" fontWeight={900} fontSize={fs} fill="rgba(15,6,0,0.6)">
                    {num}
                  </text>
                  <text x={0} y={0} textAnchor="middle" dominantBaseline="central" fontWeight={900} fontSize={fs} fill={isTarget ? '#ffeeb8' : '#f6e6c2'}>
                    {num}
                  </text>
                  {sides >= 9 && (num === 6 || num === 9) && (
                    <line x1={-fs * 0.3} x2={fs * 0.3} y1={fs * 0.56} y2={fs * 0.56} stroke="#f6e6c2" strokeWidth={fs * 0.09} strokeLinecap="round" />
                  )}
                </svg>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// AnimatedDie — orquestra fases e efeitos ao redor do Die3D
// ============================================================

interface AnimatedDieProps {
  sides: number
  size?: number
  /** 'idle': aguardando clique | 'rolling': tombando até o resultado chegar */
  mode: 'idle' | 'rolling'
  /** Resultado real do servidor — o dado só pousa quando ele chega */
  result?: DieResult | null
  onClick?: () => void
  disabled?: boolean
  /** Instante (ms) em que o dado termina de pousar. Default = combate (1100). */
  minSpinMs?: number
}

const MIN_SPIN_MS = 1100

export function AnimatedDie({ sides, size = 80, mode, result, onClick, disabled, minSpinMs = MIN_SPIN_MS }: AnimatedDieProps) {
  const theme = DICE_THEME[sides] || DICE_THEME[6]
  const reduceMotion = useReducedMotion()
  const [settling, setSettling] = useState(false)
  const [landed, setLanded] = useState(false)
  const spinStart = useRef<number | null>(null)
  // O pouso (settle) roda DENTRO da janela do minSpinMs: começa antes e termina
  // exatamente quando o dado antigo cravava — o ritmo dos consumidores não muda.
  const settleMs = Math.round(Math.min(620, Math.max(260, minSpinMs * 0.55)))

  useEffect(() => {
    if (mode !== 'rolling') {
      setSettling(false)
      setLanded(false)
      spinStart.current = null
      return
    }
    if (spinStart.current === null) spinStart.current = Date.now()
    if (settling) return

    const leadMs = Math.max(0, minSpinMs - settleMs)
    const tryStart = setInterval(() => {
      const elapsed = Date.now() - (spinStart.current || 0)
      if (result && elapsed >= leadMs) {
        clearInterval(tryStart)
        setSettling(true)
      }
    }, 50)
    return () => clearInterval(tryStart)
  }, [mode, result, settling, minSpinMs, settleMs])

  const isMax = landed && result?.roll === sides
  const phase: 'idle' | 'tumbling' | 'settling' = mode !== 'rolling' ? 'idle' : settling ? 'settling' : 'tumbling'

  return (
    <div className="flex flex-col items-center gap-1">
      <motion.button
        onClick={onClick}
        disabled={disabled || mode === 'rolling'}
        className="relative focus:outline-none"
        style={{ width: size, height: size, cursor: mode === 'idle' && !disabled ? 'pointer' : 'default' }}
        whileHover={mode === 'idle' && !disabled ? { scale: 1.1 } : undefined}
        whileTap={mode === 'idle' && !disabled ? { scale: 0.94 } : undefined}
        animate={mode === 'idle' && !disabled ? { scale: [1, 1.04, 1] } : { scale: 1 }}
        transition={mode === 'idle' && !disabled ? { repeat: Infinity, duration: 1.8, ease: 'easeInOut' } : { duration: 0.2 }}
      >
        {/* Brilho de fundo */}
        <div
          className="absolute inset-0 rounded-full blur-xl transition-opacity duration-300"
          style={{
            backgroundColor: theme.glow,
            opacity: landed ? 0.9 : mode === 'rolling' ? 0.5 : 0.3,
          }}
        />

        {/* Baque do pouso: squash rápido quando o dado assenta */}
        <motion.div
          animate={landed && !reduceMotion ? { scale: [1.12, 0.96, 1], y: [0, 1.5, 0] } : { scale: 1, y: 0 }}
          transition={{ duration: 0.32, ease: 'easeOut' }}
        >
          <Die3D
            sides={sides}
            size={size}
            phase={phase}
            targetRoll={result?.roll}
            settleMs={settleMs}
            dimmed={!!disabled}
            reduceMotion={!!reduceMotion}
            onSettled={() => setLanded(true)}
          />
        </motion.div>

        {/* Anel de impacto ao pousar */}
        <AnimatePresence>
          {landed && (
            <motion.div
              initial={{ scale: 0.6, opacity: 0.9 }}
              animate={{ scale: 1.9, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
              className="absolute inset-0 rounded-full border-4 pointer-events-none"
              style={{ borderColor: theme.glow }}
            />
          )}
        </AnimatePresence>
      </motion.button>

      {/* Total com modificador (ex.: 7 + 2 = 9) — ou o tipo do dado em repouso */}
      <div className="h-5 flex items-center">
        <AnimatePresence>
          {landed && result ? (
            <motion.span
              initial={{ y: -6, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className={`text-xs font-bold ${isMax ? 'text-yellow-300' : 'text-white/90'}`}
            >
              {isMax && '🔥 '}
              {result.modifier !== 0
                ? `${result.roll} ${result.modifier > 0 ? '+' : '−'} ${Math.abs(result.modifier)} = ${result.total}`
                : `= ${result.total}`}
              {isMax && ' 🔥'}
            </motion.span>
          ) : mode === 'idle' ? (
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/50">d{sides}</span>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ============================================================
// ShowcaseDie — dado 3D decorativo em rotação lenta (landing,
// vitrines): sem botão, sem rolagem, só o objeto girando.
// ============================================================

interface ShowcaseDieProps {
  sides?: number
  size?: number
  className?: string
  /** Arraste e solte (efeito estilingue) rola o dado e mostra um resultado. */
  interactive?: boolean
}

/** Abaixo desta velocidade de soltura (px/s), o arraste é só um "cutucão" — não conta como jogada. */
const THROW_VELOCITY = 260

export function ShowcaseDie({ sides = 20, size = 260, className = '', interactive = false }: ShowcaseDieProps) {
  const reduceMotion = useReducedMotion()
  const theme = DICE_THEME[sides] || DICE_THEME[6]
  const [phase, setPhase] = useState<'idle' | 'tumbling' | 'settling'>('idle')
  const [targetRoll, setTargetRoll] = useState<number | null>(null)
  const rollingRef = useRef(false)

  const throwDie = () => {
    if (rollingRef.current) return
    rollingRef.current = true
    setPhase('tumbling')
    const tumbleMs = 550 + Math.random() * 300
    window.setTimeout(() => {
      setTargetRoll(1 + Math.floor(Math.random() * sides))
      setPhase('settling')
    }, tumbleMs)
  }

  const handleSettled = () => {
    window.setTimeout(() => {
      rollingRef.current = false
      setPhase('idle')
      setTargetRoll(null)
    }, 1400)
  }

  const handleDragEnd = (_e: unknown, info: PanInfo) => {
    const speed = Math.hypot(info.velocity.x, info.velocity.y)
    if (speed > THROW_VELOCITY) throwDie()
  }

  const isIdle = phase === 'idle'

  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      <div
        className="absolute inset-4 rounded-full blur-2xl pointer-events-none"
        style={{ backgroundColor: theme.glow, opacity: 0.35 }}
      />
      <motion.div
        drag={interactive && isIdle}
        dragElastic={0.6}
        dragSnapToOrigin
        dragTransition={{ bounceStiffness: 420, bounceDamping: 22 }}
        onDragEnd={interactive ? handleDragEnd : undefined}
        onTap={interactive && isIdle ? throwDie : undefined}
        whileDrag={{ scale: 1.08 }}
        style={{
          width: size,
          height: size,
          cursor: interactive && isIdle ? 'grab' : 'default',
          touchAction: interactive ? 'none' : undefined,
        }}
      >
        <Die3D
          sides={sides}
          size={size}
          phase={phase}
          targetRoll={targetRoll}
          settleMs={600}
          reduceMotion={!!reduceMotion}
          onSettled={interactive ? handleSettled : undefined}
        />
      </motion.div>
    </div>
  )
}
