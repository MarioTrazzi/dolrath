'use client'

// Slide 1 — Criação de personagem. A arte existe nas 16 combinações
// (COMBO_ART), então raça e classe são escolhas INDEPENDENTES: acabou o par
// canônico travado.
//
// A encenação é o ponto do slide. Enquanto faltar escolher, a moldura fica
// VAZIA — nada de arte pronta esperando o clique, que era o que fazia a tela
// parecer uma galeria de 4 personagens à disposição. Escolhidas as duas
// coisas, o prompt é DATILOGRAFADO logo acima da moldura e só quando ele
// termina a arte revela. É a leitura correta: a imagem nasce da combinação do
// jogador, na hora.
//
// Visitante parado ~5s: sorteamos (ou completamos a metade que falta) e o
// mesmo ciclo roda sozinho — uma vez só, nunca em loop de slideshow.

import React, { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import CreationCardBackdrop from '@/components/character/CreationCardBackdrop'
import { getCreationVisual } from '@/lib/creationVisuals'
import { StatRevealRadar } from '@/app/character/create/components/StatRevealRadar'
import { useJourney } from '../JourneyContext'
import { useTypewriter } from '../useTypewriter'
import PromptPanel from './PromptPanel'
import { useT } from '@/lib/i18n/I18nProvider'
import type { TFunction } from '@/lib/i18n/t'
import {
  RACE_LIST,
  CLASS_LIST,
  RACE_PROMPT,
  CLASS_PROMPT,
  RACE_LABEL,
  CLASS_LABEL,
  RACE_HINT,
  CLASS_HINT,
  RACE_TRANSFORM_HINT,
  STYLE_PROMPT,
  buildArtPrompt,
  heroBaseStats,
  randomClassFor,
  randomRaceFor,
  type JourneySlideProps,
  type JourneyRaceId,
  type JourneyClassId,
} from '../journeyData'

/** Espera antes de escolher pelo visitante. */
const AUTO_PICK_MS = 5000
const BLANK = '▁▁▁▁▁'

/** Prompt "incompleto": as linhas que faltam aparecem como lacuna. */
function draftPrompt(
  t: TFunction,
  raceId: JourneyRaceId,
  classId: JourneyClassId,
  pickedRace: boolean,
  pickedClass: boolean,
): string {
  const style = t(STYLE_PROMPT).slice(0, 90) + '…'
  const race = pickedRace
    ? `${t('Race: {name}.', { name: t(RACE_LABEL[raceId]) })} ${t(RACE_PROMPT[raceId]).slice(0, 60)}…`
    : t('Race: {name}.', { name: BLANK })
  const cls = pickedClass
    ? `${t('Class: {name}.', { name: t(CLASS_LABEL[classId]) })} ${t(CLASS_PROMPT[classId]).slice(0, 60)}…`
    : t('Class: {name}.', { name: BLANK })
  return [style, race, cls].join('\n')
}

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
  const t = useT()
  const {
    raceId,
    classId,
    heroName,
    heroArt,
    visual,
    pickedRace,
    pickedClass,
    chosen,
    autoPicked,
    pickRace,
    pickClass,
    autoPick,
  } = useJourney()

  // O prompt COMPLETO é o que datilografa; o rascunho com lacunas é só o
  // estado de espera (e vai preenchendo conforme o visitante escolhe).
  const fullPrompt = buildArtPrompt(raceId, classId, t)
  const draft = draftPrompt(t, raceId, classId, pickedRace, pickedClass)
  const { shown, done } = useTypewriter(fullPrompt, { enabled: chosen })

  const generating = chosen && !done
  const revealed = chosen && done

  // Escolha pelo visitante parado: completa só o que falta, para não
  // atropelar a metade que ele já escolheu. Roda UMA vez.
  const autoRan = useRef(false)
  useEffect(() => {
    if (!active || chosen || autoRan.current) return
    const id = window.setTimeout(() => {
      if (autoRan.current) return
      autoRan.current = true
      if (pickedRace) pickClass(randomClassFor(raceId))
      else if (pickedClass) pickRace(randomRaceFor(classId))
      else autoPick()
    }, AUTO_PICK_MS)
    return () => window.clearTimeout(id)
  }, [active, chosen, pickedRace, pickedClass, raceId, classId, pickRace, pickClass, autoPick])

  const stats = heroBaseStats(raceId)
  const race = RACE_LIST.find(r => r.id === raceId)

  const promptPanel = (
    <PromptPanel
      text={fullPrompt}
      typed={chosen ? shown : draft}
      caret={generating}
      label={
        generating
          ? t('✍️ writing your art prompt…')
          : revealed
            ? t('✍️ the prompt that generated your art')
            : t('✍️ your art prompt · pick race and class')
      }
    />
  )

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
                  selected={pickedRace && r.id === raceId}
                  onPick={() => pickRace(r.id as JourneyRaceId)}
                />
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary mb-1.5">{t('2 · Choose your class')}</div>
            <div className="grid grid-cols-2 gap-2">
              {CLASS_LIST.map(c => (
                <MiniPickCard
                  key={c.id}
                  id={c.id}
                  name={t(CLASS_LABEL[c.id as JourneyClassId] ?? c.name)}
                  hint={t(CLASS_HINT[c.id as JourneyClassId] ?? c.abilities[0])}
                  selected={pickedClass && c.id === classId}
                  onPick={() => pickClass(c.id as JourneyClassId)}
                />
              ))}
            </div>
          </div>
          <div className="text-[10px] text-white/50 leading-snug">
            {t('16 race × class combinations — the art is generated for yours.')}
          </div>
          {/* Radar de atributos (o mesmo da tela de criação) */}
          <div className="hidden md:flex flex-1 min-h-0 items-start justify-center overflow-hidden">
            <div className="origin-top scale-[0.62]">
              <StatRevealRadar key={raceId} str={stats.str} agi={stats.agi} int={stats.int} def={stats.res} />
            </div>
          </div>
        </div>

        {/* Prompt EM CIMA, arte nascendo EMBAIXO — a ordem é o recado. */}
        <div className="md:w-[58%] min-h-[300px] md:min-h-0 flex flex-col gap-2">
          {promptPanel}

          <div
            className="relative flex-1 min-h-[260px] rounded-xl border-2 overflow-hidden"
            style={{ borderColor: visual.borderColor, boxShadow: visual.glow }}
          >
            {/* Trilha da Floresta Sombria (arte reaproveitada) como cenário do herói */}
            <img
              src="/backgrounds/_reserva/floresta-walk-map-v1-dolrath.webp"
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div
              className={`absolute inset-0 transition-colors duration-500 ${
                revealed ? 'bg-gradient-to-t from-black/80 via-black/20 to-black/40' : 'bg-black/75'
              }`}
            />

            {/* 1) Esperando escolha — moldura vazia, de propósito */}
            {!chosen && (
              <div className="absolute inset-0 grid place-items-center p-6 text-center">
                <div>
                  <div className="text-4xl mb-2 opacity-60">🎨</div>
                  <p className="text-sm font-bold text-white/85">
                    {t('Your art has not been painted yet')}
                  </p>
                  <p className="mt-1 text-[11px] text-white/55 max-w-[280px] mx-auto leading-relaxed">
                    {t('Pick a race and a class: the prompt above is written and the image is generated for your character.')}
                  </p>
                </div>
              </div>
            )}

            {/* 2) Gerando — o prompt ainda está sendo escrito */}
            {generating && (
              <div className="absolute inset-0 overflow-hidden">
                <motion.div
                  className="absolute inset-y-0 w-1/3"
                  style={{
                    background:
                      'linear-gradient(90deg, transparent, rgba(212,175,55,0.22), transparent)',
                  }}
                  animate={{ x: ['-40%', '340%'] }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: 'linear' }}
                />
                <div className="absolute inset-x-0 bottom-0 p-3 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="font-mono text-[10px] text-emerald-200/80">
                    {t('generating your character art…')}
                  </span>
                </div>
              </div>
            )}

            {/* 3) Revelada — a arte da combinação escolhida */}
            <AnimatePresence mode="popLayout">
              {revealed && (
                <motion.img
                  key={heroArt}
                  src={heroArt}
                  alt={heroName}
                  initial={{ opacity: 0, scale: 1.04, filter: 'blur(14px)' }}
                  animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.65, ease: 'easeOut' }}
                  className="absolute inset-0 m-auto h-[72%] object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.7)]"
                />
              )}
            </AnimatePresence>

            <AnimatePresence>
              {revealed && (
                <motion.div
                  key={`${raceId}-${classId}-plate`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3, delay: 0.25 }}
                  className="absolute inset-x-0 bottom-0 p-3 sm:p-4"
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
                  {autoPicked && (
                    <div className="mt-1.5 text-[10px] text-amber-300/85">
                      {t('🎲 We drew this one for you — change race or class to generate another.')}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Radar no mobile (desktop mostra na coluna esquerda) */}
          <div className="md:hidden flex justify-center overflow-hidden max-h-[220px]">
            <div className="origin-top scale-[0.6]">
              <StatRevealRadar key={`m-${raceId}`} str={stats.str} agi={stats.agi} int={stats.int} def={stats.res} />
            </div>
          </div>
        </div>
      </div>

      {/* CTA próxima etapa */}
      {revealed && (
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
