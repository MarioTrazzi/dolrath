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
        <div className="bg-slate-800 rounded-lg shadow-2xl p-8 border border-purple-500/20">
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
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
              />
            </div>

            <button
              onClick={handleSeed}
              disabled={loading || !secret}
              className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded transition"
            >
              {loading ? 'Executando...' : '▶️ Executar Seeds'}
            </button>
          </div>

          {error && (
            <div className="mt-6 p-4 bg-red-900/30 border border-red-500 rounded text-red-400">
              ❌ {error}
            </div>
          )}

          {result && (
            <div className="mt-6 space-y-4">
              <div className="p-4 bg-green-900/30 border border-green-500 rounded text-green-400">
                ✅ {result.message}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-slate-700 rounded">
                  <h3 className="font-bold text-purple-400 mb-2">📦 Catálogo</h3>
                  <p className="text-sm text-slate-300">Criados: {result.catalog.created}</p>
                  <p className="text-sm text-slate-300">Atualizados: {result.catalog.updated}</p>
                  <p className="text-sm text-slate-300">Total: {result.catalog.total}</p>
                </div>

                <div className="p-4 bg-slate-700 rounded">
                  <h3 className="font-bold text-purple-400 mb-2">⚒️ Pedras</h3>
                  <p className="text-sm text-slate-300">Criadas: {result.stones.created}</p>
                  <p className="text-sm text-slate-300">Atualizadas: {result.stones.updated}</p>
                  <p className="text-sm text-slate-300">Total: {result.stones.total}</p>
                </div>
              </div>

              {result.catalog.preview && (
                <div className="p-4 bg-slate-700 rounded">
                  <h3 className="font-bold text-purple-400 mb-2">Primeiros itens do catálogo</h3>
                  <ul className="text-sm text-slate-300 space-y-1">
                    {result.catalog.preview.map((item: string, i: number) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {result.stones.items && (
                <div className="p-4 bg-slate-700 rounded">
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

          <div className="mt-8 p-4 bg-slate-700 rounded text-slate-400 text-sm">
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
