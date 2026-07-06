'use client'

// Página DEV: valida o layout da Coleta sem DB/auth — estado local com tique
// ACELERADO (5s em vez de 15min). Mesmo espírito do /dev/dungeon-mock.

import { useEffect, useRef, useState } from 'react'
import { FieldGrid, SessionPanel, ProfessionBar } from '@/components/gathering/GatheringPanel'
import { rollGatherYield, mergePendingYield, GATHER_TICK_STAMINA, type GatherFieldId, type PendingYield } from '@/lib/gathering'
import { getProfessionLevelInfo } from '@/lib/professionSystem'

const MOCK_TICK_SECONDS = 5
const GATHER_LEVEL = 12 // destrava a 1ª faixa de raros (minLevel 10)

export default function GatheringMockPage() {
  const [fieldId, setFieldId] = useState<GatherFieldId | null>(null)
  const [pending, setPending] = useState<PendingYield>({ drops: [], xp: 0, ticks: 0 })
  const [stamina, setStamina] = useState(100)
  const [countdown, setCountdown] = useState(MOCK_TICK_SECONDS)
  const [startedAt, setStartedAt] = useState<Date>(new Date())
  const [invFull, setInvFull] = useState(false)
  const [stopRequested, setStopRequested] = useState(false)
  const staminaRef = useRef(stamina)
  staminaRef.current = stamina
  const invFullRef = useRef(invFull)
  invFullRef.current = invFull
  const stopRequestedRef = useRef(stopRequested)
  stopRequestedRef.current = stopRequested

  const gatherXp = 60 * Math.pow(GATHER_LEVEL - 1, 1.5) + 40
  const info = getProfessionLevelInfo(gatherXp)
  const exhausted = stamina < GATHER_TICK_STAMINA

  // Relógio do mock: a cada MOCK_TICK_SECONDS rende 1 tique (se há stamina e
  // o inventário não estiver "cheio" — mesma pausa do servidor real). Com
  // "aguardar último ciclo" pendente, o tique que fecha agora encerra sozinho
  // (mesma lógica do finishStopRequested do servidor).
  useEffect(() => {
    if (!fieldId) return
    const id = setInterval(() => {
      if (invFullRef.current) return // pausado: nem stamina nem tique avançam
      setCountdown((c) => {
        if (c > 1) return c - 1
        if (staminaRef.current >= GATHER_TICK_STAMINA) {
          const y = rollGatherYield(fieldId, GATHER_LEVEL, 1)
          setPending((prev) => mergePendingYield(prev, y, 1))
          setStamina((s) => s - GATHER_TICK_STAMINA)
          if (stopRequestedRef.current) {
            // Fecha e deposita — mesmo reset do onStopNow, pra próxima sessão começar limpa.
            setFieldId(null)
            setStopRequested(false)
            setPending({ drops: [], xp: 0, ticks: 0 })
            setStamina(100)
            setInvFull(false)
          }
        }
        return MOCK_TICK_SECONDS
      })
    }, 1000)
    return () => clearInterval(id)
  }, [fieldId])

  return (
    <div className="min-h-[100dvh] p-4 sm:p-6 bg-zinc-950">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-black text-white text-center mb-1">⛏️ Coleta — MOCK</h1>
        <p className="text-white/40 text-xs text-center mb-6">
          Tique acelerado: {MOCK_TICK_SECONDS}s (real: 15min) · Nv. {GATHER_LEVEL} de Coleta · sem DB
        </p>

        {!fieldId ? (
          <>
            <div className="mb-4 max-w-md mx-auto">
              <ProfessionBar label="Coleta" emoji="⛏️" info={info} />
            </div>
            <FieldGrid gatherLevel={GATHER_LEVEL} onEnter={(f) => { setFieldId(f.id); setStartedAt(new Date()) }} />
          </>
        ) : (
          <>
            <div className="max-w-md mx-auto mb-3 flex justify-center">
              <button
                onClick={() => setInvFull((v) => !v)}
                className={`text-[11px] font-bold px-3 py-1.5 rounded-lg border transition-colors ${
                  invFull ? 'border-amber-400/60 bg-amber-500/20 text-amber-200' : 'border-white/15 bg-white/5 text-white/50'
                }`}
              >
                🎒 {invFull ? 'Inventário CHEIO (clique p/ liberar)' : 'Simular inventário cheio'}
              </button>
            </div>
            <SessionPanel
              fieldId={fieldId}
              status={exhausted ? 'exhausted' : 'active'}
              startedAt={startedAt}
              stopRequested={stopRequested}
              pending={pending}
              stamina={stamina}
              maxStamina={100}
              secondsToNextTick={countdown * (900 / MOCK_TICK_SECONDS)} // escala p/ barra parecer real
              gather={info}
              inventoryFull={invFull}
              onCollect={() => setPending({ drops: [], xp: 0, ticks: 0 })}
              onStopNow={() => { setFieldId(null); setPending({ drops: [], xp: 0, ticks: 0 }); setStamina(100); setInvFull(false); setStopRequested(false) }}
              onStopAfterCycle={() => setStopRequested(true)}
              onCancelStop={() => setStopRequested(false)}
            />
          </>
        )}
      </div>
    </div>
  )
}
