'use client'

// ============================================================
// Bancada da cena explorável (F0) — sem DB, sem auth, sem combate.
// Objetivo único: andar na masmorra e sentir se o lugar é bom.
// O "Resolver" aqui só finge o combate para liberar o próximo ponto.
// ============================================================

import React, { useCallback, useMemo, useState } from 'react'
import DungeonScene from '@/components/dungeon/scene/DungeonScene'
import { generateSceneMap } from '@/lib/dungeonScene/generateMap'
import { contentsSummary, planNodeContents } from '@/lib/dungeonScene/nodeContents'
import { FLAVOR_LABEL } from '@/lib/dungeonScene/icons'
import type { MapSpot } from '@/lib/dungeonScene/types'
import { DUNGEONS, type DungeonId } from '@/lib/dungeonAdventures'
import { DUNGEON_BATTLE_BG } from '@/lib/walkSceneAssets'
import { HERO_SPRITES } from '@/lib/heroSprites'

/** Combinações com boneco de caminhada + a opção "sem arte" (cai no procedural). */
const SPRITE_SLUGS = ['', ...Object.keys(HERO_SPRITES)]

const KIND_LABEL: Record<string, string> = {
  minor: 'Nó menor',
  main: 'Nó principal',
  boss: 'Chefe',
  start: 'Entrada',
}

const KIND_STAMINA: Record<string, number> = { minor: 4, main: 8, boss: 6 }
const DUNGEON_IDS: DungeonId[] = ['floresta', 'caverna', 'pantano', 'ruinas']

