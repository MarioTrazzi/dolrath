// ============================================================
// O que a CENA sabe sobre cada nó.
//
// Isto já foi o planejador do conteúdo da run. Não é mais: quem decide o
// arranjo é `lib/dungeonRunPlan.ts`, uma função pura semeada pelo `runId` que o
// SERVIDOR também roda — antes o servidor sorteava no /step, nó a nó, e por
// isso o cliente não podia mostrar nada além de um "?" até o herói chegar lá.
//
// Aqui sobrou o que é de cena: o formato que o desenho consome e a adaptação da
// planta para ele.
// ============================================================

import { planDungeonRun, type NodeCategory, type NodeFlavor } from '@/lib/dungeonRunPlan'
import { DUNGEONS, monsterImageSlug } from '@/lib/dungeonAdventures'
import type { SceneMapDef } from './types'

export type { NodeCategory, NodeFlavor }

export interface SpotContent {
  nodeIndex: number
  category: NodeCategory
  flavor: NodeFlavor
  /**
   * Espécies do bando, na ordem — é o que faz a cena desenhar LOBO onde vai
   * aparecer lobo, e na quantidade certa (ver lib/monsterSprites.ts).
   * Ausente = a cena cai no vulto, sem regressão.
   */
  speciesSlugs?: string[]
}

/**
 * Converte a planta da run no que a cena desenha.
 *
 * `seed` é o `runId` na run de verdade — o MESMO que o servidor usa. É isso que
 * garante que o bicho pintado no mapa é o bicho que vai aparecer na luta.
 */
export function planNodeContents(map: SceneMapDef, seed: string): Map<number, SpotContent> {
  const plan = planDungeonRun(DUNGEONS[map.id], seed)
  const out = new Map<number, SpotContent>()
  for (const node of Array.from(plan.values())) {
    out.set(node.nodeIdx, {
      nodeIndex: node.nodeIdx,
      category: node.category,
      flavor: node.flavor,
      speciesSlugs: node.monsters.length ? node.monsters.map(monsterImageSlug) : undefined,
    })
  }
  return out
}

export function contentsSummary(contents: Map<number, SpotContent>) {
  let combats = 0
  let finds = 0
  let boss = 0
  contents.forEach(c => {
    if (c.flavor === 'boss') boss++
    else if (c.category === 'combat') combats++
    else finds++
  })
  return { combats, finds, boss }
}
