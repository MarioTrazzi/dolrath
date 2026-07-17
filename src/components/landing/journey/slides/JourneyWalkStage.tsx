'use client'

// Palco da EXPLORAÇÃO REAL (slides 3 e 7): o mesmo WalkScene canvas da run
// de masmorra (vasculhar → "?" → estilingada → chegada), dirigido por
// roteiro local em vez do servidor. Overlays (narração, d20, card de
// evento) entram como children.

import React, { useMemo } from 'react'
import WalkScene, { type WalkMode, type WalkTrailMark } from '@/components/dungeon/WalkScene'
import { buildWalkPathPoints } from '@/lib/walkSceneAssets'
import { DUNGEONS } from '@/lib/dungeonAdventures'

export const FOREST = DUNGEONS.floresta

export default function JourneyWalkStage({
  mode,
  nodeIndex,
  trailMarks = [],
  nextIsBoss = false,
  avatar,
  onApproachComplete,
  children,
}: {
  mode: WalkMode
  nodeIndex: number
  trailMarks?: WalkTrailMark[]
  nextIsBoss?: boolean
  avatar?: string | null
  onApproachComplete?: () => void
  children?: React.ReactNode
}) {
  const pathPoints = useMemo(() => buildWalkPathPoints(2, 1), [])

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ '--dgn': FOREST.accent, '--dgn-soft': FOREST.accentSoft } as React.CSSProperties}
    >
      <div className="absolute inset-0 z-0">
        <WalkScene
          dungeonId="floresta"
          accent={FOREST.accent}
          mode={mode}
          nodeIndex={nodeIndex}
          pathPoints={pathPoints}
          avatar={avatar}
          trailMarks={trailMarks}
          nextIsBoss={nextIsBoss}
          onApproachComplete={onApproachComplete}
        />
      </div>
      {/* vinheta leve para o conteúdo sobre o canvas respirar */}
      <div
        className="absolute inset-0 pointer-events-none z-[1]"
        style={{ boxShadow: 'inset 0 0 120px 30px rgba(0,0,0,0.6)' }}
      />
      {children}
    </div>
  )
}