export default function DungeonScenePage() {
  const [dungeonId, setDungeonId] = useState<DungeonId>('floresta')
  const [heroSlug, setHeroSlug] = useState(SPRITE_SLUGS[1] || '')
  const [heroRace, heroClass] = heroSlug ? heroSlug.split('-') : ['', '']
  const [seed, setSeed] = useState('run-0001')
  const [targetNode, setTargetNode] = useState(1)
  const [visited, setVisited] = useState<number[]>([])
  const [encounter, setEncounter] = useState<MapSpot | null>(null)
  // 🎥 Bancada da aproximação: ZOOM_REVEAL (1.45) quando o nó revela o monstro,
  // ZOOM_CHARGE (2.4) na investida — os mesmos valores do DungeonRun.
  const [cinematicZoom, setCinematicZoom] = useState(1)
  const [log, setLog] = useState<string[]>([])
  const [stamina, setStamina] = useState(153)

  const map = useMemo(() => generateSceneMap(dungeonId, seed), [dungeonId, seed])
  const contents = useMemo(() => planNodeContents(map, seed), [map, seed])
  const summary = useMemo(() => contentsSummary(contents), [contents])
  const spotList = useMemo(() => map.spots.filter(s => s.kind !== 'start'), [map])
  const lastNode = map.spots[map.spots.length - 1].nodeIndex
  const done = visited.length >= spotList.length

  const restart = useCallback((nextId: DungeonId, nextSeed: string) => {
    setDungeonId(nextId)
    setSeed(nextSeed)
    setTargetNode(1)
    setVisited([])
    setEncounter(null)
    setLog([])
    setStamina(153)
  }, [])

  const handleReach = useCallback(
    (spot: MapSpot) => {
      setEncounter(spot)
      const flavorNow = contents.get(spot.nodeIndex)?.flavor
      // Revelação: nó de combate aproxima a câmera do vulto (achado não).
      setCinematicZoom(flavorNow && flavorNow !== 'chest' ? 1.45 : 1)
      setStamina(s => Math.max(0, s - (KIND_STAMINA[spot.kind] ?? 4)))
      const flavor = contents.get(spot.nodeIndex)?.flavor
      // Sem o card, o log é quem identifica o nó — por isso leva também o custo.
      setLog(prev =>
        [
          `Nó ${spot.nodeIndex} · ${flavor ? FLAVOR_LABEL[flavor] : KIND_LABEL[spot.kind]} · ⚡${KIND_STAMINA[spot.kind] ?? 4}`,
          ...prev,
        ].slice(0, 6),
      )
    },
    [contents],
  )

  const resolveEncounter = useCallback(() => {
    if (!encounter) return
    setVisited(prev => (prev.includes(encounter.nodeIndex) ? prev : [...prev, encounter.nodeIndex]))
    setTargetNode(n => Math.min(lastNode, n + 1))
    setEncounter(null)
    setCinematicZoom(1)
  }, [encounter, lastNode])

  /** Investida — fecha o zoom como o corte pro combate faz na run real. */
  const chargeEncounter = useCallback(() => {
    setCinematicZoom(2.4)
    window.setTimeout(() => setCinematicZoom(1.45), 1200)
  }, [])

  return (
    <div className="fixed inset-0 bg-neutral-950 text-white overflow-hidden flex items-center justify-center">
      {/* Arte da masmorra preenchendo a SOBRA de tela. No celular a moldura
          ocupa tudo e isto nunca aparece; no desktop evita a tarja preta.
          Desfocada e escurecida de propósito: é ambiente, não conteúdo. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-cover bg-center scale-110 blur-lg opacity-45"
        style={{ backgroundImage: `url(${DUNGEON_BATTLE_BG[dungeonId]})` }}
      />
      <div aria-hidden className="absolute inset-0 bg-black/55" />

      {/* Moldura de CELULAR: a run é mobile-first, então mesmo no desktop ela
          roda em retrato 9:16 em vez de esticar na largura da tela. */}
      <div
        className="relative overflow-hidden bg-black shadow-2xl ring-1 ring-white/10 sm:rounded-2xl"
        style={{ aspectRatio: '9 / 16', height: '100dvh', maxWidth: '100vw' }}
      >
      {/* key = mapa novo remonta a cena (herói volta à entrada) */}
      <DungeonScene
        key={`${dungeonId}:${seed}`}
        map={map}
        race={heroRace}
        heroClass={heroClass}
        contents={contents}
        targetNode={targetNode}
        visitedNodes={visited}
        paused={Boolean(encounter)}
        cinematicZoom={cinematicZoom}
        focusNode={cinematicZoom > 1 ? encounter?.nodeIndex ?? null : null}
        onReachSpot={handleReach}
      />

      {/* Barra superior — espelha o HUD da run */}
      <div className="absolute top-0 inset-x-0 z-10 flex items-start justify-between gap-3 px-4 py-3 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
        <div>
          <div className="text-lg font-bold tracking-wide">
            {DUNGEONS[dungeonId].emoji} {DUNGEONS[dungeonId].name}
          </div>
          <div className="text-[11px] text-white/50">
            {visited.length}/{spotList.length} pontos · {DUNGEONS[dungeonId].rooms} salas ·
            alvo: nó {targetNode} · seed {seed}
          </div>
          {/* Orçamento FIXO: estes números não podem mudar ao trocar a seed. */}
          <div className="mt-1 text-[11px] font-bold">
            <span className="text-red-400">⚔ {summary.combats} combates</span>
            <span className="text-white/30"> · </span>
            <span className="text-amber-300">☠ {summary.boss} chefe</span>
            <span className="text-white/30"> · </span>
            <span className="text-emerald-300">✦ {summary.finds} achados</span>
          </div>
        </div>
        <div className="flex flex-col gap-1 w-[36%] max-w-[300px]">
          <Bar color="#e0453e" label="❤️" value={124} max={124} />
          <Bar color="#3d8bd6" label="🔮" value={95} max={95} />
          <Bar color="#d6a83d" label="⚡" value={stamina} max={153} />
        </div>
      </div>

      {/* Controles da bancada */}
      <div className="absolute top-16 right-3 z-20 flex flex-col items-end gap-2">
        <div className="flex gap-1.5">
          {DUNGEON_IDS.map(id => (
            <button
              key={id}
              onClick={() => restart(id, seed)}
              className={`px-2 py-1 rounded-md text-[11px] font-bold border ${
                id === dungeonId ? 'bg-white/15 border-white/40' : 'bg-black/60 border-white/15 text-white/60'
              }`}
            >
              {DUNGEONS[id].emoji}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => restart(dungeonId, `run-${Math.floor(Math.random() * 100000)}`)}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-black/60 border border-white/20"
          >
            🎲 Novo mapa
          </button>
        </div>
        {/* Boneco raça×classe — calibrar escala/ciclo aqui antes de congelar
            em heroSprites.ts. "sem sprite" mostra o fallback procedural. */}
        <select
          value={heroSlug}
          onChange={e => setHeroSlug(e.target.value)}
          className="px-2 py-1 rounded-lg text-[11px] font-bold bg-black/70 border border-white/20"
        >
          {SPRITE_SLUGS.map(slug => (
            <option key={slug || 'none'} value={slug}>
              {slug || 'sem sprite'}
            </option>
          ))}
        </select>
        <div className="text-[10px] text-white/40 text-right leading-tight max-w-[150px]">
          Run automática: o herói explora sozinho.
        </div>
      </div>

      {log.length > 0 && (
        <div className="absolute bottom-3 left-3 z-10 text-[11px] text-white/45 space-y-0.5 pointer-events-none">
          {log.map((l, i) => (
            <div key={`${l}-${i}`} style={{ opacity: 1 - i * 0.15 }}>
              {l}
            </div>
          ))}
        </div>
      )}

      {/* Pausa no nó: DOIS botões pequenos e nada mais.
          Aqui havia um card `inset-0` com backdrop escuro e blur — ele cobria e
          desfocava exatamente o que a bancada existe para julgar (o vulto no
          bolsão, o enquadramento, a investida). A identidade do nó já sai no log
          do canto, então o card era só estorvo em cima da imagem.
          Os dois botões ficam SEMPRE montados (investir desabilitado em nó de
          achado): assim a barra não pula de tamanho a cada parada. */}
      {encounter && (
        <div className="absolute bottom-3 right-3 z-30 flex items-center gap-2">
          <button
            onClick={chargeEncounter}
            disabled={cinematicZoom === 1}
            className="rounded-md border border-white/20 bg-black/70 px-3 py-1 text-[11px] font-bold text-white/85 hover:bg-black/90 disabled:opacity-30"
            title="Fecha o zoom como a entrada em combate faz na run real"
          >
            investir
          </button>
          <button
            onClick={resolveEncounter}
            className="rounded-md border border-white/20 bg-black/70 px-3 py-1 text-[11px] font-bold text-white/85 hover:bg-black/90"
            title="Resolve o nó e libera a caminhada"
          >
            seguir
          </button>
        </div>
      )}

      {done && !encounter && (
        <div className="absolute bottom-20 inset-x-0 z-10 text-center text-amber-300 font-bold pointer-events-none">
          Masmorra limpa ✦
        </div>
      )}
      </div>
    </div>
  )
}

function Bar({ color, label, value, max }: { color: string; label: string; value: number; max: number }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] w-4">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-black/60 border border-white/10 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-[10px] text-white/50 w-14 text-right">
        {value}/{max}
      </span>
    </div>
  )
}
