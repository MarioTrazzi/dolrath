'use client'

// Teaser do Mapa do Reino pra seção "Ofícios" da landing — o MESMO
// KingdomMapView de /gathering, alimentado com dados simulados (sem
// DB/auth), no espírito de /dev/gathering-map-mock. `transform` no wrapper
// contém o banner `fixed` do KingdomMapView dentro do card (vira o
// containing block dele) em vez de deixá-lo escapar pro topo da viewport.

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  KingdomMapView,
  type GatherCharacter,
  type OpenSession,
  type StatusPayload,
} from '@/components/gathering/KingdomMap'
import { getProfessionLevelInfo } from '@/lib/professionSystem'
import { type GatherFieldId } from '@/lib/gathering'
import { useT } from '@/lib/i18n/I18nProvider'

const HEROES: GatherCharacter[] = [
  { id: 'h1', name: 'Aldric', level: 12, isAlive: true, stamina: 61, maxStamina: 100, gatherXp: 320 },
  { id: 'h2', name: 'Bryn', level: 8, isAlive: true, stamina: 22, maxStamina: 100, gatherXp: 90 },
  { id: 'h3', name: 'Cael', level: 15, isAlive: true, stamina: 88, maxStamina: 100, gatherXp: 1200 },
]

const iso = (secondsAgo: number) => new Date(Date.now() - secondsAgo * 1000).toISOString()

export default function TradesMapPreview() {
  const t = useT()
  const wrapRef = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)
  const [openSessions, setOpenSessions] = useState<OpenSession[]>([
    { characterId: 'h1', fieldId: 'ervas', status: 'active', startedAt: iso(400), inventoryFull: false },
  ])
  const [now, setNow] = useState(() => Date.now())
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [sendHeroId, setSendHeroId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el || typeof IntersectionObserver === 'undefined') { setInView(true); return }
    const obs = new IntersectionObserver((entries) => setInView(entries[0]?.isIntersecting ?? false), { threshold: 0.2 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // Só tiqueta enquanto a seção está visível — evita gastar ciclos com a
  // vitrine fora de tela.
  useEffect(() => {
    if (!inView) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [inView])

  const characters = useMemo(() => HEROES, [])

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
    flash(t('⚔️ {name} set out for the field — earning like a stake.', { name: characters.find((c) => c.id === characterId)?.name ?? '' }))
  }
  const stop = (characterId: string) => {
    setOpenSessions((prev) => prev.filter((s) => s.characterId !== characterId))
    setExpandedId(null)
    flash(t('🎒 Collected: 4× Medicinal Herb (+25 XP).'))
  }

  return (
    <div ref={wrapRef} className="relative h-[600px] overflow-hidden rounded-b-[3px]" style={{ transform: 'translateZ(0)' }}>
      <KingdomMapView
        minHeight="600px"
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
        onCollect={() => flash(t('🎒 Collected: 3× Medicinal Herb, 2× Pure Water (+25 XP).'))}
        onStopNow={() => expandedId && stop(expandedId)}
        onStopAfter={() => flash(t('⏳ Stop scheduled — closes at the end of the cycle.'))}
        onCancelStop={() => flash(t('▶️ Stop cancelled.'))}
      />
    </div>
  )
}
