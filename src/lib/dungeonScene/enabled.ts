// Quais masmorras já rodam na CENA explorável (em vez da esteira WalkScene).
//
// A cena precisa de tileset próprio em public/scene/<id>/ e de receita de forma
// em recipes.ts. A arte de ACHADO (baú, erva, fonte) não conta: mora em
// public/scene/common/ e vale para todas.
//
// As QUATRO masmorras já rodam na cena — a lista virou a lista inteira, e o
// portão fica de pé de propósito: é ele que segura a próxima masmorra fora do ar
// enquanto ela não tiver arte, e é o único lugar a mexer quando tiver.
//
// ⚠️ Com isto a WalkScene fica sem nenhuma masmorra chamando por ela. Não foi
// removida nesta passada; ver o comentário no topo de WalkScene.tsx.

import type { DungeonId } from '@/lib/dungeonAdventures'

const SCENE_READY: DungeonId[] = ['floresta', 'caverna', 'pantano', 'ruinas']

export function dungeonSceneEnabled(dungeonId: DungeonId): boolean {
  return SCENE_READY.includes(dungeonId)
}
