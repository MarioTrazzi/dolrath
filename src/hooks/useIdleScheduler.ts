'use client'

import { useCallback, useEffect, useRef } from 'react'
import { createIdleScheduler, type IdleScheduler } from '@/lib/idleClock'

/**
 * Agendamento que sobrevive à aba em segundo plano (ver `lib/idleClock`).
 *
 * Devolve:
 *  • `later(fn, ms)` — igual ao setTimeout, mas drenado pelo tique do worker
 *    quando o browser estrangula os timers da página. Devolve o cancelador.
 *  • `hiddenRef` — `document.hidden` em ref (não em state) porque quem lê é
 *    callback de deps fixas, que congelaria no valor da montagem.
 *  • `onVisible(fn)` — registra callback de "a aba voltou a ficar visível";
 *    devolve o desregistrador.
 */
export function useIdleScheduler() {
  const ref = useRef<IdleScheduler | null>(null)
  // Criação sob demanda, não no corpo do render: o StrictMode do dev desmonta e
  // remonta de mentira, e o `dispose` do cleanup deixaria o ref nulo para
  // sempre — todo agendamento viraria no-op e a run pararia só em dev.
  const get = () => {
    if (!ref.current) ref.current = createIdleScheduler()
    return ref.current
  }
  useEffect(() => () => { ref.current?.dispose(); ref.current = null }, [])

  const hiddenRef = useRef(typeof document !== 'undefined' && document.hidden)
  const visibleSubs = useRef(new Set<() => void>())
  useEffect(() => {
    const sync = () => {
      hiddenRef.current = document.hidden
      if (!document.hidden) visibleSubs.current.forEach(fn => fn())
    }
    document.addEventListener('visibilitychange', sync)
    return () => document.removeEventListener('visibilitychange', sync)
  }, [])

  const later = useCallback((fn: () => void, ms: number) => get().later(fn, ms), [])

  const onVisible = useCallback((fn: () => void) => {
    visibleSubs.current.add(fn)
    return () => { visibleSubs.current.delete(fn) }
  }, [])

  return { later, hiddenRef, onVisible }
}
