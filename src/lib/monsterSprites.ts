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
}

/** Busca direta pelo slug. `null` = ainda não tem folha ⇒ vulto procedural. */
export function getMonsterSpriteBySlug(slug?: string | null): MonsterSpriteDef | null {
  if (!slug) return null
  return MONSTER_SPRITES[slug] || null
}

/** Busca pelo nome cru do catálogo ("Anciã da Mata") — ninguém escreve slug à mão. */
export function resolveMonsterSprite(name?: string | null): MonsterSpriteDef | null {
  if (!name) return null
  return getMonsterSpriteBySlug(monsterImageSlug(name))
}

/**
 * Espécie do chefe de uma masmorra. O chefe é DETERMINÍSTICO a partir do id da
 * masmorra, então a cena descobre quem ele é sem precisar esperar o servidor —
 * que é o que permite pintar a arte certa já na revelação do nó.
 */
export function bossSpriteSlug(dungeonId: DungeonId): string {
  return monsterImageSlug(DUNGEONS[dungeonId].boss.name)
}
