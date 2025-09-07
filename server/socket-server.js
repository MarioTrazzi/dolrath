const { createServer } = require('http')
const { Server } = require('socket.io')

// Importar sistema de stamina (versão local JavaScript)
const { getStaminaCost, checkStaminaLevel, calculateStaminaRegeneration } = require('./staminaSystem')

// Configuração de porta - Railway usa PORT, Heroku também
const PORT = process.env.PORT || 3001

// 🐉 CONFIGURAÇÕES DE TRANSFORMAÇÃO BALANCEADAS
const transformationConfigs = {
  // DRACONIANOS - Foco STR/DEF mas balanceado
  dragon: {
    statModifiers: {
      strength: 1.6,    // Era 1.8 - reduzido
      agility: 1.1,     // Era 1.0 - melhorado  
      intelligence: 1.1, // Era 1.0 - melhorado
      defense: 1.4,     // Era 1.0 - novo
      hp: 1.4,          // Era 1.5 - reduzido
      attack: 1.5,      // Era 1.8 - balanceado
      critical: 1.2,    // Era 1.0 - melhorado
      speed: 1.0
    },
    duration: 4,
    cooldown: 3
  },

  // METAMORFOS - Builds especializadas e balanceadas
  wolf: {
    statModifiers: {
      strength: 1.3,    // Era 1.4 - ligeiramente reduzido
      agility: 1.5,     // Era 1.0 - muito melhorado!
      intelligence: 0.8, // Era 1.0 - reduzido
      defense: 1.0,     // Neutro
      hp: 1.1,          // Era 0.9 - melhorado
      attack: 1.3,      // Era 1.4 - balanceado
      critical: 1.6,    // Novo - crítico alto!
      speed: 1.4        // Velocidade alta
    },
    duration: 3,
    cooldown: 2
  },

  bear: {
    statModifiers: {
      strength: 1.5,    // Era 1.7 - reduzido
      agility: 0.7,     // Era 1.0 - tank lento
      intelligence: 0.8, // Baixo
      defense: 1.7,     // Era 1.0 - muito melhorado!
      hp: 1.6,          // Era 1.8 - tank HP alto
      attack: 1.4,      // Era 1.7 - balanceado  
      critical: 0.8,    // Baixo crítico
      speed: 0.6        // Era 1.0 - muito lento
    },
    duration: 4,
    cooldown: 3
  },

  eagle: {
    statModifiers: {
      strength: 0.7,    // Era 0.6 - melhorado
      agility: 1.8,     // Era 1.0 - muito melhorado!
      intelligence: 1.3, // Era 1.0 - melhorado
      defense: 0.8,     // Era 1.0 - frágil
      hp: 0.8,          // Era 0.7 - melhorado
      attack: 1.1,      // Era 1.2 - reduzido
      critical: 1.8,    // Era 1.0 - crítico muito alto!
      speed: 2.0        // Velocidade máxima
    },
    duration: 3,
    cooldown: 2
  },
  
  // Outros animais metamorfos balanceados
  leopard: {
    statModifiers: {
      strength: 1.2, agility: 1.6, intelligence: 1.1, defense: 0.9,
      hp: 1.0, attack: 1.3, critical: 1.5, speed: 1.6
    },
    duration: 3, cooldown: 2
  },
  snake: {
    statModifiers: {
      strength: 0.9, agility: 1.4, intelligence: 1.4, defense: 0.8,
      hp: 0.9, attack: 1.1, critical: 1.3, speed: 1.2
    },
    duration: 3, cooldown: 2
  },
  crocodile: {
    statModifiers: {
      strength: 1.6, agility: 0.6, intelligence: 0.9, defense: 1.8,
      hp: 1.7, attack: 1.5, critical: 0.7, speed: 0.5
    },
    duration: 4, cooldown: 3
  }
}

// Função para processar fim de turno das transformações
function processTransformationTurns(room) {
  ['player1', 'player2'].forEach(playerKey => {
    const player = room[playerKey]
    if (player?.isTransformed && player.transformationData) {
      player.transformationData.remainingTurns--
      
      if (player.transformationData.remainingTurns <= 0) {
        // Reverter transformação automaticamente
        revertPlayerTransformation(player)
        room.combatLog.push({
          type: 'system',
          message: `⏰ Transformação de ${player.name} expirou!`,
          timestamp: new Date()
        })
      }
    }
    
    // Reduzir cooldown
    if (player?.transformationData?.cooldownTurns > 0) {
      player.transformationData.cooldownTurns--
    }
  })
}

