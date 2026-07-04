'use client'

// ⛏️ COLETA — página de gerenciamento das sessões idle da conta.
// Diferente da masmorra (1 herói por vez), aqui CADA personagem pode ter sua
// sessão em paralelo: a faixa de heróis mostra quem está livre/trabalhando e
// o painel abaixo gerencia o selecionado. O relógio é do servidor
// (/api/gather/status sincroniza os tiques lazy) — fechar a página não para nada.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { FieldGrid, SessionPanel, ProfessionBar } from '@/components/gathering/GatheringPanel'
import { GATHER_FIELDS, GATHER_TICK_STAMINA, type GatherFieldId, type PendingYield } from '@/lib/gathering'
import { getProfessionLevelInfo, type ProfessionLevelInfo } from '@/lib/professionSystem'
import { useActiveCharacter } from '@/components/providers/ActiveCharacterProvider'

interface GatherCharacter {
  id: string
  name: string
  level: number
  avatar: string | null
  isAlive?: boolean
}

interface OpenSession {
  characterId: string
  fieldId: string
  status: string
}

interface StatusPayload {
  session: { id: string; fieldId: GatherFieldId; status: 'active' | 'exhausted'; startedAt: string } | null
  pending?: PendingYield
  stamina: number
  maxStamina: number
  secondsToNextTick?: number
  gather: ProfessionLevelInfo
}

