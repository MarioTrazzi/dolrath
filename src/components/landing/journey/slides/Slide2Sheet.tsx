'use client'

// Slide 2 — A ficha: card quadrado do personagem com FLIP automático
// base⇄forma transformada (mesma animação do RaceFlipCard da landing),
// o prompt REAL que criou a arte transformada, stats base e a árvore de
// habilidades da classe ao lado.

import React, { useMemo } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { CharacterStatChips } from '@/components/character/CharacterStatChips'
import { TRANSFORMATION_CONFIG, type TransformationType } from '@/lib/transformationSystem'
import { useJourney } from '../JourneyContext'
import PromptPanel from './PromptPanel'
import MiniSkillTree from './MiniSkillTree'
import {
  heroBaseStats,
  RACE_HERO,
  RACE_LIST,
  FORM_BY_RACE,
  FORM_LABEL,
  FORM_PROMPT_PT,
  CLASS_LABEL,
  type JourneySlideProps,
} from '../journeyData'
import { useSlideScript } from '../useSlideScript'

// 0 entrada · 1 nome · 2 chips · 3 vitals · 4 selo NFT · 5 FLIP p/ forma +
// prompt · 6 flip de volta · 7 CTA
const TIMES = [0, 700, 1400, 2100, 2900, 4200, 8200, 9800]

