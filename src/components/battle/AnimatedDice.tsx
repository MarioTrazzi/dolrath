'use client'

import React, { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

// ============================================================
// Dados animados estilo mesa de RPG
// - Forma SVG própria por tipo (d4, d6, d8, d10, d12, d20)
// - Giram embaralhando números e param revelando o resultado
//   real (vindo do servidor) na própria face
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

// Polígonos (viewBox 0 0 100 100) imitando a silhueta de cada dado físico
const DIE_POINTS: Record<number, string> = {
  4: '50,6 96,90 4,90',
  8: '50,4 96,50 50,96 4,50',
  10: '50,3 92,38 50,97 8,38',
  12: '50,4 94,37 77,95 23,95 6,37',
  20: '50,3 91,26 91,74 50,97 9,74 9,26',
}

// Linhas internas sutis para dar volume de poliedro
const DIE_FACETS: Record<number, string[]> = {
  4: ['50,6 50,55', '50,55 4,90', '50,55 96,90'],
  8: ['4,50 96,50'],
  10: ['8,38 50,55 92,38', '50,55 50,97'],
  12: ['23,95 50,70 77,95', '50,70 50,40', '6,37 50,40 94,37'],
  20: ['9,26 50,40 91,26', '50,40 50,97', '9,74 50,40', '91,74 50,40'],
}

function DieSvg({ sides, size, dimmed }: { sides: number; size: number; dimmed?: boolean }) {
  const theme = DICE_THEME[sides] || DICE_THEME[6]
  const gid = `die-grad-${sides}-${size}`
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className="block">
      <defs>
        <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={theme.from} />
          <stop offset="100%" stopColor={theme.to} />
        </linearGradient>
      </defs>
      {sides === 6 ? (
        <rect x="6" y="6" width="88" height="88" rx="18" fill={`url(#${gid})`} stroke="rgba(255,255,255,0.45)" strokeWidth="2.5" opacity={dimmed ? 0.45 : 1} />
      ) : (
        <polygon points={DIE_POINTS[sides] || DIE_POINTS[20]} fill={`url(#${gid})`} stroke="rgba(255,255,255,0.45)" strokeWidth="2.5" strokeLinejoin="round" opacity={dimmed ? 0.45 : 1} />
      )}
      {(DIE_FACETS[sides] || []).map((pts, i) => (
        <polyline key={i} points={pts} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" />
      ))}
    </svg>
  )
}

// Posição vertical do número: dados triangulares centram mais para baixo
const NUMBER_OFFSET: Record<number, string> = {
  4: '12%',
  10: '-4%',
  12: '2%',
  20: '0%',
}

interface AnimatedDieProps {
  sides: number
  size?: number
  /** 'idle': aguardando clique | 'rolling': girando até o resultado chegar */
  mode: 'idle' | 'rolling'
  /** Resultado real do servidor — o dado só "crava" quando ele chega */
  result?: DieResult | null
  onClick?: () => void
  disabled?: boolean
}

const MIN_SPIN_MS = 1100

