'use client'

// Página DEV: valida o layout da Fazenda sem DB/auth — estado local com
// crescimento ACELERADO (segundos em vez de horas). Espírito do /dev/dungeon-mock.
// Fazenda global: plantar é grátis (+XP), colher pega TODOS os prontos (1⚡ cada).

import { useEffect, useState } from 'react'
import { FarmBoard, type FarmVM, type HarvestResultVM } from '@/components/farm/FarmBoard'
import {
  CROPS, rollCropYield, farmStoneChance, rollFarmStoneShard, cropPlantXp,
  FARM_STONE_BONUS_XP, FARM_HARVEST_STAMINA, PEN,
} from '@/lib/farming'
import { getProfessionLevelInfo, farmPlotCount } from '@/lib/professionSystem'

const MOCK_GROW_SECONDS = 10 // todo cultivo/ciclo fica pronto em 10s
const MOCK_FARM_LEVEL = 7 // cercado aberto (Nv. 5+)

const initialVm = (): FarmVM => {
  const farm = getProfessionLevelInfo(60 * Math.pow(MOCK_FARM_LEVEL - 1, 1.5) + 10)
  const unlockedPlots = farmPlotCount(farm.level)
  return {
    farm,
    unlockedPlots,
    plots: Array.from({ length: unlockedPlots }, (_, slotIndex) => ({
      slotIndex, cropId: null, state: 'empty' as const, secondsLeft: 0, outputName: null,
    })),
    well: { pending: 4, cap: 12, intervalSeconds: 1800 },
    pen: { unlocked: true, minLevel: 5, state: 'empty', secondsLeft: 0, feedName: 'Ração', outputName: 'Couro', yield: PEN.yield },
    inputCounts: { 'Semente de Trigo': 5, 'Semente de Erva Medicinal': 3, 'Semente de Linho': 2, 'Ração': 2 },
    stamina: 88,
    maxStamina: 100,
    actionStamina: 2,
    stoneChance: farmStoneChance(farm.level),
  }
}

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
          Crescimento acelerado: {MOCK_GROW_SECONDS}s (real: horas) · Nv. {MOCK_FARM_LEVEL} de Fazenda · fazenda global · sem DB
        </p>

        {log.length > 0 && (
          <div className="bg-black/60 border border-white/20 text-white/80 px-4 py-2 rounded-xl mb-4 text-xs text-center">
            {log[0]}
          </div>
        )}

        <div className="flex justify-center mb-3">
          <button
            onClick={() => setVm((prev) => ({ ...prev, inventoryFull: !prev.inventoryFull }))}
            className={`text-[11px] font-bold px-3 py-1.5 rounded-lg border transition-colors ${
              vm.inventoryFull ? 'border-amber-400/60 bg-amber-500/20 text-amber-200' : 'border-white/15 bg-white/5 text-white/50'
            }`}
          >
            🎒 {vm.inventoryFull ? 'Inventário CHEIO (clique p/ liberar)' : 'Simular inventário cheio'}
          </button>
        </div>

        <FarmBoard
          vm={vm}
          onPlant={(slotIndex, cropId) => {
            const crop = CROPS[cropId as keyof typeof CROPS]
            const xp = cropPlantXp(crop)
            setVm((prev) => ({
              ...prev,
              inputCounts: { ...prev.inputCounts, [crop.seedName]: Math.max(0, (prev.inputCounts[crop.seedName] ?? 0) - 1) },
              plots: prev.plots.map((p) =>
                p.slotIndex === slotIndex
                  ? { ...p, cropId, state: 'growing', secondsLeft: MOCK_GROW_SECONDS, outputName: crop.outputName }
                  : p
              ),
            }))
            push(`🫘 Plantou ${crop.outputName} (grátis · +${xp} XP)`)
          }}
          onHarvest={async (slotIndex?: number): Promise<HarvestResultVM> => {
            if (slotIndex === 101) {
              setVm((prev) => ({ ...prev, stamina: prev.stamina - prev.actionStamina, pen: { ...prev.pen, state: 'empty', secondsLeft: 0 } }))
              push(`🧺 Colheu ${PEN.yield}× Couro (+${PEN.farmXp} XP)`)
              return { items: [{ outputName: PEN.outputName, qty: PEN.yield }], xpGained: PEN.farmXp, harvested: 1 }
            }

            // Colhe TODOS os prontos, limitado pela stamina (1⚡ por canteiro).
            const ready = vm.plots.filter((p) => p.state === 'ready' && p.cropId)
            if (ready.length === 0) throw new Error('Nenhum canteiro pronto para colher.')
            const affordable = Math.floor(vm.stamina / FARM_HARVEST_STAMINA)
            if (affordable <= 0) throw new Error('Stamina insuficiente.')
            const toHarvest = ready.slice(0, affordable)

            const qtyByOutput: Record<string, number> = {}
            const stoneNames: string[] = []
            let xpGained = 0
            for (const p of toHarvest) {
              const crop = CROPS[p.cropId as keyof typeof CROPS]
              qtyByOutput[crop.outputName] = (qtyByOutput[crop.outputName] ?? 0) + rollCropYield(crop)
              xpGained += crop.farmXp
              if (Math.random() * 100 < farmStoneChance(vm.farm.level)) {
                stoneNames.push(rollFarmStoneShard())
                xpGained += FARM_STONE_BONUS_XP
              }
            }

            const harvestedSlots = new Set(toHarvest.map((p) => p.slotIndex))
            setVm((prev) => ({
              ...prev,
              stamina: prev.stamina - toHarvest.length * FARM_HARVEST_STAMINA,
              plots: prev.plots.map((p) =>
                harvestedSlots.has(p.slotIndex) ? { ...p, cropId: null, state: 'empty', secondsLeft: 0, outputName: null } : p
              ),
            }))
            const itemsDesc = Object.entries(qtyByOutput).map(([n, q]) => `${q}× ${n}`).join(', ')
            push(stoneNames.length > 0 ? `🧺 Colheu ${itemsDesc} + 💎 ${stoneNames.join(', ')} (+${xpGained} XP)` : `🧺 Colheu ${itemsDesc} (+${xpGained} XP)`)

            return {
              items: Object.entries(qtyByOutput).map(([outputName, qty]) => ({ outputName, qty })),
              xpGained,
              stoneNames,
              harvested: toHarvest.length,
              skippedNoStamina: ready.length - toHarvest.length,
            }
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
