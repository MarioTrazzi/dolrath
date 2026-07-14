'use client'

// 🌾 FAZENDA — cultivo idle GLOBAL da conta. As sementes vêm da Coleta
// (Campos de Ervas); aqui elas viram os insumos renováveis das receitas:
// Fibra de Linho (forja leve/bandagem), Trigo (Ração/Pão), Erva Medicinal
// (alquimia), Água (poço — purifique na bancada) e Couro (cercado). Todos os
// personagens cultivam a MESMA fazenda; quem gerencia é o personagem ATIVO da
// navbar — plantar é grátis (+XP pra ele), colher custa 1⚡ por canteiro e o
// XP/itens vão pra ele. Estado 100% derivado no servidor (/api/farm/state) —
// crescer não exige a página aberta.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { FarmBoard, type FarmVM, type HarvestResultVM, type WellCollectResultVM } from '@/components/farm/FarmBoard'
import { useActiveCharacter } from '@/components/providers/ActiveCharacterProvider'
import { WELL } from '@/lib/farming'

export default function FarmPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const { activeCharacter, activeCharacterId, loading } = useActiveCharacter()

  const [vm, setVm] = useState<FarmVM | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [levelUpBanner, setLevelUpBanner] = useState<string | null>(null)
  const lastFarmLevelRef = useRef<number | null>(null)

  useEffect(() => {
    if (!session) router.push('/auth/login')
  }, [session, router])

  const refresh = useCallback(async (characterId: string) => {
    try {
      const res = await fetch(`/api/farm/state?characterId=${characterId}`)
      if (!res.ok) return
      const data: FarmVM = await res.json()
      setVm(data)
      // Nível de Fazenda subiu desde o último retrato: avisa (mesmo espírito
      // do levelUpAlert das masmorras, aqui para o XP de profissão da conta).
      const lvl = data.farm?.level ?? 1
      if (lastFarmLevelRef.current != null && lvl > lastFarmLevelRef.current) {
        setLevelUpBanner(`🌾 A Fazenda subiu para o Nível ${lvl}!`)
        setTimeout(() => setLevelUpBanner(null), 6000)
      }
      lastFarmLevelRef.current = lvl
    } catch { /* rede: tenta no próximo poll */ }
  }, [])

  useEffect(() => {
    if (!activeCharacterId) return
    setVm(null)
    refresh(activeCharacterId)
    // Poll de 30s: suficiente para os contadores de horas de crescimento.
    const id = setInterval(() => refresh(activeCharacterId), 30_000)
    const onFocus = () => refresh(activeCharacterId)
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus) }
  }, [activeCharacterId, refresh])

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

  const act = async (path: string, body: Record<string, unknown>) => {
    if (!activeCharacterId) return
    setBusy(true)
    setNotice(null)
    try {
      const res = await fetch(`/api/farm/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId: activeCharacterId, ...body }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setNotice(`❌ ${data?.error ?? 'Erro ao executar a ação'}`)
      } else if (path === 'plant' && data?.xpGained) {
        setNotice(`🫘 Plantado! +${data.xpGained} XP de Fazenda`)
      }
      await refresh(activeCharacterId)
    } finally {
      setBusy(false)
    }
  }

  // Colher tem UI própria (dialog confirm→working→done no FarmBoard), que
  // precisa do resultado real pra mostrar itens/XP/pedras — por isso não usa o
  // `act` genérico acima (fire-and-forget) e devolve (ou lança) a resposta.
  // Sem slotIndex colhe TODOS os canteiros prontos; 101 colhe o cercado.
  const harvest = useCallback(async (slotIndex?: number): Promise<HarvestResultVM> => {
    if (!activeCharacterId) throw new Error('Escolha um personagem ativo na navbar.')
    setBusy(true)
    setNotice(null)
    try {
      const res = await fetch('/api/farm/harvest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId: activeCharacterId, ...(slotIndex != null ? { slotIndex } : {}) }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        const message: string = data?.error ?? 'Erro ao colher'
        setNotice(`❌ ${message}`)
        throw new Error(message)
      }
      await refresh(activeCharacterId)
      return {
        results: data.results ?? [],
        xpGained: data.xpGained,
        harvested: data.harvested ?? 0,
        skippedNoStamina: data.skippedNoStamina ?? 0,
        skippedNoSpace: data.skippedNoSpace ?? 0,
      }
    } finally {
      setBusy(false)
    }
  }, [activeCharacterId, refresh])

  const wellCollect = useCallback(async (): Promise<WellCollectResultVM> => {
    if (!activeCharacterId) throw new Error('Escolha um personagem ativo na navbar.')
    setBusy(true)
    setNotice(null)
    try {
      const res = await fetch('/api/farm/well-collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId: activeCharacterId }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        const message: string = data?.error ?? 'Erro ao coletar'
        setNotice(`❌ ${message}`)
        throw new Error(message)
      }
      // Atualiza o card do poço na hora (12→11→…) sem esperar o poll.
      const pendingLeft = typeof data.pendingLeft === 'number' ? data.pendingLeft : 0
      const nextStamina = typeof data.stamina === 'number' ? data.stamina : undefined
      setVm((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          well: { ...prev.well, pending: pendingLeft },
          stamina: nextStamina ?? prev.stamina,
          farm: data.farm ?? prev.farm,
        }
      })
      await refresh(activeCharacterId)
      const bonuses = Array.isArray(data.bonuses) ? data.bonuses : []
      const bonusLabel = bonuses.length > 0
        ? ` + ${bonuses.map((b: { name: string }) => b.name).join(', ')}`
        : ''
      setNotice(`💧 Coletou ${data.qty}× ${data.outputName}${bonusLabel} · poço ${pendingLeft}/${WELL.cap}`)
      return {
        outputName: data.outputName,
        qty: data.qty ?? 1,
        bonuses,
        xpGained: data.xpGained ?? 0,
        pendingLeft,
      }
    } finally {
      setBusy(false)
    }
  }, [activeCharacterId, refresh])

  if (loading && !activeCharacter) {
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
    <div className="min-h-[100dvh] p-4 sm:p-6" style={{ fontFamily: "'Barlow', sans-serif" }}>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6 text-center">
          <motion.h1
            initial={{ y: -12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="text-3xl sm:text-4xl font-black text-[#ece7da] mb-2"
            style={{ letterSpacing: '0.5px' }}
          >
            🌾 Fazenda
          </motion.h1>
          <p className="text-[#8a8a90] text-sm max-w-2xl mx-auto">
            A fazenda é uma só para todos os seus heróis: qualquer um planta de graça (e leva um XP de Fazenda),
            e quem colhe gasta 1⚡ por canteiro e fica com os itens e o XP. Crescer não gasta nada — a fazenda trabalha por você.
          </p>
          {activeCharacter && (
            <p className="text-[#77777d] text-xs mt-2">
              Gerenciando com <span className="font-bold" style={{ color: '#e7c682' }}>{activeCharacter.name}</span> — troque o herói ativo na barra do topo.
            </p>
          )}
        </div>

        {levelUpBanner && (
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: -8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            className="mb-4 max-w-md mx-auto flex items-center justify-center gap-2 rounded-[3px] border px-5 py-3 text-center"
            style={{
              borderColor: '#c9a25f',
              background: 'linear-gradient(180deg, #3a3325, #241f16)',
              boxShadow: 'inset 0 1px 0 rgba(231,198,130,0.25), 0 0 22px rgba(201,162,95,0.3)',
            }}
          >
            <span className="text-xl">⭐</span>
            <span className="font-black text-sm" style={{ color: '#e7c682' }}>{levelUpBanner}</span>
          </motion.div>
        )}

        {notice && (
          <div
            className="rounded-[3px] border border-[#46464c] px-4 py-3 mb-4 text-sm text-center text-[#c9c9ce]"
            style={{ background: 'linear-gradient(180deg, rgba(32,32,36,0.94), rgba(24,24,27,0.96))' }}
          >
            {notice}
          </div>
        )}

        {!activeCharacterId && !loading && (
          <div className="text-white/50 text-sm px-2 py-10 text-center">Crie um personagem primeiro para cultivar.</div>
        )}

        {activeCharacterId && vm && (
          <FarmBoard
            vm={vm}
            busy={busy}
            onPlant={(slotIndex, cropId) => act('plant', { slotIndex, cropId })}
            onHarvest={harvest}
            onWellCollect={wellCollect}
            onPenFeed={() => act('pen-feed', {})}
          />
        )}

        {activeCharacterId && !vm && (
          <div className="text-center text-white/40 text-sm py-10">Carregando a fazenda...</div>
        )}

        <p className="text-center text-white/30 text-[11px] mt-6 max-w-2xl mx-auto">
          🫘 Sem sementes? Elas só caem coletando nos <a href="/gathering" className="underline">Campos de Ervas</a>.
          💧 Água do poço/coleta vira Água Pura na Bancada de Processamento (1:1).
          🥣 A Ração é processada na bancada (2 Trigo + 1 Água Pura).
        </p>
      </div>
    </div>
  )
}
