'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Trophy, Swords, Coins } from 'lucide-react'

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

type RankingPayload = {
  season: {
    id: string
    name: string
    startsAt: string
    endsAt: string
    potDol: number
    status: string
  }
  leaderboard: Row[]
  me: {
    characterId: string
    name: string
    points: number
    wins: number
    losses: number
    rank: number | null
  } | null
  top10Preview: { rank: number; dol: number; pct: number }[]
}

export default function RankingPage() {
  const [data, setData] = useState<RankingPayload | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/ranking')
      .then(async (r) => {
        if (!r.ok) throw new Error('Falha ao carregar ranking')
        return r.json()
      })
      .then(setData)
      .catch((e) => setErr(e.message))
  }, [])

  const endsAt = data?.season?.endsAt ? new Date(data.season.endsAt) : null
  const daysLeft = endsAt
    ? Math.max(0, Math.ceil((endsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
    : null

  return (
    <main className="relative min-h-screen pt-24 pb-16 px-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(180,140,60,0.12),_transparent_55%)]" />
      <div className="relative mx-auto max-w-4xl">
        <header className="mb-8">
          <p className="text-xs uppercase tracking-[0.2em] text-amber-200/70 mb-2">Arena</p>
          <h1 className="font-display text-4xl sm:text-5xl text-[#f0e6c8] flex items-center gap-3">
            <Trophy className="h-9 w-9 text-amber-400" />
            Ranking PvP
          </h1>
          <p className="mt-2 text-sm text-white/60 max-w-xl">
            Pontos por vitória na arena. Top 10 da season divide o pot em DOL — faucet controlado, sem emissão solta.
          </p>
        </header>

        {err && (
          <p className="rounded-xl border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-200">{err}</p>
        )}

        {!data && !err && (
          <p className="text-white/50 text-sm">Carregando season…</p>
        )}

        {data && (
          <>
            <section className="mb-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3">
                <p className="text-[11px] uppercase tracking-wider text-white/40">{data.season.name}</p>
                <p className="text-lg text-[#f0e6c8] mt-1">{data.season.status === 'active' ? 'Ativa' : data.season.status}</p>
                {daysLeft != null && (
                  <p className="text-xs text-white/50 mt-1">{daysLeft}d restantes</p>
                )}
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3">
                <p className="text-[11px] uppercase tracking-wider text-white/40 flex items-center gap-1">
                  <Coins className="h-3 w-3" /> Pot DOL
                </p>
                <p className="text-lg text-amber-300 mt-1">{data.season.potDol.toLocaleString()} DOL</p>
                <p className="text-xs text-white/50 mt-1">Top 10 no fim da season</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3">
                <p className="text-[11px] uppercase tracking-wider text-white/40">Sua posição</p>
                {data.me ? (
                  <>
                    <p className="text-lg text-[#f0e6c8] mt-1">#{data.me.rank} · {data.me.points} pts</p>
                    <p className="text-xs text-white/50 mt-1">{data.me.wins}W / {data.me.losses}L · {data.me.name}</p>
                  </>
                ) : (
                  <p className="text-sm text-white/50 mt-2">Dispute uma luta ranqueada</p>
                )}
              </div>
            </section>

            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-white/70">Leaderboard</h2>
              <Link
                href="/combat-lobby"
                className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-100 hover:bg-amber-500/20"
              >
                <Swords className="h-3.5 w-3.5" /> Ir à Arena
              </Link>
            </div>

            <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/50">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-wider text-white/40">
                    <th className="px-4 py-3 w-14">#</th>
                    <th className="px-2 py-3">Herói</th>
                    <th className="px-2 py-3 text-right">Pts</th>
                    <th className="px-2 py-3 text-right hidden sm:table-cell">W/L</th>
                    <th className="px-4 py-3 text-right hidden md:table-cell">DOL</th>
                  </tr>
                </thead>
                <tbody>
                  {data.leaderboard.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-white/40">
                        Nenhuma luta ranqueada nesta season ainda.
                      </td>
                    </tr>
                  )}
                  {data.leaderboard.map((row) => {
                    const preview = data.top10Preview.find((t) => t.rank === row.rank)
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
                              <p className="text-[11px] text-white/40">Nv.{row.level} · {row.class}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-3 text-right font-semibold text-white">{row.points}</td>
                        <td className="px-2 py-3 text-right text-white/50 hidden sm:table-cell">
                          {row.wins}/{row.losses}
                        </td>
                        <td className="px-4 py-3 text-right text-amber-300/90 hidden md:table-cell">
                          {preview ? `${preview.dol} DOL` : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <p className="mt-4 text-xs text-white/35 leading-relaxed">
              Split do pot: 30% / 18% / 12% / 9% / 7% / 6% / 5% / 5% / 4% / 4%. Payouts são gerados no fim da season
              (admin) e enviados à carteira vinculada da conta.
            </p>
          </>
        )}
      </div>
    </main>
  )
}
