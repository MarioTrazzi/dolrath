'use client'

// 🧪 Mock visual do Mapa do Reino (Coleta) — testa o layout sem DB/auth.
// Injeta personagens/sessões falsos e simula start/collect/stop na memória,
// no mesmo espírito de /dev/gathering-mock e /dev/dungeon-mock.

import { useEffect, useMemo, useState } from 'react'
import {
  KingdomMapView,
  type GatherCharacter,
  type OpenSession,
  type StatusPayload,
} from '@/components/gathering/KingdomMap'
import { getProfessionLevelInfo } from '@/lib/professionSystem'
import { type GatherFieldId } from '@/lib/gathering'

const HEROES: GatherCharacter[] = [
  { id: 'h1', name: 'Aldric', level: 12, isAlive: true, stamina: 40, maxStamina: 100, gatherXp: 320 },
  { id: 'h2', name: 'Bryn', level: 8, isAlive: true, stamina: 22, maxStamina: 100, gatherXp: 90 },
  { id: 'h3', name: 'Cael', level: 15, isAlive: true, stamina: 2, maxStamina: 100, gatherXp: 1200 },
  { id: 'h4', name: 'Dara', level: 5, isAlive: false, stamina: 60, maxStamina: 100, gatherXp: 30 },
]

const iso = (secondsAgo: number) => new Date(Date.now() - secondsAgo * 1000).toISOString()

export default function GatheringMapMock() {
  const [openSessions, setOpenSessions] = useState<OpenSession[]>([
    { characterId: 'h1', fieldId: 'ervas', status: 'active', startedAt: iso(400), inventoryFull: false },
    { characterId: 'h3', fieldId: 'minerios', status: 'exhausted', startedAt: iso(3000), inventoryFull: false },
  ])
  const [now, setNow] = useState(() => Date.now())
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [sendHeroId, setSendHeroId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [])

  const characters = useMemo(() => HEROES, [])

  // Status simulado do herói expandido.
  const status: StatusPayload | null = useMemo(() => {
    if (!expandedId) return null
    const s = openSessions.find((x) => x.characterId === expandedId)
    const hero = characters.find((c) => c.id === expandedId)
    if (!s || !hero) return null
    const exhausted = s.status === 'exhausted'
    return {
      session: { id: `sess-${expandedId}`, fieldId: s.fieldId as GatherFieldId, status: s.status, startedAt: s.startedAt, stopRequested: false },
      pending: { drops: [{ name: 'Erva Medicinal', qty: 3 }, { name: 'Água Pura', qty: 2 }], xp: 25, ticks: 5 },
      stamina: hero.stamina,
      maxStamina: hero.maxStamina,
      secondsToNextTick: exhausted ? 0 : 620,
      inventoryFull: s.inventoryFull,
      gather: getProfessionLevelInfo(hero.gatherXp),
    }
  }, [expandedId, openSessions, characters])

  const flash = (msg: string) => { setNotice(msg); setTimeout(() => setNotice(null), 2600) }

  const dispatchHero = (fieldId: GatherFieldId, characterId: string) => {
    setOpenSessions((prev) => [...prev, { characterId, fieldId, status: 'active', startedAt: new Date().toISOString(), inventoryFull: false }])
    setSendHeroId(null)
    setExpandedId(characterId)
    flash(`⚔️ ${characters.find((c) => c.id === characterId)?.name} partiu para coletar.`)
  }
  const stop = (characterId: string) => {
    setOpenSessions((prev) => prev.filter((s) => s.characterId !== characterId))
    setExpandedId(null)
    flash('🎒 Coletado: 4× Erva Medicinal (+25 XP).')
  }

  return (
    <KingdomMapView
      characters={characters}
      openSessions={openSessions}
      now={now}
      selectedKey={selectedKey}
      expandedId={expandedId}
      status={status}
      countdown={status?.secondsToNextTick ?? 0}
      busy={false}
      sendHeroId={sendHeroId}
      notice={notice}
      levelUpBanner={null}
      onSelectNode={(k) => { setSelectedKey(k); setSendHeroId(null); setExpandedId(null) }}
      onExpand={(id) => setExpandedId(id || null)}
      onSelectSend={setSendHeroId}
      onDispatch={dispatchHero}
      onCollect={() => flash('🎒 Coletado: 3× Erva Medicinal, 2× Água Pura (+25 XP).')}
      onStopNow={() => expandedId && stop(expandedId)}
      onStopAfter={() => flash('⏳ Encerramento agendado — fecha ao fim do ciclo.')}
      onCancelStop={() => flash('▶️ Encerramento cancelado.')}
    />
  )
}
