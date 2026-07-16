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
import { SectionHeading } from '@/components/landing/ui'
import { JourneyProvider } from './JourneyContext'
import SlidePoster, { type SlideMeta } from './SlidePoster'
import type { JourneySlideProps } from './journeyData'

export const JOURNEY_STEPS: SlideMeta[] = [
  { n: 1, emoji: '🧬', label: 'Crie seu herói', sub: 'Escolha raça e classe' },
  { n: 2, emoji: '📜', label: 'A ficha', sub: 'Seu personagem, sua NFT' },
  { n: 3, emoji: '🌲', label: 'Masmorra', sub: 'Explore sob a névoa' },
  { n: 4, emoji: '⚒️', label: 'Forja & Craft', sub: 'Evolua seu gear' },
  { n: 5, emoji: '👑', label: 'Rumo ao boss', sub: 'Gear +15 equipado' },
  { n: 6, emoji: '⚔️', label: 'Boss fight', sub: 'Anciã da Mata' },
  { n: 7, emoji: '🏟️', label: 'PvP', sub: 'Combate por turnos' },
  { n: 8, emoji: '🏆', label: 'Ranking', sub: 'Top 10 divide o prêmio' },
]

// Loaders separados p/ permitir prefetch manual do próximo slide.
const SLIDE_LOADERS = [
  () => import('./slides/Slide1Creation'),
  () => import('./slides/Slide2Sheet'),
  () => import('./slides/Slide3DungeonMap'),
  () => import('./slides/Slide4Crafting'),
  () => import('./slides/Slide5BossApproach'),
  () => import('./slides/Slide6BossFight'),
  () => import('./slides/Slide7Pvp'),
  () => import('./slides/Slide8Ranking'),
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

function JourneyCarouselInner() {
  const [index, setIndex] = useState(0)
  const [direction, setDirection] = useState(1)
  const [inView, setInView] = useState(false)
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

      {/* Viewport */}
      <div className="relative mt-3">
        <div
          className="relative h-[540px] sm:h-[560px] md:h-[600px] rounded-2xl border border-white/10 bg-secondary/40 backdrop-blur-xl overflow-hidden"
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

          {/* Legenda da etapa (canto superior esquerdo) */}
          <div className="absolute top-3 left-3 z-30 pointer-events-none">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/55 border border-white/15 backdrop-blur-md text-[11px] font-bold text-white/90">
              {meta.emoji} {meta.label}
              <span className="text-white/50 font-medium hidden sm:inline">· {meta.sub}</span>
            </span>
          </div>
        </div>

        {/* Setas (desktop) */}
        <button
          onClick={goPrev}
          disabled={index === 0}
          aria-label="Etapa anterior"
          className="hidden md:grid place-items-center absolute -left-5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full border border-white/15 bg-secondary/90 backdrop-blur-xl text-white text-lg shadow-xl transition-all hover:bg-secondary hover:border-primary/50 disabled:opacity-30 disabled:pointer-events-none z-30"
        >
          ‹
        </button>
        <button
          onClick={goNext}
          disabled={index === SLIDES.length - 1}
          aria-label="Próxima etapa"
          className="hidden md:grid place-items-center absolute -right-5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full border border-white/15 bg-secondary/90 backdrop-blur-xl text-white text-lg shadow-xl transition-all hover:bg-secondary hover:border-primary/50 disabled:opacity-30 disabled:pointer-events-none z-30"
        >
          ›
        </button>

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
    <section id="jornada" className="relative py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="A jornada completa"
          title={
            <>
              Jogue agora, <span className="text-primary">aqui mesmo</span>
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
