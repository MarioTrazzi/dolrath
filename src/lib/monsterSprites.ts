// Bonecos de MONSTRO que rondam o bolsão na masmorra explorável.
//
// Irmão de heroSprites.ts, com uma diferença que muda o desenho inteiro: o
// herói só anda de perfil ou subindo de costas — ele NUNCA vem na direção da
// câmera —, enquanto o monstro ronda em 360° dentro do bolsão. Por isso aqui
// existe `front`, e por isso a ronda de quem tem folha é uma ELIPSE e não o
// vaivém em linha reta do vulto (ver lib/dungeonScene/monsters.ts).
//
// Quem NÃO tem entrada aqui continua sendo a silhueta procedural com olhos
// acesos — sem regressão, e é o certo para os 19 cards pintados sem alpha.
//
// Assets vêm do mesmo recorte determinístico do herói:
//   npx tsx scripts/slice-hero-sprite-sheet.ts --monster ancia-da-mata \
//     --in ~/Downloads/folha.png --rows 1,2 --cell 192x288
// Calibre os índices na bancada /dev/sprite-lab antes de congelar aqui.

import { monsterImageSlug, DUNGEONS, type DungeonId } from '@/lib/dungeonAdventures'
import type { SpriteFacing } from '@/lib/heroSprites'

export interface MonsterSpriteDef {
  /** Tira horizontal em /public: N frames de frameW x frameH lado a lado. */
  src: string
  /** SEMPRE do meta.json — a célula ALARGA quando um frame é largo (a chama). */
  frameW: number
  frameH: number
  frames: number
  /** Direção dos frames de PERFIL na folha; o outro lado é espelhado em runtime. */
  facing: SpriteFacing
  /** Ciclo de perfil. */
  walk: number[]
  /**
   * Ciclo de FRENTE — o bicho vindo na direção da câmera. É o que heroSprites
   * não tem. Ausente = cai no perfil (folha que só desenhou o lado).
   */
  front?: number[]
  /**
   * Ciclo de COSTAS — indo para o fundo da cena.
   *
   * SEMPRE lista, ao contrário do `back: number | number[]` do herói: tratar o
   * array como número dava `frame * frameW = NaN`, e drawImage com NaN não
   * desenha nada — foi o bug que sumia com o herói na subida da trilha.
   */
  back?: number[]
  /** Frame parado. Default: walk[0]. Nunca aponte para um frame de outra direção. */
  idle?: number
  /** Passos por segundo do ciclo. */
  fps: number
  /**
   * Altura do FRAME em unidades de MUNDO (herói = HERO_WORLD_H = 2.1).
   *
   * Substitui o `SceneMonster.size` quando há arte: `size` foi calibrado para a
   * silhueta procedural (cujo corpo desenhado ocupa bem menos que o valor
   * nominal), então não descreve a folha. As duas escalas convivem de propósito.
   */
  worldH: number
}

/**
 * Chave = `monsterImageSlug(nome PT)`, o MESMO slug da arte pintada em
 * /public/monsters — assim a espécie tem um identificador só no jogo inteiro.
 */
