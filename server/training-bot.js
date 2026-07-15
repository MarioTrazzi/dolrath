// 🐉 MODO TREINO - Bot monstro que joga pelas mesmas regras do PvP
// O bot conecta como um cliente Socket.IO real no próprio servidor,
// então todo o fluxo de combate (ready, iniciativa, ações, defesa, dados)
// passa pelos mesmos handlers do PvP — zero duplicação de regras.

const { io } = require('socket.io-client')

// ============================================================
// Catálogo de monstros (stats escalam com o nível do jogador)
// ============================================================

const MONSTERS = {
  goblin: {
    name: 'Goblin Salteador',
    race: 'Goblin',
    class: 'Salteador',
    emoji: '🧌',
    difficulty: 'Fácil',
    scale: (L) => ({
      hp: 60 + 18 * L,
      mp: 30,
      stamina: 60,
      str: 4 + Math.floor(1.5 * L),
      agi: 6 + 2 * L,
      int: 1,
      def: 2 + L,
      res: 1 + Math.floor(0.5 * L),
    }),
    behavior: {
      attackWeights: { light_attack: 4, heavy_attack: 1, special_attack: 0 },
      dodgeChance: 0.7,
    },
  },
  wolf: {
    name: 'Lobo das Sombras',
    race: 'Fera',
    class: 'Lobo',
    emoji: '🐺',
    difficulty: 'Médio',
    scale: (L) => ({
      hp: 80 + 22 * L,
      mp: 30,
      stamina: 80,
      str: 6 + 2 * L,
      agi: 8 + Math.floor(2.5 * L),
      int: 2,
      def: 3 + Math.floor(1.2 * L),
      res: 2 + Math.floor(0.8 * L),
    }),
    behavior: {
      attackWeights: { light_attack: 3, heavy_attack: 2, special_attack: 0 },
      dodgeChance: 0.85,
    },
  },
  orc: {
    name: 'Orc Berserker',
    race: 'Orc',
    class: 'Berserker',
    emoji: '👹',
    difficulty: 'Médio',
    scale: (L) => ({
      hp: 110 + 26 * L,
      mp: 30,
      stamina: 90,
      str: 9 + Math.floor(2.5 * L),
      agi: 3 + L,
      int: 1,
      def: 5 + Math.floor(1.5 * L),
      res: 3 + L,
    }),
    behavior: {
      attackWeights: { light_attack: 1, heavy_attack: 4, special_attack: 0 },
      dodgeChance: 0.3,
    },
  },
  golem: {
    name: 'Golem de Pedra',
    race: 'Constructo',
    class: 'Golem',
    emoji: '🗿',
    difficulty: 'Difícil',
    scale: (L) => ({
      hp: 150 + 30 * L,
      mp: 30,
      stamina: 100,
      str: 8 + 2 * L,
      agi: 1 + Math.floor(0.5 * L),
      int: 2,
      def: 9 + Math.floor(2.5 * L),
      res: 6 + 2 * L,
    }),
    behavior: {
      attackWeights: { light_attack: 1, heavy_attack: 3, special_attack: 0 },
      dodgeChance: 0.05,
    },
  },
  dragon: {
    name: 'Dragão Ancião',
    race: 'Dragão',
    class: 'Ancião',
    emoji: '🐉',
    difficulty: 'Chefe',
    scale: (L) => ({
      hp: 180 + 35 * L,
      mp: 100 + 10 * L,
      stamina: 120,
      str: 10 + 3 * L,
      agi: 6 + Math.floor(1.5 * L),
      int: 8 + Math.floor(2.5 * L),
      def: 7 + 2 * L,
      res: 6 + Math.floor(1.5 * L),
    }),
    behavior: {
      attackWeights: { light_attack: 1, heavy_attack: 2, special_attack: 2 },
      dodgeChance: 0.5,
    },
  },
}

const DICE_BY_ACTION = {
  light_attack: 6,
  heavy_attack: 10,
  special_attack: 20,
}

const STAMINA_BY_ACTION = {
  light_attack: 1,
  heavy_attack: 2,
  special_attack: 4,
}

function randomDelay(min, max) {
  return min + Math.floor(Math.random() * (max - min))
}

function pickWeighted(weights) {
  const entries = Object.entries(weights).filter(([, w]) => w > 0)
  const total = entries.reduce((sum, [, w]) => sum + w, 0)
  let r = Math.random() * total
  for (const [key, w] of entries) {
    r -= w
    if (r <= 0) return key
  }
  return entries[0]?.[0] || 'light_attack'
}

function buildMonsterPlayer(monsterKey, playerLevel) {
  const template = MONSTERS[monsterKey] || MONSTERS.goblin
  const level = Math.max(1, Number(playerLevel) || 1)
  const s = template.scale(level)

  return {
    id: `monster_${monsterKey}_${Date.now()}`,
    name: template.name,
    level,
    race: template.race,
    class: template.class,
    hp: s.hp,
    maxHp: s.hp,
    mp: s.mp,
    maxMp: s.mp,
    stamina: s.stamina,
    maxStamina: s.stamina,
    attack: s.str,
    defense: s.def,
    strength: s.str,
    agility: s.agi,
    intelligence: s.int,
    resistance: s.res,
    critical: 1.0,
    speed: 2.5,
    experience: 0, // perde empates de iniciativa para o jogador
    equipment: {},
    avatar: null,
    avatarEmoji: template.emoji,
    equipmentMap: {},
    isReady: false,
    isConnected: true,
    isAlive: true,
  }
}

