'use client'

// Slide 2 — A ficha: o card quadrado do personagem (mesma composição do
// dashboard: CreationCardBackdrop + arte da raça + chips de vitals),
// revelado em sequência como um "unboxing" da NFT.

import React from 'react'
import { motion } from 'framer-motion'
import CreationCardBackdrop from '@/components/character/CreationCardBackdrop'
import { CharacterStatChips } from '@/components/character/CharacterStatChips'
import { useJourney } from '../JourneyContext'
import { heroBaseStats, type JourneySlideProps } from '../journeyData'
import { useSlideScript } from '../useSlideScript'

// 0 entrada · 1 nome · 2 chips raça/classe · 3 vitals · 4 selo NFT · 5 hint
const TIMES = [0, 700, 1400, 2100, 2900, 3800]

export default function Slide2Sheet({ active, onNext }: JourneySlideProps) {
  const { raceId, classId, heroName, heroArt, visual } = useJourney()
  const { step, cycle } = useSlideScript(active, TIMES, { loopDelayMs: 5200 })
  const stats = heroBaseStats(raceId)

  return (
    <div className="relative h-full w-full grid place-items-center p-4 pt-12 overflow-hidden">
      {/* brilho ambiente */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(60% 45% at 50% 45%, ${visual.raceVisual.accentSoft}, transparent 70%)` }}
      />

      <motion.div
        key={`${cycle}-${raceId}-${classId}`}
        initial={{ rotateY: 70, opacity: 0, scale: 0.85 }}
        animate={{ rotateY: 0, opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 130, damping: 16 }}
        className="relative w-full max-w-[340px] sm:max-w-[380px] aspect-square rounded-xl border-2 overflow-hidden"
        style={{ borderColor: visual.borderColor, boxShadow: visual.glow, perspective: 800 }}
      >
        <div className="absolute inset-0">
          <CreationCardBackdrop theme={visual.backdropTheme} />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-black/35" />

        {/* Arte do herói */}
        <motion.img
          src={heroArt}
          alt={heroName}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="absolute inset-x-0 bottom-6 mx-auto h-[72%] object-contain drop-shadow-[0_10px_28px_rgba(0,0,0,0.75)]"
        />

        {/* Selo NFT */}
        {step >= 4 && (
          <motion.span
            initial={{ scale: 2.2, opacity: 0, rotate: -18 }}
            animate={{ scale: 1, opacity: 1, rotate: -8 }}
            transition={{ type: 'spring', stiffness: 220, damping: 14 }}
            className="absolute top-9 right-3 px-2 py-1 rounded border-2 text-[10px] font-black uppercase tracking-[0.2em]"
            style={{ borderColor: visual.raceVisual.accent, color: visual.raceVisual.accent, background: 'rgba(0,0,0,0.5)' }}
          >
            NFT · sua de verdade
          </motion.span>
        )}

        {/* Placa inferior */}
        <div className="absolute inset-x-0 bottom-0 p-3.5">
          {step >= 1 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <span className="text-xl font-black text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.95)]">
                {heroName}
              </span>
              <span className="ml-2 text-[11px] font-bold text-amber-300/90">Lv 1</span>
            </motion.div>
          )}
          {step >= 2 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-wrap gap-1.5 mt-1"
            >
              <span
                className="px-2 py-0.5 rounded-[3px] text-[10px] font-bold text-white border"
                style={{ background: `${visual.raceVisual.accent}2e`, borderColor: `${visual.raceVisual.accent}66` }}
              >
                {visual.raceVisual.emoji} {raceId.charAt(0).toUpperCase() + raceId.slice(1)}
              </span>
              <span
                className="px-2 py-0.5 rounded-[3px] text-[10px] font-bold text-white border"
                style={{ background: `${visual.classVisual.accent}2e`, borderColor: `${visual.classVisual.accent}66` }}
              >
                {visual.classVisual.emoji} {classId === 'warrior' ? 'Guerreiro' : classId === 'rogue' ? 'Ladino' : classId === 'mage' ? 'Mago' : 'Monge'}
              </span>
            </motion.div>
          )}
          {step >= 3 && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-1.5">
              <CharacterStatChips
                vitals={{
                  hp: stats.hp,
                  maxHp: stats.hp,
                  mp: stats.mp,
                  maxMp: stats.mp,
                  stamina: 100,
                  maxStamina: 100,
                  power: stats.str + stats.agi + stats.int + stats.res,
                }}
              />
            </motion.div>
          )}
        </div>
      </motion.div>

      {/* Legenda + CTA */}
      <div className="absolute bottom-3 inset-x-3 flex items-end justify-between gap-3 z-30">
        <p className="text-[11px] text-textsec max-w-[60%]">
          Ficha viva: XP, gear e aprimoramentos refletem direto na sua NFT.
        </p>
        {step >= 5 && (
          <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={onNext}
            className="px-3.5 py-2 rounded-lg bg-primary hover:bg-primary-dark text-white text-xs font-bold shadow-[0_0_18px_rgba(233,69,96,0.5)] animate-pulse"
          >
            Entrar na masmorra →
          </motion.button>
        )}
      </div>
    </div>
  )
}
