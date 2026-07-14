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
  floresta: '/backgrounds/floresta-walk-map.webp',
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
 * Remapeia a trilha zigzag do SVG para um caminho vertical (sempre pra cima),
 * com serpenteio em X — usado pelo fallback SVG; treadmill não desenha a trilha.
 */
export function buildWalkPathPoints(rooms: number, minorNodes: number): MapPoint[] {
  const seq: { kind: NodeKind; tier: number }[] = [{ kind: 'start', tier: 0 }]
  for (let t = 1; t <= rooms; t++) {
    for (let m = 0; m < minorNodes; m++) seq.push({ kind: 'minor', tier: t })
    seq.push({ kind: 'main', tier: t })
  }
  seq.push({ kind: 'boss', tier: rooms })

  const last = seq.length - 1
  return seq.map((n, i) => {
    const t = last > 0 ? i / last : 0
    const y = 92 - t * 84
    let x = 50
    if (i > 0 && i < last) {
      x = 50 + (i % 2 === 1 ? -14 : 14) * (0.55 + 0.45 * Math.sin(i * 1.7))
    }
    return { x, y, kind: n.kind, tier: n.tier }
  })
}

export function walkProgress(tokenIdx: number, lastIdx: number): number {
  if (lastIdx <= 0) return 0
  return Math.min(1, Math.max(0, tokenIdx / lastIdx))
}
