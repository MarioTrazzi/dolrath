'use client'

// Página DEV: valida o layout da Fazenda sem DB/auth — estado local com
// crescimento ACELERADO (segundos em vez de horas). Espírito do /dev/dungeon-mock.

import { useEffect, useState } from 'react'
import { FarmBoard, type FarmVM } from '@/components/farm/FarmBoard'
import { CROPS, rollCropYield, PEN } from '@/lib/farming'
import { getProfessionLevelInfo } from '@/lib/professionSystem'

const MOCK_GROW_SECONDS = 10 // todo cultivo/ciclo fica pronto em 10s

const initialVm = (): FarmVM => ({
  farm: getProfessionLevelInfo(60 * Math.pow(7 - 1, 1.5) + 10), // Nv. 7 (cercado aberto)
  unlockedPlots: 3,
  plots: [0, 1, 2].map((slotIndex) => ({ slotIndex, cropId: null, state: 'empty', secondsLeft: 0, outputName: null })),
  well: { pending: 4, cap: 12, intervalSeconds: 1800 },
  pen: { unlocked: true, minLevel: 5, state: 'empty', secondsLeft: 0, feedName: 'Ração', outputName: 'Couro', yield: PEN.yield },
  inputCounts: { 'Semente de Trigo': 3, 'Semente de Erva Medicinal': 2, 'Semente de Linho': 1, 'Ração': 2 },
  stamina: 88,
  maxStamina: 100,
  actionStamina: 2,
})

export default function FarmMockPage() {
  const [vm, setVm] = useState<FarmVM>(initialVm)
  const [log, setLog] = useState<string[]>([])

  // Contagem regressiva acelerada.
  useEffect(() => {
    const id = setInterval(() => {
      setVm((prev) => ({
        ...prev,
        plots: prev.plots.map((p) =>
          p.state === 'growing'
            ? { ...p, secondsLeft: Math.max(0, p.secondsLeft - 1), state: p.secondsLeft <= 1 ? 'ready' : 'growing' }
            : p
        ),
        pen: prev.pen.state === 'growing'
          ? { ...prev.pen, secondsLeft: Math.max(0, prev.pen.secondsLeft - 1), state: prev.pen.secondsLeft <= 1 ? 'ready' : 'growing' }
          : prev.pen,
      }))
    }, 1000)
    return () => clearInterval(id)
  }, [])

  const push = (msg: string) => setLog((l) => [msg, ...l].slice(0, 5))

  return (
    <div className="min-h-[100dvh] p-4 sm:p-6 bg-zinc-950">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-black text-white text-center mb-1">🌾 Fazenda — MOCK</h1>
        <p className="text-white/40 text-xs text-center mb-6">
          Crescimento acelerado: {MOCK_GROW_SECONDS}s (real: horas) · Nv. 7 de Fazenda · sem DB
        </p>

        {log.length > 0 && (
          <div className="bg-black/60 border border-white/20 text-white/80 px-4 py-2 rounded-xl mb-4 text-xs text-center">
            {log[0]}
          </div>
        )}

        <FarmBoard
          vm={vm}
          onPlant={(slotIndex, cropId) => {
            const crop = CROPS[cropId as keyof typeof CROPS]
            setVm((prev) => ({
              ...prev,
              stamina: prev.stamina - prev.actionStamina,
              inputCounts: { ...prev.inputCounts, [crop.seedName]: Math.max(0, (prev.inputCounts[crop.seedName] ?? 0) - 1) },
              plots: prev.plots.map((p) =>
                p.slotIndex === slotIndex
                  ? { ...p, cropId, state: 'growing', secondsLeft: MOCK_GROW_SECONDS, outputName: crop.outputName }
                  : p
              ),
            }))
            push(`🫘 Plantou ${crop.outputName}`)
          }}
          onHarvest={(slotIndex) => {
            if (slotIndex === 101) {
              setVm((prev) => ({ ...prev, stamina: prev.stamina - prev.actionStamina, pen: { ...prev.pen, state: 'empty', secondsLeft: 0 } }))
              push(`🧺 Colheu ${PEN.yield}× Couro (+${PEN.farmXp} XP)`)
              return
            }
            setVm((prev) => {
              const plot = prev.plots.find((p) => p.slotIndex === slotIndex)
              const crop = plot?.cropId ? CROPS[plot.cropId as keyof typeof CROPS] : null
              if (crop) push(`🧺 Colheu ${rollCropYield(crop)}× ${crop.outputName} (+${crop.farmXp} XP)`)
              return {
                ...prev,
                stamina: prev.stamina - prev.actionStamina,
                plots: prev.plots.map((p) =>
                  p.slotIndex === slotIndex ? { ...p, cropId: null, state: 'empty', secondsLeft: 0, outputName: null } : p
                ),
              }
            })
          }}
          onWellCollect={() => {
            setVm((prev) => ({ ...prev, stamina: prev.stamina - prev.actionStamina, well: { ...prev.well, pending: 0 } }))
            push(`💧 Coletou ${vm.well.pending}× Água Pura`)
          }}
          onPenFeed={() => {
            setVm((prev) => ({
              ...prev,
              stamina: prev.stamina - prev.actionStamina,
              inputCounts: { ...prev.inputCounts, 'Ração': Math.max(0, (prev.inputCounts['Ração'] ?? 0) - 1) },
              pen: { ...prev.pen, state: 'growing', secondsLeft: MOCK_GROW_SECONDS },
            }))
            push('🥣 Alimentou o cercado')
          }}
        />
      </div>
    </div>
  )
}
