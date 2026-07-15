const { createServer } = require('http')
const { Server } = require('socket.io')

// Importar sistema de stamina (versão local JavaScript)
const { getStaminaCost, checkStaminaLevel, calculateStaminaRegeneration } = require('./staminaSystem')

// 🐉 Modo treino - bot monstro que joga pelas regras do PvP
const { spawnTrainingBot, MONSTERS, DEFAULT_TRAINING_OPPONENT_KEY } = require('./training-bot')

// ⚔️ MODELO DE COMBATE ENXUTO (fonte da verdade): poder × sorte × (1−DR), mitigação
// proporcional, levers por classe (poder/armadura/hp/evasão) escalados por nível+gear.
// Ver server/combatModel.js + src/lib/combatModel.ts + docs/combate-ataque-por-arma.md.
const CM = require('./combatModel')

// 🌳 Árvore de habilidades (espelho de src/lib/skillTree.ts) — gate de Ataque de Classe/
// Golpe Atordoante/buff de forma + ranks II/III. `player.skillTree` vem direto do payload
// do cliente (join_room), igual a unlockedTransformation/transformationType.
const { getSkillUnlocks, applyRankPatch } = require('./skillTree')

// unlocks do jogador nesta luta. Monstro/bot de treino (sem `class`) fica no fallback
// LEGACY (tudo liberado) — normalizeClass já devolve null pra eles.
function getUnlocksFor(player) {
  const cls = normalizeClass(player && player.class)
  if (!cls) return getSkillUnlocks(null, 'warrior') // legacy (não deveria gatear monstro)
  const purchased = player.skillTree && Array.isArray(player.skillTree.purchased) ? player.skillTree.purchased : null
  return getSkillUnlocks(purchased, cls)
}

// Normaliza o nome da classe (PT da criação) para a chave do PROFILE do modelo.
// Retorna null para classes desconhecidas (ex.: monstros do treino) → usa fallback por stats.
function normalizeClass(cls) {
  const c = String(cls || '').toLowerCase()
  if (c === 'warrior' || c.includes('guerre')) return 'warrior'
  if (c === 'rogue' || c.includes('ladin') || c.includes('assass') || c.includes('arqueir')) return 'rogue'
  if (c === 'mage' || c.includes('mag') || c.includes('feiti')) return 'mage'
  if (c === 'monk' || c.includes('monge') || c.includes('monk')) return 'monk'
  return null
}

// Deriva os levers de combate do jogador a partir de classe/nível/equipamento.
// Classe de jogador → PROFILE do modelo escalado por S; classe desconhecida (monstro)
// → fallback que mapeia os stats fornecidos para levers (preserva a dificuldade do treino).
// 🎯 AJUSTE DE CLASSE SÓ-PvP (validado em scripts/pvp-lever-sim.js). Com attrs
// (AGI/DEF) o tilt já equilibra um pouco; este ajuste fino mantém classes ~47-54%.
const PVP_CLASS_ADJ = {
  warrior: { power: 1.00, armor: 0.90, hp: 0.96 },
  rogue:   { power: 1.10, armor: 1.00, hp: 1.18 },
  mage:    { power: 0.86, armor: 1.00, hp: 1.00 },
  monk:    { power: 1.04, armor: 1.00, hp: 1.08 },
}
function applyPvpClassAdj(levers, cls) {
  const a = PVP_CLASS_ADJ[cls]
  if (!a) return levers
  return { ...levers, power: levers.power * a.power, armor: levers.armor * a.armor, hp: levers.hp * a.hp }
}

function readAttrs(player) {
  const raw = player?.attributes || player?.baseStats || null
  if (!raw || typeof raw !== 'object') return null
  return {
    str: Number(raw.str) || 0,
    agi: Number(raw.agi) || 0,
    int: Number(raw.int) || 0,
    def: Number(raw.def) || 0,
  }
}

function derivePlayerLevers(player) {
  const cls = normalizeClass(player.class)
  const level = Math.max(1, Number(player.level) || 1)
  const equipped = Array.isArray(player.equipment)
    ? player.equipment.map((e) => ({ rarity: e?.item?.rarity ?? e?.rarity, enhancementLevel: e?.enhancementLevel }))
    : []
  const gearTier = CM.deriveGearTier(equipped)
  const attrs = readAttrs(player)

  if (cls) {
    const levers = applyPvpClassAdj(CM.computeLevers(cls, level, gearTier, attrs), cls)
    return { levers, cls, gearTier }
  }

  // Fallback p/ monstro/classe desconhecida: levers a partir dos stats brutos.
  const S = level / CM.MAX_LEVEL_REF + 0.5
  const power = Math.max(1, Number(player.attack) || Number(player.strength) || 20)
  const armor = Math.max(0, Number(player.defense) || 0)
  const hp = Math.max(1, Number(player.maxHp) || Number(player.hp) || 100)
  return {
    levers: { power, armor, hp, evade: 0.08, block: 0, K: CM.K50 * S, scale: S },
    cls: null,
    gearTier,
  }
}

// Mapeia os nomes de ação do cliente/bot (legado) para os tipos de ataque do modelo.
const ATTACK_TYPE_MAP = {
  light_attack: 'basic', basic: 'basic',
  heavy_attack: 'weapon', weapon: 'weapon',
  special_attack: 'special', special: 'special',
}
const ATTACK_ACTIONS = ['light_attack', 'heavy_attack', 'special_attack', 'basic', 'weapon', 'special']

function attackStaminaCost(attackType) {
  return CM.ATTACKS[attackType]?.stamina ?? 1
}

function trackFightStamina(player, amount) {
  if (!player || !(amount > 0)) return
  player.fightStaminaSpent = (player.fightStaminaSpent || 0) + amount
}

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

