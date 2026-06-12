'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Castle, Skull, AlertTriangle, User } from 'lucide-react'
import SimpleDungeonNew from '@/components/SimpleDungeonNew'
import { SectionHeading, Badge, GlassCard, StatBar } from '@/components/landing/ui'

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
      <div className="flex items-center justify-center py-32">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-textsec">Carregando...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 pb-16">
      {/* Header */}
      <GlassCard className="p-6 mb-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="flex flex-col gap-3">
            <Badge tone="primary" icon={<Castle size={14} />}>Masmorras</Badge>
            <SectionHeading
              align="left"
              title="Desça às masmorras de Dolrath"
              sub="Explore masmorras com recompensas crescentes ou treine sua build contra monstros, sem risco."
            />
          </div>

          {/* Seletor de Personagem */}
          {characters.length > 0 && (
            <div className="w-full lg:w-80 shrink-0 flex flex-col gap-3">
              <label className="text-xs font-semibold tracking-wide uppercase text-textsec">
                Escolha seu personagem
              </label>
              <select
                value={selectedCharacter?.id || ''}
                onChange={(e) => {
                  const character = characters.find(c => c.id === e.target.value)
                  setSelectedCharacter(character || null)
                }}
                className="w-full px-3 py-2.5 rounded-lg bg-background/60 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
              >
                {characters.map((char) => (
                  <option key={char.id} value={char.id} className="bg-secondary text-white">
                    {char.name} (Nv. {char.level}) — {char.race} {char.class}
                  </option>
                ))}
              </select>

              {selectedCharacter && (
                <div className="flex flex-col gap-2 rounded-lg border border-white/10 bg-white/5 p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white">{selectedCharacter.name}</span>
                    <span className="font-combat text-xs text-textsec">Nv. {selectedCharacter.level}</span>
                  </div>
                  <StatBar kind="hp" value={selectedCharacter.hp} max={selectedCharacter.maxHp} />
                  <StatBar kind="stamina" value={selectedCharacter.stamina} max={selectedCharacter.maxStamina} />
                  {!selectedCharacter.isAlive && (
                    <Badge tone="error" icon={<Skull size={13} />}>Personagem morto</Badge>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </GlassCard>

      {/* Erro */}
      {error && (
        <GlassCard className="p-4 mb-6">
          <div className="flex items-center gap-2 text-error">
            <AlertTriangle size={18} />
            <span className="text-sm">{error}</span>
          </div>
        </GlassCard>
      )}

      {/* Aviso se personagem está morto */}
      {selectedCharacter && !selectedCharacter.isAlive && (
        <GlassCard className="p-5 mb-6">
          <div className="flex items-start gap-3">
            <span className="text-error mt-0.5"><Skull size={20} /></span>
            <div>
              <p className="font-bold text-white">Personagem morto</p>
              <p className="text-sm text-textsec">Use uma Poção de Reviver antes de entrar nas masmorras.</p>
            </div>
          </div>
        </GlassCard>
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
        <GlassCard className="p-8 text-center">
          <div className="flex flex-col items-center gap-4">
            <span className="w-14 h-14 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary">
              <User size={26} />
            </span>
            <div>
              <p className="font-bold text-white text-lg mb-1">Nenhum personagem encontrado</p>
              <p className="text-sm text-textsec">Crie um personagem primeiro para acessar as masmorras.</p>
            </div>
            <Link
              href="/character/create"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold bg-gradient-to-r from-primary to-primary-dark text-white hover:shadow-lg hover:shadow-primary/25 active:scale-[0.98] transition-all"
            >
              Criar personagem
            </Link>
          </div>
        </GlassCard>
      )}
    </div>
  )
}
