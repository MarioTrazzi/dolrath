// Quais masmorras já rodam na CENA explorável (em vez da esteira WalkScene).
//
// A cena precisa de tileset próprio em public/scene/<id>/ e de receita de forma
// em recipes.ts. Hoje só a Floresta Sombria tem as duas coisas; as outras três
// seguem na WalkScene até a arte existir.

import type { DungeonId } from '@/lib/dungeonAdventures'

const SCENE_READY: DungeonId[] = ['floresta']

export function dungeonSceneEnabled(dungeonId: DungeonId): boolean {
  return SCENE_READY.includes(dungeonId)
}
