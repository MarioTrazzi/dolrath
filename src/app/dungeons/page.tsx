'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import SimpleDungeonNew from '@/components/SimpleDungeonNew'

interface Character {
  id: string
  name: string
  level: number
  race: string
  class: string
  hp: number
  maxHp: number
  mp: number
  maxMp: number  
  stamina: number
  maxStamina: number
  attack: number
  defense: number
  isAlive: boolean
  equipment: any[]
}

export default function DungeonsPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const [characters, setCharacters] = useState<Character[]>([])
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Função para atualizar dados do personagem selecionado
  const handleCharacterUpdate = (updates: Partial<Character>) => {
    if (selectedCharacter) {
      setSelectedCharacter(prev => prev ? { ...prev, ...updates } : null)
      
      // Também atualizar na lista de personagens
      setCharacters(prev => prev.map(char => 
        char.id === selectedCharacter.id 
          ? { ...char, ...updates }
          : char
      ))
    }
  }

  useEffect(() => {
    if (!session) {
      router.push('/auth/login')
      return
    }

    const fetchCharacters = async () => {
      try {
        const response = await fetch('/api/character')
        if (!response.ok) {
          throw new Error('Erro ao carregar personagens')
        }
        const charData = await response.json()
        
        // Buscar dados completos de cada personagem incluindo equipamentos
        const charactersWithDetails = await Promise.all(
          charData.map(async (char: any) => {
            const detailResponse = await fetch(`/api/character/${char.id}`)
            if (detailResponse.ok) {
              const details = await detailResponse.json()
              return {
                ...char,
                ...details,
                mp: details.baseStats?.mp || 50,
                maxMp: details.baseStats?.maxMp || 50,
                stamina: details.stamina || 100,
                maxStamina: details.maxStamina || 100,
                attack: details.baseStats?.str || 10,
                defense: details.baseStats?.def || 10,
                equipment: details.equipment || []
              }
            }
            return {
              ...char,
              mp: 50,
              maxMp: 50,
              stamina: 100,
              maxStamina: 100,
              attack: 10,
              defense: 10,
              equipment: []
            }
          })
        )
        
        setCharacters(charactersWithDetails)
        if (charactersWithDetails && charactersWithDetails.length > 0) {
          setSelectedCharacter(charactersWithDetails[0])
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro desconhecido')
      } finally {
        setIsLoading(false)
      }
    }

    fetchCharacters()
  }, [session, router])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Carregando...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                  🏰 Sistema de Dungeons - NOVO
                </h1>
                <p className="text-gray-600 dark:text-gray-400">
                  Sistema reconstruído do zero - simples e funcional!
                </p>
              </div>
              <div className="text-right">
                {/* Seletor de Personagem */}
                {characters.length > 0 && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Escolha seu personagem:
                    </label>
                    <select
                      value={selectedCharacter?.id || ''}
                      onChange={(e) => {
                        const character = characters.find(c => c.id === e.target.value)
                        setSelectedCharacter(character || null)
                      }}
                      className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-purple-500 focus:border-purple-500"
                    >
                      {characters.map((char) => (
                        <option key={char.id} value={char.id}>
                          {char.name} (Level {char.level}) - {char.race} {char.class}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {selectedCharacter && (
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {selectedCharacter.name} • Level {selectedCharacter.level}
                    <br />
                    ❤️ {selectedCharacter.hp}/{selectedCharacter.maxHp} HP
                    <br />
                    ⚡ {selectedCharacter.stamina}/{selectedCharacter.maxStamina} Stamina
                    {!selectedCharacter.isAlive && (
                      <span className="text-red-500 ml-2">💀 MORTO</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Erro */}
        {error && (
          <div className="bg-red-100 dark:bg-red-900 border border-red-400 text-red-700 dark:text-red-300 px-4 py-3 rounded mb-6">
            <div className="flex items-center">
              <span className="text-red-500 mr-2">❌</span>
              {error}
            </div>
          </div>
        )}

        {/* Aviso se personagem está morto */}
        {selectedCharacter && !selectedCharacter.isAlive && (
          <div className="bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 rounded-lg p-4 mb-6">
            <p className="text-red-800 dark:text-red-300 font-bold">
              💀 Personagem Morto
            </p>
            <p className="text-red-600 dark:text-red-400 text-sm">
              Use uma Poção de Reviver antes de entrar em dungeons.
            </p>
          </div>
        )}

        {/* Dungeon Component */}
        {selectedCharacter && selectedCharacter.isAlive && (
          <SimpleDungeonNew 
            characterId={selectedCharacter.id} 
            character={selectedCharacter}
            onCharacterUpdate={handleCharacterUpdate}
          />
        )}

        {/* Sem personagens */}
        {characters.length === 0 && (
          <div className="bg-yellow-50 dark:bg-yellow-900 border border-yellow-200 dark:border-yellow-700 rounded-lg p-6 text-center">
            <p className="text-yellow-800 dark:text-yellow-300 font-bold mb-2">
              Nenhum personagem encontrado
            </p>
            <p className="text-yellow-600 dark:text-yellow-400 text-sm">
              Crie um personagem primeiro para poder acessar as dungeons.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
