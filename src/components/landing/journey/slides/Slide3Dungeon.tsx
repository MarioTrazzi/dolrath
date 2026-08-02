'use client'

// Slide 3 — Masmorra REAL, na versão de hoje: a Floresta Sombria explorável.
// Mapa PROCEDURAL semeado, cenário em tileset, o boneco da raça×classe
// escolhida no slide 1 andando sozinho e monstros com folha própria rondando
// o bolsão. Antes daqui o slide rodava a WalkScene antiga — um pan sobre uma
// imagem única, com roteiro de tempos fixos.
//
// O roteiro agora é dirigido por EVENTO, não por cronômetro: quem avança a
// encenação é o `onReachSpot` da cena, quando o herói chega de verdade no nó.
// E o que acontece em cada nó vem da planta da run (`planNodeContents`), a
// mesma função pura que o servidor roda — se o nó tem lobo, aparece lobo.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { NarrationDialog, DiceOverlay } from '@/components/dungeon/DungeonMap'
import type { MapSpot } from '@/lib/dungeonScene/types'
import { contentsSummary } from '@/lib/dungeonScene/nodeContents'
import JourneySceneStage, { FOREST, useForestRun } from './JourneySceneStage'
import LootTiles, { type LootTileDef } from './LootTiles'
import type { JourneySlideProps } from '../journeyData'
import { useT } from '@/lib/i18n/I18nProvider'

// `name` = chave PT do catálogo (resolve a arte); `label` = EN canônico (dict → PT).
const DROP_TILES: LootTileDef[] = [
  { name: 'Ferro', emoji: '🔩', label: 'Iron ×3', rarity: 'UNCOMMON' },
  { name: 'Couro', emoji: '🟤', label: 'Leather ×2', rarity: 'COMMON' },
  { name: 'Erva Medicinal', emoji: '🌿', label: 'Medicinal Herb ×2', rarity: 'COMMON' },
  { name: 'Água Pura', emoji: '💧', label: 'Pure Water ×1', rarity: 'COMMON' },
  { name: 'Cristal de Mana', emoji: '🔮', label: 'Mana Crystal ×1', rarity: 'UNCOMMON' },
  { name: 'Pedra Negra (Arma)', emoji: '⚒️', label: 'Black Stone (Weapon) ×1', highlight: true },
]

/**
 * Quantos nós a vitrine percorre antes de liberar o CTA. Cada perna da trilha
 * dá ~2.5s de caminhada e cada encontro ~4s; em 2 nós o slide fecha perto dos
 * 14s do roteiro antigo, sem virar uma run inteira dentro da landing.
 */
const NODE_BUDGET = 2

/** Zoom de revelação e de investida — os mesmos valores da run real. */
const ZOOM_REVEAL = 1.45
const ZOOM_CHARGE = 2.4

type Phase = 'intro' | 'walking' | 'dice' | 'loot' | 'reveal' | 'charge' | 'done'

/** Rótulos EN canônicos (o FLAVOR_LABEL do jogo é PT e não passa pelo dict). */
const FLAVOR_EN: Record<string, string> = {
  monster: 'Monsters',
  boss: 'Boss',
  chest: 'Chest',
  rubble: 'Rubble',
  herb: 'Herb patch',
  fountain: 'Fountain',
}

const newSeed = () => `run-${Math.floor(Math.random() * 100000)}`

