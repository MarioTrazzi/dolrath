'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Trophy, Swords, Coins, Ticket, ShieldCheck, ChevronDown } from 'lucide-react'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { payDolToTreasury } from '@/lib/payDol'

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

type SeasonRef = {
  id: string
  name: string
  status: string
  startsAt: string
  endsAt: string
}

type RankingPayload = {
  season: {
    id: string
    name: string
    startsAt: string
    endsAt: string
    status: string
    scoring: boolean
    potDol: number
    seededDol: number
    fundedDol: number
    entries: number
    competingAccounts: number
  }
  entryCostDol: number
  minMatchesForPayout: number
  leaderboard: Row[]
  me: {
    characterId: string
    name: string
    points: number
    wins: number
    losses: number
    rank: number | null
    enrolled: boolean
    matchesToEligible: number
  } | null
  myEnrolledCharacterIds: string[]
  payoutPreview: { rank: number; dol: number; pct: number }[]
  seasons: SeasonRef[]
}

type EnrollPayload = {
  season: { id: string; name: string; status: string; endsAt: string }
  costDol: number
  /** Inscrição avulsa é paga em DOL — só abre quando o DOL circula (Fase 2). */
  enrollmentOpen: boolean
  characters: {
    id: string
    name: string
    level: number
    class: string
    race: string
    avatar: string | null
    enrolled: boolean
  }[]
}

