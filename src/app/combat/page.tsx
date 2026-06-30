'use client'

import { useEffect, useState, useRef, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { X, Users, Sword, Shield, Zap, Heart, Sparkles } from 'lucide-react'
import { io, Socket } from 'socket.io-client'
import TransformationDialog from '@/components/TransformationDialog'
import BattleScene, { BattleEvent, DiceResult, EquipmentMap, FighterView } from '@/components/battle/BattleScene'
import { TRANSFORMATION_CONFIG, getRaceTransformations, type TransformationType } from '@/lib/transformationSystem'
import { TRANSFORM_SCALE, classAttackName } from '@/lib/combatModel'

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
  avatar?: string | null
  equipmentMap?: EquipmentMap
  // ⚔️ Levers do modelo enxuto, computados pelo servidor no join (poder/armadura/hp/evasão).
  levers?: { power: number; armor: number; hp: number; evade: number; K: number; scale: number }
  isReady: boolean
  isConnected: boolean
  isAlive: boolean
  // Campos de transformação
  isTransformed?: boolean
  transformationType?: string | null
  unlockedTransformation?: string | null
  transformationImage?: string | null
  // Metamorfo: mapa forma->imagem (escolhe a forma em combate).
  transformationImages?: Record<string, string> | null
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

// 🐉 Custos e cooldown dos especiais de transformação — DEVE espelhar SPECIAL_DEFS
// em server/socket-server.js (o servidor é a autoridade; isto é só p/ a UI gatear/exibir).
const SPECIAL_COST: Record<string, { stamina?: number; mp?: number; cd: number }> = {
  dragon_breath: { mp: 12, cd: 2 }, dragon_scales: { mp: 8, cd: 4 },
  bite_bleeding: { mp: 12, cd: 2 }, wild_fury: { mp: 8, cd: 4 },
  unstoppable_charge: { mp: 12, cd: 2 }, bear_guard: { mp: 8, cd: 4 },
  ascending_spiral: { mp: 12, cd: 2 }, eagle_swift: { mp: 8, cd: 4 },
  cosmo_burst: { mp: 12, cd: 2 }, meditation: { mp: 8, cd: 4 },
  super_nova: { mp: 12, cd: 2 }, hyperfocus: { mp: 8, cd: 4 },
}

// ⚔️ NOVO KIT: ataques custam MP (Golpe 0 / Ataque de Classe 8) e rolam o SEU dado
// (Golpe d6 / Classe d8). Espelha CM.ATTACKS.mp e CM.PVE_DIE no servidor.
const ATTACK_MP: Record<string, number> = { light_attack: 0, heavy_attack: 8 }
const ATTACK_DIE: Record<string, number> = { light_attack: 6, heavy_attack: 8 }

// Função para criar conexão Socket.IO real
function createSocketConnection(): Socket {
  // URL do servidor WebSocket do Railway em produção
  const socketUrl = process.env.NODE_ENV === 'production' 
    ? (process.env.NEXT_PUBLIC_SOCKET_URL || 'https://terrific-prosperity-production-0402.up.railway.app')
    : 'ws://localhost:3001'
    
  console.log('🔗 Conectando ao WebSocket:', socketUrl)
    
  return io(socketUrl, {
    transports: ['websocket', 'polling'],
    timeout: 20000,
    forceNew: true,
    autoConnect: true
  })
}

// Mapeia o array de CharacterEquipment (Prisma) para um mapa por slot com imagem/stats
function mapEquipment(equipArray: any[]): EquipmentMap {
  const map: EquipmentMap = {}
  for (const eq of equipArray || []) {
    if (eq?.slot && eq?.item) {
      map[eq.slot] = {
        id: eq.item.id,
        name: eq.item.name,
        image: eq.item.image,
        type: eq.item.type,
        stats: eq.item.stats || {},
        enhancementLevel: eq.enhancementLevel || 0,
      }
    }
  }
  return map
}

interface HotbarItem {
  itemId: string
  name: string
  image?: string | null
  icon: string
  quantity: number
  hpRestore: number
  mpRestore: number
  staminaRestore: number
}

function consumableIcon(name: string, stats: any): string {
  const n = (name || '').toLowerCase()
  if (stats?.healAmount || stats?.hp_restore || n.includes('vida') || n.includes('health')) return '❤️'
  if (stats?.manaAmount || stats?.mp_restore || n.includes('mana')) return '🔮'
  if (stats?.staminaAmount || stats?.stamina_restore || n.includes('stamina')) return '⚡'
  if (n.includes('elixir')) return '💖'
  return '🧪'
}

function CombatPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const roomId = searchParams?.get('room') || 'default'
  const characterId = searchParams?.get('character')
  const isRoomCreator = searchParams?.get('creator') === 'true'
  const userRole = searchParams?.get('role') || 'fighter' // Novo parâmetro de role
  const isTraining = searchParams?.get('training') === 'true' // 🐉 Modo treino vs monstro
  const trainingMonster = searchParams?.get('monster') || 'goblin'

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
  // 🐉 Transformação é 1× POR LUTA: trava após o primeiro uso na partida atual.
  const [usedTransformThisMatch, setUsedTransformThisMatch] = useState(false)
  // Nova sala/partida → libera o uso único de novo.
  useEffect(() => { setUsedTransformThisMatch(false) }, [roomId])

  // 🎬 Estados da cena de batalha visual (estilo Adventure Quest)
  const [battleEvent, setBattleEvent] = useState<BattleEvent | null>(null)
  const battleEventCounter = useRef(0)
  const [diceResults, setDiceResults] = useState<Record<string, DiceResult | undefined>>({})
  const [consumables, setConsumables] = useState<HotbarItem[]>([])

  const pushBattleEvent = (data: Omit<BattleEvent, 'id'>) => {
    battleEventCounter.current += 1
    setBattleEvent({ ...data, id: battleEventCounter.current })
  }

  // Custos de stamina por ação (modelo enxuto: básico 1 / arma 2 / especial 3; defesa 3)
  const STAMINA_COSTS = {
    [ActionType.LIGHT_ATTACK]: 1,   // Básico: 1 stamina
    [ActionType.HEAVY_ATTACK]: 2,   // Arma: 2 stamina
    [ActionType.SPECIAL_ATTACK]: 3, // Especial: 3 stamina
    [ActionType.DODGE]: 3,          // Esquivar: 3 stamina
    [ActionType.DEFEND]: 3,         // Bloquear: 3 stamina
    [ActionType.USE_ITEM]: 0        // Usar item: 0 stamina
  }

  const combatLogRef = useRef<HTMLDivElement>(null)

  const opponent = combatRoom?.player1?.id === currentPlayer?.id ? combatRoom?.player2 : combatRoom?.player1
  // 🔥 CORREÇÃO: Card verde deve usar dados do combatRoom igual ao vermelho
  const currentPlayerDisplay = combatRoom?.player1?.id === currentPlayer?.id ? combatRoom?.player1 : combatRoom?.player2
  // O objeto do socket (combatRoom.player1/2) não carrega a arte da transformação
  // nem a forma travada (campos novos, não sincronizados pelo servidor de socket).
  // A transformação em si (handleTransformationChoice) também não emite nenhum evento
  // de socket — só chama a API REST e atualiza o estado local — então o servidor de
  // socket NUNCA marca isTransformed/transformationType no objeto da sala. Por isso
  // esses dois campos também precisam vir do currentPlayer (estado local), senão o
  // glow/imagem nunca aparecem (mesclar só avatar/transformationImage não bastava).
  const currentPlayerView = currentPlayerDisplay
    ? {
        ...currentPlayerDisplay,
        avatar: currentPlayerDisplay.avatar ?? currentPlayer?.avatar ?? null,
        transformationImage:
          currentPlayer?.transformationImage ?? currentPlayerDisplay.transformationImage ?? null,
        unlockedTransformation:
          currentPlayer?.unlockedTransformation ?? currentPlayerDisplay.unlockedTransformation ?? null,
        isTransformed: currentPlayer?.isTransformed ?? currentPlayerDisplay.isTransformed ?? false,
        transformationType:
          currentPlayer?.transformationType ?? currentPlayerDisplay.transformationType ?? null,
      }
    : currentPlayer
  const isMyTurn = combatRoom?.currentTurn === currentPlayer?.id
  const isWinner = combatRoom?.winner === currentPlayer?.id
  const isCreator = combatRoom?.creator === currentPlayer?.id
  const isSpectator = userRole === 'spectator'
  const isModerator = userRole === 'moderator'

  // 🎯 CÁLCULOS DE EXIBIÇÃO (modelo enxuto): crítico = rolagem máxima do d12 (fixo),
  // evasão = lever da classe, poder = lever de ataque.
  const calculateDisplayStats = (player: Player | null | undefined) => {
    if (!player) return { critChance: 0, evade: 0, power: 0 }

    const critChance = Math.round(100 / 12) // rolagem máxima do d12 ≈ 8%
    const evade = Math.round((player.levers?.evade || 0) * 100)
    const power = Math.round(player.levers?.power || 0)

    return { critChance, evade, power }
  }

  const playerStats = calculateDisplayStats(currentPlayerDisplay)
  const opponentStats = calculateDisplayStats(opponent)

  // ⚔️ PODER / ARMADURA / HP exibidos no card de cada lutador (modelo enxuto, dos levers
  // computados pelo servidor). O delta entre parênteses é o ganho da transformação
  // (buff simétrico ×TRANSFORM_SCALE). Fallback p/ atributos crus se ainda não houver levers.
  const withFighterStats = (p: Player | null | undefined): FighterView | null => {
    if (!p) return null
    if (p.levers) {
      const round = (v: number) => Math.round(v || 0)
      const delta = (v: number) => (p.isTransformed ? round(v) - round(v / TRANSFORM_SCALE) : 0)
      return {
        ...p,
        combatStats: {
          ad: round(p.levers.power), adDelta: delta(p.levers.power),
          ap: round(p.levers.armor), apDelta: delta(p.levers.armor),
          dp: round(p.levers.hp), dpDelta: delta(p.levers.hp),
        },
      }
    }
    // Fallback (sem levers ainda): mostra os atributos crus, sem delta.
    return {
      ...p,
      combatStats: {
        ad: Math.round(p.attack || 0), adDelta: 0,
        ap: Math.round(p.defense || 0), apDelta: 0,
        dp: Math.round(p.maxHp || 0), dpDelta: 0,
      },
    }
  }

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

      // Reconectar caso o cleanup anterior tenha desconectado (StrictMode em dev)
      if (!socket.connected) {
        socket.connect()
      }

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
            // Limpar mini-dados com um pequeno atraso para a revelação terminar
            setTimeout(() => setDiceResults({}), 1300)
          }
        }
      })

      socket.on('room_closed', () => {
        console.log('� Sala fechada pelo criador')
        router.push('/combat-lobby')
      })

      socket.on('dice_rolled', (data: {playerId: string, sides: number, result: any}) => {
        console.log('🎲 Dado rolado:', data)
        // Mostrar o resultado do dado na cena de batalha
        setDiceResults(prev => ({
          ...prev,
          [data.playerId]: {
            sides: data.sides,
            roll: data.result?.roll ?? data.result,
            modifier: data.result?.modifier ?? 0,
            total: data.result?.total ?? data.result?.roll ?? data.result
          }
        }))
      })

      // 🎬 Resultado completo da ação - dispara animações na arena
      socket.on('action_resolved', (data: {
        attackerId: string, defenderId: string, action: string,
        defenseAction: string, hit: boolean, damage: number, isCritical: boolean
      }) => {
        console.log('🎬 Ação resolvida:', data)
        pushBattleEvent({
          kind: 'resolve',
          attackerId: data.attackerId,
          defenderId: data.defenderId,
          action: data.action,
          defenseAction: data.defenseAction,
          hit: data.hit,
          damage: data.damage,
          isCritical: data.isCritical
        })
      })

      // 🧪 Consumível usado - animação de cura + sincronizar recursos locais
      socket.on('consumable_used', (data: {
        playerId: string, itemName: string,
        hpRestored: number, mpRestored: number, staminaRestored: number,
        newHp: number, newMp: number, newStamina: number
      }) => {
        console.log('🧪 Consumível usado:', data)
        pushBattleEvent({
          kind: 'item',
          actorId: data.playerId,
          itemName: data.itemName,
          hpRestored: data.hpRestored,
          mpRestored: data.mpRestored,
          staminaRestored: data.staminaRestored
        })
        // Sincronizar recursos locais (o handler de room_updated usa Math.min para MP/stamina)
        setCurrentPlayer(prev => prev && prev.id === data.playerId ? {
          ...prev,
          hp: data.newHp,
          mp: data.newMp,
          stamina: data.newStamina
        } : prev)
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
              // res pode não existir em personagens antigos — derivar da DEF
              resistance: charDetails.baseStats?.res ?? Math.floor((charDetails.baseStats?.def || 10) * 0.8),
              critical: charDetails.baseStats?.crit || 1.0,
              speed: charDetails.baseStats?.speed || 2.5,
              equipment: charDetails.equipment || {},
              avatar: charDetails.avatar || null,
              equipmentMap: mapEquipment(charDetails.equipment),
              // Transformação: forma travada + arte gerada (para glow e troca de imagem)
              isTransformed: charDetails.isTransformed || false,
              transformationType: charDetails.transformationType || null,
              unlockedTransformation: charDetails.unlockedTransformation || null,
              transformationImage: charDetails.transformationImage || null,
              transformationImages: charDetails.transformationImages || null,
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
        role: userRole,
        training: isTraining,
        monster: trainingMonster
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
      socket.off('action_resolved')
      socket.off('consumable_used')
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

  // 🧪 Carregar consumíveis de batalha para a hotbar
  useEffect(() => {
    if (!characterId || userRole !== 'fighter') return
    const loadConsumables = async () => {
      try {
        const response = await fetch(`/api/store/inventory?characterId=${characterId}`)
        if (!response.ok) return
        const inventoryData = await response.json()
        const items: HotbarItem[] = (Array.isArray(inventoryData) ? inventoryData : [])
          .filter((entry: any) => {
            const type = String(entry?.item?.type || '').toUpperCase()
            return type === 'CONSUMABLE' && entry.quantity > 0
          })
          .map((entry: any) => {
            const stats = entry.item.stats || {}
            return {
              itemId: entry.item.id,
              name: entry.item.name,
              image: entry.item.image,
              icon: consumableIcon(entry.item.name, stats),
              quantity: entry.quantity,
              hpRestore: Number(stats.healAmount || stats.hp_restore || 0),
              mpRestore: Number(stats.manaAmount || stats.mp_restore || 0),
              staminaRestore: Number(stats.staminaAmount || stats.stamina_restore || 0)
            }
          })
          .filter((item: HotbarItem) => item.hpRestore > 0 || item.mpRestore > 0 || item.staminaRestore > 0)
        setConsumables(items)
      } catch (error) {
        console.error('Erro ao carregar consumíveis:', error)
      }
    }
    loadConsumables()
  }, [characterId, userRole])

  // 🧪 Usar consumível direto da hotbar (consome o turno, como na regra atual)
  const handleUseConsumable = async (item: HotbarItem) => {
    if (!currentPlayer || !isMyTurn || combatRoom?.phase !== CombatPhase.PLAYER_TURN) return
    if (item.quantity <= 0) return

    // Evitar desperdício: checar se o efeito tem utilidade
    const hpFull = currentPlayer.hp >= currentPlayer.maxHp
    const mpFull = currentPlayer.mp >= currentPlayer.maxMp
    const staminaFull = currentPlayer.stamina >= currentPlayer.maxStamina
    const useless =
      (item.hpRestore > 0 || item.mpRestore > 0 || item.staminaRestore > 0) &&
      (item.hpRestore === 0 || hpFull) &&
      (item.mpRestore === 0 || mpFull) &&
      (item.staminaRestore === 0 || staminaFull)
    if (useless) {
      socket.emit('chat_message', {
        playerId: currentPlayer.id,
        roomId,
        message: `❌ ${item.name} não teria efeito agora!`
      })
      return
    }

    // Atualizar hotbar localmente
    setConsumables(prev =>
      prev
        .map(c => c.itemId === item.itemId ? { ...c, quantity: c.quantity - 1 } : c)
        .filter(c => c.quantity > 0)
    )

    // Servidor aplica o efeito, registra no log e passa o turno
    socket.emit('use_consumable', {
      playerId: currentPlayer.id,
      roomId,
      item: {
        itemId: item.itemId,
        name: item.name,
        hpRestore: item.hpRestore,
        mpRestore: item.mpRestore,
        staminaRestore: item.staminaRestore
      }
    })

    // Consumir do inventário persistente
    try {
      await fetch('/api/inventory/use-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: item.itemId, characterId })
      })
    } catch (error) {
      console.error('Erro ao consumir item do inventário:', error)
    }
  }

  const handlePlayerAction = (action: ActionType) => {
    if (!currentPlayer) return

    // 🐉 GATE DO ESPECIAL: só disponível com a transformação ativa.
    if (action === ActionType.SPECIAL_ATTACK && !currentPlayer.isTransformed) {
      socket.emit('chat_message', {
        playerId: currentPlayer.id,
        roomId,
        message: `❌ O Especial só pode ser usado transformado!`
      })
      return
    }

    // ⚔️ NOVO KIT: ATAQUES custam MP (Golpe 0 / Ataque de Classe 8) e rolam o SEU dado
    // (Golpe d6 / Classe d8). Demais ações (esquiva/defesa/item) custam STAMINA + d12.
    const isAttack = action in ATTACK_MP || action === ActionType.SPECIAL_ATTACK
    if (isAttack) {
      const mpCost = ATTACK_MP[action] ?? 0
      if (currentPlayer.mp < mpCost) {
        socket.emit('chat_message', {
          playerId: currentPlayer.id, roomId,
          message: `❌ MP insuficiente para esta ação! (${mpCost} MP necessário)`
        })
        return
      }
      if (mpCost > 0) setCurrentPlayer(prev => prev ? { ...prev, mp: Math.max(0, prev.mp - mpCost) } : null)
      socket.emit('player_action', {
        playerId: currentPlayer.id, roomId, action,
        diceType: ATTACK_DIE[action] ?? 12, mpCost, staminaCost: 0
      })
      return
    }

    const staminaCost = STAMINA_COSTS[action]
    if (staminaCost > 0 && currentPlayer.stamina < staminaCost) {
      socket.emit('chat_message', {
        playerId: currentPlayer.id, roomId,
        message: `❌ Stamina insuficiente para esta ação! (${staminaCost} stamina necessária)`
      })
      return
    }
    if (staminaCost > 0) {
      setCurrentPlayer(prev => prev ? { ...prev, stamina: Math.max(0, prev.stamina - staminaCost) } : null)
    }
    socket.emit('player_action', {
      playerId: currentPlayer.id, roomId, action,
      diceType: 12, mpCost: 0, staminaCost
    })
  }

  // 🐉 Usar habilidade especial da forma (dano DIRETO/utilitário — consome o turno,
  // sem disputa de dado). O servidor (use_special_ability) valida forma/custo/recarga.
  const handleSpecialAbility = (abilityId: string) => {
    if (!currentPlayer || !isMyTurn || combatRoom?.phase !== CombatPhase.PLAYER_TURN) return
    if (!currentPlayer.isTransformed) {
      socket.emit('chat_message', { playerId: currentPlayer.id, roomId, message: '❌ Os especiais só podem ser usados transformado!' })
      return
    }
    const cost = SPECIAL_COST[abilityId] || { stamina: 0, mp: 0, cd: 0 }
    const sCost = cost.stamina || 0, mCost = cost.mp || 0
    if (currentPlayer.stamina < sCost || currentPlayer.mp < mCost) {
      socket.emit('chat_message', { playerId: currentPlayer.id, roomId, message: `❌ Recursos insuficientes (${sCost ? `${sCost}⚡ ` : ''}${mCost ? `${mCost} MP` : ''})` })
      return
    }
    // Custo otimista (o servidor reconcilia via room_updated)
    setCurrentPlayer(prev => prev ? { ...prev, stamina: Math.max(0, prev.stamina - sCost), mp: Math.max(0, prev.mp - mCost) } : null)
    socket.emit('use_special_ability', { playerId: currentPlayer.id, roomId, abilityId })
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

    // 🐉 1× por luta: bloqueia uma segunda transformação na mesma partida.
    if (usedTransformThisMatch) {
      socket.emit('chat_message', {
        playerId: currentPlayer.id,
        roomId,
        message: '🔒 Você já se transformou nesta luta!'
      })
      return
    }

    // Verificar se a raça pode transformar
    if (getRaceTransformations(currentPlayer.race).length === 0) {
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
      // Primeiro, verificar e consumir stamina (custos vêm da config — fonte única)
      const cfg = TRANSFORMATION_CONFIG[transformationType as TransformationType]
      // Imagem da forma escolhida: metamorfo tem o mapa; demais raças têm a única.
      const formImage =
        currentPlayer.transformationImages?.[transformationType] ??
        currentPlayer.transformationImage ??
        null
      const staminaCost = cfg?.cost.stamina ?? 30
      const mpCost = cfg?.cost.mp ?? 20

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
          // Troca para a arte da forma escolhida (metamorfo muda por forma).
          transformationImage: formImage ?? prev.transformationImage ?? null,
          transformationData: updatedCharacter.transformationData
        } : null)

        // 🐉 1× por luta: marca como usada (não dá pra transformar de novo nesta partida).
        setUsedTransformThisMatch(true)

        // Sincronizar com o servidor de combate para que o OPONENTE também veja a
        // transformação (imagem/glow) — o servidor não sabe nada disso até aqui,
        // já que tudo acima foi feito via API REST, sem nenhum evento de socket.
        socket.emit('sync_transformation', {
          playerId: currentPlayer.id,
          roomId,
          transformationType,
          transformationName: cfg?.name,
          isTransformed: true,
          transformationImage: formImage ?? currentPlayer.transformationImage,
          unlockedTransformation: updatedCharacter.unlockedTransformation ?? currentPlayer.unlockedTransformation,
          transformationData: updatedCharacter.transformationData,
          duration: data.transformation.duration,
          stats: {
            maxHp: updatedCharacter.maxHp,
            maxMp: updatedCharacter.maxMp ?? currentPlayer.maxMp,
            mp: updatedCharacter.mp ?? (currentPlayer.mp - mpCost),
            stamina: currentPlayer.stamina - staminaCost,
            attack: updatedCharacter.baseStats?.attack ?? currentPlayer.attack,
            defense: updatedCharacter.baseStats?.defense ?? currentPlayer.defense,
            strength: updatedCharacter.baseStats?.str ?? currentPlayer.strength,
            agility: updatedCharacter.baseStats?.agi ?? currentPlayer.agility,
            intelligence: updatedCharacter.baseStats?.int ?? currentPlayer.intelligence,
            critical: updatedCharacter.baseStats?.critical ?? currentPlayer.critical,
          }
        })
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
              {isTraining ? '🏟️ Modo Treino' : `⚔️ Combate PvP - Sala ${roomId}`}
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
          {/* 🎬 Arena de Batalha - estilo Adventure Quest */}
          <BattleScene
            className="flex-1 min-h-[260px]"
            left={withFighterStats((isSpectator || isModerator ? combatRoom?.player1 : (currentPlayerView || currentPlayer)) || null)}
            right={withFighterStats((isSpectator || isModerator ? combatRoom?.player2 : opponent) || null)}
            currentTurnId={combatRoom?.currentTurn}
            winnerId={combatRoom?.winner || null}
            combatEnded={combatRoom?.phase === CombatPhase.COMBAT_END}
            event={battleEvent}
            diceResults={diceResults}
            dicePanel={
              isSpectator || isModerator ? null
              : combatRoom?.phase === CombatPhase.INITIATIVE_ROLL
                ? {
                    visible: true,
                    diceType: 20,
                    hasRolled: hasRolledInitiative,
                    label: '⚡ Iniciativa! Quem tirar mais no d20 começa',
                    onRoll: rollInitiative,
                    myResult: currentPlayer ? diceResults[currentPlayer.id] : null,
                    waitingForOpponent: opponent ? !diceResults[opponent.id] : false
                  }
              : combatRoom?.phase === CombatPhase.DICE_ROLL && combatRoom?.pendingAction &&
                !(combatRoom.pendingAction.defenseAction === 'exhausted' && !isMyTurn)
                ? {
                    visible: true,
                    diceType: combatRoom.pendingAction.diceType,
                    hasRolled: hasRolledDice,
                    label: combatRoom.pendingAction.defenseAction === 'exhausted'
                      ? `😮‍💨 Oponente exausto! Role o d${combatRoom.pendingAction.diceType}!`
                      : `🎲 Role o d${combatRoom.pendingAction.diceType}!`,
                    onRoll: () => handleRollDice(combatRoom.pendingAction.diceType),
                    myResult: currentPlayer ? diceResults[currentPlayer.id] : null,
                    waitingForOpponent: combatRoom.pendingAction.defenseAction === 'exhausted'
                      ? false
                      : (opponent ? !diceResults[opponent.id] : false)
                  }
                : null
            }
          />

          {/* Resumo compacto de atributos (CRIT/ESQ/ESP) */}
          {!isSpectator && !isModerator && currentPlayerDisplay && (
            <div className="bg-background/40 border-y border-white/10 px-2 py-1 flex items-center justify-center gap-3 text-[10px] text-text-secondary flex-shrink-0">
              <span>CRIT: <span className="font-bold text-yellow-300">{playerStats.critChance}%</span></span>
              <span>EVA: <span className="font-bold text-cyan-300">{playerStats.evade}%</span></span>
              <span>PWR: <span className="font-bold text-purple-300">{playerStats.power}</span></span>
              <span className="text-white/20">|</span>
              <span>Oponente → EVA: <span className="font-bold text-cyan-300/80">{opponentStats.evade}%</span></span>
              <span>PWR: <span className="font-bold text-yellow-300/80">{opponentStats.power}</span></span>
            </div>
          )}

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

          {/* Ações + Chat (abaixo da arena) */}
          <div className="flex-shrink-0 flex flex-col sm:flex-row min-h-0 max-h-[45vh] sm:max-h-[36vh]">
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
            <div className="order-1 sm:order-3 w-full sm:w-64 bg-surface/30 p-2 sm:p-4 flex flex-col flex-shrink-0 space-y-4 overflow-y-auto">
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
                <div className="text-center space-y-2 flex-1 flex flex-col items-center justify-center">
                  <div className="text-2xl animate-bounce">🎲</div>
                  <div className="text-xs sm:text-sm text-text-secondary">
                    {hasRolledInitiative ? 'Você já rolou! Aguardando oponente...' : 'Clique no dado na arena para rolar a iniciativa!'}
                  </div>
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
                  {/* 👊 Golpe (d6, grátis) — o ataque básico de todos */}
                  <button
                    onClick={() => handlePlayerAction(ActionType.LIGHT_ATTACK)}
                    disabled={!currentPlayer}
                    className={`w-full ${!currentPlayer
                      ? 'bg-gray-600 opacity-50 cursor-not-allowed'
                      : 'bg-gradient-to-r from-warning to-yellow-500 hover:from-yellow-500 hover:to-warning'
                    } text-white py-2 sm:py-2 px-4 rounded-lg font-bold text-xs sm:text-sm transition-all duration-200 transform hover:scale-[1.02] shadow-lg`}
                  >
                    👊 Golpe (d6, grátis)
                  </button>
                  {/* ⚔️ Ataque de Classe (d8, 8 MP) — nome por classe */}
                  <button
                    onClick={() => handlePlayerAction(ActionType.HEAVY_ATTACK)}
                    disabled={!currentPlayer || currentPlayer.mp < ATTACK_MP.heavy_attack}
                    className={`w-full ${!currentPlayer || currentPlayer.mp < ATTACK_MP.heavy_attack
                      ? 'bg-gray-600 opacity-50 cursor-not-allowed'
                      : 'bg-gradient-to-r from-error to-red-600 hover:from-red-600 hover:to-error'
                    } text-white py-2 sm:py-2 px-4 rounded-lg font-bold text-xs sm:text-sm transition-all duration-200 transform hover:scale-[1.02] shadow-lg`}
                  >
                    ⚔️ {classAttackName(currentPlayer?.class)} (d8, {ATTACK_MP.heavy_attack}🔵{currentPlayer && currentPlayer.mp < ATTACK_MP.heavy_attack ? ' · sem MP' : ''})
                  </button>

                  {/* 🐉 Habilidades especiais da FORMA (só transformado; consomem o turno, sem dado) */}
                  {currentPlayer?.isTransformed && currentPlayer.transformationType && (() => {
                    const form = currentPlayer.transformationType as TransformationType
                    const abilities = TRANSFORMATION_CONFIG[form]?.specialAbilities || []
                    const cds = (currentPlayerDisplay as { fx?: { abilityCd?: Record<string, number> } })?.fx?.abilityCd || {}
                    if (abilities.length === 0) return null
                    return (
                      <div className="mt-2 rounded-lg border border-purple-500/30 bg-purple-900/15 p-2">
                        <div className="text-[10px] text-purple-300 font-bold mb-1.5">🐉 Habilidades da Forma (usa o turno)</div>
                        <div className="space-y-1.5">
                          {abilities.map((ab) => {
                            const cost = SPECIAL_COST[ab.id] || { cd: 0 }
                            const sCost = cost.stamina || 0, mCost = cost.mp || 0
                            const cd = cds[ab.id] || 0
                            const disabled = !currentPlayer || cd > 0 || currentPlayer.stamina < sCost || currentPlayer.mp < mCost
                            const costLabel = cd > 0 ? `⏰${cd}` : `${sCost ? `${sCost}⚡` : ''}${sCost && mCost ? ' ' : ''}${mCost ? `${mCost}MP` : ''}`
                            return (
                              <button
                                key={ab.id}
                                onClick={() => handleSpecialAbility(ab.id)}
                                disabled={disabled}
                                title={ab.description}
                                className={`w-full flex items-center justify-between gap-2 ${disabled
                                  ? 'bg-gray-600 opacity-50 cursor-not-allowed'
                                  : 'bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-purple-600 hover:to-fuchsia-600'
                                } text-white py-1.5 px-3 rounded-lg font-bold text-[11px] transition-all duration-200`}
                              >
                                <span className="truncate">{ab.name}</span>
                                <span className="shrink-0 opacity-90">{costLabel}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })()}

                  <div className="border-t border-white/10 my-3"></div>

                  {consumables.length > 0 ? (
                    <div>
                      <div className="text-[10px] text-text-secondary font-bold mb-1.5">🧪 Consumíveis (usa o turno)</div>
                      <div className="flex gap-1.5 flex-wrap">
                        {consumables.map(item => (
                          <button
                            key={item.itemId}
                            onClick={() => handleUseConsumable(item)}
                            title={`${item.name}${item.hpRestore ? ` • +${item.hpRestore} HP` : ''}${item.mpRestore ? ` • +${item.mpRestore} MP` : ''}${item.staminaRestore ? ` • +${item.staminaRestore} ⚡` : ''}`}
                            className="relative w-10 h-10 rounded-lg bg-emerald-900/40 border border-emerald-500/40 hover:border-emerald-400 hover:scale-110 transition-all flex items-center justify-center overflow-hidden shadow-lg"
                          >
                            {item.image ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-lg">{item.icon}</span>
                            )}
                            <span className="absolute bottom-0 right-0 bg-black/80 text-white text-[9px] font-bold px-1 rounded-tl">
                              {item.quantity}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-[10px] text-text-secondary text-center">
                      🧪 Sem consumíveis de batalha
                    </div>
                  )}
                  
                  {/* Botão de Transformação (todas as raças têm uma forma) */}
                  {currentPlayer && getRaceTransformations(currentPlayer.race).length > 0 && (
                    <button
                      onClick={handleTransformation}
                      disabled={
                        currentPlayer.isTransformed ||
                        usedTransformThisMatch ||
                        (currentPlayer.transformationData?.cooldownTurns || 0) > 0 ||
                        isTransforming ||
                        // Verificar recursos mínimos (assumindo dragon como mais caro)
                        currentPlayer.stamina < 30 ||
                        currentPlayer.mp < 20
                      }
                      className={`w-full ${
                        currentPlayer.isTransformed ||
                        usedTransformThisMatch ||
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
                        usedTransformThisMatch ?
                        '🔒 Já usada nesta luta' :
                        (currentPlayer.transformationData?.cooldownTurns || 0) > 0 ?
                        `⏰ Cooldown (${currentPlayer.transformationData?.cooldownTurns || 0})` :
                        isTransforming ? '⏳ Transformando...' :
                        currentPlayer.stamina < 30 || currentPlayer.mp < 20 ?
                        '❌ Recursos insuficientes' :
                        '🔆 Transformar (libera o Especial)'
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
                    🌪️ Esquivar · evasão{currentPlayerDisplay?.levers ? ` ${Math.round((currentPlayerDisplay.levers.evade || 0) * 100)}%` : ''} ({STAMINA_COSTS[ActionType.DODGE]}⚡)
                  </button>
                  <button
                    onClick={() => handleDefenseChoice('defend')}
                    disabled={!currentPlayer || currentPlayer.stamina < STAMINA_COSTS[ActionType.DEFEND]}
                    className={`w-full ${!currentPlayer || currentPlayer.stamina < STAMINA_COSTS[ActionType.DEFEND]
                      ? 'bg-gray-600 opacity-50 cursor-not-allowed'
                      : 'bg-gradient-to-r from-emerald-600 to-green-600 hover:from-green-600 hover:to-emerald-600'
                    } text-white py-2 px-4 rounded-lg font-bold text-sm transition-all duration-200 transform hover:scale-[1.02] shadow-lg`}
                  >
                    🛡️ Bloquear · armadura reforçada ({STAMINA_COSTS[ActionType.DEFEND]}⚡)
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

        </div>
      </div>
      
      {/* Dialog de Transformação */}
      <TransformationDialog
        isOpen={showTransformationDialog}
        onClose={() => setShowTransformationDialog(false)}
        characterRace={currentPlayer?.race || ''}
        lockedForm={currentPlayer?.unlockedTransformation || null}
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
