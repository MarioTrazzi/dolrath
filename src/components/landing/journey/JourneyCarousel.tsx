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
import { useT } from '@/lib/i18n/I18nProvider'
import { JourneyProvider } from './JourneyContext'
import { JourneyDivider, JourneyWindow } from './JourneyFrame'
import SlidePoster, { type SlideMeta } from './SlidePoster'
import type { JourneySlideProps } from './journeyData'

export const JOURNEY_STEPS: SlideMeta[] = [
  { n: 1, emoji: '🧬', label: 'Create your hero', sub: 'Race + canonical class' },
  { n: 2, emoji: '📜', label: 'The sheet', sub: 'Transformation and skills' },
  { n: 3, emoji: '🌲', label: 'Dungeon', sub: 'Explore beneath the mist' },
  { n: 4, emoji: '⚒️', label: 'Forge & Craft', sub: 'Materials become power' },
  { n: 5, emoji: '💎', label: 'Enhancement', sub: 'Weapon III → IV' },
  { n: 6, emoji: '🎒', label: 'Gear & Bag', sub: 'Set III + weapon IV' },
  { n: 7, emoji: '👑', label: 'To the boss', sub: 'End of the trail' },
  { n: 8, emoji: '⚔️', label: 'Boss fight', sub: 'Elder of the Grove' },
  { n: 9, emoji: '🏟️', label: 'PvP', sub: 'Turn-based combat' },
  { n: 10, emoji: '🏆', label: 'Ranking', sub: 'Top 10 splits the prize' },
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
  const t = useT()
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
        {meta.n}. {t(meta.label)}
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
  const t = useT()
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === 'prev' ? t('Previous step') : t('Next step')}
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
  const t = useT()
  const [index, setIndex] = useState(0)
  const [direction, setDirection] = useState(1)
  const [inView, setInView] = useState(false)
  const [hasNavigated, setHasNavigated] = useState(false)
  const sectionRef = useRef<HTMLDivElement>(null)
  const chipRefs = useRef<(HTMLDivElement | null)[]>([])
  const touchStart = useRef<{ x: number; y: number } | null>(null)

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

  // Mantém o chip ativo visível na faixa rolável (mobile) — só após navegação real
  // do usuário, senão dispara no mount (index=0) e rola a página pra fora do Hero
  useEffect(() => {
    if (!hasNavigated) return
    chipRefs.current[index]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [index, hasNavigated])

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
        <JourneyWindow stepLabel={`${meta.emoji} ${meta.n}/10 · ${t(meta.label)}`}>
          {/* Swipe manual (touchstart/touchend, listeners passivos) em vez do
              drag="x" do framer: o drag iniciava em QUALQUER movimento do dedo
              e bloqueava via preventDefault a rolagem vertical nativa dos
              slides no mobile. Assim nada intercepta o scroll. */}
          <div
            className="relative h-[540px] sm:h-[560px] md:h-[600px] overflow-hidden rounded-b-[3px]"
            onTouchStart={e => {
              const t = e.touches[0]
              touchStart.current = { x: t.clientX, y: t.clientY }
            }}
            onTouchEnd={e => {
              const s = touchStart.current
              touchStart.current = null
              if (!s) return
              const t = e.changedTouches[0]
              const dx = t.clientX - s.x
              const dy = t.clientY - s.y
              // Só troca de slide num swipe claramente horizontal
              if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.2) {
                if (dx < 0) goNext()
                else goPrev()
              }
            }}
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
              aria-label={t('Go to step {n}', { n: m.n })}
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
  const t = useT()
  return (
    <section id="jornada" className="relative pb-12 sm:pb-16">
      {/* Divisória full-bleed sobre a fronteira hero/Jornada: -mt-6 alinha o
          centro do losango (h-12) com a borda inferior da imagem do hero. */}
      <div className="relative z-10 -mt-6 px-4 sm:px-6">
        <JourneyDivider />
      </div>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-10 sm:pt-12">
        <SectionHeading
          eyebrow={t('The full journey')}
          title={
            <>
              {t('Try it now,')} <span className="text-primary">{t('right here')}</span>
            </>
          }
          sub={t('From the first click to the top of the ranking: create a hero and see — on the real game screens — everything waiting for them in Dolrath.')}
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
