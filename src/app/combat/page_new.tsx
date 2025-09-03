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
    if (event === 'join_room') {
      this.handleJoinRoom(data)
    } else if (event === 'player_action') {
      this.handlePlayerAction(data)
    } else if (event === 'roll_dice') {
      this.handleRollDice(data)
    } else if (event === 'chat_message') {
      this.handleChatMessage(data)
    } else if (event === 'toggle_ready') {
      this.handleToggleReady()
    }
  }

  private triggerEvent(event: string, data: any) {
    if (this.handlers[event]) {
      this.handlers[event].forEach(handler => handler(data))
    }
  }

  private handleJoinRoom(data: { roomId: string, player: Player, isCreator: boolean }) {
    this.player = data.player

    if (data.isCreator || !this.room.player1) {
      this.room.player1 = data.player
    } else {
      this.room.player2 = data.player
      this.room.combatLog.push(`🎮 ${data.player.name} entrou na sala!`)
    }

    this.triggerEvent('room_updated', this.room)
    this.triggerEvent('player_joined', data.player)
  }

  private handleToggleReady() {
    if (!this.player) return

    if (this.room.player1?.id === this.player.id) {
      this.room.player1.isReady = !this.room.player1.isReady
    } else if (this.room.player2?.id === this.player.id) {
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
    
    let damage = 0
    let actionMessage = ''

    switch (action) {
      case ActionType.LIGHT_ATTACK:
        damage = Math.max(0, (currentPlayer.attack + playerRoll) - (opponent.defense + opponentRoll))
        actionMessage = `👊 ${currentPlayer.name} usou Ataque Leve!`
        break
      case ActionType.HEAVY_ATTACK:
        damage = Math.max(0, (currentPlayer.attack * 1.5 + playerRoll) - (opponent.defense + opponentRoll))
        actionMessage = `⚔️ ${currentPlayer.name} usou Ataque Pesado!`
        break
      case ActionType.SPECIAL_ATTACK:
        damage = Math.max(0, (currentPlayer.attack * 2 + playerRoll) - (opponent.defense + opponentRoll))
        actionMessage = `✨ ${currentPlayer.name} usou Ataque Especial!`
        if (currentPlayer.mp >= 15) {
          currentPlayer.mp -= 15
        }
        break
      default:
        actionMessage = `${currentPlayer.name} usou uma ação!`
        break
    }

    this.room.combatLog.push(actionMessage)
    this.room.combatLog.push(`🎲 Dado: ${playerRoll} vs Defesa: ${opponentRoll}`)

    if (damage > 0) {
      opponent.hp = Math.max(0, opponent.hp - damage)
      this.room.combatLog.push(`💥 ${opponent.name} recebeu ${damage} de dano!`)
    } else {
      this.room.combatLog.push(`🛡️ ${opponent.name} defendeu o ataque!`)
    }

    if (opponent.hp <= 0) {
      this.room.phase = CombatPhase.COMBAT_END
      this.room.winner = currentPlayer.id
      this.room.combatLog.push(`🏆 ${currentPlayer.name} venceu!`)
    } else {
      // Trocar turno
      this.room.currentTurn = opponent.id
      this.room.phase = CombatPhase.PLAYER_TURN
      this.room.combatLog.push(`🔄 Turno de ${opponent.name}`)
    }

    this.triggerEvent('room_updated', this.room)
  }

  private handleChatMessage(data: { message: string }) {
    this.triggerEvent('chat_message', {
      sender: this.player?.name || 'Anônimo',
      message: data.message,
      timestamp: new Date()
    })
  }
}

