'use client'

// Contexto da Jornada (landing): o MESMO herói atravessa os 10 slides.
// A escolha de raça/classe do slide 1 repinta ficha, masmorra, boss fight,
// PvP e ranking.
//
// Raça e classe são INDEPENDENTES: a arte existe nas 16 combinações
// (COMBO_ART), então nada trava o par. Enquanto o visitante não escolheu as
// duas coisas, o slide 1 não mostra imagem nenhuma — a graça é ver a arte
// nascer da combinação dele, não escolher numa prateleira. Se ele demorar,
// `autoPick` sorteia uma e o ciclo roda igual.

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { getBlendedVisual, type BlendedVisual } from '@/lib/creationVisuals'
import {
  heroName,
  heroArt,
  heroArtTransformed,
  randomCombo,
  type JourneyChoice,
  type JourneyRaceId,
  type JourneyClassId,
} from './journeyData'

interface JourneyState extends JourneyChoice {
  heroName: string
  heroArt: string
  heroArtTransformed: string
  visual: BlendedVisual
  /** O visitante escolheu a raça (clique de verdade, não sorteio). */
  pickedRace: boolean
  /** O visitante escolheu a classe. */
  pickedClass: boolean
  /** Raça E classe definidas — só aqui a arte pode aparecer. */
  chosen: boolean
  /** A combinação atual saiu do sorteio, não do visitante. */
  autoPicked: boolean
  /** Destino do CTA final (login ou dashboard, decidido pela landing). */
  primaryHref: string
  setChoice: (raceId: JourneyRaceId, classId: JourneyClassId, byUser?: boolean) => void
  pickRace: (raceId: JourneyRaceId) => void
  pickClass: (classId: JourneyClassId) => void
  /** Sorteia uma combinação completa (visitante parado no slide 1). */
  autoPick: () => void
}

const JourneyCtx = createContext<JourneyState | null>(null)

export function JourneyProvider({
  children,
  primaryHref = '/auth/login',
}: {
  children: React.ReactNode
  primaryHref?: string
}) {
  // Combinação SEMPRE válida: os slides seguintes (ficha, masmorra, PvP…)
  // nunca precisam lidar com estado vazio. Quem esconde a arte enquanto falta
  // escolher é o slide 1, via `chosen`.
  const [choice, setChoiceState] = useState<JourneyChoice>({ raceId: 'draconiano', classId: 'warrior' })
  const [pickedRace, setPickedRace] = useState(false)
  const [pickedClass, setPickedClass] = useState(false)
  const [autoPicked, setAutoPicked] = useState(false)

  const setChoice = useCallback((raceId: JourneyRaceId, classId: JourneyClassId, byUser = false) => {
    setChoiceState({ raceId, classId })
    if (byUser) {
      setPickedRace(true)
      setPickedClass(true)
      setAutoPicked(false)
    }
  }, [])

  const pickRace = useCallback((raceId: JourneyRaceId) => {
    setChoiceState(prev => ({ ...prev, raceId }))
    setPickedRace(true)
    setAutoPicked(false)
  }, [])

  const pickClass = useCallback((classId: JourneyClassId) => {
    setChoiceState(prev => ({ ...prev, classId }))
    setPickedClass(true)
    setAutoPicked(false)
  }, [])

  const autoPick = useCallback(() => {
    setChoiceState(randomCombo())
    setPickedRace(true)
    setPickedClass(true)
    setAutoPicked(true)
  }, [])

  const value = useMemo<JourneyState>(() => {
    const visual = getBlendedVisual(choice.raceId, choice.classId)
    return {
      ...choice,
      heroName: heroName(choice.raceId),
      heroArt: heroArt(choice.raceId, choice.classId),
      heroArtTransformed: heroArtTransformed(choice.raceId, choice.classId),
      visual,
      pickedRace,
      pickedClass,
      chosen: pickedRace && pickedClass,
      autoPicked,
      primaryHref,
      setChoice,
      pickRace,
      pickClass,
      autoPick,
    }
  }, [choice, pickedRace, pickedClass, autoPicked, primaryHref, setChoice, pickRace, pickClass, autoPick])

  return <JourneyCtx.Provider value={value}>{children}</JourneyCtx.Provider>
}

export function useJourney(): JourneyState {
  const ctx = useContext(JourneyCtx)
  if (!ctx) throw new Error('useJourney precisa estar dentro de <JourneyProvider>')
  return ctx
}
