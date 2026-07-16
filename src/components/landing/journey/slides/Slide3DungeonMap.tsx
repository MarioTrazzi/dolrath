'use client'

// Slide 3 — Exploração da Floresta Sombria com o fog real: o token
// (a NFT do herói) caminha nó a nó; cada nó só se revela quando você
// chega — com direito a d20 do destino e narração do Mestre.

import React, { useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  buildTrailPoints,
  NarrationDialog,
  DiceOverlay,
  type RevealedNode,
} from '@/components/dungeon/DungeonMap'
import JourneyMapStage, { FOREST } from './JourneyMapStage'
import { useJourney } from '../JourneyContext'
import { useSlideScript } from '../useSlideScript'
import type { JourneySlideProps } from '../journeyData'

const TIMES = [0, 2400, 3500, 5700, 6900, 8500, 9400, 11900, 13100, 15200]

interface StepState {
  tokenIdx: number
  moving?: boolean
  narration?: string | null
  dice?: 'rolling' | 'result' | null
  revealedUpTo: number // quantas revelações do REVEALS já aconteceram
  final?: boolean
}

const REVEALS: [number, RevealedNode][] = [
  [1, { kind: 'gold', emoji: '💰' }],
  [2, { kind: 'monster', emoji: '🐺' }],
  [3, { kind: 'item', emoji: '🗡️' }],
]

const STEPS: StepState[] = [
  { tokenIdx: 0, narration: FOREST.enterText, revealedUpTo: 0 },
  { tokenIdx: 1, moving: true, narration: null, revealedUpTo: 0 },
  { tokenIdx: 1, revealedUpTo: 1, narration: null },
  { tokenIdx: 2, moving: true, revealedUpTo: 1 },
  { tokenIdx: 2, dice: 'rolling', revealedUpTo: 1 },
  { tokenIdx: 2, dice: 'result', revealedUpTo: 1 },
  { tokenIdx: 2, dice: null, revealedUpTo: 2, narration: 'Um Lobo Faminto salta das sombras — combate!' },
  { tokenIdx: 3, moving: true, revealedUpTo: 2, narration: null },
  { tokenIdx: 3, revealedUpTo: 3 },
  { tokenIdx: 3, revealedUpTo: 3, final: true },
]

export default function Slide3DungeonMap({ active, onNext }: JourneySlideProps) {
  const { heroArt } = useJourney()
  const { step, advance } = useSlideScript(active, TIMES, { loopDelayMs: 4600 })

  const points = useMemo(() => buildTrailPoints(2, 1), [])
  const s = STEPS[Math.min(step, STEPS.length - 1)]

  const revealed = useMemo(() => {
    const map: Record<number, RevealedNode> = {}
    for (let i = 0; i < s.revealedUpTo; i++) map[REVEALS[i][0]] = REVEALS[i][1]
    return map
  }, [s.revealedUpTo])

  return (
    <div className="relative h-full w-full">
      <JourneyMapStage
        points={points}
        tokenIdx={s.tokenIdx}
        moving={!!s.moving}
        revealed={revealed}
        avatar={heroArt}
      >
        <NarrationDialog text={s.narration ?? ''} open={!!s.narration} onClose={advance} />
        <DiceOverlay
          rolling={s.dice != null}
          result={s.dice === 'result' ? { roll: 14, modifier: 2, total: 16 } : null}
        />

        {/* Legenda fixa */}
        <div className="absolute bottom-3 inset-x-3 z-30 flex items-end justify-between gap-3 pointer-events-none">
          <p className="text-[11px] text-white/75 max-w-[62%] drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
            🌫️ A névoa se abre conforme você avança — cada nó é uma rolagem de d20:
            tesouro, emboscada ou bênção.
          </p>
          {s.final ? (
            <motion.button
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={onNext}
              className="pointer-events-auto px-3.5 py-2 rounded-lg bg-primary hover:bg-primary-dark text-white text-xs font-bold shadow-[0_0_18px_rgba(233,69,96,0.5)] animate-pulse"
            >
              Evoluir o gear →
            </motion.button>
          ) : (
            <button
              onClick={advance}
              className="pointer-events-auto px-3 py-1.5 rounded-lg border border-white/20 bg-black/50 backdrop-blur-md text-white/85 text-[11px] font-bold hover:bg-black/70"
            >
              Avançar ▸
            </button>
          )}
        </div>
      </JourneyMapStage>
    </div>
  )
}