export default function CombatPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const roomId = searchParams.get('room') || 'default'
  const isCreator = searchParams.get('creator') === 'true'

  const [socket] = useState(() => new MockSocket())
  const [combatRoom, setCombatRoom] = useState<CombatRoom | null>(null)
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [chatMessages, setChatMessages] = useState<Array<{sender: string, message: string, timestamp: Date}>>([])
  const [newMessage, setNewMessage] = useState('')
  const [pendingAction, setPendingAction] = useState<{action: ActionType, diceType: number} | null>(null)

  const combatLogRef = useRef<HTMLDivElement>(null)
  const chatLogRef = useRef<HTMLDivElement>(null)

  const opponent = combatRoom?.player1?.id === currentPlayer?.id ? combatRoom?.player2 : combatRoom?.player1
  const isMyTurn = combatRoom?.currentTurn === currentPlayer?.id
  const isWinner = combatRoom?.winner === currentPlayer?.id

  useEffect(() => {
    const initializeCombat = async () => {
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
      
      // Configurar event listeners
      socket.on('room_updated', (room: CombatRoom) => {
        setCombatRoom(room)
        if (combatLogRef.current) {
          setTimeout(() => {
            combatLogRef.current!.scrollTop = combatLogRef.current!.scrollHeight
          }, 100)
        }
      })

      socket.on('chat_message', (msg: {sender: string, message: string, timestamp: Date}) => {
        setChatMessages(prev => [...prev, msg])
        if (chatLogRef.current) {
          setTimeout(() => {
            chatLogRef.current!.scrollTop = chatLogRef.current!.scrollHeight
          }, 100)
        }
      })

      socket.on('player_joined', (player: Player) => {
        setChatMessages(prev => [...prev, {
          sender: 'Sistema',
          message: `${player.name} entrou na sala!`,
          timestamp: new Date()
        }])
      })

      socket.on('dice_rolled', (data: {playerId: string, sides: number, result: any}) => {
        setPendingAction(null)
      })

      // Entrar na sala
      socket.emit('join_room', { roomId, player: playerData, isCreator })

      // Simular um segundo jogador para teste
      if (isCreator) {
        setTimeout(() => {
          const botPlayer: Player = {
            id: 'bot_player',
            name: 'Bot Oponente',
            level: 5,
            hp: 300,
            maxHp: 300,
            mp: 150,
            maxMp: 150,
            attack: 8,
            defense: 8,
            strength: 7,
            agility: 6,
            intelligence: 4,
            resistance: 2,
            critical: 2.0,
            speed: 3.0,
            equipment: {},
            isReady: false,
            isConnected: true
          }
          socket.emit('join_room', { roomId, player: botPlayer, isCreator: false })
        }, 2000)
      }
    }

    initializeCombat()
  }, [socket, roomId, isCreator])

  const toggleReady = () => {
    setIsReady(!isReady)
    socket.emit('toggle_ready')
  }

  const handlePlayerAction = (action: ActionType) => {
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
    socket.emit('player_action', { action, diceType })
  }

  const handleRollDice = (sides: number) => {
    if (!pendingAction || pendingAction.diceType !== sides) return
    socket.emit('roll_dice', { sides, action: pendingAction.action })
  }

  const sendMessage = () => {
    if (newMessage.trim()) {
      socket.emit('chat_message', { message: newMessage })
      setNewMessage('')
    }
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
            {/* Combat Log - Lado esquerdo */}
            <div className="flex-1 bg-background/20 p-4">
              <div className="bg-background/50 backdrop-blur-xl border border-white/10 rounded-xl p-4 h-full">
                <h3 className="font-bold text-text-primary mb-3 text-center text-sm">⚔️ Log de Combate</h3>
                <div 
                  ref={combatLogRef}
                  className="h-64 overflow-y-auto combat-chat-scroll p-3 space-y-2 bg-surface/30 rounded-lg border border-white/5"
                  style={{ maxHeight: '280px' }}
                >
                  {combatRoom?.combatLog.map((log, index) => (
                    <div key={index} className="text-text-secondary text-xs leading-relaxed">
                      {log}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Chat - Centro */}
            <div className="w-80 bg-surface/30 p-4 flex flex-col">
              <h3 className="font-bold text-text-primary mb-3 text-sm text-center">💬 Chat</h3>
              <div className="flex-1 bg-background/50 backdrop-blur-xl border border-white/10 rounded-xl p-3">
                <div 
                  ref={chatLogRef}
                  className="h-40 overflow-y-auto space-y-2 mb-3"
                >
                  {chatMessages.map((msg, index) => (
                    <div key={index} className="bg-surface/40 rounded-lg p-2">
                      <div className="text-xs text-text-secondary font-bold">{msg.sender}:</div>
                      <div className="text-sm text-text-primary">{msg.message}</div>
                    </div>
                  ))}
                </div>
                <div className="flex">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                    placeholder="Digite sua mensagem..."
                    className="flex-1 bg-background/50 border border-white/20 rounded-l-lg px-3 py-2 text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <button
                    onClick={sendMessage}
                    className="bg-primary hover:bg-primary-dark text-white px-3 py-2 rounded-r-lg transition-colors"
                  >
                    ➤
                  </button>
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
                    👊 Ataque Leve (1⚡)
                  </button>
                  <button
                    onClick={() => handlePlayerAction(ActionType.HEAVY_ATTACK)}
                    className="w-full bg-gradient-to-r from-error to-red-600 hover:from-red-600 hover:to-error text-white py-2 px-4 rounded-lg font-bold text-sm transition-all duration-200 transform hover:scale-[1.02] shadow-lg"
                  >
                    ⚔️ Ataque Pesado (2⚡)
                  </button>
                  <button
                    onClick={() => handlePlayerAction(ActionType.SPECIAL_ATTACK)}
                    disabled={!currentPlayer || currentPlayer.mp < 15}
                    className="w-full bg-gradient-to-r from-primary to-primary-dark hover:shadow-lg hover:shadow-primary/25 disabled:from-gray-600 disabled:to-gray-700 disabled:opacity-50 text-white py-2 px-4 rounded-lg font-bold text-sm transition-all duration-200 transform hover:scale-[1.02] shadow-lg disabled:hover:scale-100"
                  >
                    ✨ Especial (15🔮 4⚡)
                  </button>
                  
                  <div className="border-t border-white/10 my-3"></div>
                  
                  <button
                    onClick={() => handlePlayerAction(ActionType.DEFEND)}
                    className="w-full bg-gradient-to-r from-success to-emerald-600 hover:from-emerald-600 hover:to-success text-white py-2 px-4 rounded-lg font-bold text-sm transition-all duration-200 transform hover:scale-[1.02] shadow-lg"
                  >
                    🧪 Consumíveis
                  </button>
                  <button
                    className="w-full bg-gradient-to-r from-accent to-indigo-800 opacity-50 text-white py-2 px-4 rounded-lg font-bold text-sm transition-all duration-200 shadow-lg cursor-not-allowed"
                    title="Em desenvolvimento"
                  >
                    🔮 Transformação
                  </button>
                </div>
              ) : (
                <div className="text-center text-text-secondary font-bold text-xs flex-1 flex items-center justify-center">
                  {!isMyTurn ? '⏳ Turno do oponente...' : '⚔️ Executando ação...'}
                </div>
              )}
            </div>
          </div>

          {/* Dice Panel */}
          {combatRoom?.phase === CombatPhase.DICE_ROLL && isMyTurn && (
            <div className="bg-gradient-to-br from-surface/95 to-background/90 backdrop-blur-md border-t border-white/10 p-3 flex-shrink-0">
              <h3 className="text-text-primary font-bold text-center mb-2 text-sm">🎲 Role o Dado</h3>
              <div className="flex justify-center space-x-3">
                {[4, 6, 8, 10, 12, 20].map((sides) => (
                  <button
                    key={sides}
                    onClick={() => handleRollDice(sides)}
                    disabled={pendingAction?.diceType !== sides}
                    className={`
                      w-12 h-12 rounded-lg text-white font-bold text-xs
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
