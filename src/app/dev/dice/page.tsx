'use client'

// Página DEV: bancada do dado 3D — rola sem DB/servidor, com resultado
// forçável, pra lapidar o visual do AnimatedDie. Mesmo espírito do
// /dev/dungeon-mock.
import { useRef, useState } from 'react'
import { AnimatedDie, type DieResult } from '@/components/battle/AnimatedDice'

const SIDES = [4, 6, 8, 10, 12, 20]
const SIZES = [64, 88, 130]

export default function DiceDevPage() {
  const [sides, setSides] = useState(20)
  const [size, setSize] = useState(130)
  const [minSpinMs, setMinSpinMs] = useState(1100)
  const [modifier, setModifier] = useState(3)
  const [dual, setDual] = useState(false)
  const [latencyMs, setLatencyMs] = useState(500)

  const [mode, setMode] = useState<'idle' | 'rolling'>('idle')
  const [result, setResult] = useState<DieResult | null>(null)
  const [result2, setResult2] = useState<DieResult | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const mk = (roll: number): DieResult => ({ roll, modifier, total: roll + modifier })

  // Simula o servidor: começa a rolar já e o resultado chega após a "latência"
  const roll = (forced?: number) => {
    if (timer.current) clearTimeout(timer.current)
    setResult(null)
    setResult2(null)
    setMode('rolling')
    timer.current = setTimeout(() => {
      setResult(mk(forced ?? 1 + Math.floor(Math.random() * sides)))
      setResult2(mk(1 + Math.floor(Math.random() * sides)))
    }, latencyMs)
  }

  const reset = () => {
    if (timer.current) clearTimeout(timer.current)
    setMode('idle')
    setResult(null)
    setResult2(null)
  }

  const btn = 'px-3 py-1.5 rounded-lg text-sm font-bold border transition-colors'
  const on = 'bg-amber-500/20 border-amber-400/60 text-amber-200'
  const off = 'bg-white/5 border-white/15 text-white/70 hover:bg-white/10'

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 text-white p-6 flex flex-col items-center gap-8">
      <h1 className="text-lg font-black tracking-wide text-amber-200/90">🎲 Bancada do dado 3D</h1>

      {/* Arena */}
      <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-black/40 py-14 flex items-center justify-center gap-10">
        <AnimatedDie sides={sides} size={dual ? Math.min(size, 88) : size} mode={mode} result={result} minSpinMs={minSpinMs} onClick={() => roll()} />
        {dual && (
          <AnimatedDie sides={sides} size={Math.min(size, 88)} mode={mode} result={result2} minSpinMs={minSpinMs} />
        )}
      </div>

      {/* Controles */}
      <div className="flex flex-col gap-4 w-full max-w-md">
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs uppercase tracking-widest text-white/40 w-16">Dado</span>
          {SIDES.map(s => (
            <button key={s} className={`${btn} ${sides === s ? on : off}`} onClick={() => { setSides(s); reset() }}>
              d{s}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs uppercase tracking-widest text-white/40 w-16">Tamanho</span>
          {SIZES.map(s => (
            <button key={s} className={`${btn} ${size === s ? on : off}`} onClick={() => setSize(s)}>
              {s}px
            </button>
          ))}
          <button className={`${btn} ${dual ? on : off}`} onClick={() => { setDual(d => !d); reset() }}>
            2 dados (PvP)
          </button>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs uppercase tracking-widest text-white/40 w-16">Tempo</span>
          <button className={`${btn} ${minSpinMs === 1100 ? on : off}`} onClick={() => setMinSpinMs(1100)}>
            combate 1100ms
          </button>
          <button className={`${btn} ${minSpinMs === 250 ? on : off}`} onClick={() => setMinSpinMs(250)}>
            exploração 250ms
          </button>
          <button className={`${btn} ${latencyMs === 500 ? on : off}`} onClick={() => setLatencyMs(l => (l === 500 ? 1600 : 500))}>
            latência {latencyMs}ms
          </button>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs uppercase tracking-widest text-white/40 w-16">Rolar</span>
          <button className={`${btn} ${off}`} onClick={() => roll()}>🎲 aleatório</button>
          <button className={`${btn} ${off}`} onClick={() => roll(sides)}>🔥 máximo ({sides})</button>
          <button className={`${btn} ${off}`} onClick={() => roll(1)}>💀 mínimo (1)</button>
          {sides >= 9 && <button className={`${btn} ${off}`} onClick={() => roll(6)}>6 (sublinhado)</button>}
          <button className={`${btn} ${off}`} onClick={reset}>↩︎ repouso</button>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs uppercase tracking-widest text-white/40 w-16">Mod</span>
          {[0, 3, -2].map(m => (
            <button key={m} className={`${btn} ${modifier === m ? on : off}`} onClick={() => setModifier(m)}>
              {m >= 0 ? `+${m}` : m}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-white/35 max-w-md text-center">
        O dado pousa na face do resultado no instante <b>minSpin</b> — mesma janela do dado antigo.
        Clique no dado (ou nos botões) pra rolar.
      </p>
    </div>
  )
}
