'use client'

// Slide 5 — De volta à run, agora com gear +15: o mapa inteiro já
// revelado, o token caminha até o último nó e a câmera aproxima do
// covil da Anciã da Mata.

import React, { useMemo } from 'react'
import { motion } from 'framer-motion'
import { buildTrailPoints, type RevealedNode } from '@/components/dungeon/DungeonMap'
import JourneyMapStage, { FOREST } from './JourneyMapStage'
import { useJourney } from '../JourneyContext'
import { useSlideScript } from '../useSlideScript'
import type { JourneySlideProps } from '../journeyData'

const TIMES = [0, 1300, 2800, 4400, 5800]

const GEAR_CHIPS = ['⚔️ Arma +15', '🛡️ Armadura +15', '📿 Amuleto I', '💍 Anéis I']

const REVEALED_ALL: Record<number, RevealedNode> = {
  1: { kind: 'gold', emoji: '💰' },
  2: { kind: 'monster', emoji: '🐺' },
  3: { kind: 'item', emoji: '🗡️' },
  4: { kind: 'blessing', emoji: '✨' },
}

export default function Slide5BossApproach({ active, onNext }: JourneySlideProps) {
  const { heroArt, heroName } = useJourney()
  const { step } = useSlideScript(active, TIMES, { loopDelayMs: 6400 })

  const points = useMemo(() => buildTrailPoints(2, 1), [])
  const bossIdx = points.length - 1
  const tokenIdx = step >= 2 ? bossIdx : bossIdx - 1
  const zoomed = step >= 3

  return (
    <div className="relative h-full w-full overflow-hidden">
      <motion.div
        className="absolute inset-0"
        animate={{ scale: zoomed ? 1.32 : 1 }}
        transition={{ duration: 1.4, ease: 'easeInOut' }}
        style={{ transformOrigin: '50% 12%' }}
      >
        <JourneyMapStage
          points={points}
          tokenIdx={tokenIdx}
          moving={step === 2}
          revealed={REVEALED_ALL}
          avatar={heroArt}
        />
      </motion.div>

      {/* vinheta que fecha ao aproximar do boss */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        animate={{ opacity: zoomed ? 1 : 0 }}
        transition={{ duration: 1.2 }}
        style={{ boxShadow: 'inset 0 0 180px 70px rgba(0,0,0,0.9)' }}
      />

      {/* Chips do gear upado */}
      <div className="absolute top-12 inset-x-3 z-30 flex flex-wrap gap-1.5 justify-center pointer-events-none">
        {GEAR_CHIPS.map((chip, i) => (
          <motion.span
            key={chip}
            initial={{ opacity: 0, y: -12, scale: 0.8 }}
            animate={step >= (i === 0 ? 0 : 1) ? { opacity: 1, y: 0, scale: 1 } : {}}
            transition={{ delay: i * 0.18, type: 'spring', stiffness: 240, damping: 18 }}
            className="px-2.5 py-1 rounded-full border text-[11px] font-bold text-amber-100"
            style={{
              borderColor: 'rgba(231,198,130,0.6)',
              background: 'linear-gradient(180deg, rgba(58,51,37,0.9), rgba(36,31,22,0.92))',
              boxShadow: '0 0 12px rgba(201,162,95,0.35)',
            }}
          >
            {chip}
          </motion.span>
        ))}
      </div>

      {/* Faixa inferior */}
      <div className="absolute bottom-3 inset-x-3 z-30 flex items-end justify-between gap-3">
        <p className="text-[11px] text-white/80 max-w-[58%] drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
          {zoomed
            ? `👑 ${FOREST.boss.name}, ${FOREST.boss.title}, aguarda no último nó.`
            : `${heroName} volta à Floresta Sombria — desta vez, pronto(a) para o topo da trilha.`}
        </p>
        {step >= 4 && (
          <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={onNext}
            className="px-3.5 py-2 rounded-lg bg-primary hover:bg-primary-dark text-white text-xs font-bold shadow-[0_0_18px_rgba(233,69,96,0.55)] animate-pulse"
          >
            ⚔️ Enfrentar a Anciã →
          </motion.button>
        )}
      </div>
    </div>
  )
}