function revertPlayerTransformation(player) {
  if (!player.isTransformed || !player.transformationData) return
  
  const original = player.transformationData.originalStats
  const config = TRANSFORMATION_CONFIG[player.transformationType]
  
  // Restaurar stats originais
  player.strength = original.strength
  player.agility = original.agility
  player.intelligence = original.intelligence
  player.defense = original.defense
  player.hp = Math.min(player.hp, original.maxHp)
  player.maxHp = original.maxHp
  player.baseStats = {
    ...player.baseStats,
    str: original.strength,
    agi: original.agility,
    int: original.intelligence,
    def: original.defense,
    attack: original.attack,
    critical: original.critical,
    hp: Math.min(player.hp, original.maxHp),
    maxHp: original.maxHp
  }
  
  // Marcar como não transformado e iniciar cooldown
  player.isTransformed = false
  player.transformationType = null
  player.transformationData = {
    ...player.transformationData,
    cooldownTurns: config.cooldown,
    remainingTurns: 0
  }
}

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

  // 🐉 HANDLER DE TRANSFORMAÇÃO
  socket.on('transform', ({ playerId, roomId, transformationType }) => {
    const room = rooms.get(roomId)
    if (!room) return

    const player = room.player1?.id === playerId ? room.player1 : room.player2
    if (!player) return

    // Verificar se pode transformar
    if (player.isTransformed) {
      socket.emit('error', { message: 'Já está transformado!' })
      return
    }

    const config = TRANSFORMATION_CONFIG[transformationType]
    if (!config) {
      socket.emit('error', { message: 'Tipo de transformação inválido!' })
      return
    }

    // Verificar raça
    const validRace = (player.race === 'draconiano' && transformationType === 'dragon') ||
                     (player.race === 'metamorfo' && ['wolf', 'bear', 'eagle'].includes(transformationType))
    
    if (!validRace) {
      socket.emit('error', { message: 'Sua raça não pode usar essa transformação!' })
      return
    }

    // Verificar cooldown
    if (player.transformationData?.cooldownTurns > 0) {
      socket.emit('error', { 
        message: `Transformação em cooldown: ${player.transformationData.cooldownTurns} turnos restantes!` 
      })
      return
    }

    // Usar sistema de stamina atualizado
    const staminaCost = getStaminaCost('transformation', { 
      playerLevel: player.level || 1,
      transformationType 
    })

    if (player.stamina < staminaCost) {
      socket.emit('error', { 
        message: `Stamina insuficiente! Precisa de ${staminaCost} Stamina para transformar` 
      })
      return
    }

    // Salvar stats originais
    const originalStats = {
      strength: player.baseStats?.str || player.strength || 10,
      agility: player.baseStats?.agi || player.agility || 10,
      intelligence: player.baseStats?.int || player.intelligence || 10,
      defense: player.baseStats?.def || player.defense || 10,
      hp: player.hp,
      maxHp: player.maxHp,
      attack: player.baseStats?.attack || 10,
      critical: player.baseStats?.critical || 0.05
    }

    // Aplicar transformação
    player.isTransformed = true
    player.transformationType = transformationType
    player.transformationData = {
      remainingTurns: config.duration,
      cooldownTurns: 0,
      originalStats,
      specialAbilities: config.specialAbilities
    }

    // Aplicar multiplicadores
    const newStr = Math.floor(originalStats.strength * config.statModifiers.strength)
    const newAgi = Math.floor(originalStats.agility * config.statModifiers.agility)
    const newInt = Math.floor(originalStats.intelligence * config.statModifiers.intelligence)
    const newDef = Math.floor(originalStats.defense * config.statModifiers.defense)
    const newAttack = Math.floor(originalStats.attack * config.statModifiers.attack)
    const newCritical = originalStats.critical * config.statModifiers.critical

    // Atualizar stats do player
    player.baseStats = {
      ...player.baseStats,
      str: newStr,
      agi: newAgi,
      int: newInt,
      def: newDef,
      attack: newAttack,
      critical: newCritical
    }

    // Aplicar modificador de HP se necessário
    if (config.statModifiers.hp !== 1.0) {
      const newMaxHp = Math.floor(originalStats.maxHp * config.statModifiers.hp)
      const hpDifference = newMaxHp - originalStats.maxHp
      player.hp = Math.min(player.hp + hpDifference, newMaxHp)
      player.maxHp = newMaxHp
      player.baseStats.hp = player.hp
      player.baseStats.maxHp = newMaxHp
    }

    // Consumir recursos
    const requiredMp = transformationType === 'dragon' ? 40 : transformationType === 'bear' ? 30 : 25
    player.mp -= requiredMp
    player.stamina -= staminaCost

    room.combatLog.push({
      type: 'transformation',
      player: player.name,
      message: `⚡ ${player.name} se transforma em ${config.name}! (${config.duration} turnos)`,
      timestamp: new Date()
    })

    // Trocar turno após transformação
    room.currentTurn = room.currentTurn === room.player1?.id ? room.player2?.id : room.player1?.id

    io.to(roomId).emit('room_updated', room)
    io.to(roomId).emit('transformation_applied', {
      playerId,
      transformationType,
      config,
      remainingTurns: config.duration
    })
  })

  // Handler para usar habilidades especiais de transformação
  socket.on('use_special_ability', ({ playerId, roomId, abilityId }) => {
    const room = rooms.get(roomId)
    if (!room || room.currentTurn !== playerId) return

    const player = room.player1?.id === playerId ? room.player1 : room.player2
    const opponent = room.player1?.id === playerId ? room.player2 : room.player1

    if (!player?.isTransformed || !player.transformationData) {
      socket.emit('error', { message: 'Você não está transformado!' })
      return
    }

    const abilities = player.transformationData.specialAbilities
    if (!abilities.includes(abilityId)) {
      socket.emit('error', { message: 'Habilidade não disponível!' })
      return
    }

    // Processar habilidade especial baseada no ID
    let abilityResult = processSpecialAbility(player, opponent, abilityId)
    
    if (abilityResult.success) {
      room.combatLog.push({
        type: 'special_ability',
        player: player.name,
        message: abilityResult.message,
        timestamp: new Date()
      })

      // Trocar turno
      room.currentTurn = room.currentTurn === room.player1?.id ? room.player2?.id : room.player1?.id
      
      io.to(roomId).emit('room_updated', room)
    } else {
      socket.emit('error', { message: abilityResult.error })
    }
  })

  socket.on('player_action', ({ playerId, roomId, action, diceType, mpCost, staminaCost }) => {
    const room = rooms.get(roomId)
    if (!room || room.currentTurn !== playerId) return

    // Processar fim de turno das transformações antes da ação
    processTransformationTurns(room)

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
    
    // Usar sistema de stamina atualizado
    const systemStaminaCost = getStaminaCost('pvp', { 
      playerLevel: currentPlayer.level || 1,
      actionType: action 
    })

    // Verificar stamina necessária
    if (currentPlayer.stamina < systemStaminaCost) {
      socket.emit('error', { 
        message: `Stamina insuficiente! Precisa de ${systemStaminaCost} Stamina` 
      })
      return
    }
    
    // Aplicar custos de MP e stamina
    if (mpCost > 0) {
      currentPlayer.mp = Math.max(0, currentPlayer.mp - mpCost)
    }
    currentPlayer.stamina = Math.max(0, currentPlayer.stamina - systemStaminaCost)
    
    // 🔥 ATUALIZAÇÃO IMEDIATA para mostrar consumo de recursos
    io.to(roomId).emit('room_updated', room)
    
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
      // 🔥 ATUALIZAÇÃO IMEDIATA para mostrar consumo de stamina
      io.to(roomId).emit('room_updated', room)
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

    // 💚 REGENERAÇÃO AUTOMÁTICA - Restaurar recursos antes de fechar sala
    if (room.player1) {
      regeneratePlayerResources(room.player1, 'Room closed')
    }
    if (room.player2) {
      regeneratePlayerResources(room.player2, 'Room closed')
    }

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
    
    // 💚 REGENERAÇÃO AUTOMÁTICA - Se jogador sair de combate
    playerSockets.forEach((socketId, playerId) => {
      if (socketId === socket.id) {
        // Encontrar a sala do jogador
        rooms.forEach((room, roomId) => {
          if (room.player1?.id === playerId || room.player2?.id === playerId) {
            const player = room.player1?.id === playerId ? room.player1 : room.player2
            
            // Regenerar recursos ao sair do combate
            if (player && room.phase !== CombatPhase.WAITING_PLAYERS) {
              regeneratePlayerResources(player, 'Disconnect from combat')
            }
          }
        })
        
        playerSockets.delete(playerId)
      }
    })
  })
})

