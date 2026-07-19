// Assets e seed da cena de caminhada (estilo Anterra).
// Servidor continua dono da trail (kinds/tiers); aqui só mapeamos apresentação.
//
// Ordem de preferência por masmorra:
//   1) segmentos em /public/backgrounds/walk/<id>/*.webp (seed escolhe sequência)
//   2) strip único (ex.: Floresta → forest-dark-map.jpg)
//   3) pintura procedural no canvas (fallback — outras masmorras até gerar arte)

import type { DungeonId } from '@/lib/dungeonAdventures'
import type { MapPoint, NodeKind } from '@/components/dungeon/DungeonMap'

export type WalkSegmentKind =
  | 'clearing'
  | 'pines'
  | 'rocks'
  | 'brook'
  | 'cave-mouth'
  | 'ruins'
  | 'mire'
  | 'crystals'
  | 'bones'
  | 'path'

export interface WalkSegmentDef {
  kind: WalkSegmentKind
  /** Caminho público se o asset existir (gerado via scripts/generate-walk-segments.ts). */
  src?: string
  label: string
}

/** Catálogo de segmentos por masmorra — path entra embaixo e sai em cima (mesmo X). */
export const WALK_SEGMENTS: Record<DungeonId, WalkSegmentDef[]> = {
  floresta: [
    { kind: 'clearing', src: '/backgrounds/walk/floresta/clearing.webp', label: 'Clareira' },
    { kind: 'pines', src: '/backgrounds/walk/floresta/pines.webp', label: 'Pinheiros' },
    { kind: 'rocks', src: '/backgrounds/walk/floresta/rocks.webp', label: 'Pedras' },
    { kind: 'brook', src: '/backgrounds/walk/floresta/brook.webp', label: 'Riacho' },
    { kind: 'cave-mouth', src: '/backgrounds/walk/floresta/cave-mouth.webp', label: 'Boca de caverna' },
    { kind: 'path', src: '/backgrounds/walk/floresta/path.webp', label: 'Trilha' },
  ],
  caverna: [
    { kind: 'crystals', src: '/backgrounds/walk/caverna/crystals.webp', label: 'Cristais' },
    { kind: 'rocks', src: '/backgrounds/walk/caverna/rocks.webp', label: 'Rocha' },
    { kind: 'cave-mouth', src: '/backgrounds/walk/caverna/cave-mouth.webp', label: 'Túnel' },
    { kind: 'path', src: '/backgrounds/walk/caverna/path.webp', label: 'Galeria' },
    { kind: 'bones', src: '/backgrounds/walk/caverna/bones.webp', label: 'Ossos' },
    { kind: 'clearing', src: '/backgrounds/walk/caverna/clearing.webp', label: 'Câmara' },
  ],
  pantano: [
    { kind: 'mire', src: '/backgrounds/walk/pantano/mire.webp', label: 'Lodo' },
    { kind: 'brook', src: '/backgrounds/walk/pantano/brook.webp', label: 'Água parada' },
    { kind: 'path', src: '/backgrounds/walk/pantano/path.webp', label: 'Passagem' },
    { kind: 'rocks', src: '/backgrounds/walk/pantano/rocks.webp', label: 'Raízes' },
    { kind: 'bones', src: '/backgrounds/walk/pantano/bones.webp', label: 'Restos' },
    { kind: 'clearing', src: '/backgrounds/walk/pantano/clearing.webp', label: 'Clareira úmida' },
  ],
  ruinas: [
    { kind: 'ruins', src: '/backgrounds/walk/ruinas/ruins.webp', label: 'Arco' },
    { kind: 'path', src: '/backgrounds/walk/ruinas/path.webp', label: 'Corredor' },
    { kind: 'bones', src: '/backgrounds/walk/ruinas/bones.webp', label: 'Cripta' },
    { kind: 'rocks', src: '/backgrounds/walk/ruinas/rocks.webp', label: 'Entulho' },
    { kind: 'clearing', src: '/backgrounds/walk/ruinas/clearing.webp', label: 'Praça' },
    { kind: 'cave-mouth', src: '/backgrounds/walk/ruinas/cave-mouth.webp', label: 'Portão' },
  ],
}

/** Strip único conhecido (Fase A / treadmill). */
export const WALK_FULL_STRIP: Partial<Record<DungeonId, string>> = {
  floresta: '/backgrounds/floresta-run-map.webp',
  caverna: '/backgrounds/caverna-run-map.webp',
  pantano: '/backgrounds/pantano-run-map.webp',
  ruinas: '/backgrounds/ruinas-run-map.webp',
}

/** Battle BG cinematográfico (combate Floresta). */
export const FLORESTA_BATTLE_BG = '/backgrounds/floresta-battle.webp'

/** Battle BG cinematográfico por masmorra (biome-swap a partir da arte da Floresta). */
export const DUNGEON_BATTLE_BG: Record<DungeonId, string> = {
  floresta: '/backgrounds/floresta-battle.webp',
  caverna: '/backgrounds/caverna-battle.webp',
  pantano: '/backgrounds/pantano-battle.webp',
  ruinas: '/backgrounds/ruinas-battle.webp',
}

/** Mapa da run (top-down, mapa grande de RPG) por masmorra — fundo da fase de exploração. */
export const DUNGEON_RUN_MAP_BG: Record<DungeonId, string> = {
  floresta: '/backgrounds/floresta-run-map.webp',
  caverna: '/backgrounds/caverna-run-map.webp',
  pantano: '/backgrounds/pantano-run-map.webp',
  ruinas: '/backgrounds/ruinas-run-map.webp',
}

