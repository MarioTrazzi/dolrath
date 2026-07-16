'use client'

// Palco de mapa compartilhado pelos slides 3 (exploração com fog) e 5
// (rumo ao boss): usa as MESMAS peças visuais da run real de masmorra
// (MapTrail/MapNode/PlayerToken/MapAmbient de DungeonMap.tsx). O fog é
// o estado `revealed` por nó — nó sem revelação fica na névoa.

import React from 'react'
import {
  MapTrail,
  MapNode,
  PlayerToken,
  MapAmbient,
  type MapPoint,
  type NodeVisualState,
  type RevealedNode,
} from '@/components/dungeon/DungeonMap'
import { DUNGEONS } from '@/lib/dungeonAdventures'
import { DUNGEON_RUN_MAP_BG } from '@/lib/walkSceneAssets'

export const FOREST = DUNGEONS.floresta

export function nodeStateFor(idx: number, tokenIdx: number): NodeVisualState {
  if (idx < tokenIdx) return 'done'
  if (idx === tokenIdx) return 'current'
  if (idx === tokenIdx + 1) return 'next'
  return 'locked'
}

export default function JourneyMapStage({
  points,
  tokenIdx,
  moving,
  revealed,
  avatar,
  children,
}: {
  points: MapPoint[]
  tokenIdx: number
  moving: boolean
  revealed: Record<number, RevealedNode>
  avatar?: string | null
  children?: React.ReactNode
}) {
  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ '--dgn': FOREST.accent, '--dgn-soft': FOREST.accentSoft } as React.CSSProperties}
    >
      <MapAmbient backgroundImageUrl={DUNGEON_RUN_MAP_BG.floresta} />
      <div className="absolute inset-0 mx-auto max-w-md">
        <MapTrail points={points} />
        {points.map((pt, idx) => (
          <MapNode
            key={idx}
            pt={pt}
            state={nodeStateFor(idx, tokenIdx)}
            revealed={revealed[idx]}
            accent={FOREST.accent}
            bossName={FOREST.boss.name}
          />
        ))}
        <PlayerToken point={points[Math.min(tokenIdx, points.length - 1)]} moving={moving} avatar={avatar} />
      </div>
      {children}
    </div>
  )
}
