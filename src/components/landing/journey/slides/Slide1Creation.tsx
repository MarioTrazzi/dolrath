'use client'

// Slide 1 — Criação de personagem: raças e classes REAIS em pares
// CANÔNICOS (a arte do Draconiano É um guerreiro, a da Elfa É uma
// ladina...) — escolher raça trava a classe casada e vice-versa, então a
// imagem nunca mente. Inclui o radar de atributos real da criação e o
// trecho do prompt que gera a arte (o jogador ajuda a escolher o estilo).

import React, { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import CreationCardBackdrop from '@/components/character/CreationCardBackdrop'
import { getCreationVisual } from '@/lib/creationVisuals'
import { StatRevealRadar } from '@/app/character/create/components/StatRevealRadar'
import { useJourney } from '../JourneyContext'
import PromptPanel from './PromptPanel'
import { useT } from '@/lib/i18n/I18nProvider'
import {
  RACE_LIST,
  CLASS_LIST,
  CANON_CLASS,
  CANON_RACE,
  RACE_PROMPT,
  CLASS_PROMPT,
  RACE_LABEL,
  CLASS_LABEL,
  RACE_HINT,
  CLASS_HINT,
  RACE_TRANSFORM_HINT,
  heroArt,
  heroBaseStats,
  type JourneySlideProps,
  type JourneyRaceId,
  type JourneyClassId,
} from '../journeyData'

const GHOST_RACES: JourneyRaceId[] = ['draconiano', 'elfo', 'metamorfo', 'humano']

function MiniPickCard({
  id,
  name,
  hint,
  selected,
  linked,
  linkedTitle,
  onPick,
}: {
  id: string
  name: string
  hint: string
  selected: boolean
  /** Selecionado por arrasto do par canônico (selo 🔗). */
  linked?: boolean
  linkedTitle?: string
  onPick: () => void
}) {
  const visual = getCreationVisual(id)
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      onClick={onPick}
      className="relative overflow-hidden rounded-lg border-2 text-left p-2.5 sm:p-3 transition-all"
      style={{
        borderColor: selected ? visual.accent : `${visual.accent}44`,
        boxShadow: selected ? `0 0 18px ${visual.accentSoft}` : undefined,
      }}
    >
      <div className="absolute inset-0">
        <CreationCardBackdrop theme={visual.theme} />
      </div>
      <div className={`absolute inset-0 transition-colors ${selected ? 'bg-black/35' : 'bg-black/55'}`} />
      <div className="relative flex items-center gap-2.5">
        <span
          className="w-9 h-9 sm:w-10 sm:h-10 rounded-md grid place-items-center text-lg border shrink-0"
          style={{ background: `linear-gradient(135deg, ${visual.accent}55, ${visual.accent}22)`, borderColor: `${visual.accent}66` }}
        >
          {visual.emoji}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-bold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] truncate">
            {name}
          </span>
          <span className="block text-[10px] text-white/65 truncate">{hint}</span>
        </span>
        {selected && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="ml-auto w-5 h-5 rounded-full grid place-items-center text-[11px] text-white shrink-0"
            style={{ backgroundColor: visual.accent }}
            title={linked ? linkedTitle : undefined}
          >
            {linked ? '🔗' : '✓'}
          </motion.span>
        )}
      </div>
    </motion.button>
  )
}

