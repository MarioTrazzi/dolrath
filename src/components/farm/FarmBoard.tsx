'use client'

// 🌾 Componentes PRESENTACIONAIS da Fazenda v2 — sem fetch/DB: recebem o estado
// derivado (formato do /api/farm/state) e callbacks por props. A página /farm
// injeta os dados reais; o mock /dev/farm-mock injeta estado simulado.
//
// v2 (handoff Claude Design, Fazenda.html/farm-app.jsx): canteiro único de 16
// slots (em vez de 6 canteiros separados), semente "na mão" selecionada antes
// de plantar (em vez de escolher por slot), e colher abre um dialog com timer
// de colheita — que também é onde a chance rara de Estilhaço de Pedra Negra
// (💎) é revelada.

import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CROPS, cropGrowSeconds, FARM_PLANT_STAMINA, FARM_HARVEST_STAMINA, type CropDef } from '@/lib/farming'
import { farmPlotUnlockLevel, FARM_TOTAL_PLOTS, type ProfessionLevelInfo } from '@/lib/professionSystem'
import { GatherItemThumb, ProfessionBar } from '@/components/gathering/GatheringPanel'

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
  /** Chance (%) de a colheita de um canteiro render um Estilhaço de Pedra Negra. */
  stoneChance: number
  /** Inventário sem slot livre: colheitas vão falhar (mesma mecânica da masmorra/coleta). */
  inventoryFull?: boolean
}

export interface HarvestResultVM {
  outputName: string
  qty: number
  xpGained: number
  gotStone?: boolean
  stoneName?: string
}

const FLAVOR = [
  'Afrouxando a terra ao redor…',
  'Cortando os talos com a foice…',
  'Sacudindo a raiz para soltar o solo…',
  'Separando o que prestou da palha…',
  'Guardando tudo no cesto…',
]

const HARVEST_ANIM_MS = 2200

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
// Barra genérica (stamina)
// ============================================================

function BarRow({ icon, label, value, max, color, right }: {
  icon: string; label: string; value: number; max: number; color: string; right?: React.ReactNode
}) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100))
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-bold text-white/80">{icon} {label}</span>
        {right}
      </div>
      <div className="h-2 rounded-full bg-black/50 overflow-hidden border border-white/10">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

// ============================================================
// Slot do canteiro
// ============================================================

function PlotCell({
  slotIndex, plot, unlocked, unlockLevel, farmLevel, busy, onPlant, onOpenHarvest,
}: {
  slotIndex: number
  plot: FarmPlotVM | undefined
  unlocked: boolean
  unlockLevel: number
  farmLevel: number
  busy?: boolean
  onPlant: (slotIndex: number) => void
  onOpenHarvest: (slotIndex: number) => void
}) {
  if (!unlocked) {
    return (
      <div className="relative aspect-square rounded-xl border border-white/5 bg-black/50 flex flex-col items-center justify-center gap-0.5 select-none">
        <span className="text-white/20 text-base">🔒</span>
        <span className="text-white/25 text-[9px] font-bold">Nv.{unlockLevel}</span>
      </div>
    )
  }

  const state = plot?.state ?? 'empty'
  const crop = plot?.cropId ? (CROPS as Record<string, CropDef>)[plot.cropId] : null

  if (state === 'empty' || !crop) {
    return (
      <button
        onClick={() => onPlant(slotIndex)}
        disabled={busy}
        aria-label={`Plantar no slot ${slotIndex + 1}`}
        className="relative aspect-square rounded-xl border border-dashed border-white/15 bg-black/30 hover:bg-white/5 hover:border-white/30 disabled:opacity-40 transition-all flex items-center justify-center min-h-[44px]"
      >
        <span className="text-white/25 text-xl font-light">+</span>
      </button>
    )
  }

  if (state === 'growing') {
    const total = cropGrowSeconds(crop, farmLevel)
    const progress = total > 0 ? Math.min(1, Math.max(0, 1 - (plot?.secondsLeft ?? 0) / total)) : 0
    return (
      <div className="relative aspect-square rounded-xl border border-white/10 bg-[#1b1b2f] flex flex-col items-center justify-center gap-1 overflow-hidden select-none">
        <motion.span className="text-xl" animate={{ scale: [1, 1.06, 1] }} transition={{ repeat: Infinity, duration: 2.4 }} style={{ filter: 'saturate(0.8)' }}>
          🌱
        </motion.span>
        <span className="font-bold text-[10px] text-white/45">{fmtCountdown(plot?.secondsLeft ?? 0)}</span>
        <div className="absolute bottom-0 inset-x-0 h-1 bg-black/60">
          <div className="h-full transition-all duration-300" style={{ width: `${progress * 100}%`, backgroundColor: '#e8b04a' }} />
        </div>
      </div>
    )
  }

  // ready
  return (
    <motion.button
      onClick={() => onOpenHarvest(slotIndex)}
      whileTap={{ scale: 0.92 }}
      disabled={busy}
      aria-label={`Colher ${crop.outputName}`}
      className="relative aspect-square rounded-xl border flex flex-col items-center justify-center gap-0.5 min-h-[44px] plot-ready disabled:opacity-60"
      style={{ borderColor: 'rgba(52,211,153,0.65)', background: 'radial-gradient(circle at 50% 35%, rgba(52,211,153,0.16), #1b1b2f 75%)', '--pr': 'rgba(52,211,153,0.35)' } as React.CSSProperties}
    >
      <motion.span animate={{ y: [0, -2, 0] }} transition={{ repeat: Infinity, duration: 1.6 }} className="text-2xl">
        {crop.emoji}
      </motion.span>
      <span className="text-[9px] font-black uppercase tracking-wide text-emerald-300">Colher</span>
    </motion.button>
  )
}

