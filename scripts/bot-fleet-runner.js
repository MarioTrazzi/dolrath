/**
 * Frota headless: standby PvP contínuo na fila "Buscar oponente".
 * Cancela coleta/masmorra antes de entrar na fila. Eco opcional (ENABLE_ECO=1).
 *
 * Env:
 *   BOT_FLEET_SECRET   — obrigatório
 *   APP_URL            — default https://dolrath.vercel.app
 *   SOCKET_URL         — default https://dolrath.onrender.com
 *   BOT_FLEET_REGISTRY — path do registry (default scripts/bot-fleet-registry.json)
 *   BOT_FLEET_LOG      — JSONL log path (default scripts/bot-fleet-events.jsonl)
 *   ENABLE_ECO         — se "1", faz gather/farm entre filas (default off)
 *   MAX_QUEUE_WAITERS  — bots simultâneos na fila (default 8)
 *
 * Usage: node scripts/bot-fleet-runner.js
 */
const fs = require('fs')
const path = require('path')
const { io } = require('socket.io-client')

const APP_URL = (process.env.APP_URL || 'https://dolrath.vercel.app').replace(/\/$/, '')
// Sempre preferir o socket de produção a menos que SOCKET_URL seja explícito —
// o runner costuma rodar na máquina local mirando APP_URL de prod.
const SOCKET_URL = (
  process.env.SOCKET_URL ||
  process.env.NEXT_PUBLIC_SOCKET_URL ||
  'https://dolrath.onrender.com'
).replace(/\/$/, '')
const SECRET = process.env.BOT_FLEET_SECRET || ''
const REGISTRY_PATH =
  process.env.BOT_FLEET_REGISTRY || path.join(__dirname, 'bot-fleet-registry.json')
const LOG_PATH = process.env.BOT_FLEET_LOG || path.join(__dirname, 'bot-fleet-events.jsonl')
const PVP_MIN_STA = 5
const GATHER_FIELD = 'ervas'
const ENABLE_ECO = process.env.ENABLE_ECO === '1'
/** Bots simultâneos esperando humano na fila. */
const MAX_QUEUE_WAITERS = Math.max(1, Number(process.env.MAX_QUEUE_WAITERS) || 8)
/** Tempo máximo esperando match antes de re-entrar na fila. */
const QUEUE_WAIT_MS = Math.max(30_000, Number(process.env.QUEUE_WAIT_MS) || 300_000)
let queueWaiters = 0

async function withQueueSlot(fn) {
  while (queueWaiters >= MAX_QUEUE_WAITERS) {
    await sleep(2000)
  }
  queueWaiters++
  try {
    return await fn()
  } finally {
    queueWaiters--
  }
}

if (!SECRET) {
  console.error('BOT_FLEET_SECRET is required')
  process.exit(1)
}

function logEvent(type, data) {
  const line = JSON.stringify({ t: new Date().toISOString(), type, ...data })
  fs.appendFileSync(LOG_PATH, line + '\n')
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function jitter(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1))
}

