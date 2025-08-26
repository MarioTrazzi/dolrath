// Página de resumo da dungeon

'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Dungeon, DungeonInstance, DungeonLoot, DungeonStats } from '@/types/game'

export default function DungeonSummaryPage() {
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
    return <div>Carregando...</div>
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-center mb-8">Resumo da Dungeon</h1>
        
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-8">
          <h2 className="text-2xl font-bold mb-4">Última Incursão: {dungeon.name}</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h3 className="font-bold">Estatísticas</h3>
              <ul>
                <li>Andares explorados: {instance.stats.floorstransversal}</li>
                <li>Monstros derrotados: {instance.stats.monstersKilled}</li>
                <li>Materiais coletados: {instance.stats.materialsCollected}</li>
                <li>XP ganho: {instance.stats.totalXpGained}</li>
              </ul>
            </div>
            <div>
              <h3 className="font-bold">Itens Adquiridos</h3>
              <ul>
                {instance.inventory.map((item: DungeonLoot) => (
                  <li key={item.id}>{item.quantity}x {item.name}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          <h2 className="text-2xl font-bold mb-4">Histórico de Incursões</h2>
          <ul>
            {history.map((run: DungeonInstance) => (
              <li key={run.id} className="border-b py-2">
                <span className="font-bold">{run.dungeonId}</span> - {new Date(run.startTime).toLocaleString()} - {run.status}
              </li>
            ))}
          </ul>
        </div>

        <div className="text-center mt-8">
          <button 
            onClick={() => router.push('/dungeons')}
            className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded"
          >
            Voltar para as Dungeons
          </button>
        </div>
      </div>
    </div>
  )
}
