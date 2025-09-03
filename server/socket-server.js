const { createServer } = require('http')
const { Server } = require('socket.io')

// Configuração de porta - Railway usa PORT, Heroku também
const PORT = process.env.PORT || 3001

const httpServer = createServer()
const io = new Server(httpServer, {
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? [
          'https://dolrath.vercel.app',
          'https://*.vercel.app',
          'https://dolrath-git-main-mariotrazzi.vercel.app'
        ]
      : [
          'http://localhost:3000', 
          'http://127.0.0.1:3000'
        ],
    methods: ['GET', 'POST'],
    credentials: true
  },
  allowEIO3: true
})

// Health check endpoint para Railway/Heroku
httpServer.on('request', (req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      connections: io.engine.clientsCount 
    }))
  }
})

// Armazenar salas em memória
const rooms = new Map()
const playerSockets = new Map()

io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id)

  socket.on('join_room', ({ roomId, player, isCreator }) => {
    console.log(`Jogador ${player.name} entrando na sala ${roomId}`)
    
    playerSockets.set(player.id, socket.id)
    socket.join(roomId)
    
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

    if (!room.player1 || isCreator) {
      room.player1 = player
    } else if (!room.player2) {
      room.player2 = player
      room.combatLog.push(`🎮 ${player.name} entrou na sala!`)
    }

    io.to(roomId).emit('room_updated', room)
    io.to(roomId).emit('player_joined', player)
  })

  socket.on('toggle_ready', ({ playerId, roomId }) => {
    const room = rooms.get(roomId)
    if (!room) return

    if (room.player1?.id === playerId) {
      room.player1.isReady = !room.player1.isReady
    } else if (room.player2?.id === playerId) {
      room.player2.isReady = !room.player2.isReady
    }

    if (room.player1?.isReady && room.player2?.isReady) {
      room.phase = 'player_turn'
      room.currentTurn = room.player1.id
      room.isActive = true
      room.combatLog.push('⚡ COMBATE INICIADO!')
      room.combatLog.push(`🎯 Turno de ${room.player1.name}`)
    }

    io.to(roomId).emit('room_updated', room)
  })

  socket.on('player_action', ({ playerId, roomId, action, diceType }) => {
    const room = rooms.get(roomId)
    if (!room || room.currentTurn !== playerId) return

    const actionNames = {
      'light_attack': 'Ataque Leve',
      'heavy_attack': 'Ataque Pesado',
      'special_attack': 'Especial',
      'dodge': 'Esquivar',
      'defend': 'Defender',
      'use_item': 'Item'
    }

    room.phase = 'dice_roll'
    room.combatLog.push(`🎯 ${actionNames[action]} selecionado! Role o d${diceType}`)
    
    io.to(roomId).emit('room_updated', room)
    socket.emit('action_selected', { action, diceType })
  })

  socket.on('roll_dice', ({ playerId, roomId, sides, action }) => {
    const room = rooms.get(roomId)
    if (!room || room.currentTurn !== playerId) return

    const roll = Math.floor(Math.random() * sides) + 1
    const result = { roll, modifier: 0, total: roll }
    
    io.to(roomId).emit('dice_rolled', {
      playerId,
      sides,
      result
    })

    setTimeout(() => {
      processActionResult(room, action, roll, roomId)
    }, 1000)
  })

  socket.on('chat_message', ({ playerId, roomId, message }) => {
    const room = rooms.get(roomId)
    if (!room) return

    const player = room.player1?.id === playerId ? room.player1 : room.player2
    if (!player) return

    io.to(roomId).emit('chat_message', {
      sender: player.name,
      message,
      timestamp: new Date()
    })
  })

  socket.on('disconnect', () => {
    console.log('Cliente desconectado:', socket.id)
    
    playerSockets.forEach((socketId, playerId) => {
      if (socketId === socket.id) {
        playerSockets.delete(playerId)
      }
    })
  })
})

function processActionResult(room, action, playerRoll, roomId) {
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
    room.currentTurn = opponent.id
    room.phase = 'player_turn'
    room.combatLog.push(`🔄 Turno de ${opponent.name}`)
  }

  io.to(roomId).emit('room_updated', room)
}

httpServer.listen(PORT, () => {
  console.log(`🚀 Servidor WebSocket rodando na porta ${PORT}`)
  console.log(`🌍 Ambiente: ${process.env.NODE_ENV || 'development'}`)
  console.log(`💡 Health check: http://localhost:${PORT}/health`)
})

module.exports = { io }
