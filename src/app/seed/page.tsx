'use client'

import { useState } from 'react'

export default function SeedPage() {
  const [secret, setSecret] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSeed = async () => {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch('/api/seed', {
        method: 'POST',
        headers: {
          'X-Seed-Secret': secret,
          'Content-Type': 'application/json',
        },
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Erro ao executar seed')
      } else {
        setResult(data)
        setSecret('')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="rounded-[4px] border border-[#46464c] bg-[#1e1e21]/95 p-8 shadow-2xl shadow-black/60">
          <h1 className="text-3xl font-bold text-purple-400 mb-2">🌱 Seed Manager</h1>
          <p className="text-slate-400 mb-8">Executa os seeds de catálogo e pedras de aprimoramento</p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Seed Secret
              </label>
              <input
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="Digite o secret de seed"
                disabled={loading}
                className="w-full rounded-[3px] border border-[#3c3c41] bg-[#101013] px-4 py-2 text-[#ece7da] placeholder:text-[#57575c] outline-none transition-colors focus:border-[#8a6d3b]"
              />
            </div>

            <button
              onClick={handleSeed}
              disabled={loading || !secret}
              className="w-full rounded-[3px] border border-[#8a6d3b] bg-gradient-to-b from-[#3a3325] to-[#241f16] py-2 px-4 font-semibold tracking-wide text-[#e7c682] transition-all hover:border-[#c9a25f] hover:brightness-125 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? 'Executando...' : '▶️ Executar Seeds'}
            </button>
          </div>

          {error && (
            <div className="mt-6 p-4 rounded-[3px] border border-red-900/70 bg-red-950/40 text-red-300">
              ❌ {error}
            </div>
          )}

          {result && (
            <div className="mt-6 space-y-4">
              <div className="p-4 rounded-[3px] border border-emerald-800/70 bg-emerald-950/40 text-emerald-300">
                ✅ {result.message}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-[3px] border border-black/60 bg-[#19191c]">
                  <h3 className="font-bold text-purple-400 mb-2">📦 Catálogo</h3>
                  <p className="text-sm text-slate-300">Criados: {result.catalog.created}</p>
                  <p className="text-sm text-slate-300">Atualizados: {result.catalog.updated}</p>
                  <p className="text-sm text-slate-300">Total: {result.catalog.total}</p>
                </div>

                <div className="p-4 rounded-[3px] border border-black/60 bg-[#19191c]">
                  <h3 className="font-bold text-purple-400 mb-2">⚒️ Pedras</h3>
                  <p className="text-sm text-slate-300">Criadas: {result.stones.created}</p>
                  <p className="text-sm text-slate-300">Atualizadas: {result.stones.updated}</p>
                  <p className="text-sm text-slate-300">Total: {result.stones.total}</p>
                </div>
              </div>

              {result.catalog.preview && (
                <div className="p-4 rounded-[3px] border border-black/60 bg-[#19191c]">
                  <h3 className="font-bold text-purple-400 mb-2">Primeiros itens do catálogo</h3>
                  <ul className="text-sm text-slate-300 space-y-1">
                    {result.catalog.preview.map((item: string, i: number) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {result.stones.items && (
                <div className="p-4 rounded-[3px] border border-black/60 bg-[#19191c]">
                  <h3 className="font-bold text-purple-400 mb-2">Pedras de Aprimoramento</h3>
                  <ul className="text-sm text-slate-300 space-y-1">
                    {result.stones.items.map((item: string, i: number) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="mt-8 p-4 rounded-[3px] border border-black/60 bg-[#19191c] text-slate-400 text-sm">
            <p className="font-bold mb-2">💡 Uso via curl:</p>
            <code className="block bg-slate-800 p-2 rounded font-mono text-xs overflow-x-auto">
              curl -X POST https://dolrath.vercel.app/api/seed \<br />
              &nbsp;&nbsp;-H 'X-Seed-Secret: seu-secret-aqui'
            </code>
          </div>
        </div>
      </div>
    </div>
  )
}
