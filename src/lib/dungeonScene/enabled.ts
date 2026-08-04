// Quais masmorras já rodam na CENA explorável (em vez da esteira WalkScene).
//
// A cena precisa de tileset próprio em public/scene/<id>/ e de receita de forma
// em recipes.ts. A arte de ACHADO (baú, erva, fonte) não conta: mora em
// public/scene/common/ e vale para todas.
//
// Ruínas Arcanas segue na WalkScene até ter cenário próprio.

import type { DungeonId } from '@/lib/dungeonAdventures'

const SCENE_READY: DungeonId[] = ['floresta', 'caverna', 'pantano']

export function dungeonSceneEnabled(dungeonId: DungeonId): boolean {
  return SCENE_READY.includes(dungeonId)
}
