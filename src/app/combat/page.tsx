'use client'

import { useEffect, useState, useRef, useMemo, Suspense, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { X } from 'lucide-react'
import { io, Socket } from 'socket.io-client'
import TransformationDialog from '@/components/TransformationDialog'
import BattleScene, { BattleEvent, DiceResult, EquipmentMap, FighterView } from '@/components/battle/BattleScene'
import CombatShell, { type CombatAttackOption } from '@/components/battle/CombatShell'
import { TRANSFORMATION_CONFIG, getRaceTransformations, type TransformationType } from '@/lib/transformationSystem'
import { classAttackName } from '@/lib/combatModel'
import { getFormSpecials } from '@/lib/transformationSpecials'
import {
  getSkillTree,
  getSkillTreeState,
  getSkillUnlocks,
  applyRankPatch,
} from '@/lib/skillTree'
import { getTrainingOpponent, DEFAULT_TRAINING_OPPONENT_KEY } from '@/lib/trainingOpponents'
import { DUNGEON_BATTLE_BG } from '@/lib/walkSceneAssets'
import ImageBackdrop from '@/components/dungeon/ImageBackdrop'
import type { DungeonId } from '@/lib/dungeonAdventures'

const ARENA_BG_POOL = Object.entries(DUNGEON_BATTLE_BG) as [DungeonId, string][]

function pickArenaBackdrop(seed: string): { theme: DungeonId; src: string } {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  const [theme, src] = ARENA_BG_POOL[h % ARENA_BG_POOL.length]
  return { theme, src }
}

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
  /** Pontos distribuídos (STR/AGI/INT/DEF) — tilt de combate no socket */
  attributes?: { str?: number; agi?: number; int?: number; def?: number } | null
  baseStats?: Record<string, unknown> | null
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
  // 🌳 Árvore de habilidades comprada (lib/skillTree.ts). null = personagem legado.
  skillTree?: unknown
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
  dragon_breath: { mp: 12, stamina: 2, cd: 2 }, dragon_scales: { mp: 8, stamina: 1, cd: 4 },
  bite_bleeding: { mp: 12, stamina: 2, cd: 2 }, wild_fury: { mp: 8, stamina: 1, cd: 4 },
  unstoppable_charge: { mp: 12, stamina: 2, cd: 2 }, bear_guard: { mp: 8, stamina: 1, cd: 4 },
  ascending_spiral: { mp: 12, stamina: 2, cd: 2 }, eagle_swift: { mp: 8, stamina: 1, cd: 4 },
  cosmo_burst: { mp: 12, stamina: 2, cd: 2 }, meditation: { mp: 8, stamina: 1, cd: 4 },
  super_nova: { mp: 12, stamina: 2, cd: 2 }, hyperfocus: { mp: 8, stamina: 1, cd: 4 },
  stunning_blow: { mp: 10, stamina: 2, cd: 3 },
}

// ⚔️ KIT: Golpe 0MP/1STA d6 · Classe 8MP/2STA d8 — defesa passiva (sem reação)
const ATTACK_MP: Record<string, number> = { light_attack: 0, heavy_attack: 8 }
const ATTACK_STA: Record<string, number> = { light_attack: 1, heavy_attack: 2 }
const ATTACK_DIE: Record<string, number> = { light_attack: 6, heavy_attack: 8 }

// 🏆 Resultado da aposta, vindo de /api/battle/rewards via socket. A arena paga OURO e
// XP — nunca item (os jogadores apostam e o governo paga); quem quer espólio vai à
// masmorra. `equipmentWear` existe porque a luta gasta o equipamento, igual ao abate.
interface BattleRewardSide {
  id: string
  xpGained: number
  goldGained: number
  leveledUp?: boolean
  newLevel?: number
  staminaCharged?: number
  rankPoints?: number
  equipmentWear?: { slot: string; name: string; durability: number; maxDurability: number; justBroke: boolean }[]
  /** A rota não respondeu: não há o que mostrar, e mentir número seria pior. */
  failed?: boolean
  /** Luta que não gera faucet (mesma conta / curta demais). */
  skipped?: 'same_user' | 'below_min_stamina' | null
}
interface BattleRewardsPayload {
  winner?: BattleRewardSide
  loser?: BattleRewardSide
  failed?: boolean
  skipped?: 'same_user' | 'below_min_stamina' | null
}

