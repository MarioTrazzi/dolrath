'use client'

// Slide 7 — De volta à trilha, agora com arma IV e set III: a mesma
// caminhada real (WalkScene) com o "?" laranja de boss no fim — a câmera
// fecha na chegada ao covil da Anciã da Mata.

import React from 'react'
import { motion } from 'framer-motion'
import { NarrationDialog } from '@/components/dungeon/DungeonMap'
import type { WalkMode, WalkTrailMark } from '@/components/dungeon/WalkScene'
import JourneyWalkStage, { FOREST } from './JourneyWalkStage'
import { useJourney } from '../JourneyContext'
import { useSlideScript } from '../useSlideScript'
import type { JourneySlideProps } from '../journeyData'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { pickName, pickTitle } from '@/lib/i18n/names'

// 0 idle+chips do gear · 1 scroll (5.2s) · 2 approach · 3 chegada no covil · 4 CTA
const TIMES = [0, 1600, 6800, 7700, 9400]

const GEAR_CHIPS = ['⚔️ Weapon IV', '🛡️ Set III', '🎒 Potions in the bag']

const TRAIL_FULL: WalkTrailMark[] = [
  { id: 1, age: 1, emoji: '📦' },
  { id: 2, age: 2, emoji: '🐺' },
  { id: 3, age: 3, emoji: '💰' },
  { id: 4, age: 4, emoji: '✨' },
]

const MODE_BY_STEP: WalkMode[] = ['idle', 'scroll', 'approach', 'idle', 'idle']

export default function Slide7BossApproach({ active, onNext }: JourneySlideProps) {
  const { locale, t } = useI18n()
  const { heroArt, heroName } = useJourney()
  const { step, advance } = useSlideScript(active, TIMES, { loopDelayMs: 6200 })

  const mode = MODE_BY_STEP[Math.min(step, MODE_BY_STEP.length - 1)]
  const nodeIndex = step >= 3 ? 5 : 4
  const arrived = step >= 3

  return (
    <div className="relative h-full w-full overflow-hidden">
      <motion.div
        className="absolute inset-0"
        animate={{ scale: arrived ? 1.18 : 1 }}
        transition={{ duration: 1.3, ease: 'easeInOut' }}
        style={{ transformOrigin: '50% 30%' }}
      >
        <JourneyWalkStage
          mode={mode}
          nodeIndex={nodeIndex}
          trailMarks={TRAIL_FULL}
          nextIsBoss
          avatar={heroArt}
          onApproachComplete={() => {
            if (step === 2) advance()
          }}
        >
          <NarrationDialog
            text={t('The trail ends ahead. Something ancient breathes among the roots...')}
            open={step === 0}
            onClose={advance}
          />
        </JourneyWalkStage>
      </motion.div>

      {/* vinheta que fecha ao chegar */}
      <motion.div
        className="absolute inset-0 pointer-events-none z-20"
        animate={{ opacity: arrived ? 1 : 0 }}
        transition={{ duration: 1.1 }}
        style={{ boxShadow: 'inset 0 0 180px 70px rgba(0,0,0,0.9)' }}
      />

      {/* Chips do gear */}
      <div className="absolute top-4 inset-x-3 z-30 flex flex-wrap gap-1.5 justify-center pointer-events-none">
        {GEAR_CHIPS.map((chip, i) => (
          <motion.span
            key={chip}
            initial={{ opacity: 0, y: -12, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.3 + i * 0.18, type: 'spring', stiffness: 240, damping: 18 }}
            className="px-2.5 py-1 rounded-full border text-[11px] font-bold text-amber-100"
            style={{
              borderColor: 'rgba(231,198,130,0.6)',
              background: 'linear-gradient(180deg, rgba(58,51,37,0.9), rgba(36,31,22,0.92))',
              boxShadow: '0 0 12px rgba(201,162,95,0.35)',
            }}
          >
            {t(chip)}
          </motion.span>
        ))}
      </div>

      {/* Placa do boss na chegada */}
      {arrived && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 16 }}
          className="absolute inset-x-0 top-[30%] z-30 flex justify-center pointer-events-none"
        >
          <div
            className="px-4 py-2 rounded-xl border-2 text-center backdrop-blur-md"
            style={{ borderColor: '#f39c12', background: 'rgba(10,8,5,0.8)', boxShadow: '0 0 30px rgba(243,156,18,0.35)' }}
          >
            <div className="text-lg font-black text-amber-300">👑 {pickName(FOREST.boss, locale)}</div>
            <div className="text-[11px] font-bold text-amber-100/80 uppercase tracking-[0.2em]">
              {pickTitle(FOREST.boss, locale)}
            </div>
          </div>
        </motion.div>
      )}

      {/* Faixa inferior */}
      <div className="absolute bottom-3 inset-x-3 z-30 flex items-end justify-between gap-3">
        <p className="text-[11px] text-white/80 max-w-[58%] drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
          {arrived
            ? t('The lair. No more nodes, no more fog — just you and the Warden.')
            : t('{name} returns to the Gloomwood Forest — this time, to the end of the trail.', { name: heroName })}
        </p>
        {step >= 4 && (
          <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={onNext}
            className="px-3.5 py-2 rounded-lg bg-primary hover:bg-primary-dark text-white text-xs font-bold shadow-[0_0_18px_rgba(233,69,96,0.55)] animate-pulse"
          >
            {t('⚔️ Face the Elder →')}
          </motion.button>
        )}
      </div>
    </div>
  )
}