export function AnimatedDie({ sides, size = 80, mode, result, onClick, disabled }: AnimatedDieProps) {
  const theme = DICE_THEME[sides] || DICE_THEME[6]
  const [displayNum, setDisplayNum] = useState<number | string>(`d${sides}`)
  const [revealed, setRevealed] = useState(false)
  const spinStart = useRef<number | null>(null)

  useEffect(() => {
    if (mode !== 'rolling') {
      setRevealed(false)
      spinStart.current = null
      setDisplayNum(`d${sides}`)
      return
    }

    if (spinStart.current === null) spinStart.current = Date.now()

    if (revealed) return

    // Embaralhar números enquanto gira
    const shuffle = setInterval(() => {
      setDisplayNum(1 + Math.floor(Math.random() * sides))
    }, 75)

    // Revelar quando o resultado chegou E o giro mínimo passou
    const tryReveal = setInterval(() => {
      const elapsed = Date.now() - (spinStart.current || 0)
      if (result && elapsed >= MIN_SPIN_MS) {
        clearInterval(shuffle)
        clearInterval(tryReveal)
        setDisplayNum(result.roll)
        setRevealed(true)
      }
    }, 60)

    return () => {
      clearInterval(shuffle)
      clearInterval(tryReveal)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, result, revealed, sides])

  const isMax = revealed && result?.roll === sides
  const numberSize = revealed || mode === 'rolling' ? size * 0.34 : size * 0.26

  return (
    <div className="flex flex-col items-center gap-1">
      <motion.button
        onClick={onClick}
        disabled={disabled || mode === 'rolling'}
        className="relative focus:outline-none"
        style={{ width: size, height: size, cursor: mode === 'idle' && !disabled ? 'pointer' : 'default' }}
        whileHover={mode === 'idle' && !disabled ? { scale: 1.12 } : undefined}
        whileTap={mode === 'idle' && !disabled ? { scale: 0.92 } : undefined}
        animate={
          mode === 'idle' && !disabled
            ? { rotate: [0, -6, 6, -6, 0], scale: [1, 1.05, 1] }
            : mode === 'rolling' && !revealed
            ? { rotate: 360 }
            : { rotate: 0, scale: 1 }
        }
        transition={
          mode === 'idle' && !disabled
            ? { repeat: Infinity, duration: 1.6, ease: 'easeInOut' }
            : mode === 'rolling' && !revealed
            ? { repeat: Infinity, duration: 0.45, ease: 'linear' }
            : { type: 'spring', stiffness: 260, damping: 14 }
        }
      >
        {/* Brilho de fundo */}
        <div
          className="absolute inset-0 rounded-full blur-xl transition-opacity duration-300"
          style={{
            backgroundColor: theme.glow,
            opacity: revealed ? 0.9 : mode === 'rolling' ? 0.5 : 0.3,
          }}
        />

        <div className="relative">
          <DieSvg sides={sides} size={size} dimmed={!!disabled} />
          {/* Número na face do dado */}
          <motion.span
            key={revealed ? 'final' : 'shuffle'}
            initial={revealed ? { scale: 2.2, opacity: 0 } : false}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 16 }}
            className="absolute inset-0 flex items-center justify-center font-black text-white select-none"
            style={{
              fontSize: numberSize,
              marginTop: NUMBER_OFFSET[sides] || '0%',
              textShadow: '0 2px 6px rgba(0,0,0,0.8)',
            }}
          >
            {displayNum}
          </motion.span>
        </div>

        {/* Anel de impacto ao revelar */}
        <AnimatePresence>
          {revealed && (
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

      {/* Total com modificador (ex.: 7 + 2 = 9) */}
      <div className="h-5 flex items-center">
        <AnimatePresence>
          {revealed && result && (
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
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ============================================================
// Dado em miniatura: aparece girando e já mostra o resultado
// (usado como "chip" de rolagem sobre cada lutador)
// ============================================================

export function MiniDie({ sides, result, size = 38 }: { sides: number; result: DieResult; size?: number }) {
  return (
    <motion.div
      initial={{ rotate: -540, scale: 0, opacity: 0 }}
      animate={{ rotate: 0, scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 15 }}
      className="relative flex flex-col items-center"
      title={`d${sides}: ${result.roll}${result.modifier > 0 ? ` + ${result.modifier} = ${result.total}` : ''}`}
    >
      <div className="relative">
        <DieSvg sides={sides} size={size} />
        <span
          className="absolute inset-0 flex items-center justify-center font-black text-white select-none"
          style={{
            fontSize: size * 0.38,
            marginTop: NUMBER_OFFSET[sides] || '0%',
            textShadow: '0 1px 3px rgba(0,0,0,0.9)',
          }}
        >
          {result.roll}
        </span>
      </div>
      {result.modifier !== 0 && (
        <span className={`text-[9px] font-bold leading-none mt-0.5 ${result.modifier > 0 ? 'text-cyan-300' : 'text-orange-300'}`}>
          {result.modifier > 0 ? '+' : '−'}{Math.abs(result.modifier)}={result.total}
        </span>
      )}
    </motion.div>
  )
}
