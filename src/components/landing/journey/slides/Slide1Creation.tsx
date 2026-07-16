'use client'

// Slide 1 — Criação de personagem: raças e classes REAIS (dados +
// identidade visual da tela de criação), em cards compactos p/ caber
// no viewport do carrossel. Um "cursor fantasma" cicla as combinações
// até o primeiro clique do visitante — a escolha atravessa a jornada.

import React, { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import CreationCardBackdrop from '@/components/character/CreationCardBackdrop'
import { getCreationVisual } from '@/lib/creationVisuals'
import { useJourney } from '../JourneyContext'
import {
  RACE_LIST,
  CLASS_LIST,
  heroArt,
  heroBaseStats,
  type JourneySlideProps,
  type JourneyRaceId,
  type JourneyClassId,
} from '../journeyData'

const GHOST_COMBOS: [JourneyRaceId, JourneyClassId][] = [
  ['draconiano', 'warrior'],
  ['elfo', 'mage'],
  ['metamorfo', 'rogue'],
  ['humano', 'monk'],
]

function MiniPickCard({
  id,
  name,
  hint,
  selected,
  onPick,
}: {
  id: string
  name: string
  hint: string
  selected: boolean
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
          >
            ✓
          </motion.span>
        )}
      </div>
    </motion.button>
  )
}

export default function Slide1Creation({ active, onNext }: JourneySlideProps) {
  const journey = useJourney()
  const { raceId, classId, heroName, visual, userPicked, setChoice } = journey

  // Cursor fantasma: cicla combinações a cada 2.6s até o visitante clicar
  useEffect(() => {
    if (!active || userPicked) return
    if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let i = GHOST_COMBOS.findIndex(([r]) => r === raceId)
    const id = setInterval(() => {
      i = (i + 1) % GHOST_COMBOS.length
      setChoice(GHOST_COMBOS[i][0], GHOST_COMBOS[i][1])
    }, 2600)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, userPicked])

  const stats = heroBaseStats(raceId)
  const race = RACE_LIST.find(r => r.id === raceId)

  return (
    <div className="relative h-full w-full overflow-y-auto md:overflow-hidden">
      <div className="h-full flex flex-col md:flex-row gap-3 p-3 pt-12 sm:p-4 sm:pt-12">
        {/* Coluna de escolha */}
        <div className="md:w-1/2 flex flex-col gap-2.5 min-h-0">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary mb-1.5">1 · Escolha sua raça</div>
            <div className="grid grid-cols-2 gap-2">
              {RACE_LIST.map(r => (
                <MiniPickCard
                  key={r.id}
                  id={r.id}
                  name={r.name}
                  hint={r.specialAbility}
                  selected={r.id === raceId}
                  onPick={() => setChoice(r.id as JourneyRaceId, classId, true)}
                />
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary mb-1.5">2 · Escolha sua classe</div>
            <div className="grid grid-cols-2 gap-2">
              {CLASS_LIST.map(c => (
                <MiniPickCard
                  key={c.id}
                  id={c.id}
                  name={c.name}
                  hint={c.abilities[0]}
                  selected={c.id === classId}
                  onPick={() => setChoice(raceId, c.id as JourneyClassId, true)}
                />
              ))}
            </div>
          </div>
          <p className="text-[11px] text-textsec mt-auto hidden md:block">
            {userPicked
              ? 'Boa escolha — o resto da jornada é dele(a).'
              : 'Clique para escolher — o herói atravessa todas as etapas com você.'}
          </p>
        </div>

        {/* Prévia do herói */}
        <div className="md:w-1/2 min-h-[240px] md:min-h-0">
          <div
            className="relative h-full min-h-[240px] rounded-xl border-2 overflow-hidden"
            style={{ borderColor: visual.borderColor, boxShadow: visual.glow }}
          >
            <div className="absolute inset-0">
              <CreationCardBackdrop theme={visual.backdropTheme} />
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/30" />
            <AnimatePresence mode="popLayout">
              <motion.img
                key={raceId}
                src={heroArt(raceId)}
                alt={heroName}
                initial={{ opacity: 0, y: 16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 1.02 }}
                transition={{ duration: 0.35 }}
                className="absolute inset-x-0 bottom-0 mx-auto h-[78%] object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.7)]"
              />
            </AnimatePresence>
            <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4">
              <AnimatePresence mode="popLayout">
                <motion.div
                  key={`${raceId}-${classId}`}
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
                      {visual.raceVisual.emoji} {race?.name}
                    </span>
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white border"
                      style={{ background: `${visual.classVisual.accent}33`, borderColor: `${visual.classVisual.accent}77` }}
                    >
                      {visual.classVisual.emoji} {CLASS_LIST.find(c => c.id === classId)?.name}
                    </span>
                    {race?.transformation && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white/85 border border-white/25 bg-white/10">
                        ✨ {race.transformation}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-[11px] font-combat text-white/80">
                    <span className="text-red-300">💪 STR {stats.str}</span>
                    <span className="text-emerald-300">🌀 AGI {stats.agi}</span>
                    <span className="text-sky-300">🧠 INT {stats.int}</span>
                    <span className="text-amber-300">🛡️ RES {stats.res}</span>
                  </div>
                </motion.div>
              </AnimatePresence>
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
          Ver a ficha →
        </motion.button>
      )}
    </div>
  )
}
