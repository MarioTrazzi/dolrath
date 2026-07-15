/**
 * Espelho CJS de src/lib/trainingOpponents.ts — manter sincronizado.
 * Usado pelo socket / training-bot (Node puro). A documentação do modelo (por que o peer
 * espelha o jogador e como o difficultyMult é calibrado) está no arquivo TS.
 */

const TRAINING_OPPONENTS = [
  {
    key: 'lobo',
    name: 'Lobo Faminto',
    dungeonLabel: 'Floresta Sombria',
    difficultyLabel: 'Fácil',
    image: '/monsters/lobo-faminto.webp',
    emoji: '🐺',
    combatClass: 'rogue',
    classNamePt: 'Ladino',
    race: 'Fera',
    difficultyMult: 0.8,
    winRateLabel: '~70%',
    description: 'Espelho seu a 80% — rápido e esquivo. Ótimo para aquecer.',
    attackWeights: { light_attack: 4, heavy_attack: 2 },
  },
  {
    key: 'golem',
    name: 'Golem de Pedra',
    dungeonLabel: 'Caverna de Cristal',
    difficultyLabel: 'Médio',
    image: '/monsters/golem-de-pedra.webp',
    emoji: '🗿',
    combatClass: 'warrior',
    classNamePt: 'Guerreiro',
    race: 'Constructo',
    difficultyMult: 0.9,
    winRateLabel: '~50%',
    description: 'Espelho seu a 90% — couraçado. Luta parelha de verdade.',
    attackWeights: { light_attack: 2, heavy_attack: 4 },
  },
  {
    key: 'crocodilo',
    name: 'Crocodilo Ancião',
    dungeonLabel: 'Pântano Maldito',
    difficultyLabel: 'Difícil',
    image: '/monsters/crocodilo-anciao.webp',
    emoji: '🐊',
    combatClass: 'monk',
    classNamePt: 'Monge',
    race: 'Réptil',
    difficultyMult: 1.08,
    winRateLabel: '~30%',
    description: 'Espelho seu reforçado — pressão séria, exige o kit todo.',
    attackWeights: { light_attack: 2, heavy_attack: 3 },
  },
  {
    key: 'gargula',
    name: 'Gárgula de Obsidiana',
    dungeonLabel: 'Ruínas Arcanas',
    difficultyLabel: 'Muito difícil',
    image: '/monsters/gargula-de-obsidiana.webp',
    emoji: '🦅',
    combatClass: 'mage',
    classNamePt: 'Mago',
    race: 'Constructo',
    difficultyMult: 1.31,
    winRateLabel: '~15%',
    description: 'Espelho seu bem acima — só cai com sorte e uso perfeito.',
    attackWeights: { light_attack: 1, heavy_attack: 4 },
  },
  {
    key: 'leviatan',
    name: 'Leviatã do Abismo',
    dungeonLabel: 'Abismo (em breve)',
    difficultyLabel: 'Imbatível',
    image: '/monsters/leviatan-do-abismo.webp',
    emoji: '🦑',
    combatClass: 'warrior',
    classNamePt: 'Guerreiro',
    race: 'Leviatã',
    difficultyMult: 1.64,
    winRateLabel: '~1%',
    unbeatable: true,
    description: 'Easter egg — praticamente imbatível. Sem recompensa.',
    attackWeights: { light_attack: 1, heavy_attack: 5 },
  },
]

const TRAINING_OPPONENTS_BY_KEY = Object.fromEntries(TRAINING_OPPONENTS.map((o) => [o.key, o]))
const DEFAULT_TRAINING_OPPONENT_KEY = 'lobo'

function getTrainingOpponent(key) {
  if (key && TRAINING_OPPONENTS_BY_KEY[key]) return TRAINING_OPPONENTS_BY_KEY[key]
  return TRAINING_OPPONENTS_BY_KEY[DEFAULT_TRAINING_OPPONENT_KEY]
}

/** Fallback defensivo: só vale se o payload do jogador não trouxer atributos. */
function fallbackPeerAttrs(level) {
  const base = 8 + Math.floor(Math.max(1, level) * 0.2)
  return { str: base, agi: base, int: base, def: base }
}

module.exports = {
  TRAINING_OPPONENTS,
  TRAINING_OPPONENTS_BY_KEY,
  DEFAULT_TRAINING_OPPONENT_KEY,
  getTrainingOpponent,
  fallbackPeerAttrs,
}
