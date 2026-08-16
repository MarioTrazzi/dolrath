const { createServer } = require('http')
const { Server } = require('socket.io')

// Importar sistema de stamina (versão local JavaScript)
const { getStaminaCost, checkStaminaLevel, calculateStaminaRegeneration } = require('./staminaSystem')

// 🐉 Modo treino - bot monstro que joga pelas regras do PvP
const { spawnTrainingBot, MONSTERS, DEFAULT_TRAINING_OPPONENT_KEY } = require('./training-bot')

// ⚔️ Oponente de PvP: se a fila não achar humano em PVP_BOT_FILL_MS, o servidor cria
// um oponente espelho e joga o jogador direto numa sala com ele.
const { buildQueuePersona, refinePersonaFor, buildBotPlayer, spawnPvpBot } = require('./pvp-bot')

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
// 🎯 AJUSTE DE CLASSE DO PvP — recalibrado em 2026-08-14 e agora uma CURVA POR NÍVEL.
//   Ferramenta: scripts/pvp-band-balance-sim.js (--tune --identity --band=<faixa>).
//
// Por que mudou: o balance anterior media com `scripts/pvp-lever-sim.js`, que ficou
// DEFASADO em dois pontos ao mesmo tempo — (1) modela defesa por REAÇÃO (dodge/block
// gastando stamina) e o PvP ao vivo resolve tudo em `defense: 'passive'`; (2) usa
// `levers.hp` como barra de vida, e a barra real sai de `fightHpPool` (ficha + gear).
// Medido com o motor de verdade, o spread entre classes era de 30-50 pontos percentuais.
// Confirmado em LUTAS REAIS neste socket: Guerreiro 30.6% · Ladino 62.5% · Mago 40.3% ·
// Monge 66.7% no nv50.
//
// Por que uma CURVA e não uma constante: o desequilíbrio ESCALA COM O NÍVEL e chega a
// inverter de sinal. Em defesa passiva a esquiva é um anulador multiplicativo que cresce
// linear com AGI, e o Ladino ainda converte AGI em dano a 1.6× (dupla contagem), enquanto
// a DEF do Guerreiro vira armadura contra a curva de retorno decrescente
// DR = armor/(armor+K). Resultado sem ajuste nenhum: Guerreiro 48.8% no nv3 → 21.7% no
// nv50; Ladino 41.4% → 65.8%. Nenhum multiplicador fixo conserta os dois extremos ao
// mesmo tempo — tunar pelo agregado só move o problema de faixa (o Guerreiro virava 69%
// no nv3 e 34% no nv50).
//
// Âncoras nos níveis 1/22/50, interpoladas linearmente. Cada classe é corrigida pela
// PRÓPRIA fantasia: Guerreiro por HP (tanque), Mago por PODER (canhão de vidro), Ladino
// cede poder conforme sobe, Monge leva um corte quase plano (era o dominante em todas as
// faixas). ⚠️ Mexeu aqui? Rode o sim nas TRÊS faixas — um número que conserta o nv50
// costuma quebrar o nv3.
// Tunado sobre DOIS cenários ao mesmo tempo ("kit cheio" com transformação + HP de gear,
// e "nu" sem nenhum dos dois): otimizar só o kit cheio deixava ~14pp de spread para quem
// ainda não desbloqueou a forma — e foi isso que as lutas reais flagraram.
const PVP_ADJ_LEVELS = [1, 22, 50]
const PVP_CLASS_ADJ_CURVE = {
  warrior: { power: [1.00, 1.00, 1.00], armor: [1.00, 1.00, 1.00], hp: [1.01, 1.14, 1.25] },
  rogue:   { power: [1.07, 0.97, 0.91], armor: [1.00, 1.00, 1.00], hp: [1.00, 1.00, 1.00] },
  mage:    { power: [1.18, 1.06, 1.07], armor: [1.00, 1.00, 1.00], hp: [1.00, 1.00, 1.00] },
  monk:    { power: [0.92, 0.94, 0.95], armor: [1.00, 1.00, 1.00], hp: [0.92, 0.94, 0.95] },
}

/** Interpola a âncora de um knob no nível do lutador (linear entre os pontos). */
function pvpAdjAt(cls, knob, level) {
  const curve = PVP_CLASS_ADJ_CURVE[cls]
  if (!curve) return 1
  const pts = curve[knob]
  const L = Math.max(1, Number(level) || 1)
  if (L <= PVP_ADJ_LEVELS[0]) return pts[0]
  for (let i = 1; i < PVP_ADJ_LEVELS.length; i++) {
    if (L <= PVP_ADJ_LEVELS[i]) {
      const t = (L - PVP_ADJ_LEVELS[i - 1]) / (PVP_ADJ_LEVELS[i] - PVP_ADJ_LEVELS[i - 1])
      return pts[i - 1] + (pts[i] - pts[i - 1]) * t
    }
  }
  return pts[pts.length - 1] // acima do nível de referência: segura o último valor
}
function applyPvpClassAdj(levers, cls, level) {
  if (!PVP_CLASS_ADJ_CURVE[cls]) return levers
  return {
    ...levers,
    power: levers.power * pvpAdjAt(cls, 'power', level),
    armor: levers.armor * pvpAdjAt(cls, 'armor', level),
  }
}

/**
 * Fator de HP da classe no PvP. ⚠️ `levers.hp` é calculado e NUNCA LIDO: a barra da luta
 * sai de `fightHpPool` (ficha + gear), não dos levers. Ou seja, o `hp` do PVP_CLASS_ADJ
 * era um botão MORTO — o "+18% de HP do Ladino" da passada de balance anterior nunca
 * chegou a existir em produção. Aqui ele passa a valer, aplicado onde a barra realmente
 * nasce. Só PvP: a masmorra usa src/lib/combatModel.ts e não passa por aqui.
 */