async function api(method, urlPath, characterId, body) {
  const headers = {
    'Content-Type': 'application/json',
    'x-bot-secret': SECRET,
    'x-bot-character-id': characterId,
  }
  const res = await fetch(`${APP_URL}${urlPath}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }
  return { ok: res.ok, status: res.status, json }
}

async function getCharacter(characterId) {
  const { ok, json } = await api('GET', `/api/character/${characterId}`, characterId)
  if (!ok) throw new Error(`getCharacter ${characterId}: ${json?.error || 'fail'}`)
  return json
}

function buildPlayerPayload(char, userId) {
  const attrs = char.attributes || char.baseStats || {}
  return {
    id: char.id,
    name: char.name,
    level: char.level || 1,
    race: char.race,
    class: char.class,
    userId: userId || char.userId || char.user?.id,
    hp: char.hp,
    maxHp: char.maxHp,
    mp: char.mp ?? char.baseStats?.mp ?? 50,
    maxMp: char.maxMp ?? char.baseStats?.maxMp ?? 50,
    stamina: char.stamina,
    maxStamina: char.maxStamina,
    attributes: attrs,
    baseStats: char.baseStats || attrs,
    equipment: char.equipment || [],
    skillTree: char.skillTree || null,
    avatar: char.avatar,
    isReady: false,
    isConnected: true,
    isAlive: true,
  }
}

/** AI de combate estilo training-bot, com delays humanos. */
function playMatch(socketUrl, roomId, player, userId) {
  return new Promise((resolve) => {
    const socket = io(socketUrl, { transports: ['websocket', 'polling'], reconnection: false })
    let done = false
    let lastPhase = ''
    const finish = (result) => {
      if (done) return
      done = true
      try {
        socket.disconnect()
      } catch {
        /* ignore */
      }
      resolve(result)
    }

    const timer = setTimeout(() => finish({ ok: false, reason: 'timeout' }), 12 * 60 * 1000)

    socket.on('connect', () => {
      socket.emit('join_room', {
        roomId,
        player: { ...player, userId },
        isCreator: false,
        role: 'fighter',
        training: false,
      })
    })

    socket.on('room_updated', (room) => {
      if (!room || done) return
      const phase = room.phase
      const me =
        room.player1?.id === player.id
          ? room.player1
          : room.player2?.id === player.id
            ? room.player2
            : null
      if (!me) return

      if (phase === 'waiting_players' && room.player1 && room.player2 && !me.isReady) {
        if (lastPhase !== 'ready') {
          lastPhase = 'ready'
          setTimeout(() => {
            socket.emit('toggle_ready', { playerId: player.id, roomId })
          }, jitter(1200, 2400))
        }
      }

      if (phase === 'initiative_roll' && lastPhase !== 'init') {
        lastPhase = 'init'
        setTimeout(() => {
          socket.emit('roll_initiative', { playerId: player.id, roomId })
        }, jitter(1500, 3000))
      }

      if (phase === 'player_turn' && room.currentTurn === player.id && lastPhase !== `turn-${room.turnNumber}`) {
        lastPhase = `turn-${room.turnNumber}`
        setTimeout(() => {
          const sta = me.stamina || 0
          const mp = me.mp || 0
          let action = 'light_attack'
          if (sta >= 2 && mp >= 8 && Math.random() < 0.35) action = 'heavy_attack'
          socket.emit('player_action', { playerId: player.id, roomId, action })
        }, jitter(1800, 3500))
      }

      if (phase === 'combat_end') {
        clearTimeout(timer)
        const winnerId = room.winnerId || room.winner?.id
        logEvent('pvp_end', {
          characterId: player.id,
          roomId,
          won: winnerId === player.id,
        })
        setTimeout(() => finish({ ok: true, won: winnerId === player.id }), 2000)
      }
    })

    socket.on('disconnect', () => {
      if (!done) {
        clearTimeout(timer)
        finish({ ok: false, reason: 'disconnect' })
      }
    })
  })
}

function queueForMatch(socketUrl, bot, player) {
  return new Promise((resolve) => {
    const socket = io(socketUrl, { transports: ['websocket', 'polling'], forceNew: true })
    const timeout = setTimeout(() => {
      socket.emit('queue_leave', { characterId: bot.characterId })
      socket.disconnect()
      resolve(null)
    }, QUEUE_WAIT_MS)

    socket.on('connect', () => {
      socket.emit('queue_join', {
        characterId: bot.characterId,
        userId: bot.userId,
        level: player.level || 1,
        name: player.name,
        isBot: true,
      })
    })

    socket.on('match_found', async (data) => {
      clearTimeout(timeout)
      logEvent('match_found', { characterId: bot.characterId, roomId: data.roomId })
      socket.disconnect()
      const result = await playMatch(socketUrl, data.roomId, player, bot.userId)
      resolve(result)
    })

    socket.on('disconnect', () => {
      /* wait for timeout or match */
    })
  })
}

/** Libera o bot de coleta/masmorra para poder ir ao PvP na hora. */
async function freeBotForPvp(bot) {
  try {
    const stop = await api('POST', '/api/gather/stop', bot.characterId, {
      characterId: bot.characterId,
      mode: 'now',
    })
    if (stop.ok) {
      logEvent('gather_cancel_for_pvp', { characterId: bot.characterId })
    }
  } catch {
    /* ignore */
  }

  try {
    const abd = await api('POST', '/api/dungeon/run/abandon', bot.characterId, {
      characterId: bot.characterId,
    })
    if (abd.ok && (abd.json?.abandoned ?? 0) > 0) {
      logEvent('dungeon_abandon_for_pvp', {
        characterId: bot.characterId,
        abandoned: abd.json.abandoned,
      })
    }
  } catch {
    /* ignore */
  }
}

async function runEcoBudget(bot, budgetSta) {
  let spent = 0
  const char0 = await getCharacter(bot.characterId)
  const staBefore = char0.stamina || 0

  // Gather: start session on ervas (drains over time via ticks)
  try {
    const start = await api('POST', '/api/gather/start', bot.characterId, {
      characterId: bot.characterId,
      fieldId: GATHER_FIELD,
    })
    logEvent('gather_start', { characterId: bot.characterId, ok: start.ok, status: start.status })
  } catch (e) {
    logEvent('gather_start_err', { characterId: bot.characterId, error: String(e) })
  }

  // Farm: well + harvest + plant attempts
  try {
    const state = await api(
      'GET',
      `/api/farm/state?characterId=${bot.characterId}`,
      bot.characterId
    )
    if (state.ok) {
      const well = await api('POST', '/api/farm/well-collect', bot.characterId, {
        characterId: bot.characterId,
      })
      logEvent('farm_well', { characterId: bot.characterId, ok: well.ok })

      const harvest = await api('POST', '/api/farm/harvest', bot.characterId, {
        characterId: bot.characterId,
      })
      logEvent('farm_harvest', { characterId: bot.characterId, ok: harvest.ok })

      // Plant first empty crop slot with erva if seeds exist
      const plots = state.json?.plots || state.json?.crops || []
      const empty = Array.isArray(plots) ? plots.find((p) => p.kind === 'crop' && !p.cropId && p.empty !== false) : null
      if (empty != null || (state.json && state.json.availableSlots > 0)) {
        const plant = await api('POST', '/api/farm/plant', bot.characterId, {
          characterId: bot.characterId,
          slotIndex: empty?.slotIndex ?? 0,
          cropId: 'erva',
        })
        logEvent('farm_plant', { characterId: bot.characterId, ok: plant.ok })
      }
    }
  } catch (e) {
    logEvent('farm_err', { characterId: bot.characterId, error: String(e) })
  }

  // Processar insumos comuns (água / extratos) antes de craftar poções
  try {
    const procInfo = await api(
      'GET',
      `/api/character/${bot.characterId}/process-item`,
      bot.characterId
    )
    if (procInfo.ok && Array.isArray(procInfo.json?.recipes)) {
      const tryIds = ['proc_agua_pura', 'proc_extrato_herbal', 'proc_essencia_mana', 'proc_extrato_raiz']
      for (const recipeId of tryIds) {
        const unlocked = procInfo.json.recipes.find((r) => r.id === recipeId && r.unlocked)
        if (!unlocked) continue
        const proc = await api(
          'POST',
          `/api/character/${bot.characterId}/process-item`,
          bot.characterId,
          { recipeId, quantity: 1 }
        )
        logEvent('process_item', { characterId: bot.characterId, recipeId, ok: proc.ok })
      }
    }
  } catch (e) {
    logEvent('process_err', { characterId: bot.characterId, error: String(e) })
  }

  // Craft potions: list recipes, try common ones
  try {
    const info = await api('GET', `/api/character/${bot.characterId}/craft-potion`, bot.characterId)
    if (info.ok && Array.isArray(info.json?.recipes)) {
      const unlocked = info.json.recipes.filter((r) => r.unlocked)
      for (const r of unlocked.slice(0, 4)) {
        const craft = await api('POST', `/api/character/${bot.characterId}/craft-potion`, bot.characterId, {
          recipeId: r.id,
          quantity: 1,
        })
        logEvent('craft_potion', {
          characterId: bot.characterId,
          recipeId: r.id,
          ok: craft.ok,
          status: craft.status,
        })
        if (craft.ok) break
      }
    }
  } catch (e) {
    logEvent('craft_err', { characterId: bot.characterId, error: String(e) })
  }

  // Sync gather / collect
  try {
    await api('GET', `/api/gather/status?characterId=${bot.characterId}`, bot.characterId)
    await api('POST', '/api/gather/collect', bot.characterId, { characterId: bot.characterId })
  } catch {
    /* ignore */
  }

  const char1 = await getCharacter(bot.characterId)
  spent = Math.max(0, staBefore - (char1.stamina || 0))

  // Se eco gastou pouco (gather é lento), marca o resto do budget como "transferível" ao PvP
  const remainingBudget = Math.max(0, budgetSta - spent)
  logEvent('sta_budget_eco', {
    characterId: bot.characterId,
    budgetSta,
    spent,
    remainingToPvp: remainingBudget,
  })
  return { spent, remainingToPvp: remainingBudget, char: char1 }
}

async function runPvpBudget(bot, budgetSta) {
  let spentApprox = 0
  while (spentApprox < budgetSta) {
    const char = await getCharacter(bot.characterId)
    if ((char.stamina || 0) < PVP_MIN_STA) break
    if (!char.isAlive) {
      await api('POST', `/api/character/${bot.characterId}/revive`, bot.characterId, {
        potionId: 'revival_potion',
      }).catch(() => null)
    }

    await freeBotForPvp(bot)

    const player = buildPlayerPayload(char, bot.userId)
    logEvent('queue_join', { characterId: bot.characterId, level: player.level })
    await sleep(jitter(200, 800))
    const result = await withQueueSlot(() => queueForMatch(SOCKET_URL, bot, player))
    if (!result) {
      // Sem humano — re-entra na fila (não sai pro eco).
      logEvent('queue_timeout_requeue', { characterId: bot.characterId })
      continue
    }
    const after = await getCharacter(bot.characterId)
    const delta = Math.max(0, (char.stamina || 0) - (after.stamina || 0))
    spentApprox += delta || 10
    await sleep(jitter(1500, 3500))
  }
  return spentApprox
}

async function botLoop(bot) {
  console.log(`[${bot.name}] loop start (pvp-standby${ENABLE_ECO ? '+eco' : ''})`)
  for (;;) {
    try {
      let char = await getCharacter(bot.characterId)
      const sta = char.stamina || 0
      if (sta < PVP_MIN_STA) {
        logEvent('idle_regen', { characterId: bot.characterId, stamina: sta })
        await sleep(60_000)
        continue
      }

      logEvent('sta_budget', { characterId: bot.characterId, stamina: sta, pvp: sta, eco: ENABLE_ECO ? Math.floor(sta / 4) : 0 })

      // Standby PvP: fica na fila até achar humano (bot↔bot é bloqueado no socket).
      await runPvpBudget(bot, sta)

      if (ENABLE_ECO) {
        char = await getCharacter(bot.characterId)
        const ecoBudget = Math.min(Math.floor(sta / 4), Math.max(0, (char.stamina || 0) - PVP_MIN_STA))
        if (ecoBudget > 0) {
          await runEcoBudget(bot, ecoBudget)
        }
      }

      logEvent('cycle_done', { characterId: bot.characterId })
      await sleep(jitter(2000, 5000))
    } catch (e) {
      console.error(`[${bot.name}] error`, e)
      logEvent('bot_error', { characterId: bot.characterId, error: String(e) })
      await sleep(15000)
    }
  }
}

async function main() {
  if (!fs.existsSync(REGISTRY_PATH)) {
    console.error(`Registry missing: ${REGISTRY_PATH} — run bot-fleet-seed.ts first`)
    process.exit(1)
  }
  const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'))
  const bots = registry.bots || []
  console.log(`Starting ${bots.length} bots → ${APP_URL} / ${SOCKET_URL}`)
  console.log(`Events → ${LOG_PATH}`)

  // Stagger starts so matchmaking pairs naturally
  await Promise.all(
    bots.map(async (bot, i) => {
      await sleep(i * 1500)
      return botLoop(bot)
    })
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
