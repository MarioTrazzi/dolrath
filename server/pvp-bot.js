// 🤖 BOTS DE PVP (lançamento) — oponentes efêmeros que garantem partida imediata.
// Dois fluxos: FILLER (entra na sala do jogador se ninguém aparecer em alguns
// segundos) e SEEDING (mantém salas com bot aguardando no lobby). O bot é um
// cliente Socket.IO real (mesmo padrão do training-bot) e luta pelos handlers
// normais do PvP — recompensas fluem porque a sala NÃO é de treino.
//
// Feature flag: tudo aqui é inerte com PVP_BOTS_ENABLED != 'true'.

const { io } = require('socket.io-client')

// ============================================================
// Flags de ambiente (default: desligado)
// ============================================================

const PVP_BOTS_ENABLED = process.env.PVP_BOTS_ENABLED === 'true'
const FILL_DELAY_MS = Math.max(1000, Number(process.env.PVP_BOT_FILL_DELAY_MS) || 20000)
const SEED_ROOMS = Math.max(0, Number(process.env.PVP_BOT_SEED_ROOMS) || 2)
// Base do Next.js (catálogo de salas do lobby: /api/combat/rooms)
const APP_URL = process.env.PVP_BOT_APP_URL || 'http://localhost:3000'

// ============================================================
// Identidade do bot
// ============================================================

const BOT_PREFIX = 'bot_'
function isBotId(id) {
  return typeof id === 'string' && id.startsWith(BOT_PREFIX)
}

// Classes EN (ids de src/lib/gameData.ts) — normalizeClass do socket aceita ambas.
const BOT_CLASSES = ['warrior', 'rogue', 'mage', 'monk']

// Nó tier-2 do caminho primário de cada classe (server/skillTree.js: CLASS_PREFIX ×
// CLASS_ROLES.primary) — o ÚNICO nó comprado do bot: libera o Ataque de Classe
// (d8, 8 MP) sem dar stun/buff/ranks de graça.
const CLASS_ATTACK_NODE = { warrior: 'wr-str-2', rogue: 'rg-agi-2', mage: 'mg-int-2', monk: 'mk-agi-2' }
function classAttackNodeId(cls) {
  return CLASS_ATTACK_NODE[cls] || CLASS_ATTACK_NODE.warrior
}

// Sorteia uma classe ≠ excludeClass (para o jogador testar o PvP contra outra classe).
function pickBotClass(excludeClass) {
  const pool = BOT_CLASSES.filter((c) => c !== excludeClass)
  return pool[Math.floor(Math.random() * pool.length)]
}

// Comportamento por classe: pesos de ataque (Golpe/Ataque de Classe) + chance de
// esquivar na reação (senão bloqueia). Guerreiro prefere bloquear; ladino, esquivar.
const CLASS_BEHAVIOR = {
  warrior: { attackWeights: { light_attack: 2, heavy_attack: 3 }, dodgeChance: 0.25 },
  rogue: { attackWeights: { light_attack: 3, heavy_attack: 2 }, dodgeChance: 0.8 },
  mage: { attackWeights: { light_attack: 2, heavy_attack: 3 }, dodgeChance: 0.5 },
  monk: { attackWeights: { light_attack: 3, heavy_attack: 3 }, dodgeChance: 0.65 },
}

// Nomes plausíveis, sem tag de bot (a proposta é parecer PvP de verdade).
const BOT_NAMES = {
  warrior: ['Tarok', 'Brunhild', 'Kaelen', 'Ragnar', 'Sigrun', 'Dorn'],
  rogue: ['Vesper', 'Lira', 'Corvo', 'Nyx', 'Sable', 'Fen'],
  mage: ['Aldric', 'Morgana', 'Zephyr', 'Isolde', 'Thalion', 'Vex'],
  monk: ['Kenji', 'Amara', 'Bodhi', 'Suren', 'Taro', 'Mei'],
}
const BOT_RACES = ['Humano', 'Draconiano', 'Metamorfo', 'Elfo']

