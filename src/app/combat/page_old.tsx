// Página simplificada para deploy
'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { X, Users, Sword, Shield, Zap, Heart, Sparkles } from 'lucide-react'

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
  equipment: {
    weapon?: Equipment
    armor?: Equipment
    shield?: Equipment
  }
  isReady: boolean
  isConnected: boolean
}

interface CombatRoom {
  id: string
  player1: Player | null
  player2: Player | null
  currentTurn: string | null
  phase: CombatPhase
  combatLog: string[]
  isActive: boolean
  winner?: string | null
}

enum CombatPhase {
  WAITING_PLAYERS = 'waiting_players',
  READY_CHECK = 'ready_check',
  PLAYER_TURN = 'player_turn',
  PLAYER_ATTACK = 'player_attack',
  PLAYER_DEFENSE = 'player_defense',
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

// Simulação de WebSocket para desenvolvimento local
class MockSocket {
  private handlers: { [event: string]: Function[] } = {}
  private room: CombatRoom
  private player: Player | null = null

  constructor() {
    this.room = {
      id: 'room_' + Math.random().toString(36).substr(2, 9),
      player1: null,
      player2: null,
      currentTurn: null,
      phase: CombatPhase.WAITING_PLAYERS,
      combatLog: ['⚔️ Combate iniciado!'],
      isActive: false
    }
  }

  on(event: string, handler: Function) {
    if (!this.handlers[event]) {
      this.handlers[event] = []
    }
    this.handlers[event].push(handler)
  }

  emit(event: string, data?: any) {
    setTimeout(() => {
      this.handleEvent(event, data)
    }, 100)
  }

  private handleEvent(event: string, data?: any) {
    switch (event) {
      case 'join_combat':
        this.handleJoinCombat(data)
        break
      case 'toggle_ready':
        this.handleToggleReady(data)
        break
      case 'player_action':
        this.handlePlayerAction(data)
        break
      case 'roll_dice':
        this.handleRollDice(data)
        break
      case 'chat_message':
        this.handleChatMessage(data)
        break
    }
  }

  private handleJoinCombat(player: Player) {
    this.player = player
    
    if (!this.room.player1) {
      this.room.player1 = player
      this.room.combatLog.push(`🎯 ${player.name} entrou na arena!`)
    } else if (!this.room.player2) {
      this.room.player2 = player
      this.room.phase = CombatPhase.READY_CHECK
      this.room.combatLog.push(`🎯 ${player.name} entrou na arena!`)
      this.room.combatLog.push('✅ Ambos jogadores conectados!')
    }

    this.triggerEvent('room_joined', this.room)
    this.triggerEvent('room_updated', this.room)
  }

  private handleToggleReady(data: { playerId: string }) {
    if (this.room.player1?.id === data.playerId) {
      this.room.player1.isReady = !this.room.player1.isReady
    } else if (this.room.player2?.id === data.playerId) {
      this.room.player2.isReady = !this.room.player2.isReady
    }

    if (this.room.player1?.isReady && this.room.player2?.isReady) {
      this.room.phase = CombatPhase.PLAYER_TURN
      this.room.currentTurn = this.room.player1.id
      this.room.isActive = true
      this.room.combatLog.push('⚡ COMBATE INICIADO!')
      this.room.combatLog.push(`🎯 Turno de ${this.room.player1.name}`)
    }

    this.triggerEvent('room_updated', this.room)
  }

  private handlePlayerAction(data: { action: ActionType, diceType: number }) {
    const actionNames = {
      [ActionType.LIGHT_ATTACK]: 'Ataque Leve',
      [ActionType.HEAVY_ATTACK]: 'Ataque Pesado', 
      [ActionType.SPECIAL_ATTACK]: 'Especial',
      [ActionType.DODGE]: 'Esquivar',
      [ActionType.DEFEND]: 'Defender',
      [ActionType.USE_ITEM]: 'Item'
    }

    this.room.phase = CombatPhase.DICE_ROLL
    this.room.combatLog.push(`🎯 ${actionNames[data.action]} selecionado! Role o d${data.diceType}`)
    
    this.triggerEvent('room_updated', this.room)
  }

  private handleRollDice(data: { sides: number, action: ActionType }) {
    const roll = Math.floor(Math.random() * data.sides) + 1
    const result = { roll, modifier: 0, total: roll }
    
    this.triggerEvent('dice_rolled', {
      playerId: this.player?.id,
      sides: data.sides,
      result
    })

    setTimeout(() => {
      this.processActionResult(data.action, roll)
    }, 1000)
  }

