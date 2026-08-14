// ⚔️ OPONENTE DE PVP — bot efêmero que entra na arena quando a fila não acha humano.
//
// Por que sintético (id `bot_…`) e não um personagem do banco: a frota de 16 heróis
// (scripts/bot-fleet-*) não cobre todos os níveis, precisa de stamina/HP mantidos —
// e um bot sem stamina na carteira faz a rota de recompensa recusar a luta
// (`cannot_pay_entry`), deixando o HUMANO sem ouro — além de exigir lock de "bot
// ocupado" e sujar o ranking. Aqui o
// oponente nasce ESPELHANDO o jogador (mesmo nível, mesmo gearTier, mesmo pool de vida)
// numa classe diferente da dele, some no fim da luta e não deixa rastro no banco.
//
// A luta é PvP de verdade (a sala NÃO é `isTraining`), então ouro e XP são creditados
// normalmente. O que a rota de recompensas NÃO faz contra bot é pontuar a temporada —
// a pool paga DOL e um oponente garantido a cada 10s destruiria o leaderboard.
//
// A máquina de estados (ready → iniciativa → ataques) vem de botFighter.js, a MESMA do
// bot de treino. Não copie o loop para cá: foi assim que a tentativa anterior apodreceu.

const { spawnBotFighter } = require('./botFighter')
const CM = require('./combatModel')
const { CLASS_PREFIX, CLASS_ROLES } = require('./skillTree')

const BOT_PREFIX = 'bot_'
const BOT_CLASSES = ['warrior', 'rogue', 'mage', 'monk']

/** Só o servidor cria ids assim — ver a checagem de `room.botFighterId` no join. */
function isPvpBotId(id) {
  return typeof id === 'string' && id.startsWith(BOT_PREFIX)
}

// Comportamento por classe: pesos entre Golpe (d6, 1 STA) e Ataque de Classe (d8, 2 STA
// + 8 MP). Classes de burst puxam mais para o Ataque de Classe.
const CLASS_BEHAVIOR = {
  warrior: { attackWeights: { light_attack: 2, heavy_attack: 3 } },
  rogue: { attackWeights: { light_attack: 3, heavy_attack: 2 } },
  mage: { attackWeights: { light_attack: 2, heavy_attack: 3 } },
  monk: { attackWeights: { light_attack: 3, heavy_attack: 3 } },
}

// Nomes plausíveis, sem tag de bot — a proposta é parecer uma partida de verdade.
// Lista ÚNICA de propósito: o nome é sorteado na fila (para o preview do dialog) e a
// classe só é decidida quando o jogador entra na sala. Com listas por classe, o nome
// mostrado acabava vindo da classe provisória e não batia com a definitiva.
const BOT_NAMES = [
  'Tarok', 'Brunhild', 'Kaelen', 'Ragnar', 'Sigrun', 'Dorn',
  'Vesper', 'Lira', 'Corvo', 'Nyx', 'Sable', 'Fen',
  'Aldric', 'Morgana', 'Zephyr', 'Isolde', 'Thalion', 'Vex',
  'Kenji', 'Amara', 'Bodhi', 'Suren', 'Taro', 'Mei',
]
const BOT_RACES = ['Humano', 'Draconiano', 'Metamorfo', 'Elfo']

// Atributo principal de cada classe (mesma leitura de CLASS_ROLES.primary do skillTree,
// traduzida para os nomes de atributo da ficha).
const PRIMARY_ATTR = { warrior: 'str', rogue: 'agi', mage: 'int', monk: 'agi' }