export default function Slide2Sheet({ active, onNext }: JourneySlideProps) {
  const { raceId, classId, heroName, heroArt, visual } = useJourney()
  const { step, cycle } = useSlideScript(active, TIMES, { loopDelayMs: 5600 })
  const reduced = useReducedMotion()
  const stats = heroBaseStats(raceId)
  const race = RACE_LIST.find(r => r.id === raceId)

  const form = FORM_BY_RACE[raceId]
  const formLabel = FORM_LABEL[raceId]
  const flipped = step === 5
  const img = flipped ? RACE_HERO[raceId].artTransformed : heroArt

  // Stats REAIS da forma: multiplicadores de transformationSystem sobre a base
  // — o flip mostra que transformar muda os números, não só a arte.
  const shown = useMemo(() => {
    const mods = TRANSFORMATION_CONFIG[form as TransformationType]?.statModifiers
    if (!flipped || !mods) return { ...stats, boosted: false }
    return {
      ...stats,
      str: Math.round(stats.str * mods.strength),
      agi: Math.round(stats.agi * mods.agility),
      int: Math.round(stats.int * mods.intelligence),
      res: Math.round(stats.res * mods.defense),
      hp: Math.floor(stats.hp * mods.hp),
      mp: Math.floor(stats.mp * (mods.mpPool ?? 1)),
      boosted: true,
    }
  }, [flipped, form, stats])

  return (
    <div className="relative h-full w-full overflow-y-auto md:overflow-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {/* brilho ambiente */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(60% 45% at 32% 45%, ${flipped ? `${formLabel.glow}2e` : visual.raceVisual.accentSoft}, transparent 70%)`,
        }}
      />

      <div className="h-full flex flex-col md:flex-row gap-3 p-3 pt-5 sm:p-4 items-center md:items-stretch">
        {/* Card com flip + prompt da forma logo abaixo */}
        <div className="md:w-[46%] flex flex-col items-center justify-center gap-2 min-h-0">
          <motion.div
            key={`${cycle}-${raceId}`}
            initial={{ rotateY: 70, opacity: 0, scale: 0.85 }}
            animate={{ rotateY: 0, opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 130, damping: 16 }}
            className="relative w-full max-w-[250px] sm:max-w-[280px] aspect-[5/7] rounded-xl border-2 overflow-hidden"
            style={{
              borderColor: flipped ? formLabel.glow : visual.borderColor,
              boxShadow: flipped ? `0 0 34px ${formLabel.glow}66` : visual.glow,
              perspective: 900,
            }}
          >
            {/* Mesmo cenário da trilha usado no card do Slide 1 */}
            <img
              src="/backgrounds/_reserva/floresta-walk-map-v1-dolrath.webp"
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-black/35" />

            {/* aura da forma */}
            <AnimatePresence>
              {flipped && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 pointer-events-none"
                  style={{ background: `radial-gradient(60% 55% at 50% 45%, ${formLabel.glow}33, transparent 70%)` }}
                />
              )}
            </AnimatePresence>

            {/* Arte com flip (padrão RaceFlipCard) — cobre o card inteiro */}
            <AnimatePresence mode="wait">
              <motion.img
                key={img}
                src={img}
                alt={heroName}
                initial={reduced ? { opacity: 0 } : { rotateY: -90, opacity: 0 }}
                animate={reduced ? { opacity: 1 } : { rotateY: 0, opacity: 1 }}
                exit={reduced ? { opacity: 0 } : { rotateY: 90, opacity: 0 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                className="absolute inset-0 h-full w-full object-cover object-top"
                style={{ backfaceVisibility: 'hidden' }}
              />
            </AnimatePresence>
            {/* Véu p/ leitura da placa por cima da arte */}
            <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/90 to-transparent pointer-events-none" />

            {/* Selo NFT / selo da forma */}
            {step >= 4 && (
              <motion.span
                key={flipped ? 'form' : 'nft'}
                initial={{ scale: 2.2, opacity: 0, rotate: -18 }}
                animate={{ scale: 1, opacity: 1, rotate: -8 }}
                transition={{ type: 'spring', stiffness: 220, damping: 14 }}
                className="absolute top-2 right-2 px-2 py-1 rounded border-2 text-[10px] font-black uppercase tracking-[0.18em]"
                style={{
                  borderColor: flipped ? formLabel.glow : visual.raceVisual.accent,
                  color: flipped ? formLabel.glow : visual.raceVisual.accent,
                  background: 'rgba(0,0,0,0.55)',
                }}
              >
                {flipped ? `${formLabel.emoji} ${formLabel.name}` : 'NFT · sua de verdade'}
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
                    {visual.raceVisual.emoji} {race?.name}
                  </span>
                  <span
                    className="px-2 py-0.5 rounded-[3px] text-[10px] font-bold text-white border"
                    style={{ background: `${visual.classVisual.accent}2e`, borderColor: `${visual.classVisual.accent}66` }}
                  >
                    {visual.classVisual.emoji} {CLASS_LABEL[classId]}
                  </span>
                  <span className="px-2 py-0.5 rounded-[3px] text-[10px] font-bold text-white/85 border border-white/25 bg-white/10">
                    {formLabel.emoji} {formLabel.name}
                  </span>
                </motion.div>
              )}
              {step >= 3 && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-1.5">
                  <CharacterStatChips
                    vitals={{
                      hp: shown.hp, maxHp: shown.hp,
                      mp: shown.mp, maxMp: shown.mp,
                      stamina: 100, maxStamina: 100,
                      power: shown.str + shown.agi + shown.int + shown.res,
                    }}
                  />
                  {/* Stats pulam junto com o flip: a forma multiplica os números */}
                  <motion.div
                    key={shown.boosted ? 'form-stats' : 'base-stats'}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[11px] font-combat text-white/80"
                  >
                    <span className="text-red-300">💪 STR {shown.str}{shown.boosted && ' ⬆'}</span>
                    <span className="text-emerald-300">🌀 AGI {shown.agi}{shown.boosted && ' ⬆'}</span>
                    <span className="text-sky-300">🧠 INT {shown.int}{shown.boosted && ' ⬆'}</span>
                    <span className="text-amber-300">🛡️ RES {shown.res}{shown.boosted && ' ⬆'}</span>
                    {shown.boosted && (
                      <span className="font-bold" style={{ color: formLabel.glow }}>
                        {formLabel.emoji} stats da forma
                      </span>
                    )}
                  </motion.div>
                </motion.div>
              )}
            </div>
          </motion.div>

          {/* Prompt da forma, estático abaixo do card — deixa a árvore inteira p/ ela */}
          <div className="w-full max-w-[250px] sm:max-w-[280px] shrink-0">
            <PromptPanel
              text={`${formLabel.emoji} ${FORM_PROMPT_PT[raceId].slice(0, 130)}…`}
              label="✍️ prompt da forma transformada · gerada da SUA arte base"
            />
          </div>
        </div>

        {/* Coluna direita: só a árvore de skills, no tamanho cheio */}
        <div className="md:w-[54%] flex flex-col gap-2 min-h-0 w-full">
          <div className="relative flex-1 min-h-[220px] rounded-lg border border-white/10 bg-black/30 overflow-hidden">
            <div className="absolute top-2 left-3 z-10 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
              🌳 Árvore de habilidades · {CLASS_LABEL[classId]}
            </div>
            {/* Geometria REAL da classe (espiral/espada/flecha/mandala), ajustada à caixa */}
            <div className="absolute inset-0 pt-9 pb-7 px-2 pointer-events-none">
              <MiniSkillTree key={classId} classId={classId} form={form} />
            </div>
            <div className="absolute bottom-2 inset-x-3 text-[10px] text-white/60 text-center">
              A cada nível, pontos para evoluir os caminhos da sua classe — em página dedicada no jogo.
            </div>
          </div>
        </div>
      </div>

      {/* CTA */}
      {step >= 7 && (
        <motion.button
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={onNext}
          className="absolute bottom-3 right-3 z-30 px-3.5 py-2 rounded-lg bg-primary hover:bg-primary-dark text-white text-xs font-bold shadow-[0_0_18px_rgba(233,69,96,0.5)] animate-pulse"
        >
          Entrar na masmorra →
        </motion.button>
      )}
    </div>
  )
}