export default function RankingPage() {
  const { t } = useI18n()
  const [data, setData] = useState<RankingPayload | null>(null)
  const [enroll, setEnroll] = useState<EnrollPayload | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [seasonId, setSeasonId] = useState<string | null>(null)
  const [showFullSplit, setShowFullSplit] = useState(false)
  const [enrolling, setEnrolling] = useState(false)
  const [enrollMsg, setEnrollMsg] = useState<string | null>(null)
  const [pickedCharacter, setPickedCharacter] = useState<string>('')

  const loadRanking = useCallback(
    (id?: string | null) => {
      fetch(id ? `/api/ranking?season=${id}` : '/api/ranking')
        .then(async (r) => {
          if (!r.ok) throw new Error(t('Failed to load ranking'))
          return r.json()
        })
        .then((payload: RankingPayload) => {
          setData(payload)
          setSeasonId(payload.season.id)
        })
        .catch((e) => setErr(e.message))
    },
    [t]
  )

  useEffect(() => {
    loadRanking()
    // A inscrição é do jogador logado — 401 aqui é normal para visitante.
    fetch('/api/ranking/enroll')
      .then((r) => (r.ok ? r.json() : null))
      .then((payload: EnrollPayload | null) => {
        if (!payload) return
        setEnroll(payload)
        const first = payload.characters.find((c) => !c.enrolled)
        if (first) setPickedCharacter(first.id)
      })
      .catch(() => {})
  }, [loadRanking])

  const handleEnroll = useCallback(async () => {
    if (!pickedCharacter || !enroll) return
    setEnrolling(true)
    setEnrollMsg(null)
    try {
      const txHash = await payDolToTreasury(String(enroll.costDol))
      const res = await fetch('/api/ranking/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId: pickedCharacter, txHash }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || t('Failed to enroll'))
      setEnrollMsg(t('Hero enrolled! Your ranked matches now score.'))
      loadRanking(seasonId)
      const refreshed = await fetch('/api/ranking/enroll')
      if (refreshed.ok) setEnroll(await refreshed.json())
    } catch (e) {
      setEnrollMsg(e instanceof Error ? e.message : t('Failed to enroll'))
    } finally {
      setEnrolling(false)
    }
  }, [pickedCharacter, enroll, loadRanking, seasonId, t])

  const endsAt = data?.season?.endsAt ? new Date(data.season.endsAt) : null
  const daysLeft = endsAt
    ? Math.max(0, Math.ceil((endsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
    : null
  const isOffseason = data?.season.status === 'offseason'
  const pendingCharacters = enroll?.characters.filter((c) => !c.enrolled) ?? []
  const topSplit = data?.payoutPreview.slice(0, 10) ?? []
  const tailSplit = data?.payoutPreview.slice(10) ?? []

  return (
    <main className="relative min-h-screen pt-24 pb-16 px-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(180,140,60,0.12),_transparent_55%)]" />
      <div className="relative mx-auto max-w-4xl">
        <header className="mb-8">
          <p className="text-xs uppercase tracking-[0.2em] text-amber-200/70 mb-2">{t('Arena')}</p>
          <h1 className="font-display text-4xl sm:text-5xl text-[#f0e6c8] flex items-center gap-3">
            <Trophy className="h-9 w-9 text-amber-400" />
            {t('PvP Ranking')}
          </h1>
          <p className="mt-2 text-sm text-white/60 max-w-xl">
            {t('Every enrolled hero puts {n} DOL into the pot. At season end the Top 20 splits it — the prize is the entries themselves, not loose emission.', {
              n: data?.entryCostDol ?? '',
            })}
          </p>
        </header>

        {err && (
          <p className="rounded-xl border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-200">{err}</p>
        )}

        {!data && !err && <p className="text-white/50 text-sm">{t('Loading season…')}</p>}

        {data && (
          <>
            {/* Inscrição — o gesto principal da página. */}
            {enroll && (
              <section className="mb-6 rounded-2xl border border-amber-500/30 bg-gradient-to-b from-amber-500/10 to-black/40 px-4 py-4">
                <p className="text-[11px] uppercase tracking-wider text-amber-200/70 flex items-center gap-1.5">
                  <Ticket className="h-3.5 w-3.5" /> {t('Season entry')}
                </p>

                {!enroll.enrollmentOpen ? (
                  <p className="mt-2 text-sm text-[#f0e6c8]">
                    {t('This season, creating a hero already enrolls it. Paid entries open next season, priced in DOL.')}
                  </p>
                ) : pendingCharacters.length === 0 ? (
                  <p className="mt-2 text-sm text-[#f0e6c8]">
                    {t('All your heroes are enrolled in {season}.', { season: enroll.season.name })}
                  </p>
                ) : (
                  <>
                    <p className="mt-1 text-sm text-white/70">
                      {t('Enroll a hero in {season} for {n} DOL. It goes 100% into the pot.', {
                        season: enroll.season.name,
                        n: enroll.costDol,
                      })}
                    </p>
                    <div className="mt-3 flex flex-col sm:flex-row gap-2">
                      <select
                        value={pickedCharacter}
                        onChange={(e) => setPickedCharacter(e.target.value)}
                        className="flex-1 rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-sm text-[#f0e6c8]"
                      >
                        {pendingCharacters.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} · {t('Lv.')}{c.level} {c.class}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={handleEnroll}
                        disabled={enrolling || !pickedCharacter}
                        className="rounded-xl border border-amber-500/50 bg-amber-500/20 px-4 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-500/30 disabled:opacity-50"
                      >
                        {enrolling ? t('Processing payment...') : t('Enroll for {n} DOL', { n: enroll.costDol })}
                      </button>
                    </div>
                  </>
                )}

                {enrollMsg && <p className="mt-2 text-xs text-amber-200/90">{enrollMsg}</p>}

                <p className="mt-3 text-[11px] text-white/40 leading-relaxed">
                  {t('Entry is per hero, prize is per account: only your best hero can win. Heroes without entry still fight for gold and XP — they just do not score.')}
                </p>
              </section>
            )}

            <section className="mb-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3">
                <p className="text-[11px] uppercase tracking-wider text-white/40">{data.season.name}</p>
                <p className="text-lg text-[#f0e6c8] mt-1">
                  {isOffseason ? t('Off-season') : data.season.scoring ? t('Active') : data.season.status}
                </p>
                {daysLeft != null && (
                  <p className="text-xs text-white/50 mt-1">{t('{n}d left', { n: daysLeft })}</p>
                )}
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3">
                <p className="text-[11px] uppercase tracking-wider text-white/40 flex items-center gap-1">
                  <Coins className="h-3 w-3" /> {t('DOL Pot')}
                </p>
                <p className="text-lg text-amber-300 mt-1">{data.season.potDol.toLocaleString()} DOL</p>
                <p className="text-xs text-white/50 mt-1">
                  {t('{n} heroes enrolled', { n: data.season.entries })}
                  {data.season.seededDol > 0 && ` · +${data.season.seededDol} ${t('seeded')}`}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3">
                <p className="text-[11px] uppercase tracking-wider text-white/40">{t('Your position')}</p>
                {data.me ? (
                  <>
                    <p className="text-lg text-[#f0e6c8] mt-1">
                      #{data.me.rank} · {t('{n} pts', { n: data.me.points })}
                    </p>
                    <p className="text-xs text-white/50 mt-1">
                      {data.me.wins}W / {data.me.losses}L · {data.me.name}
                    </p>
                    <p className="mt-1 text-[11px]">
                      {!data.me.enrolled ? (
                        <span className="text-red-300/80">{t('Not enrolled — not eligible for DOL')}</span>
                      ) : data.me.matchesToEligible > 0 ? (
                        <span className="text-amber-200/80">
                          {t('{n} more matches to be eligible', { n: data.me.matchesToEligible })}
                        </span>
                      ) : (
                        <span className="text-emerald-300/80 inline-flex items-center gap-1">
                          <ShieldCheck className="h-3 w-3" /> {t('Eligible for the prize')}
                        </span>
                      )}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-white/50 mt-2">{t('Play a ranked match')}</p>
                )}
              </div>
            </section>

            {isOffseason && (
              <p className="mb-6 rounded-2xl border border-amber-500/20 bg-black/40 px-4 py-3 text-xs text-amber-100/80 leading-relaxed">
                {t('Season closed — payouts are being processed. The world stays open: dungeons, gathering, crafting and the arena all keep running (gold and XP included). Only the scoreboard is paused until the next season starts.')}
              </p>
            )}

            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-white/70">{t('Leaderboard')}</h2>
              <div className="flex items-center gap-2">
                {data.seasons.length > 1 && (
                  <select
                    value={seasonId ?? ''}
                    onChange={(e) => loadRanking(e.target.value)}
                    className="rounded-full border border-white/15 bg-black/60 px-3 py-1.5 text-xs text-white/70"
                  >
                    {data.seasons.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                )}
                <Link
                  href="/combat-lobby"
                  className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-100 hover:bg-amber-500/20"
                >
                  <Swords className="h-3.5 w-3.5" /> {t('Go to Arena')}
                </Link>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/50">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-wider text-white/40">
                    <th className="px-4 py-3 w-14">#</th>
                    <th className="px-2 py-3">{t('Hero')}</th>
                    <th className="px-2 py-3 text-right">{t('Pts')}</th>
                    <th className="px-2 py-3 text-right hidden sm:table-cell">W/L</th>
                    <th className="px-4 py-3 text-right hidden md:table-cell">DOL</th>
                  </tr>
                </thead>
                <tbody>
                  {data.leaderboard.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-white/40">
                        {t('No ranked matches this season yet.')}
                      </td>
                    </tr>
                  )}
                  {data.leaderboard.map((row) => {
                    const preview = data.payoutPreview.find((p) => p.rank === row.rank)
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

            {/* Prévia do prêmio: 1-10 sempre à vista, 11-20 em acordeão. */}
            <section className="mt-6 rounded-2xl border border-white/10 bg-black/40 px-4 py-4">
              <p className="text-[11px] uppercase tracking-wider text-white/40 mb-3">
                {t('Prize split · Top 20')}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {topSplit.map((p) => (
                  <div key={p.rank} className="rounded-xl border border-white/10 bg-black/40 px-2 py-2 text-center">
                    <p className="text-[10px] text-white/40">#{p.rank}</p>
                    <p className="text-sm text-amber-300">{p.dol} DOL</p>
                  </div>
                ))}
              </div>

              {tailSplit.length > 0 && (
                <>
                  <button
                    onClick={() => setShowFullSplit((v) => !v)}
                    className="mt-3 inline-flex items-center gap-1 text-xs text-white/50 hover:text-white/80"
                  >
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showFullSplit ? 'rotate-180' : ''}`} />
                    {showFullSplit ? t('Hide 11-20') : t('Show 11-20')}
                  </button>
                  {showFullSplit && (
                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {tailSplit.map((p) => (
                        <div key={p.rank} className="rounded-xl border border-white/10 bg-black/40 px-2 py-2 text-center">
                          <p className="text-[10px] text-white/40">#{p.rank}</p>
                          <p className="text-sm text-amber-300/80">{p.dol} DOL</p>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </section>

            <p className="mt-4 text-xs text-white/35 leading-relaxed">
              {t('Only enrolled heroes with at least {n} ranked matches are eligible, one prize per account (your best hero). Unfilled places roll into the tournament vault. Payouts are snapshotted at season end and sent to the account\'s linked wallet.', {
                n: data.minMatchesForPayout,
              })}
            </p>
            <p className="mt-2 text-xs text-white/35 leading-relaxed">
              {t('A new season never wipes anything: level, gear, enhancement, gold, professions and inventory all carry over. Only the scoreboard resets.')}
            </p>
          </>
        )}
      </div>
    </main>
  )
}
