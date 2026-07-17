'use client'

// ============================================================
// Jornada Dolrath — carrossel da landing que percorre a
// experiência REAL do jogo em 8 etapas (criação → ficha →
// masmorra → craft → boss → PvP → ranking), usando os
// componentes de produção com roteiros mockados.
//
// Só o slide ativo é montado (next/dynamic + poster leve);
// o chunk do próximo slide é pré-carregado em idle.
// ============================================================

import React, { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { GOLD, GOLD_BRIGHT } from '@/components/crafting/bdoTheme'
import { SectionHeading } from '@/components/landing/ui'
import { JourneyProvider } from './JourneyContext'
import { JourneyDivider, JourneyWindow } from './JourneyFrame'
import SlidePoster, { type SlideMeta } from './SlidePoster'
import type { JourneySlideProps } from './journeyData'

export const JOURNEY_STEPS: SlideMeta[] = [
  { n: 1, emoji: '🧬', label: 'Crie seu herói', sub: 'Raça + classe canônica' },
  { n: 2, emoji: '📜', label: 'A ficha', sub: 'Transformação e skills' },
  { n: 3, emoji: '🌲', label: 'Masmorra', sub: 'Explore sob a névoa' },
  { n: 4, emoji: '⚒️', label: 'Forja & Craft', sub: 'Materiais viram poder' },
  { n: 5, emoji: '💎', label: 'Aprimoramento', sub: 'Arma III → IV' },
  { n: 6, emoji: '🎒', label: 'Gear & Mochila', sub: 'Set III + arma IV' },
  { n: 7, emoji: '👑', label: 'Rumo ao boss', sub: 'Fim da trilha' },
  { n: 8, emoji: '⚔️', label: 'Boss fight', sub: 'Anciã da Mata' },
  { n: 9, emoji: '🏟️', label: 'PvP', sub: 'Combate por turnos' },
  { n: 10, emoji: '🏆', label: 'Ranking', sub: 'Top 10 divide o prêmio' },
]

// Loaders separados p/ permitir prefetch manual do próximo slide.
const SLIDE_LOADERS = [
  () => import('./slides/Slide1Creation'),
  () => import('./slides/Slide2Sheet'),
  () => import('./slides/Slide3Dungeon'),
  () => import('./slides/Slide4Crafting'),
  () => import('./slides/Slide5Enhancement'),
  () => import('./slides/Slide6GearSheet'),
  () => import('./slides/Slide7BossApproach'),
  () => import('./slides/Slide8BossFight'),
  () => import('./slides/Slide9Pvp'),
  () => import('./slides/Slide10Ranking'),
] as const

const SLIDES = SLIDE_LOADERS.map((loader, i) =>
  dynamic<JourneySlideProps>(loader as any, {
    ssr: false,
    loading: () => <SlidePoster meta={JOURNEY_STEPS[i]} />,
  }),
)

function TimelineChip({
  meta,
  state,
  onClick,
}: {
  meta: SlideMeta
  state: 'done' | 'active' | 'todo'
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 shrink-0 px-2.5 py-1.5 rounded-full border text-[11px] font-bold transition-all ${
        state === 'active'
          ? 'border-primary/70 bg-primary/15 text-white shadow-[0_0_14px_rgba(233,69,96,0.35)]'
          : state === 'done'
            ? 'border-amber-400/40 bg-amber-400/10 text-amber-200/90 hover:bg-amber-400/20'
            : 'border-white/10 bg-white/5 text-textsec hover:bg-white/10'
      }`}
      aria-current={state === 'active' ? 'step' : undefined}
    >
      <span className="text-sm leading-none">{state === 'done' ? '✓' : meta.emoji}</span>
      <span className="whitespace-nowrap">
        {meta.n}. {meta.label}
      </span>
    </button>
  )
}

/** Seta do carrossel DENTRO do card: um chevron ( › ) dourado grande sobre o
    slide, com eco que dispara a cada troca de etapa e aceno ("vem por aqui")
    enquanto o visitante ainda não navegou. Some quando não há mais etapa. */
function ChevronArrow({
  dir,
  onClick,
  disabled,
  flashKey,
  attract = false,
  className = '',
  iconClass = 'w-10 h-10 md:w-16 md:h-16',
}: {
  dir: 'prev' | 'next'
  onClick: () => void
  disabled: boolean
  flashKey: number
  attract?: boolean
  className?: string
  iconClass?: string
}) {
  const Chevron = dir === 'prev' ? ChevronLeft : ChevronRight
  const nudge = dir === 'prev' ? -6 : 6
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === 'prev' ? 'Etapa anterior' : 'Próxima etapa'}
      className={`group z-30 transition-opacity duration-300 disabled:opacity-0 disabled:pointer-events-none ${className}`}
    >
      <span className="relative grid place-items-center">
        {/* Eco: chevron que se expande e desvanece a cada mudança de slide */}
        {!disabled && (
          <motion.span
            key={flashKey}
            className="absolute pointer-events-none"
            initial={{ opacity: 0.9, scale: 1, x: 0 }}
            animate={{ opacity: 0, scale: 1.8, x: nudge * 2 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
          >
            <Chevron className={iconClass} style={{ color: GOLD_BRIGHT }} strokeWidth={3} />
          </motion.span>
        )}
        <motion.span
          className="grid place-items-center transition-transform duration-200 group-hover:scale-125"
          style={{
            filter:
              'drop-shadow(0 0 8px rgba(201,162,95,0.85)) drop-shadow(0 2px 5px rgba(0,0,0,0.95))',
          }}
          animate={
            attract && !disabled
              ? { x: [0, nudge, 0], scale: [1, 1.1, 1] }
              : { x: 0, scale: 1 }
          }
          transition={
            attract && !disabled
              ? { duration: 1.3, repeat: Infinity, ease: 'easeInOut' }
              : { duration: 0.3 }
          }
        >
          <Chevron className={iconClass} style={{ color: GOLD }} strokeWidth={3} />
        </motion.span>
      </span>
    </button>
  )
}

function JourneyCarouselInner() {
  const [index, setIndex] = useState(0)
  const [direction, setDirection] = useState(1)
  const [inView, setInView] = useState(false)
  const [hasNavigated, setHasNavigated] = useState(false)
  const sectionRef = useRef<HTMLDivElement>(null)
  const chipRefs = useRef<(HTMLDivElement | null)[]>([])

  // Anima/roteiriza só com a seção visível (economiza CPU de quem nem rolou até aqui)
  useEffect(() => {
    const el = sectionRef.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }
    const obs = new IntersectionObserver(
      entries => setInView(entries[0]?.isIntersecting ?? false),
      { threshold: 0.25 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const goTo = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(SLIDES.length - 1, next))
      setDirection(clamped >= index ? 1 : -1)
      setIndex(clamped)
      if (clamped !== index) setHasNavigated(true)
    },
    [index],
  )
  const goNext = useCallback(() => goTo(index + 1), [goTo, index])
  const goPrev = useCallback(() => goTo(index - 1), [goTo, index])

  // Prefetch do chunk do próximo slide quando o navegador estiver ocioso
  useEffect(() => {
    const next = index + 1
    if (next >= SLIDE_LOADERS.length) return
    const idle: (cb: () => void) => number =
      (window as any).requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1200))
    const cancel: (id: number) => void =
      (window as any).cancelIdleCallback ?? ((id: number) => window.clearTimeout(id))
    const id = idle(() => {
      SLIDE_LOADERS[next]()
    })
    return () => cancel(id)
  }, [index])

  // Mantém o chip ativo visível na faixa rolável (mobile)
  useEffect(() => {
    chipRefs.current[index]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [index])

  const Active = SLIDES[index]
  const meta = JOURNEY_STEPS[index]

  return (
    <div ref={sectionRef}>
      {/* Timeline de etapas */}
      <div className="flex gap-2 overflow-x-auto pb-2 px-1 -mx-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {JOURNEY_STEPS.map((m, i) => (
          <div key={m.n} ref={el => { chipRefs.current[i] = el }}>
            <TimelineChip
              meta={m}
              state={i === index ? 'active' : i < index ? 'done' : 'todo'}
              onClick={() => goTo(i)}
            />
          </div>
        ))}
      </div>

      {/* Viewport dentro da "janela do jogo" */}
      <div className="relative mt-3">
        <JourneyWindow stepLabel={`${meta.emoji} ${meta.n}/10 · ${meta.label}`}>
          <div
            className="relative h-[540px] sm:h-[560px] md:h-[600px] overflow-hidden rounded-b-[3px]"
            style={{ touchAction: 'pan-y' }}
          >
            <AnimatePresence mode="popLayout" initial={false} custom={direction}>
              <motion.div
                key={index}
                className="absolute inset-0"
                custom={direction}
                initial={{ x: direction * 64, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: direction * -64, opacity: 0 }}
                transition={{ duration: 0.32, ease: 'easeOut' }}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.15}
                onDragEnd={(_, info) => {
                  if (info.offset.x < -60 || info.velocity.x < -400) goNext()
                  else if (info.offset.x > 60 || info.velocity.x > 400) goPrev()
                }}
              >
                <Active active={inView} onNext={goNext} />
              </motion.div>
            </AnimatePresence>

            {/* Setas DENTRO do card: chevrons ( ‹ › ) dourados sobre o slide */}
            <ChevronArrow
              dir="prev"
              onClick={goPrev}
              disabled={index === 0}
              flashKey={index}
              className="absolute left-0 top-1/2 -translate-y-1/2 pl-1 pr-2 py-6 md:pl-2 md:pr-4"
            />
            <ChevronArrow
              dir="next"
              onClick={goNext}
              disabled={index === SLIDES.length - 1}
              flashKey={index}
              attract={!hasNavigated}
              className="absolute right-0 top-1/2 -translate-y-1/2 pr-1 pl-2 py-6 md:pr-2 md:pl-4"
            />
          </div>
        </JourneyWindow>

        {/* Dots (mobile) */}
        <div className="flex md:hidden justify-center gap-1.5 mt-3">
          {JOURNEY_STEPS.map((m, i) => (
            <button
              key={m.n}
              onClick={() => goTo(i)}
              aria-label={`Ir para a etapa ${m.n}`}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? 'w-6 bg-primary' : 'w-1.5 bg-white/25'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export default function JourneyShowcase({ primaryHref }: { primaryHref: string }) {
  return (
    <section id="jornada" className="relative pb-12 sm:pb-16">
      {/* Divisória full-bleed sobre a fronteira hero/Jornada: -mt-6 alinha o
          centro do losango (h-12) com a borda inferior da imagem do hero. */}
      <div className="relative z-10 -mt-6 px-4 sm:px-6">
        <JourneyDivider />
      </div>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-10 sm:pt-12">
        <SectionHeading
          eyebrow="A jornada completa"
          title={
            <>
              Experimente agora, <span className="text-primary">aqui mesmo</span>
            </>
          }
          sub="Do primeiro clique ao topo do ranking: crie um herói e veja — com as telas reais do jogo — tudo o que espera por ele em Dolrath."
        />
        <div className="mt-8">
          <JourneyProvider primaryHref={primaryHref}>
            <JourneyCarouselInner />
          </JourneyProvider>
        </div>
      </div>
    </section>
  )
}
