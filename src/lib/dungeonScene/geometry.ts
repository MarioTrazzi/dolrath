// ============================================================
// Geometria da cena — distâncias, colisão e espalhamento de vegetação.
// Puro (sem DOM/canvas): dá para testar em Node e reusar no servidor depois.
// ============================================================

import { seedRng } from '@/lib/walkSceneAssets'
import type { SceneMapDef, SceneProp, Vec2, WalkArea } from './types'

export function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

export function dist(a: Vec2, b: Vec2) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Ponto mais próximo dentro do segmento a→b. */
function closestOnSegment(a: Vec2, b: Vec2, p: Vec2): Vec2 {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-6) return { x: a.x, y: a.y }
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / len2, 0, 1)
  return { x: a.x + dx * t, y: a.y + dy * t }
}

/** Distância assinada até a borda da área — NEGATIVA dentro. */
export function signedDistToArea(area: WalkArea, p: Vec2): number {
  if (area.kind === 'disc') return dist(p, area.c) - area.r
  const q = closestOnSegment(area.a, area.b, p)
  return dist(p, q) - area.r
}

/** Distância assinada até a área caminhável (união das formas). */
function signedDistToWalkable(map: SceneMapDef, p: Vec2): number {
  let best = Infinity
  for (const area of map.areas) {
    const d = signedDistToArea(area, p)
    if (d < best) best = d
  }
  return best
}

/**
 * Puxa o ponto para dentro da área caminhável (borda da forma mais próxima).
 * É a colisão: em vez de bloquear, o herói desliza pela margem da clareira.
 */
export function clampToWalkable(map: SceneMapDef, p: Vec2, inset = 0.35): Vec2 {
  let bestD = Infinity
  let bestArea: WalkArea | null = null
  for (const area of map.areas) {
    const d = signedDistToArea(area, p)
    if (d < 0) return p // já está dentro de alguma
    if (d < bestD) {
      bestD = d
      bestArea = area
    }
  }
  if (!bestArea) return p

  if (bestArea.kind === 'disc') {
    const dx = p.x - bestArea.c.x
    const dy = p.y - bestArea.c.y
    const len = Math.hypot(dx, dy) || 1
    const r = Math.max(0, bestArea.r - inset)
    return { x: bestArea.c.x + (dx / len) * r, y: bestArea.c.y + (dy / len) * r }
  }
  const q = closestOnSegment(bestArea.a, bestArea.b, p)
  const dx = p.x - q.x
  const dy = p.y - q.y
  const len = Math.hypot(dx, dy) || 1
  const r = Math.max(0, bestArea.r - inset)
  return { x: q.x + (dx / len) * r, y: q.y + (dy / len) * r }
}

// ------------------------------------------------------------
// Vegetação — espalhamento determinístico fora da área caminhável.
// Grade com jitter: barato, sem sobreposição feia, e sempre igual (mesma seed).
// ------------------------------------------------------------

const PROP_CACHE = new Map<string, SceneProp[]>()

