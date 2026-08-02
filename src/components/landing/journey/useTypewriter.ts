'use client'

// Datilografia do prompt da arte (slide 1). O ponto NÃO é o efeito bonito: é
// contar que a imagem é gerada AGORA, a partir do texto que está sendo escrito
// ali — e não escolhida de uma prateleira de artes prontas. Por isso quem
// consome espera `done` para só então revelar a arte.
//
// - `enabled` falso mantém o texto vazio (estado "ainda não escolheu").
// - Trocar o texto reinicia a digitação do zero (trocou raça/classe → gera de novo).
// - prefers-reduced-motion entrega o texto inteiro e `done` no primeiro frame.
// - Aba oculta não gasta tick: o timer para e retoma de onde estava.

import { useEffect, useRef, useState } from 'react'

export interface Typewriter {
  /** Fatia já digitada. */
  shown: string
  /** Terminou de escrever (gatilho da revelação da arte). */
  done: boolean
}

export function useTypewriter(
  text: string,
  opts: { enabled?: boolean; cps?: number } = {},
): Typewriter {
  const { enabled = true, cps = 68 } = opts
  const [count, setCount] = useState(0)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const clear = () => {
      if (timer.current) clearInterval(timer.current)
      timer.current = null
    }

    if (!enabled || !text) {
      clear()
      setCount(0)
      return
    }

    const reduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (reduced) {
      clear()
      setCount(text.length)
      return
    }

    setCount(0)
    // Passo de 2 caracteres: a 68 cps o intervalo de 1 char cairia em ~15ms,
    // abaixo do que o navegador entrega de verdade — o texto sairia lento.
    const step = 2
    let typed = 0
    const start = () => {
      clear()
      timer.current = setInterval(() => {
        setCount(() => {
          typed = Math.min(typed + step, text.length)
          if (typed >= text.length) clear()
          return typed
        })
      }, (1000 * step) / cps)
    }
    start()

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') clear()
      else if (timer.current == null && typed < text.length) start()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clear()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [text, enabled, cps])

  return {
    shown: enabled ? text.slice(0, count) : '',
    done: enabled && count >= text.length && text.length > 0,
  }
}
