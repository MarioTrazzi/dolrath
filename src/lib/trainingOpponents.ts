/**
 * Adversários de treino PvP — peers de mesmo nível, força via gear (DUO→PEN).
 * Espelho CJS: server/trainingOpponents.js (manter sincronizado).
 */

export type TrainingCombatClass = 'rogue' | 'warrior' | 'monk' | 'mage'

export interface TrainingOpponentDef {
  key: string
  name: string
  dungeonLabel: string
  difficultyLabel: string
  gearLabel: string
  image: string
  emoji: string
  /** Classe PROFILE usada no computeLevers (peer PvP) */
  combatClass: TrainingCombatClass
  /** Nome PT aceito por normalizeClass no socket */
  classNamePt: string
  race: string
  rarity: 'RARE' | 'EPIC' | 'LEGENDARY'
  enhancementLevel: number
  /** Multiplicador extra nos levers após derive (Gárgula / Leviatã) */
  leverMult?: number
  unbeatable?: boolean
  description: string
  /** Pesos da AI do bot */
  attackWeights: { light_attack: number; heavy_attack: number }
}

export const TRAINING_OPPONENTS: TrainingOpponentDef[] = [
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

export const TRAINING_OPPONENTS_BY_KEY: Record<string, TrainingOpponentDef> =
  Object.fromEntries(TRAINING_OPPONENTS.map((o) => [o.key, o]))

export const DEFAULT_TRAINING_OPPONENT_KEY = 'lobo'

export function getTrainingOpponent(key: string | null | undefined): TrainingOpponentDef {
  if (key && TRAINING_OPPONENTS_BY_KEY[key]) return TRAINING_OPPONENTS_BY_KEY[key]
  return TRAINING_OPPONENTS_BY_KEY[DEFAULT_TRAINING_OPPONENT_KEY]
}

/** 9 slots sintéticos no gear-alvo (deriveGearTier / NOMINAL_SLOTS). */
export function syntheticPeerEquipment(rarity: string, enhancementLevel: number) {
  return Array.from({ length: 9 }, (_, i) => ({
    id: `synth_${i}`,
    rarity,
    enhancementLevel,
    item: { rarity, enhancementLevel },
  }))
}

/** Atributos neutros escalados pelo nível (tilt leve, sem build extrema). */
export function syntheticPeerAttrs(level: number) {
  const base = 8 + Math.floor(Math.max(1, level) * 0.7)
  return { str: base, agi: base, int: base, def: base }
}
