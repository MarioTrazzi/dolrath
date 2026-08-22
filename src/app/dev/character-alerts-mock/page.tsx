'use client'

// Página DEV: valida o SELO DE PENDÊNCIAS no card do personagem sem DB/auth.
// Reproduz o card do dashboard (chumbo+ouro) e o card do seletor da navbar em
// vários estados: nada pendente, missão resgatável, ponto por gastar, coleta
// parada e o combo dos três. O componente é o mesmo da produção.

import CharacterAlertBadge, { CharacterAlertChips } from '@/components/character/CharacterAlertBadge'
import type { CharacterAlerts } from '@/lib/characterNotifications'

const GOLD = '#c9a25f'
const GOLD_BRIGHT = '#e7c682'
const FRAME = '#8a6d3b'
const PANEL_BG = 'linear-gradient(180deg, rgba(32,32,36,0.94), rgba(24,24,27,0.96))'

const alerts = (partial: Partial<CharacterAlerts>): CharacterAlerts => {
  const quests = partial.quests ?? 0
  const points = partial.points ?? 0
  const gather = partial.gather ?? null
  return { quests, points, gather, total: quests + points + (gather ? 1 : 0) }
}

const CASES: { label: string; alerts: CharacterAlerts }[] = [
  { label: 'Sem pendência (selo some)', alerts: alerts({}) },
  { label: '2 missões resgatáveis', alerts: alerts({ quests: 2 }) },
  { label: '3 pontos por distribuir', alerts: alerts({ points: 3 }) },
  { label: 'Espólio de coleta parado', alerts: alerts({ gather: 'ready' }) },
  { label: 'Mochila cheia na coleta', alerts: alerts({ gather: 'full' }) },
  { label: 'Combo: missão + ponto + coleta', alerts: alerts({ quests: 2, points: 1, gather: 'ready' }) },
]

export default function CharacterAlertsMockPage() {
  return (
    <div className="min-h-screen bg-[#141416] p-6 text-[#dcdce0]">
      <h1 className="mb-1 text-xl font-bold" style={{ color: GOLD_BRIGHT }}>
        🔔 Selo de pendências do herói
      </h1>
      <p className="mb-6 text-sm text-[#8a8a90]">
        Passe o mouse no selo para ver o tooltip com o que está pendente. O selo desaparece sozinho quando não há nada.
      </p>

      <h2 className="mb-3 text-sm font-semibold tracking-wide text-[#8a8a90]">Card do dashboard</h2>
      <div className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {CASES.map((c) => (
          <div
            key={c.label}
            className="relative overflow-hidden rounded-[4px] border border-[#46464c]"
            style={{ background: PANEL_BG }}
          >
            <div className="relative flex items-start gap-4 p-4">
              <div className="relative flex-shrink-0">
                <CharacterAlertBadge alerts={c.alerts} className="absolute -right-1.5 -top-1.5" />
                <div
                  className="flex h-14 w-14 items-center justify-center rounded-[3px] border-2 text-2xl"
                  style={{ borderColor: '#46464c', background: '#141210' }}
                >
                  🧙
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold text-white">Herói de Teste</div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <CharacterAlertChips alerts={c.alerts} />
                  <span
                    className="rounded-[3px] border px-2 py-0.5 text-[11px] font-bold"
                    style={{ borderColor: FRAME, background: 'linear-gradient(180deg, #3a3325, #241f16)', color: GOLD_BRIGHT }}
                  >
                    Lv 12
                  </span>
                </div>
                <div className="mt-2 text-[11px] text-white/50">{c.label}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <h2 className="mb-3 text-sm font-semibold tracking-wide text-[#8a8a90]">Card do seletor da navbar</h2>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {CASES.map((c) => (
          <div
            key={c.label}
            className="relative w-56 shrink-0 rounded-2xl border border-white/10 bg-[#1c1c22] p-4"
          >
            <span className="absolute right-3 top-3 z-10 rounded-full bg-indigo-500 px-2 py-0.5 text-[10px] font-bold text-white">
              Ativo
            </span>
            <CharacterAlertBadge alerts={c.alerts} className="absolute left-3 top-3" />
            <div className="mx-auto mb-3 flex aspect-square w-full items-center justify-center rounded-xl bg-indigo-500/15 text-5xl">
              🧙
            </div>
            <div className="truncate text-base font-bold text-white">Herói de Teste</div>
            <div className="mt-1 text-[11px] text-[#8a8a90]">{c.label}</div>
          </div>
        ))}
      </div>

      <p className="mt-8 text-xs text-[#6d6d73]" style={{ borderTop: `1px solid ${GOLD}33`, paddingTop: 12 }}>
        Fonte real: <code>GET /api/character/notifications</code> → contagem por personagem de missão resgatável,
        <code> availablePoints</code> e sessão de coleta parada.
      </p>
    </div>
  )
}
