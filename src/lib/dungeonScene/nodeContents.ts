// ============================================================
// O que tem em cada nó — SORTEIO COM ORÇAMENTO FIXO.
//
// Regra de ouro (pedido do Mario): a aleatoriedade muda o ARRANJO, nunca o
// ORÇAMENTO. Todo jogador que entra na mesma masmorra enfrenta o MESMO número
// de batalhas e recebe o MESMO número de achados. O que muda de run para run é
// ONDE eles estão e COM QUE CARA aparecem. Assim ninguém abre vantagem
// econômica por sorte de mapa.
//
// (Hoje o servidor decide monstro-ou-achado por nó com o d20, então dois
// jogadores JÁ recebem quantidades diferentes de luta. Isto conserta isso.)
//
// É uma função PURA de (seed, masmorra): cliente e servidor chegam ao mesmo
// resultado sem precisar de coluna nova no banco — a seed é o runId.
// ============================================================

import { seedRng } from '@/lib/walkSceneAssets'
import { DUNGEONS, monsterImageSlug, type DungeonId } from '@/lib/dungeonAdventures'
import type { SceneMapDef } from './types'

export type NodeCategory = 'combat' | 'find'
export type NodeFlavor = 'monster' | 'boss' | 'chest' | 'rubble' | 'herb' | 'fountain'

export interface SpotContent {
  nodeIndex: number
  category: NodeCategory
  flavor: NodeFlavor
  /**
   * Espécies do bando, na ordem — é o que faz a cena desenhar LOBO onde vai
   * aparecer lobo, em vez de um vulto genérico (ver lib/monsterSprites.ts).
   *
   * Na run de verdade quem preenche é o servidor, na chegada ao nó: só ele
   * decide o bando, e adiantar isso no cliente seria mentir para o jogador.
   * Aqui o palpite é determinístico e serve para a bancada /dev, onde não há
   * servidor. Ausente = a cena cai no vulto, sem regressão.
   */
  speciesSlugs?: string[]
}

/** Fatia dos nós MENORES que vira achado em vez de luta. Nós principais e o
 *  chefe são sempre combate — é neles que a masmorra gateia progressão. */
const FIND_FRACTION = 0.34

/** No máximo uma fonte por run: cura cheia vale muito. */
const MAX_FOUNTAIN = 1

/** Peso do tipo de achado por bioma — só sabor + viés de tabela de loot. */
const FIND_WEIGHTS: Record<DungeonId, Partial<Record<NodeFlavor, number>>> = {
  floresta: { herb: 4, chest: 3, rubble: 2, fountain: 2 },
  caverna: { rubble: 5, chest: 3, herb: 1, fountain: 2 },
  pantano: { herb: 4, rubble: 3, chest: 2, fountain: 2 },
  ruinas: { rubble: 4, chest: 4, herb: 1, fountain: 2 },
}

/** Fisher-Yates com RNG semeado — embaralha sem consumir aleatoriedade real. */
function shuffle<T>(arr: T[], rng: () => number): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function pickWeighted(
  weights: Partial<Record<NodeFlavor, number>>,
  rng: () => number,
  exclude: Set<NodeFlavor>,
): NodeFlavor {
  const entries = (Object.entries(weights) as [NodeFlavor, number][]).filter(
    ([k]) => !exclude.has(k),
  )
  const total = entries.reduce((s, [, w]) => s + w, 0)
  if (total <= 0) return 'chest'
  let r = rng() * total
  for (const [k, w] of entries) {
    r -= w
    if (r <= 0) return k
  }
  return entries[entries.length - 1][0]
}

/**
 * Distribui o conteúdo dos nós de uma run.
 * `seed` deve ser o runId na run real (mesma run ⇒ mesmo mapa e mesmos nós).
 */
export function planNodeContents(map: SceneMapDef, seed: string): Map<number, SpotContent> {
  const rng = seedRng(`${map.id}:${seed}:nodes`)
  const out = new Map<number, SpotContent>()
  const dungeon = DUNGEONS[map.id]

  const minors = map.spots.filter(s => s.kind === 'minor').map(s => s.nodeIndex)
  const findCount = Math.round(minors.length * FIND_FRACTION)

  // ORÇAMENTO FIXO: quantos achados — sempre o mesmo para esta masmorra.
  // SORTEIO: quais nós menores recebem os achados.
  const findSet = new Set(shuffle(minors, rng).slice(0, findCount))

  let fountains = 0
  for (const spot of map.spots) {
    if (spot.kind === 'start') continue

    if (spot.kind === 'boss') {
      out.set(spot.nodeIndex, {
        nodeIndex: spot.nodeIndex,
        category: 'combat',
        flavor: 'boss',
        speciesSlugs: [monsterImageSlug(dungeon.boss.name)],
      })
      continue
    }

    if (spot.kind === 'main' || !findSet.has(spot.nodeIndex)) {
      // Bando de 1-3 do bestiário da masmorra, todos da mesma espécie: bicho de
      // mata anda em alcateia, e um lobo com uma aranha junto lê como bug.
      const species = dungeon.monsters[Math.floor(rng() * dungeon.monsters.length)]
      const size = spot.kind === 'main' ? 2 + Math.floor(rng() * 2) : 1 + Math.floor(rng() * 2)
      out.set(spot.nodeIndex, {
        nodeIndex: spot.nodeIndex,
        category: 'combat',
        flavor: 'monster',
        speciesSlugs: Array.from({ length: size }, () => monsterImageSlug(species.name)),
      })
      continue
    }

    const exclude = new Set<NodeFlavor>()
    if (fountains >= MAX_FOUNTAIN) exclude.add('fountain')
    const flavor = pickWeighted(FIND_WEIGHTS[map.id], rng, exclude)
    if (flavor === 'fountain') fountains++
    out.set(spot.nodeIndex, { nodeIndex: spot.nodeIndex, category: 'find', flavor })
  }

  return out
}

/** Resumo da run — serve para PROVAR o orçamento fixo na bancada. */
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