/** Fallback se a arte nova ainda não existir. */
export const FLORESTA_BATTLE_BG_FALLBACK = '/hero-masmorra-floresta.webp'
export const FLORESTA_WALK_FALLBACK = '/backgrounds/forest-dark-map.jpg'

/** Sprite genérico de caminhada (NFT continua no retrato/combate). */
export const WALK_HERO_SPRITE = '/hero-masmorra-floresta.webp'

export function walkSceneEnabled(_dungeonId: DungeonId): boolean {
  // WalkScene em todas as masmorras: strip real, segmentos ou procedural.
  return Boolean(_dungeonId)
}

/** PRNG determinístico (mulberry32) a partir de string seed. */
export function seedRng(seed: string): () => number {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    h ^= h >>> 16
    return (h >>> 0) / 4294967296
  }
}

/**
 * Escolhe N segmentos para a run. Prefere assets com `src`; se nenhum asset
 * existir ainda, devolve defs mesmo assim (WalkScene pinta procedural pelo kind).
 */
export function pickWalkSegments(
  dungeonId: DungeonId,
  seed: string,
  count: number,
): WalkSegmentDef[] {
  const pool = WALK_SEGMENTS[dungeonId]
  if (!pool.length) return []
  const rand = seedRng(`${dungeonId}:${seed}:walk`)
  const out: WalkSegmentDef[] = []
  let last = -1
  for (let i = 0; i < count; i++) {
    let idx = Math.floor(rand() * pool.length)
    if (pool.length > 1 && idx === last) idx = (idx + 1) % pool.length
    last = idx
    out.push(pool[idx])
  }
  return out
}

/** Quantos segmentos empilhar para cobrir a trilha (mín. 3, ~1 por 2–3 nós). */
export function segmentCountForTrail(nodeCount: number): number {
  return Math.max(3, Math.ceil(nodeCount / 2))
}

/**
 * Trilha no mapa único (pan, sem tiling): começa bem embaixo, zigzag largo
 * nas laterais, boss no topo ao centro. Coordenadas em % do mapa (x/y 0–100).
 *
 * Com `seed`, o layout é sorteado (estável para o mesmo seed): x dos nós
 * intermediários vagueia entre as laterais e o y sobe com espaçamento
 * irregular — cada run parece uma exploração diferente. Sem seed, mantém o
 * zigzag determinístico (landing/journey depende dele).
 */
export function buildWalkPathPoints(rooms: number, minorNodes: number, seed?: string): MapPoint[] {
  const seq: { kind: NodeKind; tier: number }[] = [{ kind: 'start', tier: 0 }]
  for (let t = 1; t <= rooms; t++) {
    for (let m = 0; m < minorNodes; m++) seq.push({ kind: 'minor', tier: t })
    seq.push({ kind: 'main', tier: t })
  }
  seq.push({ kind: 'boss', tier: rooms })

  const last = seq.length - 1
  if (seed !== undefined && last > 1) {
    const rand = seedRng('layout:' + seed)
    // Margens seguras p/ card do herói + fog (câmera clampa com MAP_ZOOM 1.2).
    const X_MIN = 18
    const X_MAX = 82
    // Zigue-zague garantido: nem segmento vertical morto, nem quase horizontal.
    const MIN_DX = 14
    const MAX_DX = 40

    // Y: subida monotônica com gaps de peso sorteado (razão máx ~2:1).
    const weights: number[] = []
    let total = 0
    for (let g = 0; g < last; g++) {
      const w = 0.65 + rand() * 0.7
      weights.push(w)
      total += w
    }

    const xs: number[] = [50]
    for (let i = 1; i < last; i++) {
      const prev = xs[i - 1]
      // Penúltimo nó fica perto do eixo pro segmento final até o boss não chicotear.
      const lo = i === last - 1 ? 32 : X_MIN
      const hi = i === last - 1 ? 68 : X_MAX
      // Tende a cruzar o centro; 25% de chance de insistir no mesmo lado.
      let dir = prev >= 50 ? -1 : 1
      if (rand() < 0.25) dir = -dir
      // Se o lado sorteado não comporta o passo mínimo, inverte. Um dos lados
      // sempre comporta: os dois falharem exigiria hi - lo < 2×MIN_DX, e o
      // range mais apertado ([32,68]) tem largura 36 > 28.
      if (dir === 1 ? prev + MIN_DX > hi : prev - MIN_DX < lo) dir = -dir
      const step = MIN_DX + rand() * (MAX_DX - MIN_DX)
      xs.push(dir === 1 ? Math.min(prev + step, hi) : Math.max(prev - step, lo))
    }
    xs.push(50)

    let acc = 0
    return seq.map((n, i) => {
      const t = i === 0 ? 0 : (acc += weights[i - 1]) / total
      return { x: xs[i], y: 94 - t * 86, kind: n.kind, tier: n.tier }
    })
  }

  return seq.map((n, i) => {
    const t = last > 0 ? i / last : 0
    // Base ~94% → topo ~8% (boss)
    const y = 94 - t * 86
    let x = 50
    if (i === 0 || i === last) {
      x = 50
    } else {
      // Laterais amplas (~22% / 78%) com leve variação pra não parecer grade
      const side = i % 2 === 1 ? -1 : 1
      const amp = 28 * (0.85 + 0.15 * Math.sin(i * 1.3))
      x = 50 + side * amp
    }
    return { x, y, kind: n.kind, tier: n.tier }
  })
}

export function walkProgress(tokenIdx: number, lastIdx: number): number {
  if (lastIdx <= 0) return 0
  return Math.min(1, Math.max(0, tokenIdx / lastIdx))
}
