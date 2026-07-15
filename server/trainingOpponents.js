/**
 * Espelho CJS de src/lib/trainingOpponents.ts — manter sincronizado.
 * Usado pelo socket / training-bot (Node puro).
 */

const TRAINING_OPPONENTS = [
  {
    key: 'lobo',
    name: 'Lobo Faminto',
    dungeonLabel: 'Floresta Sombria',
    difficultyLabel: 'Fácil',
    gearLabel: 'DUO',
    image: '/monsters/lobo-faminto.webp',
    emoji: '🐺',
    combatClass: 'rogue',
    classNamePt: 'Ladino',
    race: 'Fera',
    rarity: 'RARE',
    enhancementLevel: 17,
    description: 'Peer com gear DUO — ótimo para aquecer.',
    attackWeights: { light_attack: 4, heavy_attack: 2 },
  },
  {
    key: 'golem',
    name: 'Golem de Pedra',
    dungeonLabel: 'Caverna de Cristal',
    difficultyLabel: 'Médio',
    gearLabel: 'TRI',
    image: '/monsters/golem-de-pedra.webp',
    emoji: '🗿',
    combatClass: 'warrior',
    classNamePt: 'Guerreiro',
    race: 'Constructo',
    rarity: 'EPIC',
    enhancementLevel: 18,
    description: 'Peer com gear TRI — nível típico da arena.',
    attackWeights: { light_attack: 2, heavy_attack: 4 },
  },
  {
    key: 'crocodilo',
    name: 'Crocodilo Ancião',
    dungeonLabel: 'Pântano Maldito',
    difficultyLabel: 'Difícil',
    gearLabel: 'IV',
    image: '/monsters/crocodilo-anciao.webp',
    emoji: '🐊',
    combatClass: 'monk',
    classNamePt: 'Monge',
    race: 'Réptil',
    rarity: 'LEGENDARY',
    enhancementLevel: 19,
    description: 'Peer com gear IV (TET) — pressão séria.',
    attackWeights: { light_attack: 2, heavy_attack: 3 },
  },
  {
    key: 'gargula',
    name: 'Gárgula de Obsidiana',
    dungeonLabel: 'Ruínas Arcanas',
    difficultyLabel: 'Muito difícil',
    gearLabel: 'IV+',
    image: '/monsters/gargula-de-obsidiana.webp',
    emoji: '🦅',
    combatClass: 'mage',
    classNamePt: 'Mago',
    race: 'Constructo',
    rarity: 'LEGENDARY',
    enhancementLevel: 19,
    leverMult: 1.1,
    description: 'Peer IV reforçado — quase no teto atual.',
    attackWeights: { light_attack: 1, heavy_attack: 4 },
  },
  {
    key: 'leviatan',
    name: 'Leviatã do Abismo',
    dungeonLabel: 'Abismo (em breve)',
    difficultyLabel: 'Imbatível',
    gearLabel: 'PEN',
    image: '/monsters/leviatan-do-abismo.webp',
    emoji: '🦑',
    combatClass: 'warrior',
    classNamePt: 'Guerreiro',
    race: 'Leviatã',
    rarity: 'LEGENDARY',
    enhancementLevel: 20,
    leverMult: 1.35,
    unbeatable: true,
    description: 'Easter egg — peer PEN. Praticamente imbatível · sem recompensa.',
    attackWeights: { light_attack: 1, heavy_attack: 5 },
  },
]

const TRAINING_OPPONENTS_BY_KEY = Object.fromEntries(TRAINING_OPPONENTS.map((o) => [o.key, o]))
const DEFAULT_TRAINING_OPPONENT_KEY = 'lobo'

function getTrainingOpponent(key) {
  if (key && TRAINING_OPPONENTS_BY_KEY[key]) return TRAINING_OPPONENTS_BY_KEY[key]
  return TRAINING_OPPONENTS_BY_KEY[DEFAULT_TRAINING_OPPONENT_KEY]
}

function syntheticPeerEquipment(rarity, enhancementLevel) {
  return Array.from({ length: 9 }, (_, i) => ({
    id: `synth_${i}`,
    rarity,
    enhancementLevel,
    item: { rarity, enhancementLevel },
  }))
}

function syntheticPeerAttrs(level) {
  const base = 8 + Math.floor(Math.max(1, level) * 0.7)
  return { str: base, agi: base, int: base, def: base }
}

module.exports = {
  TRAINING_OPPONENTS,
  TRAINING_OPPONENTS_BY_KEY,
  DEFAULT_TRAINING_OPPONENT_KEY,
  getTrainingOpponent,
  syntheticPeerEquipment,
  syntheticPeerAttrs,
}