// ============================================================
// Dialog de colheita (confirm → working → done)
// ============================================================

function HarvestDialog({
  slotIndex, plot, stamina, stoneChance, busy, onHarvest, onClose,
}: {
  slotIndex: number
  plot: FarmPlotVM
  stamina: number
  stoneChance: number
  busy?: boolean
  onHarvest: (slotIndex: number) => Promise<HarvestResultVM>
  onClose: () => void
}) {
  const [phase, setPhase] = useState<'confirm' | 'working' | 'done' | 'error'>('confirm')
  const [flavorIdx, setFlavorIdx] = useState(0)
  const [result, setResult] = useState<HarvestResultVM | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Instantâneo do plot no momento em que o dialog abriu: a colheita real já
  // limpa o slot (cropId: null) assim que o servidor responde, bem antes do
  // timer cosmético de "working" terminar — sem este snapshot o `plot` (prop
  // ao vivo) fica vazio no meio da animação e o dialog desaparece sozinho.
  const [snapshotPlot] = useState(plot)
  const crop = snapshotPlot.cropId ? (CROPS as Record<string, CropDef>)[snapshotPlot.cropId] : null
  if (!crop) return null

  const start = async () => {
    setPhase('working')
    const flavorTimer = setInterval(() => setFlavorIdx((i) => (i + 1) % FLAVOR.length), 700)
    try {
      const [res] = await Promise.all([
        onHarvest(slotIndex),
        new Promise((r) => setTimeout(r, HARVEST_ANIM_MS)),
      ])
      clearInterval(flavorTimer)
      setResult(res)
      setPhase('done')
    } catch (err) {
      clearInterval(flavorTimer)
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao colher')
      setPhase('error')
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-6"
      onClick={phase !== 'working' ? onClose : undefined}
    >
      <motion.div
        initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
        transition={{ type: 'spring', damping: 26, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-sm bg-zinc-900 border border-white/20 !rounded-b-none sm:!rounded-2xl px-5 pt-5 pb-7 sm:pb-5"
      >
        {phase === 'confirm' && (
          <div className="text-center">
            <div className="text-4xl mb-2">{crop.emoji}</div>
            <h2 className="text-white font-black text-lg mb-1">{crop.outputName} pronta!</h2>
            <p className="text-white/50 text-xs mb-4">
              Rende {crop.yieldMin}–{crop.yieldMax}× {crop.outputName} · −{FARM_HARVEST_STAMINA}⚡
            </p>
            <div className="rounded-xl border border-fuchsia-400/25 bg-fuchsia-500/10 px-3 py-2 mb-4 text-[11px] text-fuchsia-200/90">
              💎 Chance rara de Estilhaço de Pedra Negra: <span className="font-bold">{stoneChance}%</span>
            </div>
            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-white/70 text-sm font-bold py-3 transition-all">
                Deixar plantada
              </button>
              <button
                onClick={start}
                disabled={busy || stamina < FARM_HARVEST_STAMINA}
                className="flex-1 rounded-lg text-white text-sm font-black py-3 transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-emerald-600 hover:bg-emerald-500"
              >
                Colher · −{FARM_HARVEST_STAMINA}⚡
              </button>
            </div>
            {stamina < FARM_HARVEST_STAMINA && <div className="text-red-400 text-[11px] mt-2">⚡ Stamina insuficiente.</div>}
          </div>
        )}

        {phase === 'working' && (
          <div className="text-center py-2">
            <motion.div animate={{ rotate: [0, -8, 8, 0] }} transition={{ repeat: Infinity, duration: 0.9 }} className="text-4xl mb-3">
              {crop.emoji}
            </motion.div>
            <h2 className="text-white font-black text-base mb-1">Colhendo {crop.outputName}…</h2>
            <AnimatePresence mode="wait">
              <motion.p key={flavorIdx} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="text-white/45 text-xs mb-4 h-4">
                {FLAVOR[flavorIdx]}
              </motion.p>
            </AnimatePresence>
            <div className="h-2.5 rounded-full bg-black/60 border border-white/10 overflow-hidden">
              <motion.div
                initial={{ width: '0%' }} animate={{ width: '100%' }}
                transition={{ duration: HARVEST_ANIM_MS / 1000, ease: 'linear' }}
                className="h-full rounded-full bg-gradient-to-r from-amber-400 to-primary"
              />
            </div>
            <div className="text-white/30 text-[10px] mt-2">não feche — a colheita está em andamento</div>
          </div>
        )}

        {phase === 'done' && result && (
          <div className="text-center">
            <motion.div initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: 'spring', damping: 12 }} className="text-4xl mb-2">
              🧺
            </motion.div>
            <h2 className="text-white font-black text-lg mb-4">Colheita concluída!</h2>
            <div className="flex flex-col gap-2 mb-4">
              <motion.div initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }} className="flex items-center justify-between rounded-xl border border-white/10 bg-black/40 px-4 py-3">
                <span className="text-sm text-white/85">{crop.emoji} {result.outputName}</span>
                <span className="font-bold text-white">×{result.qty}</span>
              </motion.div>
              {result.gotStone && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.45, type: 'spring', damping: 10 }}
                  className="relative flex items-center justify-between rounded-xl border border-fuchsia-400/60 px-4 py-3 overflow-hidden"
                  style={{ background: 'linear-gradient(120deg, rgba(217,70,239,0.18), rgba(139,92,246,0.14))' }}
                >
                  <span className="text-sm font-bold text-fuchsia-200">💎 {result.stoneName}</span>
                  <span className="font-bold text-fuchsia-100">×1</span>
                  <span className="stone-shine absolute inset-0 pointer-events-none"></span>
                </motion.div>
              )}
              <motion.div initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: result.gotStone ? 0.65 : 0.3 }} className="text-[11px] text-white/45">
                +<span className="text-amber-300 font-bold">{result.xpGained} XP</span> de Fazenda
              </motion.div>
            </div>
            <button onClick={onClose} className="w-full rounded-lg text-white text-sm font-black py-3 transition-all bg-emerald-600 hover:bg-emerald-500">
              Guardar no inventário
            </button>
          </div>
        )}

        {phase === 'error' && (
          <div className="text-center">
            <div className="text-4xl mb-2">⚠️</div>
            <h2 className="text-white font-black text-base mb-2">Não deu para colher</h2>
            <p className="text-white/60 text-xs mb-4">{errorMsg}</p>
            <button onClick={onClose} className="w-full rounded-lg text-white text-sm font-black py-3 transition-all bg-white/10 hover:bg-white/20">
              Fechar
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
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
  onHarvest: (slotIndex: number) => Promise<HarvestResultVM>
  onWellCollect: () => void
  onPenFeed: () => void
}) {
  const cropList = useMemo(() => Object.values(CROPS) as CropDef[], [])
  const [selectedCrop, setSelectedCrop] = useState<string>(cropList[0]?.id ?? 'trigo')
  const [dialogSlot, setDialogSlot] = useState<number | null>(null)
  const feedCount = vm.inputCounts[vm.pen.feedName] ?? 0
  const farmLevel = vm.farm.level

  const plotBySlot = useMemo(() => new Map(vm.plots.map((p) => [p.slotIndex, p])), [vm.plots])
  const readyCount = vm.plots.filter((p) => p.state === 'ready').length
  const dialogPlot = dialogSlot != null ? plotBySlot.get(dialogSlot) : undefined

  return (
    <div className="space-y-5">
      {vm.inventoryFull && (
        <div className="max-w-md mx-auto rounded-xl border border-amber-500/50 bg-amber-950/40 px-3 py-2.5 text-amber-200 text-xs font-bold text-center">
          🎒 Inventário cheio — colheitas e coletas vão falhar. Abra espaço no inventário para continuar.
        </div>
      )}

      {/* Nível de Fazenda + Stamina + chance de pedra */}
      <div className="max-w-md mx-auto flex flex-col gap-2.5 glass-card px-4 py-3">
        <ProfessionBar label="Fazenda" emoji="🌾" info={vm.farm} />
        <BarRow icon="⚡" label="Stamina" value={vm.stamina} max={vm.maxStamina} color="var(--warning)"
          right={<span className="text-[11px] text-white/50">{vm.stamina}/{vm.maxStamina}</span>} />
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-white/40">💎 Chance de Estilhaço de Pedra Negra</span>
          <span className="font-bold text-fuchsia-300">{vm.stoneChance}%</span>
        </div>
      </div>

      {/* Semente na mão */}
      <div className="max-w-md mx-auto">
        <div className="text-[11px] uppercase tracking-widest text-white/40 mb-2 font-bold">Semente na mão</div>
        <div className="grid grid-cols-3 gap-2">
          {cropList.map((crop) => {
            const sel = selectedCrop === crop.id
            const count = vm.inputCounts[crop.seedName] ?? 0
            return (
              <button
                key={crop.id}
                onClick={() => setSelectedCrop(crop.id)}
                className={`rounded-xl border px-2 py-2.5 text-left transition-all min-h-[44px] ${
                  sel ? 'border-amber-400/70 bg-white/10' : 'border-white/10 bg-black/30 hover:bg-white/5'
                } ${count <= 0 ? 'opacity-50' : ''}`}
              >
                <span className="w-6 h-6 rounded bg-black/40 border border-white/10 flex items-center justify-center text-sm overflow-hidden mb-1">
                  <GatherItemThumb name={crop.seedName} />
                </span>
                <div className="text-white text-[11px] font-bold leading-tight">{crop.outputName}</div>
                <div className="text-white/40 text-[10px]">🫘 {count} · ⏱ {Math.round(cropGrowSeconds(crop, farmLevel) / 3600)}h</div>
              </button>
            )
          })}
        </div>
        <div className="text-white/35 text-[10px] mt-1.5">
          toque num slot vazio para plantar (−{FARM_PLANT_STAMINA}⚡)
        </div>
      </div>

      {/* Canteiro único */}
      <div className="max-w-md mx-auto glass-card p-3">
        <div className="flex items-center justify-between mb-2 px-1">
          <div className="text-[11px] uppercase tracking-widest text-white/40 font-bold">Canteiro</div>
          {readyCount > 0 && (
            <span className="text-[11px] font-bold text-emerald-300">🧺 {readyCount} pronta{readyCount > 1 ? 's' : ''} p/ colher</span>
          )}
        </div>
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: FARM_TOTAL_PLOTS }).map((_, i) => (
            <PlotCell
              key={i}
              slotIndex={i}
              plot={plotBySlot.get(i)}
              unlocked={i < vm.unlockedPlots}
              unlockLevel={farmPlotUnlockLevel(i)}
              farmLevel={farmLevel}
              busy={busy}
              onPlant={(slot) => onPlant(slot, selectedCrop)}
              onOpenHarvest={setDialogSlot}
            />
          ))}
        </div>
      </div>

      {/* Estruturas */}
      <div className="max-w-md mx-auto grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Poço */}
        <div className="rounded-2xl border-2 border-sky-700/50 bg-sky-950/30 p-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-3xl mb-1">💧</div>
              <div className="text-white font-black text-sm">Poço</div>
              <div className="text-white/50 text-[11px]">
                1 Água Pura a cada {Math.round(vm.well.intervalSeconds / 60)} min (teto {vm.well.cap})
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
                1 {vm.pen.feedName} → {vm.pen.yield}× {vm.pen.outputName}
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
              onClick={() => onHarvest(101).catch(() => {})}
              disabled={busy}
              className="mt-3 w-full text-xs font-black text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg px-3 py-2 disabled:opacity-40 transition-colors"
            >
              🧺 Colher {vm.pen.yield}× {vm.pen.outputName}
            </button>
          )}
        </div>
      </div>

      {/* Dialog de colheita */}
      <AnimatePresence>
        {dialogSlot != null && dialogPlot && (
          <HarvestDialog
            slotIndex={dialogSlot}
            plot={dialogPlot}
            stamina={vm.stamina}
            stoneChance={vm.stoneChance}
            busy={busy}
            onHarvest={onHarvest}
            onClose={() => setDialogSlot(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
