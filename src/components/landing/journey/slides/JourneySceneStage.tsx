'use client'

// Palco da masmorra EXPLORÁVEL (slides 3 e 7) — a Floresta Sombria como ela é
// hoje: `DungeonScene` de verdade, mapa procedural semeado, tileset de cenário,
// boneco de caminhada da raça×classe escolhida no slide 1 e monstros rondando
// com folha própria. Substituiu a `WalkScene` antiga (pan sobre uma imagem só),
// que ainda serve as outras 3 masmorras.
//
// A cena é 100% apresentacional: sem auth, sem fetch, sem socket, sem DB. Os
// dados saem de duas funções PURAS, as mesmas da run real e da bancada
// /dev/dungeon-scene — por isso o que aparece aqui é a masmorra do jogo, não
// uma maquete de marketing.

import React, { useMemo } from 'react'
import DungeonScene from '@/components/dungeon/scene/DungeonScene'
import { generateSceneMap } from '@/lib/dungeonScene/generateMap'
import { planNodeContents } from '@/lib/dungeonScene/nodeContents'
import type { MapSpot } from '@/lib/dungeonScene/types'
import { DUNGEONS } from '@/lib/dungeonAdventures'
import { DUNGEON_BATTLE_BG } from '@/lib/walkSceneAssets'
import { useJourney } from '../JourneyContext'

export const FOREST = DUNGEONS.floresta

/** Planta da run: puras, memoizadas pela seed — trocar a seed = outro mapa. */
export function useForestRun(seed: string) {
  const map = useMemo(() => generateSceneMap('floresta', seed), [seed])
  const contents = useMemo(() => planNodeContents(map, seed), [map, seed])
  return { map, contents }
}

export default function JourneySceneStage({
  seed,
  targetNode,
  spawnAtNode = null,
  sceneKey = '',
  visitedNodes = [],
  paused = false,
  cinematicZoom = 1,
  focusNode = null,
  onReachSpot,
  onReady,
  children,
}: {
  seed: string
  targetNode: number
  /**
   * Nasce na BOCA deste nó em vez da entrada da masmorra. O mapa é o mesmo —
   * só a posição inicial do herói muda. Existe para o slide do chefe: a trilha
   * inteira até o covil são ~28s de caminhada, e ali a cena é a chegada, não a
   * viagem (o herói já limpou o caminho nos slides anteriores).
   */
  spawnAtNode?: number | null
  /**
   * Muda ⇒ a cena REMONTA e o herói volta ao início. O slide usa isto quando
   * reinicia o roteiro (sair e voltar ao slide): sem remontar, o herói andaria
   * de volta até o nó 1 — a run correndo ao contrário na cara do visitante.
   */
  sceneKey?: string | number
  visitedNodes?: number[]
  paused?: boolean
  cinematicZoom?: number
  focusNode?: number | null
  onReachSpot?: (spot: MapSpot) => void
  onReady?: () => void
  children?: React.ReactNode
}) {
  const { raceId, classId } = useJourney()
  const { map: fullMap, contents } = useForestRun(seed)

  const map = useMemo(() => {
    if (spawnAtNode == null) return fullMap
    const spot = fullMap.spots.find(s => s.nodeIndex === spawnAtNode)
    const start = spot?.approach[0]
    return start ? { ...fullMap, entrance: start } : fullMap
  }, [fullMap, spawnAtNode])

  return (
    <div
      className="relative h-full w-full overflow-hidden flex items-center justify-center"
      style={{ '--dgn': FOREST.accent, '--dgn-soft': FOREST.accentSoft } as React.CSSProperties}
    >
      {/* Arte da masmorra preenchendo a SOBRA em volta da caixa — desfocada e
          escurecida de propósito: é ambiente, não conteúdo. Mesmo arranjo do
          RunFrame da run real e da bancada /dev/dungeon-scene. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-cover bg-center scale-110 blur-lg opacity-40"
        style={{ backgroundImage: `url(${DUNGEON_BATTLE_BG.floresta})` }}
      />
      <div aria-hidden className="absolute inset-0 bg-black/60" />

      {/* Caixa 3/4: a exploração é mobile-first, mas o `basePpu` da cena tira o
          zoom do MÍNIMO entre largura e altura, então mais largo que 9:16
          mostra MAIS MATA nas laterais em vez de dar zoom. Numa janela de
          600px de altura isso dá ~450×600 centralizado. */}
      <div
        className="relative h-full overflow-hidden bg-black shadow-2xl ring-1 ring-white/10 rounded-lg"
        style={{ aspectRatio: '3 / 4', maxWidth: '100%' }}
      >
        {/* key = seed/spawn novos remontam a cena (o herói volta ao início) */}
        <DungeonScene
          key={`floresta:${seed}:${spawnAtNode ?? 'entrance'}:${sceneKey}`}
          map={map}
          race={raceId}
          heroClass={classId}
          contents={contents}
          targetNode={targetNode}
          visitedNodes={visitedNodes}
          paused={paused}
          cinematicZoom={cinematicZoom}
          focusNode={focusNode}
          onReachSpot={onReachSpot}
          onReady={onReady}
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
