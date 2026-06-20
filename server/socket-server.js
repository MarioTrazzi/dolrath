const { createServer } = require('http')
const { Server } = require('socket.io')

// Importar sistema de stamina (versão local JavaScript)
const { getStaminaCost, checkStaminaLevel, calculateStaminaRegeneration } = require('./staminaSystem')

// 🐉 Modo treino - bot monstro que joga pelas regras do PvP
const { spawnTrainingBot, MONSTERS } = require('./training-bot')

// Configuração de porta - Railway usa PORT, Heroku também
const PORT = process.env.PORT || 3001

// 🐉 CONFIGURAÇÕES DE TRANSFORMAÇÃO REBALANCEADAS
// (nome em MAIÚSCULA: é o identificador usado em getConfig/handler — antes
//  era `transformationConfigs`, que deixava TRANSFORMATION_CONFIG undefined
//  e quebrava QUALQUER transformação no PvP com ReferenceError.)
const TRANSFORMATION_CONFIG = {
  // DRACONIANOS - Tank supremo com poder devastador
  dragon: {
    statModifiers: {
      strength: 2.0,    // 🔥 BUFF: +100% STR (era 1.6)
      agility: 1.2,     // Melhorado  
      intelligence: 1.2, // Melhorado
      defense: 1.8,     // 🔥 BUFF: +80% DEF (era 1.4)
      hp: 1.6,          // 🔥 BUFF: +60% HP (era 1.4)
      attack: 1.7,      // 🔥 BUFF: Mais ataque (era 1.5)
      critical: 1.3,    // Melhorado
      speed: 1.0
    },
    duration: 5,        // 🔥 BUFF: Mais duração (era 4)
    cooldown: 3
  },

  // METAMORFOS - Especializações extremas
  wolf: {
    statModifiers: {
      strength: 1.4,    // Ligeiramente melhorado
      agility: 2.0,     // 🔥 BUFF: +100% AGI (era 1.5)
      intelligence: 0.8, // Mantido
      defense: 1.0,     // Neutro
      hp: 1.2,          // Melhorado
      attack: 1.4,      // Mantido
      critical: 2.0,    // 🔥 BUFF: +100% crítico (era 1.6)
      speed: 1.6        // 🔥 BUFF: Mais velocidade
    },
    duration: 4,        // 🔥 BUFF: Mais duração (era 3)
    cooldown: 2
  },

  bear: {
    statModifiers: {
      strength: 1.8,    // 🔥 BUFF: Mais força (era 1.5)
      agility: 0.7,     // Tank lento
      intelligence: 0.8, // Baixo
      defense: 2.0,     // 🔥 BUFF: +100% DEF (era 1.7)
      hp: 1.8,          // 🔥 BUFF: +80% HP (era 1.6)
      attack: 1.6,      // 🔥 BUFF: Mais ataque (era 1.4)
      critical: 0.8,    // Baixo crítico
      speed: 0.6        // Lento
    },
    duration: 5,        // 🔥 BUFF: Mais duração (era 4)
    cooldown: 3
  },

  eagle: {
    statModifiers: {
      strength: 0.7,    // Frágil
      agility: 2.2,     // 🔥 BUFF: +120% AGI (era 1.8)
      intelligence: 1.5, // 🔥 BUFF: Mais inteligência (era 1.3)
      defense: 0.8,     // Frágil
      hp: 0.8,          // Baixo HP
      attack: 1.2,      // Melhorado
      critical: 2.2,    // 🔥 BUFF: +120% crítico (era 1.8)
      speed: 2.5        // 🔥 BUFF: Velocidade máxima (era 2.0)
    },
    duration: 4,        // 🔥 BUFF: Mais duração (era 3)
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
  player.resistance = Math.floor(original.defense * 0.8) // espelha o campo de topo usado na mitigação
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

// Enum para roles na sala
const RoomRole = {
  FIGHTER: 'fighter',      // 2 vagas - jogadores que lutam
  SPECTATOR: 'spectator',  // 8 vagas - observam o combate
  MODERATOR: 'moderator'   // 2 vagas - podem controlar a sala (desativado por enquanto)
}

// Limites de cada role
const ROLE_LIMITS = {
  [RoomRole.FIGHTER]: 2,
  [RoomRole.SPECTATOR]: 8,
  [RoomRole.MODERATOR]: 2
}

io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id)

  socket.on('join_room', ({ roomId, player, isCreator, role = RoomRole.FIGHTER, training = false, monster = 'goblin' }) => {
    console.log(`Jogador ${player.name} entrando na sala ${roomId} como ${role}${training ? ` (treino vs ${monster})` : ''}`)
    
    playerSockets.set(player.id, socket.id)
    socket.join(roomId)
    
    let room = rooms.get(roomId)
    if (!room) {
      room = {
        id: roomId,
        creator: null,
        // Estrutura expandida para múltiplos participantes
        participants: {
          fighters: [],      // Array de até 2 lutadores
          spectators: [],    // Array de até 8 espectadores
          moderators: []     // Array de até 2 moderadores (desativado)
        },
        // Manter compatibilidade com código existente
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

    // Reconexão: se o jogador já está na sala como lutador, apenas atualizar o socket
    // (evita duplicar o mesmo jogador como player2 após refresh da página)
    const existingFighterIdx = room.participants.fighters.findIndex(f => f.id === player.id)
    if (existingFighterIdx !== -1) {
      room.participants.fighters[existingFighterIdx] = { ...room.participants.fighters[existingFighterIdx], socketId: socket.id }
      if (room.player1?.id === player.id) {
        room.player1.isConnected = true
      } else if (room.player2?.id === player.id) {
        room.player2.isConnected = true
      }
      io.to(roomId).emit('room_updated', room)
      return
    }

    // Verificar se o role solicitado tem vagas disponíveis
    const currentCount = room.participants[role + 's'] ? room.participants[role + 's'].length : 0
    const maxCount = ROLE_LIMITS[role]
    
    if (currentCount >= maxCount && !isCreator) {
      socket.emit('join_room_error', { 
        error: `Role ${role} está cheio (${currentCount}/${maxCount})`,
        availableRoles: getAvailableRoles(room)
      })
      return
    }

    // Adicionar participante ao role apropriado
    const participantData = { ...player, role, socketId: socket.id }
    
    if (role === RoomRole.FIGHTER) {
      // Criador retornando (refresh/remontagem): remover a entrada antiga para não ocupar a vaga do oponente
      if (isCreator && room.player1 && room.player1.id !== player.id) {
        room.participants.fighters = room.participants.fighters.filter(f => f.id !== room.player1.id)
      }
      room.participants.fighters.push(participantData)

      // Manter compatibilidade: atualizar player1/player2
      if (!room.player1 || isCreator) {
        room.player1 = player
        if (isCreator) {
          room.creator = player.id
        }
      } else if (!room.player2 && room.participants.fighters.length <= 2) {
        room.player2 = player
        room.combatLog.push({
          type: 'system',
          message: `${player.name} entrou como lutador!`,
          timestamp: new Date()
        })
      }
    } else if (role === RoomRole.SPECTATOR) {
      room.participants.spectators.push(participantData)
      room.combatLog.push({
        type: 'system',
        message: `${player.name} está assistindo ao combate! 👁️`,
        timestamp: new Date()
      })
    } else if (role === RoomRole.MODERATOR) {
      // Moderador desativado por enquanto
      socket.emit('join_room_error', { 
        error: 'Role de moderador está temporariamente desativado',
        availableRoles: getAvailableRoles(room)
      })
      return
    }

    // Definir criador se for o primeiro participante
    if (isCreator) {
      room.creator = player.id
    }

    // 🐉 MODO TREINO: spawnar o monstro como oponente (bot interno)
    if (training && isCreator && role === RoomRole.FIGHTER && !room.botSpawned) {
      room.isTraining = true
      room.botSpawned = true
      const monsterKey = MONSTERS[monster] ? monster : 'goblin'

      room.combatLog.push({
        type: 'system',
        message: `🏟️ Modo Treino! Um ${MONSTERS[monsterKey].name} se aproxima... (sem recompensas PvP)`,
        timestamp: new Date()
      })

      setTimeout(() => {
        spawnTrainingBot({
          roomId,
          port: PORT,
          playerLevel: player.level || 1,
          monsterKey
        })
      }, 1000)
    }

    io.to(roomId).emit('room_updated', room)
    io.to(roomId).emit('player_joined', { player: participantData, role })
  })

  // Função auxiliar para verificar roles disponíveis
  function getAvailableRoles(room) {
    const available = []
    
    if (room.participants.fighters.length < ROLE_LIMITS[RoomRole.FIGHTER]) {
      available.push(RoomRole.FIGHTER)
    }
    if (room.participants.spectators.length < ROLE_LIMITS[RoomRole.SPECTATOR]) {
      available.push(RoomRole.SPECTATOR)
    }
    // Moderador desativado
    // if (room.participants.moderators.length < ROLE_LIMITS[RoomRole.MODERATOR]) {
    //   available.push(RoomRole.MODERATOR)
    // }
    
    return available
  }

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

    // Rolar d20 puro - apenas sorte
    const roll = Math.floor(Math.random() * 20) + 1
    const total = roll // Sem modificadores

    // Armazenar rolagem de iniciativa
    if (!room.initiativeRolls) {
      room.initiativeRolls = {}
    }
    room.initiativeRolls[playerId] = { roll, total }

    room.combatLog.push({
      type: 'action',
      player: player.name,
      message: `🎲 ${player.name}: Rolou d20 = ${roll}`,
      timestamp: new Date()
    })

    // 🎲 Notificar a rolagem para o dado animado revelar o resultado na face
    io.to(roomId).emit('dice_rolled', {
      playerId,
      sides: 20,
      result: { roll, modifier: 0, total }
    })

    // Verificar se ambos rolaram
    const player1Id = room.player1?.id
    const player2Id = room.player2?.id

    if (room.initiativeRolls[player1Id] && room.initiativeRolls[player2Id]) {
      // Mostrar a segunda rolagem primeiro; resolver após a animação do dado
      io.to(roomId).emit('room_updated', room)

      setTimeout(() => {
        const r = rooms.get(roomId)
        if (!r || r.phase !== CombatPhase.INITIATIVE_ROLL) return
        if (!r.initiativeRolls?.[player1Id] || !r.initiativeRolls?.[player2Id]) return

        const initiative1 = r.initiativeRolls[player1Id].total
        const initiative2 = r.initiativeRolls[player2Id].total

        let winner = null
        let winnerName = ''

        if (initiative1 > initiative2) {
          winner = player1Id
          winnerName = r.player1.name
        } else if (initiative2 > initiative1) {
          winner = player2Id
          winnerName = r.player2.name
        } else {
          // Empate! Resolver por XP
          const player1XP = r.player1.experience || 0
          const player2XP = r.player2.experience || 0

          if (player1XP >= player2XP) {
            winner = player1Id
            winnerName = r.player1.name
            r.combatLog.push({
              type: 'system',
              message: `⚖️ Empate! ${r.player1.name} começa por ter mais experiência (${player1XP} vs ${player2XP} XP)`,
              timestamp: new Date()
            })
          } else {
            winner = player2Id
            winnerName = r.player2.name
            r.combatLog.push({
              type: 'system',
              message: `⚖️ Empate! ${r.player2.name} começa por ter mais experiência (${player2XP} vs ${player1XP} XP)`,
              timestamp: new Date()
            })
          }
        }

        r.currentTurn = winner
        if (!r.combatLog.some(log => log.message.includes('⚖️ Empate!'))) {
          r.combatLog.push({
            type: 'system',
            message: `🏃 ${winnerName} começa o combate!`,
            timestamp: new Date()
          })
        }

        // 🏥 SALVAR HP INICIAL PARA DETECTAR VITÓRIAS PERFEITAS
        r.player1.initialHp = r.player1.hp
        r.player2.initialHp = r.player2.hp

        r.phase = CombatPhase.PLAYER_TURN
        io.to(roomId).emit('room_updated', r)
      }, 1600)

      return
    }

    io.to(roomId).emit('room_updated', room)
  })

  // 🐉 HANDLER DE TRANSFORMAÇÃO
  socket.on('transform', ({ playerId, roomId, transformationType }) => {
    const room = rooms.get(roomId)
    if (!room) return

    const player = room.player1?.id === playerId ? room.player1 : room.player2
    if (!player) return

    // 🚧 EM REBALANCEAMENTO: a transformação no PvP está OP e assimétrica (só
    // draconiano/metamorfo têm forma; multiplicadores derrubam humano/elfo) —
    // medido em scripts/pvp-race-class-sim.js (TRANSFORM=1). Desabilitada por
    // padrão até as formas das 4 raças + magnitude serem balanceadas e a UI
    // de humano/elfo existir. Reative com ENABLE_PVP_TRANSFORM=1.
    if (!process.env.ENABLE_PVP_TRANSFORM) {
      socket.emit('error', { message: 'Transformação está em manutenção e voltará balanceada em breve!' })
      return
    }

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

    // 🔥 SISTEMA REBALANCEADO: Custos reduzidos drasticamente
    const reducedStaminaCost = Math.floor(staminaCost * 0.3) // 70% menos stamina
    const reducedMpCost = transformationType === 'dragon' ? 15 : 10 // MP muito reduzido

    if (player.stamina < reducedStaminaCost) {
      socket.emit('error', { 
        message: `Stamina insuficiente! Precisa de ${reducedStaminaCost} Stamina para transformar` 
      })
      return
    }

    if (player.mp < reducedMpCost) {
      socket.emit('error', { 
        message: `MP insuficiente! Precisa de ${reducedMpCost} MP para transformar` 
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

    // ⚔️ O combate lê os campos de TOPO (attacker.strength/agility/intelligence,
    // defender.defense/resistance), não baseStats. Sem atualizá-los, a
    // transformação só mexia no HP e NÃO aumentava dano/defesa. Corrigido:
    player.strength = newStr
    player.agility = newAgi
    player.intelligence = newInt
    player.defense = newDef
    player.resistance = Math.floor(newDef * 0.8)

    // Aplicar modificador de HP se necessário
    if (config.statModifiers.hp !== 1.0) {
      const newMaxHp = Math.floor(originalStats.maxHp * config.statModifiers.hp)
      const hpDifference = newMaxHp - originalStats.maxHp
      player.hp = Math.min(player.hp + hpDifference, newMaxHp)
      player.maxHp = newMaxHp
      player.baseStats.hp = player.hp
      player.baseStats.maxHp = newMaxHp
    }

    // 🔥 CONSUMIR RECURSOS REDUZIDOS
    player.mp -= reducedMpCost
    player.stamina -= reducedStaminaCost

    room.combatLog.push({
      type: 'transformation',
      player: player.name,
      message: `⚡ ${player.name} se transforma em ${transformationType}! (${config.duration} turnos, -${reducedMpCost} MP, -${reducedStaminaCost} Stamina)`,
      timestamp: new Date()
    })

    // 🔥 NOVA MECÂNICA: Transformação custa 1 turno completo
    room.currentTurn = room.currentTurn === room.player1?.id ? room.player2?.id : room.player1?.id
    
    room.combatLog.push({
      type: 'system',
      message: `🔄 ${player.name} gastou o turno se transformando! Vez de ${room.currentTurn === room.player1?.id ? room.player1?.name : room.player2?.name}`,
      timestamp: new Date()
    })

    io.to(roomId).emit('room_updated', room)
    io.to(roomId).emit('transformation_applied', {
      playerId,
      transformationType,
      config,
      remainingTurns: config.duration
    })
  })

  // 🐉 Sincroniza a transformação aplicada via API REST (criação) no estado da sala.
  // O fluxo novo (combat/page.tsx -> /api/character/[id]/transform) já validou custos,
  // calculou os stats e persistiu no banco — aqui só replicamos o resultado no objeto
  // do player da sala para que o OPONENTE também veja a arte/glow da transformação.
  socket.on('sync_transformation', ({
    playerId, roomId, transformationType, transformationName,
    isTransformed, transformationImage, unlockedTransformation,
    transformationData, duration, stats
  }) => {
    const room = rooms.get(roomId)
    if (!room) return

    const player = room.player1?.id === playerId ? room.player1
      : room.player2?.id === playerId ? room.player2
      : null
    if (!player) return

    player.isTransformed = !!isTransformed
    player.transformationType = transformationType || null
    player.transformationImage = transformationImage || null
    player.unlockedTransformation = unlockedTransformation || null
    if (transformationData) player.transformationData = transformationData

    if (stats && typeof stats === 'object') {
      for (const [key, value] of Object.entries(stats)) {
        if (value !== undefined && value !== null) player[key] = value
      }
    }

    room.combatLog.push({
      type: 'transformation',
      player: player.name,
      message: `🌟 ${player.name} se transformou${transformationName ? ` em ${transformationName}` : ''}!${duration ? ` (+${duration} turnos)` : ''}`,
      timestamp: new Date()
    })

    // Transformação consome o turno (mesma regra do fluxo legado acima)
    if (room.currentTurn === playerId) {
      const nextTurn = room.player1?.id === playerId ? room.player2?.id : room.player1?.id
      if (nextTurn) {
        room.currentTurn = nextTurn
        room.combatLog.push({
          type: 'system',
          message: `🔄 Vez de ${room.currentTurn === room.player1?.id ? room.player1?.name : room.player2?.name}`,
          timestamp: new Date()
        })
      }
    }

    io.to(roomId).emit('room_updated', room)
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
      // 😮‍💨 DEFENSOR EXAUSTO: sem stamina nem para esquivar (custo 1) —
      // pula a reação e vai direto para a rolagem do atacante (evita soft-lock)
      if ((opponent?.stamina || 0) < 1) {
        room.pendingAction = {
          action,
          diceType,
          playerId,
          type: 'attack',
          attackRoll: undefined,
          defenseAction: 'exhausted',
          defenseRoll: 0
        }
        room.phase = CombatPhase.DICE_ROLL
        room.combatLog.push({
          type: 'action',
          player: currentPlayer.name,
          message: `🎯 ${actionNames[action]} selecionado! 😮‍💨 ${opponent.name} está exausto e não pode reagir — role o d${diceType}!`,
          timestamp: new Date()
        })
      } else {
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
      }
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

    // Defensor exausto não participa do conteste (apenas o atacante rola)
    if (room.pendingAction?.type === 'attack' &&
        room.pendingAction.defenseAction === 'exhausted' &&
        playerId !== room.pendingAction.playerId) {
      return
    }

    const player = room.player1?.id === playerId ? room.player1 : room.player2
    const roll = Math.floor(Math.random() * sides) + 1
    
    // 🎯 MODIFICADOR DE ESQUIVA: conteste de AGI líquida (defensor − atacante),
    // capado pelo tamanho do dado (d6→±1, d10→±2, d20→±3)
    let modifier = 0

    if (room.pendingAction && room.phase === CombatPhase.DICE_ROLL) {
      const isDefender = playerId !== room.pendingAction.playerId

      if (isDefender && room.pendingAction.defenseAction === 'dodge') {
        const attacker = room.player1?.id === room.pendingAction.playerId ? room.player1 : room.player2
        modifier = dodgeNetBonus(player.agility, attacker?.agility || 0, sides)
      }
    }

    const total = roll + modifier

    room.combatLog.push({
      type: 'action',
      player: player.name,
      message: `🎲 ${player.name}: Rolou d${sides} = ${roll}${modifier !== 0 ? ` ${modifier > 0 ? '+' : '−'} ${Math.abs(modifier)} (AGI) = ${total}` : ''}`,
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

  // 🧪 Usar consumível da hotbar: aplica efeito, registra no log e consome o turno (regra atual)
  socket.on('use_consumable', ({ playerId, roomId, item }) => {
    const room = rooms.get(roomId)
    if (!room || !room.isActive || room.phase !== CombatPhase.PLAYER_TURN) return
    if (room.currentTurn !== playerId) return

    const player = room.player1?.id === playerId ? room.player1 : room.player2
    const opponent = room.player1?.id === playerId ? room.player2 : room.player1
    if (!player || !opponent) return

    const hpRestored = Math.max(0, Math.min(Number(item?.hpRestore) || 0, player.maxHp - player.hp))
    const mpRestored = Math.max(0, Math.min(Number(item?.mpRestore) || 0, player.maxMp - player.mp))
    const staminaRestored = Math.max(0, Math.min(Number(item?.staminaRestore) || 0, player.maxStamina - player.stamina))

    player.hp += hpRestored
    player.mp += mpRestored
    player.stamina += staminaRestored

    const effects = []
    if (hpRestored > 0) effects.push(`+${hpRestored} HP`)
    if (mpRestored > 0) effects.push(`+${mpRestored} MP`)
    if (staminaRestored > 0) effects.push(`+${staminaRestored} stamina`)

    room.combatLog.push({
      type: 'action',
      player: player.name,
      message: `🧪 ${player.name} usou ${item?.name || 'um item'}!${effects.length ? ` (${effects.join(', ')})` : ''}`,
      timestamp: new Date()
    })

    io.to(roomId).emit('consumable_used', {
      playerId,
      itemName: item?.name || 'Item',
      hpRestored,
      mpRestored,
      staminaRestored,
      newHp: player.hp,
      newMp: player.mp,
      newStamina: player.stamina
    })

    // Usar item consome o turno
    room.currentTurn = opponent.id
    regenTurnStamina(room)
    room.combatLog.push({
      type: 'system',
      message: `🔄 Turno de ${opponent.name}`,
      timestamp: new Date()
    })

    io.to(roomId).emit('room_updated', room)
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
        // Encontrar a sala do jogador e remover das participações
        rooms.forEach((room, roomId) => {
          let playerFound = false
          let wasLastPlayer = false
          
          // Verificar e remover de fighters
          const fighterIndex = room.participants.fighters.findIndex(p => p.id === playerId)
          if (fighterIndex !== -1) {
            const player = room.participants.fighters[fighterIndex]
            room.participants.fighters.splice(fighterIndex, 1)
            playerFound = true
            
            // Regenerar recursos ao sair do combate
            if (room.phase !== CombatPhase.WAITING_PLAYERS) {
              regeneratePlayerResources(player, 'Disconnect from combat')
            }
            
            // Atualizar compatibilidade player1/player2
            if (room.player1?.id === playerId) {
              room.player1 = room.participants.fighters[0] || null
            }
            if (room.player2?.id === playerId) {
              room.player2 = room.participants.fighters[1] || null
            }
            
            room.combatLog.push({
              type: 'system',
              message: `${player.name} saiu do combate! 👋`,
              timestamp: new Date()
            })
          }
          
          // Verificar e remover de spectators
          const spectatorIndex = room.participants.spectators.findIndex(p => p.id === playerId)
          if (spectatorIndex !== -1) {
            const player = room.participants.spectators[spectatorIndex]
            room.participants.spectators.splice(spectatorIndex, 1)
            playerFound = true
            
            room.combatLog.push({
              type: 'system',
              message: `${player.name} parou de assistir! 👁️‍🗨️`,
              timestamp: new Date()
            })
          }
          
          // Verificar e remover de moderators
          const moderatorIndex = room.participants.moderators.findIndex(p => p.id === playerId)
          if (moderatorIndex !== -1) {
            const player = room.participants.moderators[moderatorIndex]
            room.participants.moderators.splice(moderatorIndex, 1)
            playerFound = true
            
            room.combatLog.push({
              type: 'system',
              message: `Moderador ${player.name} saiu! 🛡️`,
              timestamp: new Date()
            })
          }
          
          // 🔥 NOVA LÓGICA: Verificar se sala ficou vazia e finalizar
          const totalParticipants = room.participants.fighters.length + 
                                  room.participants.spectators.length + 
                                  room.participants.moderators.length
          
          if (playerFound && totalParticipants === 0) {
            console.log(`🏁 Sala ${roomId} ficou vazia - finalizando...`)
            
            // Remover sala da memória
            rooms.delete(roomId)
            
            // Notificar todos os sockets restantes (caso ainda existam)
            io.to(roomId).emit('room_closed', { 
              reason: 'Sala finalizada - todos os participantes saíram',
              automatic: true 
            })
            
            room.combatLog.push({
              type: 'system',
              message: '🏁 Sala finalizada automaticamente - nenhum participante restante',
              timestamp: new Date()
            })
            
            wasLastPlayer = true
          }
          
          // Se sala ainda existe, notificar atualização
          if (playerFound && !wasLastPlayer) {
            io.to(roomId).emit('room_updated', room)
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

// 🎯 SISTEMA DE BALANCEAMENTO PvP v2 — validado por simulação massiva
// (scripts/pvp-balance-sim.js: mago INT ≈ guerreiro STR em todos os níveis)
//
// Identidade dos golpes: cada atributo tem seu botão
//   Leve (d6)     → AGI×1.7 + STR×0.3
//   Pesado (d10)  → STR×1.8 (ignora 30% da DEF — quebra-armadura)
//   Especial (d20)→ INT×1.5 (fura armadura: só RES mitiga)
// Dado conta ×2 para a sorte importar mesmo no late game.

// 🌀 TETO SUAVE DE AGI no dano leve: retornos decrescentes acima de 32.
// AGI já dá crit (cap 40%), esquiva (cap ±3) e stamina; sem isso o assassino
// escala dano sem limite e domina o late. Não afeta crit/esquiva.
function effAgiForLight(agi) {
  const CAP = 32, SLOPE = 0.75
  return (agi || 0) <= CAP ? (agi || 0) : CAP + ((agi || 0) - CAP) * SLOPE
}

// 🎯 CÁLCULO DE DANO BASEADO EM ATRIBUTOS
function calculateDamage(attacker, diceRoll, actionType, isCritical = false) {
  let baseDamage = 0

  if (actionType === 'special_attack') {
    // 🧙 ESPECIAL ESCALA SÓ COM INTELLIGENCE (build mago viável)
    baseDamage = diceRoll * 2 + Math.floor(attacker.intelligence * 1.5)
  } else if (actionType === 'light_attack') {
    // 🗡️ LEVE ESCALA COM AGILITY (build assassino viável) — com teto suave
    baseDamage = diceRoll * 2 + Math.floor(effAgiForLight(attacker.agility) * 1.7) + Math.floor(attacker.strength * 0.3)
  } else {
    // ⚔️ PESADO ESCALA COM STRENGTH (build guerreiro)
    // ×1.8: STR só gera dano (AGI também dá crit+esquiva+stamina), então o
    // pesado precisa de multiplicador maior pra guerreiro não colapsar no late.
    baseDamage = diceRoll * 2 + Math.floor(attacker.strength * 1.8)
  }

  // 🏃 CRITICAL HIT baseado em AGILITY
  if (isCritical) {
    baseDamage = Math.floor(baseDamage * 1.5) // +50% dano crítico
  }

  return Math.max(1, baseDamage) // Mínimo 1 de dano
}

// 🎯 CHANCE DE CRÍTICO: 5% base + 1.2% por AGI (máximo 40%)
function calculateCriticalChance(attacker) {
  return Math.min(40, 5 + attacker.agility * 1.2)
}

// 🌪️ BÔNUS LÍQUIDO DE ESQUIVA no conteste de dados (defensor − atacante)
// Capado pelo tamanho do dado: d6→±1, d10→±2, d20→±3
function dodgeNetBonus(defenderAgi, attackerAgi, diceSides) {
  const cap = Math.min(3, Math.floor(diceSides / 5))
  const raw = Math.floor(((defenderAgi || 0) - (attackerAgi || 0)) / 5)
  return Math.max(-cap, Math.min(cap, raw))
}

// 🛡️ Resistência mágica efetiva (transição: personagens antigos têm res=10 fixo)
function effectiveResistance(defender) {
  const res = Number(defender.resistance) || 0
  const fromDef = Math.floor((Number(defender.defense) || 0) * 0.8)
  return Math.max(res, fromDef)
}

// ⚡ +2 de stamina para quem inicia o turno (cap no máximo)
function regenTurnStamina(room) {
  const next = room.currentTurn === room.player1?.id ? room.player1 : room.player2
  if (next) {
    next.stamina = Math.min(next.maxStamina || 100, (next.stamina || 0) + 2)
  }
}

// 🛡️ CÁLCULO DE DEFESA
// Especial: magia atravessa armadura — só RES mitiga (mago é o anti-tank)
// Pesado: ignora 30% da DEF (quebra-armadura)
// Piso de dano: 15% do dano bruto — ninguém é imortal
function calculateDefense(defender, damage, actionType) {
  let defense
  if (actionType === 'special_attack') {
    defense = effectiveResistance(defender)
  } else if (actionType === 'heavy_attack') {
    defense = Math.floor((defender.defense || 0) * 0.7)
  } else {
    defense = defender.defense || 0
  }

  const minDamage = Math.ceil(damage * 0.15)
  const finalDamage = Math.max(minDamage, damage - defense)
  const damageReduced = damage - finalDamage

  return {
    finalDamage,
    damageReduced,
    defense
  }
}

function processCompleteAction(room, attackAction, attackRoll, defenseAction, defenseRoll, roomId) {
  const attacker = room.currentTurn === room.player1?.id ? room.player1 : room.player2
  const defender = room.currentTurn === room.player1?.id ? room.player2 : room.player1

  if (!attacker || !defender) return

  // 🎯 VERIFICAR CHANCE DE CRÍTICO BASEADO EM AGI
  const criticalChance = calculateCriticalChance(attacker)
  const criticalRoll = Math.random() * 100
  const isCritical = criticalRoll < criticalChance

  // 🎯 CALCULAR DANO COM NOVO SISTEMA BALANCEADO
  let baseDamage = calculateDamage(attacker, attackRoll, attackAction, isCritical)
  
  let finalDamage = 0
  let hit = false

  if (defenseAction === 'dodge') {
    // 🌪️ ESQUIVA UNIFICADA: conteste com o dado QUE O DEFENSOR ROLOU
    // (defenseRoll já inclui o bônus líquido de AGI). Empate favorece o atacante.
    if (defenseRoll > attackRoll) {
      room.combatLog.push({
        type: 'result',
        message: `🌪️ ${defender.name} esquivou! (${defenseRoll} vs ${attackRoll})`,
        timestamp: new Date()
      })
      finalDamage = 0
      hit = false
    } else {
      const defenseResult = calculateDefense(defender, baseDamage, attackAction)
      finalDamage = defenseResult.finalDamage
      hit = true

      room.combatLog.push({
        type: 'result',
        message: `💥 Esquiva falhou! ${attacker.name} acerta por ${finalDamage} dano! (Esquiva: ${defenseRoll} vs Ataque: ${attackRoll})`,
        timestamp: new Date()
      })
    }
  } else if (defenseAction === 'defend') {
    // 🛡️ DEFESA - sempre reduz: toma 45% do dano pós-mitigação
    const defenseResult = calculateDefense(defender, baseDamage, attackAction)
    finalDamage = Math.max(1, Math.floor(defenseResult.finalDamage * 0.45))
    hit = true

    room.combatLog.push({
      type: 'result',
      message: `🛡️ ${defender.name} defendeu! Dano reduzido: ${baseDamage} → ${finalDamage} (Defesa: ${defenseResult.defense})`,
      timestamp: new Date()
    })
  } else if (defenseAction === 'exhausted') {
    // 😮‍💨 EXAUSTO: sem stamina para reagir — toma o golpe com mitigação normal
    const defenseResult = calculateDefense(defender, baseDamage, attackAction)
    finalDamage = defenseResult.finalDamage
    hit = true

    room.combatLog.push({
      type: 'result',
      message: `😮‍💨 ${defender.name} está exausto e não consegue reagir! ${attacker.name} acerta por ${finalDamage} dano!`,
      timestamp: new Date()
    })
  }

  // ⚔️ MORTE SÚBITA: lutas longas demais escalam o dano (mata empates-bunker)
  room.actionCount = (room.actionCount || 0) + 1
  if (hit && finalDamage > 0) {
    if (room.actionCount > 60) {
      finalDamage = Math.floor(finalDamage * 2)
    } else if (room.actionCount > 40) {
      finalDamage = Math.floor(finalDamage * 1.5)
    }
  }
  if (room.actionCount === 41 || room.actionCount === 61) {
    room.combatLog.push({
      type: 'system',
      message: room.actionCount === 41
        ? '⚔️ MORTE SÚBITA! A exaustão toma conta: todo dano agora é ×1.5!'
        : '💀 MORTE SÚBITA TOTAL! Todo dano agora é ×2!',
      timestamp: new Date()
    })
  }

  // 🎯 APLICAR DANO E LOGS DETALHADOS
  if (hit && finalDamage > 0) {
    // Log de crítico se aplicável
    if (isCritical) {
      room.combatLog.push({
        type: 'result',
        message: `� CRÍTICO! (${criticalChance}% chance baseado em ${attacker.agility} AGI) +50% dano!`,
        timestamp: new Date()
      })
    }
    
    // Log do sistema de dano usado
    if (attackAction === 'special_attack') {
      room.combatLog.push({
        type: 'action',
        message: `✨ Ataque especial usando INT: ${attacker.intelligence} (Build Mago)`,
        timestamp: new Date()
      })
    } else {
      room.combatLog.push({
        type: 'action', 
        message: `⚔️ Ataque físico usando STR: ${attacker.strength} (Build Guerreiro)`,
        timestamp: new Date()
      })
    }
    
    defender.hp = Math.max(0, defender.hp - finalDamage)
    
    room.combatLog.push({
      type: 'damage',
      message: `💔 ${defender.name} recebeu ${finalDamage} de dano! HP: ${defender.hp}/${defender.maxHp}`,
      timestamp: new Date()
    })

    // Notificar dano via socket
    io.to(roomId).emit('damage_dealt', {
      playerId: defender.id,
      damage: finalDamage,
      newHp: defender.hp
    })
  }

  // 🎬 Evento estruturado para as animações da arena no cliente
  io.to(roomId).emit('action_resolved', {
    attackerId: attacker.id,
    defenderId: defender.id,
    action: attackAction,
    defenseAction,
    hit,
    damage: finalDamage,
    isCritical: isCritical && hit && finalDamage > 0
  })

  // Verificar se o combate acabou
  if (defender.hp <= 0) {
    room.phase = CombatPhase.COMBAT_END
    room.winner = attacker.id
    room.isActive = false
    
    room.combatLog.push({
      type: 'victory',
      message: `🏆 ${attacker.name} venceu o combate!`,
      timestamp: new Date()
    })
    
    // 🏆 PROCESSAR RECOMPENSAS PVP (modo treino não dá recompensas)
    if (room.isTraining) {
      room.combatLog.push({
        type: 'system',
        message: '🏟️ Treino concluído! Nenhuma recompensa ou penalidade aplicada.',
        timestamp: new Date()
      })
    } else {
      processBattleRewards(room, attacker, defender, roomId)
    }
    
    // 💚 REGENERAÇÃO AUTOMÁTICA AO FINAL DO COMBATE
    regeneratePlayerResources(room.player1, 'Combat Victory/Defeat')
    regeneratePlayerResources(room.player2, 'Combat Victory/Defeat')
  } else {
    // Continuar combate - trocar turno
    room.currentTurn = room.currentTurn === room.player1?.id ? room.player2?.id : room.player1?.id
    room.phase = CombatPhase.PLAYER_TURN

    // 🔄 PROCESSAR TRANSFORMAÇÕES
    processTransformationTurns(room)

    // ⚡ REGEN DE STAMINA: +2 no início do turno (evita exaustão permanente)
    regenTurnStamina(room)

    room.combatLog.push({
      type: 'system',
      message: `🔄 Turno de ${room.currentTurn === room.player1?.id ? room.player1?.name : room.player2?.name}`,
      timestamp: new Date()
    })
  }

  // Limpar ação pendente
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
  regenTurnStamina(room)
  room.combatLog.push({
    type: 'system',
    message: `🔄 Turno de ${opponent.name}`,
    timestamp: new Date()
  })

  room.pendingAction = null
  io.to(roomId).emit('room_updated', room)
}

// 🏆 SISTEMA DE RECOMPENSAS PVP
async function processBattleRewards(room, winner, loser, roomId) {
  try {
    // Detectar condições especiais da batalha
    const isFlawlessVictory = winner.initialHp && winner.hp === winner.initialHp
    const winnerTransformed = winner.transformationType && winner.transformationType !== 'none'
    const loserTransformed = loser.transformationType && loser.transformationType !== 'none'
    
    // Preparar dados da batalha
    const battleResult = {
      winnerId: winner.id,
      loserId: loser.id,
      winnerLevel: winner.level || 1,
      loserLevel: loser.level || 1,
      battleType: 'pvp',
      isFlawlessVictory,
      winnerTransformed,
      loserTransformed,
      winStreak: winner.winStreak || 1, // TODO: Implementar tracking de win streak
      isFirstWinOfDay: false // TODO: Implementar tracking de primeira vitória do dia
    }
    
    // 💾 SALVAR RECOMPENSAS NO BANCO DE DADOS VIA API
    let rewardData
    try {
      const apiResponse = await fetch('http://localhost:3000/api/battle/rewards', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(battleResult)
      })
      
      if (apiResponse.ok) {
        rewardData = await apiResponse.json()
        console.log('✅ Recompensas salvas no banco de dados:', rewardData)
      } else {
        console.error('❌ Erro na API de recompensas:', apiResponse.status)
        // Fallback para cálculo local se API falhar
        rewardData = calculateBattleRewardsLocal(battleResult)
      }
    } catch (apiError) {
      console.error('❌ Erro ao chamar API de recompensas:', apiError)
      // Fallback para cálculo local se API falhar
      rewardData = calculateBattleRewardsLocal(battleResult)
    }
    
    // Adicionar recompensas aos logs de combate
    room.combatLog.push({
      type: 'rewards',
      message: `💰 ${winner.name} ganhou ${rewardData.winner.xpGained} XP e ${rewardData.winner.goldGained} gold!`,
      timestamp: new Date()
    })
    
    room.combatLog.push({
      type: 'rewards', 
      message: `💝 ${loser.name} ganhou ${rewardData.loser.xpGained} XP e ${rewardData.loser.goldGained} gold por participar!`,
      timestamp: new Date()
    })
    
    // Notificar clientes sobre as recompensas
    io.to(roomId).emit('battle_rewards', {
      winner: rewardData.winner,
      loser: rewardData.loser,
      battleDetails: {
        isFlawless: isFlawlessVictory,
        transformationKill: loserTransformed,
        underdogVictory: battleResult.winnerLevel < battleResult.loserLevel - 2
      }
    })
    
    console.log(`🏆 Recompensas de batalha processadas: ${winner.name} vs ${loser.name}`)
    
  } catch (error) {
    console.error('Erro ao processar recompensas da batalha:', error)
  }
}

// Função local para cálculo de recompensas (replica a API)
function calculateBattleRewardsLocal(battleResult) {
  const PVP_REWARDS_CONFIG = {
    victory: { xpBase: 50, goldBase: 15 },
    defeat: { xpBase: 25, goldBase: 8 },
    levelScaling: { xpMultiplier: 1.1, goldMultiplier: 1.08, maxScaling: 5.0 },
    specialBonuses: {
      perfectVictory: { xpBonus: 1.3, goldBonus: 1.5 },
      transformationKill: { xpBonus: 1.2, goldBonus: 1.2 },
      firstWinOfDay: { xpBonus: 2.0, goldBonus: 1.5 }
    },
    levelDifferenceBalancing: {
      perLevelDifference: 0.15,
      underdog_bonus: 1.5,
      bully_penalty: 0.7
    }
  }
  
  function calculateRewards(playerLevel, isVictory, opponentLevel, specialBonuses = {}) {
    const config = PVP_REWARDS_CONFIG
    const baseRewards = isVictory ? config.victory : config.defeat
    
    // XP e Gold base
    let xp = baseRewards.xpBase
    let gold = baseRewards.goldBase
    
    // Scaling por nível
    const levelMult = Math.min(
      Math.pow(config.levelScaling.xpMultiplier, playerLevel - 1),
      config.levelScaling.maxScaling
    )
    
    xp = Math.floor(xp * levelMult)
    gold = Math.floor(gold * levelMult * config.levelScaling.goldMultiplier)
    
    // Bônus/Penalidade por diferença de nível
    if (isVictory) {
      const levelDiff = opponentLevel - playerLevel
      const diffMultiplier = 1 + (levelDiff * config.levelDifferenceBalancing.perLevelDifference)
      
      xp = Math.floor(xp * diffMultiplier)
      gold = Math.floor(gold * diffMultiplier)
      
      // Bônus especiais por diferença extrema
      if (levelDiff >= 5) {
        xp = Math.floor(xp * config.levelDifferenceBalancing.underdog_bonus)
        gold = Math.floor(gold * config.levelDifferenceBalancing.underdog_bonus)
      } else if (levelDiff <= -5) {
        xp = Math.floor(xp * config.levelDifferenceBalancing.bully_penalty)
        gold = Math.floor(gold * config.levelDifferenceBalancing.bully_penalty)
      }
    }

    // Aplicar bônus especiais
    if (specialBonuses.isFlawless && isVictory) {
      xp = Math.floor(xp * config.specialBonuses.perfectVictory.xpBonus)
      gold = Math.floor(gold * config.specialBonuses.perfectVictory.goldBonus)
    }

    if (specialBonuses.killTransformed && isVictory) {
      xp = Math.floor(xp * config.specialBonuses.transformationKill.xpBonus)
      gold = Math.floor(gold * config.specialBonuses.transformationKill.goldBonus)
    }

    if (specialBonuses.isFirstWin && isVictory) {
      xp = Math.floor(xp * config.specialBonuses.firstWinOfDay.xpBonus)
      gold = Math.floor(gold * config.specialBonuses.firstWinOfDay.goldBonus)
    }

    return { xpGained: Math.max(5, xp), goldGained: Math.max(1, gold) }
  }
  
  // Calcular recompensas do vencedor
  const winnerRewards = calculateRewards(
    battleResult.winnerLevel,
    true,
    battleResult.loserLevel,
    {
      isFlawless: battleResult.isFlawlessVictory,
      killTransformed: battleResult.loserTransformed,
      isFirstWin: battleResult.isFirstWinOfDay
    }
  )

  // Calcular recompensas do perdedor
  const loserRewards = calculateRewards(
    battleResult.loserLevel,
    false,
    battleResult.winnerLevel
  )

  return {
    winner: {
      id: battleResult.winnerId,
      ...winnerRewards,
      leveledUp: false, // TODO: Calcular se subiu de nível
      newLevel: battleResult.winnerLevel
    },
    loser: {
      id: battleResult.loserId,
      ...loserRewards,
      leveledUp: false, // TODO: Calcular se subiu de nível  
      newLevel: battleResult.loserLevel
    }
  }
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
