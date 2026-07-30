'use client'

import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AnimatedDie } from '@/components/battle/AnimatedDice'

// ============================================================
// DungeonMap — o que sobrou das peças visuais da tela de
// EXPLORAÇÃO: a GEOMETRIA da trilha (que a cena e a WalkScene
// consomem como fonte de kind/tier por nó) mais os dois overlays
// vivos, narração do Mestre e d20.
//
// A trilha serpenteante em SVG (MapTrail / MapNode / PlayerToken /
// MapAmbient) morava aqui e foi removida: era um TERCEIRO caminho
// de apresentação, atrás de `!useWalkScene && !useScene`, que
// nunca renderizou porque `walkSceneEnabled` era sempre true.
// Hoje toda masmorra é cena explorável ou esteira WalkScene.
// ============================================================

export type NodeKind = 'start' | 'minor' | 'main' | 'boss'

export interface MapPoint {
  x: number // 0..100 (%)
  y: number // 0..100 (%)
  kind: NodeKind
  tier: number // sala principal associada (0 = entrada)
}

// ------------------------------------------------------------
// Gera a trilha serpenteante (de baixo p/ cima):
//   entrada → (n nós menores + 1 sala principal) × salas → boss.
// Nós menores herdam o tier da sala principal seguinte.
// ------------------------------------------------------------
export function buildTrailPoints(rooms: number, minorNodes: number): MapPoint[] {
  const seq: { kind: NodeKind; tier: number }[] = [{ kind: 'start', tier: 0 }]
  for (let t = 1; t <= rooms; t++) {
    for (let m = 0; m < minorNodes; m++) seq.push({ kind: 'minor', tier: t })
    seq.push({ kind: 'main', tier: t })
  }
  seq.push({ kind: 'boss', tier: rooms })

  const last = seq.length - 1
  return seq.map((n, i) => {
    const t = last > 0 ? i / last : 0
    const y = 95 - t * 84 // 95% (base) -> 11% (topo)
    let x: number
    if (i === 0 || i === last) x = 50
    else x = i % 2 === 1 ? 24 : 74
    return { x, y, kind: n.kind, tier: n.tier }
  })
}

// ============================================================
// Narração do Mestre — dialog com efeito typewriter, aberta sob
// demanda (junto da rolagem do d20 / avanço na trilha) em vez de
// ocupar uma faixa fixa permanente sob o mapa.
// ============================================================
export function NarrationDialog({
  text,
  open,
  onClose,
}: {
  text: string
  open: boolean
  onClose: () => void
}) {
  const [shown, setShown] = React.useState('')
  React.useEffect(() => {
    if (!open) return
    setShown('')
    if (!text) return
    let i = 0
    const id = setInterval(() => {
      i++
      setShown(text.slice(0, i))
      if (i >= text.length) clearInterval(id)
    }, 24)
    return () => clearInterval(id)
  }, [text, open])

  return (
    <AnimatePresence>
      {open && text && (
        <motion.div
          className="absolute inset-x-0 top-3 z-[45] flex justify-center px-4 pointer-events-none"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3 }}
        >
          <button
            onClick={onClose}
            className="pointer-events-auto max-w-md w-full text-left rounded-xl border px-4 py-3 backdrop-blur-xl"
            style={{
              background: 'linear-gradient(180deg, rgba(20,18,14,0.92), rgba(12,11,8,0.96))',
              borderColor: 'var(--dgn-soft)',
              boxShadow: '0 12px 30px -8px rgba(0,0,0,0.65)',
            }}
          >
            <div
              className="inline-flex items-center gap-1.5 mb-1 text-[10px] font-bold uppercase tracking-[0.22em]"
              style={{ color: 'var(--dgn)' }}
            >
              📜 O Mestre narra
            </div>
            <p
              className="text-[14px] sm:text-[15px] leading-snug text-amber-50/90 italic"
              style={{ textShadow: '0 2px 12px rgba(0,0,0,0.9)' }}
            >
              {shown}
              <span className="inline-block w-px h-[1em] align-middle ml-0.5 bg-amber-100/70 animate-pulse"></span>
            </p>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
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
  // 88px no desktop, 64px no mobile
  const [small, setSmall] = React.useState(false)
  React.useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)')
    const update = () => setSmall(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
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
            {/* Giro bem mais curto que o combate — o resultado da exploração crava rápido. */}
            <AnimatedDie sides={20} size={small ? 64 : 88} mode={rolling ? 'rolling' : 'idle'} result={result} minSpinMs={250} />
            <span className="text-xs uppercase tracking-[0.25em] text-textsec font-bold">
              Rolando o destino...
            </span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
