'use client'

// ⛏️ Componentes PRESENTACIONAIS da Coleta — sem fetch/DB: recebem estado e
// callbacks por props. A página /gathering injeta os dados reais das rotas
// /api/gather/*; o mock /dev/gathering-mock injeta estado simulado. Mesmo
// espírito da separação usada no /dev/dungeon-mock.

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import {
  GATHER_FIELDS,
  GATHER_TICK_SECONDS,
  GATHER_TICK_STAMINA,
  type GatherFieldDef,
  type GatherFieldId,
  type PendingYield,
} from '@/lib/gathering'
import {
  getIngredientByName,
  getForgeMaterialByName,
  getSeedByName,
  itemImagePath,
} from '@/lib/itemCatalog'
import type { ProfessionLevelInfo } from '@/lib/professionSystem'
import { useT, useI18n } from '@/lib/i18n/I18nProvider'
import { localizeItemName } from '@/lib/i18n/catalog'

// Paleta por campo (borda/brilho dos cards, como o accent das masmorras).
export const FIELD_ACCENT: Record<GatherFieldId, string> = {
  minerios: '#94a3b8',
  ervas: '#4ade80',
  bosque: '#a16207',
  costa: '#38bdf8',
  caca: '#d4a373',
}

function dropEmoji(name: string): string {
  return (
    getIngredientByName(name)?.emoji ??
    getForgeMaterialByName(name)?.emoji ??
    getSeedByName(name)?.emoji ??
    '📦'
  )
}

/** Miniatura de item: arte gerada → emoji se 404 (padrão do ItemThumb da run). */
export function GatherItemThumb({ name, className = 'text-base' }: { name: string; className?: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <span className={className}>{dropEmoji(name)}</span>
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={itemImagePath(name)}
      alt={name}
      onError={() => setFailed(true)}
      className="w-full h-full object-cover"
      referrerPolicy="no-referrer"
    />
  )
}

/** Barra de XP de profissão (Coleta/Fazenda). */
export function ProfessionBar({ label, emoji, info }: { label: string; emoji: string; info: ProfessionLevelInfo }) {
  const t = useT()
  return (
    <div className="w-full">
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-white font-bold">
          {emoji} {label} <span className="text-amber-300">{t('Lv.')} {info.level}</span>
        </span>
        <span className="text-white/50">
          {info.isMax ? t('MAX') : `${info.xpIntoLevel}/${info.xpForNext} XP`}
        </span>
      </div>
      <div className="h-2 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-amber-500 to-yellow-300 transition-all"
          style={{ width: `${Math.round(info.progress * 100)}%` }}
        />
      </div>
    </div>
  )
}

function fmtDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}`
  if (m > 0) return `${m}m${String(sec).padStart(2, '0')}`
  return `${sec}s`
}

// ============================================================
// Grid de seleção de campo
// ============================================================

export function FieldGrid({
  gatherLevel,
  disabled,
  disabledReason,
  onEnter,
}: {
  gatherLevel: number
  disabled?: boolean
  disabledReason?: string
  onEnter: (field: GatherFieldDef) => void
}) {
  const t = useT()
  const { locale } = useI18n()
  const fields = Object.values(GATHER_FIELDS)
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {fields.map((field, idx) => {
        const accent = FIELD_ACCENT[field.id]
        return (
          <motion.div
            key={field.id}
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: idx * 0.08, type: 'spring', stiffness: 180, damping: 20 }}
            whileHover={{ scale: disabled ? 1 : 1.02 }}
            className="relative overflow-hidden rounded-3xl border-2 bg-black/40 flex flex-col"
            style={{ borderColor: `${accent}55` }}
          >
            <div className="p-5 flex flex-col flex-1">
              <div className="text-4xl mb-2">{field.emoji}</div>
              <h2 className="text-white font-black text-lg">{localizeItemName(field.name, locale)}</h2>
              <p className="text-white/60 text-xs italic mb-3">{field.tagline}</p>

              <div className="flex flex-wrap gap-1.5 mb-4">
                {field.drops.map((d) => {
                  const locked = (d.minLevel ?? 1) > gatherLevel
                  return (
                    <span
                      key={d.name}
                      title={locked ? `${d.name} — destrava no Nv. ${d.minLevel} de Coleta` : d.name}
                      className={`w-9 h-9 rounded-lg border flex items-center justify-center text-base overflow-hidden ${
                        locked ? 'border-white/10 bg-black/60 grayscale opacity-40' : 'border-white/15 bg-black/50'
                      }`}
                    >
                      {locked ? <span className="text-xs">🔒</span> : <GatherItemThumb name={d.name} />}
                    </span>
                  )
                })}
                {field.seedField && (
                  <span
                    title="Sementes de cultivo (exclusivas deste campo)"
                    className="w-9 h-9 rounded-lg border border-emerald-500/40 bg-emerald-950/50 flex items-center justify-center text-base"
                  >
                    🫘
                  </span>
                )}
              </div>

              <div className="mt-auto">
                <button
                  onClick={() => !disabled && onEnter(field)}
                  disabled={disabled}
                  title={disabled ? disabledReason : undefined}
                  className={`w-full px-5 py-2.5 rounded-xl font-black text-sm text-white shadow-lg transition-all ${
                    disabled ? 'opacity-50 cursor-not-allowed' : 'hover:scale-[1.03]'
                  }`}
                  style={{ background: `linear-gradient(90deg, ${accent}cc, ${accent}77)` }}
                >
                  {disabled ? t('🔒 Unavailable') : t('⛏️ Start gathering')}
                </button>
              </div>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}

// ============================================================
// Diálogo de confirmação do "Encerrar"
// ============================================================

function StopConfirmDialog({
  open, accent, secondsToNextTick, onStopNow, onStopAfterCycle, onClose,
}: {
  open: boolean
  accent: string
  secondsToNextTick: number
  onStopNow: () => void
  onStopAfterCycle: () => void
  onClose: () => void
}) {
  const t = useT()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !mounted) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border-2 overflow-hidden shadow-2xl"
        style={{ background: 'linear-gradient(180deg, #1c232b, #11161b)', borderColor: `${accent}66` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4" style={{ borderBottom: '1px solid #2a323b' }}>
          <h3 className="font-black text-white text-base">{t('🚪 Stop gathering?')}</h3>
          <p className="text-xs text-white/60 mt-1">
            {t('Stop now (losing the progress of the cycle in progress) or wait for the current cycle to finish — the last haul drops on its own and the hero is freed without spending stamina on a new cycle.')}
          </p>
        </div>
        <div className="p-4 flex flex-col gap-2">
          <button
            onClick={() => { onStopAfterCycle(); onClose() }}
            className="w-full px-4 py-2.5 rounded-xl font-black text-sm text-white transition-all hover:scale-[1.02]"
            style={{ background: `linear-gradient(90deg, ${accent}cc, ${accent}77)` }}
          >
            {t('⏳ Wait for the last cycle ({time})', { time: fmtDuration(secondsToNextTick) })}
          </button>
          <button
            onClick={() => { onStopNow(); onClose() }}
            className="w-full px-4 py-2.5 rounded-xl font-bold text-sm text-white/90 transition-all hover:scale-[1.02]"
            style={{ background: '#2f3842', border: '1px solid #46505c' }}
          >
            {t('🚪 Stop now')}
          </button>
          <button
            onClick={onClose}
            className="w-full px-4 py-2 rounded-xl font-semibold text-sm text-white/60 hover:text-white/90 transition-colors"
          >
            {t('Cancel')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ============================================================
// Painel da sessão ativa/esgotada
// ============================================================

export interface SessionPanelProps {
  fieldId: GatherFieldId
  status: 'active' | 'exhausted'
  startedAt: Date | string
  pending: PendingYield
  stamina: number
  maxStamina: number
  secondsToNextTick: number
  gather: ProfessionLevelInfo
  busy?: boolean
  onCollect: () => void
  /** Encerra imediatamente, perdendo o progresso do ciclo em curso. */
  onStopNow: () => void
  /** Agenda o encerramento: fecha sozinho ao final do ciclo em curso. */
  onStopAfterCycle: () => void
  /** Desiste de um encerramento agendado — a coleta segue normal. */
  onCancelStop: () => void
  /** Encerramento agendado em curso (aguardando o ciclo atual terminar). */
  stopRequested?: boolean
  /** Inventário sem slot livre: coleta pausada (mesma mecânica da masmorra). */
  inventoryFull?: boolean
}

export function SessionPanel({
  fieldId, status, startedAt, pending, stamina, maxStamina,
  secondsToNextTick, gather, busy, onCollect, onStopNow, onStopAfterCycle, onCancelStop,
  stopRequested, inventoryFull,
}: SessionPanelProps) {
  const t = useT()
  const { locale } = useI18n()
  const field = GATHER_FIELDS[fieldId]
  const accent = FIELD_ACCENT[fieldId]
  const exhausted = status === 'exhausted'
  const paused = !!inventoryFull && !exhausted
  const totalItems = pending.drops.reduce((n, d) => n + d.qty, 0)
  const sinceMs = Date.now() - new Date(startedAt).getTime()
  const [showStopDialog, setShowStopDialog] = useState(false)

  return (
    <motion.div
      initial={{ y: 16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="relative overflow-hidden rounded-3xl border-2 bg-black/50"
      style={{ borderColor: `${accent}66` }}
    >
      <div className="p-5 sm:p-6">
        {paused && (
          <div className="mb-4 rounded-xl border border-amber-500/50 bg-amber-950/40 px-3 py-2.5 text-amber-200 text-xs font-bold text-center">
            {t('🎒 Inventory full — gathering paused, no stamina spent. Free up inventory space to continue.')}
          </div>
        )}
        {!exhausted && stopRequested && (
          <div className="mb-4 rounded-xl border border-sky-500/50 bg-sky-950/40 px-3 py-2.5 text-sky-200 text-xs font-bold text-center">
            {t('⏳ Stopping on its own at the end of this cycle ({time}) — no stamina spent on a new cycle.', { time: fmtDuration(secondsToNextTick) })}
          </div>
        )}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="text-4xl mb-1">{field.emoji}</div>
            <h2 className="text-white font-black text-xl">{localizeItemName(field.name, locale)}</h2>
            <p className="text-white/50 text-xs">
              {exhausted
                ? t('💤 Stamina exhausted — collect the haul to finish.')
                : paused
                  ? t('Waiting for inventory space...')
                  : t(
                      pending.ticks === 1
                        ? 'Gathering for {time} · 1 tick yielded'
                        : 'Gathering for {time} · {n} ticks yielded',
                      { time: fmtDuration(sinceMs / 1000), n: pending.ticks },
                    )}
            </p>
          </div>
          <div className="text-right text-xs text-white/60 shrink-0">
            <div>⚡ {stamina}/{maxStamina}</div>
            <div className="mt-1">
              {exhausted ? (
                <span className="text-amber-300 font-bold">{t('stopped')}</span>
              ) : paused ? (
                <span className="text-amber-300 font-bold">{t('🎒 paused')}</span>
              ) : (
                <>{t('next in')} <span className="text-white font-bold">{fmtDuration(secondsToNextTick)}</span></>
              )}
            </div>
          </div>
        </div>

        {/* Progresso do tique atual */}
        {!exhausted && !paused && (
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mb-4">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.round((1 - secondsToNextTick / GATHER_TICK_SECONDS) * 100)}%`,
                background: `linear-gradient(90deg, ${accent}, ${accent}88)`,
              }}
            />
          </div>
        )}

        {/* Espólio acumulado */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 mb-4">
          <div className="text-white/70 text-xs font-bold mb-2">
            {totalItems > 0
              ? t(
                  totalItems === 1 ? '🎒 Accumulated haul (1 item)' : '🎒 Accumulated haul ({n} items)',
                  { n: totalItems },
                )
              : t('🎒 Accumulated haul')}
          </div>
          {pending.drops.length === 0 ? (
            <p className="text-white/40 text-xs">
              {t('Nothing yet — the first tick yields within 15 minutes. You can close the page: gathering continues on its own.')}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {pending.drops.map((d) => (
                <div
                  key={d.name}
                  title={localizeItemName(d.name, locale)}
                  className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-black/50 pr-2 overflow-hidden"
                >
                  <span className="w-8 h-8 flex items-center justify-center overflow-hidden">
                    <GatherItemThumb name={d.name} />
                  </span>
                  <span className="text-white text-xs font-bold">×{d.qty}</span>
                </div>
              ))}
            </div>
          )}
          {pending.xp > 0 && (
            <div className="text-amber-300/90 text-[11px] mt-2 font-bold">
              {t('+{n} Gathering XP on collect', { n: pending.xp })}
            </div>
          )}
        </div>

        <div className="mb-4">
          <ProfessionBar label={t('Gathering')} emoji="⛏️" info={gather} />
        </div>

        <div className="flex gap-2">
          <button
            onClick={onCollect}
            disabled={busy || (pending.drops.length === 0 && pending.xp === 0)}
            className="flex-1 px-4 py-2.5 rounded-xl font-black text-sm text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {t('🎒 Collect haul')}
          </button>
          {!exhausted && stopRequested ? (
            <button
              onClick={onCancelStop}
              disabled={busy}
              className="px-4 py-2.5 rounded-xl font-bold text-sm text-sky-200 bg-sky-500/15 hover:bg-sky-500/25 disabled:opacity-40 transition-colors"
            >
              {t('↩️ Cancel stop')}
            </button>
          ) : (
            <button
              onClick={() => (exhausted ? onStopNow() : setShowStopDialog(true))}
              disabled={busy}
              className="px-4 py-2.5 rounded-xl font-bold text-sm text-white/80 bg-white/10 hover:bg-white/20 disabled:opacity-40 transition-colors"
            >
              {t('🚪 Stop')}
            </button>
          )}
        </div>
        <p className="text-white/30 text-[10px] mt-3">
          {t('Each 15-min tick costs {cost} ⚡ and regen pauses while working. Collecting does not interrupt the session; stopping deposits everything and frees the hero.', { cost: GATHER_TICK_STAMINA })}
        </p>
      </div>

      <StopConfirmDialog
        open={showStopDialog}
        accent={accent}
        secondsToNextTick={secondsToNextTick}
        onStopNow={onStopNow}
        onStopAfterCycle={onStopAfterCycle}
        onClose={() => setShowStopDialog(false)}
      />
    </motion.div>
  )
}
