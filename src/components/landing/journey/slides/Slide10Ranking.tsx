'use client'

// Slide 10 — Ranking PvP + premiação: top 10 ilustrativo com o herói do
// visitante em #3 e o split REAL do pot em DOL (PVP_TOP10_DOL_SPLIT).
// Fecho do arco: CTA "Comece sua jornada".

import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useJourney } from '../JourneyContext'
import { useSlideScript } from '../useSlideScript'
import { useI18n } from '@/lib/i18n/I18nProvider'
import {
  buildRankRows,
  RANK_POOL_DOL,
  PVP_TOP10_DOL_SPLIT,
  type JourneySlideProps,
} from '../journeyData'

// 0 tabela entra · 1 herói destaca · 2 prêmio conta · 3 CTA
const TIMES = [0, 1200, 2200, 3400]

function useCountUp(target: number, run: boolean, ms = 1000): number {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (!run) {
      setValue(0)
      return
    }
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms)
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [run, target, ms])
  return value
}

const MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

export default function Slide10Ranking({ active }: JourneySlideProps) {
  const { locale, t } = useI18n()
  const { raceId, classId, heroName, heroArt, visual, primaryHref } = useJourney()
  const { step } = useSlideScript(active, TIMES, { loop: false })

  const rows = buildRankRows({ raceId, classId })
  const heroPrize = Math.round(RANK_POOL_DOL * PVP_TOP10_DOL_SPLIT[2])
  const countedPrize = useCountUp(heroPrize, step >= 2)

  return (
    <div className="relative h-full w-full flex flex-col md:flex-row gap-3 p-3 pt-12 sm:p-4 sm:pt-12 overflow-y-auto md:overflow-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {/* Tabela top 10 */}
      <div className="md:w-3/5 min-h-0 flex flex-col">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-xs font-black uppercase tracking-[0.2em] text-primary">{t('🏆 Season ranking')}</span>
          <span className="text-[10px] text-textsec">{t('illustrative pot:')} {RANK_POOL_DOL.toLocaleString(locale === 'pt' ? 'pt-BR' : 'en-US')} DOL</span>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto rounded-xl border border-white/10 bg-black/30 backdrop-blur-md [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {rows.map((row, i) => {
            const prize = Math.round(RANK_POOL_DOL * PVP_TOP10_DOL_SPLIT[row.rank - 1])
            const isHero = !!row.isHero
            return (
              <motion.div
                key={row.rank}
                initial={{ opacity: 0, x: -14 }}
                animate={step >= 0 ? { opacity: 1, x: 0 } : {}}
                transition={{ delay: 0.08 * i }}
                className={`flex items-center gap-2 px-3 py-1.5 border-b border-white/5 last:border-b-0 ${
                  isHero ? 'relative' : ''
                }`}
                style={
                  isHero && step >= 1
                    ? {
                        background: `linear-gradient(90deg, ${visual.raceVisual.accent}26, transparent 80%)`,
                        boxShadow: `inset 2px 0 0 ${visual.raceVisual.accent}`,
                      }
                    : undefined
                }
              >
                <span className="w-7 text-center text-xs font-black text-white/70">
                  {MEDAL[row.rank] ?? row.rank}
                </span>
                <span className="text-sm">{row.emoji}</span>
                <span className={`flex-1 min-w-0 truncate text-xs ${isHero ? 'font-black text-white' : 'font-semibold text-white/80'}`}>
                  {t(row.name)}
                  {isHero && (
                    <span className="ml-1.5 text-[9px] font-bold px-1 py-px rounded" style={{ background: `${visual.raceVisual.accent}33`, color: visual.raceVisual.accent }}>
                      {t('YOU')}
                    </span>
                  )}
                </span>
                <span className="font-combat text-[11px] text-white/60 hidden sm:inline">{row.points.toLocaleString(locale === 'pt' ? 'pt-BR' : 'en-US')} pts</span>
                <span className={`font-combat text-xs w-20 text-right ${isHero ? 'font-black text-amber-300' : 'text-amber-200/70'}`}>
                  {isHero && step >= 2 ? countedPrize : prize} DOL
                </span>
              </motion.div>
            )
          })}
        </div>
        <p className="text-[10px] text-textsec mt-1.5">
          {t('Real pot split: 30% · 18% · 12% · 9% · 7% · 6% · 5% · 5% · 4% · 4% — every season, the top 10 splits the prize in DOL.')}
        </p>
      </div>

      {/* Fecho do arco + CTA */}
      <div className="md:w-2/5 flex flex-col items-center justify-center gap-3 py-2">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={step >= 1 ? { opacity: 1, scale: 1 } : {}}
          className="relative w-28 h-28 rounded-xl border-2 overflow-hidden"
          style={{ borderColor: visual.borderColor, boxShadow: visual.glow }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={heroArt} alt={heroName} className="absolute inset-0 w-full h-full object-cover object-top" />
          <span className="absolute bottom-0 inset-x-0 text-center text-[10px] font-black text-white bg-black/65 py-0.5">
            {heroName}
          </span>
        </motion.div>
        <p className="text-center text-sm text-white font-bold max-w-[240px]">
          {t('From the first click to the top of the ranking — {name} made it.', { name: heroName })}
          <span className="block text-textsec text-[11px] font-normal mt-1">{t('The next hero on this list could be yours.')}</span>
        </p>
        <motion.a
          href={primaryHref}
          initial={{ opacity: 0, y: 10 }}
          animate={step >= 3 ? { opacity: 1, y: 0 } : {}}
          className="px-6 py-3 rounded-lg bg-gradient-to-r from-primary to-primary-dark text-white text-sm font-black shadow-[0_0_28px_rgba(233,69,96,0.55)] hover:brightness-110 transition-all animate-pulse"
        >
          {t('⚔️ Begin your journey')}
        </motion.a>
      </div>
    </div>
  )
}
