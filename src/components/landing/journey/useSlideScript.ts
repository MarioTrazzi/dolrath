'use client'

// Roteiro temporizado dos slides da Jornada: devolve o índice do passo
// atual (0..n-1) e o nº do ciclo. O slide deriva TODO o estado do passo
// (declarativo) — nada de mutação espalhada em timeouts.
//
// - Só roda com `active` (slide atual + seção visível, decidido pelo pai).
// - Aba oculta pausa (visibilitychange) e recomeça o ciclo ao voltar.
// - prefers-reduced-motion: pula direto ao último passo e não loopa.
// - `advance()` crava o próximo passo já (momentos interativos).

import { useCallback, useEffect, useRef, useState } from 'react'

export interface SlideScript {
  step: number
  cycle: number
  advance: () => void
}

export function useSlideScript(
  active: boolean,
  /** Offsets (ms) de cada passo desde o início do ciclo; times[0] normalmente é 0. */
  times: number[],
  opts: { loop?: boolean; loopDelayMs?: number } = {},
): SlideScript {
  const { loop = true, loopDelayMs = 4000 } = opts
  const [step, setStep] = useState(0)
  const [cycle, setCycle] = useState(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stepRef = useRef(0)
  const reduced =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const clear = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }

  const setStepSafe = (n: number) => {
    stepRef.current = n
    setStep(n)
  }

  const scheduleFrom = useCallback(
    (from: number) => {
      clear()
      if (from + 1 < times.length) {
        const delay = Math.max(0, times[from + 1] - times[from])
        timer.current = setTimeout(() => {
          setStepSafe(from + 1)
          scheduleFrom(from + 1)
        }, delay)
      } else if (loop) {
        timer.current = setTimeout(() => {
          setCycle(c => c + 1)
          setStepSafe(0)
          scheduleFrom(0)
        }, loopDelayMs)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loop, loopDelayMs, times.length],
  )

  useEffect(() => {
    if (!active) {
      clear()
      setStepSafe(0)
      return
    }
    if (reduced) {
      setStepSafe(times.length - 1)
      return
    }
    setStepSafe(0)
    scheduleFrom(0)

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        clear()
      } else {
        setStepSafe(0)
        scheduleFrom(0)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clear()
      document.removeEventListener('visibilitychange', onVisibility)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, scheduleFrom])

  const advance = useCallback(() => {
    if (!active || reduced) return
    const next = Math.min(stepRef.current + 1, times.length - 1)
    setStepSafe(next)
    scheduleFrom(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, reduced, scheduleFrom, times.length])

  return { step, cycle, advance }
}