// Função para criar conexão Socket.IO real
function createSocketConnection(): Socket {
  // URL do servidor WebSocket (Render) em produção
  const socketUrl = process.env.NODE_ENV === 'production'
    ? (process.env.NEXT_PUBLIC_SOCKET_URL || 'https://dolrath.onrender.com')
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
  const trainingMonster = searchParams?.get('monster') || DEFAULT_TRAINING_OPPONENT_KEY
  const trainingDef = isTraining ? getTrainingOpponent(trainingMonster) : null
  const roomPasswordFromQuery = searchParams?.get('password') || ''
  const roomPassword =
    roomPasswordFromQuery ||
    (typeof window !== 'undefined'
      ? sessionStorage.getItem(`room_pw_${roomId}`) || ''
      : '')

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

  // 🏆 Resumo da aposta: o que ESTE jogador levou da luta (antes isto virava uma
  // mensagem de chat que o próprio jogador mandava pra si mesmo).
  const [battleReward, setBattleReward] = useState<BattleRewardSide | null>(null)
  // Chat em bottom-sheet (igual mobile antigo; não compete com a barra de ações).
  const [chatOpen, setChatOpen] = useState(false)
  const [showItems, setShowItems] = useState(false)
  const [unreadChat, setUnreadChat] = useState(0)
  const seenChatCount = useRef(0)
  const sheetLogRef = useRef<HTMLDivElement>(null)

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

  const skillTreeDef = useMemo(
    () => getSkillTree(
      currentPlayer?.class || 'Guerreiro',
      currentPlayer?.unlockedTransformation || currentPlayer?.transformationType || null
    ),
    [currentPlayer?.class, currentPlayer?.unlockedTransformation, currentPlayer?.transformationType]
  )
  const unlocks = useMemo(
    () => getSkillUnlocks(getSkillTreeState(currentPlayer?.skillTree ?? null), skillTreeDef),
    [currentPlayer?.skillTree, skillTreeDef]
  )
  const logLines = useMemo(() => {
    const entries = combatRoom?.combatLog || []
    return entries
      .filter(e => e.type !== 'chat')
      .slice(-8)
      .map(e => (e.player ? `${e.player}: ${e.message}` : e.message))
  }, [combatRoom?.combatLog])

  // Fundo provisório: arte de masmorra (aleatória por sala). Depois → arenas exclusivas.
  const arenaBackdrop = useMemo(() => pickArenaBackdrop(roomId || 'arena'), [roomId])

  // Card enxuto (igual PvE): só nome + barras HP/MP/STA — sem pills PWR/ARM/HP.
  const asFighter = (p: Player | null | undefined): FighterView | null => (p ? { ...p } : null)

  // Auto scroll do sheet de chat
  useEffect(() => {
    if (!combatRoom?.combatLog || !sheetLogRef.current) return
    sheetLogRef.current.scrollTop = sheetLogRef.current.scrollHeight
  }, [combatRoom?.combatLog, chatOpen])

  // Badge de não lidas: só mensagens de chat (ações/resultados já aparecem no ticker)
  useEffect(() => {
    const chats = combatRoom?.combatLog?.filter(l => l.type === 'chat').length || 0
    if (chatOpen) {
      seenChatCount.current = chats
      setUnreadChat(0)
    } else {
      setUnreadChat(Math.max(0, chats - seenChatCount.current))
    }
  }, [combatRoom?.combatLog, chatOpen])

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
        // A luta recomeçou: limpa a bolsa da luta ANTERIOR. Sem isto o card de
        // recompensa da luta passada aparece no fim da próxima (e continua lá se a
        // rota falhar) — mostrando ouro que este jogador não ganhou agora.
        if (room.isActive) setBattleReward(null)

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
          // 🎲 Ataques são auto-rolados pelo servidor (~400ms). Entrar em mode=rolling
          // AGORA (antes do resultado) — senão o dado fica idle (só "d6" sem giro),
          // diferente do PvE onde hasRolled=true dispara o spin.
          if (room.pendingAction.type === 'attack') {
            setHasRolledDice(true)
          }

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
        // Garante mode=rolling mesmo se room_updated chegou depois do dice_rolled
        setHasRolledDice(true)
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

      socket.on('battle_rewards', (data: BattleRewardsPayload) => {
        const side = data.winner?.id === characterId ? data.winner : data.loser?.id === characterId ? data.loser : null
        if (!side) return
        setBattleReward({ ...side, failed: !!data.failed, skipped: data.skipped ?? null })
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
              attributes: charDetails.attributes || {
                str: charDetails.baseStats?.str || 10,
                agi: charDetails.baseStats?.agi || 10,
                int: charDetails.baseStats?.int || 10,
                def: charDetails.baseStats?.def || 10,
              },
              baseStats: charDetails.baseStats || null,
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
              // 🌳 Árvore de habilidades (lib/skillTree.ts): null = personagem legado, tudo liberado.
              skillTree: charDetails.skillTree ?? null,
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
        monster: trainingMonster,
        password: roomPassword || null,
      })
    }

    const onJoinError = (err: { error?: string; code?: string }) => {
      if (err?.code === 'BAD_PASSWORD') {
        const entered = typeof window !== 'undefined'
          ? window.prompt('Esta sala exige senha. Digite a senha:') || ''
          : ''
        if (entered && characterId) {
          sessionStorage.setItem(`room_pw_${roomId}`, entered)
          window.location.href = `/combat?room=${roomId}&character=${characterId}&role=${userRole}&password=${encodeURIComponent(entered)}`
          return
        }
        alert(err.error || 'Senha incorreta')
        router.push('/combat-lobby')
      }
    }
    socket.on('join_room_error', onJoinError)

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
      socket.off('join_room_error', onJoinError)
      socket.disconnect()
    }
  }, [socket, roomId, isRoomCreator, characterId, roomPassword, userRole, isTraining, trainingMonster, router])

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
    setShowItems(false)

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

    // ⚔️ ATAQUES: MP + STAMINA. Servidor auto-rola o dado (~400ms). Defesa passiva.
    const isAttack = action in ATTACK_MP || action === ActionType.SPECIAL_ATTACK
    if (isAttack) {
      const mpCost = ATTACK_MP[action] ?? 0
      const staminaCost = ATTACK_STA[action] ?? 1
      if (currentPlayer.stamina < staminaCost) {
        socket.emit('chat_message', {
          playerId: currentPlayer.id, roomId,
          message: `❌ Stamina insuficiente! (${staminaCost} STA necessária)`
        })
        return
      }
      if (currentPlayer.mp < mpCost) {
        socket.emit('chat_message', {
          playerId: currentPlayer.id, roomId,
          message: `❌ MP insuficiente para esta ação! (${mpCost} MP necessário)`
        })
        return
      }
      setCurrentPlayer(prev => prev ? {
        ...prev,
        mp: Math.max(0, prev.mp - mpCost),
        stamina: Math.max(0, prev.stamina - staminaCost),
      } : null)
      socket.emit('player_action', {
        playerId: currentPlayer.id, roomId, action,
        diceType: ATTACK_DIE[action] ?? 12, mpCost, staminaCost
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

      // Recursos da luta (sessão). A rota /transform também cobra STA/MP persistentes.
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

      // Uma única cobrança: /transform já debita STA+MP no banco.
      // (Antes chamávamos update-stamina + transform → 2× cobrança; e update-stamina
      // 500ava ao serializar nftTokenId BigInt.)
      const response = await fetch(`/api/character/${characterId}/transform`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transformationType })
      })
      
      if (response.ok) {
        const data = await response.json()
        const updatedCharacter = data.character
        const nextStamina = Math.max(0, currentPlayer.stamina - staminaCost)
        const nextMp = Math.max(0, currentPlayer.mp - mpCost)
        
        // Atualizar dados do player com os novos stats transformados
        setCurrentPlayer(prev => prev ? {
          ...prev,
          ...updatedCharacter,
          // Preservar HP atual do combate (a API pode devolver HP do banco)
          hp: prev.hp,
          stamina: nextStamina,
          mp: nextMp,
          maxHp: updatedCharacter.maxHp ?? prev.maxHp,
          attack: updatedCharacter.baseStats?.attack || prev.attack,
          defense: updatedCharacter.baseStats?.defense || prev.defense,
          strength: updatedCharacter.baseStats?.str || prev.strength,
          agility: updatedCharacter.baseStats?.agi || prev.agility,
          intelligence: updatedCharacter.baseStats?.int || prev.intelligence,
          critical: updatedCharacter.baseStats?.critical || prev.critical,
          isTransformed: true,
          transformationType: transformationType,
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
            mp: nextMp,
            stamina: nextStamina,
            attack: updatedCharacter.baseStats?.attack ?? currentPlayer.attack,
            defense: updatedCharacter.baseStats?.defense ?? currentPlayer.defense,
            strength: updatedCharacter.baseStats?.str ?? currentPlayer.strength,
            agility: updatedCharacter.baseStats?.agi ?? currentPlayer.agility,
            intelligence: updatedCharacter.baseStats?.int ?? currentPlayer.intelligence,
            critical: updatedCharacter.baseStats?.critical ?? currentPlayer.critical,
          }
        })
      } else {
        const error = await response.json().catch(() => ({ error: 'Erro desconhecido' }))
        socket.emit('chat_message', { 
          playerId: currentPlayer.id, 
          roomId, 
          message: `❌ Transformação falhou: ${error.error || 'erro'}` 
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

  // 🎲 Iniciativa: os 2 dados rolam sozinhos assim que a fase começa — sem clique
  useEffect(() => {
    if (
      combatRoom?.phase === CombatPhase.INITIATIVE_ROLL &&
      !hasRolledInitiative &&
      currentPlayer &&
      !isSpectator &&
      !isModerator
    ) {
      rollInitiative()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combatRoom?.phase, hasRolledInitiative, currentPlayer?.id, isSpectator, isModerator])

  // 🏆 Quem venceu a iniciativa, assim que os 2 dados chegarem (empate = servidor decide por XP)
  const initiativeWinnerName = (() => {
    if (combatRoom?.phase !== CombatPhase.INITIATIVE_ROLL || !currentPlayer || !opponent) return null
    const mine = diceResults[currentPlayer.id]
    const theirs = diceResults[opponent.id]
    if (!mine || !theirs) return null
    if (mine.total === theirs.total) return 'Empate! Decidindo por experiência...'
    const winnerName = mine.total > theirs.total ? (currentPlayerDisplay?.name || currentPlayer.name) : opponent.name
    return `${winnerName} venceu a iniciativa!`
  })()

  const closeRoom = () => {
    if (!currentPlayer || !isCreator) return
    socket.emit('close_room', {
      playerId: currentPlayer.id,
      roomId
    })
  }

  const transformForms = currentPlayer ? getRaceTransformations(currentPlayer.race) : []
  const formType = (currentPlayerView?.transformationType || currentPlayer?.transformationType) as TransformationType | null | undefined
  const cds = (currentPlayerDisplay as { fx?: { abilityCd?: Record<string, number> } } | null)?.fx?.abilityCd || {}
  const classAtkName = classAttackName(currentPlayer?.class)
  const weaponMp = unlocks.classAttackMp
  const weaponDie = unlocks.classAttackDie

  const attackOptions: CombatAttackOption[] = []
  if (currentPlayer) {
    attackOptions.push({
      key: 'basic',
      label: 'Golpe',
      sub: `d${ATTACK_DIE.light_attack}·${ATTACK_STA.light_attack}⚡`,
      locked: currentPlayer.stamina < ATTACK_STA.light_attack,
      onPick: () => handlePlayerAction(ActionType.LIGHT_ATTACK),
    })
    if (unlocks.classAttack) {
      attackOptions.push({
        key: 'weapon',
        label: classAtkName,
        sub: `d${weaponDie}·${weaponMp}MP·${ATTACK_STA.heavy_attack}⚡`,
        locked:
          currentPlayer.mp < weaponMp ||
          currentPlayer.stamina < ATTACK_STA.heavy_attack,
        onPick: () => handlePlayerAction(ActionType.HEAVY_ATTACK),
      })
    }
    if (currentPlayer.isTransformed && formType) {
      const formSpecials = getFormSpecials(formType)
        .filter(def => {
          if (def.id === 'stunning_blow') return unlocks.stunningBlow
          if (def.kind === 'util') return unlocks.formBuff
          return true
        })
        .map(def => applyRankPatch(def, unlocks, formType))
      for (const def of formSpecials) {
        const cost = SPECIAL_COST[def.id] || { stamina: def.cost.stamina || 0, mp: def.cost.mp || 0, cd: def.cd }
        const sCost = cost.stamina || 0
        const mCost = cost.mp || 0
        const cd = cds[def.id] || 0
        const locked =
          cd > 0 ||
          currentPlayer.stamina < sCost ||
          currentPlayer.mp < mCost
        const costLabel = cd > 0
          ? `recarga ${cd}`
          : `${def.kind === 'dmg' ? `d${def.die ?? 20}·` : ''}${mCost ? `${mCost}MP` : ''}${mCost && sCost ? '·' : ''}${sCost ? `${sCost}⚡` : ''}`
        attackOptions.push({
          key: def.id,
          label: def.name,
          sub: costLabel,
          locked,
          onPick: () => handleSpecialAbility(def.id),
        })
      }
    }
  }

  const showPlayerActions =
    !isSpectator &&
    !isModerator &&
    !!combatRoom?.isActive &&
    combatRoom?.phase === CombatPhase.PLAYER_TURN &&
    isMyTurn

  const transformCfg = TRANSFORMATION_CONFIG[(formType || '') as TransformationType]
  const transformDisabled =
    !!currentPlayer?.isTransformed ||
    usedTransformThisMatch ||
    (currentPlayer?.transformationData?.cooldownTurns || 0) > 0 ||
    isTransforming ||
    !currentPlayer ||
    currentPlayer.stamina < 30 ||
    currentPlayer.mp < 20

  let statusContent: ReactNode = null
  if (isSpectator) {
    statusContent = (
      <div className="text-center space-y-2 px-2">
        <div className="text-sm text-blue-300 font-bold">👁️ Modo Espectador</div>
        <div className="text-xs text-white/55">Use o chat para acompanhar a luta.</div>
        {combatRoom?.phase === CombatPhase.COMBAT_END && (
          <button
            type="button"
            onClick={() => router.push('/combat-lobby')}
            className="mt-1 px-4 py-2 rounded-xl font-bold text-xs text-white bg-gradient-to-r from-red-700 to-red-500"
          >
            Voltar ao Lobby
          </button>
        )}
      </div>
    )
  } else if (isModerator) {
    statusContent = (
      <div className="text-center px-2">
        <div className="text-sm text-purple-300 font-bold">🛡️ Moderando</div>
        <div className="text-xs text-white/55">Funcionalidades em desenvolvimento.</div>
      </div>
    )
  } else if (combatRoom?.phase === CombatPhase.INITIATIVE_ROLL) {
    statusContent = (
      <div className="text-white/60 text-xs sm:text-sm font-bold text-center">
        🎲 {initiativeWinnerName || 'Rolando iniciativa...'}
      </div>
    )
  } else if (combatRoom?.phase === CombatPhase.COMBAT_END) {
    // ⚠️ COMBAT_END vem com isActive=false — checar ANTES do branch !isActive,
    // senão a tela de vitória/derrota nunca aparece.
    statusContent = (
      <div className="text-center space-y-2 px-2 max-w-sm">
        <div className={`text-base sm:text-lg font-bold ${isWinner ? 'text-emerald-400' : 'text-red-400'}`}>
          {isWinner ? '🏆 VITÓRIA!' : '💀 DERROTA!'}
        </div>
        {isTraining ? (
          <div className="rounded-lg border border-white/15 bg-black/30 p-2 text-[11px] text-white/65">
            🏟️ Treino concluído — sem XP, gold ou ranking.
            <span className="block mt-1 text-white/45">Recompensas só em luta ranqueada (Buscar Oponente / sala).</span>
          </div>
        ) : battleReward ? (
          battleReward.failed ? (
            <div className="rounded-lg border border-amber-500/40 bg-amber-900/20 p-2 text-[11px] text-amber-200">
              ⚠️ As recompensas não puderam ser creditadas. Nada foi perdido.
            </div>
          ) : battleReward.skipped ? (
            <div className="rounded-lg border border-white/15 bg-black/30 p-2 text-[11px] text-white/60">
              {battleReward.skipped === 'same_user'
                ? '🤝 Luta entre personagens da mesma conta — sem recompensa.'
                : '⚡ Luta curta demais para valer recompensa.'}
            </div>
          ) : (
            <div className="rounded-lg border border-amber-500/30 bg-amber-900/15 p-2 space-y-1">
              <div className="text-[10px] font-bold text-amber-300">💰 A BOLSA DA ARENA</div>
              <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs font-bold">
                {battleReward.xpGained > 0 && <span className="text-sky-300">+{battleReward.xpGained} XP</span>}
                {battleReward.goldGained > 0 && <span className="text-amber-300">+{battleReward.goldGained} 💰</span>}
                {!!battleReward.staminaCharged && <span className="text-emerald-300">−{battleReward.staminaCharged} ⚡</span>}
                {battleReward.rankPoints != null && <span className="text-fuchsia-300">{battleReward.rankPoints} pts</span>}
              </div>
              {battleReward.leveledUp && (
                <div className="text-xs font-bold text-emerald-400">🎉 Subiu para o nível {battleReward.newLevel}!</div>
              )}
              {!!battleReward.equipmentWear?.some((w) => w.justBroke) && (
                <div className="text-[11px] text-red-400 font-bold">
                  💥 Quebrou: {battleReward.equipmentWear.filter((w) => w.justBroke).map((w) => w.name).join(', ')}
                </div>
              )}
            </div>
          )
        ) : (
          <div className="text-[11px] text-white/45 animate-pulse">Contando a bolsa da arena…</div>
        )}
        <button
          type="button"
          onClick={() => router.push('/combat-lobby')}
          className="px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-white bg-gradient-to-r from-red-700 to-red-500 hover:scale-105 transition-all shadow-lg"
        >
          Voltar ao Lobby
        </button>
      </div>
    )
  } else if (!combatRoom?.isActive) {
    statusContent = (
      <div className="flex flex-col items-center gap-2 px-2">
        <div className="text-xs sm:text-sm text-white/60 font-bold text-center">
          {!opponent ? 'Aguardando oponente...' : 'Preparando para o combate...'}
        </div>
        {opponent && (
          <button
            type="button"
            onClick={toggleReady}
            className={`px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-white transition-all shadow-lg ${
              isReady
                ? 'bg-emerald-600'
                : 'bg-gradient-to-r from-red-700 to-red-500 hover:scale-105'
            }`}
          >
            {isReady ? '✅ Pronto!' : '🏁 Ficar Pronto'}
          </button>
        )}
      </div>
    )
  } else {
    statusContent = (
      <div className="text-white/50 text-xs sm:text-sm font-bold animate-pulse text-center">
        {combatRoom?.phase === CombatPhase.DICE_ROLL
          ? '🎲 Resolvendo golpe…'
          : !isMyTurn
            ? '⏳ Turno do oponente...'
            : '⚔️ Executando ação...'}
      </div>
    )
  }

  const titleLabel = isTraining && trainingDef
    ? `🏟️ Treino · ${trainingDef.name}`
    : `⚔️ Sala ${roomId}`

  return (
    <div className="fixed inset-0 z-50 overflow-hidden overscroll-none touch-pan-y bg-black flex flex-col">
      <CombatShell
        logLines={logLines}
        showActions={showPlayerActions}
        attackOptions={attackOptions}
        statusContent={statusContent}
        onOpenItems={() => setShowItems(true)}
        showItemButton={!isSpectator && !isModerator}
        transform={
          transformForms.length > 0 && !isSpectator && !isModerator
            ? {
                available: true,
                activeLabel: currentPlayer?.isTransformed
                  ? (transformCfg?.name || 'Transformado')
                  : null,
                activeTurnsHint: currentPlayer?.isTransformed
                  ? (currentPlayer.transformationData?.remainingTurns != null
                    ? `${currentPlayer.transformationData.remainingTurns} turno(s)`
                    : undefined)
                  : undefined,
                used: usedTransformThisMatch && !currentPlayer?.isTransformed,
                disabled: transformDisabled && !currentPlayer?.isTransformed,
                title: usedTransformThisMatch
                  ? 'Transformação já usada nesta luta (1× por luta)'
                  : isTransforming
                    ? 'Transformando...'
                    : 'MP + stamina — 1× por luta',
                buttonLabel: usedTransformThisMatch
                  ? 'Transf. usada'
                  : isTransforming
                    ? 'Transformando...'
                    : 'Transformar',
                costHint: !usedTransformThisMatch && !isTransforming ? 'MP+⚡' : undefined,
                onClick: handleTransformation,
              }
            : null
        }
        toolbar={
          <>
            <span className="mr-auto text-[10px] sm:text-xs font-bold text-white/55 truncate max-w-[45%]">
              {titleLabel}
              {isSpectator && ' · 👁️'}
              {connectionStatus !== 'connected' && (
                <span className="ml-1 text-amber-300">
                  {connectionStatus === 'connecting' ? '🟡' : '🔴'}
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={() => setChatOpen(true)}
              className="relative px-3 py-1.5 rounded-full text-[10px] font-black border bg-white/5 border-white/15 text-white/70 hover:text-white transition-colors"
              title="Chat"
            >
              💬
              {unreadChat > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-600 text-[10px] font-black grid place-items-center text-white">
                  {unreadChat}
                </span>
              )}
            </button>
            {isCreator && (
              <button
                type="button"
                onClick={closeRoom}
                className="px-3 py-1.5 rounded-full text-[10px] font-black border bg-white/5 border-white/15 text-white/60 hover:text-white"
                title="Fechar sala"
              >
                🚪
              </button>
            )}
            <button
              type="button"
              onClick={() => router.push('/combat-lobby')}
              className="px-2 py-1.5 rounded-full text-white/70 hover:text-white border border-white/15 bg-white/5"
              title="Voltar ao lobby"
            >
              <X size={14} />
            </button>
          </>
        }
      >
        <BattleScene
          className="flex-1 min-h-[280px]"
          left={asFighter((isSpectator || isModerator ? combatRoom?.player1 : (currentPlayerView || currentPlayer)) || null)}
          right={asFighter((isSpectator || isModerator ? combatRoom?.player2 : opponent) || null)}
          currentTurnId={combatRoom?.currentTurn}
          winnerId={combatRoom?.winner || null}
          combatEnded={combatRoom?.phase === CombatPhase.COMBAT_END}
          event={battleEvent}
          backdrop={
            <ImageBackdrop
              src={arenaBackdrop.src}
              theme={arenaBackdrop.theme}
              overlayOpacity={0.35}
              showParticles
            />
          }
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
                    waitingForOpponent: opponent ? !diceResults[opponent.id] : false,
                    dual: true,
                    opponentResult: opponent ? diceResults[opponent.id] : null,
                    resultBanner: initiativeWinnerName
                  }
              : combatRoom?.phase === CombatPhase.DICE_ROLL && combatRoom?.pendingAction &&
                !(combatRoom.pendingAction.defenseAction === 'exhausted' && !isMyTurn)
                ? (() => {
                    const pending = combatRoom.pendingAction
                    const sides = pending.diceType
                    // Resultado é do ATACANTE (servidor auto-rola só o golpe) — os dois
                    // lutadores veem o mesmo dado girando, como no PvE.
                    const attackerId = pending.playerId as string | undefined
                    const attackResult = attackerId ? (diceResults[attackerId] ?? null) : null
                    const autoAttack = pending.type === 'attack'
                    return {
                      visible: true,
                      diceType: sides,
                      // Auto-roll: sempre rolling. Legado (clique): hasRolledDice.
                      hasRolled: autoAttack ? true : hasRolledDice,
                      label: autoAttack
                        ? `🎲 Rolando d${sides}…`
                        : pending.defenseAction === 'exhausted'
                          ? `😮‍💨 Oponente exausto! Role o d${sides}!`
                          : `🎲 Role o d${sides}!`,
                      onRoll: autoAttack ? () => {} : () => handleRollDice(sides),
                      myResult: attackResult,
                      waitingForOpponent: false,
                    }
                  })()
                : null
          }
        />
      </CombatShell>

      {showItems && (
        <div className="fixed inset-0 z-[55] grid place-items-center px-5" onClick={() => setShowItems(false)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-sm rounded-2xl p-5 border border-white/15 bg-black/90 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-black text-white text-lg">🧪 Consumíveis</h3>
              {currentPlayer && (
                <div className="flex gap-3 text-xs">
                  <span className="text-emerald-400">❤️ {Math.round(currentPlayer.hp)}/{currentPlayer.maxHp}</span>
                  <span className="text-blue-400">🔮 {currentPlayer.mp}/{currentPlayer.maxMp}</span>
                  <span className="text-yellow-300">⚡ {currentPlayer.stamina}/{currentPlayer.maxStamina}</span>
                </div>
              )}
            </div>
            {consumables.length === 0 ? (
              <p className="text-white/50 text-sm text-center py-6">Nenhum consumível restaurador no inventário.</p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {consumables.map(c => {
                  const hpFull = !!currentPlayer && currentPlayer.hp >= currentPlayer.maxHp
                  const mpFull = !!currentPlayer && currentPlayer.mp >= currentPlayer.maxMp
                  const staminaFull = !!currentPlayer && currentPlayer.stamina >= currentPlayer.maxStamina
                  const disabled =
                    !showPlayerActions ||
                    ((c.hpRestore > 0 || c.mpRestore > 0 || c.staminaRestore > 0) &&
                      (c.hpRestore === 0 || hpFull) &&
                      (c.mpRestore === 0 || mpFull) &&
                      (c.staminaRestore === 0 || staminaFull))
                  return (
                    <div key={c.itemId} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-8 h-8 shrink-0 inline-flex items-center justify-center overflow-hidden rounded-lg bg-black/40">
                          {c.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={c.image} alt="" className="w-full h-full object-cover art-bright" />
                          ) : (
                            <span className="text-xl">{c.icon}</span>
                          )}
                        </span>
                        <div className="min-w-0">
                          <div className="text-white text-sm font-bold truncate">
                            {c.name} <span className="text-white/50 font-normal">×{c.quantity}</span>
                          </div>
                          <div className="text-white/50 text-[11px]">
                            {c.hpRestore > 0 ? `+${c.hpRestore} ❤️` : ''}
                            {c.hpRestore > 0 && c.mpRestore > 0 ? ' • ' : ''}
                            {c.mpRestore > 0 ? `+${c.mpRestore} 🔮` : ''}
                            {(c.hpRestore > 0 || c.mpRestore > 0) && c.staminaRestore > 0 ? ' • ' : ''}
                            {c.staminaRestore > 0 ? `+${c.staminaRestore} ⚡` : ''}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleUseConsumable(c)}
                        disabled={disabled}
                        className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-black text-white disabled:opacity-40 bg-gradient-to-r from-emerald-700 to-green-600"
                      >
                        Usar
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
            <p className="text-white/40 text-[10px] text-center mt-2">Usar um item consome seu turno.</p>
            <button
              type="button"
              onClick={() => setShowItems(false)}
              className="mt-3 w-full py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-bold transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {chatOpen && (
        <div className="fixed inset-0 z-[60]" onClick={() => setChatOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="absolute inset-x-0 bottom-0 max-h-[60dvh] rounded-t-2xl bg-black/95 backdrop-blur-xl border-t border-white/15 flex flex-col shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 pt-3 pb-2 flex-shrink-0">
              <h3 className="font-bold text-white text-sm">💬 Chat</h3>
              <button
                type="button"
                onClick={() => setChatOpen(false)}
                className="text-white/70 hover:text-white p-2 -m-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>
            <div ref={sheetLogRef} className="flex-1 overflow-y-auto overscroll-contain space-y-2 px-3 pb-2 min-h-[160px]">
              {combatRoom?.combatLog.map((log, index) => (
                <div key={index} className={`rounded-lg p-2 ${
                  log.type === 'chat' ? 'bg-blue-500/20 border border-blue-500/30' :
                  log.type === 'system' ? 'bg-white/5 border border-white/10' :
                  log.type === 'action' ? 'bg-yellow-500/15 border border-yellow-500/25' :
                  log.type === 'result' ? 'bg-purple-500/15 border border-purple-500/25' :
                  log.type === 'damage' ? 'bg-red-500/15 border border-red-500/25' :
                  log.type === 'victory' ? 'bg-green-500/15 border border-green-500/25' :
                  'bg-white/5'
                }`}>
                  {log.player && <div className="text-xs text-white/50 font-bold">{log.player}:</div>}
                  <div className="text-xs text-white break-words">{log.message}</div>
                </div>
              ))}
            </div>
            <div
              className="flex flex-shrink-0 px-3 pt-2 border-t border-white/10"
              style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
            >
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="Digite sua mensagem..."
                className="flex-1 min-h-[44px] bg-white/5 border border-white/20 rounded-l-lg px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-red-500/40"
              />
              <button
                type="button"
                onClick={sendMessage}
                className="bg-red-700 hover:bg-red-600 text-white px-4 py-2 min-h-[44px] rounded-r-lg transition-colors text-sm"
              >
                ➤
              </button>
            </div>
          </div>
        </div>
      )}

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
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white text-xl">Carregando combate...</div>
      </div>
    }>
      <CombatPageContent />
    </Suspense>
  )
}
