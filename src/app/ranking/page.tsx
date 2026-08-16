'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Trophy, Swords } from 'lucide-react'
import { useI18n } from '@/lib/i18n/I18nProvider'

type Row = {
  rank: number
  characterId: string
  name: string
  level: number
  class: string
  race: string
  avatar: string | null
  points: number
  wins: number
  losses: number
}

// 🏆 Placar GLOBAL e permanente: sem temporada, sem pot, sem inscrição. A
// premiação foi retirada inteira — o sistema de recompensa será redesenhado.
type RankingPayload = {
  leaderboard: Row[]
  me: {
    characterId: string
    name: string
    points: number
    wins: number
    losses: number
    rank: number | null
  } | null
}

export default function RankingPage() {
  const { t } = useI18n()
  const [data, setData] = useState<RankingPayload | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const loadRanking = useCallback(() => {
    fetch('/api/ranking')
      .then(async (r) => {
        if (!r.ok) throw new Error(t('Failed to load ranking'))
        return r.json()
      })
      .then((payload: RankingPayload) => setData(payload))
      .catch((e) => setErr(e.message))
  }, [t])

  useEffect(() => {
    loadRanking()
  }, [loadRanking])

  return (
    <main className="relative min-h-screen pt-24 pb-16 px-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(180,140,60,0.12),_transparent_55%)]" />
      <div className="relative mx-auto max-w-4xl">
        <header className="mb-8">
          <p className="text-xs uppercase tracking-[0.2em] text-amber-200/70 mb-2">{t('Arena')}</p>
          <h1 className="font-display text-4xl sm:text-5xl text-[#f0e6c8] flex items-center gap-3">
            <Trophy className="h-9 w-9 text-amber-400" />
            {t('Global Ranking')}
          </h1>
          <p className="mt-2 text-sm text-white/60 max-w-xl">
            {t('The arena scoreboard is permanent: no seasons, no resets. Every ranked win counts forever.')}
          </p>
        </header>

        {err && (
          <p className="rounded-xl border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-200">{err}</p>
        )}

        {!data && !err && <p className="text-white/50 text-sm">{t('Loading ranking…')}</p>}

        {data && (
          <>
            <section className="mb-6 rounded-2xl border border-white/10 bg-black/40 px-4 py-3">
              <p className="text-[11px] uppercase tracking-wider text-white/40">{t('Your position')}</p>
              {data.me ? (
                <>
                  <p className="text-lg text-[#f0e6c8] mt-1">
                    #{data.me.rank} · {t('{n} pts', { n: data.me.points })}
                  </p>
                  <p className="text-xs text-white/50 mt-1">
                    {data.me.wins}W / {data.me.losses}L · {data.me.name}
                  </p>
                </>
              ) : (
                <p className="text-sm text-white/50 mt-2">{t('Play a ranked match')}</p>
              )}
            </section>

            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-white/70">{t('Leaderboard')}</h2>
              <Link
                href="/combat-lobby"
                className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-100 hover:bg-amber-500/20"
              >
                <Swords className="h-3.5 w-3.5" /> {t('Go to Arena')}
              </Link>
            </div>

            <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/50">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-wider text-white/40">
                    <th className="px-4 py-3 w-14">#</th>
                    <th className="px-2 py-3">{t('Hero')}</th>
                    <th className="px-2 py-3 text-right">{t('Pts')}</th>
                    <th className="px-4 py-3 text-right hidden sm:table-cell">W/L</th>
                  </tr>
                </thead>
                <tbody>
                  {data.leaderboard.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-white/40">
                        {t('No ranked matches yet.')}
                      </td>
                    </tr>
                  )}
                  {data.leaderboard.map((row) => {
                    const isMe = data.me?.characterId === row.characterId
                    return (
                      <tr
                        key={row.characterId}
                        className={`border-b border-white/5 ${isMe ? 'bg-amber-500/10' : ''}`}
                      >
                        <td className="px-4 py-3 font-mono text-amber-200/80">{row.rank}</td>
                        <td className="px-2 py-3">
                          <div className="flex items-center gap-2">
                            {row.avatar ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={row.avatar} alt="" className="h-8 w-8 rounded-full object-cover ring-1 ring-white/20" />
                            ) : (
                              <span className="h-8 w-8 rounded-full bg-white/10" />
                            )}
                            <div>
                              <p className="text-[#f0e6c8] font-medium">{row.name}</p>
                              <p className="text-[11px] text-white/40">{t('Lv.')}{row.level} · {row.class}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-3 text-right font-semibold text-white">{row.points}</td>
                        <td className="px-4 py-3 text-right text-white/50 hidden sm:table-cell">
                          {row.wins}/{row.losses}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <p className="mt-4 text-xs text-white/35 leading-relaxed">
              {t('Ranked matches pay gold and XP; ranking points are pride only — there is no prize attached to the leaderboard.')}
            </p>
          </>
        )}
      </div>
    </main>
  )
}