// 🔥 CAMADA DE STATUS — processada no INÍCIO do turno do jogador que vai agir
// (room.currentTurn). Aplica DoT, expira buffs/debuffs e reduz cooldown de habilidade.
// No-op para quem nunca usou especial (sem `fx`). Retorna true se o DoT matou.
function processStatusStartOfTurn(room, roomId) {
  const p = room.currentTurn === room.player1?.id ? room.player1 : room.player2
  const opp = room.currentTurn === room.player1?.id ? room.player2 : room.player1
  if (!p || !p.fx) return false
  const fx = p.fx
  // Dano contínuo (sangramento/esmagamento)
  if (fx.dots && fx.dots.length) {
    let total = 0
    for (const d of fx.dots) { total += d.dmg; d.turns-- }
    fx.dots = fx.dots.filter((d) => d.turns > 0)
    if (total > 0) {
      p.hp = Math.max(0, (p.hp || 0) - total)
      room.combatLog.push({ type: 'damage', message: `☠️ ${p.name} sofre ${total} de dano contínuo! (${p.hp}/${p.maxHp})`, timestamp: new Date() })
      io.to(roomId).emit('damage_dealt', { playerId: p.id, damage: total, newHp: p.hp })
      if (p.hp <= 0 && opp) { declareWinner(room, opp, p, roomId, 'dano contínuo'); return true }
    }
  }
  // Expirar buffs/debuffs temporários
  if (fx.dmgDealtTurns > 0 && --fx.dmgDealtTurns <= 0) fx.dmgDealtMult = 1
  if (fx.dmgTakenTurns > 0 && --fx.dmgTakenTurns <= 0) fx.dmgTakenMult = 1
  if (fx.evadeBuffTurns > 0 && --fx.evadeBuffTurns <= 0) fx.evadeBuff = 0
  for (const k in fx.abilityCd) if (fx.abilityCd[k] > 0) fx.abilityCd[k]--
  return false
}

// 🏁 Encerra o combate declarando um vencedor (usado por morte via DoT, fora do
// fluxo normal de processCompleteAction). Espelha o bloco de vitória de lá.
function declareWinner(room, winner, loser, roomId, cause) {
  room.phase = CombatPhase.COMBAT_END
  room.winner = winner.id
  room.isActive = false
  room.combatLog.push({ type: 'victory', message: `🏆 ${winner.name} venceu o combate${cause ? ` (${cause})` : ''}!`, timestamp: new Date() })
  if (room.isTraining) {
    room.combatLog.push({ type: 'system', message: '🏟️ Treino concluído! Nenhuma recompensa ou penalidade aplicada.', timestamp: new Date() })
  } else {
    processBattleRewards(room, winner, loser, roomId)
  }
  regeneratePlayerResources(room.player1, 'Combat Victory/Defeat')
  regeneratePlayerResources(room.player2, 'Combat Victory/Defeat')
  io.to(roomId).emit('room_updated', room)
}

// 🔄 Avança o turno (troca currentTurn) + transformações + regen + status do próximo.
// Usado quando uma ação não passa por processCompleteAction (ex.: imobilizado perde o turno).
function advanceTurn(room, roomId) {
  room.currentTurn = room.currentTurn === room.player1?.id ? room.player2?.id : room.player1?.id
  room.phase = CombatPhase.PLAYER_TURN
  processTransformationTurns(room)
  regenTurnStamina(room)
  const dead = processStatusStartOfTurn(room, roomId)
  if (!dead) {
    room.combatLog.push({ type: 'system', message: `🔄 Turno de ${room.currentTurn === room.player1?.id ? room.player1?.name : room.player2?.name}`, timestamp: new Date() })
  }
  room.pendingAction = null
  io.to(roomId).emit('room_updated', room)
}

