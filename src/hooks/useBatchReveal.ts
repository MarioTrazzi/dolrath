'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/**
 * Encenação de lote: o servidor resolve TUDO numa transação só e devolve a
 * sequência por unidade; este hook revela essa sequência **uma unidade por
 * vez**, do jeito que a colheita da fazenda já fazia canteiro a canteiro
 * (`FarmBoard.tsx`, commit 9515318).
 *
 * Por que encenar em vez de mandar N requisições: a transação atômica é a
 * garantia de que não existe meia-execução (F5 no meio, gold debitado sem
 * item). O que faltava era só a ORDEM — que o servidor jogava fora ao
 * devolver apenas o agregado.
 *
 * Cadência adaptativa: ×1 continua sendo a canalização de sempre (1600 ms) e
 * um lote de 500 não vira uma espera de treze minutos. O teto de tiques
 * (`MAX_TICKS`) faz o contador avançar de `step` em `step` nos lotes grandes.
 */

/** Orçamento de tempo da encenação inteira, em ms (lotes grandes se espremem aqui). */
export const REVEAL_TOTAL_MS = 6000
/** Nunca mais que isto de tiques — 500 unidades não viram 500 animações. */
export const REVEAL_MAX_TICKS = 40
/** Piso por tique: abaixo disto o olho não acompanha. */
export const REVEAL_MIN_TICK_MS = 90

export type BatchRevealPhase = 'idle' | 'working' | 'revealing' | 'done'

export interface BatchRevealCadence {
  /** Quantos tiques a encenação terá. */
  ticks: number
  /** Quantas unidades cada tique revela (>1 só em lote grande). */
  step: number
  /** Duração de cada tique, em ms. */
  delay: number
}

/**
 * `maxTickMs` é a duração de UM tique quando o lote é pequeno — as bancadas
 * passam `CHARGE_MS`, o poço passa a animação do balde.
 */
export function batchRevealCadence(total: number, maxTickMs: number): BatchRevealCadence {
  const n = Math.max(0, Math.floor(total))
  if (n <= 0) return { ticks: 0, step: 1, delay: maxTickMs }
  const ticks = Math.min(n, REVEAL_MAX_TICKS)
  const step = Math.ceil(n / ticks)
  const delay = Math.min(maxTickMs, Math.max(REVEAL_MIN_TICK_MS, Math.round(REVEAL_TOTAL_MS / ticks)))
  return { ticks, step, delay }
}

export interface UseBatchRevealOptions {
  /** Duração de um tique no lote pequeno (bancadas: CHARGE_MS). */
  maxTickMs: number
  /**
   * Chamado UMA vez quando a encenação termina — por chegar ao fim, por
   * `skip`, ou por um `reset` que a aborta no meio. É onde vai o
   * `fetchInventory()`/`onChanged?.()`: se rodar antes, o inventário recarrega
   * e a lista esvazia no meio da animação (a mesma armadilha que o `FarmBoard`
   * resolve com snapshot). O crédito no banco já aconteceu, então abortar a
   * encenação NÃO pode deixar a tela sem recarregar.
   */
  onFinish?: () => void
}

export interface UseBatchReveal {
  phase: BatchRevealPhase
  /** Unidades já reveladas (0..total). */
  revealed: number
  /** Total de unidades da sequência corrente. */
  total: number
  /** Sobe 1 a cada tique — serve de `key`/`chargeId` para replay da animação. */
  tick: number
  cadence: BatchRevealCadence
  /** Marca "esperando o servidor" (antes de ter a sequência). */
  begin: () => void
  /** Entrega a sequência e começa a revelar. */
  start: (total: number) => void
  /** Salta direto para o resumo. */
  skip: () => void
  /** Volta ao repouso (fechar/trocar de receita); aborta a encenação em curso. */
  reset: () => void
}

export function useBatchReveal({ maxTickMs, onFinish }: UseBatchRevealOptions): UseBatchReveal {
  const [phase, setPhase] = useState<BatchRevealPhase>('idle')
  const [revealed, setRevealed] = useState(0)
  const [total, setTotal] = useState(0)
  const [tick, setTick] = useState(0)

  const cadence = useMemo(() => batchRevealCadence(total, maxTickMs), [total, maxTickMs])

  // `onFinish` em ref: o efeito do tique não pode re-agendar só porque o
  // callback do pai foi recriado no render.
  const finishRef = useRef(onFinish)
  finishRef.current = onFinish

  // `onFinish` dispara no máximo uma vez por encenação.
  const firedRef = useRef(false)
  // A fase em ref: o `reset` precisa saber se havia encenação em curso sem
  // depender de um closure que envelhece.
  const phaseRef = useRef<BatchRevealPhase>('idle')
  phaseRef.current = phase

  const begin = useCallback(() => {
    setPhase('working')
    setRevealed(0)
    setTotal(0)
    setTick(0)
  }, [])

  const start = useCallback((n: number) => {
    const count = Math.max(0, Math.floor(n))
    setTotal(count)
    setRevealed(0)
    setTick(0)
    setPhase(count > 0 ? 'revealing' : 'done')
  }, [])

  const skip = useCallback(() => {
    setRevealed(total)
    setPhase('done')
  }, [total])

  const reset = useCallback(() => {
    const wasInFlight = phaseRef.current === 'working' || phaseRef.current === 'revealing'
    setPhase('idle')
    setRevealed(0)
    setTotal(0)
    setTick(0)
    // Abortar no meio (fechar, trocar de receita) não pode engolir o refresh:
    // o banco já creditou o lote.
    if (wasInFlight && !firedRef.current) {
      firedRef.current = true
      finishRef.current?.()
    }
  }, [])

  // O loop: setTimeout reencadeado pelo próprio `revealed` (um `for` com
  // `await` não cancelaria ao fechar a dialog no meio).
  useEffect(() => {
    if (phase !== 'revealing') return
    if (revealed >= total) {
      setPhase('done')
      return
    }
    const t = setTimeout(() => {
      setRevealed((c) => Math.min(total, c + cadence.step))
      setTick((c) => c + 1)
    }, cadence.delay)
    return () => clearTimeout(t)
  }, [phase, revealed, total, cadence.step, cadence.delay])

  // `onFinish` dispara uma vez por encenação, na borda de entrada em 'done'.
  useEffect(() => {
    if (phase === 'done' && !firedRef.current) {
      firedRef.current = true
      finishRef.current?.()
    }
    if (phase === 'idle' || phase === 'working') firedRef.current = false
  }, [phase])

  return { phase, revealed, total, tick, cadence, begin, start, skip, reset }
}
