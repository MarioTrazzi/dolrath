'use client'

// 🗺️ Card de missão (tutorial ou diária): ícone, progresso, recompensas e a ação
// do momento — "Resgatar" (completa), "Ir para →" (em andamento) ou "Resgatada ✓".
import Link from 'next/link'
import { motion } from 'framer-motion'
import { GOLD, GOLD_BRIGHT, BORDER_GOLD, BEVEL_COLOR_BTN_CLASS, BEVEL_VARIANTS } from '@/components/crafting/bdoTheme'

export interface QuestView {
  id: string
  kind: string
  title: string
  description: string
  icon: string
  objective: { count: number }
  rewards: { gold?: number; xp?: number; items?: { name: string; qty: number }[] }
  href: string | null
  progress: number
  claimed: boolean
  claimable: boolean
}

export function QuestCard({
  quest,
  onClaim,
  claiming,
  highlight = false,
}: {
  quest: QuestView
  onClaim: (questId: string) => void
  claiming: boolean
  highlight?: boolean
}) {
  const pct = Math.min(100, Math.round((quest.progress / quest.objective.count) * 100))

  return (
    <div
      className={`rounded-[4px] border p-4 transition-colors ${quest.claimed ? 'opacity-55' : ''}`}
      style={{
        borderColor: quest.claimable ? BORDER_GOLD : '#3c3c41',
        background: 'linear-gradient(180deg, rgba(38,38,42,0.9), rgba(26,26,29,0.95))',
        boxShadow: quest.claimable
          ? '0 0 16px rgba(201,162,95,0.25), inset 0 1px 0 rgba(231,198,130,0.15)'
          : highlight
          ? '0 0 12px rgba(201,162,95,0.12)'
          : undefined,
      }}
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none" aria-hidden="true">{quest.icon}</span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-[#dcdce0]">{quest.title}</p>
          <p className="mt-0.5 text-sm text-[#8a8a90]">{quest.description}</p>
        </div>
        <span className="shrink-0 text-sm font-semibold tabular-nums" style={{ color: quest.claimable ? GOLD_BRIGHT : '#8a8a90' }}>
          {quest.progress}/{quest.objective.count}
        </span>
      </div>

      {/* Barra de progresso fina (estilo XPProgressBar, paleta ouro do tema) */}
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/50">
        <motion.div
          className="h-full rounded-full"
          style={{ background: `linear-gradient(90deg, ${GOLD}, ${GOLD_BRIGHT})` }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        {/* Chips de recompensa */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
          {(quest.rewards.gold ?? 0) > 0 && (
            <span className="rounded-[3px] border border-yellow-500/30 bg-yellow-500/10 px-1.5 py-0.5 text-yellow-300">
              🪙 {quest.rewards.gold}
            </span>
          )}
          {(quest.rewards.xp ?? 0) > 0 && (
            <span className="rounded-[3px] border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-sky-300">
              ✨ {quest.rewards.xp} XP
            </span>
          )}
          {(quest.rewards.items ?? []).map((it) => (
            <span key={it.name} className="rounded-[3px] border border-fuchsia-500/30 bg-fuchsia-500/10 px-1.5 py-0.5 text-fuchsia-300">
              {it.qty}× {it.name}
            </span>
          ))}
        </div>

        {quest.claimed ? (
          <span className="shrink-0 text-sm font-semibold text-emerald-400">Resgatada ✓</span>
        ) : quest.claimable ? (
          <button
            onClick={() => onClaim(quest.id)}
            disabled={claiming}
            className={`${BEVEL_COLOR_BTN_CLASS} shrink-0 px-4 py-1.5 text-sm ${claiming ? 'cursor-wait opacity-60' : ''}`}
            style={BEVEL_VARIANTS.gold}
          >
            {claiming ? 'Resgatando…' : 'Resgatar'}
          </button>
        ) : quest.href ? (
          <Link
            href={quest.href}
            className="shrink-0 text-sm font-semibold transition-colors hover:brightness-125"
            style={{ color: GOLD }}
          >
            Ir para →
          </Link>
        ) : null}
      </div>
    </div>
  )
}
