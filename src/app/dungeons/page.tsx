'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import DungeonRun, { DungeonCharacter } from '@/components/dungeon/DungeonRun'
import DungeonBackdrop from '@/components/dungeon/DungeonBackdrop'
import { DUNGEON_LIST, DungeonDef } from '@/lib/dungeonAdventures'

export default function DungeonsPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const [characters, setCharacters] = useState<DungeonCharacter[]>([])
  const [selectedCharacter, setSelectedCharacter] = useState<DungeonCharacter | null>(null)
  const [activeDungeon, setActiveDungeon] = useState<DungeonDef | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
        const charactersWithDetails: DungeonCharacter[] = await Promise.all(
          charData.map(async (char: any) => {
            const detailResponse = await fetch(`/api/character/${char.id}`)
            if (detailResponse.ok) {
              const details = await detailResponse.json()
              return {
                ...char,
                ...details,
                race: details.race || char.race || 'Humano',
                class: details.class || char.class || 'Guerreiro',
                avatar: details.avatar || null,
                mp: details.baseStats?.mp || 50,
                maxMp: details.baseStats?.maxMp || 50,
                stamina: details.stamina ?? 100,
                maxStamina: details.maxStamina ?? 100,
                attack: details.baseStats?.str || 10,
                defense: details.baseStats?.def || 10,
                equipment: details.equipment || [],
              }
            }
            return {
              ...char,
              avatar: null,
              mp: 50,
              maxMp: 50,
              stamina: 100,
              maxStamina: 100,
              attack: 10,
              defense: 10,
              equipment: [],
            }
          })
        )

        setCharacters(charactersWithDetails)
        if (charactersWithDetails.length > 0) {
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

  // Ao sair da masmorra, sincroniza os recursos locais do personagem
  const handleRunExit = (updates: { hp: number; mp: number; stamina: number }) => {
    setActiveDungeon(null)
    if (selectedCharacter) {
      const updated = { ...selectedCharacter, ...updates }
      setSelectedCharacter(updated)
      setCharacters(prev => prev.map(c => (c.id === updated.id ? updated : c)))
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-textsec">Abrindo o mapa das masmorras...</p>
        </div>
      </div>
    )
  }

  // Masmorra ativa: experiência em tela cheia
  if (activeDungeon && selectedCharacter) {
    return (
      <DungeonRun
        dungeon={activeDungeon}
        character={selectedCharacter}
        onExit={handleRunExit}
      />
    )
  }

  const canEnter = !!selectedCharacter && (selectedCharacter as any).isAlive !== false

  return (
    <div className="min-h-screen p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6 sm:mb-8 text-center">
          <motion.h1
            initial={{ y: -12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="text-3xl sm:text-4xl font-black text-white mb-2"
          >
            ⚔️ Masmorras de Dolrath
          </motion.h1>
          <p className="text-white/50 text-sm">
            Quatro terras perigosas, um boss em cada uma. Explore com o d20, lute na arena e volte rico — ou não volte.
          </p>
        </div>

        {/* Seletor de personagem */}
        <div className="mb-6 flex flex-col sm:flex-row items-center justify-center gap-3">
          {characters.length > 0 ? (
            <>
              <select
                value={selectedCharacter?.id || ''}
                onChange={(e) => {
                  const character = characters.find(c => c.id === e.target.value)
                  setSelectedCharacter(character || null)
                }}
                className="px-4 py-2.5 rounded-xl bg-black/60 border border-white/20 text-white text-sm font-bold focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              >
                {characters.map((char) => (
                  <option key={char.id} value={char.id}>
                    {char.name} (Nv.{char.level}) — {char.race} {char.class}
                  </option>
                ))}
              </select>
              {selectedCharacter && (
                <div className="flex items-center gap-3 text-xs text-white/70 bg-black/40 border border-white/10 rounded-xl px-4 py-2.5">
                  <span>❤️ {selectedCharacter.hp}/{selectedCharacter.maxHp}</span>
                  <span>🔮 {selectedCharacter.mp}/{selectedCharacter.maxMp}</span>
                  <span>⚡ {selectedCharacter.stamina}/{selectedCharacter.maxStamina}</span>
                  {(selectedCharacter as any).isAlive === false && (
                    <span className="text-red-400 font-bold">💀 MORTO</span>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="bg-yellow-950/60 border border-yellow-700/50 rounded-xl px-6 py-4 text-center">
              <p className="text-yellow-300 font-bold text-sm mb-1">Nenhum personagem encontrado</p>
              <p className="text-yellow-500/80 text-xs">Crie um personagem primeiro para explorar as masmorras.</p>
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-950/60 border border-red-700/50 text-red-300 px-4 py-3 rounded-xl mb-6 text-sm text-center">
            ❌ {error}
          </div>
        )}

        {selectedCharacter && (selectedCharacter as any).isAlive === false && (
          <div className="bg-red-950/60 border border-red-700/50 rounded-xl p-4 mb-6 text-center">
            <p className="text-red-300 font-bold text-sm">💀 Personagem morto</p>
            <p className="text-red-400/80 text-xs">Use uma Poção de Reviver antes de entrar em masmorras.</p>
          </div>
        )}

        {/* Grid das 4 masmorras */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
          {DUNGEON_LIST.map((dungeon, idx) => (
            <motion.div
              key={dungeon.id}
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: idx * 0.1, type: 'spring', stiffness: 180, damping: 20 }}
              whileHover={{ scale: 1.02 }}
              className="relative overflow-hidden rounded-3xl border-2 group"
              style={{ borderColor: `${dungeon.accent}55` }}
            >
              {/* Cenário em miniatura */}
              <div className="absolute inset-0">
                <DungeonBackdrop theme={dungeon.id} />
              </div>
              <div className="absolute inset-0 bg-black/30 group-hover:bg-black/15 transition-colors" />

              <div className="relative p-5 sm:p-6 flex flex-col min-h-[230px]">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-4xl mb-2 drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">{dungeon.emoji}</div>
                    <h2 className="text-white font-black text-xl sm:text-2xl drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
                      {dungeon.name}
                    </h2>
                    <p className="text-white/70 text-xs italic drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                      {dungeon.tagline}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-amber-400 text-sm tracking-tighter">
                      {'★'.repeat(dungeon.difficultyStars)}
                      <span className="text-white/25">{'★'.repeat(4 - dungeon.difficultyStars)}</span>
                    </div>
                    <div className="text-white/60 text-[10px] mt-0.5">
                      {dungeon.rooms} salas + 👑
                    </div>
                    <div
                      className={`text-[10px] mt-0.5 font-bold ${selectedCharacter && selectedCharacter.level < dungeon.levelReq ? 'text-red-400' : 'text-white/50'}`}
                    >
                      Nv. {dungeon.levelReq}+
                    </div>
                  </div>
                </div>

                <p className="text-white/60 text-xs mt-3 mb-4 max-w-md drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                  {dungeon.description}
                </p>

                <div className="mt-auto flex items-end justify-between gap-2">
                  {/* Bestiário */}
                  <div className="flex items-center gap-1">
                    {dungeon.monsters.map(m => (
                      <span
                        key={m.name}
                        title={m.name}
                        className="w-8 h-8 rounded-lg bg-black/50 border border-white/15 flex items-center justify-center text-base"
                      >
                        {m.emoji}
                      </span>
                    ))}
                    <span
                      title={`Boss: ${dungeon.boss.name}`}
                      className="w-8 h-8 rounded-lg bg-amber-950/70 border border-amber-500/50 flex items-center justify-center text-base"
                    >
                      {dungeon.boss.emoji}
                    </span>
                  </div>

                  {(() => {
                    const meetsLevel = !!selectedCharacter && selectedCharacter.level >= dungeon.levelReq
                    const enter = canEnter && meetsLevel
                    return (
                      <button
                        onClick={() => enter && setActiveDungeon(dungeon)}
                        disabled={!enter}
                        title={!meetsLevel ? `Requer nível ${dungeon.levelReq}` : undefined}
                        className={`px-5 py-2.5 rounded-xl font-black text-sm text-white shadow-lg transition-all ${
                          enter ? 'hover:scale-105' : 'opacity-50 cursor-not-allowed'
                        }`}
                        style={{
                          background: `linear-gradient(90deg, ${dungeon.accent}cc, ${dungeon.accent}77)`,
                          boxShadow: `0 4px 20px ${dungeon.accentSoft}`,
                        }}
                      >
                        {canEnter && !meetsLevel ? `🔒 Nv. ${dungeon.levelReq}` : '🚪 Entrar'}
                      </button>
                    )
                  })()}
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        <p className="text-center text-white/30 text-[11px] mt-6 max-w-2xl mx-auto">
          ⚡ A stamina é seu orçamento de runs do dia (reseta amanhã) e só é gasta avançando na trilha — o combate não a consome.
          ❤️🔮 HP e MP voltam ao cheio entre runs. Você nunca perde XP, ouro ou itens ao morrer ou sair: cada tentativa te deixa mais forte.
          Salas principais (⚔️) têm monstro garantido e melhor espólio; os nós menores entre elas são mais fáceis.
        </p>
      </div>
    </div>
  )
}
