'use client'

// Slide 3 — Masmorra REAL: o WalkScene da run de verdade (vasculhar a mata,
// o "?" revelando, a estilingada até o nó), d20 do destino e um BOM DROP de
// materiais no primeiro nó — o espólio que alimenta a Forja/Alquimia do
// próximo slide.

import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { NarrationDialog, DiceOverlay } from '@/components/dungeon/DungeonMap'
import type { WalkMode, WalkTrailMark } from '@/components/dungeon/WalkScene'
import JourneyWalkStage, { FOREST } from './JourneyWalkStage'
import LootTiles, { type LootTileDef } from './LootTiles'
import { useJourney } from '../JourneyContext'
import { useSlideScript } from '../useSlideScript'
import type { JourneySlideProps } from '../journeyData'

// 0 idle+narração · 1 scroll (5.2s) · 2 approach · 3 chegada+d20 rolando ·
// 4 d20 crava 19 · 5 card do drop · 6 CTA
const TIMES = [0, 1600, 6800, 7700, 8700, 9700, 13800]

const DROP_TILES: LootTileDef[] = [
  { name: 'Ferro', emoji: '🔩', label: 'Ferro ×3', rarity: 'UNCOMMON' },
  { name: 'Couro', emoji: '🟤', label: 'Couro ×2', rarity: 'COMMON' },
  { name: 'Erva Medicinal', emoji: '🌿', label: 'Erva Medicinal ×2', rarity: 'COMMON' },
  { name: 'Água Pura', emoji: '💧', label: 'Água Pura ×1', rarity: 'COMMON' },
  { name: 'Cristal de Mana', emoji: '🔮', label: 'Cristal de Mana ×1', rarity: 'UNCOMMON' },
  { name: 'Pedra Negra (Arma)', emoji: '⚒️', label: 'Pedra Negra (Arma) ×1', highlight: true },
]

const MODE_BY_STEP: WalkMode[] = ['idle', 'scroll', 'approach', 'idle', 'idle', 'idle', 'idle']

export default function Slide3Dungeon({ active, onNext }: JourneySlideProps) {
  const { heroArt } = useJourney()
  const { step, advance } = useSlideScript(active, TIMES, { loopDelayMs: 5200 })

  const mode = MODE_BY_STEP[Math.min(step, MODE_BY_STEP.length - 1)]
  const nodeIndex = step >= 3 ? 1 : 0
  const trailMarks: WalkTrailMark[] = step >= 5 ? [{ id: 1, age: 1, emoji: '📦' }] : []
  const showNarration = step === 0
  const dice = step === 3 ? 'rolling' : step === 4 ? 'result' : null

  return (
    <JourneyWalkStage
      mode={mode}
      nodeIndex={nodeIndex}
      trailMarks={trailMarks}
      avatar={heroArt}
      onApproachComplete={() => {
        if (step === 2) advance()
      }}
    >
      <NarrationDialog text={FOREST.enterText} open={showNarration} onClose={advance} />
      <DiceOverlay
        rolling={dice != null}
        result={dice === 'result' ? { roll: 17, modifier: 2, total: 19 } : null}
      />

      {/* Card do BOM DROP (mesma linguagem do card de evento da run) */}
      <AnimatePresence>
        {step >= 5 && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-x-3 top-8 sm:top-10 z-30 flex justify-center"
          >
            <div
              className="w-full max-w-sm rounded-xl border px-4 py-3 backdrop-blur-xl"
              style={{
                background: 'linear-gradient(180deg, rgba(20,18,14,0.94), rgba(12,11,8,0.96))',
                borderColor: FOREST.accentSoft,
                boxShadow: '0 12px 30px -8px rgba(0,0,0,0.7)',
              }}
            >
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-sm font-black text-white">🎲 19 — Achado de sorte!</span>
                <span className="text-[10px] font-bold text-amber-300">+120 🪙</span>
              </div>
              <p className="text-[11px] text-white/70 mb-2.5">
                Entre as raízes, um esconderijo de contrabandistas: materiais de forja,
                ingredientes de alquimia e uma Pedra Negra.
              </p>
              <LootTiles tiles={DROP_TILES} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Legenda + CTA */}
      <div className="absolute bottom-3 inset-x-3 z-30 flex items-end justify-between gap-3 pointer-events-none">
        <p className="text-[11px] text-white/75 max-w-[58%] drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
          🌫️ A exploração real: vasculhe a mata, role o d20 e descubra o que o nó esconde
          — tesouro, emboscada ou bênção.
        </p>
        {step >= 6 ? (
          <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={onNext}
            className="pointer-events-auto px-3.5 py-2 rounded-lg bg-primary hover:bg-primary-dark text-white text-xs font-bold shadow-[0_0_18px_rgba(233,69,96,0.5)] animate-pulse"
          >
            Forjar com o espólio →
          </motion.button>
        ) : (
          step >= 3 && (
            <button
              onClick={advance}
              className="pointer-events-auto px-3 py-1.5 rounded-lg border border-white/20 bg-black/50 backdrop-blur-md text-white/85 text-[11px] font-bold hover:bg-black/70"
            >
              Avançar ▸
            </button>
          )
        )}
      </div>
    </JourneyWalkStage>
  )
}
