// 🤖 LOOP DE BOT — máquina de estados compartilhada pelos lutadores controlados pelo
// servidor (monstro do treino e oponente de PvP). O bot é um cliente Socket.IO REAL
// conectado na própria porta: nada aqui fala com a sala por dentro, tudo passa pelos
// mesmos handlers do jogador humano (join_room / toggle_ready / roll_initiative /
// player_action). É o que garante que o bot luta pelas mesmas regras.
//
// Por que módulo próprio: o treino e o PvP tinham a MESMA máquina copiada em dois
// arquivos (ver a branch morta do commit 1358ead) e a cópia do PvP apodreceu — ficou
// mandando diceType/mpCost no player_action e tratando a fase `opponent_reaction`,
// que o servidor nem tem mais. Uma cópia só, os dois usam.

const { io } = require('socket.io-client')
const CM = require('./combatModel')

// Custos/dados vêm do combatModel — o bot luta com o MESMO kit do jogador.
const ACTION_TO_TYPE = { light_attack: 'basic', heavy_attack: 'weapon' }
const staminaFor = (action) => CM.ATTACKS[ACTION_TO_TYPE[action]]?.stamina ?? 1
const mpFor = (action) => CM.ATTACKS[ACTION_TO_TYPE[action]]?.mp ?? 0

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
 * Sobe um bot lutador na sala `roomId`.
 *
 * @param {object}   opts
 * @param {string}   opts.roomId
 * @param {number|string} opts.port        porta do próprio socket-server
 * @param {object}   opts.player           payload de join_room (id/nome/classe/nível/…)
 * @param {object}   opts.attackWeights    pesos { light_attack, heavy_attack }
 * @param {string}   [opts.label]          prefixo do log (ex.: 'treino', 'pvp-bot')
 * @param {string}   [opts.joinNote]       linha extra no log de entrada
 * @param {number}   [opts.maxLifeMs]      teto de vida do bot (default 30 min)
 * @param {number}   [opts.soloGraceMs]    tolerância sozinho na sala antes de desistir
 * @param {function} [opts.onEnd]          chamado no shutdown (razão)
 */
