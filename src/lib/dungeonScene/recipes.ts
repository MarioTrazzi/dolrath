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
    propStep: 3.0,
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
  caverna: {
    variants: { tree: 3, bush: 2, rock: 2, stump: 1, puddle: 0, house: 0 },
    propStep: 3.4,
    propDensity: [0.32, 0.8],
    spacing: 15,
    sway: 5,
    radius: [4, 6],
    trailR: 2.0,
    bend: 2,
    bossBonus: 5,
    deadEnds: 5,
    palette: {
      deep: '#03060b',
      floor: '#243040',
      path: '#2f3540',
      canopy: '#3a4657',
      bark: '#1a2231',
      accent: '#6fa8dc',
    },
    propMix: { tree: 0.06, bush: 0.1, rock: 0.84 },
  },

  // Pântano: bolsões de terra firme, passagens sinuosas, vegetação baixa.
  pantano: {
    variants: { tree: 3, bush: 2, rock: 2, stump: 1, puddle: 0, house: 0 },
    propStep: 3.4,
    propDensity: [0.32, 0.8],
    spacing: 16,
    sway: 11,
    radius: [4.5, 7],
    trailR: 2.4,
    bend: 7,
    bossBonus: 4,
    deadEnds: 4,
    palette: {
      deep: '#050a05',
      floor: '#26311a',
      path: '#3a3520',
      canopy: '#3f5622',
      bark: '#1d2413',
      accent: '#9fd14a',
    },
    propMix: { tree: 0.42, bush: 0.46, rock: 0.12 },
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