function randomOf(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

/**
 * Nós comprados: a linha PRIMÁRIA da classe até o tier proporcional ao nível — imita o
 * humano que empilha o caminho principal. O nó 2 libera o Ataque de Classe (d8); 5 e 8
 * sobem o rank; 11 dá o bônus de crítico. Ids montados a partir de CLASS_PREFIX/
 * CLASS_ROLES (server/skillTree.js), a mesma fonte que o servidor lê — nada hardcoded.
 */
function primaryPathNodes(cls, level) {
  const prefix = CLASS_PREFIX[cls] || CLASS_PREFIX.warrior
  const role = (CLASS_ROLES[cls] || CLASS_ROLES.warrior).primary
  const maxTier = Math.min(11, Math.max(2, Math.ceil(Math.max(1, level) / 2)))
  return [2, 5, 8, 11].filter((t) => t <= maxTier).map((t) => `${prefix}-${role}-${t}`)
}

/**
 * Atributos do bot: MESMO orçamento total do humano, redistribuído para o arquétipo da
 * classe sorteada. Mesmo total = luta justa; distribuição própria = um mago que parece
 * mago (e não um mago com a ficha de guerreiro do oponente).
 */
function mirrorAttrs(humanAttrs, cls, level) {
  const src = humanAttrs && typeof humanAttrs === 'object' ? humanAttrs : null
  const sum = src
    ? ['str', 'agi', 'int', 'def'].reduce((acc, k) => acc + Math.max(0, Number(src[k]) || 0), 0)
    : 4 * (8 + Math.floor(Math.max(1, level) * 0.2))
  const total = Math.max(32, Math.round(sum)) // piso 8 em cada um dos 4
  const primary = PRIMARY_ATTR[cls] || 'str'
  const share = { str: 0.15, agi: 0.15, int: 0.15, def: 0.3 }
  share[primary] = 0.4
  // `def` do primário agi/int fica com o resto; normaliza para o total bater.
  const raw = { str: 0, agi: 0, int: 0, def: 0 }
  let acc = 0
  for (const k of ['str', 'agi', 'int']) {
    raw[k] = Math.max(8, Math.round(total * share[k]))
    acc += raw[k]
  }
  raw.def = Math.max(8, total - acc)
  return raw
}

let botSeq = 0

/**
 * Persona casada com o humano: mesmo nível/gearTier/pools, classe garantidamente ≠.
 * `human` é o player JÁ processado pelo servidor no join (combatClass/gearTier/maxHp
 * recomputados) — nunca o payload cru do cliente.
 */
function buildPersonaFor(human = {}) {
  const humanCls = CM.normalizeCombatClass(human.combatClass || human.class)
  const pool = BOT_CLASSES.filter((c) => c !== humanCls)
  const cls = randomOf(pool.length ? pool : BOT_CLASSES)
  const level = Math.max(1, Number(human.level) || 1)
  const attrs = mirrorAttrs(human.attributes || human.baseStats, cls, level)
  return {
    class: cls,
    name: randomOf(BOT_NAMES),
    race: randomOf(BOT_RACES),
    level,
    // gearTier vem do servidor (deriveGearTier do gear real do humano); o join do bot
    // reaplica como gearTierOverride, já que o bot não tem peças.
    gearTier: Number.isFinite(Number(human.gearTier)) ? Number(human.gearTier) : 0,
    attrs,
    // Pool de vida ESPELHA o humano (mesma barra = luta simétrica, igual ao treino);
    // MP e stamina saem das fórmulas do jogo aplicadas aos atributos DO BOT — um mago
    // com a reserva de MP de um guerreiro mal conseguiria usar o Ataque de Classe.
    // Mesmas contas de computeDerivedStats (src/lib/combatFormulas.ts).
    maxHp: Math.max(1, Number(human.maxHp) || 100),
    maxMp: 60 + attrs.int * 4 + attrs.agi,
    maxStamina: 120 + attrs.agi * 2 + attrs.def * 2,
    behavior: CLASS_BEHAVIOR[cls] || CLASS_BEHAVIOR.warrior,
  }
}

/**
 * Persona só com o que a FILA sabe (nível e nome do preview), antes de o humano entrar
 * na sala. O gearTier/pools reais entram em `refinePersonaFor` no join.
 */
function buildQueuePersona(level) {
  return buildPersonaFor({ level })
}

/** Ajusta a persona da fila ao humano que acabou de entrar (classe ≠, gear, pools). */
function refinePersonaFor(persona, human) {
  const refined = buildPersonaFor(human)
  // Nome e raça já foram mostrados no preview do dialog — mantê-los.
  refined.name = persona?.name || refined.name
  refined.race = persona?.race || refined.race
  return refined
}

function buildBotPlayer(persona) {
  botSeq += 1
  const attrs = persona.attrs
  return {
    id: `${BOT_PREFIX}${persona.class}_${Date.now()}_${botSeq}`,
    name: persona.name,
    level: persona.level,
    race: persona.race,
    class: persona.class,
    hp: persona.maxHp,
    maxHp: persona.maxHp, // sem gear: fightHpPool devolve exatamente este valor
    mp: persona.maxMp,
    maxMp: persona.maxMp,
    stamina: persona.maxStamina,
    maxStamina: persona.maxStamina,
    attack: attrs.str,
    defense: attrs.def,
    strength: attrs.str,
    agility: attrs.agi,
    intelligence: attrs.int,
    resistance: Math.floor(attrs.def * 0.8),
    critical: 1.0,
    speed: 2.5,
    experience: 0, // perde empate de iniciativa para o jogador (padrão do training-bot)
    attributes: attrs,
    baseStats: attrs,
    equipment: [], // sem peças reais — o tier entra por gearTierOverride no join
    avatar: null,
    // Sem emoji próprio: o BattleScene cai no CLASS_EMOJI da classe, igual a um
    // jogador que ainda não gerou a imagem do personagem.
    avatarEmoji: null,
    equipmentMap: {},
    skillTree: { purchased: primaryPathNodes(persona.class, persona.level) },
    isReady: false,
    isConnected: true,
    isAlive: true,
  }
}

/**
 * Sobe o oponente na sala. O caller (socket-server) já registrou `room.botFighterId`
 * com o id devolvido aqui — é o que autoriza o espelho de gearTier no join.
 */
function spawnPvpBot({ roomId, port, persona, botPlayer, onEnd }) {
  const player = botPlayer || buildBotPlayer(persona)
  const { shutdown } = spawnBotFighter({
    roomId,
    port,
    player,
    attackWeights: persona.behavior?.attackWeights,
    label: 'pvp-bot',
    joinNote: `${persona.class} nv${persona.level}`,
    // O bot chega ~1s antes de o humano aparecer na lista de lutadores em algumas
    // ordens de join; a carência evita que ele desista achando que está sozinho.
    soloGraceMs: 12000,
    onEnd,
  })
  return { botId: player.id, shutdown }
}

module.exports = {
  BOT_PREFIX,
  isPvpBotId,
  buildPersonaFor,
  buildQueuePersona,
  refinePersonaFor,
  buildBotPlayer,
  spawnPvpBot,
}
