// 🏟️ MODO TREINO — bot monstro como ESPELHO do jogador (mesmo nível, mesmos atributos,
// mesmo gearTier), com a dificuldade vindo do `difficultyMult` da def.
// Conecta como cliente Socket.IO real; fluxo = mesmos handlers do PvP.

// A máquina de estados do bot (ready → iniciativa → ataques, watchdogs) mora em
// botFighter.js — a mesma que o oponente de PvP usa. Aqui só o monstro-espelho.
const { spawnBotFighter } = require('./botFighter')
const {
  getTrainingOpponent,
  fallbackPeerAttrs,
  TRAINING_OPPONENTS_BY_KEY,
  DEFAULT_TRAINING_OPPONENT_KEY,
} = require('./trainingOpponents')

// Compat: socket-server ainda importa MONSTERS[key]
const MONSTERS = TRAINING_OPPONENTS_BY_KEY

/**
 * Peer ESPELHO: nível, atributos e gearTier do humano; a força vem do difficultyMult.
 *
 * Antes o peer era sintético (9 slots num gear FIXO DUO→PEN + attrs 8+nível×0.7), e por
 * isso um nv4 sem gear pegava um "Lobo · Fácil" com 3.3× a sua escala — morria em um
 * golpe. Agora quem define o patamar é o próprio jogador, e o rótulo de dificuldade só
 * diz o quanto o peer te supera.
 *
 * O servidor recomputa os levers no join (derivePlayerLevers + trainingTargetGearTier +
 * trainingLeverMult, tudo gateado por room.isTraining) — este payload é só a entrada.
 */
function buildMonsterPlayer(monsterKey, playerLevel, playerGearTier, playerAttrs, playerMaxHp) {
  const def = getTrainingOpponent(monsterKey)
  const level = Math.max(1, Number(playerLevel) || 1)
  const attrs = playerAttrs && typeof playerAttrs === 'object' ? { ...playerAttrs } : fallbackPeerAttrs(level)
  const gearTier = Number.isFinite(Number(playerGearTier)) ? Number(playerGearTier) : 0
  // Pool do humano (já ficha+gear). O join aplica difficultyMult em cima deste espelho.
  const mirrorMaxHp = Math.max(1, Number(playerMaxHp) || 100)

  // MP/stamina de sessão generosos o bastante para uma luta (faucet de treino)
  const maxMp = 60 + level * 4 + attrs.int
  const maxStamina = 120 + attrs.agi * 2 + attrs.def * 2

  return {
    id: `monster_${def.key}_${Date.now()}`,
    name: def.name,
    level,
    race: def.race,
    class: def.classNamePt,
    hp: mirrorMaxHp,
    maxHp: mirrorMaxHp,
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
    attributes: attrs,   // espelho dos atributos do humano
    baseStats: attrs,
    equipment: [],       // sem gear próprio: o gearTier vem espelhado abaixo
    avatar: def.image,
    avatarEmoji: def.emoji,
    equipmentMap: {},
    // Lidos pelo servidor SÓ em sala de treino (room.isTraining) — ver o join.
    trainingTargetGearTier: gearTier,
    trainingLeverMult: def.difficultyMult || 1,
    trainingMirrorMaxHp: mirrorMaxHp,
    trainingUnbeatable: !!def.unbeatable,
    skillTree: null, // legado → Ataque de Classe liberado
    isReady: false,
    isConnected: true,
    isAlive: true,
  }
}

function spawnTrainingBot({ roomId, port, playerLevel, playerGearTier, playerAttrs, playerMaxHp, monsterKey }) {
  const def = getTrainingOpponent(monsterKey)
  const monster = buildMonsterPlayer(def.key, playerLevel, playerGearTier, playerAttrs, playerMaxHp)

  const { shutdown } = spawnBotFighter({
    roomId,
    port,
    player: monster,
    attackWeights: def.attackWeights,
    label: 'treino',
    joinNote: `espelho a ${Math.round(def.difficultyMult * 100)}%${def.unbeatable ? ' · imbatível' : ''}`,
  })

  return { monsterId: monster.id, shutdown }
}

module.exports = {
  spawnTrainingBot,
  MONSTERS,
  getTrainingOpponent,
  DEFAULT_TRAINING_OPPONENT_KEY,
}
