'use client'

// ⛏️ COLETA — Mapa do Reino (container).
// A camada visual do "Mapa do Reino" mora em KingdomMapView (presentacional);
// aqui ficam o estado, os efeitos e as chamadas às rotas /api/gather/*. Toda a
// mecânica real é preservada: o servidor é o relógio (/api/gather/status
// computa os tiques lazy) e cada personagem pode ter sua sessão em paralelo.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
  KingdomMapView,
  type GatherCharacter,
  type OpenSession,
  type StatusPayload,
} from '@/components/gathering/KingdomMap'
import { type GatherFieldId } from '@/lib/gathering'
import { MAP_NODES } from '@/components/gathering/KingdomMap'

function formatDepositNotice(deposited: { name: string; qty: number }[], xpGained: number, skipped: number): string {
  const got = deposited.map((d) => `${d.qty}× ${d.name}`).join(', ')
  return got
    ? `🎒 Coletado: ${got} (+${xpGained} XP)${skipped > 0 ? ` — ⚠️ ${skipped} item(ns) não couberam no inventário` : ''}`
    : '🎒 Nada para coletar ainda.'
}

export default function GatheringPage() {
  const { data: session } = useSession()
  const router = useRouter()

  const [characters, setCharacters] = useState<GatherCharacter[]>([])
  const [openSessions, setOpenSessions] = useState<OpenSession[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [now, setNow] = useState(() => Date.now())

  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [sendHeroId, setSendHeroId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [status, setStatus] = useState<StatusPayload | null>(null)
  const [countdown, setCountdown] = useState(0)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [levelUpBanner, setLevelUpBanner] = useState<string | null>(null)
  const lastGatherLevelRef = useRef<number | null>(null)

  useEffect(() => { if (session === null) router.push('/auth/login') }, [session, router])

  // relógio do mapa (progressão dos anéis)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [])

  const loadData = useCallback(async () => {
    try {
      const [charRes, activeRes] = await Promise.all([fetch('/api/character'), fetch('/api/gather/active')])
      if (charRes.ok) {
        const data = await charRes.json()
        setCharacters((Array.isArray(data) ? data : []).map((c: any) => ({
          id: c.id, name: c.name, level: c.level, isAlive: c.isAlive !== false,
          stamina: c.stamina ?? 0, maxStamina: c.maxStamina ?? 0, gatherXp: c.gatherXp ?? 0,
        })))
      }
      if (activeRes.ok) {
        const data = await activeRes.json()
        setOpenSessions(Array.isArray(data?.sessions) ? data.sessions : [])
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // Estado vivo do herói expandido (o GET computa os tiques no servidor).
  const refreshStatus = useCallback(async (characterId: string) => {
    try {
      const res = await fetch(`/api/gather/status?characterId=${characterId}`)
      if (!res.ok) return
      const data: StatusPayload = await res.json()
      setStatus(data)
      setCountdown(data.secondsToNextTick ?? 0)
      if (data.autoStopped) {
        setNotice(`⏳ Encerramento agendado concluído — ${formatDepositNotice(data.autoStopped.deposited, data.autoStopped.xpGained, data.autoStopped.skipped.length)}`)
        setExpandedId(null)
        loadData()
      }
      const lvl = data.gather?.level ?? 1
      if (lastGatherLevelRef.current != null && lvl > lastGatherLevelRef.current) {
        setLevelUpBanner(`⛏️ Você subiu para o Nível ${lvl} de Coleta!`)
        setTimeout(() => setLevelUpBanner(null), 6000)
      }
      lastGatherLevelRef.current = lvl
    } catch { /* rede: próximo poll */ }
  }, [loadData])

  useEffect(() => {
    if (!expandedId) { setStatus(null); return }
    setStatus(null)
    lastGatherLevelRef.current = null
    refreshStatus(expandedId)
    const id = setInterval(() => refreshStatus(expandedId), 30_000)
    const onFocus = () => refreshStatus(expandedId)
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus) }
  }, [expandedId, refreshStatus])

  // contador regressivo local entre polls
  useEffect(() => {
    if (!status?.session || status.session.status !== 'active') return
    const id = setInterval(() => setCountdown((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(id)
  }, [status?.session])

  const act = useCallback(async (path: 'start' | 'collect' | 'stop', characterId: string, body: Record<string, unknown>) => {
    setBusy(true)
    setNotice(null)
    try {
      const res = await fetch(`/api/gather/${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId, ...body }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setNotice(`❌ ${data?.error ?? 'Erro ao executar a ação'}`)
      } else if (data?.waiting) {
        setNotice('⏳ Encerramento agendado — a coleta termina o ciclo atual e fecha sozinha, sem gastar stamina num ciclo novo.')
      } else if (data?.cancelled) {
        setNotice('▶️ Encerramento agendado cancelado — a coleta continua normalmente.')
      } else if (path === 'collect' || path === 'stop') {
        setNotice(formatDepositNotice(data?.deposited ?? [], data?.xpGained ?? 0, (data?.skipped ?? []).length))
      }
      await loadData()
      if (path === 'stop' && !data?.waiting && !data?.cancelled) {
        setExpandedId(null)
      } else if (expandedId) {
        await refreshStatus(expandedId)
      }
    } finally {
      setBusy(false)
    }
  }, [loadData, refreshStatus, expandedId])

  const dispatchHero = useCallback(async (fieldId: GatherFieldId, characterId: string) => {
    await act('start', characterId, { fieldId })
    setSendHeroId(null)
    setExpandedId(characterId)
    const hero = characters.find((c) => c.id === characterId)
    const node = MAP_NODES.find((n) => n.fieldId === fieldId)
    if (hero && node) setNotice(`⚔️ ${hero.name} partiu para ${node.name}.`)
  }, [act, characters])

  const selectNode = useCallback((key: string | null) => {
    setSelectedKey(key)
    setSendHeroId(null)
    setExpandedId(null)
    setNotice(null)
  }, [])

  // Um herói só: ao abrir uma sessão em campo, expande-o automaticamente.
  const openSessionsByField = useMemo(() => openSessions, [openSessions])
  useEffect(() => {
    if (!selectedKey) return
    const node = MAP_NODES.find((n) => n.key === selectedKey)
    if (!node?.fieldId) return
    const here = openSessionsByField.filter((s) => s.fieldId === node.fieldId)
    if (here.length === 1 && !expandedId) setExpandedId(here[0].characterId)
  }, [selectedKey, openSessionsByField, expandedId])

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-textsec">Desenrolando o mapa do reino…</p>
        </div>
      </div>
    )
  }

  return (
    <KingdomMapView
      characters={characters}
      openSessions={openSessions}
      now={now}
      selectedKey={selectedKey}
      expandedId={expandedId}
      status={status}
      countdown={countdown}
      busy={busy}
      sendHeroId={sendHeroId}
      notice={notice}
      levelUpBanner={levelUpBanner}
      onSelectNode={selectNode}
      onExpand={(id) => setExpandedId(id || null)}
      onSelectSend={setSendHeroId}
      onDispatch={dispatchHero}
      onCollect={() => expandedId && act('collect', expandedId, {})}
      onStopNow={() => expandedId && act('stop', expandedId, { mode: 'now' })}
      onStopAfter={() => expandedId && act('stop', expandedId, { mode: 'after_cycle' })}
      onCancelStop={() => expandedId && act('stop', expandedId, { mode: 'cancel' })}
    />
  )
}
