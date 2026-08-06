/**
 * ⏱️ Agendador à prova de aba em segundo plano.
 *
 * O problema: o Chrome estrangula `setTimeout`/`setInterval` de página oculta
 * (1 disparo por minuto depois de ~5 min), então a run automática da masmorra
 * arrastava até parar. A saída é ter uma fonte de tique que o browser NÃO
 * estrangula — um worker dedicado (`/idle-clock.worker.js`).
 *
 * Princípio de desenho: ENVOLVER, não substituir. O `setTimeout` continua sendo
 * o disparador primário, então com a aba visível o comportamento é idêntico ao
 * de antes; o tique do worker, o `visibilitychange` e o `pageshow` apenas
 * DRENAM o que já venceu. Se o worker não puder nascer (CSP, ambiente exótico),
 * sobra o `setTimeout` puro — ou seja, o comportamento de hoje. Nunca regride.
 */

export interface IdleScheduler {
  /** Agenda `fn` para daqui a `ms`. Devolve o cancelador. */
  later(fn: () => void, ms: number): () => void
  /** Dispara agora tudo que já venceu (chamado pelo tique e ao voltar à aba). */
  flushDue(): void
  isHidden(): boolean
  dispose(): void
}

interface Entry {
  due: number
  fn: () => void
  timer: ReturnType<typeof setTimeout>
}

const WORKER_URL = '/idle-clock.worker.js'

export function createIdleScheduler(opts?: { everyMs?: number }): IdleScheduler {
  const entries = new Map<number, Entry>()
  let seq = 0
  let disposed = false

  const cancel = (id: number) => {
    const entry = entries.get(id)
    if (!entry) return
    entries.delete(id)
    clearTimeout(entry.timer)
  }

  /**
   * Executa uma entrada NO MÁXIMO uma vez: ela sai do mapa antes de rodar, então
   * não importa se quem chegou primeiro foi o `setTimeout` ou o tique do worker
   * — o segundo vira no-op. É esta linha que impede o callback duplicado.
   */
  const run = (id: number) => {
    const entry = entries.get(id)
    if (!entry) return
    entries.delete(id)
    clearTimeout(entry.timer)
    entry.fn()
  }

  const flushDue = () => {
    if (disposed) return
    const now = Date.now()
    // Snapshot ordenado: iterar a coleção VIVA daria laço infinito quando um
    // callback reagenda com ms pequeno (ele nasceria já vencido, dentro do
    // mesmo flush). O que nasce aqui só corre no tique seguinte.
    const due: Array<{ id: number; at: number }> = []
    entries.forEach((entry, id) => { if (entry.due <= now) due.push({ id, at: entry.due }) })
    due.sort((a, b) => a.at - b.at)
    for (const item of due) run(item.id)
  }

  const later = (fn: () => void, ms: number) => {
    if (disposed) return () => {}
    const id = ++seq
    const timer = setTimeout(() => run(id), ms)
    entries.set(id, { due: Date.now() + ms, fn, timer })
    return () => cancel(id)
  }

  const isHidden = () => typeof document !== 'undefined' && document.hidden

  // ---------- Fontes de tique ----------
  let worker: Worker | null = null
  let onVisibility: (() => void) | null = null
  let onPageShow: (() => void) | null = null

  if (typeof window !== 'undefined') {
    try {
      worker = new Worker(WORKER_URL)
      worker.onmessage = (e: MessageEvent) => {
        if (e.data?.type === 'tick') flushDue()
      }
      worker.postMessage({ type: 'start', everyMs: opts?.everyMs ?? 250 })
    } catch {
      // Sem worker o `setTimeout` sozinho continua valendo (comportamento antigo).
      worker = null
    }

    // Voltar para a aba drena o atraso de uma vez. É este caminho que salva o
    // mobile, onde o sistema congela/suspende a página inteira e nem o worker
    // sobrevive: o jogador volta e a run recupera o que ficou pendente.
    onVisibility = () => { if (!document.hidden) flushDue() }
    document.addEventListener('visibilitychange', onVisibility)
    onPageShow = () => flushDue()
    window.addEventListener('pageshow', onPageShow)
  }

  const dispose = () => {
    disposed = true
    entries.forEach(entry => clearTimeout(entry.timer))
    entries.clear()
    if (worker) {
      worker.postMessage({ type: 'stop' })
      worker.terminate()
      worker = null
    }
    if (typeof window !== 'undefined') {
      if (onVisibility) document.removeEventListener('visibilitychange', onVisibility)
      if (onPageShow) window.removeEventListener('pageshow', onPageShow)
    }
  }

  return { later, flushDue, isHidden, dispose }
}