export default function Slide3Dungeon({ active, onNext }: JourneySlideProps) {
  const t = useT()
  const [seed, setSeed] = useState('run-0420')
  const [phase, setPhase] = useState<Phase>('intro')
  const [targetNode, setTargetNode] = useState(1)
  const [visited, setVisited] = useState<number[]>([])
  const [encounter, setEncounter] = useState<MapSpot | null>(null)
  const [zoom, setZoom] = useState(1)
  const [ready, setReady] = useState(false)
  /** Sobe a cada reinício do roteiro: remonta a cena e devolve o herói à entrada. */
  const [runNonce, setRunNonce] = useState(0)

  const { map, contents } = useForestRun(seed)
  const summary = useMemo(() => contentsSummary(contents), [contents])
  const lastNode = map.spots[map.spots.length - 1].nodeIndex

  /**
   * Espelho de `visited` legível FORA do render: o roteiro roda em setTimeout,
   * onde o estado da closure já nasceu velho. Sempre escrito junto do setState.
   */
  const visitedRef = useRef<number[]>([])

  const timers = useRef<number[]>([])
  const after = useCallback((ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms))
  }, [])
  const clearTimers = useCallback(() => {
    timers.current.forEach(window.clearTimeout)
    timers.current = []
  }, [])
  useEffect(() => clearTimers, [clearTimers])

  const restart = useCallback(
    (nextSeed: string) => {
      clearTimers()
      setSeed(nextSeed)
      setPhase('intro')
      setTargetNode(1)
      setVisited([])
      visitedRef.current = []
      setEncounter(null)
      setZoom(1)
      setReady(false)
      setRunNonce(n => n + 1)
    },
    [clearTimers],
  )

  // Sai de cena → volta do começo, para quem rolar de novo pegar a run inteira.
  useEffect(() => {
    if (!active) {
      clearTimers()
      setPhase('intro')
      setTargetNode(1)
      setVisited([])
      visitedRef.current = []
      setEncounter(null)
      setZoom(1)
      setReady(false)
      setRunNonce(n => n + 1)
    }
  }, [active, clearTimers])

  // A NarrationDialog só fecha no clique (na run real quem lê é o jogador).
  // Na vitrine ninguém vai clicar: a narração some sozinha e a run começa.
  useEffect(() => {
    if (!active || !ready || phase !== 'intro') return
    const id = window.setTimeout(() => setPhase('walking'), 2800)
    return () => window.clearTimeout(id)
  }, [active, ready, phase])

  const resolveNode = useCallback(
    (spot: MapSpot) => {
      const done = visitedRef.current.includes(spot.nodeIndex)
        ? visitedRef.current
        : [...visitedRef.current, spot.nodeIndex]
      visitedRef.current = done
      setVisited(done)
      setEncounter(null)
      setZoom(1)

      if (done.length >= NODE_BUDGET || spot.nodeIndex >= lastNode) {
        setPhase('done')
      } else {
        setPhase('walking')
        setTargetNode(n => Math.min(lastNode, n + 1))
      }
    },
    [lastNode],
  )

  const handleReach = useCallback(
    (spot: MapSpot) => {
      const content = contents.get(spot.nodeIndex)
      const isFight = !content || content.category === 'combat'
      setEncounter(spot)

      if (isFight) {
        // Revelação: a câmera fecha no vulto que ronda o bolsão, e a investida
        // é o mesmo corte que a run real dá ao entrar em combate.
        setPhase('reveal')
        setZoom(ZOOM_REVEAL)
        after(1500, () => {
          setPhase('charge')
          setZoom(ZOOM_CHARGE)
          after(1300, () => resolveNode(spot))
        })
      } else {
        // Achado: o d20 decide o tamanho do espólio.
        setPhase('dice')
        after(1700, () => {
          setPhase('loot')
          after(3600, () => resolveNode(spot))
        })
      }
    },
    [contents, after, resolveNode],
  )

  const encounterContent = encounter ? contents.get(encounter.nodeIndex) : undefined
  const flavorLabel = encounterContent ? FLAVOR_EN[encounterContent.flavor] : undefined

  return (
    <JourneySceneStage
      seed={seed}
      sceneKey={runNonce}
      targetNode={targetNode}
      visitedNodes={visited}
      // O mundo congela nos momentos encenados; o zoom continua interpolando.
      paused={!active || (phase !== 'walking' && phase !== 'done')}
      cinematicZoom={zoom}
      focusNode={zoom > 1 ? encounter?.nodeIndex ?? null : null}
      onReachSpot={handleReach}
      onReady={() => setReady(true)}
    >
      <NarrationDialog
        text={t('You cross the treeline. Moonlight barely pierces the canopy...')}
        open={active && ready && phase === 'intro'}
        onClose={() => setPhase('walking')}
      />
      <DiceOverlay
        rolling={phase === 'dice' || phase === 'loot'}
        result={phase === 'loot' ? { roll: 17, modifier: 2, total: 19 } : null}
      />

      {/* Orçamento da run — números REAIS da planta desta seed */}
      <div className="absolute top-2.5 left-3 z-30 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-bold pointer-events-none">
        <span className="px-2 py-0.5 rounded-full bg-black/65 border border-white/15 text-white/80">
          🌲 {t('Procedural map')} · {seed}
        </span>
        <span className="px-2 py-0.5 rounded-full bg-black/65 border border-white/15">
          <span className="text-red-400">⚔ {summary.combats}</span>
          <span className="text-white/25"> · </span>
          <span className="text-amber-300">☠ {summary.boss}</span>
          <span className="text-white/25"> · </span>
          <span className="text-emerald-300">✦ {summary.finds}</span>
        </span>
      </div>

      {/* Outro mapa: as duas funções são puras, então é só trocar a seed —
          e é a prova mais direta de que a masmorra é sorteada a cada run. */}
      <button
        onClick={() => restart(newSeed())}
        className="absolute top-2.5 right-3 z-30 px-2.5 py-1 rounded-lg border border-white/20 bg-black/60 backdrop-blur-md text-white/85 text-[10px] font-bold hover:bg-black/80"
      >
        🎲 {t('Another map')}
      </button>

      {/* Encontro de combate: quem aparece é o bicho que a planta marcou */}
      <AnimatePresence>
        {(phase === 'reveal' || phase === 'charge') && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute inset-x-3 top-11 z-30 flex justify-center pointer-events-none"
          >
            <div
              className="px-3 py-1.5 rounded-lg border backdrop-blur-xl text-center"
              style={{ background: 'rgba(14,12,9,0.9)', borderColor: FOREST.accentSoft }}
            >
              <div className="text-xs font-black text-white">
                {encounterContent?.flavor === 'boss' ? '☠️' : '⚔️'}{' '}
                {t(flavorLabel ?? 'Monsters')}
                {encounterContent?.speciesSlugs?.length
                  ? ` ×${encounterContent.speciesSlugs.length}`
                  : ''}
              </div>
              <div className="text-[10px] text-white/60">
                {t('The camera closes in — the turn-based fight happens right here.')}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Card do BOM DROP (mesma linguagem do card de evento da run) */}
      <AnimatePresence>
        {phase === 'loot' && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-x-3 top-11 z-30 flex justify-center"
          >
            <div
              className="w-full max-w-sm rounded-xl border px-4 py-3 backdrop-blur-xl"
              style={{
                background: 'linear-gradient(180deg, rgba(20,18,14,0.94), rgba(12,11,8,0.96))',
                borderColor: FOREST.accentSoft,
                boxShadow: '0 12px 30px -8px rgba(0,0,0,0.7)',
              }}
            >
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-sm font-black text-white">{t('🎲 19 — Lucky find!')}</span>
                <span className="text-[10px] font-bold text-amber-300">+120 🪙</span>
              </div>
              <p className="text-[11px] text-white/70 mb-2.5">
                {t('Among the roots, a smugglers\' stash: forge materials, alchemy ingredients and a Black Stone.')}
              </p>
              <LootTiles tiles={DROP_TILES} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Legenda + CTA */}
      <div className="absolute bottom-3 inset-x-3 z-30 flex items-end justify-between gap-3 pointer-events-none">
        <p className="text-[11px] text-white/75 max-w-[58%] drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
          {t('🌲 Every run draws its own forest: pockets, trails and what sleeps in them. The hero explores on his own — you see the beast before the fight.')}
        </p>
        {phase === 'done' && (
          <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={onNext}
            className="pointer-events-auto px-3.5 py-2 rounded-lg bg-primary hover:bg-primary-dark text-white text-xs font-bold shadow-[0_0_18px_rgba(233,69,96,0.5)] animate-pulse"
          >
            {t('Forge with the spoils →')}
          </motion.button>
        )}
      </div>
    </JourneySceneStage>
  )
}