export function sceneProps(map: SceneMapDef): SceneProp[] {
  const key = `${map.id}:${map.seed}`
  const cached = PROP_CACHE.get(key)
  if (cached) return cached

  const rng = seedRng(`${map.seed}:props`)
  const mix = map.propMix
  // Sorteia entre as variantes de sprite que EXISTEM no bioma (ver recipes.ts).
  const variantOf = (kind: SceneProp['kind']) =>
    1 + Math.floor(rng() * Math.max(1, map.variants[kind] || 1))
  const out: SceneProp[] = []
  // Marcos entram como prop comum: assim herdam a ordenação por profundidade
  // (o herói passa atrás da casa) sem uma segunda lista no renderer.
  for (const pos of map.landmarks) {
    out.push({ kind: 'house', pos, scale: 1, tone: 0, variant: 1 })
  }
  /** Vegetação perto de um marco é podada — casa soterrada não lê como casa. */
  const nearLandmark = (p: Vec2) => map.landmarks.some(l => dist(l, p) < 7)
  const { minX, maxX, minY, maxY } = map.bounds
  const step = map.propStep

  for (let gy = minY; gy <= maxY; gy += step) {
    for (let gx = minX; gx <= maxX; gx += step) {
      const p = {
        x: gx + (rng() - 0.5) * step * 0.95,
        y: gy + (rng() - 0.5) * step * 0.95,
      }
      const d = signedDistToWalkable(map, p)
      if (nearLandmark(p)) continue
      const roll = rng()

      if (d > 0.6) {
        // Mata: densidade cresce ao se afastar da clareira (borda fica arejada).
        const [dLo, dHi] = map.propDensity
        const density = clamp(dLo + d * 0.09, dLo, dHi)
        if (roll > density) continue
        const far = clamp(d / 14, 0, 1)
        const pick = rng() * (mix.tree + mix.bush + mix.rock)
        const kind: SceneProp['kind'] =
          pick < mix.tree ? 'tree' : pick < mix.tree + mix.bush ? 'bush' : 'rock'
        out.push({
          kind,
          pos: p,
          scale: 0.78 + far * 0.5 + rng() * 0.32,
          tone: rng(),
          variant: variantOf(kind),
        })
      } else if (d > -2.2 && roll < 0.16) {
        // Beirada de dentro: mato baixo e pedras — quebra o círculo perfeito.
        const kind: SceneProp['kind'] =
          rng() < mix.bush / (mix.bush + mix.rock || 1) ? 'bush' : 'rock'
        out.push({
          kind,
          pos: p,
          scale: 0.55 + rng() * 0.35,
          tone: rng(),
          variant: variantOf(kind),
        })
      } else if (d < -3 && roll < (map.puddleChance ?? 0.055) && (map.variants.puddle || 0) > 0) {
        // Poça de água esverdeada no miolo da clareira — deitada no chão, então
        // é a única peça achatada: escala maior sem virar obstáculo visual.
        out.push({
          kind: 'puddle',
          pos: p,
          scale: 0.85 + rng() * 0.75,
          tone: rng(),
          variant: variantOf('puddle'),
        })
      } else if (d < -4 && roll < (map.puddleChance ?? 0.055) + 0.035) {
        // Miolo da clareira: um toco ou pedra solta de vez em quando.
        //
        // A faixa é ACIMA da chance de poça, não abaixo: os dois ramos dividem o
        // MESMO `roll`, e enquanto isto era `roll < 0.035` a condição era
        // inalcançável (a poça já tinha levado tudo abaixo de 0.055) — o toco
        // nunca nasceu em bioma nenhum, nem o crânio da Floresta.
        //
        // Continua RARO de propósito (3,5% numa faixa que é só o miolo fundo da
        // clareira: ~1 a 2 peças a cada 6 mapas). Toco/lápide é achado, não mato.
        const kind: SceneProp['kind'] = rng() < 0.5 ? 'stump' : 'rock'
        out.push({
          kind,
          pos: p,
          scale: 0.5 + rng() * 0.3,
          tone: rng(),
          variant: variantOf(kind),
        })
      }
    }
  }

  // Desenho por profundidade: y crescente = mais perto da câmera.
  out.sort((a, b) => a.pos.y - b.pos.y)
  // Mapas são por-run: não deixa o cache crescer sem fim.
  if (PROP_CACHE.size > 6) PROP_CACHE.clear()
  PROP_CACHE.set(key, out)
  return out
}

/** Waypoints do spot anterior até `nodeIndex`, terminando na posição do spot. */
export function pathToSpot(map: SceneMapDef, nodeIndex: number): Vec2[] {
  const spot = map.spots.find(s => s.nodeIndex === nodeIndex)
  if (!spot) return []
  return [...spot.approach, spot.pos]
}
