/**
 * 🏟️ Adversários de treino — ESPELHOS do jogador, dificuldade em %.
 * Espelho CJS: server/trainingOpponents.js (manter sincronizado).
 *
 * O peer entra com o SEU poder total (mesmo nível, mesmos atributos, mesmo gearTier)
 * e a dificuldade é o quanto ele te supera: `difficultyMult` sobre power/armor/hp/K.
 *
 * ⚖️ Por que mudou (2026-07-15): antes o peer tinha gear FIXO (DUO→PEN, raro/lendário
 * +17..+20) e só o NÍVEL acompanhava o jogador. Um nv4 sem gear pegava um "Lobo · Fácil"
 * com 3.3× a sua escala e poder 58 contra 53 de HP — morria em UM golpe. Pior: o peer
 * também levava atributos inflados (8 + nível×0.7 = 43 por stat no nv50, contra os 18
 * pontos de criação + pisos de um personagem real, já que os pontos de nível vão para a
 * ÁRVORE). Espelhar mata os dois infladores e faz a dificuldade valer o mesmo em
 * qualquer ponto da progressão.
 *
 * 🎯 `difficultyMult` é resolvido POR PEER para um alvo de winrate, porque o mesmo
 * multiplicador NÃO significa a mesma dificuldade em classes diferentes: o PROFILE do
 * guerreiro (armor 160 / hp 438) a ×1.0 dá ~33% ao jogador, enquanto o ladino a ×1.0 dá
 * ~46%. Números calibrados em `scripts/training-peer-sim.js` (4 classes de jogador × 3
 * pontos da progressão). ⚠️ Mexeu no PROFILE, no ATTR_TILT ou no kit? Rode o sim.
 */

export type TrainingCombatClass = 'rogue' | 'warrior' | 'monk' | 'mage'

export interface TrainingOpponentDef {
  key: string
  name: string
  dungeonLabel: string
  difficultyLabel: string
  image: string
  emoji: string
  /** Classe PROFILE usada no computeLevers — dá a IDENTIDADE (o Lobo esquiva, o Golem tanka) */
  combatClass: TrainingCombatClass
  /** Nome PT aceito por normalizeClass no socket */
  classNamePt: string
  race: string
  /** Multiplicador sobre o poder ESPELHADO do jogador. Ver winRateLabel. */
  difficultyMult: number
  /** Winrate que este mult entrega ao jogador (training-peer-sim) — a promessa do rótulo. */
  winRateLabel: string
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

export const TRAINING_OPPONENTS_BY_KEY: Record<string, TrainingOpponentDef> =
  Object.fromEntries(TRAINING_OPPONENTS.map((o) => [o.key, o]))

export const DEFAULT_TRAINING_OPPONENT_KEY = 'lobo'

export function getTrainingOpponent(key: string | null | undefined): TrainingOpponentDef {
  if (key && TRAINING_OPPONENTS_BY_KEY[key]) return TRAINING_OPPONENTS_BY_KEY[key]
  return TRAINING_OPPONENTS_BY_KEY[DEFAULT_TRAINING_OPPONENT_KEY]
}

/**
 * Atributos do peer quando o payload do jogador não traz nenhum (fallback defensivo —
 * o caminho normal ESPELHA os atributos reais do humano). Neutro e modesto de propósito:
 * o antigo `syntheticPeerAttrs` usava 8 + nível×0.7 e inflava o peer sozinho.
 */
export function fallbackPeerAttrs(level: number) {
  const base = 8 + Math.floor(Math.max(1, level) * 0.2)
  return { str: base, agi: base, int: base, def: base }
}