function pvpClassHpMult(cls, level) {
  return pvpAdjAt(cls, 'hp', level)
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

// `gearTierOverride` existe só para o TREINO: o peer espelha o gearTier REAL do humano
// em vez de derivar de um equipamento sintético (ver trainingOpponents). O caller é quem
// gateia por room.isTraining — nunca aceite este valor do payload em sala ranqueada.
function derivePlayerLevers(player, gearTierOverride) {
  const cls = normalizeClass(player.class)
  const level = Math.max(1, Number(player.level) || 1)
  const equipped = Array.isArray(player.equipment)
    ? player.equipment.map((e) => ({ rarity: e?.item?.rarity ?? e?.rarity, enhancementLevel: e?.enhancementLevel }))
    : []
  const gearTier = gearTierOverride != null ? gearTierOverride : CM.deriveGearTier(equipped)
  const attrs = readAttrs(player)

  if (cls) {
    const levers = applyPvpClassAdj(CM.computeLevers(cls, level, gearTier, attrs), cls, level)
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

/**
 * Teto por uso de consumível NA LUTA. O `item` do evento `use_consumable` vem do
 * cliente; estes números são os do catálogo (src/app/api/inventory/use-item: Poção de
 * Stamina 50, Vida 50, Mana 30) com folga para pratos/receitas melhores.
 */
const MAX_CONSUMABLE_RESTORE = { hp: 200, mp: 120, stamina: 60 }

/**
 * ⚡ A BARRA DE STAMINA DA LUTA É DA LUTA (2026-08-14). Ela nasce CHEIA (`maxStamina`),
 * paga os golpes e regenera +2/turno — e não debita mais nada no banco. A carteira paga
 * uma TAXA FIXA por luta (PVP_FIGHT_STAMINA, cobrada em /api/battle/rewards), que é o
 * que fixa a arena em 10 lutas por dia.
 *
 * O modelo antigo — barra = carteira, cobrança = stamina gasta — tinha três defeitos:
 * o número de lutas/dia dependia do tamanho das lutas (14/dia no nv1, 8/dia no nv50),
 * quem chegava com o saldo raspando lutava com meia barra, e a contabilidade do gasto
 * (fightStaminaSpent/fightStaminaBudget) precisava de teto, clamp e reconciliação de
 * poção só para não pagar o oponente honesto a menos. Tudo isso saiu junto.
 */
function resetFightStamina(player) {
  if (!player) return
  player.stamina = player.maxStamina || player.stamina || 100
}

/** Multiplicador de aprimoramento (espelho leve de enhancementSystem.getStatMultiplier). */
function enhancementStatMult(level) {
  const lvl = Math.max(0, Math.floor(Number(level) || 0))
  if (lvl <= 0) return 1
  if (lvl <= 15) return 1 + lvl * 0.05
  const TIER = { 16: 2.0, 17: 2.2, 18: 2.45, 19: 2.8, 20: 3.3 }
  return TIER[lvl] != null ? TIER[lvl] : 2.8
}

/**
 * HP extra do equipamento (igual PvE / DungeonRun.equipmentPower.hp).
 * Peça quebrada (durability <= 0) não soma.
 */
function sumEquipmentHp(equipment) {
  if (!Array.isArray(equipment)) return 0
  let hp = 0
  for (const eq of equipment) {
    if (eq == null) continue
    if (eq.durability != null && Number(eq.durability) <= 0) continue
    const stats = (eq.item && eq.item.stats) || eq.stats || {}
    const base = Number(stats.hp) || 0
    if (base <= 0) continue
    hp += base * enhancementStatMult(eq.enhancementLevel)
  }
  return Math.round(hp)
}

/**
 * Pool de vida da luta = ficha (maxHp do personagem) + HP do gear × passiva.
 * Igual ao PvE — NÃO usar levers.hp (isso gerava barras tipo 36/36).
 * Levers continuam mandando em dano/armadura/esquiva.
 */
function fightHpPool(player, maxHpPct) {
  const sheet = Math.max(1, Number(player.maxHp) || Number(player.hp) || 1)
  const gearHp = sumEquipmentHp(player.equipment)
  const pct = Number(maxHpPct) || 0
  return Math.max(1, Math.round((sheet + gearHp) * (1 + pct)))
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
  // 🔁 REVANCHE NA MESMA SALA (os dois voltam a ficar prontos): é uma luta NOVA, então
  // a carteira precisa ser reconsultada — a taxa da luta anterior já saiu de lá e o
  // portão do toggle_ready estava julgando com o saldo velho.
  if (!room.isTraining) {
    for (const p of [room.player1, room.player2]) {
      if (!p || isServerBotId(room, p.id) || String(p.id).startsWith('bot_')) continue
      p.staminaVerified = false
      verifyFighterState(roomId, p.id)
    }
  }
  // A luta acabou: nenhum relógio de abandono/inatividade deve continuar armado.
  clearRoomGraceTimers(roomId)
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
  maybeScheduleTrainingBot(room, roomId)
  scheduleTurnIdle(room, roomId)
}

/**
 * Timers do fallback de turno do bot, POR SALA — fora do objeto `room`, que é enviado
 * inteiro no `room_updated` (ver o comentário em maybeScheduleTrainingBot).
 */
const botTurnTimers = new Map() // roomId -> Timeout

function clearBotTurnTimer(roomId) {
  const t = botTurnTimers.get(roomId)
  if (t) {
    clearTimeout(t)
    botTurnTimers.delete(roomId)
  }
}

/**
 * ⏳ Carência de reconexão, POR SALA+JOGADOR — pelo mesmo motivo de botTurnTimers: um
 * Timeout do Node guardado dentro de `room` derrubava o processo inteiro ("Maximum call
 * stack size exceeded"), porque a `room` é serializada inteira em todo `room_updated` e
 * o Timeout carrega a lista circular `_idlePrev/_idleNext`.
 */
const disconnectGraceTimers = new Map() // `${roomId}:${playerId}` -> Timeout
const DISCONNECT_GRACE_MS = Math.max(5000, Number(process.env.PVP_DISCONNECT_GRACE_MS) || 30000)

function clearDisconnectGrace(roomId, playerId) {
  const key = `${roomId}:${playerId}`
  const t = disconnectGraceTimers.get(key)
  if (t) {
    clearTimeout(t)
    disconnectGraceTimers.delete(key)
  }
}

function clearRoomGraceTimers(roomId) {
  for (const key of [...disconnectGraceTimers.keys()]) {
    if (key.startsWith(`${roomId}:`)) {
      clearTimeout(disconnectGraceTimers.get(key))
      disconnectGraceTimers.delete(key)
    }
  }
  clearTurnIdleTimer(roomId)
}

/**
 * ⏱️ Timer de INATIVIDADE de turno, por sala. Fecha a última porta de fuga grátis: o
 * disconnect tem carência, mas quem fica CONECTADO e simplesmente não joga (aba em
 * segundo plano, cliente travado, ou de propósito para não pagar a stamina) pendurava a
 * luta para sempre — não existia timer de turno nenhum no servidor.
 * Mesmo Map de módulo dos outros timers: nunca dentro de `room`.
 */
const turnIdleTimers = new Map() // roomId -> Timeout
// Piso baixo só para os testes de integração conseguirem exercitar o caminho; em
// produção o valor é o default de 90s (folgado para uma jogada humana com reflexão).
const TURN_IDLE_MS = Math.max(3000, Number(process.env.PVP_TURN_IDLE_MS) || 90000)

function clearTurnIdleTimer(roomId) {
  const t = turnIdleTimers.get(roomId)
  if (t) {
    clearTimeout(t)
    turnIdleTimers.delete(roomId)
  }
}

/** Rearma o relógio de inatividade para o turno atual. */
function scheduleTurnIdle(room, roomId) {
  clearTurnIdleTimer(roomId)
  if (!isFightLive(room) || room.isTraining) return
  const whose = room.currentTurn
  if (!whose || isServerBotId(room, whose)) return // bot tem o próprio fallback
  turnIdleTimers.set(roomId, setTimeout(() => {
    turnIdleTimers.delete(roomId)
    const live = rooms.get(roomId)
    if (!live || !isFightLive(live) || live.currentTurn !== whose) return
    const idle = live.player1?.id === whose ? live.player1 : live.player2
    live.combatLog.push({
      type: 'system',
      message: `⏱️ ${idle?.name} ficou sem agir por ${Math.round(TURN_IDLE_MS / 1000)}s — derrota por inatividade.`,
      timestamp: new Date(),
    })
    forfeitFight(live, roomId, whose, 'inatividade')
  }, TURN_IDLE_MS))
}

/** A luta está valendo? (usado pelos caminhos de abandono) */
function isFightLive(room) {
  return !!room?.isActive
    && room.phase !== CombatPhase.WAITING_PLAYERS
    && room.phase !== CombatPhase.COMBAT_END
}

/**
 * Abandono (desistência, carência estourada, sala fechada pelo criador). Marca a sala
 * para o `processBattleRewards` saber que não é vitória impecável e declara o vencedor —
 * que já cai no fluxo normal de recompensas. Antes disso, largar a luta não custava
 * NADA: nem stamina cobrada, nem recompensa para quem ficou.
 */
function forfeitFight(room, roomId, quitterId, reason) {
  if (!isFightLive(room)) return false
  const quitter = room.player1?.id === quitterId ? room.player1
    : room.player2?.id === quitterId ? room.player2
      : null
  const opponent = room.player1?.id === quitterId ? room.player2 : room.player1
  if (!quitter || !opponent) return false

  room.forfeit = { by: quitterId, reason }
  declareWinner(room, opponent, quitter, roomId, reason)
  return true
}

/**
 * Lutador controlado pelo servidor: monstro do treino (`monster_`, ver training-bot.js)
 * ou o oponente de PvP desta sala (`room.botFighterId`, gerado em join_room).
 */
function isServerBotId(room, id) {
  if (typeof id !== 'string') return false
  return id.startsWith('monster_') || id === room?.botFighterId
}

// ─────────────────────────────────────────────────────────────────────────────
// ⚡ STAMINA AUTORITATIVA
//
// Este processo não tem Prisma. Até aqui o `player.stamina` da luta vinha do PAYLOAD DO
// CLIENTE — e o lobby caía em `details.stamina || 100`, que transformava um herói zerado
// em tanque cheio. A luta inteira rodava nesse orçamento fictício e só no fim a rota de
// recompensas clampava a cobrança pelo saldo real, o que subpagava o oponente HONESTO
// (o pool é a soma dos dois lados).
//
// A verificação é DEPOIS do join, de propósito. Um `await` dentro do join_room não é
// viável: aquele handler cria a sala, atribui player1/player2, consome pendingBotFills e
// marca botSpawned — tudo em check-then-act sem lock nenhum. Um await no meio deixaria
// um segundo join (refresh, o oponente, o bot que nasce 1s depois) interleavar e
// duplicar lutador/bot. Como a luta só começa no `toggle_ready`, a verificação sempre
// ganha a corrida do clique humano — e o `toggle_ready` a espera de qualquer jeito.
// ─────────────────────────────────────────────────────────────────────────────

/** Verificações em voo, por sala+jogador. Fora do `room` (serializado em todo emit). */
const fighterVerifications = new Set() // `${roomId}:${playerId}`

const APP_URL = (process.env.APP_URL || process.env.NEXTAUTH_URL || 'https://dolrath.vercel.app').replace(/\/$/, '')
const FIGHTER_STATE_TIMEOUT_MS = 3000

/** Chama /api/battle/fighter-state. Devolve null em qualquer falha (fail-open). */
async function fetchFighterState(characterIds) {
  const secret = process.env.BATTLE_REWARDS_SECRET || ''
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FIGHTER_STATE_TIMEOUT_MS)
  try {
    const res = await fetch(`${APP_URL}/api/battle/fighter-state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(secret ? { 'x-battle-secret': secret } : {}) },
      body: JSON.stringify({ characterIds }),
      signal: controller.signal,
    })
    if (!res.ok) {
      console.error(`⚠️ fighter-state ${res.status} para ${characterIds.join(',')}`)
      return null
    }
    return await res.json()
  } catch (err) {
    console.error('⚠️ fighter-state falhou:', err?.message || err)
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Busca o estado real e o aplica ao lutador da sala. Roda solta (sem await no caller):
 * quando resolve, a sala pode ter sumido, o jogador pode ter saído ou uma revanche pode
 * ter recomeçado — por isso tudo é re-buscado aqui dentro, nada é capturado por closure
 * além dos ids.
 */
async function verifyFighterState(roomId, playerId) {
  const key = `${roomId}:${playerId}`
  if (fighterVerifications.has(key)) return
  fighterVerifications.add(key)
  try {
    const data = await fetchFighterState([playerId])

    const room = rooms.get(roomId)
    if (!room) return
    const player = room.player1?.id === playerId ? room.player1
      : room.player2?.id === playerId ? room.player2
        : null
    if (!player) return

    const state = data?.fighters?.find((f) => f.id === playerId)
    if (!state || state.virtual) {
      // Sem resposta utilizável: seguir com o payload, mas deixando o rastro. O piso
      // sobre o COBRADO na rota de recompensas ainda limita o faucet — um soluço da
      // Vercel não pode derrubar a arena.
      player.staminaVerified = true
      player.staminaUnverified = true
      console.error(`⚠️ [${roomId}] stamina de ${player.name} NÃO verificada — seguindo com o payload`)
    } else {
      // 🎟️ A carteira decide só QUEM ENTRA (tem a taxa fixa da luta?). Ela NÃO é mais a
      // barra da luta: a barra nasce cheia e é da luta (ver resetFightStamina). Antes,
      // `player.stamina = state.stamina` fazia quem chegava com o saldo raspando lutar
      // com meia barra de stamina — punição dupla, e invisível.
      const fee = Number(data.entryStamina ?? data.minEntryStamina) || 0
      player.walletStamina = state.stamina
      player.maxStamina = state.maxStamina
      player.level = state.level
      if (!room.isActive) resetFightStamina(player)
      player.staminaVerified = true
      player.staminaBlocked = state.gathering ? 'gathering' : (state.stamina < fee ? 'low_stamina' : null)
      player.staminaEntryFee = fee
      if (player.staminaBlocked) {
        console.log(`⛔ [${roomId}] ${player.name} bloqueado (${player.staminaBlocked}: ${state.stamina}⚡ < ${fee}⚡)`)
      }
    }

    io.to(roomId).emit('room_updated', room)
    io.to(roomId).emit('fighter_state_synced', {
      playerId,
      stamina: player.stamina,
      maxStamina: player.maxStamina,
      // Saldo da CARTEIRA e a taxa da luta — o que a UI precisa para dizer "custa 19⚡,
      // você tem 12". A `stamina` acima é a barra da luta, outra coisa.
      walletStamina: player.walletStamina ?? null,
      blocked: player.staminaBlocked || null,
      entryFee: player.staminaEntryFee ?? null,
    })
  } finally {
    fighterVerifications.delete(key)
  }
}

/**
 * Fallback servidor: se o cliente-bot travar (turno passa sem phase change / STA reject),
 * o servidor age sozinho após ~4.5s. Se o bot-cliente já jogou, pendingAction/turno
 * mudam e este timer no-op.
 */
function maybeScheduleTrainingBot(room, roomId) {
  if (!room?.isActive) return
  if (!room.isTraining && !room.botFighterId) return
  if (room.phase !== CombatPhase.PLAYER_TURN) return
  if (!isServerBotId(room, room.currentTurn)) return

  // 💥 O timer NÃO pode morar na room: a room inteira é serializada em todo
  // `room_updated`, e um Timeout do Node carrega a lista circular de timers
  // (_idlePrev/_idleNext). O parser do socket.io não trata ciclo e o processo
  // MORRIA com "Maximum call stack size exceeded" no primeiro turno do bot.
  clearTimeout(botTurnTimers.get(roomId))
  const scheduledFor = room.currentTurn
  botTurnTimers.set(roomId, setTimeout(() => {
    botTurnTimers.delete(roomId)
    if (!rooms.has(roomId)) return
    if (!room.isActive || room.phase !== CombatPhase.PLAYER_TURN) return
    if (room.currentTurn !== scheduledFor || room.pendingAction) return
    console.log(`🤖 [${room.isTraining ? 'treino' : 'pvp-bot'}:${roomId}] fallback servidor — bot parado, forçando golpe`)
    executeTrainingBotAttack(room, roomId)
  }, 4500))
}

function executeTrainingBotAttack(room, roomId) {
  const playerId = room.currentTurn
  const bot = room.player1?.id === playerId ? room.player1 : room.player2
  const opponent = room.player1?.id === playerId ? room.player2 : room.player1
  if (!bot || !opponent) return

  if (bot.fx?.immobilizeTurns > 0) {
    bot.fx.immobilizeTurns--
    room.combatLog.push({
      type: 'system',
      message: `🚫 ${bot.name} está imobilizado e perde o turno!`,
      timestamp: new Date(),
    })
    advanceTurn(room, roomId)
    return
  }

  const unlocks = getUnlocksFor(bot)
  const stam = bot.stamina || 0
  const mp = bot.mp || 0
  let action = 'light_attack'
  let attackType = 'basic'
  if (
    unlocks.classAttack &&
    stam >= attackStaminaCost('weapon') &&
    mp >= unlocks.classAttackMp &&
    Math.random() < 0.4
  ) {
    action = 'heavy_attack'
    attackType = 'weapon'
  }

  const stamCost = attackStaminaCost(attackType)
  const mpCost = attackType === 'weapon' ? unlocks.classAttackMp : 0

  if (stam < stamCost) {
    room.combatLog.push({
      type: 'system',
      message: `😮‍💨 ${bot.name} está exausto e perde o turno!`,
      timestamp: new Date(),
    })
    advanceTurn(room, roomId)
    return
  }

  bot.stamina = Math.max(0, stam - stamCost)
  if (mpCost > 0) bot.mp = Math.max(0, mp - mpCost)

  const diceType = attackType === 'weapon' ? unlocks.classAttackDie : (CM.PVE_DIE[attackType] || CM.DICE_SIDES)
  const label = attackType === 'weapon' ? CM.classAttackName(bot.combatClass) : 'Golpe'

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
    player: bot.name,
    message: `🎯 ${label}! (−${stamCost} STA${mpCost ? ` · −${mpCost} MP` : ''}) — rolando d${diceType}…`,
    timestamp: new Date(),
  })
  io.to(roomId).emit('room_updated', room)

  const pending = room.pendingAction
  setTimeout(() => {
    if (room.pendingAction !== pending || pending.resolving) return
    pending.resolving = true
    const roll = Math.floor(Math.random() * diceType) + 1
    pending.attackRoll = roll
    room.combatLog.push({
      type: 'action',
      player: bot.name,
      message: `🎲 ${bot.name}: Rolou d${diceType} = ${roll}`,
      timestamp: new Date(),
    })
    io.to(roomId).emit('dice_rolled', {
      playerId,
      sides: diceType,
      result: { roll, modifier: 0, total: roll },
    })
    io.to(roomId).emit('room_updated', room)
    setTimeout(() => {
      if (room.pendingAction !== pending) return
      processCompleteAction(room, pending.action, pending.attackRoll, 'passive', 0, roomId)
    }, 900)
  }, 400)
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

  // ⚔️ MODELO ENXUTO: restaurar os levers-base (desfaz o buff). Igual ao PvE —
  // a barra de HP/MP da luta NÃO muda com a forma; só poder/armadura/K.
  if (player.baseLevers) {
    player.levers = player.baseLevers
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

// 🔎 Matchmaking — fila "Buscar oponente" (humano + bots da frota)
const matchQueue = new Map() // characterId -> { socketId, userId, characterId, level, name, joinedAt, band }

function queueBandForWaitMs(waitMs) {
  if (waitMs >= 30000) return 2
  if (waitMs >= 15000) return 1
  return 0
}

function tryMatchmake() {
  const entries = [...matchQueue.values()]
  // Preferir humano↔bot (score 0), depois humano↔humano (1).
  // NUNCA matchar bot↔bot — a frota deve ficar esperando jogadores, não se consumir.
  const pairRank = (a, b) => {
    const aBot = !!a.isBot
    const bBot = !!b.isBot
    if (aBot && bBot) return -1 // inválido
    if (aBot !== bBot) return 0
    return 1
  }

  let best = null
  for (let i = 0; i < entries.length; i++) {
    const a = entries[i]
    if (!matchQueue.has(a.characterId)) continue
    const waitA = Date.now() - a.joinedAt
    const bandA = queueBandForWaitMs(waitA)
    for (let j = i + 1; j < entries.length; j++) {
      const b = entries[j]
      if (!matchQueue.has(b.characterId)) continue
      if (a.userId && b.userId && a.userId === b.userId) continue
      const waitB = Date.now() - b.joinedAt
      const band = Math.max(bandA, queueBandForWaitMs(waitB))
      if (Math.abs((a.level || 1) - (b.level || 1)) > band) continue
      const rank = pairRank(a, b)
      if (rank < 0) continue
      if (!best || rank < best.rank) {
        best = { a, b, rank }
        if (rank === 0) break
      }
    }
    if (best && best.rank === 0) break
  }

  if (!best) return

  const { a, b } = best
  matchQueue.delete(a.characterId)
  matchQueue.delete(b.characterId)
  const roomId = 'mm_' + Math.random().toString(36).slice(2, 11)
  const payloadA = {
    roomId,
    opponentPreview: { id: b.characterId, name: b.name, level: b.level },
  }
  const payloadB = {
    roomId,
    opponentPreview: { id: a.characterId, name: a.name, level: a.level },
  }
  const sockA = io.sockets.sockets.get(a.socketId)
  const sockB = io.sockets.sockets.get(b.socketId)
  if (sockA) {
    sockA.emit('match_found', payloadA)
    sockA.emit('queue_status', { status: 'matched', ...payloadA })
  }
  if (sockB) {
    sockB.emit('match_found', payloadB)
    sockB.emit('queue_status', { status: 'matched', ...payloadB })
  }
  console.log(`🔎 Match: ${a.name} vs ${b.name} → ${roomId}`)
}

// 🤖 Preenchimento por bot — a fila só sabia PAREAR quem já estava nela: sem outro
// jogador online, "Buscar oponente" girava para sempre (a frota headless de
// scripts/bot-fleet-runner.js nunca roda em produção). Passados PVP_BOT_FILL_MS sem
// par, o servidor cria a sala e sobe um oponente espelho do jogador.
const PVP_BOTS_ENABLED = process.env.PVP_BOTS_ENABLED !== 'false'
const PVP_BOT_FILL_MS = Math.max(2000, Number(process.env.PVP_BOT_FILL_MS) || 10000)
/** Salas com bot prometido no match_found, esperando o humano chegar. */
const pendingBotFills = new Map() // roomId -> { characterId, persona, expiresAt }
const PENDING_FILL_TTL_MS = 60000

function cancelBotFillFor(characterId) {
  for (const [roomId, fill] of pendingBotFills) {
    if (fill.characterId === characterId) pendingBotFills.delete(roomId)
  }
}

function startBotFill(entry) {
  const roomId = 'mm_' + Math.random().toString(36).slice(2, 11)
  // Persona provisória: aqui só sabemos o nível. Classe/gear/pools são refinados no
  // join do humano (refinePersonaFor) — nome e nível do preview ficam de pé.
  const persona = buildQueuePersona(entry.level)
  matchQueue.delete(entry.characterId)
  pendingBotFills.set(roomId, {
    characterId: entry.characterId,
    persona,
    expiresAt: Date.now() + PENDING_FILL_TTL_MS,
  })

  const payload = {
    roomId,
    // id vazio: o id real do bot só nasce quando o jogador entra na sala (o preview
    // usa só nome/nível, como no match humano).
    opponentPreview: { id: '', name: persona.name, level: persona.level },
  }
  const sock = io.sockets.sockets.get(entry.socketId)
  if (sock) {
    sock.emit('match_found', payload)
    sock.emit('queue_status', { status: 'matched', ...payload })
  }
  console.log(`🤖 Fila sem humano: ${entry.name} → ${persona.name} (${persona.class}) em ${roomId}`)
}

function sweepBotFills() {
  const now = Date.now()
  for (const [roomId, fill] of pendingBotFills) {
    if (fill.expiresAt <= now) {
      pendingBotFills.delete(roomId)
      console.log(`🤖 Fill expirado (jogador não entrou): ${roomId}`)
    }
  }
  if (!PVP_BOTS_ENABLED) return
  for (const entry of matchQueue.values()) {
    if (entry.isBot) continue // a frota espera humano, não ganha bot
    if (now - entry.joinedAt < PVP_BOT_FILL_MS) continue
    startBotFill(entry)
  }
}

// 1s (era 2s): a espera pelo bot é uma promessa de tempo ("uns 10 segundos"), e um
// tick de 2s fazia o match cair só aos ~11-12s.
setInterval(() => {
  tryMatchmake()
  sweepBotFills()
}, 1000)

io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id)

  socket.on('queue_join', async ({ characterId, userId, level, name, isBot }) => {
    if (!characterId) {
      socket.emit('queue_status', { status: 'cancelled', error: 'characterId obrigatório' })
      return
    }

    // ⚡ PORTÃO DA FILA: sem a taxa fixa da luta no bolso não se entra. Quem entrasse
    // esgotado travava uma luta inteira, desgastava o equipamento e saía sem nada — a
    // rota de recompensas recusa quem não consegue pagar a entrada.
    //
    // `await` aqui é seguro (ao contrário do join_room): este handler só escreve num
    // Map indexado por characterId, e repetir a escrita é idempotente. A frota headless
    // (isBot) pula — ela já checa a própria stamina antes de entrar na fila.
    if (!isBot) {
      const data = await fetchFighterState([characterId])
      const state = data?.fighters?.find((f) => f.id === characterId)
      // Falha de rede → deixa entrar (fail-open): o portão do toggle_ready e o piso
      // sobre o cobrado na rota de recompensas ainda seguram o caso.
      if (state && !state.virtual) {
        const fee = Number(data.entryStamina ?? data.minEntryStamina) || 0
        if (state.gathering) {
          socket.emit('queue_status', { status: 'blocked', reason: 'gathering' })
          return
        }
        if (state.stamina < fee) {
          socket.emit('queue_status', { status: 'blocked', reason: 'low_stamina', stamina: state.stamina, required: fee })
          return
        }
      }
      // O jogador pode ter cancelado/desconectado durante o await.
      if (!socket.connected) return
    }

    matchQueue.set(characterId, {
      socketId: socket.id,
      characterId,
      userId: userId || null,
      level: Math.max(1, Number(level) || 1),
      name: name || 'Lutador',
      isBot: !!isBot,
      joinedAt: Date.now(),
    })
    socket.emit('queue_status', { status: 'searching', level: Math.max(1, Number(level) || 1) })
    tryMatchmake()
  })

  socket.on('queue_leave', ({ characterId }) => {
    if (!characterId) return
    // Cancela também um bot já prometido: quem fecha o dialog antes de entrar na sala
    // não deve deixar um oponente órfão esperando.
    cancelBotFillFor(characterId)
    if (matchQueue.has(characterId)) {
      matchQueue.delete(characterId)
      socket.emit('queue_status', { status: 'cancelled' })
    }
  })

  socket.on('join_room', ({ roomId, player, isCreator, role = RoomRole.FIGHTER, training = false, monster = 'goblin', password = null }) => {
    console.log(`Jogador ${player.name} entrando na sala ${roomId} como ${role}${training ? ` (treino vs ${monster})` : ''}`)
    
    playerSockets.set(player.id, socket.id)
    
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
        reactionPhase: false,
        password: null,
        isMatchmade: String(roomId).startsWith('mm_'),
      }
      // Criador define senha da sala na criação
      if (password && String(password).trim()) {
        room.password = String(password).trim().slice(0, 32)
      }
      rooms.set(roomId, room)
    } else {
      // Criador pode atrasar o bind da senha se o socket room nasceu sem ela
      if (isCreator && password && String(password).trim() && !room.password) {
        room.password = String(password).trim().slice(0, 32)
      }
      if (room.password) {
        // Sala com senha: espectador livre; lutador precisa da senha (exceto reconexão)
        const existingFighter = room.participants.fighters.find(f => f.id === player.id)
        if (!existingFighter && role === RoomRole.FIGHTER) {
          if (String(password || '') !== room.password) {
            socket.emit('join_room_error', {
              error: 'Senha incorreta ou necessária para entrar nesta sala',
              code: 'BAD_PASSWORD',
              availableRoles: getAvailableRoles(room),
            })
            return
          }
        }
      }
    }

    socket.join(roomId)

    // Reconexão: se o jogador já está na sala como lutador, apenas atualizar o socket
    // (evita duplicar o mesmo jogador como player2 após refresh da página)
    const existingFighterIdx = room.participants.fighters.findIndex(f => f.id === player.id)
    if (existingFighterIdx !== -1) {
      const seat = room.participants.fighters[existingFighterIdx]
      const wasDropped = seat.isConnected === false
      room.participants.fighters[existingFighterIdx] = { ...seat, socketId: socket.id, isConnected: true }
      if (room.player1?.id === player.id) {
        room.player1.isConnected = true
      } else if (room.player2?.id === player.id) {
        room.player2.isConnected = true
      }
      // ⏳ Voltou dentro da carência: cancela a derrota por abandono. Este ramo é
      // justamente o que preserva HP e a barra de stamina da luta — ele NÃO refaz o
      // setup do combate, ao contrário do caminho completo lá embaixo.
      clearDisconnectGrace(roomId, player.id)
      if (wasDropped) {
        room.combatLog.push({
          type: 'system',
          message: `🔌 ${player.name} reconectou a tempo.`,
          timestamp: new Date(),
        })
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
      // 🏟️ TREINO: o peer ESPELHA o poder do humano — mesmo gearTier (aqui) e mesmos
      // atributos (o bot copia no payload) — e a dificuldade é o `difficultyMult`.
      // 🔒 Os dois campos vêm do PAYLOAD DO CLIENTE e só valem com room.isTraining, onde
      // não há recompensa a capturar. Sem este gate, um cliente modificado mandava
      // `trainingLeverMult: 5` numa sala ranqueada e ficava 5× mais forte (confirmado em
      // QA: pow 716 vs 143) — direto em ouro e em pontos que pagam DOL no top 10.
      const training = room.isTraining === true
      const mirrorTier = training && player.trainingTargetGearTier != null
        ? Math.max(0, Math.min(1, Number(player.trainingTargetGearTier) || 0))
        : undefined
      // 🤖 Oponente de PvP: o bot não tem peças, então herda o gearTier do humano. O
      // valor NÃO vem do payload — é o tier que o servidor calculou para o jogador desta
      // sala, e só se aplica ao id que o próprio servidor gerou (room.botFighterId). Um
      // cliente que se anuncie como `bot_…` cai fora do `if` e luta com tier 0.
      const botTier = player.id === room.botFighterId && room.botMirrorTier != null
        ? Math.max(0, Math.min(1, Number(room.botMirrorTier) || 0))
        : undefined
      const { levers, cls, gearTier } = derivePlayerLevers(player, mirrorTier ?? botTier)
      const trainMult = training ? (Number(player.trainingLeverMult) || 1) : 1
      // Escala SIMÉTRICA (power/armor/hp/K juntos), igual à transformação: é o que faz o
      // multiplicador significar a mesma dificuldade em qualquer ponto da progressão.
      const finalLevers = trainMult !== 1 ? CM.transformLevers(levers, trainMult) : levers
      // Levers = ofensa/defesa/esquiva. HP da barra = ficha+gear (igual PvE).
      // Em treino o peer ainda escala power/armor/K pelo difficultyMult, mas o pool
      // de vida espelha o humano × mult (não levers.hp — isso gerava 36/29).
      player.levers = finalLevers
      player.baseLevers = finalLevers // guardado p/ reverter o buff de transformação
      player.combatClass = cls
      player.gearTier = gearTier
      // Toda luta começa SEM forma — a forma é só da sessão (sync_transformation).
      // Nunca herdar isTransformed do payload/DB (bug: entrava já transformado).
      player.isTransformed = false
      player.transformationType = null
      if (player.transformationData && typeof player.transformationData === 'object') {
        player.transformationData = {
          ...player.transformationData,
          remainingTurns: 0,
          cooldownTurns: 0,
        }
      }
      // 🌳 Vitalidade/Reservas Arcanas (maxHpPct/maxMpPct): passivas permanentes da árvore.
      const joinUnlocks = getUnlocksFor(player)
      const mirrorHp = Number(player.trainingMirrorMaxHp)
      if (training && Number.isFinite(mirrorHp) && mirrorHp > 0) {
        player.maxHp = Math.max(1, Math.round(mirrorHp * (trainMult || 1)))
      } else {
        // Ajuste de classe só-PvP entra AQUI, onde a barra nasce (levers.hp não é lido).
        player.maxHp = Math.max(1, Math.round(fightHpPool(player, joinUnlocks.passives.maxHpPct) * pvpClassHpMult(cls, player.level)))
      }
      player.hp = player.maxHp
      player.initialHp = player.maxHp
      // ⚡ Toda luta começa com a barra de stamina CHEIA — ela é da luta, não da
      // carteira (ver resetFightStamina). O `maxStamina` do payload é do CLIENTE e vale
      // de placeholder até `verifyFighterState` trazer o do banco, que reenche a barra.
      resetFightStamina(player)
      // O portão da carteira (tem a taxa fixa da luta?) espera essa mesma verificação:
      // `toggle_ready` fica travado enquanto `staminaVerified` for false. Bots do
      // servidor (treino e oponente da fila) não têm carteira e já nascem verificados.
      player.staminaVerified = isServerBotId(room, player.id) || String(player.id).startsWith('bot_')
      player.staminaBlocked = null
      player.walletStamina = null
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

      const def = MONSTERS[monsterKey]
      room.combatLog.push({
        type: 'system',
        message: `🏟️ Treino · ${def.name} — espelho seu a ${Math.round(def.difficultyMult * 100)}% (vitória ${def.winRateLabel})${def.unbeatable ? ' · imbatível' : ''} — sem recompensas PvP`,
        timestamp: new Date()
      })

      // O peer espelha poder (levers) e pool de vida do humano.
      setTimeout(() => {
        spawnTrainingBot({
          roomId,
          port: PORT,
          playerLevel: player.level || 1,
          playerGearTier: player.gearTier,
          playerAttrs: readAttrs(player),
          playerMaxHp: player.maxHp,
          monsterKey
        })
      }, 1000)
    }

    // 🤖 FILA SEM HUMANO: a sala foi prometida com um oponente-bot (startBotFill).
    // O bot só nasce agora, quando o jogador chega — assim ele espelha o gearTier e o
    // pool de vida JÁ recomputados pelo servidor acima. A sala NÃO é de treino: as
    // recompensas fluem normalmente (a rota é que não pontua contra bot).
    const pendingFill = pendingBotFills.get(roomId)
    if (pendingFill && role === RoomRole.FIGHTER && !room.botSpawned && player.id !== room.botFighterId) {
      pendingBotFills.delete(roomId)
      room.botSpawned = true
      const persona = refinePersonaFor(pendingFill.persona, player)
      const botPlayer = buildBotPlayer(persona)
      room.botFighterId = botPlayer.id
      room.botMirrorTier = player.gearTier
      console.log(`🤖 [pvp-bot:${roomId}] espelhando ${player.name} (nv${player.level}, tier ${Number(player.gearTier).toFixed(2)}) → ${persona.name} ${persona.class}`)
      setTimeout(() => {
        if (!rooms.has(roomId)) return
        spawnPvpBot({ roomId, port: PORT, persona, botPlayer })
      }, 1000)
    }

    io.to(roomId).emit('room_updated', room)
    io.to(roomId).emit('player_joined', { player: participantData, role })

    // ⚡ FASE 2 (assíncrona, FORA do handler): buscar o stamina REAL no banco. Não dá
    // para `await` acima — ver o bloco "STAMINA AUTORITATIVA" no topo do arquivo.
    if (role === RoomRole.FIGHTER && !player.staminaVerified) {
      verifyFighterState(roomId, player.id)
    }
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

    const readying = room.player1?.id === playerId ? room.player1
      : room.player2?.id === playerId ? room.player2
        : null

    // ⚡ PORTÃO DA ARENA. Só vale para FICAR pronto (despronto sempre passa) e só em
    // sala ranqueada — no treino não há stamina nem recompensa em jogo.
    if (readying && !readying.isReady && !room.isTraining) {
      if (!readying.staminaVerified) {
        socket.emit('error', { message: '⏳ Sincronizando sua stamina com o servidor…' })
        return
      }
      if (readying.staminaBlocked === 'gathering') {
        // ⛏️ Coletando, o relógio da stamina corre PARA TRÁS: a coleta comeria a mesma
        // stamina que a taxa da luta vai cobrar, e o jogador terminaria a luta sem
        // conseguir pagar a entrada (a rota devolve `cannot_pay_entry` e ele lutou à toa).
        socket.emit('error', { message: '⛏️ Seu herói está coletando — encerre a coleta antes de lutar.' })
        return
      }
      if (readying.staminaBlocked === 'low_stamina') {
        socket.emit('error', {
          message: `⚡ Stamina insuficiente: a luta custa ${readying.staminaEntryFee}⚡ e você tem ${readying.walletStamina ?? 0}. Ela volta sozinha (+2 a cada 15 min).`,
        })
        return
      }
    }

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
        maybeScheduleTrainingBot(r, roomId)
        scheduleTurnIdle(r, roomId)
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
    // Custo da barra DA LUTA. A carteira não vê nada disso — a taxa fixa da arena já
    // foi paga (ou será cobrada no fim), transformando ou não.
    player.stamina -= reducedStaminaCost

    // Buff de combate (levers) — sem mexer na barra de HP (igual PvE / sync_transformation).
    if (player.baseLevers) {
      player.levers = CM.transformLevers(player.baseLevers)
    }

    room.combatLog.push({
      type: 'transformation',
      player: player.name,
      message: `⚡ ${player.name} se transforma em ${transformationType}! (${config.duration} turnos, -${reducedMpCost} MP, -${reducedStaminaCost} Stamina)`,
      timestamp: new Date()
    })

    // Igual ao PvE: transformação NÃO gasta o turno — pode atacar transformado agora.
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

    // Recursos da luta (MP/STA). NUNCA aceitar hp/maxHp/maxMp da API REST aqui —
    // applyTransformation persiste o pool do personagem no banco, que não é o pool
    // da sala (levers + passivas). Sobrescrever maxHp corrompia a barra e o ratio.
    // ⬇️ SÓ PARA BAIXO. Este payload vem do CLIENTE; aceitar o valor cru era um
    // "escreva seu próprio stamina" no meio da luta. O cliente só DEBITA o custo da
    // forma, então uma leitura honesta nunca sobe o valor.
    if (stats && typeof stats === 'object') {
      if (stats.mp != null) player.mp = Math.min(player.mp ?? 0, Math.max(0, Number(stats.mp) || 0))
      if (stats.stamina != null) {
        player.stamina = Math.min(player.stamina ?? 0, Math.max(0, Number(stats.stamina) || 0))
      }
    }

    // ⚔️ MODELO ENXUTO (igual PvE): buff SIMÉTRICO nos levers (poder/armadura/K).
    // A barra HP/MP da luta permanece — só o dano/defesa sobem, e o especial libera.
    if (player.baseLevers) {
      player.levers = player.isTransformed
        ? CM.transformLevers(player.baseLevers)
        : player.baseLevers
    }

    room.combatLog.push({
      type: 'transformation',
      player: player.name,
      message: `🌟 ${player.name} se transformou${transformationName ? ` em ${transformationName}` : ''}!${duration ? ` (${duration} turnos)` : ''}`,
      timestamp: new Date()
    })

    // Igual ao PvE: não gasta turno — o jogador pode usar o golpe transformado agora.
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

    // 🔁 UMA AÇÃO POR VEZ. O auto-roll resolve em ~400ms + 900ms; nessa janela um
    // segundo clique sobrescrevia `room.pendingAction`, COBRAVA stamina/MP de novo e a
    // resolução da primeira morria calada no `room.pendingAction !== pending`. Ou seja:
    // dois cliques = dois débitos, um golpe só. Com 100 de stamina falsa isso passava
    // batido; agora o débito é o orçamento real do jogador e o pool que paga os dois.
    if (room.pendingAction && !room.pendingAction.resolving) return

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

    // 🔒 `item` vem do CLIENTE. Enquanto a stamina da luta era 100 falsa isso não valia
    // nada; agora ela é o orçamento da luta E o pool que paga os dois lados, então um
    // `{ staminaRestore: 999 }` a cada turno viraria stamina infinita — sobreviver ao
    // oponente honesto até ganhar, e pontos de temporada que pagam DOL. O teto é o do
    // maior consumível do catálogo (Poção de Stamina = 50, ver api/inventory/use-item).
    const capRestore = (raw, max) => Math.max(0, Math.min(Number(raw) || 0, max))
    const hpRestored = Math.min(capRestore(item?.hpRestore, MAX_CONSUMABLE_RESTORE.hp), player.maxHp - player.hp)
    const mpRestored = Math.min(capRestore(item?.mpRestore, MAX_CONSUMABLE_RESTORE.mp), player.maxMp - player.mp)
    const staminaRestored = Math.min(capRestore(item?.staminaRestore, MAX_CONSUMABLE_RESTORE.stamina), player.maxStamina - player.stamina)

    player.hp += hpRestored
    player.mp += mpRestored
    player.stamina += staminaRestored
    // A poção repõe a barra DA LUTA (o crédito no banco é problema da rota REST que
    // consumiu o item). Não existe mais orçamento a reconciliar: a carteira paga a taxa
    // fixa da arena e nada além dela.

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

    // Item consome o turno — advanceTurn (regen + status + nudge do bot de treino)
    advanceTurn(room, roomId)
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
  // 🏳️ DESISTIR. Antes não existia: quem estava perdendo fechava a aba e escapava sem
  // pagar stamina nenhuma, e quem ficou não recebia nada. Cai no mesmo declareWinner das
  // outras vitórias, então as recompensas fluem normalmente.
  socket.on('surrender', ({ playerId, roomId }) => {
    const room = rooms.get(roomId)
    if (!room) return
    if (room.player1?.id !== playerId && room.player2?.id !== playerId) return
    if (!isFightLive(room)) return

    const quitter = room.player1?.id === playerId ? room.player1 : room.player2
    room.combatLog.push({
      type: 'system',
      message: `🏳️ ${quitter?.name} desistiu da luta!`,
      timestamp: new Date(),
    })
    forfeitFight(room, roomId, playerId, 'desistência')
  })

  socket.on('close_room', ({ playerId, roomId }) => {
    const room = rooms.get(roomId)
    if (!room || room.creator !== playerId) return

    // 🚪 Fechar a sala NO MEIO de uma luta valendo é abandono — era a segunda porta de
    // fuga grátis (a primeira era o disconnect), e a mais barata, porque é um botão.
    // Resolve a luta primeiro; o teardown abaixo continua igual.
    if (isFightLive(room)) {
      room.combatLog.push({
        type: 'system',
        message: '🏳️ O criador fechou a sala no meio da luta — conta como desistência.',
        timestamp: new Date(),
      })
      forfeitFight(room, roomId, playerId, 'sala fechada')
    }

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
    clearBotTurnTimer(roomId)
    clearRoomGraceTimers(roomId)

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

    // Limpar fila de matchmaking (e o bot prometido a quem estava nela)
    for (const [cid, entry] of matchQueue.entries()) {
      if (entry.socketId === socket.id) {
        matchQueue.delete(cid)
        cancelBotFillFor(cid)
      }
    }
    
    // 💚 REGENERAÇÃO AUTOMÁTICA - Se jogador sair de combate
    playerSockets.forEach((socketId, playerId) => {
      if (socketId === socket.id) {
        // Encontrar a sala do jogador e remover das participações
        rooms.forEach((room, roomId) => {
          let playerFound = false
          let wasLastPlayer = false
          
          // Verificar e remover de fighters
          const fighterIndex = room.participants.fighters.findIndex(p => p.id === playerId)

          // ⏳ CAIU NO MEIO DE UMA LUTA VALENDO: não remover ninguém ainda.
          //
          // Dois bugs moravam no caminho antigo (splice + regeneratePlayerResources):
          //  1. CURA DE GRAÇA — o lutador saía da lista com o HP restaurado, e o
          //     join_room seguinte refazia o setup do zero (hp = maxHp, barra de
          //     stamina cheia). Perder estava a um F5 de distância.
          //  2. FUGA DE GRAÇA — ninguém era declarado vencedor, então a luta morria
          //     sem cobrar a taxa de entrada e sem pagar quem ficou.
          // Agora o lutador FICA na sala, marcado como desconectado, e tem
          // DISCONNECT_GRACE_MS para voltar (o ramo de reconexão do join_room reencontra
          // a entrada e preserva HP e a barra da luta). Esgotado o prazo, é derrota.
          if (fighterIndex !== -1 && isFightLive(room)) {
            const player = room.participants.fighters[fighterIndex]
            player.isConnected = false
            if (room.player1?.id === playerId) room.player1.isConnected = false
            if (room.player2?.id === playerId) room.player2.isConnected = false

            room.combatLog.push({
              type: 'system',
              message: `📴 ${player.name} caiu — ${Math.round(DISCONNECT_GRACE_MS / 1000)}s para voltar antes de perder por abandono.`,
              timestamp: new Date(),
            })

            clearDisconnectGrace(roomId, playerId)
            disconnectGraceTimers.set(`${roomId}:${playerId}`, setTimeout(() => {
              disconnectGraceTimers.delete(`${roomId}:${playerId}`)
              const live = rooms.get(roomId)
              if (!live || !isFightLive(live)) return
              const stillOut = live.player1?.id === playerId ? live.player1
                : live.player2?.id === playerId ? live.player2
                  : null
              if (!stillOut || stillOut.isConnected) return // voltou: nada a fazer
              live.combatLog.push({
                type: 'system',
                message: `🏳️ ${stillOut.name} não voltou a tempo — derrota por abandono.`,
                timestamp: new Date(),
              })
              forfeitFight(live, roomId, playerId, 'abandono')
            }, DISCONNECT_GRACE_MS))

            io.to(roomId).emit('room_updated', room)
            return // esta sala está resolvida; não seguir para o teardown abaixo
          }

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
            clearBotTurnTimer(roomId)
            clearRoomGraceTimers(roomId)

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

  // Restaurar HP/MP da luta
  player.hp = player.maxHp
  player.mp = player.maxMp

  // Forma é só da sessão: sempre limpa ao sair da luta (vitória/derrota/disconnect).
  const wasTransformed = !!player.isTransformed || !!player.transformationType
  if (wasTransformed) {
    revertPlayerTransformation(player)
    console.log(`🔄 ${context}: ${player.name} teve transformação resetada`)
  }
  player.isTransformed = false
  player.transformationType = null
  if (player.transformationData) {
    player.transformationData.cooldownTurns = 0
    player.transformationData.remainingTurns = 0
  }

  // Persistir limpeza no banco (personagens reais — bots do servidor usam os prefixos
  // `monster_` (treino) e `bot_` (oponente da fila), que não existem no banco)
  const isRealCharacter = player.id
    && !String(player.id).startsWith('monster_')
    && !String(player.id).startsWith('bot_')
  if (isRealCharacter && wasTransformed) {
    const appUrl = (process.env.APP_URL || process.env.NEXTAUTH_URL || 'https://dolrath.vercel.app').replace(/\/$/, '')
    fetch(`${appUrl}/api/character/${player.id}/detransform`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }).catch((error) => {
      console.error(`❌ Erro ao persistir reset de transformação para ${player.name}:`, error)
    })
  }

  // A barra de stamina é DA LUTA: encher aqui é o que faz a REVANCHE na mesma sala
  // começar em pé de igualdade com uma luta recém-criada (a taxa da carteira é cobrada
  // por luta, não por barra).
  resetFightStamina(player)
  console.log(`💚 ${context}: ${player.name} teve HP e MP restaurados, transformação resetada (Stamina da luta: ${player.stamina}/${player.maxStamina})`)
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

    // Vitória normal (HP a zero): desarma abandono/inatividade, senão um timer armado
    // ainda declararia "derrota por inatividade" numa luta que já acabou.
    clearRoomGraceTimers(roomId)
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
  if (room.isActive && room.phase === CombatPhase.PLAYER_TURN) {
    maybeScheduleTrainingBot(room, roomId)
    scheduleTurnIdle(room, roomId)
  }
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
  maybeScheduleTrainingBot(room, roomId)
  scheduleTurnIdle(room, roomId)
}

// 🏆 SISTEMA DE RECOMPENSAS PVP — stamina gasta na luta → gold/XP (paridade masmorra)
async function processBattleRewards(room, winner, loser, roomId) {
  try {
    // 🏳️ Vitória por abandono NÃO é impecável: quem vence porque o outro fechou a aba
    // está com o HP intacto por definição, e ganharia o bônus de flawless (+15% ouro /
    // +10% XP) de graça. Com a taxa fixa, a luta curta paga igual a uma longa — então
    // este filtro é a única coisa entre o bônus e quem sobe sala só para ver o outro
    // desistir.
    const isFlawlessVictory = !room.forfeit && winner.initialHp && winner.hp === winner.initialHp
    const winnerTransformed = !!(winner.isTransformed || (winner.transformationType && winner.transformationType !== 'none'))
    const loserTransformed = !!(loser.isTransformed || (loser.transformationType && loser.transformationType !== 'none'))

    // Nível NÃO vai no corpo: a rota lê do banco (o payload do cliente não é autoridade).
    // updateRanking também saiu — o gate do treino é `room.isTraining`, checado no caller.
    //
    // matchKey: lock de idempotência (PvpMatch.matchKey @unique na rota). Gerada UMA vez
    // por luta e presa na room — se processBattleRewards rodar de novo p/ a mesma luta
    // (evento duplicado, retry), a rota reconhece e não credita duas vezes. Limpa no
    // sucesso p/ uma revanche na mesma sala ganhar chave nova.
    if (!room.rewardMatchKey) {
      room.rewardMatchKey = `${roomId}:${require('crypto').randomUUID()}`
    }
    const battleResult = {
      winnerId: winner.id,
      loserId: loser.id,
      isFlawlessVictory,
      winnerTransformed,
      loserTransformed,
      // 🎟️ A stamina gasta na luta não vai mais no corpo: a rota cobra a TAXA FIXA
      // (PVP_FIGHT_STAMINA) de cada lado, independente de quantos golpes rolaram.
      matchKey: room.rewardMatchKey,
      // Nome só é lido para o lado SINTÉTICO (bot da fila, que não tem linha no banco);
      // do lado real a rota continua lendo do banco.
      winnerName: winner.name,
      loserName: loser.name,
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
        delete room.rewardMatchKey
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

    if (rewardData.failed) {
      room.combatLog.push({
        type: 'system',
        message: '⚠️ As recompensas não puderam ser creditadas — nada foi perdido, tente a próxima luta.',
        timestamp: new Date()
      })
    } else if (rewardData.skipped) {
      const why = rewardData.skipped === 'same_user'
        ? '🤝 Luta entre personagens da mesma conta: sem recompensa (vale como treino).'
        : '⚡ Luta curta demais: sem recompensa.'
      room.combatLog.push({ type: 'system', message: why, timestamp: new Date() })
    } else {
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
      // A luta pagou ouro/XP mas NÃO pontuou — o jogador precisa saber por quê, em vez
      // de descobrir sozinho que lutou à toa (a rota devolve `rankingSkipped` desde
      // sempre; era este repasse que faltava).
      const rankWhy = {
        bot_opponent: '🤖 Oponente da casa: paga ouro e XP, mas não pontua no ranking.',
        pair_cap: '🔁 Limite diário de pontos contra este mesmo oponente atingido.',
        error: '⚠️ O ranking não pôde ser atualizado nesta luta.',
      }[rewardData.rankingSkipped]
      if (rankWhy) room.combatLog.push({ type: 'system', message: rankWhy, timestamp: new Date() })
    }

    io.to(roomId).emit('battle_rewards', {
      failed: !!rewardData.failed,
      skipped: rewardData.skipped || null,
      rankingSkipped: rewardData.rankingSkipped || null,
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

// A rota não respondeu: NÃO invente recompensa. O fallback antigo recalculava gold/XP
// aqui (com 6.6/8 hard-coded, que a calibração de 2026-07-15 deixou pra trás) e mandava
// os números pra UI — mas nada disso tinha ido ao banco. O jogador via ouro que não
// existia. Zero + `failed` é a verdade; a UI avisa em vez de mentir.
function calculateBattleRewardsLocal(battleResult) {
  const empty = (id) => ({ id, xpGained: 0, goldGained: 0, leveledUp: false, equipmentWear: [] })
  return {
    failed: true,
    winner: empty(battleResult.winnerId),
    loser: empty(battleResult.loserId),
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
