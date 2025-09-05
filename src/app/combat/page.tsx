'use client'

import { useEffect, useState, useRef, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { X, Users, Sword, Shield, Zap, Heart, Sparkles } from 'lucide-react'
import { io, Socket } from 'socket.io-client'

interface Equipment {
  id: string
  name: string
  stats: {
    attack?: number
    defense?: number
    hp?: number
    mp?: number
    bonusDamage?: number
  }
  durability?: number
  maxDurability?: number
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
  attack: number
  defense: number
  strength: number
  agility: number
  intelligence: number
  resistance: number
  critical: number
  speed: number
  stamina: number
  maxStamina: number
  equipment: {
    weapon?: Equipment
    armor?: Equipment
    shield?: Equipment
  }
  isReady: boolean
  isConnected: boolean
  isAlive: boolean
}

interface CombatLogEntry {
  type: 'system' | 'action' | 'result' | 'damage' | 'victory' | 'chat'
  player?: string
  message: string
  timestamp: Date
}

interface CombatRoom {
  id: string
  creator: string
  player1: Player | null
  player2: Player | null
  currentTurn: string | null
  phase: CombatPhase
  combatLog: CombatLogEntry[]
  isActive: boolean
  pendingAction: any
  reactionPhase: boolean
  winner?: string | null
}

enum CombatPhase {
  WAITING_PLAYERS = 'waiting_players',
  INITIATIVE_ROLL = 'initiative_roll',
  PLAYER_TURN = 'player_turn',
  OPPONENT_REACTION = 'opponent_reaction',
  DICE_ROLL = 'dice_roll',
  COMBAT_END = 'combat_end'
}

enum ActionType {
  LIGHT_ATTACK = 'light_attack',
  HEAVY_ATTACK = 'heavy_attack',
  SPECIAL_ATTACK = 'special_attack',
  DODGE = 'dodge',
  DEFEND = 'defend',
  USE_ITEM = 'use_item'
}

// Função para criar conexão Socket.IO real
function createSocketConnection(): Socket {
  // URL do servidor WebSocket do Railway em produção
  const socketUrl = process.env.NODE_ENV === 'production' 
    ? (process.env.NEXT_PUBLIC_SOCKET_URL || 'https://dolrath-production.up.railway.app')
    : 'ws://localhost:3001'
    
  console.log('🔗 Conectando ao WebSocket:', socketUrl)
    
  return io(socketUrl, {
    transports: ['websocket', 'polling'],
    timeout: 20000,
    forceNew: true,
    autoConnect: true
  })
}

function CombatPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const roomId = searchParams.get('room') || 'default'
  const characterId = searchParams.get('character')
  const isRoomCreator = searchParams.get('creator') === 'true'

  const [socket] = useState(() => createSocketConnection())
  const [combatRoom, setCombatRoom] = useState<CombatRoom | null>(null)
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [newMessage, setNewMessage] = useState('')
  const [pendingAction, setPendingAction] = useState<{action: ActionType, diceType: number} | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const [showReactionButtons, setShowReactionButtons] = useState(false)
  const [hasRolledInitiative, setHasRolledInitiative] = useState(false)

  const combatLogRef = useRef<HTMLDivElement>(null)

  const opponent = combatRoom?.player1?.id === currentPlayer?.id ? combatRoom?.player2 : combatRoom?.player1
  const isMyTurn = combatRoom?.currentTurn === currentPlayer?.id
  const isWinner = combatRoom?.winner === currentPlayer?.id
  const isCreator = combatRoom?.creator === currentPlayer?.id

  // Auto scroll para o chat quando novas mensagens chegam
  useEffect(() => {
    if (combatLogRef.current && combatRoom?.combatLog) {
      const scrollToBottom = () => {
        combatLogRef.current!.scrollTop = combatLogRef.current!.scrollHeight
      }
      scrollToBottom()
    }
  }, [combatRoom?.combatLog])

  useEffect(() => {
    const initializeCombat = async () => {
      let playerData: Player

      // Configurar event listeners do Socket.IO
      socket.on('connect', () => {
        console.log('✅ Conectado ao servidor WebSocket')
        setConnectionStatus('connected')
      })

      socket.on('disconnect', () => {
        console.log('❌ Desconectado do servidor WebSocket')
        setConnectionStatus('disconnected')
      })

      socket.on('room_updated', (room: CombatRoom) => {
        console.log('🔄 Sala atualizada:', room)
        setCombatRoom(room)
        
        // Verificar se precisa mostrar botões de reação
        if (room.phase === CombatPhase.OPPONENT_REACTION && 
            room.currentTurn !== currentPlayer?.id) {
          setShowReactionButtons(true)
        } else {
          setShowReactionButtons(false)
        }

        // Reset iniciativa quando sala é resetada
        if (room.phase === CombatPhase.WAITING_PLAYERS) {
          setHasRolledInitiative(false)
        }
      })

      socket.on('room_closed', () => {
        console.log('� Sala fechada pelo criador')
        router.push('/combat-lobby')
      })

      socket.on('dice_rolled', (data: {playerId: string, sides: number, result: any}) => {
        console.log('🎲 Dado rolado:', data)
        setPendingAction(null)
      })

      socket.on('action_selected', (data: {action: ActionType, diceType: number}) => {
        console.log('🎯 Ação selecionada:', data)
        setPendingAction(data)
      })

      // Se temos characterId, carregar dados do personagem específico
      if (characterId) {
        try {
          const response = await fetch(`/api/character/${characterId}`)
          if (response.ok) {
            const charDetails = await response.json()
            playerData = {
              id: charDetails.id,
              name: charDetails.name,
              level: charDetails.level,
              race: charDetails.race || 'Humano',
              class: charDetails.class || 'Guerreiro',
              hp: charDetails.hp,
              maxHp: charDetails.maxHp,
              mp: charDetails.baseStats?.mp || 50,
              maxMp: charDetails.baseStats?.maxMp || 50,
              stamina: charDetails.stamina || 100,
              maxStamina: charDetails.maxStamina || 100,
              attack: charDetails.baseStats?.str || 10,
              defense: charDetails.baseStats?.def || 10,
              strength: charDetails.baseStats?.str || 10,
              agility: charDetails.baseStats?.agi || 10,
              intelligence: charDetails.baseStats?.int || 10,
              resistance: charDetails.baseStats?.res || 10,
              critical: charDetails.baseStats?.crit || 1.0,
              speed: charDetails.baseStats?.speed || 2.5,
              equipment: charDetails.equipment || {},
              isReady: false,
              isConnected: true,
              isAlive: charDetails.isAlive
            }
          } else {
            throw new Error('Personagem não encontrado')
          }
        } catch (error) {
          console.error('Erro ao carregar personagem:', error)
          router.push('/combat-lobby')
          return
        }
      } else {
        // Fallback para dados mock se não tiver characterId
        try {
          const response = await fetch('/api/user/profile')
          if (response.ok) {
            const userData = await response.json()
            playerData = {
              id: userData.id || 'player_' + Math.random().toString(36).substr(2, 9),
              name: userData.name || 'sgs',
              level: userData.level || 6,
              race: 'Humano',
              class: 'Guerreiro',
              hp: userData.hp || 360,
              maxHp: userData.maxHp || 360,
              mp: userData.mp || 210,
              maxMp: userData.maxMp || 210,
              stamina: 100,
              maxStamina: 100,
              attack: userData.attack || 9,
              defense: userData.defense || 10,
              strength: userData.strength || 9,
              agility: userData.agility || 5,
              intelligence: userData.intelligence || 3,
              resistance: userData.resistance || 0,
              critical: userData.critical || 1.0,
              speed: userData.speed || 2.5,
              equipment: userData.equipment || {},
              isReady: false,
              isConnected: true,
              isAlive: true
            }
          } else {
            throw new Error('API não disponível')
          }
        } catch (apiError) {
          playerData = {
            id: 'player_' + Math.random().toString(36).substr(2, 9),
            name: isCreator ? 'sgs' : 'Oponente',
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
            equipment: {},
            isReady: false,
            isConnected: true,
            isAlive: true
          }
        }
      }
      
      setCurrentPlayer(playerData)
      
      // Entrar na sala via Socket.IO
      socket.emit('join_room', { roomId, player: playerData, isCreator: isRoomCreator })
    }

    initializeCombat()

    // Cleanup dos event listeners
    return () => {
      socket.off('connect')
      socket.off('disconnect')
      socket.off('room_updated')
      socket.off('room_closed')
      socket.off('dice_rolled')
      socket.off('action_selected')
      socket.disconnect()
    }
  }, [socket, roomId, isRoomCreator, characterId])

  const toggleReady = () => {
    if (!currentPlayer) return
    setIsReady(!isReady)
    socket.emit('toggle_ready', { playerId: currentPlayer.id, roomId })
  }

  const handlePlayerAction = (action: ActionType) => {
    if (!currentPlayer) return
    
    const diceTypes = {
      [ActionType.LIGHT_ATTACK]: 6,
      [ActionType.HEAVY_ATTACK]: 10,
      [ActionType.SPECIAL_ATTACK]: 20,
      [ActionType.DODGE]: 6,
      [ActionType.DEFEND]: 6,
      [ActionType.USE_ITEM]: 4
    }

    const diceType = diceTypes[action]
    socket.emit('player_action', { 
      playerId: currentPlayer.id, 
      roomId, 
      action, 
      diceType 
    })
  }

  const handleRollDice = (sides: number) => {
    if (!pendingAction || pendingAction.diceType !== sides || !currentPlayer) return
    socket.emit('roll_dice', { 
      playerId: currentPlayer.id, 
      roomId, 
      sides, 
      action: pendingAction.action 
    })
  }

  const sendMessage = () => {
    if (newMessage.trim() && currentPlayer) {
      socket.emit('chat_message', { 
        playerId: currentPlayer.id, 
        roomId, 
        message: newMessage 
      })
      setNewMessage('')
    }
  }

  const handleOpponentReaction = (reaction: 'dodge' | 'block') => {
    if (!currentPlayer) return
    socket.emit('opponent_reaction', {
      playerId: currentPlayer.id,
      roomId,
      reaction
    })
    setShowReactionButtons(false)
  }

  const rollInitiative = () => {
    if (!currentPlayer || hasRolledInitiative) return
    socket.emit('roll_initiative', {
      playerId: currentPlayer.id,
      roomId
    })
    setHasRolledInitiative(true)
  }

  const closeRoom = () => {
    if (!currentPlayer || !isCreator) return
    socket.emit('close_room', {
      playerId: currentPlayer.id,
      roomId
    })
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-1 sm:p-2">
      <div className="bg-surface/95 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl w-full h-full sm:h-[95vh] sm:max-w-6xl flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary to-primary-dark text-white p-2 sm:p-3 rounded-t-2xl flex justify-between items-center flex-shrink-0">
          <div className="flex items-center">
            <h2 className="text-sm sm:text-lg font-bold">⚔️ Combate PvP - Sala {roomId}</h2>
            <div className={`ml-2 sm:ml-3 px-1 sm:px-2 py-1 rounded-full text-xs font-bold ${
              connectionStatus === 'connected' 
                ? 'bg-success/20 text-success border border-success/30' 
                : connectionStatus === 'connecting'
                ? 'bg-warning/20 text-warning border border-warning/30'
                : 'bg-error/20 text-error border border-error/30'
            }`}>
              <span className="hidden sm:inline">
                {connectionStatus === 'connected' ? '🟢 Conectado' : 
                 connectionStatus === 'connecting' ? '🟡 Conectando...' : '🔴 Desconectado'}
              </span>
              <span className="sm:hidden">
                {connectionStatus === 'connected' ? '🟢' : 
                 connectionStatus === 'connecting' ? '🟡' : '🔴'}
              </span>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {isCreator && (
              <button
                onClick={closeRoom}
                className="text-white/80 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
                title="Fechar sala"
              >
                🚪
              </button>
            )}
            <button
              onClick={() => router.push('/combat-lobby')}
              className="text-white/80 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
            >
              <X size={16} className="sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 flex flex-col min-h-0">
          {/* Status Panels */}
          <div className="bg-background/30 border-b border-white/10 p-2 sm:p-3 flex flex-col sm:flex-row gap-2 sm:gap-0 flex-shrink-0">
            {/* Current Player Status */}
            <div className="bg-gradient-to-br from-success/20 to-success/10 border border-success/30 rounded-xl p-2 sm:p-3 flex-1 sm:mr-3 backdrop-blur-sm">
              <h3 className="font-bold text-success mb-2 text-xs sm:text-sm">{currentPlayer?.name} (Você)</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 text-xs">
                <div className="text-text-secondary">HP: <span className="font-bold text-error">{currentPlayer?.hp}/{currentPlayer?.maxHp}</span></div>
                <div className="text-text-secondary">MP: <span className="font-bold text-blue-400">{currentPlayer?.mp}/{currentPlayer?.maxMp}</span></div>
                <div className="text-text-secondary">LVL: <span className="font-bold text-primary">{currentPlayer?.level}</span></div>
                <div className="text-text-secondary">ATK: <span className="font-bold text-text-primary">{currentPlayer?.attack}</span></div>
                <div className="text-text-secondary">DEF: <span className="font-bold text-text-primary">{currentPlayer?.defense}</span></div>
                <div className="text-text-secondary hidden sm:block">STR: <span className="font-bold text-yellow-400">{currentPlayer?.strength}</span></div>
                <div className="text-text-secondary hidden sm:block">AGI: <span className="font-bold text-cyan-400">{currentPlayer?.agility}</span></div>
                <div className="text-text-secondary hidden sm:block">INT: <span className="font-bold text-purple-400">{currentPlayer?.intelligence}</span></div>
                <div className="text-text-secondary hidden sm:block">RES: <span className="font-bold text-green-400">{currentPlayer?.resistance}</span></div>
                <div className="text-text-secondary hidden sm:block">CRIT: <span className="font-bold text-yellow-300">{currentPlayer?.critical}%</span></div>
                <div className="text-text-secondary hidden sm:block">SPD: <span className="font-bold text-emerald-400">{currentPlayer?.speed}</span></div>
              </div>
            </div>

            {/* Opponent Status */}
            <div className="bg-gradient-to-br from-error/20 to-error/10 border border-error/30 rounded-xl p-2 sm:p-3 flex-1 sm:ml-3 backdrop-blur-sm">
              {opponent ? (
                <>
                  <h3 className="font-bold text-error mb-2 text-xs sm:text-sm">{opponent.name} (Oponente)</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 text-xs">
                    <div className="text-text-secondary">HP: <span className="font-bold text-error">{opponent.hp}/{opponent.maxHp}</span></div>
                    <div className="text-text-secondary">MP: <span className="font-bold text-blue-400">{opponent.mp}/{opponent.maxMp}</span></div>
                    <div className="text-text-secondary">LVL: <span className="font-bold text-text-primary">{opponent.level}</span></div>
                    <div className="text-text-secondary">ATK: <span className="font-bold text-text-primary">{opponent.attack}</span></div>
                    <div className="text-text-secondary">DEF: <span className="font-bold text-text-primary">{opponent.defense}</span></div>
                    <div className="text-text-secondary hidden sm:block">STR: <span className="font-bold text-yellow-400">{opponent.strength}</span></div>
                    <div className="text-text-secondary hidden sm:block">AGI: <span className="font-bold text-cyan-400">{opponent.agility}</span></div>
                    <div className="text-text-secondary hidden sm:block">INT: <span className="font-bold text-purple-400">{opponent.intelligence}</span></div>
                    <div className="text-text-secondary hidden sm:block">RES: <span className="font-bold text-green-400">{opponent.resistance}</span></div>
                  </div>
                </>
              ) : (
                <div className="text-center text-text-secondary">
                  <div className="text-xl sm:text-2xl mb-2">⏳</div>
                  <div className="text-xs sm:text-sm">Aguardando oponente...</div>
                </div>
              )}
            </div>
          </div>

          {/* Combat Area */}
          <div className="flex-1 flex flex-col sm:flex-row min-h-0">
            {/* Mobile: Stack vertically, Desktop: Side by side */}
            
            {/* Chat/Log Unificado - Primeira no mobile para ficar visível */}
            <div className="order-2 sm:order-2 flex-1 sm:w-80 bg-surface/30 p-2 sm:p-4 flex flex-col min-h-0">
              <h3 className="font-bold text-text-primary mb-2 sm:mb-3 text-xs sm:text-sm text-center">💬 Chat & Log</h3>
              <div className="flex-1 bg-background/50 backdrop-blur-xl border border-white/10 rounded-xl p-2 sm:p-3 flex flex-col min-h-0">
                <div 
                  ref={combatLogRef}
                  className="flex-1 overflow-y-auto space-y-2 mb-3 min-h-[120px] sm:min-h-[160px]"
                  style={{ maxHeight: '200px' }}
                >
                  {combatRoom?.combatLog.map((log, index) => (
                    <div key={index} className={`rounded-lg p-2 ${
                      log.type === 'chat' ? 'bg-blue-500/20 border border-blue-500/30' :
                      log.type === 'system' ? 'bg-gray-500/20 border border-gray-500/30' :
                      log.type === 'action' ? 'bg-yellow-500/20 border border-yellow-500/30' :
                      log.type === 'result' ? 'bg-purple-500/20 border border-purple-500/30' :
                      log.type === 'damage' ? 'bg-red-500/20 border border-red-500/30' :
                      log.type === 'victory' ? 'bg-green-500/20 border border-green-500/30' :
                      'bg-surface/40'
                    }`}>
                      {log.player && <div className="text-xs text-text-secondary font-bold">{log.player}:</div>}
                      <div className="text-xs sm:text-sm text-text-primary break-words">{log.message}</div>
                    </div>
                  ))}
                </div>
                <div className="flex flex-shrink-0">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                    placeholder="Digite sua mensagem..."
                    className="flex-1 bg-background/50 border border-white/20 rounded-l-lg px-2 sm:px-3 py-2 text-xs sm:text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <button
                    onClick={sendMessage}
                    className="bg-primary hover:bg-primary-dark text-white px-2 sm:px-3 py-2 rounded-r-lg transition-colors text-xs sm:text-sm"
                  >
                    ➤
                  </button>
                </div>
              </div>
            </div>

            {/* Actions - Sempre visível e responsivo */}
            <div className="order-1 sm:order-3 w-full sm:w-64 bg-surface/30 p-2 sm:p-4 flex flex-col flex-shrink-0">
              <h3 className="font-bold text-text-primary mb-2 sm:mb-3 text-xs sm:text-sm text-center">🎯 Ações</h3>
              
              {showReactionButtons ? (
                <div className="space-y-3">
                  <div className="text-center">
                    <div className="text-xl sm:text-2xl mb-2">⚔️</div>
                    <div className="text-xs sm:text-sm text-text-secondary mb-3">
                      Como você vai reagir ao ataque?
                    </div>
                  </div>
                  <button
                    onClick={() => handleOpponentReaction('dodge')}
                    className="w-full py-3 sm:py-2 px-4 rounded-lg font-bold text-sm bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-blue-600 hover:to-cyan-500 text-white transition-all duration-200"
                  >
                    🏃 Esquivar
                  </button>
                  <button
                    onClick={() => handleOpponentReaction('block')}
                    className="w-full py-3 sm:py-2 px-4 rounded-lg font-bold text-sm bg-gradient-to-r from-emerald-500 to-green-600 hover:from-green-600 hover:to-emerald-500 text-white transition-all duration-200"
                  >
                    🛡️ Defender
                  </button>
                </div>
              ) : combatRoom?.phase === CombatPhase.INITIATIVE_ROLL ? (
                <div className="space-y-3">
                  <div className="text-center">
                    <div className="text-xl sm:text-2xl mb-2">🎲</div>
                    <div className="text-xs sm:text-sm text-text-secondary mb-3">
                      Role d20 para iniciativa!
                    </div>
                  </div>
                  <button
                    onClick={rollInitiative}
                    disabled={hasRolledInitiative}
                    className={`w-full py-3 sm:py-2 px-4 rounded-lg font-bold text-sm transition-all duration-200 ${
                      hasRolledInitiative
                        ? 'bg-gray-600 text-white cursor-not-allowed opacity-50'
                        : 'bg-gradient-to-r from-pink-500 to-purple-600 hover:from-purple-600 hover:to-pink-500 text-white hover:shadow-lg'
                    }`}
                  >
                    {hasRolledInitiative ? '✅ Já rolou!' : '🎲 Rolar d20'}
                  </button>
                </div>
              ) : !combatRoom?.isActive ? (
                <div className="space-y-3">
                  <div className="text-center">
                    <div className="text-xl sm:text-2xl mb-2">⏳</div>
                    <div className="text-xs sm:text-sm text-text-secondary mb-3">
                      {!opponent ? 'Aguardando oponente...' : 'Preparando para o combate...'}
                    </div>
                  </div>
                  {opponent && (
                    <button
                      onClick={toggleReady}
                      className={`w-full py-3 sm:py-2 px-4 rounded-lg font-bold text-sm sm:text-sm transition-all duration-200 ${
                        isReady 
                          ? 'bg-success text-white' 
                          : 'bg-gradient-to-r from-primary to-primary-dark text-white hover:shadow-lg hover:shadow-primary/25'
                      }`}
                    >
                      {isReady ? '✅ Pronto!' : '🏁 Ficar Pronto'}
                    </button>
                  )}
                </div>
              ) : combatRoom?.phase === CombatPhase.COMBAT_END ? (
                <div className="text-center space-y-4">
                  <div className={`text-xl sm:text-2xl font-bold ${isWinner ? 'text-success' : 'text-error'}`}>
                    {isWinner ? '🏆 VITÓRIA!' : '💀 DERROTA!'}
                  </div>
                  <button
                    onClick={() => router.push('/combat-lobby')}
                    className="bg-primary hover:bg-primary-dark text-white px-6 py-2 rounded-lg w-full transition-colors"
                  >
                    Voltar ao Lobby
                  </button>
                </div>
              ) : isMyTurn && combatRoom?.phase === CombatPhase.PLAYER_TURN ? (
                <div className="space-y-2">
                  <button
                    onClick={() => handlePlayerAction(ActionType.LIGHT_ATTACK)}
                    className="w-full bg-gradient-to-r from-warning to-yellow-500 hover:from-yellow-500 hover:to-warning text-white py-2 sm:py-2 px-4 rounded-lg font-bold text-xs sm:text-sm transition-all duration-200 transform hover:scale-[1.02] shadow-lg"
                  >
                    👊 Ataque Leve (d6)
                  </button>
                  <button
                    onClick={() => handlePlayerAction(ActionType.HEAVY_ATTACK)}
                    className="w-full bg-gradient-to-r from-error to-red-600 hover:from-red-600 hover:to-error text-white py-2 sm:py-2 px-4 rounded-lg font-bold text-xs sm:text-sm transition-all duration-200 transform hover:scale-[1.02] shadow-lg"
                  >
                    ⚔️ Ataque Pesado (d10)
                  </button>
                  <button
                    onClick={() => handlePlayerAction(ActionType.SPECIAL_ATTACK)}
                    disabled={!currentPlayer || currentPlayer.mp < 15}
                    className="w-full bg-gradient-to-r from-primary to-primary-dark hover:shadow-lg hover:shadow-primary/25 disabled:from-gray-600 disabled:to-gray-700 disabled:opacity-50 text-white py-2 sm:py-2 px-4 rounded-lg font-bold text-xs sm:text-sm transition-all duration-200 transform hover:scale-[1.02] shadow-lg disabled:hover:scale-100"
                  >
                    ✨ Especial (d20, 15🔮)
                  </button>
                  
                  <div className="border-t border-white/10 my-3"></div>
                  
                  <button
                    onClick={() => handlePlayerAction(ActionType.USE_ITEM)}
                    className="w-full bg-gradient-to-r from-success to-emerald-600 hover:from-emerald-600 hover:to-success text-white py-2 sm:py-2 px-4 rounded-lg font-bold text-xs sm:text-sm transition-all duration-200 transform hover:scale-[1.02] shadow-lg"
                  >
                    🧪 Consumíveis
                  </button>
                </div>
              ) : (
                <div className="text-center text-text-secondary font-bold text-xs flex-1 flex items-center justify-center">
                  {!isMyTurn ? '⏳ Turno do oponente...' : '⚔️ Executando ação...'}
                </div>
              )}
            </div>

            {/* Combat Log removido - agora tudo está unificado no chat */}
          </div>

          {/* Dice Panel */}
          {combatRoom?.phase === CombatPhase.DICE_ROLL && isMyTurn && (
            <div className="bg-gradient-to-br from-surface/95 to-background/90 backdrop-blur-md border-t border-white/10 p-2 sm:p-3 flex-shrink-0">
              <h3 className="text-text-primary font-bold text-center mb-2 text-xs sm:text-sm">🎲 Role o Dado</h3>
              <div className="flex justify-center space-x-2 sm:space-x-3 flex-wrap">
                {[4, 6, 8, 10, 12, 20].map((sides) => (
                  <button
                    key={sides}
                    onClick={() => handleRollDice(sides)}
                    disabled={pendingAction?.diceType !== sides}
                    className={`
                      w-10 h-10 sm:w-12 sm:h-12 rounded-lg text-white font-bold text-xs
                      transition-all duration-200 transform
                      ${pendingAction?.diceType === sides 
                        ? 'hover:scale-110 cursor-pointer bg-primary' 
                        : 'opacity-50 cursor-not-allowed bg-gray-600'
                      }
                    `}
                  >
                    d{sides}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function CombatPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Carregando combate...</div>
      </div>
    }>
      <CombatPageContent />
    </Suspense>
  )
}
