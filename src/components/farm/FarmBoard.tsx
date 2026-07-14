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
//
// v3 (fazenda global): a fazenda é da CONTA — plantar é grátis (+XP) e a
// colheita pega TODOS os canteiros prontos de uma vez, 1⚡ por canteiro para
// o personagem ativo (que leva itens e XP).

import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CROPS, cropGrowSeconds, cropYieldRange, FARM_HARVEST_STAMINA, WELL, WELL_COLLECT_STAMINA, type CropDef } from '@/lib/farming'
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
  wellCollectStamina: number
  /** Chance (%) de a colheita de um canteiro render um Estilhaço de Pedra Negra. */
  stoneChance: number
  /** Chance (%) de um pull do poço render um Estilhaço. */
  wellShardChance: number
  /** Chance (%) de um pull do poço render uma Pedra Negra. */
  wellStoneChance: number
  /** Inventário sem slot livre: colheitas vão falhar (mesma mecânica da masmorra/coleta). */
  inventoryFull?: boolean
}

export interface HarvestResultVM {
  /** Um item por CANTEIRO colhido, na ordem processada (a UI anima nessa sequência). */
  results: { outputName: string; qty: number; stoneName?: string }[]
  xpGained: number
  harvested: number
  /** Canteiros prontos que ficaram para trás (stamina/inventário não cobriram). */
  skippedNoStamina?: number
  skippedNoSpace?: number
}

export interface WellCollectResultVM {
  outputName: string
  qty: number
  bonuses: { name: string; kind: 'shard' | 'stone' }[]
  xpGained: number
  pendingLeft: number
}

const FLAVOR = [
  'Afrouxando a terra ao redor…',
  'Cortando os talos com a foice…',
  'Sacudindo a raiz para soltar o solo…',
  'Separando o que prestou da palha…',
  'Guardando tudo no cesto…',
]

/** Duração da animação de colheita de CADA canteiro (a "working" pausa esse tempo por item). */
const HARVEST_ITEM_ANIM_MS = 3000

/** Tempo da animação do balde subindo no poço. */
const WELL_BUCKET_ANIM_MS = 2200

const WELL_FLAVOR = [
  'Abaixando o balde no poço…',
  'A corda estica na água escura…',
  'Puxando o balde cheio…',
  'A água pinga pelas laterais…',
]