// 💚 REGENERAÇÃO AUTOMÁTICA DE RECURSOS
function regeneratePlayerResources(player, context = 'Activity') {
  if (!player) return
  
  // Restaurar HP completo
  player.hp = player.maxHp
  
  // Restaurar MP completo
  player.mp = player.maxMp
  
  // 🔥 NOVO: Resetar transformações ao final da batalha
  if (player.isTransformed) {
    revertPlayerTransformation(player)
    console.log(`🔄 ${context}: ${player.name} teve transformação resetada`)
    
    // 🔥 PERSISTIR RESET NO BANCO DE DADOS
    if (player.id) {
      fetch(`http://localhost:3000/api/character/${player.id}/detransform`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }).catch(error => {
        console.error(`❌ Erro ao persistir reset de transformação para ${player.name}:`, error)
      })
    }
  }
  
  // 🔥 NOVO: Limpar cooldowns de transformação
  if (player.transformationData) {
    player.transformationData.cooldownTurns = 0
    player.transformationData.remainingTurns = 0
    console.log(`⏰ ${context}: ${player.name} teve cooldowns resetados`)
  }
  
  // Stamina NÃO é restaurada - essa é a limitação do sistema
  console.log(`💚 ${context}: ${player.name} teve HP e MP restaurados, transformação resetada (Stamina: ${player.stamina}/${player.maxStamina})`)
}