function randomOf(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

let botSeq = 0
// persona: { class?, excludeClass?, level, gearTier, maxMp?, maxStamina? }
function buildPersona(opts = {}) {
  const cls = opts.class || pickBotClass(opts.excludeClass)
  return {
    class: cls,
    name: randomOf(BOT_NAMES[cls] || BOT_NAMES.warrior),
    race: randomOf(BOT_RACES),
    level: Math.max(1, Number(opts.level) || 1),
    gearTier: Number.isFinite(Number(opts.gearTier)) ? Number(opts.gearTier) : 0,
    maxMp: Math.max(1, Number(opts.maxMp) || 100),
    maxStamina: Math.max(1, Number(opts.maxStamina) || 100),
    behavior: CLASS_BEHAVIOR[cls] || CLASS_BEHAVIOR.warrior,
  }
}

// Persona já casada com um jogador humano (filler): mesmo nível/gear, classe ≠.
function buildPersonaFor(human) {
  const humanCls = String(human?.combatClass || human?.class || '').toLowerCase()
  return buildPersona({
    excludeClass: BOT_CLASSES.includes(humanCls) ? humanCls : undefined,
    level: human?.level,
    gearTier: human?.gearTier,
    maxMp: human?.maxMp,
    maxStamina: human?.maxStamina,
  })
}

// Snapshot enviado no join_room. O servidor recomputa os levers (poder/armadura/
// hp/evasão) a partir de classe+nível+gearTier no próprio join, então só o que
// está marcado importa; stats crus são plausíveis mas ignorados p/ classe conhecida.
function buildBotPlayer(persona) {
  botSeq += 1
  return {
    id: `${BOT_PREFIX}${persona.class}_${Date.now()}_${botSeq}`,
    name: persona.name,
    level: persona.level,
    race: persona.race,
    class: persona.class,
    hp: 100,
    maxHp: 100, // sobrescrito pelos levers no join
    mp: persona.maxMp,
    maxMp: persona.maxMp,
    stamina: persona.maxStamina,
    maxStamina: persona.maxStamina,
    attack: 10,
    defense: 10,
    strength: 10,
    agility: 10,
    intelligence: 10,
    resistance: 8,
    critical: 1.0,
    speed: 2.5,
    experience: 0, // perde empates de iniciativa para o jogador (padrão training-bot)
    equipment: [], // sem peças reais — o tier vem do override abaixo
    gearTierOverride: persona.gearTier, // lido por derivePlayerLevers (só p/ ids bot_)
    skillTree: { purchased: [classAttackNodeId(persona.class)] },
    avatar: null,
    equipmentMap: {},
    isReady: false,
    isConnected: true,
    isAlive: true,
  }
}

// ============================================================
// Custos do kit v1 (paridade com o cliente humano em combat/page.tsx)
// ============================================================

const ATTACKS = {
  light_attack: { dice: 6, mp: 0, stamina: 1 }, // Golpe
  heavy_attack: { dice: 8, mp: 8, stamina: 2 }, // Ataque de Classe
}
const REACTION_STAMINA = 3 // esquiva E bloqueio custam 3 (STAMINA_COSTS do cliente)

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

// ============================================================
// Bot: conecta na própria porta e joga a sala como um cliente PvP
// ============================================================

function spawnPvpBot({ roomId, port, persona, isCreator = false, onEnd }) {
  const bot = buildBotPlayer(persona)
  const behavior = persona.behavior || CLASS_BEHAVIOR.warrior

  const socket = io(`http://localhost:${port}`, {
    transports: ['websocket'],
    reconnection: false,
  })

  const log = (msg) => console.log(`🤖 [pvp-bot:${roomId}] ${bot.name} (${bot.class}): ${msg}`)

  let isReady = false
  let rolledInitiative = false
  let rolledDice = false
  let lastPhase = null
  let finished = false
  let lastActionSent = null

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
    if (typeof onEnd === 'function') {
      try { onEnd(reason) } catch (e) { console.error('🤖 onEnd falhou:', e.message) }
    }
  }

  // Trava de segurança: bot nunca vive mais que 30 minutos
  after(30 * 60 * 1000, () => shutdown('tempo máximo'))

  const sendAttack = (action) => {
    const spec = ATTACKS[action] || ATTACKS.light_attack
    lastActionSent = action
    log(`atacando: ${action}`)
    socket.emit('player_action', {
      playerId: bot.id,
      roomId,
      action,
      diceType: spec.dice,
      mpCost: spec.mp,
      staminaCost: spec.stamina,
    })
  }

  socket.on('connect', () => {
    log(isCreator ? 'criando arena e aguardando oponente' : 'entrando na arena')
    socket.emit('join_room', { roomId, player: bot, isCreator, role: 'fighter' })
  })

  socket.on('connect_error', (err) => {
    console.error(`🤖 [pvp-bot:${roomId}] erro de conexão:`, err.message)
    shutdown('erro de conexão')
  })

  socket.on('room_closed', () => shutdown('sala fechada'))
  socket.on('disconnect', () => shutdown('desconectado'))
  socket.on('join_room_error', ({ error }) => shutdown(`join recusado: ${error}`))

  // Anti soft-lock: se o servidor recusar a ação (ex.: MP dessincronizado),
  // cair para o Golpe (0 MP) em vez de travar a luta.
  socket.on('error', (err) => {
    if (finished) return
    log(`erro do servidor: ${err?.message || err}`)
    if (lastActionSent && lastActionSent !== 'light_attack') {
      after(randomDelay(800, 1500), () => sendAttack('light_attack'))
    }
  })

  socket.on('room_updated', (room) => {
    if (finished || !room) return

    const phaseChanged = room.phase !== lastPhase
    lastPhase = room.phase

    const fighters = room.participants?.fighters || []
    const me = room.player1?.id === bot.id ? room.player1 : room.player2?.id === bot.id ? room.player2 : null

    // Sozinho na sala (jogador saiu) → encerrar para a sala ser limpa/reposta
    if (fighters.length === 1 && fighters[0]?.id === bot.id && room.phase !== 'waiting_players') {
      return shutdown('oponente saiu')
    }
    if (isCreator && fighters.length === 1 && room.phase === 'waiting_players' && me && me.isReady) {
      // reset defensivo (não deveria acontecer): sala voltou a esperar sozinha
      isReady = false
    }
    if (!me) return

    switch (room.phase) {
      case 'waiting_players': {
        const both = room.player1 && room.player2
        if (both && !isReady) {
          isReady = true
          after(randomDelay(1500, 3000), () => {
            log('pronto para lutar')
            socket.emit('toggle_ready', { playerId: bot.id, roomId })
          })
        }
        break
      }

      case 'initiative_roll': {
        if (!rolledInitiative) {
          rolledInitiative = true
          after(randomDelay(1500, 3000), () => {
            log('rolando iniciativa')
            socket.emit('roll_initiative', { playerId: bot.id, roomId })
          })
        }
        break
      }

      case 'player_turn': {
        rolledDice = false
        if (room.currentTurn === bot.id && phaseChanged) {
          after(randomDelay(2000, 3500), () => {
            // Ataque de Classe exige 8 MP; sem MP, Golpe (0 MP) sempre disponível
            const weights = { ...behavior.attackWeights }
            if ((me.mp || 0) < ATTACKS.heavy_attack.mp) weights.heavy_attack = 0
            sendAttack(pickWeighted(weights))
          })
        }
        break
      }

      case 'opponent_reaction': {
        if (room.currentTurn !== bot.id && phaseChanged) {
          after(randomDelay(1500, 2800), () => {
            const reaction = Math.random() < behavior.dodgeChance ? 'dodge' : 'defend'
            log(`defendendo: ${reaction}`)
            socket.emit('opponent_reaction', {
              playerId: bot.id,
              roomId,
              reaction,
              staminaCost: REACTION_STAMINA,
            })
          })
        }
        break
      }

      case 'dice_roll': {
        if (room.pendingAction && !rolledDice) {
          rolledDice = true
          after(randomDelay(1800, 3200), () => {
            log(`rolando d${room.pendingAction.diceType}`)
            socket.emit('roll_dice', {
              playerId: bot.id,
              roomId,
              sides: room.pendingAction.diceType,
              action: room.pendingAction.action,
            })
          })
        }
        break
      }

      case 'combat_end': {
        const won = room.winner === bot.id
        log(won ? 'venceu a luta!' : 'foi derrotado!')
        // Dar tempo do jogador ver o resultado (e o cliente reivindicar a recompensa)
        after(15000, () => shutdown('combate encerrado'))
        break
      }
    }
  })

  return { botId: bot.id, shutdown }
}

