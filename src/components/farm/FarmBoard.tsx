'use client'

// 🌾 Componentes PRESENTACIONAIS da Fazenda — sem fetch/DB: recebem o estado
// derivado (formato do /api/farm/state) e callbacks por props. A página /farm
// injeta os dados reais; o mock /dev/farm-mock injeta estado simulado.

import { useState } from 'react'
import { motion } from 'framer-motion'
import { CROPS, PEN, WELL, type CropDef } from '@/lib/farming'
import { GatherItemThumb, ProfessionBar } from '@/components/gathering/GatheringPanel'
import type { ProfessionLevelInfo } from '@/lib/professionSystem'

export interface FarmPlotVM {
  slotIndex: number
  cropId: string | null
  state: 'empty' | 'growing' | 'ready'
  secondsLeft: number
  outputName: string | null
}

export interface FarmVM {
  farm: ProfessionLevelInfo
  unlockedPlots: number
  plots: FarmPlotVM[]
  well: { pending: number; cap: number; intervalSeconds: number }
  pen: {
    unlocked: boolean
    minLevel: number
    state: 'empty' | 'growing' | 'ready'
    secondsLeft: number
    feedName: string
    outputName: string
    yield: number
  }
  inputCounts: Record<string, number>
  stamina: number
  maxStamina: number
  actionStamina: number
}

function fmtCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}`
  const sec = s % 60
  if (m > 0) return `${m}m${String(sec).padStart(2, '0')}`
  return `${sec}s`
}

// ============================================================
// Canteiro
// ============================================================

function PlotCard({
  plot, busy, onOpenPicker, onHarvest,
}: {
  plot: FarmPlotVM
  busy?: boolean
  onOpenPicker: (slotIndex: number) => void
  onHarvest: (slotIndex: number) => void
}) {
  const crop = plot.cropId ? CROPS[plot.cropId as keyof typeof CROPS] : null
  return (
    <div
      className={`relative rounded-2xl border-2 p-4 min-h-[132px] flex flex-col items-center justify-center text-center transition-colors ${
        plot.state === 'ready'
          ? 'border-emerald-400/70 bg-emerald-950/40'
          : plot.state === 'growing'
          ? 'border-amber-700/50 bg-amber-950/20'
          : 'border-white/15 bg-black/40 border-dashed'
      }`}
    >
      {plot.state === 'empty' && (
        <>
          <div className="text-3xl mb-1 opacity-40">🟫</div>
          <button
            onClick={() => onOpenPicker(plot.slotIndex)}
            disabled={busy}
            className="text-xs font-bold text-white bg-white/10 hover:bg-white/20 rounded-lg px-3 py-1.5 disabled:opacity-40 transition-colors"
          >
            🫘 Plantar
          </button>
        </>
      )}
      {plot.state === 'growing' && crop && (
        <>
          <motion.div
            className="text-3xl mb-1"
            animate={{ scale: [1, 1.08, 1] }}
            transition={{ repeat: Infinity, duration: 2.4 }}
          >
            🌱
          </motion.div>
          <div className="text-white text-xs font-bold">{crop.outputName}</div>
          <div className="text-amber-300/90 text-[11px] mt-0.5">⏳ {fmtCountdown(plot.secondsLeft)}</div>
        </>
      )}
      {plot.state === 'ready' && crop && (
        <>
          <motion.div
            className="text-3xl mb-1"
            animate={{ rotate: [0, -6, 6, 0] }}
            transition={{ repeat: Infinity, duration: 1.6 }}
          >
            {crop.emoji}
          </motion.div>
          <button
            onClick={() => onHarvest(plot.slotIndex)}
            disabled={busy}
            className="text-xs font-black text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg px-3 py-1.5 disabled:opacity-40 transition-colors"
          >
            🧺 Colher
          </button>
        </>
      )}
    </div>
  )
}

// ============================================================
// Board completo
// ============================================================

export function FarmBoard({
  vm, busy, onPlant, onHarvest, onWellCollect, onPenFeed,
}: {
  vm: FarmVM
  busy?: boolean
  onPlant: (slotIndex: number, cropId: string) => void
  onHarvest: (slotIndex: number) => void
  onWellCollect: () => void
  onPenFeed: () => void
}) {
  const [pickerSlot, setPickerSlot] = useState<number | null>(null)
  const feedCount = vm.inputCounts[vm.pen.feedName] ?? 0

  return (
    <div className="space-y-5">
      <div className="max-w-md mx-auto flex flex-col items-center gap-2">
        <ProfessionBar label="Fazenda" emoji="🌾" info={vm.farm} />
        <div className="text-white/50 text-xs">
          ⚡ {vm.stamina}/{vm.maxStamina} · cada ação custa {vm.actionStamina}
        </div>
      </div>

      {/* Canteiros */}
      <div>
        <h2 className="text-white font-black text-sm mb-2">
          🟫 Canteiros <span className="text-white/40 font-normal">({vm.unlockedPlots} liberados — +1 a cada 5 níveis)</span>
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {vm.plots.map((p) => (
            <PlotCard key={p.slotIndex} plot={p} busy={busy} onOpenPicker={setPickerSlot} onHarvest={onHarvest} />
          ))}
          {Array.from({ length: Math.max(0, 6 - vm.unlockedPlots) }).map((_, i) => (
            <div
              key={`locked-${i}`}
              className="rounded-2xl border-2 border-white/5 bg-black/60 p-4 min-h-[132px] flex flex-col items-center justify-center opacity-40"
            >
              <div className="text-2xl mb-1">🔒</div>
              <div className="text-white/50 text-[10px]">Nv. {(vm.unlockedPlots - 1) * 5} de Fazenda</div>
            </div>
          ))}
        </div>
      </div>

      {/* Estruturas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Poço */}
        <div className="rounded-2xl border-2 border-sky-700/50 bg-sky-950/30 p-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-3xl mb-1">💧</div>
              <div className="text-white font-black text-sm">Poço</div>
              <div className="text-white/50 text-[11px]">
                1 Água Pura a cada {Math.round(WELL.intervalSeconds / 60)} min (teto {vm.well.cap})
              </div>
            </div>
            <div className="text-right">
              <div className="text-sky-300 font-black text-xl">{vm.well.pending}<span className="text-white/40 text-sm">/{vm.well.cap}</span></div>
            </div>
          </div>
          <button
            onClick={onWellCollect}
            disabled={busy || vm.well.pending <= 0}
            className="mt-3 w-full text-xs font-black text-white bg-sky-600 hover:bg-sky-500 rounded-lg px-3 py-2 disabled:opacity-40 transition-colors"
          >
            💧 Coletar água
          </button>
        </div>

        {/* Cercado */}
        <div className={`rounded-2xl border-2 p-4 ${vm.pen.unlocked ? 'border-orange-700/50 bg-orange-950/25' : 'border-white/10 bg-black/60 opacity-60'}`}>
          <div className="flex items-start justify-between">
            <div>
              <div className="text-3xl mb-1">🐄</div>
              <div className="text-white font-black text-sm">Cercado</div>
              <div className="text-white/50 text-[11px]">
                1 {vm.pen.feedName} → {vm.pen.yield}× {vm.pen.outputName} em {Math.round(PEN.cycleSeconds / 3600)}h
              </div>
            </div>
            <div className="text-right text-[11px] text-white/60">
              {vm.pen.unlocked ? `🥣 ${feedCount} ração` : `🔒 Nv. ${vm.pen.minLevel}`}
            </div>
          </div>
          {!vm.pen.unlocked ? (
            <div className="mt-3 text-center text-white/40 text-[11px]">Destrava no nível {vm.pen.minLevel} de Fazenda</div>
          ) : vm.pen.state === 'empty' ? (
            <button
              onClick={onPenFeed}
              disabled={busy || feedCount <= 0}
              title={feedCount <= 0 ? 'Crafte Ração na Bancada de Alquimia (2 Trigo + 1 Água Pura)' : undefined}
              className="mt-3 w-full text-xs font-black text-white bg-orange-600 hover:bg-orange-500 rounded-lg px-3 py-2 disabled:opacity-40 transition-colors"
            >
              🥣 Alimentar (1 {vm.pen.feedName})
            </button>
          ) : vm.pen.state === 'growing' ? (
            <div className="mt-3 text-center text-amber-300/90 text-xs font-bold">⏳ {fmtCountdown(vm.pen.secondsLeft)}</div>
          ) : (
            <button
              onClick={() => onHarvest(101)}
              disabled={busy}
              className="mt-3 w-full text-xs font-black text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg px-3 py-2 disabled:opacity-40 transition-colors"
            >
              🧺 Colher {vm.pen.yield}× {vm.pen.outputName}
            </button>
          )}
        </div>
      </div>

      {/* Seletor de semente */}
      {pickerSlot != null && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setPickerSlot(null)}>
          <motion.div
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-zinc-900 border border-white/20 rounded-2xl p-5 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-white font-black text-sm mb-3">🫘 O que plantar?</h3>
            <div className="space-y-2">
              {(Object.values(CROPS) as CropDef[]).map((crop) => {
                const seeds = vm.inputCounts[crop.seedName] ?? 0
                return (
                  <button
                    key={crop.id}
                    disabled={busy || seeds <= 0}
                    onClick={() => { onPlant(pickerSlot, crop.id); setPickerSlot(null) }}
                    className="w-full flex items-center gap-3 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed p-3 text-left transition-colors"
                  >
                    <span className="w-10 h-10 rounded-lg bg-black/50 border border-white/10 flex items-center justify-center text-xl overflow-hidden">
                      <GatherItemThumb name={crop.seedName} />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-white text-xs font-bold">{crop.outputName}</span>
                      <span className="block text-white/50 text-[10px]">
                        {Math.round(crop.growSeconds / 3600)}h · colhe {crop.yieldMin}–{crop.yieldMax} · +{crop.farmXp} XP
                      </span>
                    </span>
                    <span className={`text-[11px] font-bold ${seeds > 0 ? 'text-emerald-300' : 'text-red-400'}`}>
                      ×{seeds}
                    </span>
                  </button>
                )
              })}
            </div>
            <p className="text-white/30 text-[10px] mt-3">
              Sem sementes? Elas caem coletando nos <a href="/gathering" className="underline">Campos de Ervas</a>.
            </p>
          </motion.div>
        </div>
      )}
    </div>
  )
}