  private processActionResult(action: ActionType, playerRoll: number) {
    const currentPlayer = this.room.currentTurn === this.room.player1?.id ? this.room.player1 : this.room.player2
    const opponent = this.room.currentTurn === this.room.player1?.id ? this.room.player2 : this.room.player1

    if (!currentPlayer || !opponent) return

    const opponentRoll = Math.floor(Math.random() * 12) + 1
    
    if ([ActionType.LIGHT_ATTACK, ActionType.HEAVY_ATTACK, ActionType.SPECIAL_ATTACK].includes(action)) {
      if (playerRoll > opponentRoll) {
        let damage = 5 + Math.floor(playerRoll / 3)
        if (action === ActionType.HEAVY_ATTACK) damage += 3
        if (action === ActionType.SPECIAL_ATTACK) damage += 8
        
        opponent.hp = Math.max(0, opponent.hp - damage)
        this.room.combatLog.push(`⚔️ Acertou! ${damage} de dano em ${opponent.name}`)
        
        if (opponent.hp <= 0) {
          this.room.phase = CombatPhase.COMBAT_END
          this.room.winner = currentPlayer.id
          this.room.combatLog.push(`🏆 ${currentPlayer.name} venceu!`)
          this.triggerEvent('room_updated', this.room)
          return
        }
      } else {
        this.room.combatLog.push(`🛡️ ${opponent.name} defendeu!`)
      }
    } else {
      if (playerRoll > opponentRoll) {
        this.room.combatLog.push(`✅ ${action === ActionType.DODGE ? 'Esquiva' : 'Defesa'} bem-sucedida!`)
      } else {
        const damage = 3 + Math.floor(opponentRoll / 4)
        currentPlayer.hp = Math.max(0, currentPlayer.hp - damage)
        this.room.combatLog.push(`💔 Falhou! Recebeu ${damage} de dano`)
        
        if (currentPlayer.hp <= 0) {
          this.room.phase = CombatPhase.COMBAT_END
          this.room.winner = opponent.id
          this.room.combatLog.push(`🏆 ${opponent.name} venceu!`)
          this.triggerEvent('room_updated', this.room)
          return
        }
      }
    }

    this.room.currentTurn = this.room.currentTurn === this.room.player1?.id ? this.room.player2?.id : this.room.player1?.id
    this.room.phase = CombatPhase.PLAYER_TURN
    
    const nextPlayer = this.room.currentTurn === this.room.player1?.id ? this.room.player1 : this.room.player2
    this.room.combatLog.push(`🎯 Turno de ${nextPlayer?.name}`)
    
    this.triggerEvent('room_updated', this.room)
  }

  private handleChatMessage(data: { sender: string, message: string }) {
    this.triggerEvent('chat_message', {
      sender: data.sender,
      message: data.message,
      timestamp: new Date()
    })
  }

