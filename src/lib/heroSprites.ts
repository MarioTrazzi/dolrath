// Bonecos de caminhada por raça×classe (16 combinações) — usados na WalkScene.
// O NFT continua sendo a arte pessoal no retrato e no combate; aqui é o boneco genérico
// que anda pela masmorra, para a combinação certa aparecer no mapa.
//
// Assets vêm de scripts/slice-hero-sprite-sheet.ts (recorte determinístico da folha do Gemini):
//   npx tsx scripts/slice-hero-sprite-sheet.ts --race elfo --class rogue --row 2
// Calibre os índices/fps na bancada /dev/sprite-lab antes de congelar aqui.

/** Lado para o qual a folha original olha. Espelhamos em runtime para o outro lado. */
export type SpriteFacing = 'left' | 'right'

export interface HeroSpriteDef {
  /** Tira horizontal em /public: N frames de frameW x frameH lado a lado. */
  src: string
  frameW: number
  frameH: number
  /** Total de frames da tira (para validar índices). */
  frames: number
  /** Direção do desenho na folha — quem anda para o outro lado é espelhado. */
  facing: SpriteFacing
  /** Ciclo de perfil, na ordem de exibição. */
  walk: number[]
  /** Frame parado (sem passo). Default: walk[0]. */
  idle?: number
  /**
   * Frame de costas (subindo a trilha, andando para o fundo).
   * Como é um só, a animação alterna o espelho para dar o 2º tempo do passo.
   */
  back?: number
  /** Passos por segundo do ciclo. */
  fps: number
}

/**
 * Chave `${raceId}-${classId}`.
 * Raças em PT e classes em EN — é assim que RACES/CLASSES vivem em gameData.ts:
 *   humano | draconiano | metamorfo | elfo   ×   warrior | rogue | mage | monk
 *
 * Combinação sem entrada aqui cai no card antigo da WalkScene (sem regressão).
 */
export const HERO_SPRITES: Record<string, HeroSpriteDef> = {
  // Folha do Gemini, linha 2. [1] e [2] são a mesma pose de passada, [0] tem as pernas
  // juntas (pose de passagem) e [3] é de costas. [4]/[5] são espelhos de [1]/[2] — a folha
  // só tem 2 poses distintas, então o ciclo alterna passada/passagem.
  'elfo-rogue': {
    src: '/sprites/elfo-rogue/walk.webp',
    frameW: 128,
    frameH: 192,
    frames: 6,
    facing: 'right',
    walk: [1, 0, 2, 0],
    idle: 0,
    back: 3,
    fps: 8,
  },
}

/** Altura do boneco na tela (px) na cena de caminhada. */
export const HERO_SPRITE_SCREEN_H = 56

export function heroSpriteKey(race?: string | null, cls?: string | null): string {
  return `${(race || '').trim().toLowerCase()}-${(cls || '').trim().toLowerCase()}`
}

/** Devolve o boneco da combinação, ou null quando ainda não há arte. */
export function getHeroSprite(race?: string | null, cls?: string | null): HeroSpriteDef | null {
  if (!race || !cls) return null
  return HERO_SPRITES[heroSpriteKey(race, cls)] || null
}
