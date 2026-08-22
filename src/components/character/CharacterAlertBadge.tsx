'use client'

// 🔔 Selo de avisos do herói. Mesmo papel do ponto dourado do dashboard, só que
// no card do PERSONAGEM: enquanto houver missão resgatável, ponto de atributo
// por gastar ou coleta parada, o card avisa sozinho. O texto do tooltip lista o
// que está pendente para o jogador saber onde ir.
import { useI18n } from '@/lib/i18n/I18nProvider'
import type { CharacterAlerts } from '@/lib/characterNotifications'
import type { TFunction } from '@/lib/i18n/t'

const GOLD = '#c9a25f'
const GOLD_BRIGHT = '#e7c682'

export function alertReasons(alerts: CharacterAlerts, t: TFunction): string[] {
  const reasons: string[] = []
  if (alerts.quests > 0) reasons.push(t('🗺️ {n} quest reward(s) to claim', { n: alerts.quests }))
  if (alerts.points > 0) reasons.push(t('✨ {n} point(s) to spend', { n: alerts.points }))
  if (alerts.gather === 'ready') reasons.push(t('💤 Gathering haul awaiting collection'))
  if (alerts.gather === 'full') reasons.push(t('🎒 Inventory full — gathering paused'))
  return reasons
}

export default function CharacterAlertBadge({
  alerts,
  className = '',
}: {
  alerts?: CharacterAlerts | null
  className?: string
}) {
  const { t } = useI18n()
  if (!alerts || alerts.total <= 0) return null

  const reasons = alertReasons(alerts, t)
  const label = `${t('Pending for this hero:')}\n${reasons.join('\n')}`

  return (
    <span
      className={`pointer-events-auto z-20 inline-flex min-w-[22px] items-center justify-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] font-black tabular-nums text-[#1a1a1d] shadow-[0_2px_6px_rgba(0,0,0,0.8)] animate-pulse ${className}`}
      style={{
        background: `linear-gradient(180deg, ${GOLD_BRIGHT}, ${GOLD})`,
        borderColor: '#5a4520',
      }}
      title={label}
      aria-label={label}
      role="status"
    >
      {alerts.total > 99 ? '99+' : alerts.total}
    </span>
  )
}

/** Versão em fita: os motivos como chips, para o card que tem espaço. */
export function CharacterAlertChips({ alerts }: { alerts?: CharacterAlerts | null }) {
  const { t } = useI18n()
  if (!alerts || alerts.total <= 0) return null

  return (
    <>
      {alerts.quests > 0 && (
        <span
          className="px-2 py-0.5 text-[11px] font-semibold rounded-[3px] border"
          style={{ borderColor: '#8a6d3b', background: 'linear-gradient(180deg, #3a3325, #241f16)', color: GOLD_BRIGHT }}
          title={t('🗺️ {n} quest reward(s) to claim', { n: alerts.quests })}
        >
          🗺️ {alerts.quests}
        </span>
      )}
      {alerts.points > 0 && (
        <span
          className="px-2 py-0.5 text-[11px] font-semibold rounded-[3px] text-fuchsia-200 bg-fuchsia-500/10 border border-fuchsia-400/30"
          title={t('✨ {n} point(s) to spend', { n: alerts.points })}
        >
          ✨ {alerts.points}
        </span>
      )}
    </>
  )
}
