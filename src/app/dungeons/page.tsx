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
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-textsec">Carregando...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="glass-card p-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div>
                <span className="text-xs font-semibold tracking-[0.2em] uppercase text-primary">
                  Masmorras
                </span>
                <h1 className="text-3xl font-bold text-white mt-2">
                  🏰 Sistema de Masmorras
                </h1>
                <p className="text-textsec mt-1">
                  Desça às profundezas e enfrente o que aguarda no escuro.
                </p>
              </div>
              <div className="lg:text-right">
                {/* Seletor de Personagem */}
                {characters.length > 0 && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-textsec mb-2">
                      Escolha seu personagem:
                    </label>
                    <select
                      value={selectedCharacter?.id || ''}
                      onChange={(e) => {
                        const character = characters.find(c => c.id === e.target.value)
                        setSelectedCharacter(character || null)
                      }}
                      className="block w-full px-3 py-2 rounded-lg bg-background/50 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                    >
                      {characters.map((char) => (
                        <option key={char.id} value={char.id} className="bg-secondary text-white">
                          {char.name} (Level {char.level}) - {char.race} {char.class}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {selectedCharacter && (
                  <div className="text-sm text-textsec font-combat">
                    {selectedCharacter.name} • Level {selectedCharacter.level}
                    <br />
                    ❤️ {selectedCharacter.hp}/{selectedCharacter.maxHp} HP
                    <br />
                    ⚡ {selectedCharacter.stamina}/{selectedCharacter.maxStamina} Stamina
                    {!selectedCharacter.isAlive && (
                      <span className="text-error ml-2">💀 MORTO</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Erro */}
        {error && (
          <div className="bg-error/15 border border-error/30 text-error px-4 py-3 rounded-lg mb-6">
            <div className="flex items-center">
              <span className="mr-2">❌</span>
              {error}
            </div>
          </div>
        )}

        {/* Aviso se personagem está morto */}
        {selectedCharacter && !selectedCharacter.isAlive && (
          <div className="glass-card border-l-4 border-l-error p-4 mb-6">
            <p className="text-error font-bold">
              💀 Personagem Morto
            </p>
            <p className="text-textsec text-sm">
              Use uma Poção de Reviver antes de entrar em masmorras.
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
          <div className="glass-card border-l-4 border-l-warning p-6 text-center">
            <p className="text-warning font-bold mb-2">
              Nenhum personagem encontrado
            </p>
            <p className="text-textsec text-sm">
              Crie um personagem primeiro para poder acessar as masmorras.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
