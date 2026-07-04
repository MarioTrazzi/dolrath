'use client'

// 🌾 FAZENDA — cultivo idle por personagem. As sementes vêm da Coleta
// (Campos de Ervas); aqui elas viram os insumos renováveis das receitas:
// Fibra de Linho (forja leve/bandagem), Trigo (Ração/Pão), Erva Medicinal
// (alquimia), Água Pura (poço) e Couro (cercado). Estado 100% derivado no
// servidor (/api/farm/state) — crescer não exige a página aberta.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { FarmBoard, type FarmVM } from '@/components/farm/FarmBoard'
import { useActiveCharacter } from '@/components/providers/ActiveCharacterProvider'

interface FarmCharacter {
  id: string
  name: string
  level: number
  isAlive?: boolean
}

export default function FarmPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const { activeCharacterId } = useActiveCharacter()

  const [characters, setCharacters] = useState<FarmCharacter[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [vm, setVm] = useState<FarmVM | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!session) router.push('/auth/login')
  }, [session, router])

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/character')
        if (res.ok) {
          const data = await res.json()
          setCharacters(
            (Array.isArray(data) ? data : []).map((c: any) => ({
              id: c.id, name: c.name, level: c.level, isAlive: c.isAlive !== false,
            }))
          )
        }
      } finally {
        setIsLoading(false)
      }
    })()
  }, [])

  useEffect(() => {
    if (characters.length === 0) return
    setSelectedId((prev) => prev ?? (characters.find((c) => c.id === activeCharacterId)?.id ?? characters[0].id))
  }, [characters, activeCharacterId])

  const refresh = useCallback(async (characterId: string) => {
    try {
      const res = await fetch(`/api/farm/state?characterId=${characterId}`)
      if (!res.ok) return
      setVm(await res.json())
    } catch { /* rede: tenta no próximo poll */ }
  }, [])

  useEffect(() => {
    if (!selectedId) return
    setVm(null)
    refresh(selectedId)
    // Poll de 30s: suficiente para os contadores de horas de crescimento.
    const id = setInterval(() => refresh(selectedId), 30_000)
    const onFocus = () => refresh(selectedId)
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus) }
  }, [selectedId, refresh])

  // Contadores locais entre polls (decrementa secondsLeft por segundo).
  useEffect(() => {
    const id = setInterval(() => {
      setVm((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          plots: prev.plots.map((p) =>
            p.state === 'growing'
              ? { ...p, secondsLeft: Math.max(0, p.secondsLeft - 1), state: p.secondsLeft <= 1 ? 'ready' : 'growing' }
              : p
          ),
          pen: prev.pen.state === 'growing'
            ? { ...prev.pen, secondsLeft: Math.max(0, prev.pen.secondsLeft - 1), state: prev.pen.secondsLeft <= 1 ? 'ready' : 'growing' }
            : prev.pen,
        }
      })
    }, 1000)
    return () => clearInterval(id)
  }, [])

  const selected = useMemo(() => characters.find((c) => c.id === selectedId) ?? null, [characters, selectedId])

  const act = async (path: string, body: Record<string, unknown>) => {
    if (!selectedId) return
    setBusy(true)
    setNotice(null)
    try {
      const res = await fetch(`/api/farm/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId: selectedId, ...body }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setNotice(`❌ ${data?.error ?? 'Erro ao executar a ação'}`)
      } else if (path === 'harvest') {
        setNotice(`🧺 Colheu ${data.qty}× ${data.outputName} (+${data.xpGained} XP de Fazenda)`)
      } else if (path === 'well-collect') {
        setNotice(`💧 Coletou ${data.qty}× ${data.outputName}`)
      }
      await refresh(selectedId)
    } finally {
      setBusy(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-textsec">Abrindo a fazenda...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[100dvh] p-4 sm:p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6 text-center">
          <motion.h1
            initial={{ y: -12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="text-3xl sm:text-4xl font-black text-white mb-2"
          >
            🌾 Fazenda
          </motion.h1>
          <p className="text-white/50 text-sm max-w-2xl mx-auto">
            Plante as sementes achadas na coleta e volte para colher: linho para a forja, trigo para ração e pão,
            erva para as poções — mais o poço de água e o cercado de couro. Crescer não gasta stamina; a fazenda trabalha por você.
          </p>
        </div>

        {/* Seleção de herói (cada personagem tem a própria fazenda) */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-6">
          {characters.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={`shrink-0 px-3 py-2 rounded-xl border text-left transition-all ${
                c.id === selectedId ? 'border-amber-400/70 bg-amber-500/10' : 'border-white/15 bg-black/40 hover:bg-white/5'
              }`}
            >
              <div className="text-white text-xs font-bold whitespace-nowrap">
                {c.name} <span className="text-white/50">Nv.{c.level}</span>
              </div>
            </button>
          ))}
          {characters.length === 0 && (
            <div className="text-white/50 text-sm px-2 py-3">Crie um personagem primeiro para cultivar.</div>
          )}
        </div>

        {notice && (
          <div className="bg-black/60 border border-white/20 text-white/90 px-4 py-3 rounded-xl mb-4 text-sm text-center">
            {notice}
          </div>
        )}

        {selected && vm && (
          <FarmBoard
            vm={vm}
            busy={busy}
            onPlant={(slotIndex, cropId) => act('plant', { slotIndex, cropId })}
            onHarvest={(slotIndex) => act('harvest', { slotIndex })}
            onWellCollect={() => act('well-collect', {})}
            onPenFeed={() => act('pen-feed', {})}
          />
        )}

        {selected && !vm && (
          <div className="text-center text-white/40 text-sm py-10">Carregando a fazenda de {selected.name}...</div>
        )}

        <p className="text-center text-white/30 text-[11px] mt-6 max-w-2xl mx-auto">
          🫘 Sem sementes? Elas só caem coletando nos <a href="/gathering" className="underline">Campos de Ervas</a>.
          🥣 A Ração é craftada na Bancada de Alquimia (2 Trigo + 1 Água Pura).
        </p>
      </div>
    </div>
  )
}