function revertPlayerTransformation(player) {
  if (!player.isTransformed || !player.transformationData) return
  
  const original = player.transformationData.originalStats
  const config = TRANSFORMATION_CONFIG[player.transformationType]

  // Restaurar atributos originais (best-effort): o caminho sync_transformation do
  // modelo enxuto pode não enviar originalStats — o combate lê levers, então isso é
  // só bookkeeping legado. Pula com segurança quando ausente.
  if (original) {
    player.strength = original.strength
    player.agility = original.agility
    player.intelligence = original.intelligence
    player.defense = original.defense
    player.resistance = Math.floor((original.defense || 0) * 0.8)
    if (original.maxHp != null) {
      player.hp = Math.min(player.hp, original.maxHp)
      player.maxHp = original.maxHp
    }
    if (original.maxMp != null) { // reverte a reserva de mana ampliada pelo mpPool
      player.maxMp = original.maxMp
      player.mp = Math.min(player.mp ?? original.maxMp, original.maxMp)
    }
    player.baseStats = {
      ...player.baseStats,
      str: original.strength,
      agi: original.agility,
      int: original.intelligence,
      def: original.defense,
      attack: original.attack,
      critical: original.critical,
      hp: Math.min(player.hp, original.maxHp ?? player.maxHp),
      maxHp: original.maxHp ?? player.maxHp
    }
  }

  // Marcar como não transformado e iniciar cooldown
  // (config pode ser undefined: a transformação real vem de transformationSystem.ts
  //  via sync; este TRANSFORMATION_CONFIG do socket é legado e não tem todas as formas)
  player.isTransformed = false
  player.transformationType = null
  player.transformationData = {
    ...player.transformationData,
    cooldownTurns: config?.cooldown ?? 5,
    remainingTurns: 0
  }

  // ⚔️ MODELO ENXUTO: restaurar os levers-base (desfaz o buff simétrico) e o HP máximo.
  if (player.baseLevers) {
    player.levers = player.baseLevers
    const newMaxHp = Math.round(player.baseLevers.hp)
    player.hp = Math.min(player.hp, newMaxHp)
    player.maxHp = newMaxHp
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
      // ⚔️ MODELO ENXUTO: computar os levers de combate (poder/armadura/hp/evasão) a partir
      // de classe/nível/equipamento. HP passa a vir dos levers (PROFILE.hp × escala), não
      // mais dos atributos. O cliente já envia class/level/equipment no payload.
      const { levers, cls, gearTier } = derivePlayerLevers(player)
      // Treino: Gárgula / Leviatã aplicam leverMult após o peer de gear
      const trainMult = Number(player.trainingLeverMult) || 1
      const finalLevers = trainMult !== 1
        ? { ...levers, power: levers.power * trainMult, armor: levers.armor * trainMult, hp: levers.hp * trainMult }
        : levers
      player.levers = finalLevers
      player.baseLevers = finalLevers // guardado p/ reverter o buff de transformação
      player.combatClass = cls
      player.gearTier = gearTier
      // 🌳 Vitalidade/Reservas Arcanas (maxHpPct/maxMpPct): passivas permanentes da árvore.
      const joinUnlocks = getUnlocksFor(player)
      player.maxHp = Math.round(finalLevers.hp * (1 + joinUnlocks.passives.maxHpPct))
      player.hp = player.maxHp
      player.fightStaminaSpent = 0
      player.initialHp = player.maxHp
      if (joinUnlocks.passives.maxMpPct) {
        player.maxMp = Math.round((player.maxMp || 0) * (1 + joinUnlocks.passives.maxMpPct))
        player.mp = player.maxMp
      }

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
      const monsterKey = MONSTERS[monster] ? monster : DEFAULT_TRAINING_OPPONENT_KEY

      room.combatLog.push({
        type: 'system',
        message: `🏟️ Treino · ${MONSTERS[monsterKey].name} (peer ${MONSTERS[monsterKey].gearLabel}${MONSTERS[monsterKey].unbeatable ? ' · imbatível' : ''}) — sem recompensas PvP`,
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

    // ⚠️ HANDLER LEGADO: o cliente NÃO emite 'transform' — o fluxo real é a rota
    // REST /api/character/[id]/transform (applyTransformation de transformationSystem.ts)
    // seguida de 'sync_transformation'. Este handler é mantido por compatibilidade.

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
    // 🏆 Capstone de assinatura (transformExtraTurns): +1 turno de forma.
    const transformUnlocks = getUnlocksFor(player)
    player.transformationData = {
      remainingTurns: config.duration + transformUnlocks.passives.transformExtraTurns,
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
      remainingTurns: player.transformationData.remainingTurns
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

    // ⚔️ MODELO ENXUTO: a transformação vira um buff SIMÉTRICO de escala nos levers
    // (poder/armadura/hp/K ×TRANSFORM_SCALE; evasão invariante) + libera o especial.
    // Aplica sobre os levers-base; o HP máximo sobe proporcional (mantém a fração de HP).
    if (player.baseLevers) {
      if (player.isTransformed) {
        player.levers = CM.transformLevers(player.baseLevers)
        const newMaxHp = Math.round(player.levers.hp)
        const ratio = player.maxHp > 0 ? player.hp / player.maxHp : 1
        player.maxHp = newMaxHp
        player.hp = Math.max(1, Math.min(newMaxHp, Math.round(newMaxHp * ratio)))
      } else {
        player.levers = player.baseLevers
        const newMaxHp = Math.round(player.baseLevers.hp)
        player.maxHp = newMaxHp
        player.hp = Math.min(player.hp, newMaxHp)
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
    if (!player || !opponent) return

    // 🚫 Imobilizado (Abraço do Urso): perde o turno
    if (player.fx?.immobilizeTurns > 0) {
      player.fx.immobilizeTurns--
      room.combatLog.push({ type: 'system', message: `🚫 ${player.name} está imobilizado e perde o turno!`, timestamp: new Date() })
      advanceTurn(room, roomId)
      return
    }

    if (!player.isTransformed) {
      socket.emit('error', { message: 'O especial só pode ser usado transformado!' })
      return
    }

    // A validação (forma/custo/recarga) acontece em processSpecialAbility.
    const result = processSpecialAbility(player, opponent, abilityId)
    if (!result.success) { socket.emit('error', { message: result.error }); return }

    room.combatLog.push({ type: 'special_ability', player: player.name, message: result.message, timestamp: new Date() })

    if (result.damage > 0) {
      io.to(roomId).emit('damage_dealt', { playerId: opponent.id, damage: result.damage, newHp: opponent.hp })
    }
    io.to(roomId).emit('action_resolved', {
      attackerId: player.id, defenderId: opponent.id, action: abilityId,
      defenseAction: 'none', hit: result.damage > 0, damage: result.damage || 0, isCritical: !!result.crit,
    })

    // Vitória por especial (dano direto pode zerar o HP)
    if (opponent.hp <= 0) { declareWinner(room, player, opponent, roomId); return }

    // O especial consome o turno → avança (transformações + regen + status do próximo)
    advanceTurn(room, roomId)
  })

  socket.on('player_action', ({ playerId, roomId, action, diceType, mpCost, staminaCost }) => {
    const room = rooms.get(roomId)
    if (!room || room.currentTurn !== playerId) return

    // 🚫 Imobilizado (Abraço do Urso): perde o turno antes de qualquer ação
    const actor = room.player1?.id === playerId ? room.player1 : room.player2
    if (actor?.fx?.immobilizeTurns > 0) {
      actor.fx.immobilizeTurns--
      room.combatLog.push({ type: 'system', message: `🚫 ${actor.name} está imobilizado e perde o turno!`, timestamp: new Date() })
      advanceTurn(room, roomId)
      return
    }

    // Processar fim de turno das transformações antes da ação
    processTransformationTurns(room)

    const currentPlayer = room.currentTurn === room.player1?.id ? room.player1 : room.player2
    const opponent = room.currentTurn === room.player1?.id ? room.player2 : room.player1

    const classAtk = (currentPlayer && currentPlayer.combatClass) ? CM.classAttackName(currentPlayer.combatClass) : 'Ataque de Classe'
    const actionNames = {
      'light_attack': 'Golpe',
      'basic': 'Golpe',
      'heavy_attack': classAtk,
      'weapon': classAtk,
      'special_attack': 'Especial',
      'special': 'Especial',
      'dodge': 'Esquivar',
      'defend': 'Bloquear',
      'block': 'Bloquear',
      'use_item': 'Item'
    }

    const isAttack = ATTACK_ACTIONS.includes(action)
    const attackType = ATTACK_TYPE_MAP[action]

    // 🐉 GATE DO ESPECIAL: para classes de jogador, o especial só libera com a
    // transformação ativa (o burst é desbloqueado pela transformação). Monstros
    // (sem combatClass) podem usar especial livremente.
    if (attackType === 'special' && currentPlayer.combatClass && !currentPlayer.isTransformed) {
      socket.emit('error', { message: 'O Especial só pode ser usado transformado!' })
      return
    }

    // 🌳 GATE do Ataque de Classe: só libera com o nó desbloqueado na árvore de habilidades.
    const unlocksForAttack = getUnlocksFor(currentPlayer)
    if (attackType === 'weapon' && currentPlayer.combatClass && !unlocksForAttack.classAttack) {
      socket.emit('error', { message: 'Aprenda o Ataque de Classe na árvore de habilidades!' })
      return
    }

    // ⚔️ KIT FLUIDO: ataques custam MP + STAMINA (Golpe 0MP/1STA, Classe 8MP/2STA).
    // Sem fase de reação — defesa é passiva (AGI=esquiva, DEF=bloqueio).
    // 🌳 Ranks II/III da árvore sobrescrevem dado/custo do Ataque de Classe.
    if (isAttack) {
      const stamCost = !currentPlayer.combatClass ? 0 : attackStaminaCost(attackType)
      const mpCost = !currentPlayer.combatClass ? 0
        : attackType === 'weapon' ? unlocksForAttack.classAttackMp
        : (CM.ATTACKS[attackType]?.mp ?? 0)
      if ((currentPlayer.stamina || 0) < stamCost) {
        socket.emit('error', { message: `Stamina insuficiente! Precisa de ${stamCost} Stamina` })
        return
      }
      if ((currentPlayer.mp || 0) < mpCost) {
        socket.emit('error', { message: `MP insuficiente! Precisa de ${mpCost} MP` })
        return
      }
      if (stamCost > 0) {
        currentPlayer.stamina = Math.max(0, (currentPlayer.stamina || 0) - stamCost)
        trackFightStamina(currentPlayer, stamCost)
      }
      if (mpCost > 0) currentPlayer.mp = Math.max(0, (currentPlayer.mp || 0) - mpCost)
      diceType = attackType === 'weapon' ? unlocksForAttack.classAttackDie : (CM.PVE_DIE[attackType] || CM.DICE_SIDES)

      room.pendingAction = {
        action,
        diceType,
        playerId,
        type: 'attack',
        defenseAction: 'passive',
        attackRoll: undefined,
        defenseRoll: 0,
        resolving: false,
      }
      room.phase = CombatPhase.DICE_ROLL
      room.combatLog.push({
        type: 'action',
        player: currentPlayer.name,
        message: `🎯 ${actionNames[action]}! (−${stamCost} STA${mpCost ? ` · −${mpCost} MP` : ''}) — rolando d${diceType}…`,
        timestamp: new Date()
      })
      io.to(roomId).emit('room_updated', room)
      socket.emit('action_selected', { action, diceType })

      // Auto-roll servidor (~400ms, igual DungeonRun) — sem clique no dado
      const pending = room.pendingAction
      setTimeout(() => {
        if (room.pendingAction !== pending || pending.resolving) return
        pending.resolving = true
        const roll = Math.floor(Math.random() * diceType) + 1
        pending.attackRoll = roll
        const attacker = room.player1?.id === playerId ? room.player1 : room.player2
        room.combatLog.push({
          type: 'action',
          player: attacker?.name,
          message: `🎲 ${attacker?.name}: Rolou d${diceType} = ${roll}`,
          timestamp: new Date()
        })
        io.to(roomId).emit('dice_rolled', {
          playerId,
          sides: diceType,
          result: { roll, modifier: 0, total: roll }
        })
        io.to(roomId).emit('room_updated', room)
        setTimeout(() => {
          if (room.pendingAction !== pending) return
          processCompleteAction(room, pending.action, pending.attackRoll, 'passive', 0, roomId)
        }, 900)
      }, 400)
      return
    }

    // Outras ações (items, etc)
    const systemStaminaCost = getStaminaCost('pvp', { playerLevel: currentPlayer.level || 1, actionType: action })
    if (currentPlayer.stamina < systemStaminaCost) {
      socket.emit('error', { message: `Stamina insuficiente! Precisa de ${systemStaminaCost} Stamina` })
      return
    }
    currentPlayer.stamina = Math.max(0, currentPlayer.stamina - systemStaminaCost)
    if (systemStaminaCost > 0) trackFightStamina(currentPlayer, systemStaminaCost)
    diceType = CM.DICE_SIDES

    io.to(roomId).emit('room_updated', room)

    room.pendingAction = { action, diceType, playerId, type: 'other' }
    room.phase = CombatPhase.DICE_ROLL
    room.combatLog.push({
      type: 'action',
      player: currentPlayer.name,
      message: `🎯 ${actionNames[action]} selecionado! Role o d${diceType}`,
      timestamp: new Date()
    })
    
    io.to(roomId).emit('room_updated', room)
    socket.emit('action_selected', { action, diceType })
  })

  socket.on('roll_dice', ({ playerId, roomId, sides, action }) => {
    const room = rooms.get(roomId)
    if (!room) return

    // Ataques: o servidor auto-rola após player_action — ignore rolls manuais do cliente/bot
    if (room.pendingAction?.type === 'attack') return

    const player = room.player1?.id === playerId ? room.player1 : room.player2
    const diceSides = room.pendingAction?.diceType || CM.DICE_SIDES
    const roll = Math.floor(Math.random() * diceSides) + 1
    const total = roll

    room.combatLog.push({
      type: 'action',
      player: player.name,
      message: `🎲 ${player.name}: Rolou d${diceSides} = ${roll}`,
      timestamp: new Date()
    })

    io.to(roomId).emit('dice_rolled', {
      playerId,
      sides: diceSides,
      result: { roll, modifier: 0, total }
    })

    // Ações não-ataque processam diretamente
    setTimeout(() => {
      processActionResult(room, action, roll, roomId)
    }, 1000)
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

  // Reação manual removida — defesa é passiva (AGI/DEF). Handler mantido como no-op.
  socket.on('opponent_reaction', () => {})


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
    // 🔵 Regen de MP (+3/turno): sustenta os especiais de transformação (custo em MP).
    if (next.maxMp != null) next.mp = Math.min(next.maxMp, (next.mp || 0) + 3)
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

  // ⚔️ MODELO ENXUTO + defesa PASSIVA: esquiva (AGI) → bloqueio (DEF) → hit.
  const attackType = ATTACK_TYPE_MAP[attackAction] || 'weapon'
  const attackerUnlocks = getUnlocksFor(attacker)
  const sides = attackType === 'weapon' ? attackerUnlocks.classAttackDie : (CM.PVE_DIE[attackType] || CM.DICE_SIDES)
  const aLev = attacker.levers || derivePlayerLevers(attacker).levers
  const dLev = defender.levers || derivePlayerLevers(defender).levers
  const attackerPower = aLev.power * (CM.ATTACKS[attackType]?.powerMult ?? 1)

  const defenderUnlocks = getUnlocksFor(defender)
  const defEvade = Math.min(0.95, (dLev.evade || 0) + (defender.fx?.evadeBuffTurns > 0 ? defender.fx.evadeBuff : 0) + defenderUnlocks.passives.evadeBonus)
  const defBlock = dLev.block || 0

  const ignoreEvade = !!attacker.fx?.ignoreEvadeNext
  if (attacker.fx?.ignoreEvadeNext) attacker.fx.ignoreEvadeNext = false

  const hitResult = CM.resolveHit(
    { power: attackerPower },
    { armor: dLev.armor, K: dLev.K, evade: defEvade, block: defBlock },
    { defense: 'passive', forcedRoll: attackRoll, ignoreEvade, sides }
  )
  const isCritical = hitResult.crit && !hitResult.dodged
  let finalDamage = hitResult.dodged ? 0 : hitResult.damage
  if (!hitResult.dodged) {
    const outMult = (attacker.fx?.dmgDealtMult ?? 1) * (isCritical ? attackerUnlocks.passives.critBonusMult : 1)
    const inMult = (defender.fx?.dmgTakenMult ?? 1) * defenderUnlocks.passives.selfDmgTakenMult
    if (outMult !== 1 || inMult !== 1) finalDamage = Math.max(1, Math.round(finalDamage * outMult * inMult))
  }
  let hit = !hitResult.dodged

  // ↩️ Contra-ataque Precognitivo: ao esquivar, devolve metade do dano que sofreria.
  if (hitResult.dodged && defender.fx?.counterNext) {
    defender.fx.counterNext = false
    const reflected = Math.max(1, Math.round((hitResult.damage || finalDamage || attackerPower) * 0.5))
    attacker.hp = Math.max(0, (attacker.hp || 0) - reflected)
    room.combatLog.push({ type: 'damage', message: `↩️ ${defender.name} contra-ataca e devolve ${reflected} a ${attacker.name}! (${attacker.hp}/${attacker.maxHp})`, timestamp: new Date() })
    io.to(roomId).emit('damage_dealt', { playerId: attacker.id, damage: reflected, newHp: attacker.hp })
  }

  if (hitResult.dodged) {
    room.combatLog.push({
      type: 'result',
      message: `🌪️ ${defender.name} esquivou! (evasão ${Math.round(defEvade * 100)}%)`,
      timestamp: new Date()
    })
  } else if (hitResult.blocked) {
    room.combatLog.push({
      type: 'result',
      message: `🛡️ ${defender.name} bloqueou! ${attacker.name} acerta por ${finalDamage} (armadura reforçada · bloqueio ${Math.round(defBlock * 100)}%).`,
      timestamp: new Date()
    })
  } else {
    room.combatLog.push({
      type: 'result',
      message: `💥 ${attacker.name} acerta por ${finalDamage} dano!`,
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
    if (isCritical) {
      room.combatLog.push({
        type: 'result',
        message: `🎯 CRÍTICO! Rolagem máxima — dano amplificado!`,
        timestamp: new Date()
      })
    }

    const atkLabel = attackType === 'weapon'
      ? CM.classAttackName(attacker.combatClass)
      : (CM.ATTACKS[attackType]?.label || 'Ataque')
    room.combatLog.push({
      type: 'action',
      message: `${attackType === 'special' ? '✨' : attackType === 'weapon' ? '⚔️' : '👊'} ${atkLabel} (d${sides}, poder ${Math.round(attackerPower)})`,
      timestamp: new Date()
    })

    defender.hp = Math.max(0, defender.hp - finalDamage)
    
    room.combatLog.push({
      type: 'damage',
      message: `💔 ${defender.name} recebeu ${finalDamage} de dano! HP: ${defender.hp}/${defender.maxHp}`,
      timestamp: new Date()
    })

    io.to(roomId).emit('damage_dealt', {
      playerId: defender.id,
      damage: finalDamage,
      newHp: defender.hp
    })
  }

  io.to(roomId).emit('action_resolved', {
    attackerId: attacker.id,
    defenderId: defender.id,
    action: attackAction,
    defenseAction: hitResult.dodged ? 'dodge' : hitResult.blocked ? 'defend' : 'none',
    hit,
    damage: finalDamage,
    isCritical: isCritical && hit && finalDamage > 0,
    dodged: hitResult.dodged,
    blocked: hitResult.blocked,
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
    
    if (room.isTraining) {
      room.combatLog.push({
        type: 'system',
        message: '🏟️ Treino concluído! Nenhuma recompensa ou penalidade aplicada.',
        timestamp: new Date()
      })
    } else {
      processBattleRewards(room, attacker, defender, roomId)
    }
    
    regeneratePlayerResources(room.player1, 'Combat Victory/Defeat')
    regeneratePlayerResources(room.player2, 'Combat Victory/Defeat')
  } else {
    room.currentTurn = room.currentTurn === room.player1?.id ? room.player2?.id : room.player1?.id
    room.phase = CombatPhase.PLAYER_TURN

    processTransformationTurns(room)
    regenTurnStamina(room)

    const deadByDot = processStatusStartOfTurn(room, roomId)
    if (!deadByDot) {
      room.combatLog.push({
        type: 'system',
        message: `🔄 Turno de ${room.currentTurn === room.player1?.id ? room.player1?.name : room.player2?.name}`,
        timestamp: new Date()
      })
    }
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
  regenTurnStamina(room)
  room.combatLog.push({
    type: 'system',
    message: `🔄 Turno de ${opponent.name}`,
    timestamp: new Date()
  })

  room.pendingAction = null
  io.to(roomId).emit('room_updated', room)
}

// 🏆 SISTEMA DE RECOMPENSAS PVP — stamina gasta na luta → gold/XP (paridade masmorra)
async function processBattleRewards(room, winner, loser, roomId) {
  try {
    const isFlawlessVictory = winner.initialHp && winner.hp === winner.initialHp
    const winnerTransformed = !!(winner.isTransformed || (winner.transformationType && winner.transformationType !== 'none'))
    const loserTransformed = !!(loser.isTransformed || (loser.transformationType && loser.transformationType !== 'none'))

    const battleResult = {
      winnerId: winner.id,
      loserId: loser.id,
      winnerLevel: winner.level || 1,
      loserLevel: loser.level || 1,
      battleType: 'pvp',
      isFlawlessVictory,
      winnerTransformed,
      loserTransformed,
      winnerStaminaSpent: winner.fightStaminaSpent || 0,
      loserStaminaSpent: loser.fightStaminaSpent || 0,
      updateRanking: true,
    }

    const appUrl = (process.env.APP_URL || process.env.NEXTAUTH_URL || 'https://dolrath.vercel.app').replace(/\/$/, '')
    const secret = process.env.BATTLE_REWARDS_SECRET || ''

    let rewardData
    try {
      const apiResponse = await fetch(`${appUrl}/api/battle/rewards`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(secret ? { 'x-battle-secret': secret } : {}),
        },
        body: JSON.stringify(battleResult)
      })

      if (apiResponse.ok) {
        rewardData = await apiResponse.json()
        console.log('✅ Recompensas PvP creditadas:', rewardData)
      } else {
        const errText = await apiResponse.text().catch(() => '')
        console.error('❌ Erro na API de recompensas:', apiResponse.status, errText)
        rewardData = calculateBattleRewardsLocal(battleResult)
      }
    } catch (apiError) {
      console.error('❌ Erro ao chamar API de recompensas:', apiError)
      rewardData = calculateBattleRewardsLocal(battleResult)
    }

    room.combatLog.push({
      type: 'rewards',
      message: `💰 ${winner.name} ganhou ${rewardData.winner.xpGained} XP e ${rewardData.winner.goldGained} gold (−${battleResult.winnerStaminaSpent} STA)!`,
      timestamp: new Date()
    })

    room.combatLog.push({
      type: 'rewards',
      message: `💝 ${loser.name} ganhou ${rewardData.loser.xpGained} XP e ${rewardData.loser.goldGained} gold (−${battleResult.loserStaminaSpent} STA)!`,
      timestamp: new Date()
    })

    io.to(roomId).emit('battle_rewards', {
      winner: rewardData.winner,
      loser: rewardData.loser,
      battleDetails: {
        isFlawless: isFlawlessVictory,
        transformationKill: loserTransformed,
        winnerStaminaSpent: battleResult.winnerStaminaSpent,
        loserStaminaSpent: battleResult.loserStaminaSpent,
      }
    })

    console.log(`🏆 Recompensas de batalha processadas: ${winner.name} vs ${loser.name}`)
  } catch (error) {
    console.error('Erro ao processar recompensas da batalha:', error)
  }
}

// Fallback local (UI only — sem DB) se a API falhar
function calculateBattleRewardsLocal(battleResult) {
  const pool = (battleResult.winnerStaminaSpent || 0) + (battleResult.loserStaminaSpent || 0)
  const GOLD_PER = 6.6
  const XP_PER = 8
  const winGold = Math.round(pool * GOLD_PER * 0.7)
  const winXp = Math.round(pool * XP_PER * 0.7)
  const lossGold = Math.round(pool * GOLD_PER * 0.3)
  const lossXp = Math.round(pool * XP_PER * 0.3)
  return {
    winner: {
      id: battleResult.winnerId,
      xpGained: battleResult.winnerStaminaSpent > 0 ? winXp : 0,
      goldGained: battleResult.winnerStaminaSpent > 0 ? winGold : 0,
      leveledUp: false,
      newLevel: battleResult.winnerLevel
    },
    loser: {
      id: battleResult.loserId,
      xpGained: battleResult.loserStaminaSpent > 0 ? lossXp : 0,
      goldGained: battleResult.loserStaminaSpent > 0 ? lossGold : 0,
      leveledUp: false,
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

// fx = efeitos de status ativos do lutador. Iniciado sob demanda → quem nunca usa
// especial fica sem `fx` e toda leitura é no-op (PvP normal inalterado).
function getFx(p) {
  if (!p.fx) p.fx = { dmgDealtMult: 1, dmgDealtTurns: 0, dmgTakenMult: 1, dmgTakenTurns: 0, dots: [], immobilizeTurns: 0, evadeBuff: 0, evadeBuffTurns: 0, ignoreEvadeNext: false, amplifyNext: 1, counterNext: false, abilityCd: {} }
  return p.fx
}
function setFxMult(p, kind, mult, turns) {
  const fx = getFx(p)
  if (kind === 'dmgDealt') { fx.dmgDealtMult = mult; fx.dmgDealtTurns = turns }
  else { fx.dmgTakenMult = mult; fx.dmgTakenTurns = turns }
}

// 🐉 ESPECIAIS DE TRANSFORMAÇÃO — modelo de LEVERS (validado em scripts/pvp-lever-sim.js).
// 🎲 Cada forma tem 2 habilidades: 1 de DANO (rola o SEU dado `die` — d20) por 12 MP e 1
// BUFF (sem dado) por 8 MP. ESPELHA src/lib/transformationSpecials.ts — manter em sincronia.
// dano = power_transformado × dmgMult × sorte(die) × (1 − DR(armor×(1−pierce), K)).
// 'apply' usa a camada de STATUS (fx). Fúria Selvagem é compartilhada (forms: 3 metamorfos).
function setFxEvade(p, value, turns) { const fx = getFx(p); fx.evadeBuff = value; fx.evadeBuffTurns = turns }
const SPECIAL_DEFS = {
  // 🐉 Dragão
  dragon_breath:      { form: 'dragon', name: '🔥 Sopro de Fogo', kind: 'dmg', die: 20, dmgMult: 1.9, pierce: 0.6, cost: { mp: 12, stamina: 2 }, cd: 2 },
  dragon_scales:      { form: 'dragon', name: '🛡️ Escama de Dragão', kind: 'util', cost: { mp: 8, stamina: 1 }, cd: 4, apply: (s) => setFxMult(s, 'dmgTaken', 0.76, 3), msg: '-24% dano recebido por 3 turnos' },
  // 🐺 Lobo
  bite_bleeding:      { form: 'wolf', name: '🩸 Mordida Sangrenta', kind: 'dmg', die: 20, dmgMult: 1.6, pierce: 1, dot: { frac: 0.03, turns: 3, label: 'sangramento' }, cost: { mp: 12, stamina: 2 }, cd: 2 },
  // 😤 Fúria Selvagem — buff OFENSIVO do Lobo (Urso/Águia têm buffs próprios)
  wild_fury:          { form: 'wolf', name: '😤 Fúria Selvagem', kind: 'util', cost: { mp: 8, stamina: 1 }, cd: 4, apply: (s) => setFxMult(s, 'dmgDealt', 1.2, 3), msg: '+20% de dano causado por 3 turnos' },
  // 🐻 Urso
  unstoppable_charge: { form: 'bear', name: '💥 Investida Imparável', kind: 'dmg', die: 20, dmgMult: 1.72, pierce: 1, cost: { mp: 12, stamina: 2 }, cd: 2 },
  bear_guard:         { form: 'bear', name: '🛡️ Pele de Ferro', kind: 'util', cost: { mp: 8, stamina: 1 }, cd: 4, apply: (s) => setFxMult(s, 'dmgTaken', 0.80, 3), msg: '-20% dano recebido por 3 turnos' },
  // 🦅 Águia
  ascending_spiral:   { form: 'eagle', name: '🌀 Espiral Ascendente', kind: 'dmg', die: 20, dmgMult: 2.15, pierce: 0.6, cost: { mp: 12, stamina: 2 }, cd: 2 },
  eagle_swift:        { form: 'eagle', name: '🌬️ Voo Veloz', kind: 'util', cost: { mp: 8, stamina: 1 }, cd: 4, apply: (s) => setFxEvade(s, 0.45, 3), msg: '+45% de evasão por 3 turnos' },
  // ✨ 7º Sentido (humano)
  cosmo_burst:        { form: 'seventh_sense', name: '🌌 Explosão de Cosmo', kind: 'dmg', die: 20, dmgMult: 2.1, cost: { mp: 12, stamina: 2 }, cd: 2 },
  meditation:         { form: 'seventh_sense', name: '🧘 Meditação', kind: 'util', heal: 0.14, cost: { mp: 8, stamina: 1 }, cd: 4, msg: 'cura 14% do HP máximo' },
  // 🌟 Celestial (elfo)
  super_nova:         { form: 'celestial', name: '💥 Super Nova', kind: 'dmg', die: 20, dmgMult: 2.0, pierce: 0.5, cost: { mp: 12, stamina: 2 }, cd: 2 },
  hyperfocus:         { form: 'celestial', name: '✨ Hyperfoco', kind: 'util', cost: { mp: 8, stamina: 1 }, cd: 4, apply: (s) => setFxMult(s, 'dmgDealt', 1.3, 3), msg: '+30% de dano causado por 3 turnos' },
  // 💫 Golpe Atordoante — CONTROLE PURO compartilhado pelas 6 formas: dano simbólico,
  // rolagem ≥15 (30%) IMOBILIZA 1 turno. dodgeable: único especial que a esquiva
  // PASSIVA do alvo anula (golpe físico mirado; balance no pvp-lever-sim 2026-07-11).
  stunning_blow:      { forms: ['dragon', 'wolf', 'bear', 'eagle', 'seventh_sense', 'celestial'], name: '💫 Golpe Atordoante', kind: 'dmg', die: 20, dmgMult: 0.8, immobilizeRoll: 15, dodgeable: true, cost: { mp: 10, stamina: 2 }, cd: 3 },
}

// 🌳 Especial ASSINATURA/BUFF da forma (p/ o gate/rank da árvore) — o de dano que NÃO
// é o Golpe Atordoante, e o único 'util' daquela forma.
function formSignatureId(form) {
  const entry = Object.entries(SPECIAL_DEFS).find(([id, d]) => d.kind === 'dmg' && id !== 'stunning_blow' && d.form === form)
  return entry ? entry[0] : null
}
function formBuffId(form) {
  const entry = Object.entries(SPECIAL_DEFS).find(([id, d]) => d.kind === 'util' && d.form === form)
  return entry ? entry[0] : null
}

// Dano de um especial: DIRETO (sem disputa de esquiva — como o handler legado já fazia).
// 🩹 Sorte do ESPECIAL com crítico de bônus REDUZIDO (1.3 vs 1.6 do ataque normal):
// o jogador ainda vê o crítico ao rolar o 12, mas não vira nuke/one-shot no mesmo nível.
const SPECIAL_CRIT_MULT = 1.3
function specialLuck(roll, sides = CM.DICE_SIDES) {
  const t = sides > 1 ? (roll - 1) / (sides - 1) : 1
  const m = CM.LUCK_LO + (CM.LUCK_HI - CM.LUCK_LO) * t
  return roll >= sides ? m * SPECIAL_CRIT_MULT : m
}
function specialHitDamage(player, opponent, def) {
  const aLev = player.levers || derivePlayerLevers(player).levers
  const dLev = opponent.levers || derivePlayerLevers(opponent).levers
  const aFx = getFx(player), dFx = getFx(opponent)
  const sides = def.die || CM.DICE_SIDES
  const hits = def.hits || 1
  let total = 0, crit = false, maxRoll = 0
  for (let h = 0; h < hits; h++) {
    const roll = def.gcrit ? sides : (Math.floor(Math.random() * sides) + 1)
    if (roll > maxRoll) maxRoll = roll
    if (roll >= sides) crit = true
    const power = aLev.power * def.dmgMult * (aFx.amplifyNext || 1)
    const armor = Math.max(0, dLev.armor * (1 - (def.pierce || 0)))
    let dmg = power * specialLuck(roll, sides) * (1 - CM.damageReduction(armor, dLev.K))
    dmg = dmg * (aFx.dmgDealtMult || 1) * (dFx.dmgTakenMult || 1)
    total += Math.max(1, Math.round(dmg))
  }
  aFx.amplifyNext = 1 // consome a amplificação
  return { damage: total, crit, maxRoll }
}

function processSpecialAbility(player, opponent, abilityId) {
  const baseDef = SPECIAL_DEFS[abilityId]
  if (!baseDef) return { success: false, error: 'Habilidade não reconhecida!' }
  // Fúria Selvagem é compartilhada (def.forms); as demais validam a forma única (def.form).
  const formOk = baseDef.forms ? baseDef.forms.includes(player.transformationType) : baseDef.form === player.transformationType
  if (!formOk) return { success: false, error: 'Habilidade não pertence à sua forma!' }

  // 🌳 Gate da árvore: Golpe Atordoante e buff de forma só liberam com o nó comprado.
  // O especial ASSINATURA (kind dmg, não-stun) NUNCA é gateado — nível 1 já vem com ele.
  const unlocks = getUnlocksFor(player)
  if (abilityId === 'stunning_blow' && !unlocks.stunningBlow) {
    return { success: false, error: 'Aprenda o Golpe Atordoante na árvore de habilidades!' }
  }
  if (baseDef.kind === 'util' && !unlocks.formBuff) {
    return { success: false, error: 'Aprenda o buff da forma na árvore de habilidades!' }
  }

  const form = player.transformationType
  const def = applyRankPatch(baseDef, unlocks, form, 'stunning_blow', formSignatureId(form), formBuffId(form))

  const cost = def.cost || {}
  if ((player.stamina || 0) < (cost.stamina || 0)) return { success: false, error: 'Stamina insuficiente!' }
  if ((player.mp || 0) < (cost.mp || 0)) return { success: false, error: 'MP insuficiente!' }
  const fx = getFx(player)
  if ((fx.abilityCd[abilityId] || 0) > 0) return { success: false, error: `Em recarga: ${fx.abilityCd[abilityId]} turno(s)` }

  const spentSta = cost.stamina || 0
  player.stamina = Math.max(0, (player.stamina || 0) - spentSta)
  if (spentSta > 0) trackFightStamina(player, spentSta)
  player.mp = Math.max(0, (player.mp || 0) - (cost.mp || 0))
  fx.abilityCd[abilityId] = def.cd || 0

  if (def.kind === 'util') {
    if (def.heal) {
      const heal = Math.round((player.maxHp || 0) * def.heal)
      player.hp = Math.min(player.maxHp, (player.hp || 0) + heal)
      return { success: true, damage: 0, message: `${def.name}: ${player.name} recupera ${heal} HP! (${player.hp}/${player.maxHp})` }
    }
    // 🌳 Rank II (form_buff): patch de intensidade vem em __buffPatch (id fixo, valor ranked).
    if (def.__buffPatch) {
      const { key, value } = def.__buffPatch
      if (key === 'dmgTaken' || key === 'dmgDealt') setFxMult(player, key, value, 3)
      else if (key === 'evade') setFxEvade(player, value, 3)
    } else if (baseDef.apply) baseDef.apply(player, opponent)
    return { success: true, damage: 0, message: `${def.name}: ${player.name} — ${def.msg || baseDef.msg}` }
  }

  // especial de dano
  // 💫 dodgeable: golpe físico mirado — a esquiva PASSIVA do alvo anula (MP/recarga já gastos)
  if (def.dodgeable) {
    const dLev = opponent.levers || derivePlayerLevers(opponent).levers
    const dFx = getFx(opponent)
    const evade = Math.min(0.95, (dLev.evade || 0) + (dFx.evadeBuffTurns > 0 ? dFx.evadeBuff : 0))
    if (Math.random() < evade) {
      return { success: true, damage: 0, message: `${def.name}: ${opponent.name} ESQUIVA do golpe!` }
    }
  }
  if (def.dot) {
    const dmg = Math.max(1, Math.round((opponent.maxHp || 0) * def.dot.frac))
    getFx(opponent).dots.push({ dmg, turns: def.dot.turns, label: def.dot.label })
  }
  let { damage, crit, maxRoll } = specialHitDamage(player, opponent, def)
  // 🏆 Capstone de crítico (critBonusMult) amplifica só o golpe crítico — mesmo hook do PvE.
  if (crit && unlocks.passives.critBonusMult !== 1) damage = Math.max(1, Math.round(damage * unlocks.passives.critBonusMult))
  opponent.hp = Math.max(0, (opponent.hp || 0) - damage)
  // 🌟 Imobilização = PROC de sorte alta (rolagem ≥ immobilizeRoll), não garantida.
  let immobMsg = ''
  if (def.immobilizeRoll && maxRoll >= def.immobilizeRoll) {
    getFx(opponent).immobilizeTurns = 1
    immobMsg = ` ${opponent.name} foi IMOBILIZADO (rolagem ${maxRoll})!`
  }
  return { success: true, damage, crit, message: `${def.name}: ${player.name} causa ${damage} de dano${crit ? ' CRÍTICO' : ''}! (${opponent.hp}/${opponent.maxHp})${immobMsg}` }
}
