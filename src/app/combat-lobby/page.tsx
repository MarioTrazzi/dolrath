'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Users, Sword, Plus, RefreshCw, Crown, Clock, X, Shield } from 'lucide-react'
import ArenaBackdrop from '@/components/combat/ArenaBackdrop'
import { useActiveCharacter } from '@/components/providers/ActiveCharacterProvider'
import { GOLD, GOLD_BRIGHT, PANEL_BG, TITLEBAR_BG, BEVEL_BTN_CLASS, BEVEL_COLOR_BTN_CLASS, BEVEL_VARIANTS } from '@/components/crafting/bdoTheme'
import { TRAINING_OPPONENTS } from '@/lib/trainingOpponents'

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
  // Nova estrutura para participants
  participants?: {
    fighters: Array<{id: string, name: string, role: string}>
    spectators: Array<{id: string, name: string, role: string}>
    moderators: Array<{id: string, name: string, role: string}>
  }
}

// Enum para roles
enum RoomRole {
  FIGHTER = 'fighter',
  SPECTATOR = 'spectator', 
  MODERATOR = 'moderator'
}

// Limites por role
const ROLE_LIMITS = {
  [RoomRole.FIGHTER]: 2,
  [RoomRole.SPECTATOR]: 8,
  [RoomRole.MODERATOR]: 2
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
  // Herói ATIVO global (navbar): a arena PvP usa sempre o personagem selecionado.
  const { activeCharacterId } = useActiveCharacter()
  const [isLoading, setIsLoading] = useState(true)
  const [characters, setCharacters] = useState<Player[]>([])
  const [selectedCharacter, setSelectedCharacter] = useState<Player | null>(null)
  const [rooms, setRooms] = useState<CombatRoom[]>([])
  const [isCreatingRoom, setIsCreatingRoom] = useState(false)
  const [newRoomName, setNewRoomName] = useState('')
  const [isPrivateRoom, setIsPrivateRoom] = useState(false)
  const [selectedRole, setSelectedRole] = useState<RoomRole>(RoomRole.FIGHTER)
  const [showRoleSelector, setShowRoleSelector] = useState<string | null>(null)
  const [showTrainingPicker, setShowTrainingPicker] = useState(false)

  useEffect(() => {
    checkAuthAndLoadData()
  }, [])

  // Sincroniza a seleção com o herói ativo do contexto (navbar), quando existir.
  useEffect(() => {
    if (characters.length === 0) return
    const match = characters.find((c) => c.id === activeCharacterId)
    if (match) setSelectedCharacter(match)
  }, [activeCharacterId, characters])

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
        // Não carregar salas mock - apenas deixar vazio se a API falhar
        setRooms([])
      }
    } catch (error) {
      console.error('Erro ao carregar salas:', error)
      // Não carregar salas mock em caso de erro - apenas deixar vazio
      setRooms([])
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

  const joinRoom = (roomId: string, role: RoomRole = RoomRole.FIGHTER) => {
    if (!selectedCharacter) return
    router.push(`/combat?room=${roomId}&character=${selectedCharacter.id}&role=${role}`)
  }

  const startTraining = (monsterKey: string) => {
    if (!selectedCharacter) return
    const roomId = 'treino_' + Math.random().toString(36).substr(2, 9)
    router.push(`/combat?room=${roomId}&creator=true&character=${selectedCharacter.id}&training=true&monster=${monsterKey}`)
  }

  const getRoleDisplayName = (role: RoomRole) => {
    switch (role) {
      case RoomRole.FIGHTER: return '⚔️ Lutador'
      case RoomRole.SPECTATOR: return '👁️ Espectador'
      case RoomRole.MODERATOR: return '🛡️ Moderador'
      default: return role
    }
  }

  const getRoleDescription = (role: RoomRole) => {
    switch (role) {
      case RoomRole.FIGHTER: return 'Participa do combate (máx. 2)'
      case RoomRole.SPECTATOR: return 'Assiste ao combate (máx. 8)'
      case RoomRole.MODERATOR: return 'Controla a sala (máx. 2) - Em breve'
      default: return ''
    }
  }

  const getAvailableRoles = (room: CombatRoom): RoomRole[] => {
    const available: RoomRole[] = []
    
    if (!room.participants) {
      // Sala antiga sem estrutura de participants - assumir que fighters estão disponíveis se não estiver cheia
      if (room.playerCount < 2) available.push(RoomRole.FIGHTER)
      available.push(RoomRole.SPECTATOR) // Sempre permitir espectador em salas antigas
      return available
    }

    // Nova estrutura com participants
    if (room.participants.fighters.length < ROLE_LIMITS[RoomRole.FIGHTER]) {
      available.push(RoomRole.FIGHTER)
    }
    if (room.participants.spectators.length < ROLE_LIMITS[RoomRole.SPECTATOR]) {
      available.push(RoomRole.SPECTATOR)
    }
    // Moderador desabilitado por enquanto
    // if (room.participants.moderators.length < ROLE_LIMITS[RoomRole.MODERATOR]) {
    //   available.push(RoomRole.MODERATOR)
    // }
    
    return available
  }

  const getTotalParticipants = (room: CombatRoom): number => {
    if (!room.participants) return room.playerCount
    
    return room.participants.fighters.length + 
           room.participants.spectators.length + 
           room.participants.moderators.length
  }

  const getMaxParticipants = (): number => {
    return ROLE_LIMITS[RoomRole.FIGHTER] + 
           ROLE_LIMITS[RoomRole.SPECTATOR] + 
           ROLE_LIMITS[RoomRole.MODERATOR]
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'waiting': return 'text-emerald-300 bg-emerald-950/50 border-emerald-700/60'
      case 'in_progress': return 'text-[#e7c682] bg-[#241f16] border-[#8a6d3b]/60'
      case 'finished': return 'text-[#8a8a90] bg-[#1a1a1d] border-[#3c3c41]'
      default: return 'text-[#8a8a90] bg-[#1a1a1d] border-[#3c3c41]'
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
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="relative min-h-[100dvh] text-white overflow-hidden">
      {/* Cenário animado da arena (igual às masmorras) */}
      <div className="fixed inset-0 z-0">
        <ArenaBackdrop />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto p-4 sm:p-6" style={{ fontFamily: "'Barlow', sans-serif" }}>
        {/* Janela chumbo: barra de título + cabeçalho. Layout fixo (linha com wrap),
            sem re-alinhamento entre breakpoints. */}
        <div className="overflow-hidden rounded-t-[4px] border border-b-0 border-[#46464c] shadow-2xl shadow-black/60" style={{ background: PANEL_BG }}>
          <div className="flex items-center gap-2 px-4 py-2.5" style={{ background: TITLEBAR_BG, borderBottom: '1px solid rgba(0,0,0,0.7)' }}>
            <Sword size={17} style={{ color: GOLD }} />
            <span className="text-[15px] font-semibold tracking-wide text-[#dcdce0]">Arena de Combate PvP</span>
          </div>

          <div className="flex flex-row flex-wrap items-start justify-between gap-4 p-5">
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-black text-[#ece7da]" style={{ letterSpacing: '0.5px' }}>
                Escolha sua arena
              </h1>
              <p className="text-[#8a8a90] mt-1 text-sm">Entre numa sala existente ou crie a sua própria!</p>
            </div>
            {/* Personagem ativo (definido na navbar — sem seletor aqui) */}
            {selectedCharacter && (
              <div className="inline-flex flex-col items-start rounded-[3px] border border-[#46464c] bg-[#19191c] px-4 py-2.5">
                <div className="font-bold text-lg text-[#ece7da]">{selectedCharacter.name}</div>
                <div className="text-sm text-[#8a8a90]">
                  Nv.{selectedCharacter.level} • {selectedCharacter.race} {selectedCharacter.class}
                </div>
                <div className="text-sm text-[#c9c9ce] flex items-center gap-3 mt-0.5 tabular-nums">
                  <span>❤️ {selectedCharacter.hp}/{selectedCharacter.maxHp}</span>
                  <span>🔮 {selectedCharacter.mp}/{selectedCharacter.maxMp}</span>
                  {!selectedCharacter.isAlive && (
                    <span className="text-red-400 font-bold">💀 MORTO</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-b-[4px] border border-t border-[#46464c] shadow-2xl shadow-black/60" style={{ background: PANEL_BG, borderTopColor: 'rgba(0,0,0,0.6)' }}>

          {/* Aviso se personagem está morto */}
          {selectedCharacter && !selectedCharacter.isAlive && (
            <div className="border-b border-red-900/70 bg-red-950/40 p-4">
              <div className="flex items-center">
                <span className="text-xl mr-3">💀</span>
                <div>
                  <p className="text-red-300 font-bold">Personagem Morto</p>
                  <p className="text-[#8a8a90] text-sm">
                    Use uma Poção de Reviver antes de entrar em combate PvP.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Aviso se não há personagens */}
          {characters.length === 0 && (
            <div className="border-b p-4" style={{ borderColor: 'rgba(224,154,58,0.4)', background: 'rgba(58,45,22,0.5)' }}>
              <div className="flex items-center">
                <span className="text-xl mr-3">⚠️</span>
                <div>
                  <p className="font-bold" style={{ color: '#e09a3a' }}>Nenhum personagem encontrado</p>
                  <p className="text-[#8a8a90] text-sm">
                    Crie um personagem primeiro para poder participar de combates PvP.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Create Room Section */}
          <div className="border-b border-black/60 bg-[#19191c] p-6">
            <h2 className="text-lg font-semibold text-[#dcdce0] mb-4 flex items-center tracking-wide">
              <Plus className="mr-2" size={20} style={{ color: GOLD }} />
              Criar Nova Sala
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div className="md:col-span-2">
                <label className="block text-[11px] uppercase tracking-[0.14em] text-[#77777d] mb-2">
                  Nome da Sala
                </label>
                <input
                  type="text"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  placeholder="Ex: Arena dos Campeões"
                  className="w-full rounded-[3px] border border-[#3c3c41] bg-[#101013] px-4 py-2 text-[#ece7da] outline-none transition-colors focus:border-[#8a6d3b]"
                  maxLength={50}
                />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="privateRoom"
                  checked={isPrivateRoom}
                  onChange={(e) => setIsPrivateRoom(e.target.checked)}
                  className="mr-2 accent-[#c9a25f]"
                />
                <label htmlFor="privateRoom" className="text-sm text-[#c9c9ce]">
                  Sala Privada
                </label>
              </div>
              <button
                onClick={createRoom}
                disabled={!newRoomName.trim() || isCreatingRoom || !selectedCharacter || !selectedCharacter.isAlive}
                className={`${BEVEL_COLOR_BTN_CLASS} px-6 py-2 flex items-center justify-center disabled:cursor-not-allowed disabled:opacity-40`}
                style={BEVEL_VARIANTS.gold}
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
              <h2 className="text-lg font-semibold text-[#dcdce0] flex items-center tracking-wide">
                <Users className="mr-2" size={20} style={{ color: GOLD }} />
                Salas Disponíveis ({rooms.filter(r => r.status === 'waiting').length})
              </h2>
              <button
                onClick={loadRooms}
                className={`${BEVEL_BTN_CLASS} px-4 py-2 text-sm flex items-center`}
              >
                <RefreshCw className="mr-2" size={16} />
                Atualizar
              </button>
            </div>

            {rooms.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-6xl mb-4">⚔️</div>
                <h3 className="text-xl font-bold text-[#ece7da] mb-2">Nenhuma sala encontrada</h3>
                <p className="text-[#8a8a90] mb-6">Seja o primeiro a criar uma arena de combate!</p>
                <button
                  onClick={() => {
                    const input = document.querySelector('input[type="text"]') as HTMLInputElement
                    input?.focus()
                  }}
                  className={`${BEVEL_COLOR_BTN_CLASS} px-6 py-3`}
                  style={BEVEL_VARIANTS.gold}
                >
                  Criar Primeira Sala
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {rooms.map((room) => (
                  <div
                    key={room.id}
                    className={`rounded-[4px] border p-4 transition-all hover:shadow-lg ${
                      room.status === 'waiting'
                        ? 'border-emerald-700/60 hover:border-emerald-500/70'
                        : room.status === 'in_progress'
                        ? 'border-[#8a6d3b]/60'
                        : 'border-[#3c3c41]'
                    }`}
                    style={{ background: 'linear-gradient(160deg, #232327, #101013)' }}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1">
                        <h3 className="font-bold text-lg text-[#ece7da] mb-1 flex items-center">
                          {room.isPrivate && <Crown className="mr-2" size={16} style={{ color: GOLD }} />}
                          {room.name}
                        </h3>
                        <p className="text-sm text-[#8a8a90]">
                          por {room.createdByName}
                        </p>
                      </div>
                      <span className={`px-2 py-1 rounded-[3px] text-xs font-bold border ${getStatusColor(room.status)}`}>
                        {getStatusText(room.status)}
                      </span>
                    </div>

                    <div className="space-y-2 mb-4">
                      <div className="flex justify-between text-sm">
                        <span className="text-[#8a8a90]">Participantes:</span>
                        <span className="font-bold tabular-nums text-[#ece7da]">
                          {getTotalParticipants(room)}/{getMaxParticipants()}
                        </span>
                      </div>
                      {room.participants && (
                        <div className="text-xs space-y-1">
                          <div className="flex justify-between">
                            <span className="text-[#8a8a90]">⚔️ Lutadores:</span>
                            <span className="tabular-nums text-[#c9c9ce]">{room.participants.fighters.length}/{ROLE_LIMITS[RoomRole.FIGHTER]}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#8a8a90]">👁️ Espectadores:</span>
                            <span className="tabular-nums text-[#c9c9ce]">{room.participants.spectators.length}/{ROLE_LIMITS[RoomRole.SPECTATOR]}</span>
                          </div>
                        </div>
                      )}
                      <div className="flex justify-between text-sm">
                        <span className="text-[#8a8a90] flex items-center">
                          <Clock className="mr-1" size={12} />
                          Criada:
                        </span>
                        <span className="text-[#8a8a90]">
                          {formatTimeAgo(room.createdAt)}
                        </span>
                      </div>
                    </div>

                    {/* Role Selector */}
                    {showRoleSelector === room.id ? (
                      <div className="space-y-2 mb-4 p-3 rounded-[3px] border border-[#8a6d3b]/60 bg-[#19191c]">
                        <h4 className="text-sm font-bold text-[#dcdce0] text-center">Escolha seu role:</h4>
                        <div className="space-y-2">
                          {getAvailableRoles(room).map(role => (
                            <button
                              key={role}
                              onClick={() => {
                                setSelectedRole(role)
                                setShowRoleSelector(null)
                                joinRoom(room.id, role)
                              }}
                              disabled={role === RoomRole.MODERATOR}
                              className={`w-full p-2 rounded-[3px] text-left text-sm transition-colors border ${
                                role === RoomRole.MODERATOR
                                  ? 'border-[#3c3c41] bg-[#1a1a1d] text-[#57575c] cursor-not-allowed'
                                  : 'border-[#46464c] bg-gradient-to-b from-[#2b2b2f] to-[#1c1c1f] text-[#dcdce0] hover:border-[#8a6d3b]'
                              }`}
                            >
                              <div className="font-bold">{getRoleDisplayName(role)}</div>
                              <div className="text-xs text-[#8a8a90]">{getRoleDescription(role)}</div>
                            </button>
                          ))}
                        </div>
                        <button
                          onClick={() => setShowRoleSelector(null)}
                          className="w-full py-1 px-3 text-xs text-[#8a8a90] rounded-[3px] transition-colors hover:text-white"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          if (getAvailableRoles(room).length === 0) return
                          if (getAvailableRoles(room).length === 1) {
                            // Se só tem um role disponível, entrar diretamente
                            joinRoom(room.id, getAvailableRoles(room)[0])
                          } else {
                            // Se tem múltiplos roles, mostrar seletor
                            setShowRoleSelector(room.id)
                          }
                        }}
                        disabled={
                          room.status !== 'waiting' || 
                          getAvailableRoles(room).length === 0 ||
                          !selectedCharacter || 
                          !selectedCharacter.isAlive
                        }
                        className={`w-full py-2 px-4 rounded-[3px] border font-semibold tracking-wide transition-all ${
                          room.status === 'waiting' &&
                          getAvailableRoles(room).length > 0 &&
                          selectedCharacter &&
                          selectedCharacter.isAlive
                            ? 'border-[#8a6d3b] bg-gradient-to-b from-[#3a3325] to-[#241f16] text-[#e7c682] shadow-[inset_0_1px_0_rgba(231,198,130,0.25)] hover:border-[#c9a25f] hover:brightness-125'
                            : 'border-[#3c3c41] bg-[#1a1a1d] text-[#57575c] cursor-not-allowed'
                        }`}
                        title={
                          !selectedCharacter 
                            ? 'Selecione um personagem' 
                            : !selectedCharacter.isAlive 
                            ? 'Personagem deve estar vivo'
                            : getAvailableRoles(room).length === 0
                            ? 'Todos os roles estão cheios'
                            : ''
                        }
                      >
                        {!selectedCharacter
                          ? 'Selecione Personagem'
                          : !selectedCharacter.isAlive
                          ? 'Personagem Morto'
                          : room.status === 'waiting' 
                          ? getAvailableRoles(room).length > 0
                            ? getAvailableRoles(room).length === 1
                              ? `Entrar como ${getRoleDisplayName(getAvailableRoles(room)[0])}`
                              : 'Escolher Role'
                            : 'Sala Cheia'
                          : room.status === 'in_progress'
                          ? 'Em Combate'
                          : 'Finalizada'
                        }
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 🐉 Modo Treino */}
          <div className="border-t border-black/60 bg-[#19191c] p-6">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-lg font-semibold text-[#dcdce0] flex items-center tracking-wide">
                <Shield className="mr-2" size={20} style={{ color: GOLD }} />
                🏟️ Modo Treino
              </h2>
              <button
                onClick={() => setShowTrainingPicker(!showTrainingPicker)}
                disabled={!selectedCharacter || !selectedCharacter.isAlive}
                className={`${BEVEL_COLOR_BTN_CLASS} px-6 py-2 flex items-center disabled:cursor-not-allowed disabled:opacity-40`}
                style={BEVEL_VARIANTS.purple}
                title={!selectedCharacter ? 'Selecione um personagem' : !selectedCharacter.isAlive ? 'Personagem deve estar vivo' : ''}
              >
                {showTrainingPicker ? 'Fechar' : '🐉 Escolher Monstro'}
              </button>
            </div>
            <p className="text-sm text-[#8a8a90] mb-4">
              Treino na mesma arena PvP. O adversário é um <span className="text-[#c9b896]">espelho seu</span> —
              mesmo nível, mesmos atributos, mesmo equipamento. A dificuldade é o quanto ele te supera,
              então o desafio vale o mesmo em qualquer ponto da progressão. Sem recompensas.
            </p>

            {showTrainingPicker && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {TRAINING_OPPONENTS.map((m) => (
                  <button
                    key={m.key}
                    onClick={() => startTraining(m.key)}
                    className={`relative aspect-[3/4] rounded-[3px] border overflow-hidden group transition-all ${
                      m.unbeatable
                        ? 'border-fuchsia-700/60 hover:border-fuchsia-500'
                        : 'border-[#3c3c41] hover:border-[#8a6d3b]'
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={m.image}
                      alt={m.name}
                      className="absolute inset-0 h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
                      onError={(e) => {
                        const el = e.currentTarget
                        el.style.display = 'none'
                        const sib = el.nextElementSibling as HTMLElement | null
                        if (sib) sib.style.display = 'flex'
                      }}
                    />
                    <span className="hidden absolute inset-0 items-center justify-center bg-[#151518] text-5xl">{m.emoji}</span>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 p-2.5 text-center">
                      <div className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${
                        m.difficultyLabel === 'Fácil' ? 'text-green-300'
                        : m.difficultyLabel === 'Médio' ? 'text-yellow-300'
                        : m.difficultyLabel === 'Difícil' ? 'text-orange-300'
                        : m.difficultyLabel === 'Muito difícil' ? 'text-red-300'
                        : 'text-fuchsia-200'
                      }`}>
                        {m.difficultyLabel}
                      </div>
                      <div className="font-bold text-[#ece7da] text-sm leading-tight drop-shadow">{m.name}</div>
                      {/* O rótulo vira promessa verificável: o mult e a chance saem do
                          training-peer-sim, medidos com o motor de combate real. */}
                      <div className="mt-1 text-[9px] text-[#a8a29a] tabular-nums">
                        {Math.round(m.difficultyMult * 100)}% do seu poder · vitória {m.winRateLabel}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="border-t border-black/60 p-6">
            <div className="flex justify-center space-x-4">
              <button
                onClick={() => router.push('/dashboard')}
                className={`${BEVEL_BTN_CLASS} px-6 py-2 flex items-center`}
              >
                <X className="mr-2" size={16} />
                Voltar ao Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}