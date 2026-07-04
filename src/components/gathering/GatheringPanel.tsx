'use client'

// ⛏️ Componentes PRESENTACIONAIS da Coleta — sem fetch/DB: recebem estado e
// callbacks por props. A página /gathering injeta os dados reais das rotas
// /api/gather/*; o mock /dev/gathering-mock injeta estado simulado. Mesmo
// espírito da separação usada no /dev/dungeon-mock.

import { useState } from 'react'
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

// Paleta por campo (borda/brilho dos cards, como o accent das masmorras).
export const FIELD_ACCENT: Record<GatherFieldId, string> = {
  minerios: '#94a3b8',
  ervas: '#4ade80',
  bosque: '#a16207',
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
  return (
    <div className="w-full">
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-white font-bold">
          {emoji} {label} <span className="text-amber-300">Nv. {info.level}</span>
        </span>
        <span className="text-white/50">
          {info.isMax ? 'MÁX' : `${info.xpIntoLevel}/${info.xpForNext} XP`}
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
              <h2 className="text-white font-black text-lg">{field.name}</h2>
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
                  {disabled ? '🔒 Indisponível' : '⛏️ Começar a coletar'}
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
  onStop: () => void
}

export function SessionPanel({
  fieldId, status, startedAt, pending, stamina, maxStamina,
  secondsToNextTick, gather, busy, onCollect, onStop,
}: SessionPanelProps) {
  const field = GATHER_FIELDS[fieldId]
  const accent = FIELD_ACCENT[fieldId]
  const exhausted = status === 'exhausted'
  const totalItems = pending.drops.reduce((n, d) => n + d.qty, 0)
  const sinceMs = Date.now() - new Date(startedAt).getTime()

  return (
    <motion.div
      initial={{ y: 16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="relative overflow-hidden rounded-3xl border-2 bg-black/50"
      style={{ borderColor: `${accent}66` }}
    >
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="text-4xl mb-1">{field.emoji}</div>
            <h2 className="text-white font-black text-xl">{field.name}</h2>
            <p className="text-white/50 text-xs">
              {exhausted
                ? '💤 Stamina esgotada — colete o espólio para encerrar.'
                : `Coletando há ${fmtDuration(sinceMs / 1000)} · ${pending.ticks} tique${pending.ticks === 1 ? '' : 's'} rendido${pending.ticks === 1 ? '' : 's'}`}
            </p>
          </div>
          <div className="text-right text-xs text-white/60 shrink-0">
            <div>⚡ {stamina}/{maxStamina}</div>
            <div className="mt-1">
              {exhausted ? (
                <span className="text-amber-300 font-bold">parado</span>
              ) : (
                <>próximo em <span className="text-white font-bold">{fmtDuration(secondsToNextTick)}</span></>
              )}
            </div>
          </div>
        </div>

        {/* Progresso do tique atual */}
        {!exhausted && (
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
            🎒 Espólio acumulado {totalItems > 0 ? `(${totalItems} ite${totalItems === 1 ? 'm' : 'ns'})` : ''}
          </div>
          {pending.drops.length === 0 ? (
            <p className="text-white/40 text-xs">
              Nada ainda — o primeiro tique rende em até 15 minutos. Pode fechar a página: a coleta continua sozinha.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {pending.drops.map((d) => (
                <div
                  key={d.name}
                  title={d.name}
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
            <div className="text-amber-300/90 text-[11px] mt-2 font-bold">+{pending.xp} XP de Coleta ao coletar</div>
          )}
        </div>

        <div className="mb-4">
          <ProfessionBar label="Coleta" emoji="⛏️" info={gather} />
        </div>

        <div className="flex gap-2">
          <button
            onClick={onCollect}
            disabled={busy || (pending.drops.length === 0 && pending.xp === 0)}
            className="flex-1 px-4 py-2.5 rounded-xl font-black text-sm text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            🎒 Coletar espólio
          </button>
          <button
            onClick={onStop}
            disabled={busy}
            className="px-4 py-2.5 rounded-xl font-bold text-sm text-white/80 bg-white/10 hover:bg-white/20 disabled:opacity-40 transition-colors"
          >
            🚪 Encerrar
          </button>
        </div>
        <p className="text-white/30 text-[10px] mt-3">
          Cada tique de 15 min custa {GATHER_TICK_STAMINA} ⚡ e o regen fica pausado enquanto trabalha.
          Coletar não interrompe a sessão; encerrar deposita tudo e libera o herói.
        </p>
      </div>
    </motion.div>
  )
}
