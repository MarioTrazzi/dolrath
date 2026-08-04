// ============================================================
// Receitas de bioma — o que dá identidade a cada masmorra no gerador.
//
// A CONTAGEM de salas/nós NÃO mora aqui: vem de DUNGEONS[id].rooms /
// .minorNodes (src/lib/dungeonAdventures.ts), a mesma fonte que o servidor usa
// em buildTrail. A receita só controla a FORMA do lugar.
// ============================================================

import type { DungeonId } from '@/lib/dungeonAdventures'
import type { PropKind, PropMix, ScenePalette } from './types'

export interface BiomeRecipe {
  /** Corredores curtos que não levam a nó nenhum — dão cara de labirinto. */
  deadEnds: number
  /** Quantas variantes de sprite existem por tipo (o motor sorteia entre elas). */
  variants: Record<PropKind, number>
  /**
   * Altura de mundo por tipo, quando o bioma discorda do default do motor.
   * O papel é o mesmo; o que ele desenha é que muda de tamanho (árvore × paredão).
   */
  spriteH?: Partial<Record<PropKind, number>>
  /** Ambiência do céu. Default (ausente) = chuva, como a cena sempre fez. */
  weather?: 'rain' | 'none'
  /** Chance de poça no miolo da clareira. Default (ausente) = 0.055. */
  puddleChance?: number
  /** Passo da grade de espalhamento, em unidades. MAIOR = mata mais rala. */
  propStep: number
  /** Chance de nascer vegetação: [junto da clareira, fundo da mata]. */
  propDensity: [number, number]
  /** Textura de chão tileável servida de /public. */
  groundTexture?: string
  /** Distância entre BOLSÕES consecutivos (um por nó). */
  spacing: number
  /** Passo do passeio lateral — quanto o caminho serpenteia. */
  sway: number
  /** Faixa de raio dos BOLSÕES (o vão escavado na mata). */
  radius: [number, number]
  /** Raio (meia-largura) dos CORREDORES. Pequeno: é passagem, não praça. */
  trailR: number
  /** Curvatura da trilha: 0 = reta seca, alto = serpenteando. */
  bend: number
  /** Raio extra da arena do chefe. */
  bossBonus: number
  palette: ScenePalette
  propMix: PropMix
}