export const MONSTER_SPRITES: Record<string, MonsterSpriteDef> = {
  // Chefe da Floresta Sombria. Folha de 12 frames em 2 linhas:
  // [0][1][2] perfil pra direita, [3][4][5] os MESMOS espelhados (não usamos —
  // o espelho sai de graça em runtime), [6][7][8] de frente, [9][10][11] de costas.
  //
  // walk pula o [1]: é o único frame de perfil SEM a chama na mão, e alternar
  // com [0]/[2] faria a chama piscar a cada passo.
  // back pula o [11]: veio da geração com um losango branco chapado no manto
  // (dá pra ver na folha crua) — dois frames já fecham o ciclo.
  'ancia-da-mata': {
    src: '/sprites/monsters/ancia-da-mata/walk.webp',
    frameW: 232,
    frameH: 288,
    frames: 12,
    facing: 'right',
    walk: [0, 2],
    front: [6, 7, 8],
    back: [9, 10],
    fps: 5,
    worldH: 3.6,
  },

  // Mesma diagramação da Anciã, e as mesmas duas exclusões: [1] é o frame de
  // perfil sem a chama, [11] veio com o losango branco da geração.
  // Árvore-gente: mais alto que o herói (2.1) e menor que a chefe (3.6).
  'ent-corrompido': {
    src: '/sprites/monsters/ent-corrompido/walk.webp',
    frameW: 229,
    frameH: 288,
    frames: 12,
    facing: 'right',
    walk: [0, 2],
    front: [6, 7, 8],
    back: [9, 10],
    fps: 5,
    worldH: 3.0,
  },

  // [0][1][2] perfil pra direita (3 fases de verdade — quadrúpede tem passada
  // que lê bem), [3][4][5] os mesmos espelhados, [6..8] de frente, [9..11] de
  // costas com o losango branco no [11].
  'javali-furioso': {
    src: '/sprites/monsters/javali-furioso/walk.webp',
    frameW: 308,
    frameH: 288,
    frames: 12,
    facing: 'right',
    walk: [0, 1, 2],
    front: [6, 7, 8],
    back: [9, 10],
    fps: 7,
    worldH: 1.7,
  },

  // Folha em grade 3x4; a linha 2 (espelho da 1) ficou de fora do recorte, então
  // são 9 frames: [0..2] perfil, [3..5] de frente, [6..8] de costas ([8] tem o
  // losango). fps mais alto: lobo é o bicho rápido do bestiário.
  'lobo-faminto': {
    src: '/sprites/monsters/lobo-faminto/walk.webp',
    frameW: 274,
    frameH: 288,
    frames: 9,
    facing: 'right',
    walk: [0, 1, 2],
    front: [3, 4, 5],
    back: [6, 7],
    fps: 8,
    worldH: 1.8,
  },

  // A folha da aranha é OUTRA ideia: 6 poses × 2 tomadas quase iguais, não
  // perfil/frente/costas. [0]/[6] são a mesma pose de lado em duas variações —
  // vira um ciclo de 2 que lê como o bicho se ajeitando nas patas; [2]/[8] são
  // de frente. Aranha não tem "costas": vista de trás é igual à de lado, então
  // `back` fica de fora e a cena cai no perfil sozinha.
  // [5]/[11] são a pose parada na teia (e a teia prende fundo dentro dela) —
  // não entram em ciclo nenhum.
  'aranha-gigante': {
    src: '/sprites/monsters/aranha-gigante/walk.webp',
    frameW: 319,
    frameH: 288,
    frames: 12,
    facing: 'right',
    walk: [0, 6],
    front: [2, 8],
    fps: 6,
    worldH: 1.6,
  },

  // ---------- Caverna de Cristal ----------
  //
  // Folhas em grade 3x4 (goblin, golem, morcego): [0..5] perfil, [6..8] frente,
  // [9..11] costas. As de paisagem (slime, wyrm) trazem o perfil na linha 1 e
  // frente+costas na linha 2 — ver SHEET_RECIPES em slice-hero-sprite-sheet.ts.
  //
  // O último frame de costas de TODAS elas veio da geração com o mesmo losango
  // branco chapado que a Anciã tem — por isso `back` sempre para antes do fim.

  // Anda de pé, um pouco menor que o herói (2.1). [2] e [5] são os únicos
  // quadros com a mochila ACESA em verde: no ciclo com os apagados, a mochila
  // piscaria a cada passo. Mesmo motivo da chama da Anciã.
  'goblin-minerador': {
    src: '/sprites/monsters/goblin-minerador/walk.webp',
    frameW: 228,
    frameH: 288,
    frames: 12,
    facing: 'right',
    walk: [0, 1, 3, 4],
    front: [6, 7, 8],
    back: [9, 10],
    fps: 6,
    worldH: 1.9,
  },

  // O bruto do bestiário: mais largo e mais alto que o herói, e o fps mais baixo
  // da caverna porque pedra que anda rápido não pesa.
  // [2] e [5] pegaram uma BARRA VERTICAL do quadro vizinho — a grade forçada
  // corta em terços exatos e o braço do vizinho invade a coluna. Ficam de fora.
  'golem-de-pedra': {
    src: '/sprites/monsters/golem-de-pedra/walk.webp',
    frameW: 274,
    frameH: 288,
    frames: 12,
    facing: 'right',
    walk: [0, 1, 3, 4],
    front: [6, 7, 8],
    back: [9, 10],
    fps: 4,
    worldH: 2.8,
  },

  // Voa: fps alto pela asa, e o menor worldH da caverna.
  // [3] veio deformado da geração (asas colapsadas, silhueta menor que as outras)
  // — no ciclo ele lê como engasgo. `back` fica em UM quadro só: o [10] é o
  // morcego de asa FECHADA, metade da silhueta dos vizinhos, então alternar com
  // o [9] pulsaria; e o [11] tem o losango branco.
  'morcego-sombrio': {
    src: '/sprites/monsters/morcego-sombrio/walk.webp',
    frameW: 285,
    frameH: 288,
    frames: 12,
    facing: 'right',
    walk: [0, 1, 2, 4, 5],
    front: [6, 7, 8],
    back: [9],
    fps: 8,
    worldH: 1.6,
  },

  // Folha de paisagem: a linha 1 traz 8 quadros de perfil, sendo [4..7] o
  // ESPELHO de [0..3] — não entram, o espelho sai de graça em runtime. [1] é a
  // pose derretida (sem patas): dentro do ciclo ela vira o pulo gelatinoso.
  'slime-de-cristal': {
    src: '/sprites/monsters/slime-de-cristal/walk.webp',
    frameW: 251,
    frameH: 288,
    frames: 14,
    facing: 'right',
    walk: [0, 1, 2, 3],
    front: [8, 9, 10],
    back: [11, 12],
    fps: 5,
    worldH: 1.7,
  },

  // CHEFE da Caverna. Mesma altura da Anciã da Mata — os dois ocupam o mesmo
  // lugar na hierarquia, e ver o chefe do tamanho de um lobo mata a entrada.
  'wyrm-cristalino': {
    src: '/sprites/monsters/wyrm-cristalino/walk.webp',
    frameW: 323,
    frameH: 288,
    frames: 12,
    facing: 'right',
    walk: [0, 1, 2, 3, 4, 5],
    front: [6, 7],
    back: [9, 10],
    fps: 5,
    worldH: 3.6,
  },
}

/** Busca direta pelo slug. `null` = ainda não tem folha ⇒ vulto procedural. */
export function getMonsterSpriteBySlug(slug?: string | null): MonsterSpriteDef | null {
  if (!slug) return null
  return MONSTER_SPRITES[slug] || null
}

/**
 * Espécie do chefe de uma masmorra. O chefe é DETERMINÍSTICO a partir do id da
 * masmorra, então a cena descobre quem ele é sem precisar esperar o servidor —
 * que é o que permite pintar a arte certa já na revelação do nó.
 */
export function bossSpriteSlug(dungeonId: DungeonId): string {
  return monsterImageSlug(DUNGEONS[dungeonId].boss.name)
}
