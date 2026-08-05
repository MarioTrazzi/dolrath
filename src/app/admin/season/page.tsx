'use client'

import { useCallback, useEffect, useState } from 'react'
import { Coins, Copy, Check, RefreshCw } from 'lucide-react'

type Payout = {
  id: string
  rank: number
  characterId: string
  characterName: string
  points: number
  dolAmount: number
  walletAddress: string | null
  status: string
  txHash: string | null
}

type Season = {
  id: string
  name: string
  status: string
  startsAt: string
  endsAt: string
  potDol: number
  seededDol: number
  fundedDol: number
  entries: number
  competingAccounts: number
  payouts: Payout[]
}

type Payload = { seasons: Season[]; tournamentVaultDol: number }

/**
 * Operação da temporada. O pagamento on-chain é MANUAL de propósito: a página
 * monta a lista (carteira + valor), o operador transfere do tesouro e volta
 * aqui marcar como pago com o txHash.
 */
export default function AdminSeasonPage() {
  const [data, setData] = useState<Payload | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [txInput, setTxInput] = useState<Record<string, string>>({})

  const load = useCallback(() => {
    fetch('/api/admin/season')
      .then(async (r) => {
        if (r.status === 401) throw new Error('Acesso restrito a administradores.')
        if (!r.ok) throw new Error('Falha ao carregar temporadas')
        return r.json()
      })
      .then(setData)
      .catch((e) => setErr(e.message))
  }, [])

  useEffect(load, [load])

  const snapshot = async (seasonId: string) => {
    setBusy(true)
    try {
      const res = await fetch('/api/ranking/payout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seasonId }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Falha ao gerar prêmios')
      load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Falha ao gerar prêmios')
    } finally {
      setBusy(false)
    }
  }

  const markPaid = async (payoutId: string) => {
    const txHash = (txInput[payoutId] || '').trim()
    if (!txHash) return
    setBusy(true)
    try {
      const res = await fetch('/api/ranking/payout', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payoutId, txHash }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Falha ao marcar como pago')
      load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Falha ao marcar como pago')
    } finally {
      setBusy(false)
    }
  }

  // CSV carteira,valor — pronto para transferência em lote.
  const copyCsv = async (season: Season) => {
    const csv = season.payouts
      .filter((p) => p.status === 'pending' && p.walletAddress)
      .map((p) => `${p.walletAddress},${p.dolAmount}`)
      .join('\n')
    await navigator.clipboard.writeText(csv)
    setCopied(season.id)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <main className="relative min-h-screen pt-24 pb-16 px-4">
      <div className="relative mx-auto max-w-4xl">
        <header className="mb-6 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-amber-200/70 mb-1">Operação</p>
            <h1 className="font-display text-3xl text-[#f0e6c8]">Temporadas</h1>
          </div>
          <button
            onClick={load}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/70 hover:bg-white/5"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Recarregar
          </button>
        </header>

        {err && (
          <p className="rounded-xl border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-200">{err}</p>
        )}

        {data && (
          <>
            <p className="mb-6 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-[#f0e6c8] flex items-center gap-2">
              <Coins className="h-4 w-4 text-amber-400" />
              Cofre de torneios: <span className="text-amber-300">{data.tournamentVaultDol} DOL</span>
            </p>

            {data.seasons.map((season) => (
              <section key={season.id} className="mb-6 rounded-2xl border border-white/10 bg-black/40 px-4 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <h2 className="text-lg text-[#f0e6c8]">
                      {season.name}{' '}
                      <span className="text-xs uppercase tracking-wider text-white/40">{season.status}</span>
                    </h2>
                    <p className="text-xs text-white/50 mt-1">
                      {new Date(season.startsAt).toLocaleDateString()} → {new Date(season.endsAt).toLocaleDateString()} ·{' '}
                      {season.entries} inscritos ({season.competingAccounts} contas)
                    </p>
                    <p className="text-xs text-white/50">
                      Pote {season.potDol} DOL = {season.fundedDol} dos jogadores + {season.seededDol} de aporte
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => snapshot(season.id)}
                      disabled={busy}
                      className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-100 hover:bg-amber-500/20 disabled:opacity-50"
                    >
                      Gerar prêmios
                    </button>
                    {season.payouts.length > 0 && (
                      <button
                        onClick={() => copyCsv(season)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-1.5 text-xs text-white/70 hover:bg-white/5"
                      >
                        {copied === season.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        CSV
                      </button>
                    )}
                  </div>
                </div>

                {season.payouts.length > 0 && (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-sm min-w-[640px]">
                      <thead>
                        <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-wider text-white/40">
                          <th className="py-2 w-10">#</th>
                          <th className="py-2">Herói</th>
                          <th className="py-2 text-right">DOL</th>
                          <th className="py-2">Carteira</th>
                          <th className="py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {season.payouts.map((p) => (
                          <tr key={p.id} className="border-b border-white/5">
                            <td className="py-2 font-mono text-amber-200/80">{p.rank}</td>
                            <td className="py-2 text-[#f0e6c8]">
                              {p.characterName}
                              <span className="text-white/40 text-xs"> · {p.points} pts</span>
                            </td>
                            <td className="py-2 text-right text-amber-300">{p.dolAmount}</td>
                            <td className="py-2 font-mono text-[11px] text-white/50">
                              {p.walletAddress ?? '— sem carteira —'}
                            </td>
                            <td className="py-2">
                              {p.status === 'paid' ? (
                                <span className="text-emerald-300/80 text-xs">pago</span>
                              ) : (
                                <div className="flex gap-1">
                                  <input
                                    placeholder="txHash"
                                    value={txInput[p.id] ?? ''}
                                    onChange={(e) => setTxInput((s) => ({ ...s, [p.id]: e.target.value }))}
                                    className="w-28 rounded border border-white/15 bg-black/60 px-2 py-1 text-[11px] text-white/80"
                                  />
                                  <button
                                    onClick={() => markPaid(p.id)}
                                    disabled={busy}
                                    className="rounded border border-emerald-500/40 px-2 py-1 text-[11px] text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-50"
                                  >
                                    ok
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            ))}
          </>
        )}
      </div>
    </main>
  )
}