export default function GatheringPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const { activeCharacterId } = useActiveCharacter()

  const [characters, setCharacters] = useState<GatherCharacter[]>([])
  const [openSessions, setOpenSessions] = useState<OpenSession[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [status, setStatus] = useState<StatusPayload | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(0)

  useEffect(() => {
    if (!session) {
      router.push('/auth/login')
    }
  }, [session, router])

  const loadCharacters = useCallback(async () => {
    try {
      const [charRes, activeRes] = await Promise.all([
        fetch('/api/character'),
        fetch('/api/gather/active'),
      ])
      if (charRes.ok) {
        const data = await charRes.json()
        setCharacters(
          (Array.isArray(data) ? data : []).map((c: any) => ({
            id: c.id, name: c.name, level: c.level, avatar: c.avatar ?? null, isAlive: c.isAlive !== false,
          }))
        )
      }
      if (activeRes.ok) {
        const data = await activeRes.json()
        setOpenSessions(Array.isArray(data?.sessions) ? data.sessions : [])
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { loadCharacters() }, [loadCharacters])

  // Herói inicial: o ativo da navbar (ou o primeiro).
  useEffect(() => {
    if (characters.length === 0) return
    setSelectedId((prev) => prev ?? (characters.find((c) => c.id === activeCharacterId)?.id ?? characters[0].id))
  }, [characters, activeCharacterId])

  // Sincroniza o status do herói selecionado (o GET já computa os tiques no servidor).
  const refreshStatus = useCallback(async (characterId: string) => {
    try {
      const res = await fetch(`/api/gather/status?characterId=${characterId}`)
      if (!res.ok) return
      const data: StatusPayload = await res.json()
      setStatus(data)
      setCountdown(data.secondsToNextTick ?? 0)
    } catch { /* rede: tenta no próximo poll */ }
  }, [])

  useEffect(() => {
    if (!selectedId) return
    setStatus(null)
    refreshStatus(selectedId)
    // Poll leve: o tique é de 15 min; 30s mantém o contador honesto sem pesar.
    const id = setInterval(() => refreshStatus(selectedId), 30_000)
    const onFocus = () => refreshStatus(selectedId)
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus) }
  }, [selectedId, refreshStatus])

  // Contador regressivo local entre polls.
  useEffect(() => {
    if (!status?.session || status.session.status !== 'active') return
    const id = setInterval(() => setCountdown((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(id)
  }, [status?.session])

  const selected = useMemo(() => characters.find((c) => c.id === selectedId) ?? null, [characters, selectedId])
  const sessionByChar = useMemo(() => new Map(openSessions.map((s) => [s.characterId, s])), [openSessions])

  const act = async (path: 'start' | 'collect' | 'stop', body: Record<string, unknown>) => {
    if (!selectedId) return
    setBusy(true)
    setNotice(null)
    try {
      const res = await fetch(`/api/gather/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId: selectedId, ...body }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setNotice(`❌ ${data?.error ?? 'Erro ao executar a ação'}`)
      } else if (path === 'collect' || path === 'stop') {
        const got = (data?.deposited ?? []).map((d: any) => `${d.qty}× ${d.name}`).join(', ')
        const skipped = (data?.skipped ?? []).length
        setNotice(
          got
            ? `🎒 Coletado: ${got} (+${data.xpGained} XP)${skipped > 0 ? ` — ⚠️ ${skipped} item(ns) não couberam no inventário` : ''}`
            : '🎒 Nada para coletar ainda.'
        )
      }
      await Promise.all([refreshStatus(selectedId), loadCharacters()])
    } finally {
      setBusy(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-textsec">Abrindo os campos de coleta...</p>
        </div>
      </div>
    )
  }

  const open = status?.session
  const gatherInfo = status?.gather ?? getProfessionLevelInfo(0)
  const canStart = !!selected && selected.isAlive !== false && (status?.stamina ?? 0) >= GATHER_TICK_STAMINA

  return (
    <div className="min-h-[100dvh] p-4 sm:p-6">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6 text-center">
          <motion.h1
            initial={{ y: -12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="text-3xl sm:text-4xl font-black text-white mb-2"
          >
            ⛏️ Campos de Coleta
          </motion.h1>
          <p className="text-white/50 text-sm max-w-2xl mx-auto">
            Sem monstros, sem dados: escolha um campo e deixe o herói trabalhando — cada tique de 15 min gasta
            stamina e rende os recursos da região. Os reservas coletam enquanto o principal explora masmorras.
          </p>
        </div>

        {/* Faixa de heróis: quem está livre e quem está trabalhando */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-6">
          {characters.map((c) => {
            const s = sessionByChar.get(c.id)
            const field = s ? GATHER_FIELDS[s.fieldId as GatherFieldId] : null
            const isSel = c.id === selectedId
            return (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={`shrink-0 px-3 py-2 rounded-xl border text-left transition-all ${
                  isSel ? 'border-amber-400/70 bg-amber-500/10' : 'border-white/15 bg-black/40 hover:bg-white/5'
                }`}
              >
                <div className="text-white text-xs font-bold whitespace-nowrap">
                  {c.name} <span className="text-white/50">Nv.{c.level}</span>
                </div>
                <div className="text-[10px] whitespace-nowrap">
                  {c.isAlive === false ? (
                    <span className="text-red-400">💀 morto</span>
                  ) : s ? (
                    <span className="text-emerald-300">
                      {field?.emoji} {s.status === 'exhausted' ? 'espólio pronto' : 'coletando'}
                    </span>
                  ) : (
                    <span className="text-white/40">livre</span>
                  )}
                </div>
              </button>
            )
          })}
          {characters.length === 0 && (
            <div className="text-white/50 text-sm px-2 py-3">Crie um personagem primeiro para coletar.</div>
          )}
        </div>

        {notice && (
          <div className="bg-black/60 border border-white/20 text-white/90 px-4 py-3 rounded-xl mb-4 text-sm text-center">
            {notice}
          </div>
        )}

        {selected && status && (
          open ? (
            <SessionPanel
              fieldId={open.fieldId}
              status={open.status}
              startedAt={open.startedAt}
              pending={status.pending ?? { drops: [], xp: 0, ticks: 0 }}
              stamina={status.stamina}
              maxStamina={status.maxStamina}
              secondsToNextTick={countdown}
              gather={gatherInfo}
              busy={busy}
              onCollect={() => act('collect', {})}
              onStop={() => act('stop', {})}
            />
          ) : (
            <>
              <div className="mb-4 max-w-md mx-auto flex flex-col items-center gap-2">
                <ProfessionBar label="Coleta" emoji="⛏️" info={gatherInfo} />
                <div className="text-white/50 text-xs">⚡ {status.stamina}/{status.maxStamina} de stamina</div>
              </div>
              <FieldGrid
                gatherLevel={gatherInfo.level}
                disabled={!canStart || busy}
                disabledReason={
                  selected.isAlive === false
                    ? 'Herói morto — reviva-o antes.'
                    : (status.stamina < GATHER_TICK_STAMINA ? 'Stamina insuficiente.' : undefined)
                }
                onEnter={(field) => act('start', { fieldId: field.id })}
              />
            </>
          )
        )}

        <p className="text-center text-white/30 text-[11px] mt-6 max-w-2xl mx-auto">
          🫘 Sementes de cultivo só caem nos Campos de Ervas — plante-as na <a href="/farm" className="underline">Fazenda</a>.
          Recursos raros de chefe (Lótus Negra, Pena de Fênix…) continuam exclusivos das masmorras.
        </p>
      </div>
    </div>
  )
}