function cropByOutputName(outputName: string): CropDef | undefined {
  return (Object.values(CROPS) as CropDef[]).find((c) => c.outputName === outputName)
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
// Dialog de colheita (confirm → working → done) — colhe TODOS os prontos
// ============================================================

function HarvestDialog({
  readyPlots, stamina, stoneChance, farmLevel, busy, onHarvest, onClose,
}: {
  readyPlots: FarmPlotVM[]
  stamina: number
  stoneChance: number
  farmLevel: number
  busy?: boolean
  onHarvest: () => Promise<HarvestResultVM>
  onClose: () => void
}) {
  const [phase, setPhase] = useState<'confirm' | 'working' | 'done' | 'error'>('confirm')
  const [flavorIdx, setFlavorIdx] = useState(0)
  const [result, setResult] = useState<HarvestResultVM | null>(null)
  // Nº de canteiros já revelados na lista de "working" (0..result.results.length).
  const [revealedCount, setRevealedCount] = useState(0)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Instantâneo dos canteiros prontos quando o dialog abriu: a colheita real
  // já limpa os slots assim que o servidor responde, bem antes da animação
  // item a item terminar — sem este snapshot a lista (prop ao vivo) esvazia
  // no meio da animação e o dialog desaparece sozinho.
  const [snapshot] = useState(readyPlots)
  const readyCrops = useMemo(() => {
    const byId = new Map<string, { crop: CropDef; count: number }>()
    for (const p of snapshot) {
      const crop = p.cropId ? (CROPS as Record<string, CropDef>)[p.cropId] : null
      if (!crop) continue
      const entry = byId.get(crop.id) ?? { crop, count: 0 }
      entry.count++
      byId.set(crop.id, entry)
    }
    return Array.from(byId.values())
  }, [snapshot])
  const readyCount = snapshot.length
  // Quanto a stamina do personagem ativo cobre (o servidor aplica o mesmo corte).
  const harvestable = Math.min(readyCount, Math.floor(stamina / FARM_HARVEST_STAMINA))
  const cost = harvestable * FARM_HARVEST_STAMINA

  const start = async () => {
    setPhase('working')
    try {
      const res = await onHarvest()
      setResult(res)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao colher')
      setPhase('error')
    }
  }

  // Flavor text rotativo enquanto aguarda a resposta do servidor (antes do resultado chegar).
  useEffect(() => {
    if (phase !== 'working' || result) return
    const id = setInterval(() => setFlavorIdx((i) => (i + 1) % FLAVOR.length), 700)
    return () => clearInterval(id)
  }, [phase, result])

  // Reveal canteiro a canteiro: ~3s por item (HARVEST_ITEM_ANIM_MS), depois vai pro resumo final.
  useEffect(() => {
    if (!result || phase !== 'working') return
    if (revealedCount >= result.results.length) {
      const t = setTimeout(() => setPhase('done'), 500)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setRevealedCount((c) => c + 1), HARVEST_ITEM_ANIM_MS)
    return () => clearTimeout(t)
  }, [result, revealedCount, phase])

  if (readyCount === 0) return null

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
            <div className="text-4xl mb-2">🧺</div>
            <h2 className="text-white font-black text-lg mb-1">
              {readyCount} canteiro{readyCount > 1 ? 's' : ''} pronto{readyCount > 1 ? 's' : ''}!
            </h2>
            <div className="flex flex-col gap-1.5 mb-3">
              {readyCrops.map(({ crop, count }) => {
                const range = cropYieldRange(crop, farmLevel)
                return (
                  <div key={crop.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs">
                    <span className="text-white/85">{crop.emoji} {crop.outputName}</span>
                    <span className="text-white/50">
                      {count}× canteiro · rende {range.min === range.max ? range.min : `${range.min}–${range.max}`} cada
                    </span>
                  </div>
                )
              })}
            </div>
            <p className="text-white/50 text-xs mb-3">
              Colher tudo custa <span className="font-bold text-white/80">−{FARM_HARVEST_STAMINA}⚡ por canteiro</span>
              {harvestable < readyCount && harvestable > 0 && (
                <> — sua stamina cobre <span className="font-bold text-amber-300">{harvestable} de {readyCount}</span> (o resto fica plantado)</>
              )}
            </p>
            <div className="rounded-xl border border-fuchsia-400/25 bg-fuchsia-500/10 px-3 py-2 mb-4 text-[11px] text-fuchsia-200/90">
              💎 Chance de Estilhaço de Pedra Negra por canteiro: <span className="font-bold">{stoneChance}%</span>
            </div>
            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-white/70 text-sm font-bold py-3 transition-all">
                Deixar plantadas
              </button>
              <button
                onClick={start}
                disabled={busy || harvestable <= 0}
                className="flex-1 rounded-lg text-white text-sm font-black py-3 transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-emerald-600 hover:bg-emerald-500"
              >
                Colher {harvestable > 0 ? harvestable : ''} · −{cost}⚡
              </button>
            </div>
            {harvestable <= 0 && <div className="text-red-400 text-[11px] mt-2">⚡ Stamina insuficiente.</div>}
          </div>
        )}

        {phase === 'working' && !result && (
          <div className="text-center py-2">
            <motion.div animate={{ rotate: [0, -8, 8, 0] }} transition={{ repeat: Infinity, duration: 0.9 }} className="text-4xl mb-3">
              {readyCrops[0]?.crop.emoji ?? '🌾'}
            </motion.div>
            <h2 className="text-white font-black text-base mb-1">Colhendo os canteiros…</h2>
            <AnimatePresence mode="wait">
              <motion.p key={flavorIdx} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="text-white/45 text-xs mb-4 h-4">
                {FLAVOR[flavorIdx]}
              </motion.p>
            </AnimatePresence>
            <div className="text-white/30 text-[10px] mt-2">não feche — a colheita está em andamento</div>
          </div>
        )}

        {phase === 'working' && result && (() => {
          const total = result.results.length
          const currentIdx = Math.min(revealedCount, total - 1)
          const current = result.results[currentIdx]
          const currentCrop = cropByOutputName(current.outputName)
          const stillAnimating = revealedCount < total
          return (
            <div className="text-center py-2">
              {stillAnimating && (
                <>
                  <motion.div key={currentIdx} initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: [1, 1.08, 1], opacity: 1, rotate: [0, -6, 6, 0] }} transition={{ duration: HARVEST_ITEM_ANIM_MS / 1000, repeat: Infinity }} className="text-4xl mb-2">
                    {currentCrop?.emoji ?? '🌾'}
                  </motion.div>
                  <h2 className="text-white font-black text-base mb-1">
                    Colhendo {currentCrop?.outputName ?? current.outputName}… <span className="text-white/40 font-bold">({currentIdx + 1}/{total})</span>
                  </h2>
                  <AnimatePresence mode="wait">
                    <motion.p key={`${currentIdx}-${flavorIdx}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="text-white/45 text-xs mb-3 h-4">
                      {FLAVOR[flavorIdx]}
                    </motion.p>
                  </AnimatePresence>
                  <div className="h-2 rounded-full bg-black/60 border border-white/10 overflow-hidden mb-4">
                    <motion.div
                      key={currentIdx}
                      initial={{ width: '0%' }} animate={{ width: '100%' }}
                      transition={{ duration: HARVEST_ITEM_ANIM_MS / 1000, ease: 'linear' }}
                      className="h-full rounded-full bg-gradient-to-r from-amber-400 to-primary"
                    />
                  </div>
                </>
              )}
              {revealedCount > 0 && (
                <div className="flex flex-col gap-1.5 max-h-44 overflow-y-auto text-left mb-1">
                  {result.results.slice(0, revealedCount).map((item, i) => {
                    const itemCrop = cropByOutputName(item.outputName)
                    return (
                      <motion.div key={i} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} className="flex items-center justify-between rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-xs">
                        <span className="text-white/80">{itemCrop?.emoji ?? '🌾'} {item.outputName}</span>
                        <span className="font-bold text-white flex items-center gap-1.5">
                          ×{item.qty}
                          {item.stoneName && <span className="text-fuchsia-300">💎</span>}
                        </span>
                      </motion.div>
                    )
                  })}
                </div>
              )}
              <div className="text-white/30 text-[10px] mt-2">não feche — a colheita está em andamento</div>
            </div>
          )
        })()}

        {phase === 'done' && result && (() => {
          const aggregated = new Map<string, number>()
          for (const r of result.results) aggregated.set(r.outputName, (aggregated.get(r.outputName) ?? 0) + r.qty)
          const aggregatedItems = Array.from(aggregated.entries()).map(([outputName, qty]) => ({ outputName, qty }))
          const stoneNames = result.results.filter((r) => r.stoneName).map((r) => r.stoneName!)
          return (
          <div className="text-center">
            <motion.div initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: 'spring', damping: 12 }} className="text-4xl mb-2">
              🧺
            </motion.div>
            <h2 className="text-white font-black text-lg mb-4">Colheita concluída!</h2>
            <div className="flex flex-col gap-2 mb-4">
              {aggregatedItems.map((item, i) => {
                const itemCrop = cropByOutputName(item.outputName)
                return (
                  <motion.div key={item.outputName} initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + i * 0.12 }} className="flex items-center justify-between rounded-xl border border-white/10 bg-black/40 px-4 py-3">
                    <span className="text-sm text-white/85">{itemCrop?.emoji ?? '🌾'} {item.outputName}</span>
                    <span className="font-bold text-white">×{item.qty}</span>
                  </motion.div>
                )
              })}
              {stoneNames.map((stoneName, i) => (
                <motion.div
                  key={`${stoneName}-${i}`}
                  initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.45 + i * 0.15, type: 'spring', damping: 10 }}
                  className="relative flex items-center justify-between rounded-xl border border-fuchsia-400/60 px-4 py-3 overflow-hidden"
                  style={{ background: 'linear-gradient(120deg, rgba(217,70,239,0.18), rgba(139,92,246,0.14))' }}
                >
                  <span className="text-sm font-bold text-fuchsia-200">💎 {stoneName}</span>
                  <span className="font-bold text-fuchsia-100">×1</span>
                  <span className="stone-shine absolute inset-0 pointer-events-none"></span>
                </motion.div>
              ))}
              <motion.div initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 }} className="text-[11px] text-white/45">
                {result.harvested} canteiro{result.harvested > 1 ? 's' : ''} · +<span className="text-amber-300 font-bold">{result.xpGained} XP</span> de Fazenda
              </motion.div>
              {(result.skippedNoStamina ?? 0) > 0 && (
                <div className="text-[11px] text-amber-300/80">⚡ {result.skippedNoStamina} canteiro{result.skippedNoStamina! > 1 ? 's ficaram' : ' ficou'} plantado{result.skippedNoStamina! > 1 ? 's' : ''} (stamina acabou).</div>
              )}
              {(result.skippedNoSpace ?? 0) > 0 && (
                <div className="text-[11px] text-amber-300/80">🎒 {result.skippedNoSpace} canteiro{result.skippedNoSpace! > 1 ? 's ficaram' : ' ficou'} plantado{result.skippedNoSpace! > 1 ? 's' : ''} (inventário cheio).</div>
              )}
            </div>
            <button onClick={onClose} className="w-full rounded-lg text-white text-sm font-black py-3 transition-all bg-emerald-600 hover:bg-emerald-500">
              Guardar no inventário
            </button>
          </div>
          )
        })()}

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
// Dialog do poço (confirm → balde subindo → loot)
// ============================================================

function WellBucketRig({ phase }: { phase: 'working' | 'done' }) {
  return (
    <div className="relative mx-auto h-36 w-28 mb-3 select-none" aria-hidden>
      {/* Brocal do poço */}
      <div className="absolute bottom-2 inset-x-2 h-10 rounded-b-2xl border-2 border-sky-700/60 bg-gradient-to-b from-sky-950 to-black overflow-hidden">
        <div className="absolute inset-x-3 top-1 h-5 rounded-full bg-sky-900/80 border border-sky-600/30" />
        {phase === 'done' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.7, 0] }}
            transition={{ duration: 0.8 }}
            className="absolute inset-x-4 top-2 h-3 rounded-full bg-sky-300/40 blur-[2px]"
          />
        )}
      </div>
      {/* Corda + balde */}
      <motion.div
        className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center"
        initial={{ y: 72 }}
        animate={{ y: phase === 'working' ? [72, 8] : 8 }}
        transition={
          phase === 'working'
            ? { duration: WELL_BUCKET_ANIM_MS / 1000, ease: [0.22, 1, 0.36, 1] }
            : { duration: 0.2 }
        }
      >
        <div className="w-0.5 h-14 bg-amber-700/70" />
        <motion.div
          animate={phase === 'working' ? { rotate: [-4, 4, -3, 2, 0] } : { rotate: 0 }}
          transition={{ duration: WELL_BUCKET_ANIM_MS / 1000, ease: 'easeOut' }}
          className="text-3xl leading-none drop-shadow-md"
        >
          🪣
        </motion.div>
      </motion.div>
      {/* Estrutura do poço */}
      <div className="absolute bottom-10 inset-x-0 flex justify-center gap-10 pointer-events-none">
        <div className="w-1.5 h-16 rounded-full bg-stone-600/80" />
        <div className="w-1.5 h-16 rounded-full bg-stone-600/80" />
      </div>
      <div className="absolute bottom-[4.75rem] inset-x-4 h-1.5 rounded-full bg-stone-500/70" />
    </div>
  )
}

function WellCollectDialog({
  pending, stamina, wellShardChancePct, wellStoneChancePct, busy, onCollect, onClose,
}: {
  pending: number
  stamina: number
  wellShardChancePct: number
  wellStoneChancePct: number
  busy?: boolean
  onCollect: () => Promise<WellCollectResultVM>
  onClose: () => void
}) {
  const [phase, setPhase] = useState<'confirm' | 'working' | 'done' | 'error'>('confirm')
  const [flavorIdx, setFlavorIdx] = useState(0)
  const [result, setResult] = useState<WellCollectResultVM | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  // Contador local: espelha o poço e atualiza a cada pull (props podem atrasar 1 frame).
  const [localPending, setLocalPending] = useState(pending)
  const [localStamina, setLocalStamina] = useState(stamina)

  useEffect(() => {
    if (phase === 'confirm' || phase === 'done') {
      setLocalPending(pending)
      setLocalStamina(stamina)
    }
  }, [pending, stamina, phase])

  const canPull = localPending > 0 && localStamina >= WELL_COLLECT_STAMINA

  const start = async () => {
    if (localPending <= 0 || localStamina < WELL_COLLECT_STAMINA) return
    setPhase('working')
    setResult(null)
    setErrorMsg(null)
    const startedAt = Date.now()
    try {
      const res = await onCollect()
      const elapsed = Date.now() - startedAt
      const wait = Math.max(0, WELL_BUCKET_ANIM_MS - elapsed)
      await new Promise((r) => setTimeout(r, wait))
      setLocalPending(res.pendingLeft)
      setLocalStamina((s) => Math.max(0, s - WELL_COLLECT_STAMINA))
      setResult(res)
      setPhase('done')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao coletar')
      setPhase('error')
    }
  }

  useEffect(() => {
    if (phase !== 'working') return
    const id = setInterval(() => setFlavorIdx((i) => (i + 1) % WELL_FLAVOR.length), 700)
    return () => clearInterval(id)
  }, [phase])

  const canPullAgain = (result?.pendingLeft ?? localPending) > 0 && localStamina >= WELL_COLLECT_STAMINA

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
            <div className="text-4xl mb-2">🪣</div>
            <h2 className="text-white font-black text-lg mb-1">Puxar água do poço</h2>
            <p className="text-white/50 text-xs mb-3">
              <span className="text-sky-300 font-bold">{localPending}</span>/{WELL.cap} acumulada{localPending !== 1 ? 's' : ''}
              {' '}· cada pull tira <span className="text-sky-300 font-bold">1× {WELL.outputName}</span>
              {' '}por <span className="font-bold text-white/80">−{WELL_COLLECT_STAMINA}⚡</span>
            </p>
            <div className="rounded-xl border border-fuchsia-400/25 bg-fuchsia-500/10 px-3 py-2 mb-2 text-[11px] text-fuchsia-200/90 text-left">
              🔸 Chance de Estilhaço: <span className="font-bold">{wellShardChancePct}%</span>
            </div>
            <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 mb-4 text-[11px] text-amber-100/90 text-left">
              💎 Chance de Pedra Negra: <span className="font-bold">{wellStoneChancePct}%</span>
            </div>
            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-white/70 text-sm font-bold py-3 transition-all">
                Deixar
              </button>
              <button
                onClick={() => void start()}
                disabled={busy || !canPull}
                className="flex-1 rounded-lg text-white text-sm font-black py-3 transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-sky-600 hover:bg-sky-500"
              >
                Puxar · −{WELL_COLLECT_STAMINA}⚡
              </button>
            </div>
            {!canPull && (
              <div className="text-red-400 text-[11px] mt-2">
                {localPending <= 0 ? 'O poço ainda não acumulou água.' : '⚡ Stamina insuficiente.'}
              </div>
            )}
          </div>
        )}

        {phase === 'working' && (
          <div className="text-center py-1">
            <WellBucketRig phase="working" key={`bucket-${localPending}`} />
            <h2 className="text-white font-black text-base mb-1">Subindo o balde…</h2>
            <AnimatePresence mode="wait">
              <motion.p key={flavorIdx} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="text-white/45 text-xs mb-3 h-4">
                {WELL_FLAVOR[flavorIdx]}
              </motion.p>
            </AnimatePresence>
            <div className="h-2 rounded-full bg-black/60 border border-white/10 overflow-hidden mb-2">
              <motion.div
                key={`bar-${localPending}-${flavorIdx === 0 ? 'a' : 'b'}`}
                initial={{ width: '0%' }} animate={{ width: '100%' }}
                transition={{ duration: WELL_BUCKET_ANIM_MS / 1000, ease: 'linear' }}
                className="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-300"
              />
            </div>
            <div className="text-white/30 text-[10px]">não feche — a coleta está em andamento</div>
          </div>
        )}

        {phase === 'done' && result && (
          <div className="text-center">
            <WellBucketRig phase="done" />
            <h2 className="text-white font-black text-lg mb-4">Água coletada!</h2>
            <div className="flex flex-col gap-2 mb-4">
              <motion.div
                key={`water-${result.pendingLeft}-${result.xpGained}`}
                initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }}
                className="flex items-center justify-between rounded-xl border border-sky-400/40 bg-sky-950/40 px-4 py-3"
              >
                <span className="text-sm text-sky-100">💧 {result.outputName}</span>
                <span className="font-bold text-white">×{result.qty}</span>
              </motion.div>
              {result.bonuses.map((b, i) => {
                const isStone = b.kind === 'stone'
                return (
                  <motion.div
                    key={`${b.name}-${i}-${result.pendingLeft}`}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: [1, 1.04, 1] }}
                    transition={{ delay: 0.12 + i * 0.1, duration: 0.9, repeat: isStone ? 2 : 0 }}
                    className={`relative flex items-center justify-between rounded-xl px-4 py-3 overflow-hidden border ${
                      isStone
                        ? 'border-amber-300/80 shadow-[0_0_18px_rgba(251,191,36,0.45)]'
                        : 'border-fuchsia-400/60'
                    }`}
                    style={{
                      background: isStone
                        ? 'linear-gradient(120deg, rgba(251,191,36,0.22), rgba(217,70,239,0.16))'
                        : 'linear-gradient(120deg, rgba(217,70,239,0.18), rgba(139,92,246,0.14))',
                    }}
                  >
                    <span className={`text-sm font-bold ${isStone ? 'text-amber-100' : 'text-fuchsia-200'}`}>
                      {isStone ? '💎' : '🔸'} {b.name}
                    </span>
                    <span className={`font-bold ${isStone ? 'text-amber-50' : 'text-fuchsia-100'}`}>×1</span>
                    <span className="stone-shine absolute inset-0 pointer-events-none" />
                  </motion.div>
                )
              })}
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[11px] text-white/45">
                +<span className="text-amber-300 font-bold">{result.xpGained} XP</span> de Fazenda
                {' '}· poço <span className="text-sky-300 font-bold">{result.pendingLeft}</span>/{WELL.cap}
              </motion.div>
            </div>
            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-white/70 text-sm font-bold py-3 transition-all">
                Fechar
              </button>
              {canPullAgain ? (
                <button
                  onClick={() => void start()}
                  disabled={busy}
                  className="flex-1 rounded-lg text-white text-sm font-black py-3 transition-all disabled:opacity-40 bg-sky-600 hover:bg-sky-500"
                >
                  Puxar mais · −{WELL_COLLECT_STAMINA}⚡
                </button>
              ) : (
                <button
                  onClick={onClose}
                  className="flex-1 rounded-lg text-white text-sm font-black py-3 transition-all bg-sky-600 hover:bg-sky-500"
                >
                  Guardar
                </button>
              )}
            </div>
            {!canPullAgain && result.pendingLeft <= 0 && (
              <div className="text-white/40 text-[11px] mt-2">Poço vazio — volte depois.</div>
            )}
            {!canPullAgain && result.pendingLeft > 0 && localStamina < WELL_COLLECT_STAMINA && (
              <div className="text-red-400 text-[11px] mt-2">⚡ Stamina insuficiente para outro pull.</div>
            )}
          </div>
        )}

        {phase === 'error' && (
          <div className="text-center">
            <div className="text-4xl mb-2">⚠️</div>
            <h2 className="text-white font-black text-base mb-2">Não deu para coletar</h2>
            <p className="text-white/60 text-xs mb-4">{errorMsg}</p>
            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 rounded-lg text-white text-sm font-black py-3 transition-all bg-white/10 hover:bg-white/20">
                Fechar
              </button>
              {canPull && (
                <button
                  onClick={() => void start()}
                  disabled={busy}
                  className="flex-1 rounded-lg text-white text-sm font-black py-3 transition-all disabled:opacity-40 bg-sky-600 hover:bg-sky-500"
                >
                  Tentar de novo
                </button>
              )}
            </div>
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
  /** Sem slotIndex: colhe TODOS os canteiros prontos. Com 101: colhe o cercado. */
  onHarvest: (slotIndex?: number) => Promise<HarvestResultVM>
  onWellCollect: () => Promise<WellCollectResultVM>
  onPenFeed: () => void
}) {
  const cropList = useMemo(() => Object.values(CROPS) as CropDef[], [])
  const [selectedCrop, setSelectedCrop] = useState<string>(cropList[0]?.id ?? 'trigo')
  const [harvestDialogOpen, setHarvestDialogOpen] = useState(false)
  const [wellDialogOpen, setWellDialogOpen] = useState(false)
  const feedCount = vm.inputCounts[vm.pen.feedName] ?? 0
  const farmLevel = vm.farm.level

  const plotBySlot = useMemo(() => new Map(vm.plots.map((p) => [p.slotIndex, p])), [vm.plots])
  const readyPlots = useMemo(() => vm.plots.filter((p) => p.state === 'ready'), [vm.plots])
  const readyCount = readyPlots.length
  const wellCost = vm.wellCollectStamina ?? WELL_COLLECT_STAMINA

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
          toque num slot vazio para plantar (grátis · +XP pra quem planta)
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
              onOpenHarvest={() => setHarvestDialogOpen(true)}
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
                1 {WELL.outputName} a cada {Math.round(vm.well.intervalSeconds / 60)} min (teto {vm.well.cap}) · −{wellCost}⚡/pull
              </div>
            </div>
            <div className="text-right">
              <div className="text-sky-300 font-black text-xl">{vm.well.pending}<span className="text-white/40 text-sm">/{vm.well.cap}</span></div>
            </div>
          </div>
          <button
            onClick={() => setWellDialogOpen(true)}
            disabled={busy || vm.well.pending <= 0}
            className="mt-3 w-full text-xs font-black text-white bg-sky-600 hover:bg-sky-500 rounded-lg px-3 py-2 disabled:opacity-40 transition-colors"
          >
            🪣 Coletar água
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
              title={feedCount <= 0 ? 'Processe Ração na bancada (2 Trigo + 1 Água Pura)' : undefined}
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

      {/* Dialog de colheita (todos os canteiros prontos de uma vez) */}
      <AnimatePresence>
        {harvestDialogOpen && readyPlots.length > 0 && (
          <HarvestDialog
            readyPlots={readyPlots}
            stamina={vm.stamina}
            stoneChance={vm.stoneChance}
            farmLevel={farmLevel}
            busy={busy}
            onHarvest={() => onHarvest()}
            onClose={() => setHarvestDialogOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {wellDialogOpen && (
          <WellCollectDialog
            pending={vm.well.pending}
            stamina={vm.stamina}
            wellShardChancePct={vm.wellShardChance}
            wellStoneChancePct={vm.wellStoneChance}
            busy={busy}
            onCollect={onWellCollect}
            onClose={() => setWellDialogOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
