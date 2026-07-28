// Bonecos de caminhada por raça×classe (16 combinações) — usados na WalkScene.
// O NFT continua sendo a arte pessoal no retrato e no combate; aqui é o boneco genérico
// que anda pela masmorra, para a combinação certa aparecer no mapa.
//
// Assets vêm de scripts/slice-hero-sprite-sheet.ts (recorte determinístico da folha do Gemini):
//   npx tsx scripts/slice-hero-sprite-sheet.ts --race elfo --class rogue --row 2
// Calibre os índices/fps na bancada /dev/sprite-lab antes de congelar aqui.

import { normalizeCombatClass } from '@/lib/combatModel'

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
  /**
   * Frame parado (sem passo). Default: walk[0].
   *
   * ⚠️ NUNCA aponte para um frame FRONTAL. Na masmorra o herói só anda de lado
   * ou subindo de costas — ele nunca vem na direção da câmera, então uma pose
   * de frente destoa na hora que a run pausa. Só use `idle` quando a folha
   * tiver uma pose de PERFIL com as pernas juntas (é o caso do elfo/ladino);
   * senão deixe de fora e o default cai no primeiro frame do ciclo, que já é
   * de perfil.
   */
  idle?: number
  /**
   * Costas — o herói subindo a trilha, andando para o fundo.
   * Lista = ciclo de verdade. Um número só = a folha só tinha uma pose de
   * costas, e aí a animação alterna o espelho pra dar o 2º tempo do passo.
   */
  back?: number | number[]
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
  // ---------- humano ----------

  // [0] costas de frente pro fundo, [1] costas em 3/4 com passada, [2] perfil
  // pra direita em passada larga, [3] espelho do [2], [4] perfil pra direita em
  // meia passada, [5] 3/4 de costas (fora do ciclo — é o erro do draconiano).
  'humano-warrior': {
    src: '/sprites/humano-warrior/walk.webp',
    frameW: 130,
    frameH: 192,
    frames: 6,
    facing: 'right',
    walk: [2, 4],
    back: [0, 1],
    fps: 4,
  },

  // Mesmo layout do guerreiro: [0]/[1] costas, [2] e [4] perfil pra direita em
  // fases diferentes, [3] espelho do [2], [5] 3/4 de costas.
  'humano-rogue': {
    src: '/sprites/humano-rogue/walk.webp',
    frameW: 134,
    frameH: 192,
    frames: 6,
    facing: 'right',
    walk: [2, 4],
    back: [0, 1],
    fps: 4,
  },

  // [2] é a passada larga e [4]/[5] a meia passada (idênticas entre si). [3] é
  // um perfil bonito de pernas juntas, mas olhando pra ESQUERDA — não dá pra
  // misturar com [2]/[4] no mesmo ciclo, porque a cena espelha a tira inteira.
  'humano-monk': {
    src: '/sprites/humano-monk/walk.webp',
    frameW: 128,
    frameH: 192,
    frames: 6,
    facing: 'right',
    walk: [2, 4],
    back: [0, 1],
    fps: 4,
  },

  // Recortado de DUAS linhas da folha (--rows 2,4): perfil na 2, costas na 4.
  //   [0..5]  linha 2 — [0]/[3] frontal, [1]/[2] passada, [4]/[5] espelhos
  //   [6..11] linha 4 — costas; [7],[8],[11] são passadas (dois pés separados,
  //           vão de ~62px) e [6],[9],[10] estão parados (bloco único)
  // Primeira folha com ciclo de costas de verdade, em vez do espelho alternado.
  'humano-mage': {
    src: '/sprites/humano-mage/walk.webp',
    frameW: 156,
    frameH: 192,
    frames: 12,
    facing: 'right',
    walk: [1, 2],
    back: [7, 8, 11],
    fps: 4,
  },

  // ---------- elfo ----------

  // [0]/[3] são a mesma pose frontal com a lança, [1] é de costas e [2]/[4]/[5]
  // são perfis pra esquerda. As pernas de [2] e [4] mal diferem (0.05 na
  // silhueta), então o passo é discreto — e a LANÇA some nos frames de perfil,
  // que é coisa do Gemini, não do recorte.
  //
  // ⚠️ Único que sai ~12% MENOR que os outros na tela (158px de corpo contra
  // 179 da mediana): a lança na vertical dos frames [0]/[3] esticou a bbox da
  // linha, e o recorte escala a linha inteira por ela. Some junto com a lança
  // se a folha for refeita sem pose frontal. `review-hero-sprites.ts` mede.
  'elfo-warrior': {
    src: '/sprites/elfo-warrior/walk.webp',
    frameW: 128,
    frameH: 192,
    frames: 6,
    facing: 'left',
    walk: [2, 4],
    back: [1],
    fps: 4,
  },

  // ⚠️ Recortado da linha 1, não da 2: nesta folha o Gemini pôs a caminhada em
  // cima e o parado-com-cajado embaixo. A linha 2 só tinha poses de frente.
  // [0] frontal, [1]/[2] costas quase iguais (uma serve), [3]/[4]/[5] perfil
  // pra direita — [4] é o que mais difere de [3]. O cajado some no perfil.
  'elfo-mage': {
    src: '/sprites/elfo-mage/walk.webp',
    frameW: 128,
    frameH: 192,
    frames: 6,
    facing: 'right',
    walk: [3, 4],
    back: [1],
    fps: 4,
  },

  // [0], [1] e [3] são a mesma pose de costas — uma basta, a cena espelha pra
  // dar o 2º tempo. [2]/[4]/[5] são perfis pra direita; [4] é o que mais
  // difere de [2].
  'elfo-monk': {
    src: '/sprites/elfo-monk/walk.webp',
    frameW: 128,
    frameH: 192,
    frames: 6,
    facing: 'right',
    walk: [2, 4],
    back: [1],
    fps: 4,
  },

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

  // ---------- draconiano ----------

  // ⚠️ FOLHA FRACA — pedir de novo ao Gemini (ver hero-sprite-sheet-prompt.md).
  // A linha de caminhada veio [0] frontal, [1][2][3] costas, [4] perfil, [5] 3/4
  // de costas: UM único frame de perfil em seis. O ciclo antigo era [4, 5], e [5]
  // é o 3/4 de costas — a cada segundo frame o boneco virava as costas pra
  // câmera. Andando pra direita isso lia como "o draconiano some", que foi
  // exatamente o relato. Enquanto não vem folha nova, o ciclo é o frame de
  // perfil sozinho: parado dentro do passo, mas coerente.
  //
  // Costas: [2] e [3] são espelhos um do outro, o que alterna as pernas de
  // graça. Efeito colateral: a espada nas costas troca de ombro a cada frame.
  // A 4 fps quase não se nota; se incomodar, back: [2] sozinho dá o mesmo
  // resultado (a cena espelha um frame único).
  'draconiano-warrior': {
    src: '/sprites/draconiano-warrior/walk.webp',
    frameW: 148,
    frameH: 192,
    frames: 6,
    facing: 'left',
    walk: [4],
    back: [2, 3],
    fps: 4,
  },

  // Melhor folha do draconiano: [0] e [3] são a mesma pose de costas, e
  // [1]/[2]/[4]/[5] são quatro perfis pra esquerda em duas fases ([1]≈[2],
  // [4]≈[5]). A folha veio rotulada "WALK (BACK & SIDES ONLY)" — foi o pedido
  // sem pose frontal pegando, enfim.
  'draconiano-rogue': {
    src: '/sprites/draconiano-rogue/walk.webp',
    frameW: 128,
    frameH: 192,
    frames: 6,
    facing: 'left',
    walk: [1, 4],
    back: [0],
    fps: 4,
  },

  // [0]/[1] são costas com o cajado (uma é o espelho da outra, o que já alterna
  // as pernas). [2]/[4] olham pra direita e [3]/[5] são os espelhos deles. O
  // cajado some nos frames de perfil — de novo o Gemini, não o recorte.
  'draconiano-mage': {
    src: '/sprites/draconiano-mage/walk.webp',
    frameW: 128,
    frameH: 192,
    frames: 6,
    facing: 'right',
    walk: [2, 4],
    back: [0, 1],
    fps: 4,
  },

  // ---------- metamorfo ----------

  // Junto com o ladino, a folha mais limpa do lote: cinco perfis pra esquerda
  // ([0], [1], [2], [4], [5]) e [3] de costas. Só que as pernas de [1], [2],
  // [4] e [5] são a mesma fase (0.02–0.08 de diferença na silhueta) — quem
  // destoa de verdade é [0]. Daí o ciclo de duas poses.
  'metamorfo-warrior': {
    src: '/sprites/metamorfo-warrior/walk.webp',
    frameW: 138,
    frameH: 192,
    frames: 6,
    facing: 'left',
    walk: [0, 1],
    back: [3],
    fps: 4,
  },

  // Layout idêntico ao do guerreiro metamorfo, até nos números.
  'metamorfo-rogue': {
    src: '/sprites/metamorfo-rogue/walk.webp',
    frameW: 128,
    frameH: 192,
    frames: 6,
    facing: 'left',
    walk: [0, 1],
    back: [3],
    fps: 4,
  },

  // [0] costas com a tocha, [1] costas em 3/4, [2] e [4] perfis pra direita em
  // fases diferentes, [3] espelho do [2], [5] 3/4 de costas.
  'metamorfo-mage': {
    src: '/sprites/metamorfo-mage/walk.webp',
    frameW: 128,
    frameH: 192,
    frames: 6,
    facing: 'right',
    walk: [2, 4],
    back: [0, 1],
    fps: 4,
  },

  // A linha de caminhada desta folha já traz perfil E costas, então basta a
  // linha 2 (as transformações urso/lobo/águia estão na 4ª, guardadas pra
  // depois). [2] é espelho de [3]; [3] e [4] são o mesmo lado em fases
  // diferentes e viram o ciclo — e olham pra ESQUERDA, ao contrário das outras
  // duas folhas. [1] e [5] são duas costas distintas (nem iguais nem
  // espelhadas), então dá ciclo de costas de verdade.
  'metamorfo-monk': {
    src: '/sprites/metamorfo-monk/walk.webp',
    frameW: 128,
    frameH: 192,
    frames: 6,
    facing: 'left',
    walk: [3, 4],
    back: [1, 5],
    fps: 4,
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

/**
 * Igual ao getHeroSprite, mas TOLERANTE ao que vem do banco: a raça pode chegar
 * com maiúscula/acento ("Elfo") e a classe em português ("Ladino"). Sem isto o
 * lookup cru falha em silêncio e o herói cai no retrato, que foi exatamente o
 * bug de produção. Use esta função nas cenas; a de cima fica por compatibilidade.
 */
export function resolveHeroSprite(race?: string | null, cls?: string | null): HeroSpriteDef | null {
  const r = (race || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
  const c = normalizeCombatClass(cls)
  if (!r || !c) return null
  return HERO_SPRITES[`${r}-${c}`] || null
}
