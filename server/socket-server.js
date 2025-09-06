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

// Enum para fases do combate
const CombatPhase = {
  WAITING_PLAYERS: 'waiting_players',
  INITIATIVE_ROLL: 'initiative_roll',
  PLAYER_TURN: 'player_turn',
  OPPONENT_REACTION: 'opponent_reaction',
  DICE_ROLL: 'dice_roll',
  COMBAT_END: 'combat_end'
}

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
        creator: null,
        player1: null,
        player2: null,
        currentTurn: null,
        phase: CombatPhase.WAITING_PLAYERS,
        combatLog: [],
        isActive: false,
        pendingAction: null,
        reactionPhase: false
      }
      rooms.set(roomId, room)
    }

    if (!room.player1 || isCreator) {
      room.player1 = player
      if (isCreator) {
        room.creator = player.id
      }
    } else if (!room.player2) {
      room.player2 = player
      room.combatLog.push({
        type: 'system',
        message: `${player.name} entrou na sala!`,
        timestamp: new Date()
      })
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

    // Ambos prontos - preparar para rolagem de iniciativa
    if (room.player1?.isReady && room.player2?.isReady) {
      room.phase = CombatPhase.INITIATIVE_ROLL
      room.combatLog.push({
        type: 'system',
        message: '⚡ Ambos prontos! Rolem d20 para determinar iniciativa.',
        timestamp: new Date()
      })
      room.isActive = true
    }

    io.to(roomId).emit('room_updated', room)
  })

  // Novo evento para rolagem de iniciativa
  socket.on('roll_initiative', ({ playerId, roomId }) => {
    const room = rooms.get(roomId)
    if (!room || room.phase !== CombatPhase.INITIATIVE_ROLL) return

    const player = room.player1?.id === playerId ? room.player1 : room.player2
    if (!player) return

    // Rolar d20 + modificador de velocidade
    const roll = Math.floor(Math.random() * 20) + 1
    const modifier = Math.floor((player.speed || 0) / 4) // Modificador baseado em velocidade
    const total = roll + modifier

    // Armazenar rolagem de iniciativa
    if (!room.initiativeRolls) {
      room.initiativeRolls = {}
    }
    room.initiativeRolls[playerId] = { roll, modifier, total }

    room.combatLog.push({
      type: 'action',
      player: player.name,
      message: `🎲 Iniciativa: Rolou d20 = ${roll} + (${modifier}) = ${total}`,
      timestamp: new Date()
    })

    // Verificar se ambos rolaram
    const player1Id = room.player1?.id
    const player2Id = room.player2?.id
    
    if (room.initiativeRolls[player1Id] && room.initiativeRolls[player2Id]) {
      const initiative1 = room.initiativeRolls[player1Id].total
      const initiative2 = room.initiativeRolls[player2Id].total

      if (initiative1 >= initiative2) {
        room.currentTurn = player1Id
        room.combatLog.push({
          type: 'system',
          message: `🏃 ${room.player1.name} começa o combate!`,
          timestamp: new Date()
        })
      } else {
        room.currentTurn = player2Id
        room.combatLog.push({
          type: 'system',
          message: `🏃 ${room.player2.name} começa o combate!`,
          timestamp: new Date()
        })
      }

      room.phase = CombatPhase.PLAYER_TURN
    }

    io.to(roomId).emit('room_updated', room)
  })

  socket.on('player_action', ({ playerId, roomId, action, diceType, mpCost, staminaCost }) => {
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

    const currentPlayer = room.currentTurn === room.player1?.id ? room.player1 : room.player2
    const opponent = room.currentTurn === room.player1?.id ? room.player2 : room.player1
    
    // Aplicar custos de MP e stamina
    if (mpCost > 0) {
      currentPlayer.mp = Math.max(0, currentPlayer.mp - mpCost)
    }
    if (staminaCost > 0) {
      currentPlayer.stamina = Math.max(0, currentPlayer.stamina - staminaCost)
    }
    
    // Se é um ataque, ir para OPPONENT_REACTION (não DICE_ROLL)
    if (['light_attack', 'heavy_attack', 'special_attack'].includes(action)) {
      room.pendingAction = { 
        action, 
        diceType, 
        playerId, 
        type: 'attack',
        attackRoll: undefined,  // Limpar rolls anteriores
        defenseRoll: undefined  // Limpar rolls anteriores
      }
      room.phase = CombatPhase.OPPONENT_REACTION // MUDANÇA AQUI!
      room.combatLog.push({
        type: 'action',
        player: currentPlayer.name,
        message: `🎯 ${actionNames[action]} selecionado! ${opponent.name}, escolha sua defesa.`,
        timestamp: new Date()
      })
    } else {
      // Outras ações (items, etc) processam normalmente
      room.pendingAction = { action, diceType, playerId, type: 'other' }
      room.phase = CombatPhase.DICE_ROLL
      room.combatLog.push({
        type: 'action',
        player: currentPlayer.name,
        message: `🎯 ${actionNames[action]} selecionado! Role o d${diceType}`,
        timestamp: new Date()
      })
    }
    
    io.to(roomId).emit('room_updated', room)
    socket.emit('action_selected', { action, diceType })
  })

  socket.on('roll_dice', ({ playerId, roomId, sides, action }) => {
    const room = rooms.get(roomId)
    if (!room) return

    const player = room.player1?.id === playerId ? room.player1 : room.player2
    const roll = Math.floor(Math.random() * sides) + 1
    const modifier = 0 // Pode ser expandido para incluir modificadores
    const total = roll + modifier
    
    room.combatLog.push({
      type: 'action',
      player: player.name,
      message: `🎲 ${player.name}: Rolou d${sides} = ${roll} + (${modifier}) = ${total}`,
      timestamp: new Date()
    })
    
    io.to(roomId).emit('dice_rolled', {
      playerId,
      sides,
      result: { roll, modifier, total }
    })

    // Para ataques na fase DICE_ROLL, salvar os rolls de ambos
    if (room.pendingAction?.type === 'attack' && room.phase === CombatPhase.DICE_ROLL) {
      if (playerId === room.pendingAction.playerId) {
        // É o atacante rolando
        room.pendingAction.attackRoll = total
        room.combatLog.push({
          type: 'system',
          message: `⏳ Aguardando ${room.currentTurn === room.player1?.id ? room.player2?.name : room.player1?.name} rolar o dado...`,
          timestamp: new Date()
        })
        // Atualizar sala imediatamente para mostrar quem já rolou
        io.to(roomId).emit('room_updated', room)
      } else {
        // É o defensor rolando
        room.pendingAction.defenseRoll = total
      }
      
      // Só processar quando AMBOS tiverem rolado
      if (room.pendingAction.attackRoll !== undefined && room.pendingAction.defenseRoll !== undefined) {
        room.combatLog.push({
          type: 'system',
          message: `⚔️ Ambos rolaram! Calculando resultado...`,
          timestamp: new Date()
        })
        // Atualizar sala antes de processar
        io.to(roomId).emit('room_updated', room)
        setTimeout(() => {
          processCompleteAction(room, room.pendingAction.action, room.pendingAction.attackRoll, room.pendingAction.defenseAction, room.pendingAction.defenseRoll, roomId)
        }, 1000)
      }
    } else {
      // Ações não-ataque processam diretamente
      setTimeout(() => {
        processActionResult(room, action, roll, roomId)
      }, 1000)
    }
  })

  socket.on('chat_message', ({ playerId, roomId, message }) => {
    const room = rooms.get(roomId)
    if (!room) return

    const player = room.player1?.id === playerId ? room.player1 : room.player2
    if (!player) return

    room.combatLog.push({
      type: 'chat',
      player: player.name,
      message: message,
      timestamp: new Date()
    })

    io.to(roomId).emit('room_updated', room)
  })

  // Novo evento para reação do oponente
  socket.on('opponent_reaction', ({ playerId, roomId, reaction, staminaCost }) => {
    const room = rooms.get(roomId)
    if (!room || !room.pendingAction || room.phase !== CombatPhase.OPPONENT_REACTION) return

    const opponent = room.currentTurn === room.player1?.id ? room.player2 : room.player1
    if (opponent.id !== playerId) return

    // Aplicar custo de stamina para defesa
    if (staminaCost > 0) {
      opponent.stamina = Math.max(0, opponent.stamina - staminaCost)
    }

    // Salvar a reação escolhida e ir para DICE_ROLL onde ambos rolam
    room.pendingAction.defenseAction = reaction
    room.phase = CombatPhase.DICE_ROLL
    
    const reactionNames = {
      'dodge': 'Esquiva',
      'defend': 'Defesa'
    }
    
    room.combatLog.push({
      type: 'action',
      player: opponent.name,
      message: `🛡️ ${opponent.name} escolheu: ${reactionNames[reaction]}! Ambos rolem d${room.pendingAction.diceType}`,
      timestamp: new Date()
    })

    io.to(roomId).emit('room_updated', room)
  })

  // Evento roll_defense removido - agora ambos usam roll_dice

  // Novo evento para fechar sala (apenas criador)
  socket.on('close_room', ({ playerId, roomId }) => {
    const room = rooms.get(roomId)
    if (!room || room.creator !== playerId) return

    room.combatLog.push({
      type: 'system',
      message: '🚪 Sala fechada pelo criador.',
      timestamp: new Date()
    })

    io.to(roomId).emit('room_closed')
    rooms.delete(roomId)
    
    // Remover todos os sockets desta sala
    const socketsInRoom = io.sockets.adapter.rooms.get(roomId)
    if (socketsInRoom) {
      socketsInRoom.forEach(socketId => {
        const socket = io.sockets.sockets.get(socketId)
        if (socket) {
          socket.leave(roomId)
        }
      })
    }
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

function processCompleteAction(room, attackAction, attackRoll, defenseAction, defenseRoll, roomId) {
  const attacker = room.currentTurn === room.player1?.id ? room.player1 : room.player2
  const defender = room.currentTurn === room.player1?.id ? room.player2 : room.player1

  if (!attacker || !defender) return

  let damage = 0
  let hit = false
  
  // Calcular dano base por tipo de ataque
  let baseDamage = attacker.attack || 10
  switch (attackAction) {
    case 'light_attack':
      baseDamage = Math.floor(baseDamage * 0.8)
      break
    case 'heavy_attack':
      baseDamage = Math.floor(baseDamage * 1.2)
      break
    case 'special_attack':
      baseDamage = Math.floor(baseDamage * 1.8)
      // MP já foi consumido no player_action, não aplicar novamente aqui
      break
  }

  // Sistema de combate: Ataque vs Defesa
  const attackTotal = attackRoll + baseDamage
  const defenseTotal = defenseRoll + (defender.defense || 5)
  
  if (defenseAction === 'dodge') {
    // Esquiva: sucesso total = sem dano, falha = dano cheio
    const dodgeThreshold = 10 + (attacker.speed || 0) * 0.3
    if (defenseRoll >= dodgeThreshold) {
      room.combatLog.push({
        type: 'result',
        message: `🌪️ Esquiva perfeita! ${defender.name} evitou todo o dano!`,
        timestamp: new Date()
      })
    } else {
      damage = Math.max(1, attackTotal - Math.floor(defenseTotal * 0.5))
      hit = true
      room.combatLog.push({
        type: 'result',
        message: `❌ Esquiva falhou! ${attackTotal} vs ${defenseTotal}`,
        timestamp: new Date()
      })
    }
  } else if (defenseAction === 'defend') {
    // Bloqueio: sempre reduz dano
    const damageReduction = Math.min(0.7, Math.max(0.3, (defender.resistance || 0) / 100))
    damage = Math.max(1, Math.floor(attackTotal * (1 - damageReduction)))
    hit = true
    room.combatLog.push({
      type: 'result',
      message: `🛡️ Bloqueio! Dano reduzido em ${Math.floor(damageReduction * 100)}%`,
      timestamp: new Date()
    })
  }

  if (hit && damage > 0) {
    defender.hp = Math.max(0, defender.hp - damage)
    room.combatLog.push({
      type: 'damage',
      message: `💥 ${defender.name} recebeu ${damage} de dano! (${defender.hp}/${defender.maxHp} HP)`,
      timestamp: new Date()
    })
  }

  // Verificar fim do combate
  if (defender.hp <= 0) {
    room.phase = CombatPhase.COMBAT_END
    room.winner = attacker.id
    room.combatLog.push({
      type: 'victory',
      message: `🏆 ${attacker.name} venceu o combate!`,
      timestamp: new Date()
    })
  } else {
    // Próximo turno
    room.currentTurn = defender.id
    room.phase = CombatPhase.PLAYER_TURN
    room.combatLog.push({
      type: 'system',
      message: `🔄 Turno de ${defender.name}`,
      timestamp: new Date()
    })
  }

  room.pendingAction = null
  io.to(roomId).emit('room_updated', room)
}

function processActionResult(room, action, playerRoll, roomId) {
  // Para ações que não requerem reação do oponente
  const currentPlayer = room.currentTurn === room.player1?.id ? room.player1 : room.player2
  const opponent = room.currentTurn === room.player1?.id ? room.player2 : room.player1

  if (!currentPlayer || !opponent) return

  // Processar ações de suporte/item
  switch (action) {
    case 'use_item':
      room.combatLog.push({
        type: 'action',
        player: currentPlayer.name,
        message: `🧪 ${currentPlayer.name} usou um item!`,
        timestamp: new Date()
      })
      break
    default:
      room.combatLog.push({
        type: 'action',
        player: currentPlayer.name,
        message: `${currentPlayer.name} executou uma ação!`,
        timestamp: new Date()
      })
      break
  }

  // Próximo turno
  room.currentTurn = opponent.id
  room.phase = CombatPhase.PLAYER_TURN
  room.combatLog.push({
    type: 'system',
    message: `🔄 Turno de ${opponent.name}`,
    timestamp: new Date()
  })

  room.pendingAction = null
  io.to(roomId).emit('room_updated', room)
}

httpServer.listen(PORT, () => {
  console.log(`🚀 Servidor WebSocket rodando na porta ${PORT}`)
  console.log(`🌍 Ambiente: ${process.env.NODE_ENV || 'development'}`)
  console.log(`💡 Health check: http://localhost:${PORT}/health`)
})

module.exports = { io }