export const BIOME_RECIPES: Record<DungeonId, BiomeRecipe> = {
  // Floresta: mata sólida, corredores tortos e estreitos, bolsões pequenos.
  // Arte: tileset vetorial da CraftPix (importado por scripts/import-craftpix-scene.ts).
  // Cores amostradas do próprio pack para o chão pintado casar com os sprites.
  floresta: {
    variants: { tree: 4, bush: 5, rock: 5, stump: 1, puddle: 1, house: 1 },
    // 'rubble' não é vegetação espalhada: é objeto de nó (ver nodeContents).
    // Grade mais rala (era 3.0): com a câmera mais perto (WORLD_UNITS_ACROSS) a
    // tela mostra menos área, então ~27% menos props ainda enche o olho e
    // renderiza mais leve. A mata funda continua sólida pela propDensity.
    propStep: 3.5,
    propDensity: [0.62, 0.98],
    groundTexture: '/scene/floresta/ground.webp',
    spacing: 17,
    sway: 9,
    radius: [4.5, 7],
    trailR: 2.3,
    bend: 5,
    bossBonus: 4,
    deadEnds: 4,
    palette: {
      deep: '#23260f',
      floor: '#444a21',
      path: '#565c2a',
      canopy: '#3e4a1e',
      bark: '#2b2a17',
      accent: '#a8c05a',
    },
    propMix: { tree: 0.6, bush: 0.24, rock: 0.16 },
  },

  // Caverna: câmaras apertadas, galerias retas, pedra por toda parte.
  // Arte: mesmo tileset da CraftPix, mas o `game_background_2` (uma MINA), com
  // a rocha dessaturada e tingida de ardósia — ver import-craftpix-scene.ts.
  //
  // Os PAPÉIS mudam de significado aqui, e é isso que dá o bioma:
  //   tree  = paredão de rocha (a massa que fecha a galeria)
  //   bush  = aglomerado de cristal (o único ponto de cor)
  //   house = arco de entrada da mina, o marco
  //   stump = vagonete de minério abandonado
  caverna: {
    variants: { tree: 4, bush: 2, rock: 5, stump: 1, puddle: 1, house: 1 },
    // A altura de árvore (6.5) viraria muralha num paredão. Ver SPRITE_H.
    spriteH: { tree: 3.2, bush: 1.7, rock: 1.0, stump: 1.1, house: 4.0, puddle: 3.0 },
    // Não chove a 300m de profundidade.
    weather: 'none',
    propStep: 3.4,
    // Sólido de propósito: caverna que deixa vazar o `deep` entre as pedras não
    // lê como túnel, lê como campo aberto à noite. A mata da Floresta chega a
    // 0.98 pelo mesmo motivo.
    propDensity: [0.55, 0.98],
    groundTexture: '/scene/caverna/ground.webp',
    spacing: 15,
    sway: 5,
    radius: [4, 6],
    trailR: 2.0,
    bend: 2,
    bossBonus: 5,
    deadEnds: 5,
    // Amostrada da arte já recolorizada (média real de ground.webp = #1b252f),
    // não chutada — o chão pintado tem de sumir sob a textura, não brigar com ela.
    palette: {
      deep: '#05080c',
      floor: '#1b252f',
      path: '#232e3a',
      canopy: '#2a3644',
      bark: '#141c26',
      accent: '#22d3ee',
    },
    // O 0.84 de `rock` foi escrito quando não havia paredão nenhum: sem massa
    // alta, a galeria não fechava. Cristal é raro de propósito — é acento.
    propMix: { tree: 0.34, bush: 0.14, rock: 0.52 },
  },

  // Pântano: bolsões de terra firme, passagens sinuosas, vegetação baixa.
  // Arte: mesmo tileset da CraftPix e o MESMO pack da Floresta (`game_background_4`)
  // — a silhueta de mata morta já é a certa para um brejo. O que troca o lugar é o
  // que está embaixo: chão de LAMA (do pack da mina), trilha de ÁGUA (`river_6`) e
  // poça em toda clareira. Ver import-craftpix-scene.ts.
  //
  // Papéis reaproveitados, como na Caverna:
  //   stump  = lápide afundada
  //   house  = choça de pedra tomada pelo limo (NÃO a casinha da Floresta)
  //   rock-5 = ossada
  //   puddle = lagoa parada (1) + poço de lodo tóxico (2), o acento do bioma
  pantano: {
    variants: { tree: 4, bush: 5, rock: 5, stump: 1, puddle: 2, house: 1 },
    // Árvore afogada é mais baixa que árvore de mata (default 6.5). A copa não
    // pode fechar: céu aberto sobre água parada é o que lê como brejo — copa
    // fechada lê como Floresta Sombria, que é exatamente o vizinho de que este
    // bioma precisa se distinguir.
    spriteH: { tree: 4.8, bush: 1.5, puddle: 3.6 },
    propStep: 3.4,
    // Mais arejado que a Floresta (0.62/0.98) pelo mesmo motivo do spriteH.
    propDensity: [0.45, 0.9],
    groundTexture: '/scene/pantano/ground.webp',
    // 2.5× o default: água parada é a identidade daqui, não enfeite.
    puddleChance: 0.14,
    spacing: 16,
    sway: 11,
    radius: [4.5, 7],
    trailR: 2.4,
    bend: 7,
    bossBonus: 4,
    deadEnds: 4,
    // `floor` é a média REAL do ground.webp já recolorido (#262417) e `path` a do
    // road.webp (#242b23) — medidos, não chutados, como na Caverna: o chão pintado
    // tem de sumir sob a textura em vez de brigar com ela.
    palette: {
      deep: '#0a0b06',
      floor: '#262417',
      path: '#242b23',
      canopy: '#2f3a1c',
      bark: '#1a1810',
      accent: '#a3e635',
    },
    // Junco domina, árvore não: é a mistura que abre o céu.
    propMix: { tree: 0.34, bush: 0.5, rock: 0.16 },
  },

  // Ruínas: pátios pequenos, corredores quase retos, entulho.
  ruinas: {
    variants: { tree: 3, bush: 2, rock: 2, stump: 1, puddle: 0, house: 0 },
    propStep: 3.4,
    propDensity: [0.32, 0.8],
    spacing: 17,
    sway: 6,
    radius: [5, 7.5],
    trailR: 2.6,
    bend: 3,
    bossBonus: 5,
    deadEnds: 6,
    palette: {
      deep: '#06040a',
      floor: '#2b2436',
      path: '#3a3142',
      canopy: '#453a55',
      bark: '#221b2d',
      accent: '#c08cf0',
    },
    propMix: { tree: 0.18, bush: 0.14, rock: 0.68 },
  },
}
