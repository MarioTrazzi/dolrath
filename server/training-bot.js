// 🐉 MODO TREINO — bot monstro como peer PvP (mesmo nível, força via gear DUO→PEN).
// Conecta como cliente Socket.IO real; fluxo = mesmos handlers do PvP.

const { io } = require('socket.io-client')
const {
  getTrainingOpponent,
  syntheticPeerEquipment,
  syntheticPeerAttrs,
  TRAINING_OPPONENTS_BY_KEY,
  DEFAULT_TRAINING_OPPONENT_KEY,
} = require('./trainingOpponents')

// Compat: socket-server ainda importa MONSTERS[key]
const MONSTERS = TRAINING_OPPONENTS_BY_KEY

const DICE_BY_ACTION = {
  light_attack: 6,
  heavy_attack: 8,
}

const STAMINA_BY_ACTION = {
  light_attack: 1,
  heavy_attack: 2,
}

const MP_BY_ACTION = {
  light_attack: 0,
  heavy_attack: 8,
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

/**
 * Peer PvP sintético: nível do humano + 9 slots no gear-alvo.
 * Levers vêm de derivePlayerLevers no join (classe + gear + attrs).
 */
function buildMonsterPlayer(monsterKey, playerLevel) {
  const def = getTrainingOpponent(monsterKey)
  const level = Math.max(1, Number(playerLevel) || 1)
  const attrs = syntheticPeerAttrs(level)
  const equipment = syntheticPeerEquipment(def.rarity, def.enhancementLevel)

  // MP/stamina de sessão generosos o bastante para uma luta (faucet de treino)
  const maxMp = 60 + level * 4 + attrs.int
  const maxStamina = 120 + attrs.agi * 2 + attrs.def * 2

  return {
    id: `monster_${def.key}_${Date.now()}`,
    name: def.name,
    level,
    race: def.race,
    class: def.classNamePt,
    hp: 100, // sobrescrito pelos levers no join
    maxHp: 100,
    mp: maxMp,
    maxMp,
    stamina: maxStamina,
    maxStamina,
    attack: attrs.str,
    defense: attrs.def,
    strength: attrs.str,
    agility: attrs.agi,
    intelligence: attrs.int,
    resistance: Math.floor(attrs.def * 0.8),
    critical: 1.0,
    speed: 2.5,
    experience: 0,
    attributes: attrs,
    baseStats: attrs,
    equipment,
    avatar: def.image,
    avatarEmoji: def.emoji,
    equipmentMap: {},
    trainingLeverMult: def.leverMult || 1,
    trainingGearLabel: def.gearLabel,
    trainingUnbeatable: !!def.unbeatable,
    skillTree: null, // legado → Ataque de Classe liberado
    isReady: false,
    isConnected: true,
    isAlive: true,
  }
}

function spawnTrainingBot({ roomId, port, playerLevel, monsterKey }) {
  const def = getTrainingOpponent(monsterKey)
  const monster = buildMonsterPlayer(def.key, playerLevel)
  const behavior = { attackWeights: { ...def.attackWeights } }

  const socket = io(`http://localhost:${port}`, {
    transports: ['websocket'],
    reconnection: false,
  })

  const log = (msg) => console.log(`🤖 [treino:${roomId}] ${monster.name}: ${msg}`)

  let isReady = false
  let rolledInitiative = false
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

  after(30 * 60 * 1000, () => shutdown('tempo máximo de treino'))

  socket.on('connect', () => {
    log(`entrando (peer ${def.gearLabel}${def.unbeatable ? ' · imbatível' : ''})`)
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
        if (room.currentTurn === monster.id && phaseChanged) {
          after(randomDelay(1800, 3200), () => {
            const weights = { ...behavior.attackWeights }
            if ((me.mp || 0) < MP_BY_ACTION.heavy_attack) weights.heavy_attack = 0
            if ((me.stamina || 0) < STAMINA_BY_ACTION.heavy_attack) weights.heavy_attack = 0

            const action = (me.stamina || 0) < 1
              ? 'light_attack'
              : pickWeighted(weights)
            const staminaCost = STAMINA_BY_ACTION[action] || 1
            const mpCost = MP_BY_ACTION[action] || 0

            log(`atacando: ${action} (−${staminaCost} STA${mpCost ? ` · −${mpCost} MP` : ''})`)
            socket.emit('player_action', {
              playerId: monster.id,
              roomId,
              action,
              diceType: DICE_BY_ACTION[action],
              mpCost,
              staminaCost,
            })
          })
        }
        break
      }

      case 'dice_roll':
        break

      case 'combat_end': {
        const won = room.winner === monster.id
        log(won ? 'venceu o treino!' : 'foi derrotado no treino!')
        after(15000, () => shutdown('combate encerrado'))
        break
      }
    }
  })

  return { monsterId: monster.id, shutdown }
}

module.exports = {
  spawnTrainingBot,
  MONSTERS,
  getTrainingOpponent,
  DEFAULT_TRAINING_OPPONENT_KEY,
}