export default function Slide1Creation({ active, onNext }: JourneySlideProps) {
  const journey = useJourney()
  const t = useT()
  const { raceId, classId, heroName, visual, userPicked, pickRace, pickClass } = journey

  // Cursor fantasma: cicla os pares canônicos até o visitante clicar
  useEffect(() => {
    if (!active || userPicked) return
    if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let i = GHOST_RACES.indexOf(raceId)
    const id = setInterval(() => {
      i = (i + 1) % GHOST_RACES.length
      pickRace(GHOST_RACES[i])
    }, 2800)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, userPicked])

  const stats = heroBaseStats(raceId)
  const race = RACE_LIST.find(r => r.id === raceId)
  const promptExcerpt =
    `${t('Race: {name}.', { name: t(RACE_LABEL[raceId]) })} ${t(RACE_PROMPT[raceId]).slice(0, 100)}… ` +
    `${t(CLASS_PROMPT[classId]).slice(0, 60)}…`

  return (
    <div className="relative h-full w-full overflow-y-auto md:overflow-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="h-full flex flex-col md:flex-row gap-3 p-3 pt-5 sm:p-4">
        {/* Coluna de escolha + radar */}
        <div className="md:w-[42%] flex flex-col gap-2 min-h-0">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary mb-1.5">{t('1 · Choose your race')}</div>
            <div className="grid grid-cols-2 gap-2">
              {RACE_LIST.map(r => (
                <MiniPickCard
                  key={r.id}
                  id={r.id}
                  name={t(RACE_LABEL[r.id as JourneyRaceId] ?? r.name)}
                  hint={t(RACE_HINT[r.id as JourneyRaceId] ?? r.specialAbility)}
                  selected={r.id === raceId}
                  onPick={() => pickRace(r.id as JourneyRaceId, true)}
                />
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary mb-1.5">{t('2 · Class (canonical pair)')}</div>
            <div className="grid grid-cols-2 gap-2">
              {CLASS_LIST.map(c => (
                <MiniPickCard
                  key={c.id}
                  id={c.id}
                  name={t(CLASS_LABEL[c.id as JourneyClassId] ?? c.name)}
                  hint={t(CLASS_HINT[c.id as JourneyClassId] ?? c.abilities[0])}
                  selected={c.id === classId}
                  linked={c.id === CANON_CLASS[raceId] && CANON_RACE[c.id as JourneyClassId] === raceId}
                  linkedTitle={t('Canonical pair of the chosen race')}
                  onPick={() => pickClass(c.id as JourneyClassId, true)}
                />
              ))}
            </div>
          </div>
          {/* Prompt da arte junto do gráfico de stats — estático, fora da imagem */}
          <div className="hidden md:block">
            <PromptPanel
              text={promptExcerpt}
              label={t('✍️ your art prompt · you help pick the style')}
            />
          </div>
          {/* Radar de atributos (o mesmo da tela de criação) */}
          <div className="hidden md:flex flex-1 min-h-0 items-start justify-center overflow-hidden">
            <div className="origin-top scale-[0.62]">
              <StatRevealRadar key={raceId} str={stats.str} agi={stats.agi} int={stats.int} def={stats.res} />
            </div>
          </div>
        </div>

        {/* Prévia do herói com o prompt sobre a imagem */}
        <div className="md:w-[58%] min-h-[300px] md:min-h-0 flex flex-col gap-2">
          <div
            className="relative flex-1 min-h-[280px] rounded-xl border-2 overflow-hidden"
            style={{ borderColor: visual.borderColor, boxShadow: visual.glow }}
          >
            {/* Trilha da Floresta Sombria (arte reaproveitada) como cenário do herói */}
            <img
              src="/backgrounds/_reserva/floresta-walk-map-v1-dolrath.webp"
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/40" />
            <AnimatePresence mode="popLayout">
              <motion.img
                key={raceId}
                src={heroArt(raceId)}
                alt={heroName}
                initial={{ opacity: 0, y: 16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 1.02 }}
                transition={{ duration: 0.35 }}
                className="absolute inset-0 m-auto h-[72%] object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.7)]"
              />
            </AnimatePresence>

            <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4">
              <AnimatePresence mode="popLayout">
                <motion.div
                  key={`${raceId}-${classId}-plate`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="text-lg sm:text-xl font-black text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
                    {heroName}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white border"
                      style={{ background: `${visual.raceVisual.accent}33`, borderColor: `${visual.raceVisual.accent}77` }}
                    >
                      {visual.raceVisual.emoji} {t(RACE_LABEL[raceId])}
                    </span>
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white border"
                      style={{ background: `${visual.classVisual.accent}33`, borderColor: `${visual.classVisual.accent}77` }}
                    >
                      {visual.classVisual.emoji} {t(CLASS_LABEL[classId])}
                    </span>
                    {race?.transformation && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white/85 border border-white/25 bg-white/10">
                        ✨ {t(RACE_TRANSFORM_HINT[raceId])}
                      </span>
                    )}
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {/* Prompt + radar no mobile (desktop mostra na coluna esquerda) */}
          <div className="md:hidden flex flex-col gap-2">
            <PromptPanel
              text={promptExcerpt}
              label={t('✍️ your art prompt · you help pick the style')}
            />
            <div className="flex justify-center overflow-hidden max-h-[220px]">
              <div className="origin-top scale-[0.6]">
                <StatRevealRadar key={`m-${raceId}`} str={stats.str} agi={stats.agi} int={stats.int} def={stats.res} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CTA próxima etapa */}
      {userPicked && (
        <motion.button
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={onNext}
          className="absolute bottom-3 right-3 z-30 px-3.5 py-2 rounded-lg bg-primary hover:bg-primary-dark text-white text-xs font-bold shadow-[0_0_18px_rgba(233,69,96,0.5)] animate-pulse"
        >
          {t('See the sheet →')}
        </motion.button>
      )}
    </div>
  )
}
