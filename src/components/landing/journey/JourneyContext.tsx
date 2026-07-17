'use client'

// Contexto da Jornada (landing): o MESMO herói atravessa os 8 slides.
// A escolha de raça/classe do slide 1 repinta ficha, mapa, boss fight,
// PvP e ranking. Antes do primeiro clique do visitante, um "cursor
// fantasma" cicla as combinações (userPicked desliga isso p/ sempre).

import React, { createContext, useContext, useMemo, useState } from 'react'
import { getBlendedVisual, type BlendedVisual } from '@/lib/creationVisuals'
import {
  heroName,
  heroArt,
  CANON_CLASS,
  CANON_RACE,
  type JourneyChoice,
  type JourneyRaceId,
  type JourneyClassId,
} from './journeyData'

interface JourneyState extends JourneyChoice {
  heroName: string
  heroArt: string
  visual: BlendedVisual
  /** O visitante já escolheu de verdade (desliga o auto-cycle do slide 1). */
  userPicked: boolean
  /** Destino do CTA final (login ou dashboard, decidido pela landing). */
  primaryHref: string
  setChoice: (raceId: JourneyRaceId, classId: JourneyClassId, byUser?: boolean) => void
  /** Escolha por raça/classe travando o par CANÔNICO (a arte nunca mente). */
  pickRace: (raceId: JourneyRaceId, byUser?: boolean) => void
  pickClass: (classId: JourneyClassId, byUser?: boolean) => void
}

const JourneyCtx = createContext<JourneyState | null>(null)

export function JourneyProvider({
  children,
  primaryHref = '/auth/login',
}: {
  children: React.ReactNode
  primaryHref?: string
}) {
  const [choice, setChoiceState] = useState<JourneyChoice>({ raceId: 'draconiano', classId: 'warrior' })
  const [userPicked, setUserPicked] = useState(false)

  const value = useMemo<JourneyState>(() => {
    const visual = getBlendedVisual(choice.raceId, choice.classId)
    return {
      ...choice,
      heroName: heroName(choice.raceId),
      heroArt: heroArt(choice.raceId),
      visual,
      userPicked,
      primaryHref,
      setChoice: (raceId, classId, byUser = false) => {
        setChoiceState({ raceId, classId })
        if (byUser) setUserPicked(true)
      },
      pickRace: (raceId, byUser = false) => {
        setChoiceState({ raceId, classId: CANON_CLASS[raceId] })
        if (byUser) setUserPicked(true)
      },
      pickClass: (classId, byUser = false) => {
        setChoiceState({ raceId: CANON_RACE[classId], classId })
        if (byUser) setUserPicked(true)
      },
    }
  }, [choice, userPicked, primaryHref])

  return <JourneyCtx.Provider value={value}>{children}</JourneyCtx.Provider>
}

export function useJourney(): JourneyState {
  const ctx = useContext(JourneyCtx)
  if (!ctx) throw new Error('useJourney precisa estar dentro de <JourneyProvider>')
  return ctx
}