  private triggerEvent(event: string, data?: any) {
    if (this.handlers[event]) {
      this.handlers[event].forEach(handler => handler(data))
    }
  }
}

const DiceComponent = ({ 
  sides, 
  enabled, 
  onRoll, 
  lastRoll, 
  isRolling 
}: { 
  sides: number
  enabled: boolean
  onRoll: () => void
  lastRoll: { roll: number; modifier: number; total: number } | null
  isRolling: boolean
}) => {
  const getDiceColor = (sides: number) => {
    switch (sides) {
      case 4: return 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700'
      case 6: return 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700'
      case 8: return 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700'
      case 10: return 'bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700'
      case 12: return 'bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700'
      case 20: return 'bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700'
      default: return 'bg-gradient-to-r from-gray-500 to-gray-600 hover:from-gray-600 hover:to-gray-700'
    }
  }

  return (
    <button
      onClick={onRoll}
      disabled={!enabled || isRolling}
      className={`
        px-4 py-2 rounded-lg text-white font-bold text-sm
        transition-all duration-200 transform border-2 border-white/30
        ${enabled && !isRolling ? 'hover:scale-105 cursor-pointer shadow-lg' : 'opacity-50 cursor-not-allowed'}
        ${getDiceColor(sides)}
        ${isRolling ? 'animate-bounce' : ''}
        ${enabled ? 'ring-2 ring-primary ring-opacity-50' : ''}
      `}
    >
      <div className="text-center">
        {isRolling ? '🎲' : (lastRoll ? lastRoll.total : `d${sides}`)}
      </div>
    </button>
  )
}

export default function CombatPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isLoading, setIsLoading] = useState(true)
  const [socket, setSocket] = useState<MockSocket | null>(null)
  const [roomId, setRoomId] = useState<string>('')
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null)
  const [combatRoom, setCombatRoom] = useState<CombatRoom | null>(null)
  const [chatMessage, setChatMessage] = useState('')
  const [chatMessages, setChatMessages] = useState<Array<{sender: string, message: string, timestamp: Date}>>([])
  const [currentAction, setCurrentAction] = useState<ActionType | null>(null)
  const [diceRolls, setDiceRolls] = useState<{[key: number]: { roll: number; modifier: number; total: number } | null}>({})
  const [isRollingDice, setIsRollingDice] = useState<{[key: number]: boolean}>({})
  const [enabledDice, setEnabledDice] = useState<number[]>([])
  
  const chatLogRef = useRef<HTMLDivElement>(null)
  const combatLogRef = useRef<HTMLDivElement>(null)

  const ACTION_DICE: Record<ActionType, number> = {
    [ActionType.LIGHT_ATTACK]: 6,
    [ActionType.HEAVY_ATTACK]: 10,
    [ActionType.SPECIAL_ATTACK]: 20,
    [ActionType.DODGE]: 20,
    [ActionType.DEFEND]: 12,
    [ActionType.USE_ITEM]: 4
  }

  useEffect(() => {
    const roomParam = searchParams.get('room')
    const isCreator = searchParams.get('creator') === 'true'
    
    if (roomParam) {
      setRoomId(roomParam)
    }
    
    checkAuthAndStartCombat(roomParam, isCreator)
  }, [searchParams])

  const checkAuthAndStartCombat = async (roomParam: string | null, isCreator: boolean) => {
    try {
      let playerData: Player
      
      try {
        const response = await fetch('/api/user/profile')
        if (response.ok) {
          const userData = await response.json()
          playerData = {
            id: userData.id || 'player_' + Math.random().toString(36).substr(2, 9),
            name: userData.name || 'sgs',
            level: userData.level || 6,
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
            equipment: userData.equipment || {},
            isReady: false,
            isConnected: true
          }
        } else {
          throw new Error('API não disponível')
        }
      } catch (apiError) {
        playerData = {
          id: 'player_' + Math.random().toString(36).substr(2, 9),
          name: isCreator ? 'sgs' : 'Oponente',
          level: 6,
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
          equipment: {},
          isReady: false,
          isConnected: true
        }
      }
      
      setCurrentPlayer(playerData)
      initializeSocket(playerData, roomParam)
      setIsLoading(false)
    } catch (error) {
      console.error('Erro ao inicializar combate:', error)
      router.push('/combat-lobby')
    }
  }

  const initializeSocket = (player: Player, roomParam: string | null) => {
    const mockSocket = new MockSocket()
    
    if (roomParam) {
      setRoomId(roomParam)
    }
    
    mockSocket.on('room_joined', (room: CombatRoom) => {
      setCombatRoom(room)
      if (!roomParam) {
        setRoomId(room.id)
      }
    })

    mockSocket.on('room_updated', (room: CombatRoom) => {
      setCombatRoom(room)
    })

    mockSocket.on('chat_message', (data: {sender: string, message: string, timestamp: Date}) => {
      setChatMessages(prev => [...prev, data])
    })

    mockSocket.on('dice_rolled', (data: {playerId: string, sides: number, result: any}) => {
      if (data.playerId === player.id) {
        setDiceRolls(prev => ({ ...prev, [data.sides]: data.result }))
        setIsRollingDice(prev => ({ ...prev, [data.sides]: false }))
        setEnabledDice([])
      }
    })

    setSocket(mockSocket)
    mockSocket.emit('join_combat', player)
    
    if (!roomParam) {
      setTimeout(() => {
        const botPlayer: Player = {
          id: 'bot_' + Math.random().toString(36).substr(2, 9),
          name: 'Goblin (Andar 1)',
          level: 6,
          hp: 40,
          maxHp: 40,
          mp: 0,
          maxMp: 0,
          attack: 8,
          defense: 3,
          strength: 6,
          agility: 4,
          intelligence: 2,
          resistance: 1,
          critical: 0.5,
          speed: 1.8,
          equipment: {},
          isReady: false,
          isConnected: true
        }
        mockSocket.emit('join_combat', botPlayer)
      }, 3000)
    }
  }

  useEffect(() => {
    if (chatLogRef.current) {
      chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight
    }
  }, [chatMessages])

  useEffect(() => {
    if (combatLogRef.current && combatRoom?.combatLog) {
      combatLogRef.current.scrollTop = combatLogRef.current.scrollHeight
    }
  }, [combatRoom?.combatLog])

  const sendChatMessage = () => {
    if (chatMessage.trim() && socket && currentPlayer) {
      socket.emit('chat_message', {
        roomId,
        sender: currentPlayer.name,
        message: chatMessage.trim()
      })
      setChatMessage('')
    }
  }

  const toggleReady = () => {
    if (socket && currentPlayer) {
      socket.emit('toggle_ready', {
        roomId,
        playerId: currentPlayer.id
      })
    }
  }

  const handlePlayerAction = (action: ActionType) => {
    if (!combatRoom || !currentPlayer || combatRoom.currentTurn !== currentPlayer.id) return

    const mpCost = action === ActionType.SPECIAL_ATTACK ? 15 : 0
    
    if (mpCost > 0 && currentPlayer.mp < mpCost) {
      return
    }

    setCurrentAction(action)
    const diceType = ACTION_DICE[action]
    setEnabledDice([diceType])

    if (socket) {
      socket.emit('player_action', {
        roomId,
        playerId: currentPlayer.id,
        action,
        diceType
      })
    }
  }

  const handleDiceRoll = (sides: number) => {
    if (!enabledDice.includes(sides) || isRollingDice[sides] || !socket || !currentPlayer) return

    setIsRollingDice(prev => ({ ...prev, [sides]: true }))

    socket.emit('roll_dice', {
      roomId,
      playerId: currentPlayer.id,
      sides,
      action: currentAction
    })
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500"></div>
      </div>
    )
  }

  const opponent = combatRoom?.player1?.id === currentPlayer?.id ? combatRoom?.player2 : combatRoom?.player1
  const isMyTurn = combatRoom?.currentTurn === currentPlayer?.id
  const isWinner = combatRoom?.winner === currentPlayer?.id
  const isLoser = combatRoom?.winner && combatRoom.winner !== currentPlayer?.id

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
        {/* Left Panel - Player Stats */}
        <div className="w-1/3 bg-gray-800 border-r border-gray-700">
          {/* Current Player */}
          <div className="bg-teal-800 p-4 border-b border-gray-700">
            <h2 className="text-green-400 font-bold text-lg mb-2">{currentPlayer?.name}</h2>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>HP: <span className="text-red-400">{currentPlayer?.hp}/{currentPlayer?.maxHp}</span></div>
              <div>MP: <span className="text-blue-400">{currentPlayer?.mp}/{currentPlayer?.maxMp}</span></div>
              <div>ATK: <span className="text-white">{currentPlayer?.attack}</span></div>
              <div>DEF: <span className="text-white">{currentPlayer?.defense}</span></div>
              <div>STR: <span className="text-white">{currentPlayer?.strength}</span></div>
              <div>AGI: <span className="text-white">{currentPlayer?.agility}</span></div>
              <div>RES: <span className="text-white">{currentPlayer?.resistance}</span></div>
              <div>INT: <span className="text-white">{currentPlayer?.intelligence}</span></div>
              <div>CRIT: <span className="text-yellow-400">{currentPlayer?.critical}%</span></div>
              <div>SPD: <span className="text-white">{currentPlayer?.speed}</span></div>
              <div className="col-span-2">LVL: <span className="text-white">{currentPlayer?.level}</span></div>
            </div>
          </div>

          {/* Chat */}
          <div className="flex-1 flex flex-col h-96">
            <div className="p-3 border-b border-gray-700">
              <h3 className="text-white font-bold">Chat</h3>
            </div>
            <div 
              ref={chatLogRef}
              className="flex-1 p-3 space-y-2 overflow-y-auto"
            >
              {chatMessages.map((msg, index) => (
                <div key={index} className="bg-gray-700 rounded p-2">
                  <div className="text-xs text-gray-400">{msg.sender}:</div>
                  <div className="text-sm">{msg.message}</div>
                </div>
              ))}
            </div>
            <div className="p-3 border-t border-gray-700">
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendChatMessage()}
                  placeholder="Digite sua mensagem..."
                  className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-1 text-sm"
                />
                <button
                  onClick={sendChatMessage}
                  className="bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded text-sm"
                >
                  📩
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Center Panel - Combat Log & Actions */}
        <div className="flex-1 flex flex-col">
          {/* Combat Log */}
          <div className="flex-1 bg-gray-800">
            <div className="bg-gray-700 p-3 border-b border-gray-600">
              <h3 className="text-center font-bold text-yellow-400">📜 Registro de Combate</h3>
            </div>
            <div 
              ref={combatLogRef}
              className="p-4 space-y-2 h-80 overflow-y-auto"
            >
              {combatRoom?.combatLog.map((log, index) => (
                <div key={index} className="text-sm text-gray-300">
                  {log}
                </div>
              ))}
            </div>
          </div>

          {/* Dice Panel */}
          <div className="bg-gray-700 p-4">
            <h3 className="text-center font-bold text-white mb-3">🎲 Dados Clássicos RPG</h3>
            <div className="flex justify-center space-x-2">
              {[4, 6, 8, 10, 12, 20].map(sides => (
                <DiceComponent
                  key={sides}
                  sides={sides}
                  enabled={enabledDice.includes(sides)}
                  onRoll={() => handleDiceRoll(sides)}
                  isRolling={isRollingDice[sides] || false}
                  lastRoll={diceRolls[sides] || null}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Right Panel - Opponent & Actions */}
        <div className="w-1/3 bg-gray-800 border-l border-gray-700">
          {/* Opponent */}
          <div className="bg-red-900 p-4 border-b border-gray-700">
            <h2 className="text-red-400 font-bold text-lg mb-2">
              {opponent ? opponent.name : 'Aguardando oponente...'}
            </h2>
            {opponent && (
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>HP: <span className="text-red-400">{opponent.hp}/{opponent.maxHp}</span></div>
                <div className="col-span-2">Level: <span className="text-white">{opponent.level}</span></div>
                <div>ATK: <span className="text-white">{opponent.attack}</span></div>
                <div>DEF: <span className="text-white">{opponent.defense}</span></div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="p-4">
            <div className="flex items-center justify-center mb-4">
              <span className="text-white font-bold">⚔️ Ações</span>
            </div>

            {combatRoom?.phase === CombatPhase.WAITING_PLAYERS ? (
              <div className="text-center text-gray-400">
                Aguardando segundo jogador...
              </div>
            ) : combatRoom?.phase === CombatPhase.READY_CHECK ? (
              <div className="space-y-3">
                <button
                  onClick={toggleReady}
                  className={`w-full py-3 rounded-lg font-bold ${
                    currentPlayer?.isReady 
                      ? 'bg-green-600 text-white' 
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                >
                  {currentPlayer?.isReady ? '✅ Pronto!' : '🎯 Ficar Pronto'}
                </button>
              </div>
            ) : combatRoom?.phase === CombatPhase.COMBAT_END ? (
              <div className="text-center space-y-4">
                <div className={`text-2xl font-bold ${isWinner ? 'text-green-400' : 'text-red-400'}`}>
                  {isWinner ? '🏆 VITÓRIA!' : '💀 DERROTA!'}
                </div>
                <button
                  onClick={() => router.push('/combat-lobby')}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg w-full"
                >
                  Voltar ao Lobby
                </button>
              </div>
            ) : isMyTurn && combatRoom?.phase === CombatPhase.PLAYER_TURN ? (
              <div className="space-y-2">
                <button
                  onClick={() => handlePlayerAction(ActionType.LIGHT_ATTACK)}
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white py-2 px-4 rounded-lg font-bold text-sm"
                >
                  👊 Ataque Leve (1 ⚡)
                </button>
                <button
                  onClick={() => handlePlayerAction(ActionType.HEAVY_ATTACK)}
                  className="w-full bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-lg font-bold text-sm"
                >
                  ⚔️ Ataque Pesado (2 ⚡)
                </button>
                <button
                  onClick={() => handlePlayerAction(ActionType.SPECIAL_ATTACK)}
                  disabled={!currentPlayer || currentPlayer.mp < 15}
                  className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-500 text-white py-2 px-4 rounded-lg font-bold text-sm"
                >
                  ✨ Especial (15 🔵 4 ⚡)
                </button>
                <button
                  onClick={() => handlePlayerAction(ActionType.DEFEND)}
                  className="w-full bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-lg font-bold text-sm"
                >
                  🛡️ Consumíveis
                </button>
                <button
                  className="w-full bg-purple-500 hover:bg-purple-600 text-white py-2 px-4 rounded-lg font-bold text-sm"
                >
                  🔮 Transformação
                </button>
              </div>
            ) : (
              <div className="text-center text-gray-400">
                {!isMyTurn ? 'Aguardando turno do oponente...' : 'Executando ação...'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