function spawnBotFighter({
  roomId,
  port,
  player,
  attackWeights,
  label = 'bot',
  joinNote = '',
  maxLifeMs = 30 * 60 * 1000,
  soloGraceMs = 8000,
  onEnd,
}) {
  const weightsBase = { ...(attackWeights || { light_attack: 1, heavy_attack: 1 }) }

  const socket = io(`http://localhost:${port}`, {
    transports: ['websocket'],
    reconnection: false,
  })

  const log = (msg) => console.log(`🤖 [${label}:${roomId}] ${player.name}: ${msg}`)

  let isReady = false
  let rolledInitiative = false
  let finished = false
  // 🐛 Antes o bot só atacava quando `phase` mudava. Usar Item / especial / imobilizar
  // avança o turno mantendo phase=player_turn — o bot travava e a luta nunca acabava
  // (ex.: jogador a 4 HP usa poção → turno do monstro → silêncio).
  let latestRoom = null
  let turnActionScheduled = false
  let ourTurnSince = 0
  // Sozinho na sala: NÃO desistir na hora. O oponente pode estar dando F5 (o cliente sai
  // e volta em ~1-2s) e, no PvP com bot, o bot chega antes de o humano aparecer na lista.
  let aloneSince = 0

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
    timers.forEach((t) => {
      clearTimeout(t)
      clearInterval(t)
    })
    timers.clear()
    socket.disconnect()
    if (typeof onEnd === 'function') {
      try {
        onEnd(reason)
      } catch (e) {
        console.error(`🤖 [${label}:${roomId}] onEnd falhou:`, e.message)
      }
    }
  }

  const meFrom = (room) =>
    room.player1?.id === player.id ? room.player1
      : room.player2?.id === player.id ? room.player2
        : null

  const scheduleBotAttack = () => {
    const room = latestRoom
    if (!room || finished || turnActionScheduled) return
    if (!room.isActive || room.phase !== 'player_turn' || room.currentTurn !== player.id) return
    if (room.pendingAction) return

    const me = meFrom(room)
    if (!me) return

    turnActionScheduled = true
    after(randomDelay(1800, 3200), () => {
      const r = latestRoom
      if (finished || !r || !r.isActive || r.phase !== 'player_turn' || r.currentTurn !== player.id || r.pendingAction) {
        turnActionScheduled = false
        return
      }
      const now = meFrom(r)
      if (!now) { turnActionScheduled = false; return }

      const snapMp = now.mp || 0
      const snapSta = now.stamina || 0
      const weights = { ...weightsBase }
      if (snapMp < mpFor('heavy_attack')) weights.heavy_attack = 0
      if (snapSta < staminaFor('heavy_attack')) weights.heavy_attack = 0

      const lightCost = staminaFor('light_attack')
      const action = snapSta < lightCost ? 'light_attack' : pickWeighted(weights)
      if (snapSta < lightCost) log(`stamina baixa (${snapSta}) — tentando golpe`)

      log(`atacando: ${action} (−${staminaFor(action)} STA${mpFor(action) ? ` · −${mpFor(action)} MP` : ''})`)
      // Servidor é autoridade de custo/dado — mandamos só a ação.
      socket.emit('player_action', { playerId: player.id, roomId, action })

      // Se rejeitar (STA/MP) não vem room_updated → libera e retenta.
      after(2800, () => {
        const cur = latestRoom
        if (
          cur &&
          cur.isActive &&
          cur.phase === 'player_turn' &&
          cur.currentTurn === player.id &&
          !cur.pendingAction
        ) {
          log('ação não avançou o turno — retentando')
          turnActionScheduled = false
          scheduleBotAttack()
        }
      })
    })
  }

  after(maxLifeMs, () => shutdown('tempo máximo'))

  // Watchdog: se ficarmos >4s no nosso turno sem pendingAction, força novo schedule
  // (cobre race onde turnActionScheduled ficou true e o emit foi engolido).
  const watchdog = setInterval(() => {
    if (finished) return
    const room = latestRoom
    // Sozinho e a carência estourou: ninguém mais manda room_updated, então é aqui que
    // o bot larga a sala (senão ficaria pendurado até o teto de 30 min).
    if (aloneSince && Date.now() - aloneSince >= soloGraceMs) {
      return shutdown('jogador saiu da sala')
    }
    if (!room?.isActive || room.phase !== 'player_turn' || room.currentTurn !== player.id) return
    if (room.pendingAction) return
    if (!ourTurnSince) ourTurnSince = Date.now()
    if (Date.now() - ourTurnSince < 4000) return
    log('watchdog: turno parado — resetando e atacando')
    turnActionScheduled = false
    ourTurnSince = Date.now()
    scheduleBotAttack()
  }, 1500)
  timers.add(watchdog)

  socket.on('connect', () => {
    log(`entrando${joinNote ? ` (${joinNote})` : ''}`)
    socket.emit('join_room', { roomId, player, isCreator: false, role: 'fighter' })
  })

  socket.on('connect_error', (err) => {
    console.error(`🤖 [${label}:${roomId}] erro de conexão do bot:`, err.message)
    shutdown('erro de conexão')
  })

  socket.on('join_room_error', ({ error } = {}) => shutdown(`join recusado: ${error || '?'}`))
  socket.on('room_closed', () => shutdown('sala fechada'))
  socket.on('disconnect', () => shutdown('desconectado'))

  socket.on('room_updated', (room) => {
    if (finished || !room) return
    latestRoom = room

    const fighters = room.participants?.fighters || []
    const me = meFrom(room)

    if (fighters.length === 1 && fighters[0]?.id === player.id) {
      if (!aloneSince) aloneSince = Date.now()
      if (Date.now() - aloneSince >= soloGraceMs) return shutdown('jogador saiu da sala')
      return
    }
    aloneSince = 0
    if (!me) return

    // Saiu do nosso turno → pode agendar de novo na próxima vez.
    if (room.currentTurn !== player.id || room.phase !== 'player_turn' || !room.isActive) {
      turnActionScheduled = false
      ourTurnSince = 0
    } else if (!ourTurnSince) {
      ourTurnSince = Date.now()
    }

    switch (room.phase) {
      case 'waiting_players': {
        const both = room.player1 && room.player2
        if (both && !isReady) {
          isReady = true
          after(randomDelay(1200, 2200), () => {
            log('pronto para lutar')
            socket.emit('toggle_ready', { playerId: player.id, roomId })
          })
        }
        break
      }

      case 'initiative_roll': {
        if (!rolledInitiative) {
          rolledInitiative = true
          after(randomDelay(1500, 3000), () => {
            log('rolando iniciativa')
            socket.emit('roll_initiative', { playerId: player.id, roomId })
          })
        }
        break
      }

      case 'player_turn':
        scheduleBotAttack()
        break

      case 'dice_roll':
        break

      case 'combat_end': {
        const won = room.winner === player.id
        log(won ? 'venceu a luta!' : 'foi derrotado!')
        after(15000, () => shutdown('combate encerrado'))
        break
      }
    }
  })

  return { botId: player.id, shutdown }
}

module.exports = { spawnBotFighter, randomDelay, pickWeighted, staminaFor, mpFor }