// ============================================================
// Bot: conecta na própria porta e joga a sala de treino
// ============================================================

function spawnTrainingBot({ roomId, port, playerLevel, monsterKey }) {
  const template = MONSTERS[monsterKey] || MONSTERS.goblin
  const monster = buildMonsterPlayer(monsterKey, playerLevel)
  const behavior = template.behavior

  const socket = io(`http://localhost:${port}`, {
    transports: ['websocket'],
    reconnection: false,
  })

  const log = (msg) => console.log(`🤖 [treino:${roomId}] ${monster.name}: ${msg}`)

  let isReady = false
  let rolledInitiative = false
  let rolledDice = false
  let lastPhase = null
  let finished = false

  const timers = new Set()
  const after = (ms, fn) => {
    const t = setTimeout(() => {
      timers.delete(t)
      if (!finished) fn()
    }, ms)
    timers.add(t)
  }

  const shutdown = (reason) => {
    if (finished) return
    finished = true
    log(`saindo (${reason})`)
    timers.forEach(clearTimeout)
    timers.clear()
    socket.disconnect()
  }

  // Trava de segurança: bot nunca vive mais que 30 minutos
  after(30 * 60 * 1000, () => shutdown('tempo máximo de treino'))

  socket.on('connect', () => {
    log('entrando na arena de treino')
    socket.emit('join_room', { roomId, player: monster, isCreator: false, role: 'fighter' })
  })

  socket.on('connect_error', (err) => {
    console.error(`🤖 [treino:${roomId}] erro de conexão do bot:`, err.message)
    shutdown('erro de conexão')
  })

  socket.on('room_closed', () => shutdown('sala fechada'))
  socket.on('disconnect', () => shutdown('desconectado'))

  socket.on('room_updated', (room) => {
    if (finished || !room) return

    const phaseChanged = room.phase !== lastPhase
    lastPhase = room.phase

    const fighters = room.participants?.fighters || []
    const me = room.player1?.id === monster.id ? room.player1 : room.player2?.id === monster.id ? room.player2 : null

    // Se o bot virou o único lutador (jogador saiu), encerrar para a sala ser limpa
    if (fighters.length === 1 && fighters[0]?.id === monster.id) {
      return shutdown('jogador saiu da sala')
    }
    if (!me) return

    switch (room.phase) {
      case 'waiting_players': {
        const both = room.player1 && room.player2
        if (both && !isReady) {
          isReady = true
          after(randomDelay(1200, 2200), () => {
            log('pronto para lutar')
            socket.emit('toggle_ready', { playerId: monster.id, roomId })
          })
        }
        break
      }

      case 'initiative_roll': {
        if (!rolledInitiative) {
          rolledInitiative = true
          after(randomDelay(1500, 3000), () => {
            log('rolando iniciativa')
            socket.emit('roll_initiative', { playerId: monster.id, roomId })
          })
        }
        break
      }

      case 'player_turn': {
        rolledDice = false
        if (room.currentTurn === monster.id && phaseChanged) {
          after(randomDelay(2000, 3500), () => {
            // Escolher ataque respeitando MP/stamina disponíveis
            const weights = { ...behavior.attackWeights }
            if (me.mp < 15) weights.special_attack = 0
            if (me.stamina < STAMINA_BY_ACTION.special_attack) weights.special_attack = 0
            if (me.stamina < STAMINA_BY_ACTION.heavy_attack) weights.heavy_attack = 0

            const action = me.stamina < 1 ? 'light_attack' : pickWeighted(weights)
            const mpCost = action === 'special_attack' ? 15 : 0

            log(`atacando: ${action}`)
            socket.emit('player_action', {
              playerId: monster.id,
              roomId,
              action,
              diceType: DICE_BY_ACTION[action],
              mpCost,
              staminaCost: STAMINA_BY_ACTION[action],
            })
          })
        }
        break
      }

      case 'opponent_reaction': {
        // Defesa passiva — servidor resolve sem reação do bot
        break
      }

      case 'dice_roll': {
        if (room.pendingAction && !rolledDice) {
          rolledDice = true
          after(randomDelay(1800, 3200), () => {
            log(`rolando d${room.pendingAction.diceType}`)
            socket.emit('roll_dice', {
              playerId: monster.id,
              roomId,
              sides: room.pendingAction.diceType,
              action: room.pendingAction.action,
            })
          })
        }
        break
      }

      case 'combat_end': {
        const won = room.winner === monster.id
        log(won ? 'venceu o treino!' : 'foi derrotado no treino!')
        // Dar tempo do jogador ver o resultado antes do bot sair
        after(15000, () => shutdown('combate encerrado'))
        break
      }
    }
  })

  return { monsterId: monster.id, shutdown }
}

module.exports = { spawnTrainingBot, MONSTERS }
