'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Users, Sword, Plus, RefreshCw, Crown, Clock, X, Shield } from 'lucide-react'

interface CombatRoom {
  id: string
  name: string
  createdBy: string
  createdByName: string
  playerCount: number
  maxPlayers: number
  isPrivate: boolean
  status: 'waiting' | 'in_progress' | 'finished'
  createdAt: Date
}

interface Player {
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
  strength: number
  agility: number
  intelligence: number
  resistance: number
  critical: number
  speed: number
  isAlive: boolean
  equipment: any[]
  isOnline: boolean
}

export default function CombatLobbyPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [characters, setCharacters] = useState<Player[]>([])
  const [selectedCharacter, setSelectedCharacter] = useState<Player | null>(null)
  const [rooms, setRooms] = useState<CombatRoom[]>([])
  const [isCreatingRoom, setIsCreatingRoom] = useState(false)
  const [newRoomName, setNewRoomName] = useState('')
  const [isPrivateRoom, setIsPrivateRoom] = useState(false)

  useEffect(() => {
    checkAuthAndLoadData()
  }, [])

  useEffect(() => {
    if (!isLoading) {
      const interval = setInterval(loadRooms, 5000)
      return () => clearInterval(interval)
    }
  }, [isLoading])

  const checkAuthAndLoadData = async () => {
    try {
      // Carregar personagens do usuário
      const charactersResponse = await fetch('/api/character')
      if (charactersResponse.ok) {
        const charData = await charactersResponse.json()
        
        // Buscar dados completos de cada personagem incluindo equipamentos
        const charactersWithDetails = await Promise.all(
          charData.map(async (char: any) => {
            const detailResponse = await fetch(`/api/character/${char.id}`)
            if (detailResponse.ok) {
              const details = await detailResponse.json()
              return {
                ...char,
                ...details,
                race: char.race || 'Humano',
                class: char.class || 'Guerreiro',
                mp: details.baseStats?.mp || 50,
                maxMp: details.baseStats?.maxMp || 50,
                stamina: details.stamina || 100,
                maxStamina: details.maxStamina || 100,
                attack: details.baseStats?.str || 10,
                defense: details.baseStats?.def || 10,
                strength: details.baseStats?.str || 10,
                agility: details.baseStats?.agi || 10,
                intelligence: details.baseStats?.int || 10,
                resistance: details.baseStats?.res || 10,
                critical: details.baseStats?.crit || 1.0,
                speed: details.baseStats?.speed || 2.5,
                equipment: details.equipment || [],
                isOnline: true
              }
            }
            return {
              ...char,
              race: char.race || 'Humano',
              class: char.class || 'Guerreiro',
              mp: 50,
              maxMp: 50,
              stamina: 100,
              maxStamina: 100,
              attack: 10,
              defense: 10,
              strength: 10,
              agility: 10,
              intelligence: 10,
              resistance: 10,
              critical: 1.0,
              speed: 2.5,
              equipment: [],
              isOnline: true
            }
          })
        )
        
        setCharacters(charactersWithDetails)
        if (charactersWithDetails && charactersWithDetails.length > 0) {
          setSelectedCharacter(charactersWithDetails[0])
        }
      } else {
        // Se não conseguir carregar personagens, criar um mock
        const mockCharacter: Player = {
          id: 'mock_player_' + Math.random().toString(36).substr(2, 9),
          name: 'Guerreiro Teste',
          level: 6,
          race: 'Humano',
          class: 'Guerreiro',
          hp: 360,
          maxHp: 360,
          mp: 210,
          maxMp: 210,
          stamina: 100,
          maxStamina: 100,
          attack: 9,
          defense: 10,
          strength: 9,
          agility: 5,
          intelligence: 3,
          resistance: 0,
          critical: 1.0,
          speed: 2.5,
          isAlive: true,
          equipment: [],
          isOnline: true
        }
        setCharacters([mockCharacter])
        setSelectedCharacter(mockCharacter)
      }

      await loadRooms()
    } catch (error) {
      console.error('Erro ao carregar dados:', error)
      // Fallback para dados mock
      const mockCharacter: Player = {
        id: 'mock_player_' + Math.random().toString(36).substr(2, 9),
        name: 'Guerreiro Teste',
        level: 6,
        race: 'Humano',
        class: 'Guerreiro',
        hp: 360,
        maxHp: 360,
        mp: 210,
        maxMp: 210,
        stamina: 100,
        maxStamina: 100,
        attack: 9,
        defense: 10,
        strength: 9,
        agility: 5,
        intelligence: 3,
        resistance: 0,
        critical: 1.0,
        speed: 2.5,
        isAlive: true,
        equipment: [],
        isOnline: true
      }
      setCharacters([mockCharacter])
      setSelectedCharacter(mockCharacter)
      await loadRooms()
    } finally {
      setIsLoading(false)
    }
  }

  const loadRooms = async () => {
    try {
      const response = await fetch('/api/combat/rooms')
      if (response.ok) {
        const roomsData = await response.json()
        setRooms(roomsData)
      } else {
        const mockRooms: CombatRoom[] = [
          {
            id: 'room_1',
            name: 'Arena dos Guerreiros',
            createdBy: 'player_1',
            createdByName: 'Lorde das Batalhas',
            playerCount: 1,
            maxPlayers: 2,
            isPrivate: false,
            status: 'waiting',
            createdAt: new Date(Date.now() - 300000)
          },
          {
            id: 'room_2',
            name: 'Duelo de Campeões',
            createdBy: 'player_2',
            createdByName: 'Mestre da Espada',
            playerCount: 2,
            maxPlayers: 2,
            isPrivate: false,
            status: 'in_progress',
            createdAt: new Date(Date.now() - 600000)
          },
          {
            id: 'room_3',
            name: 'Torneio Privado',
            createdBy: 'player_3',
            createdByName: 'Cavaleiro Negro',
            playerCount: 1,
            maxPlayers: 2,
            isPrivate: true,
            status: 'waiting',
            createdAt: new Date(Date.now() - 120000)
          }
        ]
        setRooms(mockRooms)
      }
    } catch (error) {
      console.error('Erro ao carregar salas:', error)
      const mockRooms: CombatRoom[] = [
        {
          id: 'room_1',
          name: 'Arena dos Guerreiros',
          createdBy: 'player_1',
          createdByName: 'Lorde das Batalhas',
          playerCount: 1,
          maxPlayers: 2,
          isPrivate: false,
          status: 'waiting',
          createdAt: new Date(Date.now() - 300000)
        }
      ]
      setRooms(mockRooms)
    }
  }

  const createRoom = async () => {
    if (!newRoomName.trim() || !selectedCharacter) return

    setIsCreatingRoom(true)
    try {
      const response = await fetch('/api/combat/rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newRoomName.trim(),
          isPrivate: isPrivateRoom,
          createdBy: selectedCharacter.id,
          createdByName: selectedCharacter.name
        })
      })

      if (response.ok) {
        const newRoom = await response.json()
        router.push(`/combat?room=${newRoom.id}&creator=true&character=${selectedCharacter.id}`)
      } else {
        // Simular criação de sala para demonstração
        const roomId = 'room_' + Math.random().toString(36).substr(2, 9)
        // Redirecionar para a página de combate com o ID da sala e personagem
        router.push(`/combat?room=${roomId}&creator=true&character=${selectedCharacter.id}`)
      }
    } catch (error) {
      console.error('Erro ao criar sala:', error)
      // Fallback - simular criação bem-sucedida
      const roomId = 'room_' + Math.random().toString(36).substr(2, 9)
      router.push(`/combat?room=${roomId}&creator=true&character=${selectedCharacter.id}`)
    } finally {
      setIsCreatingRoom(false)
      setNewRoomName('')
      setIsPrivateRoom(false)
    }
  }

  const joinRoom = (roomId: string) => {
    if (!selectedCharacter) return
    router.push(`/combat?room=${roomId}&character=${selectedCharacter.id}`)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'waiting': return 'text-green-600 bg-green-100'
      case 'in_progress': return 'text-orange-600 bg-orange-100'
      case 'finished': return 'text-gray-600 bg-gray-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'waiting': return 'Aguardando'
      case 'in_progress': return 'Em Progresso'
      case 'finished': return 'Finalizada'
      default: return 'Desconhecido'
    }
  }

  const formatTimeAgo = (date: Date | string | number) => {
    const now = new Date()
    const dateObj = new Date(date)
    
    // Verificar se a data é válida
    if (isNaN(dateObj.getTime())) {
      return 'Data inválida'
    }
    
    const diffInMinutes = Math.floor((now.getTime() - dateObj.getTime()) / 60000)
    
    if (diffInMinutes < 1) return 'Agora mesmo'
    if (diffInMinutes < 60) return `${diffInMinutes}m atrás`
    
    const diffInHours = Math.floor(diffInMinutes / 60)
    if (diffInHours < 24) return `${diffInHours}h atrás`
    
    const diffInDays = Math.floor(diffInHours / 24)
    return `${diffInDays}d atrás`
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-accent flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-text-primary">
      <div className="max-w-6xl mx-auto p-4">
        {/* Header - Estilo do CombatDialog */}
        <div className="bg-gradient-to-r from-primary to-primary-dark text-white p-6 rounded-t-2xl shadow-2xl">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold flex items-center">
                <Sword className="mr-3" size={32} />
                Arena de Combate PvP
              </h1>
              <p className="text-white/80 mt-2">Escolha uma sala ou crie a sua própria arena!</p>
            </div>
            <div className="text-right">
              {/* Seleção de Personagem */}
              {characters.length > 0 && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-white/70 mb-2">
                    Escolha seu personagem:
                  </label>
                  <select
                    value={selectedCharacter?.id || ''}
                    onChange={(e) => {
                      const character = characters.find(c => c.id === e.target.value)
                      setSelectedCharacter(character || null)
                    }}
                    className="block w-full px-3 py-2 border border-white/20 rounded-md shadow-sm bg-surface/20 text-white focus:outline-none focus:ring-primary focus:border-primary"
                  >
                    {characters.map((char) => (
                      <option key={char.id} value={char.id} className="bg-surface text-text-primary">
                        {char.name} (Level {char.level}) - {char.race} {char.class}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              
              {selectedCharacter && (
                <div>
                  <div className="text-sm text-white/70">Personagem Selecionado:</div>
                  <div className="font-bold text-lg">{selectedCharacter.name}</div>
                  <div className="text-sm text-white/80">
                    Level {selectedCharacter.level} • {selectedCharacter.race} {selectedCharacter.class}
                    <br />
                    ❤️ {selectedCharacter.hp}/{selectedCharacter.maxHp} HP • 🔮 {selectedCharacter.mp}/{selectedCharacter.maxMp} MP
                    {!selectedCharacter.isAlive && (
                      <span className="text-red-400 ml-2">💀 MORTO</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="bg-surface/95 backdrop-blur-xl border border-white/20 rounded-b-2xl shadow-2xl">
          
          {/* Aviso se personagem está morto */}
          {selectedCharacter && !selectedCharacter.isAlive && (
            <div className="bg-error/20 border-b border-error/30 p-4">
              <div className="flex items-center">
                <span className="text-error text-xl mr-3">💀</span>
                <div>
                  <p className="text-error font-bold">Personagem Morto</p>
                  <p className="text-text-secondary text-sm">
                    Use uma Poção de Reviver antes de entrar em combate PvP.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Aviso se não há personagens */}
          {characters.length === 0 && (
            <div className="bg-warning/20 border-b border-warning/30 p-4">
              <div className="flex items-center">
                <span className="text-warning text-xl mr-3">⚠️</span>
                <div>
                  <p className="text-warning font-bold">Nenhum personagem encontrado</p>
                  <p className="text-text-secondary text-sm">
                    Crie um personagem primeiro para poder participar de combates PvP.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Create Room Section */}
          <div className="bg-surface/30 border-b border-white/10 p-6">
            <h2 className="text-xl font-bold text-text-primary mb-4 flex items-center">
              <Plus className="mr-2" size={24} />
              Criar Nova Sala
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Nome da Sala
                </label>
                <input
                  type="text"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  placeholder="Ex: Arena dos Campeões"
                  className="w-full px-4 py-2 bg-background/50 border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-text-primary"
                  maxLength={50}
                />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="privateRoom"
                  checked={isPrivateRoom}
                  onChange={(e) => setIsPrivateRoom(e.target.checked)}
                  className="mr-2"
                />
                <label htmlFor="privateRoom" className="text-sm text-text-secondary">
                  Sala Privada
                </label>
              </div>
              <button
                onClick={createRoom}
                disabled={!newRoomName.trim() || isCreatingRoom || !selectedCharacter || !selectedCharacter.isAlive}
                className="bg-success hover:bg-success-dark disabled:bg-surface/50 text-white px-6 py-2 rounded-lg font-bold transition-colors flex items-center justify-center"
                title={!selectedCharacter ? 'Selecione um personagem' : !selectedCharacter.isAlive ? 'Personagem deve estar vivo' : ''}
              >
                {isCreatingRoom ? (
                  <RefreshCw className="animate-spin" size={20} />
                ) : (
                  <>
                    <Plus className="mr-2" size={20} />
                    Criar Sala
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Rooms List */}
          <div className="p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-text-primary flex items-center">
                <Users className="mr-2" size={24} />
                Salas Disponíveis ({rooms.filter(r => r.status === 'waiting').length})
              </h2>
              <button
                onClick={loadRooms}
                className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm transition-colors flex items-center"
              >
                <RefreshCw className="mr-2" size={16} />
                Atualizar
              </button>
            </div>

            {rooms.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-6xl mb-4">⚔️</div>
                <h3 className="text-xl font-bold text-text-primary mb-2">Nenhuma sala encontrada</h3>
                <p className="text-text-secondary mb-6">Seja o primeiro a criar uma arena de combate!</p>
                <button
                  onClick={() => {
                    const input = document.querySelector('input[type="text"]') as HTMLInputElement
                    input?.focus()
                  }}
                  className="bg-primary hover:bg-primary-dark text-white px-6 py-3 rounded-lg font-bold transition-colors"
                >
                  Criar Primeira Sala
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {rooms.map((room) => (
                  <div
                    key={room.id}
                    className={`bg-surface/50 backdrop-blur-xl border rounded-xl p-4 transition-all hover:shadow-lg hover:border-primary/30 ${
                      room.status === 'waiting' 
                        ? 'border-success/30 hover:border-success/50' 
                        : room.status === 'in_progress'
                        ? 'border-warning/30'
                        : 'border-white/10'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1">
                        <h3 className="font-bold text-lg text-text-primary mb-1 flex items-center">
                          {room.isPrivate && <Crown className="mr-2 text-warning" size={16} />}
                          {room.name}
                        </h3>
                        <p className="text-sm text-text-secondary">
                          por {room.createdByName}
                        </p>
                      </div>
                      <span className={`px-2 py-1 rounded text-xs font-bold border ${getStatusColor(room.status)}`}>
                        {getStatusText(room.status)}
                      </span>
                    </div>

                    <div className="space-y-2 mb-4">
                      <div className="flex justify-between text-sm">
                        <span className="text-text-secondary">Jogadores:</span>
                        <span className="font-bold text-text-primary">
                          {room.playerCount}/{room.maxPlayers}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-text-secondary flex items-center">
                          <Clock className="mr-1" size={12} />
                          Criada:
                        </span>
                        <span className="text-text-secondary">
                          {formatTimeAgo(room.createdAt)}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => joinRoom(room.id)}
                      disabled={
                        room.status !== 'waiting' || 
                        room.playerCount >= room.maxPlayers || 
                        !selectedCharacter || 
                        !selectedCharacter.isAlive
                      }
                      className={`w-full py-2 px-4 rounded-lg font-bold transition-colors ${
                        room.status === 'waiting' && 
                        room.playerCount < room.maxPlayers && 
                        selectedCharacter && 
                        selectedCharacter.isAlive
                          ? 'bg-primary hover:bg-primary-dark text-white'
                          : 'bg-surface/30 text-text-secondary cursor-not-allowed'
                      }`}
                      title={
                        !selectedCharacter 
                          ? 'Selecione um personagem' 
                          : !selectedCharacter.isAlive 
                          ? 'Personagem deve estar vivo' 
                          : ''
                      }
                    >
                      {!selectedCharacter
                        ? 'Selecione Personagem'
                        : !selectedCharacter.isAlive
                        ? 'Personagem Morto'
                        : room.status === 'waiting' 
                        ? room.playerCount < room.maxPlayers 
                          ? 'Entrar na Sala'
                          : 'Sala Cheia'
                        : room.status === 'in_progress'
                        ? 'Em Combate'
                        : 'Finalizada'
                      }
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="bg-surface/30 border-t border-white/10 p-6">
            <div className="flex justify-center space-x-4">
              <button
                onClick={() => router.push('/dashboard')}
                className="bg-surface/50 hover:bg-surface/70 text-text-primary px-6 py-2 rounded-lg transition-colors flex items-center border border-white/20"
              >
                <X className="mr-2" size={16} />
                Voltar ao Dashboard
              </button>
              <button
                onClick={() => router.push('/combat')}
                className="bg-primary/20 hover:bg-primary/30 text-primary px-6 py-2 rounded-lg transition-colors flex items-center border border-primary/30"
              >
                <Shield className="mr-2" size={16} />
                Modo Treino (vs Bot)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}