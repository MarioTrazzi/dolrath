// Página de resumo da dungeon

'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Dungeon, DungeonInstance, DungeonLoot, DungeonStats } from '@/types/game'
import { Suspense } from 'react'

function SummaryContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [instance, setInstance] = useState<DungeonInstance | null>(null)
  const [dungeon, setDungeon] = useState<Dungeon | null>(null)
  const [history, setHistory] = useState<DungeonInstance[]>([])

  useEffect(() => {
    const instanceData = searchParams.get('instance')
    if (instanceData) {
      const parsedInstance = JSON.parse(instanceData)
      setInstance(parsedInstance)
      // Fetch dungeon and history data based on the instance
      fetchDungeonData(parsedInstance.dungeonId)
      fetchDungeonHistory(parsedInstance.characterId)
    }
  }, [searchParams])

  const fetchDungeonData = async (dungeonId: string) => {
    // In a real app, you would fetch this from your API
    // For now, we'll just simulate it
    const response = await fetch(`/api/dungeons/${dungeonId}`)
    const data = await response.json()
    setDungeon(data.dungeon)
  }

  const fetchDungeonHistory = async (characterId: string) => {
    const response = await fetch(`/api/dungeons/history?characterId=${characterId}`)
    const data = await response.json()
    setHistory(data.history)
  }

  if (!instance || !dungeon) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-textsec">Carregando...</div>
    )
  }

  return (
    <div className="p-4 sm:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <span className="text-xs font-semibold tracking-[0.2em] uppercase text-primary">Masmorras</span>
          <h1 className="text-4xl font-bold text-white mt-2">Resumo da Incursão</h1>
        </div>

        <div className="glass-card p-6 mb-8">
          <h2 className="text-2xl font-bold mb-4 text-white">Última Incursão: {dungeon.name}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <h3 className="font-bold text-white mb-2">Estatísticas</h3>
              <ul className="space-y-1 text-textsec font-combat text-sm">
                <li>Andares explorados: {instance.stats.floorstransversal}</li>
                <li>Monstros derrotados: {instance.stats.monstersKilled}</li>
                <li>Materiais coletados: {instance.stats.materialsCollected}</li>
                <li>XP ganho: {instance.stats.totalXpGained}</li>
              </ul>
            </div>
            <div>
              <h3 className="font-bold text-white mb-2">Itens Adquiridos</h3>
              <ul className="space-y-1 text-textsec text-sm">
                {instance.inventory.map((item: DungeonLoot) => (
                  <li key={item.id}><span className="font-combat">{item.quantity}x</span> {item.name}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="glass-card p-6">
          <h2 className="text-2xl font-bold mb-4 text-white">Histórico de Incursões</h2>
          <ul className="divide-y divide-white/10">
            {history.map((run: DungeonInstance) => (
              <li key={run.id} className="py-2 text-textsec text-sm">
                <span className="font-bold text-white">{run.dungeonId}</span> · {new Date(run.startTime).toLocaleString()} · {run.status}
              </li>
            ))}
          </ul>
        </div>

        <div className="text-center mt-8">
          <button
            onClick={() => router.push('/dungeons')}
            className="inline-flex items-center justify-center px-6 py-3 text-sm font-semibold rounded-lg bg-gradient-to-r from-primary to-primary-dark text-white hover:shadow-lg hover:shadow-primary/25 active:scale-[0.98] transition-all"
          >
            Voltar para as Masmorras
          </button>
        </div>
      </div>
    </div>
  )
}

export default function DungeonSummaryPage() {
  return (
    <Suspense fallback={
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    }>
      <SummaryContent />
    </Suspense>
  )
}
