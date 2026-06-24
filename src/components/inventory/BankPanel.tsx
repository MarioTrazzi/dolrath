'use client'

import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'

interface CharWallet { id: string; name: string; class: string; gold: number }

// 🏦 Banco: poupança da CONTA (User.goldBalance, claimável) + carteira de cada
// personagem (Character.gold, usada nas compras). Sacar leva do banco pro herói;
// depositar devolve pro banco (necessário para dar claim). [[bank — Opção B]]
export default function BankPanel() {
  const [bankGold, setBankGold] = useState<number | null>(null)
  const [chars, setChars] = useState<CharWallet[]>([])
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/bank/status')
      if (!res.ok) return
      const data = await res.json()
      setBankGold(Number(data?.bankGold ?? 0))
      setChars(Array.isArray(data?.characters) ? data.characters : [])
    } catch { /* silencioso */ }
  }, [])

  useEffect(() => { load() }, [load])

  const move = async (kind: 'deposit' | 'withdraw', characterId: string) => {
    const amount = Math.floor(Number(amounts[characterId] || 0))
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Informe uma quantia válida.')
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/bank/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId, amount }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data?.error || 'Falha na operação')
        return
      }
      toast.success(data?.message || 'Pronto!')
      setAmounts((p) => ({ ...p, [characterId]: '' }))
      // Atualiza os saldos a partir da resposta + recarrega.
      if (typeof data?.bankGold === 'number') setBankGold(data.bankGold)
      load()
    } catch {
      toast.error('Erro de conexão.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mb-6 rounded-xl border border-amber-400/25 bg-black/30 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-amber-200">🏦 Banco</h2>
        <div className="text-right">
          <div className="text-xs text-text-secondary">Saldo do banco (claimável)</div>
          <div className="text-2xl font-black text-amber-300">{bankGold === null ? '…' : bankGold} 🪙</div>
        </div>
      </div>
      <p className="text-xs text-text-secondary mb-4">
        O ouro no banco é o único que dá <b>claim</b> on-chain. O ouro na carteira de um personagem
        serve para <b>comprar</b> no ferreiro/alquimista. Saque para gastar; deposite para reivindicar.
      </p>

      {chars.length === 0 ? (
        <p className="text-sm text-text-secondary">Nenhum personagem.</p>
      ) : (
        <div className="space-y-2">
          {chars.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-slate-900/50 p-3">
              <div className="flex-1 min-w-[140px]">
                <div className="font-semibold text-white">{c.name} <span className="text-xs text-text-secondary">({c.class})</span></div>
                <div className="text-sm text-amber-300">{c.gold} 🪙 na mão</div>
              </div>
              <input
                type="number" min={1} placeholder="quantia"
                value={amounts[c.id] || ''}
                onChange={(e) => setAmounts((p) => ({ ...p, [c.id]: e.target.value }))}
                className="w-28 bg-slate-950 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white"
              />
              <button
                onClick={() => move('withdraw', c.id)}
                disabled={busy}
                title="Banco → personagem (habilita compras)"
                className="px-3 py-1.5 rounded-lg text-sm font-bold text-amber-50 bg-amber-700/70 border border-amber-400/40 disabled:opacity-40"
              >
                ↓ Sacar
              </button>
              <button
                onClick={() => move('deposit', c.id)}
                disabled={busy}
                title="Personagem → banco (habilita claim)"
                className="px-3 py-1.5 rounded-lg text-sm font-bold text-white bg-emerald-700/70 border border-emerald-400/30 disabled:opacity-40"
              >
                ↑ Depositar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
