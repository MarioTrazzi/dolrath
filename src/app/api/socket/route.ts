import { NextRequest } from 'next/server'
import { Server as SocketIOServer } from 'socket.io'
import { Server as NetServer } from 'http'

interface CombatRoom {
  id: string
  player1: Player | null
  player2: Player | null
  currentTurn: string | null
  phase: 'waiting_players' | 'ready_check' | 'player_turn' | 'dice_roll' | 'combat_end'
  combatLog: string[]
  isActive: boolean
  winner?: string | null
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
  equipment: any
  isReady: boolean
  isConnected: boolean
  isAlive: boolean
}

interface SocketData {
  playerId?: string
  roomId?: string
}

// Armazenar salas em memória (em produção, usar Redis ou banco)
const rooms = new Map<string, CombatRoom>()
const playerSockets = new Map<string, string>() // playerId -> socketId

let io: SocketIOServer | null = null

function initializeSocketServer() {
  if (io) return io

  // Criar servidor HTTP mock para Socket.IO
  const httpServer = new NetServer()
  
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.NODE_ENV === 'production' 
        ? ['https://your-domain.com'] 
        : ['http://localhost:3000'],
      methods: ['GET', 'POST']
    },
    path: '/api/socket'
  })

  io.on('connection', (socket) => {
    console.log('Cliente conectado:', socket.id)

    socket.on('join_room', ({ roomId, player, isCreator }: {
      roomId: string
      player: Player
      isCreator: boolean
    }) => {
      console.log(`Jogador ${player.name} entrando na sala ${roomId}`)
      
      // Armazenar referência do socket do jogador
      playerSockets.set(player.id, socket.id)
      
      // Entrar na sala do Socket.IO
      socket.join(roomId)
      
      // Criar ou obter sala
      let room = rooms.get(roomId)
      if (!room) {
        room = {
          id: roomId,
          player1: null,
          player2: null,
          currentTurn: null,
          phase: 'waiting_players',
          combatLog: ['⚔️ Sala de combate criada!'],
          isActive: false
        }
        rooms.set(roomId, room)
      }

      // Adicionar jogador à sala
      if (!room.player1 || isCreator) {
        room.player1 = player
      } else if (!room.player2) {
        room.player2 = player
        room.combatLog.push(`🎮 ${player.name} entrou na sala!`)
      }

      // Atualizar todos os clientes na sala
      io?.to(roomId).emit('room_updated', room)
      io?.to(roomId).emit('player_joined', player)
    })

    socket.on('toggle_ready', ({ playerId, roomId }: { playerId: string, roomId: string }) => {
      const room = rooms.get(roomId)
      if (!room) return

      // Alternar estado de pronto do jogador
      if (room.player1?.id === playerId) {
        room.player1.isReady = !room.player1.isReady
      } else if (room.player2?.id === playerId) {
        room.player2.isReady = !room.player2.isReady
      }

      // Verificar se ambos estão prontos
      if (room.player1?.isReady && room.player2?.isReady) {
        room.phase = 'player_turn'
        room.currentTurn = room.player1.id
        room.isActive = true
        room.combatLog.push('⚡ COMBATE INICIADO!')
        room.combatLog.push(`🎯 Turno de ${room.player1.name}`)
      }

      io?.to(roomId).emit('room_updated', room)
    })

    socket.on('player_action', ({ playerId, roomId, action, diceType }: {
      playerId: string
      roomId: string
      action: string
      diceType: number
    }) => {
      const room = rooms.get(roomId)
      if (!room || room.currentTurn !== playerId) return

      const actionNames: { [key: string]: string } = {
        'light_attack': 'Ataque Leve',
        'heavy_attack': 'Ataque Pesado',
        'special_attack': 'Especial',
        'dodge': 'Esquivar',
        'defend': 'Defender',
        'use_item': 'Item'
      }

      room.phase = 'dice_roll'
      room.combatLog.push(`🎯 ${actionNames[action]} selecionado! Role o d${diceType}`)
      
      io?.to(roomId).emit('room_updated', room)
      io?.to(socket.id).emit('action_selected', { action, diceType })
    })

    socket.on('roll_dice', ({ playerId, roomId, sides, action }: {
      playerId: string
      roomId: string
      sides: number
      action: string
    }) => {
      const room = rooms.get(roomId)
      if (!room || room.currentTurn !== playerId) return

      const roll = Math.floor(Math.random() * sides) + 1
      const result = { roll, modifier: 0, total: roll }
      
      io?.to(roomId).emit('dice_rolled', {
        playerId,
        sides,
        result
      })

      // Processar resultado da ação após 1 segundo
      setTimeout(() => {
        processActionResult(room, action, roll, roomId)
      }, 1000)
    })

    socket.on('chat_message', ({ playerId, roomId, message }: {
      playerId: string
      roomId: string
      message: string
    }) => {
      const room = rooms.get(roomId)
      if (!room) return

      const player = room.player1?.id === playerId ? room.player1 : room.player2
      if (!player) return

      io?.to(roomId).emit('chat_message', {
        sender: player.name,
        message,
        timestamp: new Date()
      })
    })

    socket.on('disconnect', () => {
      console.log('Cliente desconectado:', socket.id)
      
      // Remover referência do socket
      playerSockets.forEach((socketId, playerId) => {
        if (socketId === socket.id) {
          playerSockets.delete(playerId)
        }
      })
    })
  })

  return io
}

function processActionResult(room: CombatRoom, action: string, playerRoll: number, roomId: string) {
  const currentPlayer = room.currentTurn === room.player1?.id ? room.player1 : room.player2
  const opponent = room.currentTurn === room.player1?.id ? room.player2 : room.player1

  if (!currentPlayer || !opponent) return

  const opponentRoll = Math.floor(Math.random() * 12) + 1
  
  let damage = 0
  let actionMessage = ''

  switch (action) {
    case 'light_attack':
      damage = Math.max(0, (currentPlayer.attack + playerRoll) - (opponent.defense + opponentRoll))
      actionMessage = `👊 ${currentPlayer.name} usou Ataque Leve!`
      break
    case 'heavy_attack':
      damage = Math.max(0, (currentPlayer.attack * 1.5 + playerRoll) - (opponent.defense + opponentRoll))
      actionMessage = `⚔️ ${currentPlayer.name} usou Ataque Pesado!`
      break
    case 'special_attack':
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

  room.combatLog.push(actionMessage)
  room.combatLog.push(`🎲 Dado: ${playerRoll} vs Defesa: ${opponentRoll}`)

  if (damage > 0) {
    opponent.hp = Math.max(0, opponent.hp - damage)
    room.combatLog.push(`💥 ${opponent.name} recebeu ${damage} de dano!`)
  } else {
    room.combatLog.push(`🛡️ ${opponent.name} defendeu o ataque!`)
  }

  if (opponent.hp <= 0) {
    room.phase = 'combat_end'
    room.winner = currentPlayer.id
    room.combatLog.push(`🏆 ${currentPlayer.name} venceu!`)
  } else {
    // Trocar turno
    room.currentTurn = opponent.id
    room.phase = 'player_turn'
    room.combatLog.push(`🔄 Turno de ${opponent.name}`)
  }

  io?.to(roomId).emit('room_updated', room)
}

export async function GET() {
  try {
    const socketServer = initializeSocketServer()
    
    return new Response(
      JSON.stringify({ 
        status: 'Socket.IO server initialized',
        path: '/api/socket'
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  } catch (error) {
    console.error('Erro ao inicializar Socket.IO:', error)
    return new Response(
      JSON.stringify({ error: 'Falha ao inicializar servidor WebSocket' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
}
