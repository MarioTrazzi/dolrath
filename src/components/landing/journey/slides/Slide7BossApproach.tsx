'use client'

// Slide 7 — De volta à trilha, agora com arma IV e set III: a chegada ao covil
// da Anciã da Mata na masmorra EXPLORÁVEL de verdade (mesma DungeonScene do
// slide 3), com a Anciã já visível rondando o bolsão antes da luta começar.
//
// O herói nasce na BOCA do covil, não na entrada da masmorra: a trilha inteira
// são ~28s de caminhada e os nós anteriores já foram limpos nos slides de
// antes. `visitedNodes` cheio conta essa parte — os marcadores do caminho já
// estão apagados.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { NarrationDialog } from '@/components/dungeon/DungeonMap'
import JourneySceneStage, { FOREST, useForestRun } from './JourneySceneStage'
import { useJourney } from '../JourneyContext'
import type { JourneySlideProps } from '../journeyData'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { pickName, pickTitle } from '@/lib/i18n/names'

/** Seed inicial do slide 3 — lida como a MESMA run, agora na altura do covil. */
const SEED = 'run-0420'

const GEAR_CHIPS = ['⚔️ Weapon IV', '🛡️ Set III', '🎒 Potions in the bag']

/** Zoom da investida — o mesmo valor da run real. */
const ZOOM_CHARGE = 2.4

type Phase = 'intro' | 'walking' | 'arrived' | 'cta'

export default function Slide7BossApproach({ active, onNext }: JourneySlideProps) {
  const { locale, t } = useI18n()
  const { heroName } = useJourney()
  const [phase, setPhase] = useState<Phase>('intro')
  const [ready, setReady] = useState(false)
  /** Sobe ao reiniciar: remonta a cena e o herói volta à boca do covil. */
  const [runNonce, setRunNonce] = useState(0)

  const { map } = useForestRun(SEED)
  const bossNode = map.spots[map.spots.length - 1].nodeIndex
  // Tudo antes do covil já foi resolvido nos slides anteriores.
  const visited = useMemo(
    () => map.spots.filter(s => s.nodeIndex < bossNode).map(s => s.nodeIndex),
    [map, bossNode],
  )

  const timer = useRef<number | null>(null)
  const clear = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = null
  }, [])
  useEffect(() => clear, [clear])

  useEffect(() => {
    if (!active) {
      clear()
      setPhase('intro')
      setReady(false)
      setRunNonce(n => n + 1)
    }
  }, [active, clear])

  // A NarrationDialog só fecha no clique; na vitrine ela sai sozinha.
  useEffect(() => {
    if (!active || !ready || phase !== 'intro') return
    const id = window.setTimeout(() => setPhase('walking'), 2800)
    return () => window.clearTimeout(id)
  }, [active, ready, phase])

  const arrived = phase === 'arrived' || phase === 'cta'

  const handleReach = useCallback(() => {
    setPhase('arrived')
    clear()
    timer.current = window.setTimeout(() => setPhase('cta'), 1700)
  }, [clear])

  return (
    <div className="relative h-full w-full overflow-hidden">
      <JourneySceneStage
        seed={SEED}
        sceneKey={runNonce}
        spawnAtNode={bossNode}
        targetNode={bossNode}
        visitedNodes={visited}
        paused={!active || phase === 'intro'}
        // Chegou no covil: a câmera fecha na Anciã como a entrada em combate faz.
        cinematicZoom={arrived ? ZOOM_CHARGE : 1}
        focusNode={arrived ? bossNode : null}
        onReachSpot={handleReach}
        onReady={() => setReady(true)}
      >
        <NarrationDialog
          text={t('The trail ends ahead. Something ancient breathes among the roots...')}
          open={active && ready && phase === 'intro'}
          onClose={() => setPhase('walking')}
        />
      </JourneySceneStage>

      {/* vinheta que fecha ao chegar */}
      <motion.div
        className="absolute inset-0 pointer-events-none z-20"
        animate={{ opacity: arrived ? 1 : 0 }}
        transition={{ duration: 1.1 }}
        style={{ boxShadow: 'inset 0 0 180px 70px rgba(0,0,0,0.9)' }}
      />

      {/* Chips do gear */}
      <div className="absolute top-4 inset-x-3 z-30 flex flex-wrap gap-1.5 justify-center pointer-events-none">
        {GEAR_CHIPS.map((chip, i) => (
          <motion.span
            key={chip}
            initial={{ opacity: 0, y: -12, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.3 + i * 0.18, type: 'spring', stiffness: 240, damping: 18 }}
            className="px-2.5 py-1 rounded-full border text-[11px] font-bold text-amber-100"
            style={{
              borderColor: 'rgba(231,198,130,0.6)',
              background: 'linear-gradient(180deg, rgba(58,51,37,0.9), rgba(36,31,22,0.92))',
              boxShadow: '0 0 12px rgba(201,162,95,0.35)',
            }}
          >
            {t(chip)}
          </motion.span>
        ))}
      </div>

      {/* Placa do boss na chegada */}
      {arrived && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 16 }}
          className="absolute inset-x-0 top-[30%] z-30 flex justify-center pointer-events-none"
        >
          <div
            className="px-4 py-2 rounded-xl border-2 text-center backdrop-blur-md"
            style={{ borderColor: '#f39c12', background: 'rgba(10,8,5,0.8)', boxShadow: '0 0 30px rgba(243,156,18,0.35)' }}
          >
            <div className="text-lg font-black text-amber-300">👑 {pickName(FOREST.boss, locale)}</div>
            <div className="text-[11px] font-bold text-amber-100/80 uppercase tracking-[0.2em]">
              {pickTitle(FOREST.boss, locale)}
            </div>
          </div>
        </motion.div>
      )}

      {/* Faixa inferior */}
      <div className="absolute bottom-3 inset-x-3 z-30 flex items-end justify-between gap-3">
        <p className="text-[11px] text-white/80 max-w-[58%] drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
          {arrived
            ? t('The lair. No more nodes, no more fog — just you and the Warden.')
            : t('{name} returns to the Gloomwood Forest — this time, to the end of the trail.', { name: heroName })}
        </p>
        {phase === 'cta' && (
          <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={onNext}
            className="px-3.5 py-2 rounded-lg bg-primary hover:bg-primary-dark text-white text-xs font-bold shadow-[0_0_18px_rgba(233,69,96,0.55)] animate-pulse"
          >
            {t('⚔️ Face the Elder →')}
          </motion.button>
        )}
      </div>
    </div>
  )
}
