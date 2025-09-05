'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
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
  creator?: string
  player1: Player | null
  player2: Player | null
  currentTurn: string | null
  phase: CombatPhase
  combatLog: CombatLogEntry[]
  isActive: boolean
  pendingAction?: any
  reactionPhase?: boolean
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
    forceNew: true
  })
}

export default function CombatPage() {
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
  const [pendingDefense, setPendingDefense] = useState<{reaction: string, diceType: number} | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
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
        console.log('🏠 Sala atualizada:', room)
        setCombatRoom(room)
        
        // Reset initiative quando uma nova room é criada
        if (room.phase === CombatPhase.WAITING_PLAYERS || room.phase === CombatPhase.INITIATIVE_ROLL) {
          setHasRolledInitiative(false)
        }
        
        // Limpar estados pendentes quando mudança de fase
        if (room.phase === CombatPhase.PLAYER_TURN) {
          setPendingAction(null)
          setPendingDefense(null)
        }
      })

      socket.on('dice_rolled', (data: {playerId: string, sides: number, result: any}) => {
        console.log('🎲 Dado rolado:', data)
        setPendingAction(null)
        setPendingDefense(null)
      })

      socket.on('action_selected', (data: {action: ActionType, diceType: number}) => {
        console.log('🎯 Ação selecionada:', data)
        setPendingAction(data)
      })

      try {
        const response = await fetch('/api/user/profile')
        if (response.ok) {
          const userData = await response.json()
          playerData = {
            id: userData.id || 'player_' + Math.random().toString(36).substr(2, 9),
            name: userData.name || 'sgs',
            level: userData.level || 6,
            race: userData.race || 'Humano',
            class: userData.class || 'Guerreiro',
            hp: userData.hp || 360,
            maxHp: userData.maxHp || 360,
            mp: userData.mp || 210,
            maxMp: userData.maxMp || 210,
            attack: userData.attack || 9,
            defense: userData.defense || 10,
            strength: userData.strength || 9,
            agility: userData.agility || 5,
            intelligence: userData.intelligence || 3,
            resistance: userData.resistance || 0,
            critical: userData.critical || 1.0,
            speed: userData.speed || 2.5,
            stamina: userData.stamina || 100,
            maxStamina: userData.maxStamina || 100,
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
          name: isRoomCreator ? 'sgs' : 'Oponente',
          level: 6,
          race: 'Humano',
          class: 'Guerreiro',
          hp: 360,
          maxHp: 360,
          mp: 210,
          maxMp: 210,
          attack: 9,
          defense: 10,
          strength: 9,
          agility: 5,
          intelligence: 3,
          resistance: 0,
          critical: 1.0,
          speed: 2.5,
          stamina: 100,
          maxStamina: 100,
          equipment: {},
          isReady: false,
          isConnected: true,
          isAlive: true
        }
      }
      
      setCurrentPlayer(playerData)
      
      // Entrar na sala com dados corretos
      socket.emit('join_room', { roomId, player: playerData, isCreator: isRoomCreator })

      // Cleanup
      return () => {
        socket.off('connect')
        socket.off('disconnect')
        socket.off('room_updated')
        socket.off('dice_rolled')
        socket.off('action_selected')
      }
    }

    initializeCombat()
  }, [socket, roomId, isRoomCreator])

  const toggleReady = () => {
    if (!currentPlayer) return
    setIsReady(!isReady)
    socket.emit('toggle_ready', { playerId: currentPlayer.id, roomId })
  }

  const rollInitiative = () => {
    if (!currentPlayer || hasRolledInitiative) return
    setHasRolledInitiative(true)
    socket.emit('roll_initiative', { playerId: currentPlayer.id, roomId })
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
    setPendingAction({ action, diceType })
    socket.emit('player_action', { 
      playerId: currentPlayer.id, 
      roomId, 
      action, 
      diceType 
    })
  }

  const handleRollDice = (sides: number) => {
    if (!currentPlayer) return
    
    if (pendingAction && pendingAction.diceType === sides) {
      // Atacante rolando dado
      socket.emit('roll_dice', { 
        playerId: currentPlayer.id, 
        roomId, 
        sides, 
        action: pendingAction.action 
      })
      setPendingAction(null)
    } else if (pendingDefense && pendingDefense.diceType === sides) {
      // Defensor rolando dado
      socket.emit('roll_defense', { 
        playerId: currentPlayer.id, 
        roomId, 
        sides
      })
      setPendingDefense(null)
    }
  }

  const handleDefenseChoice = (reaction: string) => {
    if (!currentPlayer) return
    
    // Usar d6 para defesa sempre, independente do ataque
    const defenseDiceType = 6
    setPendingDefense({ reaction, diceType: defenseDiceType })
    socket.emit('opponent_reaction', { 
      playerId: currentPlayer.id, 
      roomId, 
      reaction,
      diceType: defenseDiceType
    })
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-2">
      <div className="bg-surface/95 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl w-full max-w-6xl h-[95vh] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary to-primary-dark text-white p-3 rounded-t-2xl flex justify-between items-center flex-shrink-0">
          <h2 className="text-lg font-bold">⚔️ Combate PvP - Sala {roomId}</h2>
          <button
            onClick={() => router.push('/combat-lobby')}
            className="text-white/80 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 flex flex-col min-h-0">
          {/* Status Panels */}
          <div className="bg-background/30 border-b border-white/10 p-3 flex justify-between flex-shrink-0">
            {/* Current Player Status */}
            <div className="bg-gradient-to-br from-success/20 to-success/10 border border-success/30 rounded-xl p-3 flex-1 mr-3 backdrop-blur-sm">
              <h3 className="font-bold text-success mb-2 text-sm">{currentPlayer?.name} (Você)</h3>
              <div className="grid grid-cols-3 gap-1 text-xs">
                <div className="text-text-secondary">HP: <span className="font-bold text-error">{currentPlayer?.hp}/{currentPlayer?.maxHp}</span></div>
                <div className="text-text-secondary">MP: <span className="font-bold text-blue-400">{currentPlayer?.mp}/{currentPlayer?.maxMp}</span></div>
                <div className="text-text-secondary">LVL: <span className="font-bold text-primary">{currentPlayer?.level}</span></div>
                <div className="text-text-secondary">ATK: <span className="font-bold text-text-primary">{currentPlayer?.attack}</span></div>
                <div className="text-text-secondary">DEF: <span className="font-bold text-text-primary">{currentPlayer?.defense}</span></div>
                <div className="text-text-secondary">STR: <span className="font-bold text-yellow-400">{currentPlayer?.strength}</span></div>
                <div className="text-text-secondary">AGI: <span className="font-bold text-cyan-400">{currentPlayer?.agility}</span></div>
                <div className="text-text-secondary">INT: <span className="font-bold text-purple-400">{currentPlayer?.intelligence}</span></div>
                <div className="text-text-secondary">RES: <span className="font-bold text-green-400">{currentPlayer?.resistance}</span></div>
                <div className="text-text-secondary">CRIT: <span className="font-bold text-yellow-300">{currentPlayer?.critical}%</span></div>
                <div className="text-text-secondary">SPD: <span className="font-bold text-emerald-400">{currentPlayer?.speed}</span></div>
              </div>
            </div>

            {/* Opponent Status */}
            <div className="bg-gradient-to-br from-error/20 to-error/10 border border-error/30 rounded-xl p-3 flex-1 ml-3 backdrop-blur-sm">
              {opponent ? (
                <>
                  <h3 className="font-bold text-error mb-2 text-sm">{opponent.name} (Oponente)</h3>
                  <div className="grid grid-cols-3 gap-1 text-xs">
                    <div className="text-text-secondary">HP: <span className="font-bold text-error">{opponent.hp}/{opponent.maxHp}</span></div>
                    <div className="text-text-secondary">MP: <span className="font-bold text-blue-400">{opponent.mp}/{opponent.maxMp}</span></div>
                    <div className="text-text-secondary">LVL: <span className="font-bold text-text-primary">{opponent.level}</span></div>
                    <div className="text-text-secondary">ATK: <span className="font-bold text-text-primary">{opponent.attack}</span></div>
                    <div className="text-text-secondary">DEF: <span className="font-bold text-text-primary">{opponent.defense}</span></div>
                    <div className="text-text-secondary">STR: <span className="font-bold text-yellow-400">{opponent.strength}</span></div>
                    <div className="text-text-secondary">AGI: <span className="font-bold text-cyan-400">{opponent.agility}</span></div>
                    <div className="text-text-secondary">INT: <span className="font-bold text-purple-400">{opponent.intelligence}</span></div>
                    <div className="text-text-secondary">RES: <span className="font-bold text-green-400">{opponent.resistance}</span></div>
                  </div>
                </>
              ) : (
                <div className="text-center text-text-secondary">
                  <div className="text-2xl mb-2">⏳</div>
                  <div className="text-sm">Aguardando oponente...</div>
                </div>
              )}
            </div>
          </div>

          {/* Combat Area */}
          <div className="flex-1 flex min-h-0">
            {/* Combat Log - Expandido */}
            <div className="flex-1 bg-background/20 p-4">
              <div className="bg-background/50 backdrop-blur-xl border border-white/10 rounded-xl p-4 h-full">
                <h3 className="font-bold text-text-primary mb-3 text-center text-sm">⚔️ Log de Combate</h3>
                <div 
                  ref={combatLogRef}
                  className="h-full overflow-y-auto combat-chat-scroll p-3 space-y-2 bg-surface/30 rounded-lg border border-white/5"
                >
                  {combatRoom?.combatLog.map((log, index) => (
                    <div key={index} className="text-text-secondary text-xs leading-relaxed">
                      {log.message}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Actions - Lado direito */}
            <div className="w-64 bg-surface/30 p-4 flex flex-col">
              <h3 className="font-bold text-text-primary mb-3 text-sm text-center">🎯 Ações</h3>
              
              {!combatRoom?.isActive ? (
                <div className="space-y-3">
                  <div className="text-center">
                    <div className="text-2xl mb-2">⏳</div>
                    <div className="text-sm text-text-secondary mb-3">
                      {!opponent ? 'Aguardando oponente...' : 'Preparando para o combate...'}
                    </div>
                  </div>
                  {opponent && (
                    <button
                      onClick={toggleReady}
                      className={`w-full py-2 px-4 rounded-lg font-bold text-sm transition-all duration-200 ${
                        isReady 
                          ? 'bg-success text-white' 
                          : 'bg-gradient-to-r from-primary to-primary-dark text-white hover:shadow-lg hover:shadow-primary/25'
                      }`}
                    >
                      {isReady ? '✅ Pronto!' : '🏁 Ficar Pronto'}
                    </button>
                  )}
                </div>
              ) : combatRoom?.phase === CombatPhase.INITIATIVE_ROLL ? (
                <div className="space-y-3">
                  <div className="text-center">
                    <div className="text-2xl mb-2">🎲</div>
                    <div className="text-sm text-text-secondary mb-3">
                      Role d20 para iniciativa!
                    </div>
                  </div>
                  <button
                    onClick={rollInitiative}
                    disabled={hasRolledInitiative}
                    className={`w-full py-3 px-4 rounded-lg font-bold text-sm transition-all duration-200 ${
                      hasRolledInitiative 
                        ? 'bg-gray-600 text-gray-300 cursor-not-allowed' 
                        : 'bg-gradient-to-r from-pink-500 to-purple-600 text-white hover:shadow-lg hover:shadow-purple/25 transform hover:scale-[1.02]'
                    }`}
                  >
                    {hasRolledInitiative ? '✅ Rolado!' : '🎲 Rolar d20'}
                  </button>
                </div>
              ) : combatRoom?.phase === CombatPhase.COMBAT_END ? (
                <div className="text-center space-y-4">
                  <div className={`text-2xl font-bold ${isWinner ? 'text-success' : 'text-error'}`}>
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
                    className="w-full bg-gradient-to-r from-warning to-yellow-500 hover:from-yellow-500 hover:to-warning text-white py-2 px-4 rounded-lg font-bold text-sm transition-all duration-200 transform hover:scale-[1.02] shadow-lg"
                  >
                    👊 Ataque Leve (d6)
                  </button>
                  <button
                    onClick={() => handlePlayerAction(ActionType.HEAVY_ATTACK)}
                    className="w-full bg-gradient-to-r from-error to-red-600 hover:from-red-600 hover:to-error text-white py-2 px-4 rounded-lg font-bold text-sm transition-all duration-200 transform hover:scale-[1.02] shadow-lg"
                  >
                    ⚔️ Ataque Pesado (d10)
                  </button>
                  <button
                    onClick={() => handlePlayerAction(ActionType.SPECIAL_ATTACK)}
                    disabled={!currentPlayer || currentPlayer.mp < 15}
                    className="w-full bg-gradient-to-r from-primary to-primary-dark hover:shadow-lg hover:shadow-primary/25 disabled:from-gray-600 disabled:to-gray-700 disabled:opacity-50 text-white py-2 px-4 rounded-lg font-bold text-sm transition-all duration-200 transform hover:scale-[1.02] shadow-lg disabled:hover:scale-100"
                  >
                    ✨ Especial (d20, 15🔮)
                  </button>
                  
                  <div className="border-t border-white/10 my-3"></div>
                  
                  <button
                    onClick={() => handlePlayerAction(ActionType.USE_ITEM)}
                    className="w-full bg-gradient-to-r from-success to-emerald-600 hover:from-emerald-600 hover:to-success text-white py-2 px-4 rounded-lg font-bold text-sm transition-all duration-200 transform hover:scale-[1.02] shadow-lg"
                  >
                    🧪 Consumíveis
                  </button>
                </div>
              ) : combatRoom?.phase === CombatPhase.OPPONENT_REACTION && !isMyTurn ? (
                <div className="space-y-2">
                  <div className="text-center text-warning font-bold text-sm mb-3">
                    🛡️ Escolha sua defesa:
                  </div>
                  <button
                    onClick={() => handleDefenseChoice('dodge')}
                    className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-blue-600 hover:to-cyan-600 text-white py-2 px-4 rounded-lg font-bold text-sm transition-all duration-200 transform hover:scale-[1.02] shadow-lg"
                  >
                    🌪️ Esquivar
                  </button>
                  <button
                    onClick={() => handleDefenseChoice('defend')}
                    className="w-full bg-gradient-to-r from-emerald-600 to-green-600 hover:from-green-600 hover:to-emerald-600 text-white py-2 px-4 rounded-lg font-bold text-sm transition-all duration-200 transform hover:scale-[1.02] shadow-lg"
                  >
                    🛡️ Defender
                  </button>
                </div>
              ) : (
                <div className="text-center text-text-secondary font-bold text-xs flex-1 flex items-center justify-center">
                  {combatRoom?.phase === CombatPhase.OPPONENT_REACTION && isMyTurn ? '⏳ Aguardando oponente escolher defesa...' :
                   combatRoom?.phase === CombatPhase.OPPONENT_REACTION ? '⚔️ Oponente escolhendo defesa...' : 
                   !isMyTurn ? '⏳ Turno do oponente...' : '⚔️ Executando ação...'}
                </div>
              )}
            </div>
          </div>

          {/* Dice Panel - Aparece apenas na fase DICE_ROLL, quando ambos já escolheram suas ações */}
          {combatRoom?.phase === CombatPhase.DICE_ROLL && (
            (isMyTurn && pendingAction) || (!isMyTurn && pendingDefense)
          ) && (
            <div className="bg-gradient-to-br from-surface/95 to-background/90 backdrop-blur-md border-t border-white/10 p-4 flex-shrink-0">
              <h3 className="text-text-primary font-bold text-center mb-3 text-base">
                🎲 {pendingAction ? 'Role seu dado de ataque' : 'Role seu dado de defesa'}
              </h3>
              <div className="flex justify-center space-x-4 flex-wrap gap-2">
                {[4, 6, 8, 10, 12, 20].map((sides) => {
                  const isCorrectDice = pendingAction 
                    ? pendingAction.diceType === sides 
                    : pendingDefense?.diceType === sides
                  
                  return (
                    <button
                      key={sides}
                      onClick={() => handleRollDice(sides)}
                      disabled={!isCorrectDice}
                      className={`
                        w-16 h-16 rounded-xl text-white font-bold text-sm
                        transition-all duration-200 transform
                        ${isCorrectDice 
                          ? 'hover:scale-110 cursor-pointer bg-gradient-to-br from-primary to-primary-dark shadow-lg shadow-primary/25' 
                          : 'opacity-50 cursor-not-allowed bg-gray-600'
                        }
                      `}
                    >
                      d{sides}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