// ============================================================
// FILLER: timer por sala — bot entra se ninguém aparecer
// ============================================================

const fillTimers = new Map() // roomId -> timeout

function scheduleFillBot(roomId, spawnFn) {
  if (!PVP_BOTS_ENABLED) return
  cancelFillBot(roomId)
  const t = setTimeout(() => {
    fillTimers.delete(roomId)
    try { spawnFn() } catch (e) { console.error(`🤖 filler ${roomId} falhou:`, e.message) }
  }, FILL_DELAY_MS)
  fillTimers.set(roomId, t)
}

function cancelFillBot(roomId) {
  const t = fillTimers.get(roomId)
  if (t) {
    clearTimeout(t)
    fillTimers.delete(roomId)
  }
}

// ============================================================
// Cliente do catálogo do lobby (/api/combat/rooms no Next)
// Best-effort: o catálogo é cosmético (lista do lobby); falhas não podem
// derrubar o bot nem o socket-server.
// ============================================================

async function catalogGet() {
  try {
    const res = await fetch(`${APP_URL}/api/combat/rooms`)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

async function catalogPost(body) {
  try {
    const res = await fetch(`${APP_URL}/api/combat/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

async function catalogPatch(id, patch) {
  if (!PVP_BOTS_ENABLED) return
  try {
    await fetch(`${APP_URL}/api/combat/rooms`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...patch }),
    })
  } catch {
    /* cosmético — o lobby se corrige no próximo ciclo */
  }
}

// ============================================================
// SEEDING: mantém PVP_BOT_SEED_ROOMS salas com bot aguardando no lobby
// ============================================================

function startSeeding({ port, getRooms }) {
  if (!PVP_BOTS_ENABLED || SEED_ROOMS <= 0) return

  // Salas semeadas por ESTE processo: catalogId -> { botId, spawnedAt }
  const seeded = new Map()
  let reconciling = false

  async function spawnSeedRoom() {
    // Nível/gear iniciais são só um chute plausível — o rescale no join do humano
    // (rescaleBotToOpponent no socket-server) iguala nível/gear e garante classe ≠.
    const persona = buildPersona({ level: 2 + Math.floor(Math.random() * 5), gearTier: 0.1 })
    const preview = buildBotPlayer(persona)
    const cat = await catalogPost({
      name: `Arena de ${persona.name}`,
      isPrivate: false,
      createdBy: preview.id,
      createdByName: persona.name,
    })
    if (!cat || !cat.id) {
      console.log('🤖 seeding: catálogo indisponível, tentando no próximo ciclo')
      return false
    }
    const entry = { spawnedAt: Date.now(), handle: null }
    seeded.set(cat.id, entry)
    // O bot cria a sala no socket-server com o MESMO id do catálogo (o lobby
    // navega para /combat?room=<id> e o join_room cria/acha a sala por id).
    entry.handle = spawnPvpBot({
      roomId: cat.id,
      port,
      persona,
      isCreator: true,
      onEnd: () => {
        seeded.delete(cat.id)
        catalogPatch(cat.id, { status: 'finished' })
        setTimeout(() => reconcile(), 3000)
      },
    })
    console.log(`🤖 seeding: sala ${cat.id} criada ("Arena de ${persona.name}")`)
    return true
  }

  async function reconcile() {
    if (reconciling || SEED_ROOMS <= 0) return
    reconciling = true
    try {
      const catalog = await catalogGet()
      if (!catalog) return // Next fora do ar — tenta no próximo ciclo
      const internal = getRooms()

      // Ghost-cleanup: entradas de bot "waiting" no catálogo cuja sala não existe
      // no socket-server (ex.: socket-server reiniciou) → marcar finished.
      for (const r of catalog) {
        if (!isBotId(r.createdBy) || r.status !== 'waiting') continue
        const mine = seeded.get(r.id)
        const stillConnecting = mine && Date.now() - mine.spawnedAt < 15000
        if (!internal.has(r.id) && !stillConnecting) {
          seeded.delete(r.id)
          await catalogPatch(r.id, { status: 'finished' })
          console.log(`🤖 seeding: sala fantasma ${r.id} finalizada no catálogo`)
        }
      }

      // Recuperação inversa: a sala segue viva aguardando no socket-server, mas o
      // catálogo perdeu a entrada (deploy/reinício do Next zera a memória da rota).
      // Sala invisível no lobby não serve — derrubar o bot e semear de novo.
      for (const [id, info] of seeded) {
        const room = internal.get(id)
        const inCatalog = catalog.some((r) => r.id === id)
        const fighterCount = room?.participants?.fighters?.length || 0
        if (room && !inCatalog && room.phase === 'waiting_players' && fighterCount <= 1) {
          console.log(`🤖 seeding: catálogo perdeu a sala ${id} — reciclando o bot`)
          seeded.delete(id)
          if (info.handle) info.handle.shutdown('entrada do catálogo perdida')
        }
      }

      // Contar salas semeadas ainda AGUARDANDO oponente (as em luta não contam:
      // a vaga do lobby já foi consumida e será reposta aqui).
      let waiting = 0
      for (const [id, info] of seeded) {
        const room = internal.get(id)
        if (room) {
          const fighterCount = room.participants?.fighters?.length || 0
          if (room.phase === 'waiting_players' && fighterCount <= 1) waiting++
        } else if (Date.now() - info.spawnedAt < 15000) {
          waiting++ // bot ainda conectando
        } else {
          seeded.delete(id) // sala morreu sem onEnd (não deveria) — repor
        }
      }

      while (waiting < SEED_ROOMS) {
        const ok = await spawnSeedRoom()
        if (!ok) break
        waiting++
      }
    } catch (e) {
      console.error('🤖 seeding: reconcile falhou:', e.message)
    } finally {
      reconciling = false
    }
  }

  // Boot com retry curto (Next pode subir depois do socket) + ciclo de 45s.
  setTimeout(() => reconcile(), 5000)
  setInterval(() => reconcile(), 45000)
  console.log(`🤖 PvP bots LIGADOS: seeding de ${SEED_ROOMS} sala(s), filler em ${FILL_DELAY_MS}ms (catálogo: ${APP_URL})`)
}

module.exports = {
  PVP_BOTS_ENABLED,
  isBotId,
  pickBotClass,
  classAttackNodeId,
  buildPersona,
  buildPersonaFor,
  buildBotPlayer,
  spawnPvpBot,
  scheduleFillBot,
  cancelFillBot,
  catalogPatch,
  startSeeding,
}
