'use client'

// Runner dos roteiros de combate (slides 6 e 7): acumula os BattleStep
// até o passo atual num snapshot declarativo + o último BattleEvent com
// id único (cycle*100 + passo) para o BattleScene animar.

import { useMemo } from 'react'
import type { BattleEvent } from '@/components/battle/BattleScene'
import type { BattleStep } from './journeyData'
import { useSlideScript, type SlideScript } from './useSlideScript'

export interface BattleSnapshot {
  heroHp: number
  foeHp: number
  banner: string | null
  log: string
  dice: 'ask' | 'reveal' | null
  showActions: boolean
  heroTransformed: boolean
  foeTransformed: boolean
  ended: boolean
  loot: boolean
  rewards: boolean
  event: BattleEvent | null
}

export function useBattleScript(
  active: boolean,
  script: BattleStep[],
  init: { heroHp: number; foeHp: number },
  opts: { loopDelayMs?: number } = {},
): BattleSnapshot & Pick<SlideScript, 'advance' | 'step' | 'cycle'> {
  const times = useMemo(() => script.map(s => s.at), [script])
  const { step, cycle, advance } = useSlideScript(active, times, {
    loopDelayMs: opts.loopDelayMs ?? 4500,
  })

  const snap = useMemo<BattleSnapshot>(() => {
    const out: BattleSnapshot = {
      heroHp: init.heroHp,
      foeHp: init.foeHp,
      banner: null,
      log: '',
      dice: null,
      showActions: false,
      heroTransformed: false,
      foeTransformed: false,
      ended: false,
      loot: false,
      rewards: false,
      event: null,
    }
    for (let i = 0; i <= Math.min(step, script.length - 1); i++) {
      const s = script[i]
      if (s.heroHp !== undefined) out.heroHp = s.heroHp
      if (s.foeHp !== undefined) out.foeHp = s.foeHp
      if (s.banner !== undefined) out.banner = s.banner
      if (s.log !== undefined) out.log = s.log
      if (s.dice !== undefined) out.dice = s.dice
      if (s.showActions !== undefined) out.showActions = s.showActions
      if (s.heroTransformed !== undefined) out.heroTransformed = s.heroTransformed
      if (s.foeTransformed !== undefined) out.foeTransformed = s.foeTransformed
      if (s.ended) out.ended = true
      if (s.loot) out.loot = true
      if (s.rewards) out.rewards = true
      if (s.event) out.event = { ...s.event, id: cycle * 100 + i }
    }
    return out
  }, [step, cycle, script, init.heroHp, init.foeHp])

  return { ...snap, step, cycle, advance }
}
