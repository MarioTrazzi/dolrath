'use client'

import { useEffect, useState, useRef, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { X, Users, Sword, Shield, Zap, Heart, Sparkles } from 'lucide-react'
import { io, Socket } from 'socket.io-client'
import TransformationDialog from '@/components/TransformationDialog'

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
  // Campos de transformação
  isTransformed?: boolean
  transformationType?: string | null
  transformationData?: {
    remainingTurns?: number
    cooldownTurns?: number
    [key: string]: any
  }
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
  // Nova estrutura para participants
  participants?: {
    fighters: Array<Player & {role: string, socketId: string}>
    spectators: Array<Player & {role: string, socketId: string}>
    moderators: Array<Player & {role: string, socketId: string}>
  }
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
  const roomId = searchParams?.get('room') || 'default'
  const characterId = searchParams?.get('character')
  const isRoomCreator = searchParams?.get('creator') === 'true'
  const userRole = searchParams?.get('role') || 'fighter' // Novo parâmetro de role

  const [socket] = useState(() => createSocketConnection())
  const [combatRoom, setCombatRoom] = useState<CombatRoom | null>(null)
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [newMessage, setNewMessage] = useState('')
  const [pendingAction, setPendingAction] = useState<{action: ActionType, diceType: number} | null>(null)
  const [pendingDefense, setPendingDefense] = useState<{reaction: string, diceType: number} | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const [hasRolledInitiative, setHasRolledInitiative] = useState(false)
  const [hasRolledDice, setHasRolledDice] = useState(false) // Novo estado para controlar se já rolou
  const [showTransformationDialog, setShowTransformationDialog] = useState(false)
  const [isTransforming, setIsTransforming] = useState(false)

  // Sistema de Stamina (custos por ação) - Balanceado para 10 lutas diárias
  const STAMINA_COSTS = {
    [ActionType.LIGHT_ATTACK]: 1,   // Ataque leve: 1 stamina
    [ActionType.HEAVY_ATTACK]: 2,   // Ataque pesado: 2 stamina
    [ActionType.SPECIAL_ATTACK]: 4, // Ataque especial: 4 stamina
    [ActionType.DODGE]: 1,          // Esquivar: 1 stamina
    [ActionType.DEFEND]: 3,         // Defender: 3 stamina (mais caro para incentivar ação)
    [ActionType.USE_ITEM]: 0        // Usar item: 0 stamina
  }

  const combatLogRef = useRef<HTMLDivElement>(null)

  const opponent = combatRoom?.player1?.id === currentPlayer?.id ? combatRoom?.player2 : combatRoom?.player1
  // 🔥 CORREÇÃO: Card verde deve usar dados do combatRoom igual ao vermelho
  const currentPlayerDisplay = combatRoom?.player1?.id === currentPlayer?.id ? combatRoom?.player1 : combatRoom?.player2
  const isMyTurn = combatRoom?.currentTurn === currentPlayer?.id
  const isWinner = combatRoom?.winner === currentPlayer?.id
  const isCreator = combatRoom?.creator === currentPlayer?.id
  const isSpectator = userRole === 'spectator'
  const isModerator = userRole === 'moderator'

  // 🎯 CÁLCULOS DE BALANCEAMENTO - Mostrar chances calculadas
  const calculateDisplayStats = (player: Player | null | undefined) => {
    if (!player) return { critChance: 0, dodgeBonus: 0, specialType: 'físico' }
    
    const critChance = Math.min(50, player.agility * 2) // 2% por AGI (máx 50%)
    const dodgeBonus = Math.floor(player.agility / 10) // +1 dado a cada 10 AGI
    const specialType = player.intelligence > player.strength ? 'mágico' : 'físico'
    
    return { critChance, dodgeBonus, specialType }
  }

  const playerStats = calculateDisplayStats(currentPlayerDisplay)
  const opponentStats = calculateDisplayStats(opponent)

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
        console.log('📊 Fase atual:', room.phase)
        console.log('🎯 Pending Action:', room.pendingAction)
        setCombatRoom(room)

        // 🔥 CORREÇÃO CRÍTICA: Sincronizar dados da sala SEM sobrescrever mudanças locais imediatas
        if (currentPlayer && room.player1?.id === currentPlayer.id && room.player1) {
          const p1 = room.player1
          setCurrentPlayer(prev => {
            if (!prev) return p1
            
            // Manter dados locais mais atualizados para MP/stamina (mudanças imediatas)
            // Sincronizar HP apenas se vier do servidor (dano confirmado)
            return {
              ...prev,
              // Atualizar HP apenas se vier menor (dano confirmado) ou maior (cura)
              hp: p1.hp !== prev.hp ? p1.hp : prev.hp,
              maxHp: p1.maxHp,
              // Para MP/stamina, manter o menor valor (proteção contra dessincronização)
              mp: Math.min(prev.mp, p1.mp),
              maxMp: p1.maxMp,
              stamina: Math.min(prev.stamina, p1.stamina),
              maxStamina: p1.maxStamina,
              // Atualizar outros stats que podem mudar (transformações, etc)
              attack: p1.attack,
              defense: p1.defense,
              strength: p1.strength,
              agility: p1.agility,
              intelligence: p1.intelligence,
              resistance: p1.resistance,
              critical: p1.critical,
              speed: p1.speed,
              isTransformed: p1.isTransformed,
              transformationType: p1.transformationType,
              transformationData: p1.transformationData,
              isReady: p1.isReady,
              isConnected: p1.isConnected,
              isAlive: p1.isAlive
            }
          })
        } else if (currentPlayer && room.player2?.id === currentPlayer.id && room.player2) {
          const p2 = room.player2
          setCurrentPlayer(prev => {
            if (!prev) return p2
            
            // Manter dados locais mais atualizados para MP/stamina (mudanças imediatas)
            // Sincronizar HP apenas se vier do servidor (dano confirmado)
            return {
              ...prev,
              // Atualizar HP apenas se vier menor (dano confirmado) ou maior (cura)
              hp: p2.hp !== prev.hp ? p2.hp : prev.hp,
              maxHp: p2.maxHp,
              // Para MP/stamina, manter o menor valor (proteção contra dessincronização)
              mp: Math.min(prev.mp, p2.mp),
              maxMp: p2.maxMp,
              stamina: Math.min(prev.stamina, p2.stamina),
              maxStamina: p2.maxStamina,
              // Atualizar outros stats que podem mudar (transformações, etc)
              attack: p2.attack,
              defense: p2.defense,
              strength: p2.strength,
              agility: p2.agility,
              intelligence: p2.intelligence,
              resistance: p2.resistance,
              critical: p2.critical,
              speed: p2.speed,
              isTransformed: p2.isTransformed,
              transformationType: p2.transformationType,
              transformationData: p2.transformationData,
              isReady: p2.isReady,
              isConnected: p2.isConnected,
              isAlive: p2.isAlive
            }
          })
        }

        // Reset iniciativa quando sala é resetada
        if (room.phase === CombatPhase.WAITING_PLAYERS) {
          setHasRolledInitiative(false)
          setHasRolledDice(false) // Reset também o estado do dado
        }
        
        // APENAS na fase DICE_ROLL, setamos para ambos verem os dados
        if (room.phase === CombatPhase.DICE_ROLL && room.pendingAction) {
          // NÃO resetar hasRolledDice aqui - apenas quando sai da fase
          
          // Ambos setam o mesmo diceType para rolar o mesmo dado
          const diceType = room.pendingAction.diceType
          setPendingAction({
            action: room.pendingAction.action,
            diceType: diceType
          })
          setPendingDefense({
            reaction: 'defending',
            diceType: diceType // MESMO dado do ataque
          })
        }
        
        // Limpar estados quando sai da fase DICE_ROLL 
        if (room.phase !== CombatPhase.DICE_ROLL) {
          setPendingAction(null)
          setPendingDefense(null)
          // APENAS resetar hasRolledDice quando volta para PLAYER_TURN (novo turno)
          if (room.phase === CombatPhase.PLAYER_TURN) {
            setHasRolledDice(false)
          }
        }
      })

      socket.on('room_closed', () => {
        console.log('� Sala fechada pelo criador')
        router.push('/combat-lobby')
      })

      socket.on('dice_rolled', (data: {playerId: string, sides: number, result: any}) => {
        console.log('🎲 Dado rolado:', data)
        // NÃO limpar pendingStates aqui - deixar o servidor controlar as fases
      })

      socket.on('action_selected', (data: {action: ActionType, diceType: number}) => {
        console.log('🎯 Ação selecionada:', data)
        // Não setamos pendingAction aqui - será setado apenas na fase DICE_ROLL
      })

      socket.on('damage_dealt', (data: {playerId: string, damage: number, newHp: number}) => {
        console.log('💔 Dano recebido:', data)
        // Atualizar HP localmente quando receber dano
        if (currentPlayer && data.playerId === currentPlayer.id) {
          setCurrentPlayer(prev => prev ? {
            ...prev,
            hp: Math.max(0, data.newHp)
          } : null)
        }
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
      
      // Entrar na sala via Socket.IO com role
      socket.emit('join_room', { 
        roomId, 
        player: playerData, 
        isCreator: isRoomCreator,
        role: userRole
      })
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
      socket.off('damage_dealt')
      socket.disconnect()
    }
  }, [socket, roomId, isRoomCreator, characterId])

  // 🔥 FORÇA re-render quando currentPlayer ou opponent mudam
  useEffect(() => {
    if (currentPlayerDisplay) {
      console.log('🔄 CurrentPlayerDisplay updated:', currentPlayerDisplay.name, `${currentPlayerDisplay.hp}/${currentPlayerDisplay.maxHp} HP, ${currentPlayerDisplay.mp}/${currentPlayerDisplay.maxMp} MP, ${currentPlayerDisplay.stamina}/${currentPlayerDisplay.maxStamina} ⚡`)
    }
    if (opponent) {
      console.log('🔄 Opponent updated:', opponent.name, `${opponent.hp}/${opponent.maxHp} HP, ${opponent.mp}/${opponent.maxMp} MP, ${opponent.stamina}/${opponent.maxStamina} ⚡`)
    }
  }, [currentPlayerDisplay?.hp, currentPlayerDisplay?.mp, currentPlayerDisplay?.stamina, opponent?.hp, opponent?.mp, opponent?.stamina])

  const toggleReady = () => {
    if (!currentPlayer) return
    setIsReady(!isReady)
    socket.emit('toggle_ready', { playerId: currentPlayer.id, roomId })
  }

  const handlePlayerAction = (action: ActionType) => {
    if (!currentPlayer) return
    
    // Verificar custos antes de enviar ação
    const mpCost = action === ActionType.SPECIAL_ATTACK ? 15 : 0
    const staminaCost = STAMINA_COSTS[action]
    
    if (mpCost > 0 && currentPlayer.mp < mpCost) {
      // Adicionar mensagem no chat
      socket.emit('chat_message', { 
        playerId: currentPlayer.id, 
        roomId, 
        message: `❌ MP insuficiente para ataque especial! (${mpCost} MP necessário)` 
      })
      return
    }
    
    if (staminaCost > 0 && currentPlayer.stamina < staminaCost) {
      // Adicionar mensagem no chat
      socket.emit('chat_message', { 
        playerId: currentPlayer.id, 
        roomId, 
        message: `❌ Stamina insuficiente para esta ação! (${staminaCost} stamina necessária)` 
      })
      return
    }
    
    // ✅ APLICAR CUSTOS LOCALMENTE IMEDIATAMENTE (como no sistema de dungeon)
    if (mpCost > 0) {
      setCurrentPlayer(prev => prev ? {
        ...prev,
        mp: Math.max(0, prev.mp - mpCost)
      } : null)
    }
    
    if (staminaCost > 0) {
      setCurrentPlayer(prev => prev ? {
        ...prev,
        stamina: Math.max(0, prev.stamina - staminaCost)
      } : null)
    }
    
    const diceTypes = {
      [ActionType.LIGHT_ATTACK]: 6,
      [ActionType.HEAVY_ATTACK]: 10,
      [ActionType.SPECIAL_ATTACK]: 20,
      [ActionType.DODGE]: 6,
      [ActionType.DEFEND]: 6,
      [ActionType.USE_ITEM]: 4
    }

    const diceType = diceTypes[action]
    
    // Enviar ação (que irá para OPPONENT_REACTION, não DICE_ROLL diretamente)
    socket.emit('player_action', { 
      playerId: currentPlayer.id, 
      roomId, 
      action, 
      diceType,
      mpCost,
      staminaCost
    })
  }

  const handleRollDice = (sides: number) => {
    if (!currentPlayer || !roomId || !combatRoom) return
    
    // VERIFICAÇÃO CRÍTICA: Não rolar se já rolou
    if (hasRolledDice) {
      console.log('Player já rolou o dado neste turno')
      return
    }
    
    // Na fase DICE_ROLL, ambos podem rolar o mesmo dado
    if (combatRoom?.phase === CombatPhase.DICE_ROLL && combatRoom?.pendingAction?.diceType === sides) {
      console.log('Rolando dado...', { playerId: currentPlayer.id, sides })
      
      // MARCAR IMEDIATAMENTE para prevenir cliques duplos
      setHasRolledDice(true)
      
      socket.emit('roll_dice', { 
        playerId: currentPlayer.id, 
        roomId, 
        sides, 
        action: combatRoom.pendingAction.action 
      })
      
      // Limpar os pending states após rolar
      if (pendingAction && pendingAction.diceType === sides) {
        setPendingAction(null)
      }
      if (pendingDefense && pendingDefense.diceType === sides) {
        setPendingDefense(null)
      }
    }
  }

  const handleDefenseChoice = (reaction: string) => {
    if (!currentPlayer) return
    
    // Verificar custo de stamina para defesa
    const actionType = reaction === 'dodge' ? ActionType.DODGE : ActionType.DEFEND
    const staminaCost = STAMINA_COSTS[actionType]
    
    if (staminaCost > 0 && currentPlayer.stamina < staminaCost) {
      // Adicionar mensagem no chat
      socket.emit('chat_message', { 
        playerId: currentPlayer.id, 
        roomId, 
        message: `❌ Stamina insuficiente para ${reaction === 'dodge' ? 'esquivar' : 'defender'}! (${staminaCost} stamina necessária)` 
      })
      return
    }
    
    // ✅ APLICAR CUSTO DE STAMINA LOCALMENTE IMEDIATAMENTE (como no sistema de dungeon)
    if (staminaCost > 0) {
      setCurrentPlayer(prev => prev ? {
        ...prev,
        stamina: Math.max(0, prev.stamina - staminaCost)
      } : null)
    }
    
    // Enviar escolha de defesa com custo de stamina
    socket.emit('opponent_reaction', { 
      playerId: currentPlayer.id, 
      roomId, 
      reaction,
      staminaCost
    })
  }

  const handleTransformation = () => {
    if (!currentPlayer || !characterId) return
    
    // Verificar se a raça pode transformar
    if (currentPlayer.race !== 'draconiano' && currentPlayer.race !== 'metamorfo') {
      socket.emit('chat_message', { 
        playerId: currentPlayer.id, 
        roomId, 
        message: `❌ Sua raça (${currentPlayer.race}) não possui transformações disponíveis!` 
      })
      return
    }
    
    // Abrir dialog de escolha de transformação
    setShowTransformationDialog(true)
  }

  const handleTransformationChoice = async (transformationType: string) => {
    if (!currentPlayer || !characterId) return
    
    setIsTransforming(true)
    
    try {
      // Primeiro, verificar e consumir stamina
      const staminaCost = transformationType === 'dragon' ? 50 : 
                        transformationType === 'bear' ? 40 :
                        transformationType === 'wolf' ? 35 : 30 // eagle
      
      const mpCost = transformationType === 'dragon' ? 40 : 
                   transformationType === 'bear' ? 30 :
                   transformationType === 'wolf' ? 25 : 20 // eagle

      // Verificar recursos antes de tentar transformar
      if (currentPlayer.stamina < staminaCost) {
        socket.emit('chat_message', { 
          playerId: currentPlayer.id, 
          roomId, 
          message: `❌ Stamina insuficiente para transformar! (${staminaCost} stamina necessária)` 
        })
        return
      }

      if (currentPlayer.mp < mpCost) {
        socket.emit('chat_message', { 
          playerId: currentPlayer.id, 
          roomId, 
          message: `❌ MP insuficiente para transformar! (${mpCost} MP necessário)` 
        })
        return
      }

      // Consumir stamina primeiro
      const staminaResponse = await fetch(`/api/character/${characterId}/update-stamina`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staminaCost })
      })

      if (!staminaResponse.ok) {
        const staminaError = await staminaResponse.json()
        socket.emit('chat_message', { 
          playerId: currentPlayer.id, 
          roomId, 
          message: `❌ Erro ao consumir stamina: ${staminaError.error}` 
        })
        return
      }

      // Atualizar stamina localmente
      setCurrentPlayer(prev => prev ? {
        ...prev,
        stamina: prev.stamina - staminaCost,
        mp: prev.mp - mpCost
      } : null)
      
      // Aplicar transformação
      const response = await fetch(`/api/character/${characterId}/transform`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transformationType })
      })
      
      if (response.ok) {
        const data = await response.json()
        const updatedCharacter = data.character
        
        // Atualizar dados do player com os novos stats transformados
        setCurrentPlayer(prev => prev ? {
          ...prev,
          ...updatedCharacter,
          // Preservar dados de combate atualizados (CRÍTICO: manter HP atual do combate)
          hp: prev.hp, // 🔥 CORREÇÃO: Preservar HP atual do combate, não resetar
          stamina: prev.stamina - staminaCost,
          mp: prev.mp - mpCost,
          // Aplicar stats transformados do baseStats
          maxHp: updatedCharacter.maxHp, // Pode aumentar maxHP mas não resetar HP atual
          attack: updatedCharacter.baseStats?.attack || prev.attack,
          defense: updatedCharacter.baseStats?.defense || prev.defense,
          strength: updatedCharacter.baseStats?.str || prev.strength,
          agility: updatedCharacter.baseStats?.agi || prev.agility,
          intelligence: updatedCharacter.baseStats?.int || prev.intelligence,
          critical: updatedCharacter.baseStats?.critical || prev.critical,
          isTransformed: true,
          transformationType: transformationType,
          transformationData: updatedCharacter.transformationData
        } : null)
        
        // Notificar sala sobre transformação
        const transformationName = transformationType === 'dragon' ? 'Dragão 🐉' :
                                 transformationType === 'wolf' ? 'Lobo 🐺' :
                                 transformationType === 'bear' ? 'Urso 🐻' : 'Águia 🦅'
        
        socket.emit('chat_message', { 
          playerId: currentPlayer.id, 
          roomId, 
          message: `🌟 ${currentPlayer.name} se transformou em ${transformationName}! (+${data.transformation.duration} turnos)` 
        })
        
        // Perder o turno (transformação custa o turno)
        socket.emit('end_turn', { playerId: currentPlayer.id, roomId })
      } else {
        const error = await response.json()
        socket.emit('chat_message', { 
          playerId: currentPlayer.id, 
          roomId, 
          message: `❌ Transformação falhou: ${error.error}` 
        })
      }
    } catch (error) {
      console.error('Erro ao transformar:', error)
      socket.emit('chat_message', { 
        playerId: currentPlayer.id, 
        roomId, 
        message: `❌ Erro inesperado na transformação` 
      })
    } finally {
      setIsTransforming(false)
    }
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
            <h2 className="text-sm sm:text-lg font-bold">
              ⚔️ Combate PvP - Sala {roomId}
              {isSpectator && <span className="ml-2 text-xs bg-blue-500/30 px-2 py-1 rounded-full">👁️ Espectador</span>}
              {isModerator && <span className="ml-2 text-xs bg-purple-500/30 px-2 py-1 rounded-full">🛡️ Moderador</span>}
            </h2>
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
              <h3 className="font-bold text-success mb-2 text-xs sm:text-sm">
                {isSpectator ? combatRoom?.player1?.name || 'Lutador 1' : `${currentPlayerDisplay?.name} (Você)`}
                {isSpectator && <span className="ml-1 text-xs">⚔️</span>}
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 text-xs">
                <div className="text-text-secondary">HP: <span className="font-bold text-error">{isSpectator ? combatRoom?.player1?.hp : currentPlayerDisplay?.hp}/{isSpectator ? combatRoom?.player1?.maxHp : currentPlayerDisplay?.maxHp}</span></div>
                <div className="text-text-secondary">MP: <span className="font-bold text-blue-400">{isSpectator ? combatRoom?.player1?.mp : currentPlayerDisplay?.mp}/{isSpectator ? combatRoom?.player1?.maxMp : currentPlayerDisplay?.maxMp}</span></div>
                <div className="text-text-secondary">⚡: <span className="font-bold text-yellow-400">{isSpectator ? combatRoom?.player1?.stamina : currentPlayerDisplay?.stamina}/{isSpectator ? combatRoom?.player1?.maxStamina : currentPlayerDisplay?.maxStamina}</span></div>
                <div className="text-text-secondary">LVL: <span className="font-bold text-primary">{isSpectator ? combatRoom?.player1?.level : currentPlayerDisplay?.level}</span></div>
                <div className="text-text-secondary">ATK: <span className="font-bold text-text-primary">{isSpectator ? combatRoom?.player1?.attack : currentPlayerDisplay?.attack}</span></div>
                <div className="text-text-secondary">DEF: <span className="font-bold text-text-primary">{isSpectator ? combatRoom?.player1?.defense : currentPlayerDisplay?.defense}</span></div>
                <div className="text-text-secondary hidden sm:block">STR: <span className="font-bold text-yellow-400">{isSpectator ? combatRoom?.player1?.strength : currentPlayerDisplay?.strength}</span></div>
                <div className="text-text-secondary hidden sm:block">AGI: <span className="font-bold text-cyan-400">{isSpectator ? combatRoom?.player1?.agility : currentPlayerDisplay?.agility}</span></div>
                <div className="text-text-secondary hidden sm:block">INT: <span className="font-bold text-purple-400">{isSpectator ? combatRoom?.player1?.intelligence : currentPlayerDisplay?.intelligence}</span></div>
                <div className="text-text-secondary hidden sm:block">RES: <span className="font-bold text-green-400">{isSpectator ? combatRoom?.player1?.resistance : currentPlayerDisplay?.resistance}</span></div>
                <div className="text-text-secondary hidden sm:block">CRIT: <span className="font-bold text-yellow-300">{playerStats.critChance}%</span></div>
                <div className="text-text-secondary hidden sm:block">ESQ: <span className="font-bold text-cyan-300">+{playerStats.dodgeBonus}🎲</span></div>
                <div className="text-text-secondary hidden sm:block">ESP: <span className="font-bold text-purple-300">{playerStats.specialType}</span></div>
              </div>
            </div>

            {/* Opponent Status */}
            <div className="bg-gradient-to-br from-error/20 to-error/10 border border-error/30 rounded-xl p-2 sm:p-3 flex-1 sm:ml-3 backdrop-blur-sm">
              {(opponent || combatRoom?.player2) ? (
                <>
                  <h3 className="font-bold text-error mb-2 text-xs sm:text-sm">
                    {isSpectator ? combatRoom?.player2?.name || 'Lutador 2' : `${opponent?.name} (Oponente)`}
                    {isSpectator && <span className="ml-1 text-xs">⚔️</span>}
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 text-xs">
                    <div className="text-text-secondary">HP: <span className="font-bold text-error">{isSpectator ? combatRoom?.player2?.hp : opponent?.hp}/{isSpectator ? combatRoom?.player2?.maxHp : opponent?.maxHp}</span></div>
                    <div className="text-text-secondary">MP: <span className="font-bold text-blue-400">{isSpectator ? combatRoom?.player2?.mp : opponent?.mp}/{isSpectator ? combatRoom?.player2?.maxMp : opponent?.maxMp}</span></div>
                    <div className="text-text-secondary">⚡: <span className="font-bold text-yellow-400">{isSpectator ? combatRoom?.player2?.stamina : opponent?.stamina}/{isSpectator ? combatRoom?.player2?.maxStamina : opponent?.maxStamina}</span></div>
                    <div className="text-text-secondary">LV: <span className="font-bold text-text-primary">{isSpectator ? combatRoom?.player2?.level : opponent?.level}</span></div>
                    <div className="text-text-secondary">ATK: <span className="font-bold text-text-primary">{isSpectator ? combatRoom?.player2?.attack : opponent?.attack}</span></div>
                    <div className="text-text-secondary">DEF: <span className="font-bold text-text-primary">{isSpectator ? combatRoom?.player2?.defense : opponent?.defense}</span></div>
                    <div className="text-text-secondary hidden sm:block">STR: <span className="font-bold text-yellow-400">{isSpectator ? combatRoom?.player2?.strength : opponent?.strength}</span></div>
                    <div className="text-text-secondary hidden sm:block">AGI: <span className="font-bold text-cyan-400">{isSpectator ? combatRoom?.player2?.agility : opponent?.agility}</span></div>
                    <div className="text-text-secondary hidden sm:block">INT: <span className="font-bold text-purple-400">{isSpectator ? combatRoom?.player2?.intelligence : opponent?.intelligence}</span></div>
                    <div className="text-text-secondary hidden sm:block">CRIT: <span className="font-bold text-yellow-300">{opponentStats.critChance}%</span></div>
                    <div className="text-text-secondary hidden sm:block">ESQ: <span className="font-bold text-cyan-300">+{opponentStats.dodgeBonus}🎲</span></div>
                    <div className="text-text-secondary hidden sm:block">ESP: <span className="font-bold text-purple-300">{opponentStats.specialType}</span></div>
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

          {/* Participants Panel - Só para espectadores/moderadores */}
          {(isSpectator || isModerator) && combatRoom?.participants && (
            <div className="bg-background/20 border-b border-white/10 p-2 sm:p-3 flex-shrink-0">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                {/* Lutadores */}
                <div className="bg-surface/30 rounded-lg p-2">
                  <h4 className="font-bold text-red-400 mb-1">⚔️ Lutadores ({combatRoom.participants.fighters.length}/2)</h4>
                  {combatRoom.participants.fighters.map((fighter, index) => (
                    <div key={fighter.id} className="text-text-secondary">
                      {fighter.name} (Nv.{fighter.level})
                    </div>
                  ))}
                </div>
                
                {/* Espectadores */}
                <div className="bg-surface/30 rounded-lg p-2">
                  <h4 className="font-bold text-blue-400 mb-1">👁️ Espectadores ({combatRoom.participants.spectators.length}/8)</h4>
                  <div className="max-h-16 overflow-y-auto">
                    {combatRoom.participants.spectators.map((spectator, index) => (
                      <div key={spectator.id} className="text-text-secondary">
                        {spectator.name}
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Moderadores */}
                <div className="bg-surface/30 rounded-lg p-2">
                  <h4 className="font-bold text-purple-400 mb-1">🛡️ Moderadores ({combatRoom.participants.moderators.length}/2)</h4>
                  {combatRoom.participants.moderators.map((moderator, index) => (
                    <div key={moderator.id} className="text-text-secondary">
                      {moderator.name}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

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
            <div className="order-1 sm:order-3 w-full sm:w-64 bg-surface/30 p-2 sm:p-4 flex flex-col flex-shrink-0 space-y-4">
              <h3 className="font-bold text-text-primary mb-2 sm:mb-3 text-xs sm:text-sm text-center">
                {isSpectator ? '👁️ Espectando' : isModerator ? '🛡️ Moderando' : '🎯 Ações'}
              </h3>
              
              {isSpectator ? (
                // Interface para espectadores
                <div className="text-center space-y-3">
                  <div className="bg-blue-500/20 border border-blue-500/30 rounded-lg p-3">
                    <div className="text-sm text-blue-300 mb-2">Modo Espectador</div>
                    <div className="text-xs text-text-secondary">
                      Você está assistindo ao combate. Use o chat para conversar com outros espectadores!
                    </div>
                  </div>
                  
                  {combatRoom?.phase === CombatPhase.COMBAT_END && (
                    <button
                      onClick={() => router.push('/combat-lobby')}
                      className="bg-primary hover:bg-primary-dark text-white px-6 py-2 rounded-lg w-full transition-colors"
                    >
                      Voltar ao Lobby
                    </button>
                  )}
                </div>
              ) : isModerator ? (
                // Interface para moderadores (futura)
                <div className="text-center space-y-3">
                  <div className="bg-purple-500/20 border border-purple-500/30 rounded-lg p-3">
                    <div className="text-sm text-purple-300 mb-2">Modo Moderador</div>
                    <div className="text-xs text-text-secondary">
                      Funcionalidades de moderação em desenvolvimento...
                    </div>
                  </div>
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
                    disabled={!currentPlayer || currentPlayer.stamina < STAMINA_COSTS[ActionType.LIGHT_ATTACK]}
                    className={`w-full ${!currentPlayer || currentPlayer.stamina < STAMINA_COSTS[ActionType.LIGHT_ATTACK] 
                      ? 'bg-gray-600 opacity-50 cursor-not-allowed' 
                      : 'bg-gradient-to-r from-warning to-yellow-500 hover:from-yellow-500 hover:to-warning'
                    } text-white py-2 sm:py-2 px-4 rounded-lg font-bold text-xs sm:text-sm transition-all duration-200 transform hover:scale-[1.02] shadow-lg`}
                  >
                    👊 Ataque Leve (d6, {STAMINA_COSTS[ActionType.LIGHT_ATTACK]}⚡)
                  </button>
                  <button
                    onClick={() => handlePlayerAction(ActionType.HEAVY_ATTACK)}
                    disabled={!currentPlayer || currentPlayer.stamina < STAMINA_COSTS[ActionType.HEAVY_ATTACK]}
                    className={`w-full ${!currentPlayer || currentPlayer.stamina < STAMINA_COSTS[ActionType.HEAVY_ATTACK] 
                      ? 'bg-gray-600 opacity-50 cursor-not-allowed' 
                      : 'bg-gradient-to-r from-error to-red-600 hover:from-red-600 hover:to-error'
                    } text-white py-2 sm:py-2 px-4 rounded-lg font-bold text-xs sm:text-sm transition-all duration-200 transform hover:scale-[1.02] shadow-lg`}
                  >
                    ⚔️ Ataque Pesado (d10, {STAMINA_COSTS[ActionType.HEAVY_ATTACK]}⚡)
                  </button>
                  <button
                    onClick={() => handlePlayerAction(ActionType.SPECIAL_ATTACK)}
                    disabled={!currentPlayer || currentPlayer.mp < 15 || currentPlayer.stamina < STAMINA_COSTS[ActionType.SPECIAL_ATTACK]}
                    className={`w-full ${!currentPlayer || currentPlayer.mp < 15 || currentPlayer.stamina < STAMINA_COSTS[ActionType.SPECIAL_ATTACK]
                      ? 'bg-gray-600 opacity-50 cursor-not-allowed' 
                      : 'bg-gradient-to-r from-primary to-primary-dark hover:shadow-lg hover:shadow-primary/25'
                    } text-white py-2 sm:py-2 px-4 rounded-lg font-bold text-xs sm:text-sm transition-all duration-200 transform hover:scale-[1.02] shadow-lg`}
                  >
                    ✨ Especial ({playerStats.specialType}) (d20, 15🔮, {STAMINA_COSTS[ActionType.SPECIAL_ATTACK]}⚡)
                  </button>
                  
                  <div className="border-t border-white/10 my-3"></div>
                  
                  <button
                    onClick={() => handlePlayerAction(ActionType.USE_ITEM)}
                    className="w-full bg-gradient-to-r from-success to-emerald-600 hover:from-emerald-600 hover:to-success text-white py-2 sm:py-2 px-4 rounded-lg font-bold text-xs sm:text-sm transition-all duration-200 transform hover:scale-[1.02] shadow-lg"
                  >
                    🧪 Consumíveis
                  </button>
                  
                  {/* Botão de Transformação */}
                  {currentPlayer && (currentPlayer.race === 'draconiano' || currentPlayer.race === 'metamorfo') && (
                    <button
                      onClick={handleTransformation}
                      disabled={
                        currentPlayer.isTransformed || 
                        (currentPlayer.transformationData?.cooldownTurns || 0) > 0 ||
                        isTransforming ||
                        // Verificar recursos mínimos (assumindo dragon como mais caro)
                        currentPlayer.stamina < 30 || 
                        currentPlayer.mp < 20
                      }
                      className={`w-full ${
                        currentPlayer.isTransformed || 
                        (currentPlayer.transformationData?.cooldownTurns || 0) > 0 ||
                        isTransforming ||
                        currentPlayer.stamina < 30 || 
                        currentPlayer.mp < 20
                        ? 'bg-gray-600 opacity-50 cursor-not-allowed' 
                        : 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-blue-600 hover:to-purple-600'
                      } text-white py-2 sm:py-2 px-4 rounded-lg font-bold text-xs sm:text-sm transition-all duration-200 transform hover:scale-[1.02] shadow-lg`}
                    >
                      {currentPlayer.isTransformed ? 
                        '🐉 Já Transformado' :
                        (currentPlayer.transformationData?.cooldownTurns || 0) > 0 ?
                        `⏰ Cooldown (${currentPlayer.transformationData?.cooldownTurns || 0})` :
                        isTransforming ? '⏳ Transformando...' :
                        currentPlayer.stamina < 30 || currentPlayer.mp < 20 ?
                        '❌ Recursos insuficientes' :
                        currentPlayer.race === 'draconiano' ? 
                        '🐉 Transformar (50⚡ 40🔮)' :
                        '🔄 Transformar (30⚡ 20🔮)'
                      }
                    </button>
                  )}
                </div>
              ) : combatRoom?.phase === CombatPhase.OPPONENT_REACTION && !isMyTurn ? (
                <div className="space-y-2">
                  <div className="text-center text-warning font-bold text-sm mb-3">
                    🛡️ Escolha sua defesa:
                  </div>
                  <button
                    onClick={() => handleDefenseChoice('dodge')}
                    disabled={!currentPlayer || currentPlayer.stamina < STAMINA_COSTS[ActionType.DODGE]}
                    className={`w-full ${!currentPlayer || currentPlayer.stamina < STAMINA_COSTS[ActionType.DODGE]
                      ? 'bg-gray-600 opacity-50 cursor-not-allowed'
                      : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-blue-600 hover:to-cyan-600'
                    } text-white py-2 px-4 rounded-lg font-bold text-sm transition-all duration-200 transform hover:scale-[1.02] shadow-lg`}
                  >
                    🌪️ Esquivar (+{playerStats.dodgeBonus}🎲, {STAMINA_COSTS[ActionType.DODGE]}⚡)
                  </button>
                  <button
                    onClick={() => handleDefenseChoice('defend')}
                    disabled={!currentPlayer || currentPlayer.stamina < STAMINA_COSTS[ActionType.DEFEND]}
                    className={`w-full ${!currentPlayer || currentPlayer.stamina < STAMINA_COSTS[ActionType.DEFEND]
                      ? 'bg-gray-600 opacity-50 cursor-not-allowed'
                      : 'bg-gradient-to-r from-emerald-600 to-green-600 hover:from-green-600 hover:to-emerald-600'
                    } text-white py-2 px-4 rounded-lg font-bold text-sm transition-all duration-200 transform hover:scale-[1.02] shadow-lg`}
                  >
                    🛡️ Defender ({STAMINA_COSTS[ActionType.DEFEND]}⚡)
                  </button>
                </div>
              ) : (
                <div className="text-center text-text-secondary font-bold text-xs flex-1 flex items-center justify-center">
                  {combatRoom?.phase === CombatPhase.OPPONENT_REACTION ? '⚔️ Oponente escolhendo defesa...' : 
                   !isMyTurn ? '⏳ Turno do oponente...' : '⚔️ Executando ação...'}
                </div>
              )}
            </div>

            {/* Combat Log removido - agora tudo está unificado no chat */}
          </div>

          {/* Dice Panel - SÓ aparece na fase DICE_ROLL */}
          {combatRoom?.phase === CombatPhase.DICE_ROLL && combatRoom?.pendingAction && (
            <div className="bg-gradient-to-br from-surface/95 to-background/90 backdrop-blur-md border-t border-white/10 p-2 sm:p-3 flex-shrink-0">
              <h3 className="text-text-primary font-bold text-center mb-2 text-xs sm:text-sm">
                {hasRolledDice 
                  ? '✅ Você já rolou! Aguardando oponente...' 
                  : `🎲 Role o dado ${combatRoom?.pendingAction?.diceType === 6 ? 'leve' : combatRoom?.pendingAction?.diceType === 10 ? 'pesado' : 'especial'} (d${combatRoom?.pendingAction?.diceType})`
                }
              </h3>
              <div className="flex justify-center space-x-2 sm:space-x-3 flex-wrap">
                {[4, 6, 8, 10, 12, 20].map((sides) => {
                  const correctDiceType = combatRoom?.pendingAction?.diceType
                  const isCorrectDice = correctDiceType === sides
                  
                  // Função para cores dos dados (mesma do sistema de dungeon)
                  const getDiceColor = (sides: number) => {
                    switch (sides) {
                      case 4: return 'bg-red-600'
                      case 6: return 'bg-blue-600'
                      case 8: return 'bg-green-600'
                      case 10: return 'bg-yellow-600'
                      case 12: return 'bg-purple-600'
                      case 20: return 'bg-pink-600'
                      default: return 'bg-gray-600'
                    }
                  }
                  
                  return (
                    <button
                      key={sides}
                      onClick={() => handleRollDice(sides)}
                      disabled={!isCorrectDice || hasRolledDice}
                      className={`
                        w-10 h-10 sm:w-12 sm:h-12 rounded-lg text-white font-bold text-xs
                        transition-all duration-200 transform
                        ${hasRolledDice && isCorrectDice
                          ? 'bg-success opacity-75 cursor-not-allowed scale-95' // Verde se já rolou
                          : isCorrectDice 
                          ? `hover:scale-110 cursor-pointer ${getDiceColor(sides)}` 
                          : `opacity-50 cursor-not-allowed ${getDiceColor(sides)}`
                        }
                      `}
                    >
                      {hasRolledDice && isCorrectDice ? '✓' : `d${sides}`}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Dialog de Transformação */}
      <TransformationDialog
        isOpen={showTransformationDialog}
        onClose={() => setShowTransformationDialog(false)}
        characterRace={currentPlayer?.race || ''}
        onTransform={handleTransformationChoice}
        loading={isTransforming}
      />
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
