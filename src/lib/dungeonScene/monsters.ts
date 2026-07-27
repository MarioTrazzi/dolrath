// ============================================================
// Monstros VISÍVEIS no mapa — vulto que anda de um lado para o outro no bolsão.
//
// Por que vulto e não a arte do monstro: os 19 webp de `public/monsters` são
// CARDS pintados 1024×1536 com fundo opaco (0% de alpha). Colar isso no chão
// viraria um retângulo pintado em pé. Recortar não sai automático — o lobo é
// escuro sobre escuro, nenhuma segmentação separa.
//
// Então o mapa mostra a SILHUETA com olhos acesos, que é o vocabulário certo de
// floresta sombria (você vê o vulto se mexendo, não o detalhe), e o card
// pintado aparece no combate — onde ele já é usado e funciona.
//
// Puro (sem DOM): o passo de patrulha é matemática, dá para testar em Node.
// ============================================================

import { seedRng } from '@/lib/walkSceneAssets'
import type { SpotContent } from './nodeContents'
import type { SceneMapDef, Vec2 } from './types'

export interface SceneMonster {
  /** Nó a que pertence — some quando o nó é resolvido. */
  nodeIndex: number
  isBoss: boolean
  /** Centro da ronda. */
  home: Vec2
  /** Extremos do vaivém, em unidades. */
  span: number
  /** Direção da ronda (radianos). */
  angle: number
  /** Velocidade angular do vaivém. */
  speed: number
  /** Defasagem, para o bando não andar em bloco. */
  phase: number
  /** Altura no mundo. */
  size: number
}

/** Posição do vulto no instante `t` (segundos). */
export function monsterPos(m: SceneMonster, t: number): Vec2 {
  const off = Math.sin(t * m.speed + m.phase) * m.span
  return { x: m.home.x + Math.cos(m.angle) * off, y: m.home.y + Math.sin(m.angle) * off }
}

/** Para onde ele está virado agora (+1 direita, −1 esquerda). */
export function monsterFacing(m: SceneMonster, t: number): number {
  const v = Math.cos(t * m.speed + m.phase) * Math.cos(m.angle)
  return v >= 0 ? 1 : -1
}

/**
 * Um bando por nó de combate, espalhado dentro do bolsão.
 * Determinístico: mesma seed ⇒ mesmo bando nas mesmas posições.
 */
export function planMonsters(
  map: SceneMapDef,
  contents: Map<number, SpotContent>,
  seed: string,
): SceneMonster[] {
  const rng = seedRng(`${map.id}:${seed}:mobs`)
  const out: SceneMonster[] = []

  for (const spot of map.spots) {
    const c = contents.get(spot.nodeIndex)
    if (!c || c.category !== 'combat') continue
    const isBoss = c.flavor === 'boss'

    // Bolsão do nó — o raio limita o quanto o bando pode se espalhar.
    const pocket = map.areas.find(
      a => a.kind === 'disc' && Math.hypot(a.c.x - spot.pos.x, a.c.y - spot.pos.y) < 0.5,
    )
    const r = pocket && pocket.kind === 'disc' ? pocket.r : 5

    const count = isBoss ? 1 : spot.kind === 'main' ? 2 + Math.floor(rng() * 2) : 1 + Math.floor(rng() * 2)
    for (let i = 0; i < count; i++) {
      const ang = rng() * Math.PI * 2
      const dist = isBoss ? 0 : r * (0.15 + rng() * 0.4)
      out.push({
        nodeIndex: spot.nodeIndex,
        isBoss,
        home: { x: spot.pos.x + Math.cos(ang) * dist, y: spot.pos.y + Math.sin(ang) * dist },
        // Ronda contida: o vulto não pode sair do bolsão nem cruzar o outro.
        span: Math.min(r * 0.35, 1.2 + rng() * 1.4),
        angle: rng() * Math.PI * 2,
        speed: 0.5 + rng() * 0.5,
        phase: rng() * Math.PI * 2,
        size: isBoss ? 3.4 : 1.5 + rng() * 0.5,
      })
    }
  }

  return out
}
