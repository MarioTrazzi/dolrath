'use client'

import { useEffect, useState } from 'react'
import { useT } from '@/lib/i18n/I18nProvider'

/** Lançamento: 15 dias a partir de 19 Jul 2026 (BRT). */
export const LAUNCH_AT = new Date('2026-08-03T12:00:00-03:00')

type Remaining = { days: number; hours: number; minutes: number; seconds: number; done: boolean }

function getRemaining(now: number): Remaining {
  const ms = Math.max(0, LAUNCH_AT.getTime() - now)
  const totalSec = Math.floor(ms / 1000)
  return {
    days: Math.floor(totalSec / 86400),
    hours: Math.floor((totalSec % 86400) / 3600),
    minutes: Math.floor((totalSec % 3600) / 60),
    seconds: totalSec % 60,
    done: ms === 0,
  }
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function Unit({ value, label }: { value: string; label: string }) {
  return (
    <span className="inline-flex flex-col items-center leading-none tabular-nums">
      <span className="font-bold text-amber-200 text-[13px] sm:text-sm tracking-tight">{value}</span>
      <span className="mt-0.5 text-[8px] font-semibold uppercase tracking-[0.14em] text-white/40">
        {label}
      </span>
    </span>
  )
}

function Sep() {
  return (
    <span className="text-amber-400/40 text-xs font-bold pb-2.5" aria-hidden="true">
      :
    </span>
  )
}

/** Contador compacto para a navbar — mostra quanto falta para o jogo começar. */
export default function LaunchCountdown({ className = '' }: { className?: string }) {
  const t = useT()
  const [remaining, setRemaining] = useState<Remaining | null>(null)

  useEffect(() => {
    const tick = () => setRemaining(getRemaining(Date.now()))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  const r = remaining ?? { days: 15, hours: 0, minutes: 0, seconds: 0, done: false }

  if (r.done) {
    return (
      <div
        className={`inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 ${className}`}
        role="status"
        aria-label={t('The game is live')}
      >
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inset-0 animate-ping rounded-full bg-amber-300 opacity-60" />
          <span className="relative rounded-full h-1.5 w-1.5 bg-amber-300" />
        </span>
        <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-amber-200">
          {t('Live now')}
        </span>
      </div>
    )
  }

  return (
    <div
      className={`inline-flex items-center gap-2 sm:gap-2.5 rounded-full border border-amber-400/25 bg-amber-400/[0.07] px-2 sm:px-3 py-1.5 ${className}`}
      role="timer"
      aria-live="polite"
      aria-label={t('Game starts in {days} days, {hours} hours, {minutes} minutes, {seconds} seconds', {
        days: r.days,
        hours: r.hours,
        minutes: r.minutes,
        seconds: r.seconds,
      })}
    >
      <span className="hidden lg:inline text-[9px] font-bold uppercase tracking-[0.16em] text-amber-200/70 whitespace-nowrap">
        {t('Starts in')}
      </span>
      <span className="inline-flex items-center gap-1 sm:gap-1.5">
        <Unit value={String(r.days)} label={t('d')} />
        <Sep />
        <Unit value={pad(r.hours)} label={t('h')} />
        <Sep />
        <Unit value={pad(r.minutes)} label={t('m')} />
        <span className="hidden sm:inline-flex items-center gap-1 sm:gap-1.5">
          <Sep />
          <Unit value={pad(r.seconds)} label={t('s')} />
        </span>
      </span>
    </div>
  )
}
