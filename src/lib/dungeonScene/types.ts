// ============================================================
// Cena de masmorra explorável — tipos do MAPA.
//
// O mundo é top-down em "unidades" (≈ metros). A área caminhável é a UNIÃO de
// formas simples (clareira = disco, trilha = cápsula) — nada de máscara de pixel:
// a arte pode ficar linda por cima sem que a colisão dependa dela.
//
// Os PONTOS de encontro espelham 1:1 a trilha que o servidor já monta em
// `buildTrail` (src/lib/dungeonRunServer.ts): [entrada] + salas × (menores + 1
// principal) + [boss]. O mapa é apresentação; o servidor segue dono dos nós.
// ============================================================

import type { DungeonId } from '@/lib/dungeonAdventures'

export interface Vec2 {
  x: number
  y: number
}

/** Clareira/câmara — área aberta caminhável. */
export interface DiscArea {
  kind: 'disc'
  c: Vec2
  r: number
}

/** Trilha entre clareiras — cápsula (segmento com raio). */
export interface TrailArea {
  kind: 'trail'
  a: Vec2
  b: Vec2
  r: number
}

export type WalkArea = DiscArea | TrailArea

export type SpotKind = 'start' | 'minor' | 'main' | 'boss'

/** Ponto de encontro no mapa = um nó da trilha do servidor. */
export interface MapSpot {
  /** Índice do nó no servidor (0 = entrada). */
  nodeIndex: number
  kind: SpotKind
  /** Sala (clareira) a que pertence — só para leitura/depuração. */
  room: number
  pos: Vec2
  /**
   * Caminho do spot ANTERIOR até este. O explorador idle segue estes pontos e
   * só depois vai até `pos` — é o que faz o herói usar a trilha em vez de cortar
   * reto pela mata.
   */
  approach: Vec2[]
}

export interface ScenePalette {
  /** Fundo fora da área caminhável (mata fechada). */
  deep: string
  /** Chão da clareira. */
  floor: string
  /** Chão da trilha (terra batida). */
  path: string
  /** Copa das árvores. */
  canopy: string
  /** Tronco/pedra. */
  bark: string
  /** Cor de destaque (marcadores, halo). */
  accent: string
}

/** Mistura de vegetação/cenário — muda a cara do bioma sem trocar o motor. */
export interface PropMix {
  tree: number
  bush: number
  rock: number
}

export interface SceneMapDef {
  id: DungeonId
  /** Semente: mesma seed ⇒ mesmo mapa (layout E vegetação). */
  seed: string
  bounds: { minX: number; maxX: number; minY: number; maxY: number }
  areas: WalkArea[]
  spots: MapSpot[]
  palette: ScenePalette
  propMix: PropMix
  /** Passo da grade de vegetação (unidades) e faixa de densidade. */
  propStep: number
  propDensity: [number, number]
  /** Quantas variantes de sprite existem por tipo neste bioma. */
  variants: Record<PropKind, number>
  /** Marcos de cenário (a casinha perdida na mata). Um punhado por mapa, com
   *  clareira de vegetação em volta para não ficarem soterrados. */
  landmarks: Vec2[]
  /** Textura de chão tileável (opcional). Sem ela, pinta cor chapada. */
  groundTexture?: string
  /** Onde o herói nasce. */
  entrance: Vec2
}

export type PropKind = 'tree' | 'bush' | 'rock' | 'stump' | 'puddle' | 'house'

/** Vegetação/cenário espalhado deterministicamente (não bloqueia — decoração). */
export interface SceneProp {
  kind: PropKind
  pos: Vec2
  /** Escala relativa (0.7–1.4). */
  scale: number
  /** Variação de tom, 0–1 (só o desenho procedural usa). */
  tone: number
  /** Qual sprite gerado usar (1..n). Sem arte, cai no procedural. */
  variant: number
}