function processCompleteAction(room, attackAction, attackRoll, defenseAction, defenseRoll, roomId) {
  const attacker = room.currentTurn === room.player1?.id ? room.player1 : room.player2
  const defender = room.currentTurn === room.player1?.id ? room.player2 : room.player1

  if (!attacker || !defender) return

  let damage = 0
  let hit = false
  
  // 🔥 SISTEMA DE DANO BALANCEADO
  // Calcular stats balanceados baseados nas novas fórmulas
  const attackerStr = Math.floor((attacker.strength || attacker.baseStats?.str || 10))
  const attackerInt = Math.floor((attacker.intelligence || attacker.baseStats?.int || 10))
  const attackerAgi = Math.floor((attacker.agility || attacker.baseStats?.agi || 10))
  const defenderDef = Math.floor((defender.defense || defender.baseStats?.def || 5))
  const defenderAgi = Math.floor((defender.agility || defender.baseStats?.agi || 5))
  
  // Damage multipliers balanceados
  const physicalPower = Math.floor(attackerStr * 1.5)  // STR menos dominante
  const magicPower = Math.floor(attackerInt * 2.0)     // INT mais forte
  const defenseReduction = Math.floor(defenderDef * 0.8) // DEF reduz dano real
  
  // Calcular dano base por tipo de ataque + dado + stat
  let baseDamage = attackRoll + physicalPower  // Default físico
  switch (attackAction) {
    case 'light_attack':
      baseDamage = attackRoll + Math.floor(physicalPower * 0.8)  // Dado + 80% do STR balanceado
      break
    case 'heavy_attack':
      baseDamage = attackRoll + Math.floor(physicalPower * 1.0)  // Dado + 100% do STR balanceado
      break
    case 'special_attack':
      // 🔥 NOVO: Special sempre usa o stat mais alto (físico vs mágico)
      if (attackerInt >= attackerStr) {
        // Ataque mágico - mais forte que físico!
        baseDamage = attackRoll + magicPower
        room.combatLog.push({
          type: 'action',
          message: `✨ Ataque Mágico! (INT: ${attackerInt} > STR: ${attackerStr})`,
          timestamp: new Date()
        })
      } else {
        // Ataque físico especial
        baseDamage = attackRoll + Math.floor(physicalPower * 1.2)
        room.combatLog.push({
          type: 'action', 
          message: `⚔️ Ataque Físico Especial! (STR: ${attackerStr} > INT: ${attackerInt})`,
          timestamp: new Date()
        })
      }
      break
  }

  // Sistema de combate melhorado
  if (defenseAction === 'dodge') {
    // 🔥 ESQUIVA BASEADA EM AGI - Muito mais útil!
    const dodgeChance = (defenderAgi * 0.5) + 3  // AGI × 0.5 + 3% base
    const dodgeRoll = Math.random() * 100
    
    if (dodgeRoll < dodgeChance) {
      // Esquiva bem-sucedida
      room.combatLog.push({
        type: 'result',
        message: `🌪️ Esquiva perfeita! ${defender.name} evitou todo o dano! (${dodgeChance.toFixed(1)}% chance, AGI: ${defenderAgi})`,
        timestamp: new Date()
      })
    } else {
      // Esquiva falhou - dano reduzido mas não total
      damage = Math.max(1, baseDamage - Math.floor(defenseReduction * 0.5))
      hit = true
      room.combatLog.push({
        type: 'result',
        message: `❌ Esquiva falhou! Dano parcial aplicado (${dodgeChance.toFixed(1)}% chance)`,
        timestamp: new Date()
      })
    }
  } else if (defenseAction === 'defend') {
    // 🔥 DEFESA BASEADA EM DEF - Reduz dano significativamente
    damage = Math.max(1, baseDamage - defenseReduction)
    hit = true
    room.combatLog.push({
      type: 'result',
      message: `🛡️ Bloqueio! Defesa absorveu ${defenseReduction} de dano (DEF: ${Math.floor(defenderDef)})`,
      timestamp: new Date()
    })
  }

  // 🔥 SISTEMA DE CRÍTICO BASEADO EM AGI - Muito mais útil!
  if (hit) {
    const criticalChance = (attackerAgi * 0.5) + 5  // AGI × 0.5 + 5% base
    const criticalRoll = Math.random() * 100
    
    if (criticalRoll < criticalChance) {
      damage = Math.floor(damage * 1.8)  // +80% de dano
      room.combatLog.push({
        type: 'result',
        message: `💥 CRÍTICO! Dano aumentado em 80%! (${criticalChance.toFixed(1)}% chance, AGI: ${attackerAgi})`,
        timestamp: new Date()
      })
    }
  }

  // Aplicar dano e verificar resistência mágica
  if (hit && damage > 0) {
    // 🔥 RESISTÊNCIA MÁGICA PARA ATAQUES ESPECIAIS MÁGICOS
    if (attackAction === 'special_attack' && attacker.intelligence > (attacker.strength || 0)) {
      const magicResistance = Math.floor((defender.intelligence || 5) * 0.4)
      damage = Math.max(1, damage - magicResistance)
      room.combatLog.push({
        type: 'result',
        message: `🔮 Resistência mágica reduziu ${magicResistance} de dano mágico`,
        timestamp: new Date()
      })
    }

    // Aplicar dano ao HP correto (usando .hp ao invés de .currentHp)
    defender.hp = Math.max(0, defender.hp - damage)
    
    // Log de dano com detalhes dos stats balanceados
    const attackType = attackAction === 'light_attack' ? 'Ataque Leve' : 
                      attackAction === 'heavy_attack' ? 'Ataque Pesado' :
                      (attacker.intelligence > (attacker.strength || 0) ? 'Magia Especial' : 'Ataque Especial')
    
    room.combatLog.push({
      type: 'damage',
      message: `⚔️ ${attackType}! ${attacker.name} causou ${damage} de dano! (${defender.hp}/${defender.maxHp} HP)`,
      timestamp: new Date()
    })

    // Consumir stamina do atacante baseado no tipo de ataque
    let staminaCost = 0
    switch (attackAction) {
      case 'light_attack': staminaCost = 5; break
      case 'heavy_attack': staminaCost = 12; break
      case 'special_attack': staminaCost = 20; break
    }
    
    if (attacker.stamina !== undefined) {
      attacker.stamina = Math.max(0, attacker.stamina - staminaCost)
    }
    
    // 🔥 ATUALIZAÇÃO IMEDIATA para ambos verem o dano aplicado
    io.to(roomId).emit('room_updated', room)
  }

  // Verificar fim do combate
  if (defender.hp <= 0) {
    room.phase = CombatPhase.COMBAT_END
    room.winner = attacker.id
    
    // 🔥 REGENERAÇÃO AUTOMÁTICA - Restaurar HP e MP após combate
    regeneratePlayerResources(attacker, 'PvP Victory')
    regeneratePlayerResources(defender, 'PvP Defeat')
    
    room.combatLog.push({
      type: 'victory',
      message: `🏆 ${attacker.name} venceu o combate!`,
      timestamp: new Date()
    })
    
    room.combatLog.push({
      type: 'system',
      message: `💚 HP e MP restaurados automaticamente! Apenas Stamina foi consumida.`,
      timestamp: new Date()
    })
    
    // Log de estatísticas finais para análise de balance
    room.combatLog.push({
      type: 'stats',
      message: `📊 Stats do Vencedor: STR:${attacker.strength || 0} AGI:${attacker.agility || 0} INT:${attacker.intelligence || 0} DEF:${attacker.defense || 0}`,
      timestamp: new Date()
    })
  } else {
    // Próximo turno com log de stats para acompanhar balance
    room.currentTurn = defender.id
    room.phase = CombatPhase.PLAYER_TURN
    room.combatLog.push({
      type: 'system',
      message: `🔄 Turno de ${defender.name} | HP: ${defender.hp}/${defender.maxHp} | Stamina: ${attacker.stamina || '?'}`,
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

function processSpecialAbility(player, opponent, abilityId) {
  const transformationType = player.transformationType
  
  // 🐉 HABILIDADES DO DRAGÃO
  if (transformationType === 'dragon') {
    switch (abilityId) {
      case 'dragon_breath':
        if (player.stamina < 15) return { success: false, error: 'Stamina insuficiente!' }
        
        const breathDamage = Math.floor(Math.random() * 20) + 1 + (player.baseStats.str * 2)
        const actualDamage = Math.max(1, Math.floor(breathDamage * 0.5)) // Ignora 50% da defesa
        
        opponent.hp = Math.max(0, opponent.hp - actualDamage)
        player.stamina -= 15
        
        return {
          success: true,
          message: `🔥 ${player.name} usa Sopro de Fogo! ${opponent.name} recebeu ${actualDamage} de dano! (${opponent.hp}/${opponent.maxHp} HP)`
        }
        
      case 'dragon_roar':
        if (player.stamina < 10) return { success: false, error: 'Stamina insuficiente!' }
        
        // Aplicar debuff de -20% ataque por 2 turnos
        if (!opponent.debuffs) opponent.debuffs = {}
        opponent.debuffs.weakened = { turns: 2, effect: -0.2 }
        player.stamina -= 10
        
        return {
          success: true,
          message: `🦅 ${player.name} ruge intimidadoramente! ${opponent.name} está abalado (-20% ataque por 2 turnos)`
        }
        
      case 'dragon_scales':
        if (player.mp < 15) return { success: false, error: 'MP insuficiente!' }
        
        // Aplicar buff de redução de dano
        if (!player.buffs) player.buffs = {}
        player.buffs.dragonScales = { turns: 3, damageReduction: 5 }
        player.mp -= 15
        
        return {
          success: true,
          message: `🛡️ ${player.name} ativa Escamas Dracônicas! (-5 dano recebido por 3 turnos)`
        }
    }
  }
  
  // 🐺 HABILIDADES DO LOBO
  if (transformationType === 'wolf') {
    switch (abilityId) {
      case 'pack_hunt':
        if (player.stamina < 20) return { success: false, error: 'Stamina insuficiente!' }
        
        let totalDamage = 0
        for (let i = 0; i < 3; i++) {
          const attackDamage = Math.floor(Math.random() * 12) + 1 + player.baseStats.agi
          const finalDamage = Math.max(1, attackDamage - Math.floor(opponent.baseStats.def * 0.5))
          totalDamage += finalDamage
        }
        
        opponent.hp = Math.max(0, opponent.hp - totalDamage)
        player.stamina -= 20
        
        return {
          success: true,
          message: `🏃 ${player.name} executa Caçada em Matilha! 3 ataques causaram ${totalDamage} de dano total! (${opponent.hp}/${opponent.maxHp} HP)`
        }
        
      case 'howl':
        if (player.stamina < 15) return { success: false, error: 'Stamina insuficiente!' }
        
        // Boost permanente de agilidade
        player.baseStats.agi += 2
        player.stamina -= 15
        
        return {
          success: true,
          message: `🌙 ${player.name} uiva selvagemente! Agilidade aumentada permanentemente (+2 AGI)`
        }
        
      case 'bite_bleeding':
        if (player.stamina < 12) return { success: false, error: 'Stamina insuficiente!' }
        
        const biteDamage = Math.floor(Math.random() * 16) + 1 + Math.floor(player.baseStats.str * 1.5)
        const finalDamage = Math.max(1, biteDamage - Math.floor(opponent.baseStats.def * 0.5))
        
        // Aplicar sangramento
        if (!opponent.debuffs) opponent.debuffs = {}
        opponent.debuffs.bleeding = { turns: 3, damage: 8 }
        
        opponent.hp = Math.max(0, opponent.hp - finalDamage)
        player.stamina -= 12
        
        return {
          success: true,
          message: `🩸 ${player.name} morde ferozmente! ${finalDamage} de dano + sangramento (8 dano/turno por 3 turnos)! (${opponent.hp}/${opponent.maxHp} HP)`
        }
    }
  }
  
  // 🐻 HABILIDADES DO URSO
  if (transformationType === 'bear') {
    switch (abilityId) {
      case 'bear_hug':
        if (player.stamina < 25) return { success: false, error: 'Stamina insuficiente!' }
        
        const hugDamage = Math.floor(Math.random() * 16) + 1 + Math.floor(player.baseStats.str * 1.2)
        
        // Imobilizar por 2 turnos + DoT
        if (!opponent.debuffs) opponent.debuffs = {}
        opponent.debuffs.immobilized = { turns: 2 }
        opponent.debuffs.squeezed = { turns: 2, damage: hugDamage }
        
        opponent.hp = Math.max(0, opponent.hp - hugDamage)
        player.stamina -= 25
        
        return {
          success: true,
          message: `🤗 ${player.name} abraça ${opponent.name}! ${hugDamage} de dano + imobilizado e esmagado por 2 turnos! (${opponent.hp}/${opponent.maxHp} HP)`
        }
        
      case 'intimidating_roar':
        if (player.stamina < 15) return { success: false, error: 'Stamina insuficiente!' }
        
        // Reduzir dano do oponente em 30% por 4 turnos
        if (!opponent.debuffs) opponent.debuffs = {}
        opponent.debuffs.intimidated = { turns: 4, damageReduction: 0.3 }
        player.stamina -= 15
        
        return {
          success: true,
          message: `😤 ${player.name} ruge intimidadoramente! ${opponent.name} está amedrontado (-30% dano por 4 turnos)`
        }
        
      case 'unstoppable_charge':
        if (player.stamina < 30) return { success: false, error: 'Stamina insuficiente!' }
        
        const chargeDamage = Math.floor(Math.random() * 20) + 1 + Math.floor(player.baseStats.str * 2.5)
        // Ignora TODA a defesa
        
        opponent.hp = Math.max(0, opponent.hp - chargeDamage)
        player.stamina -= 30
        
        return {
          success: true,
          message: `💥 ${player.name} executa Investida Imparável! ${chargeDamage} de dano (ignora defesa)! (${opponent.hp}/${opponent.maxHp} HP)`
        }
    }
  }
  
  // 🦅 HABILIDADES DA ÁGUIA
  if (transformationType === 'eagle') {
    switch (abilityId) {
      case 'dive_attack':
        if (player.stamina < 20) return { success: false, error: 'Stamina insuficiente!' }
        
        const diveDamage = Math.floor(Math.random() * 20) + 1 + (player.baseStats.agi * 2)
        const criticalDamage = Math.floor(diveDamage * 2) // Crítico garantido
        const finalDamage = Math.max(1, criticalDamage - Math.floor(opponent.baseStats.def * 0.5))
        
        opponent.hp = Math.max(0, opponent.hp - finalDamage)
        player.stamina -= 20
        
        return {
          success: true,
          message: `💨 ${player.name} mergulha do alto! Crítico garantido: ${finalDamage} de dano! (${opponent.hp}/${opponent.maxHp} HP)`
        }
        
      case 'aerial_superiority':
        if (player.mp < 15) return { success: false, error: 'MP insuficiente!' }
        
        // Imune a ataques terrestres por 1 turno
        if (!player.buffs) player.buffs = {}
        player.buffs.flying = { turns: 1, groundImmunity: true }
        player.mp -= 15
        
        return {
          success: true,
          message: `☁️ ${player.name} voa alto! Imune a ataques terrestres por 1 turno!`
        }
        
      case 'keen_sight':
        if (player.stamina < 10) return { success: false, error: 'Stamina insuficiente!' }
        
        // Próximo ataque ignora esquiva
        if (!player.buffs) player.buffs = {}
        player.buffs.keenSight = { turns: 1, ignoreEvasion: true }
        player.stamina -= 10
        
        return {
          success: true,
          message: `👁️ ${player.name} foca intensamente! Próximo ataque ignora esquiva!`
        }
    }
  }
  
  return { success: false, error: 'Habilidade não reconhecida!' }
}
